const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const config = require('../config');
const { userOps, paymentOps } = require('../database/db');
const { createOrder, captureOrder } = require('../utils/paypal');
const { success, error: embedError, info, COLORS } = require('../utils/embeds');

// Packs de coins disponibles
const PACKS = [
  { id: 'pack_10',  coins: 10,  price: 1.00, label: '10 coins — 1,00 €' },
  { id: 'pack_50',  coins: 50,  price: 4.50, label: '50 coins — 4,50 €' },
  { id: 'pack_100', coins: 100, price: 8.00, label: '100 coins — 8,00 €' },
  { id: 'pack_500', coins: 500, price: 35.0, label: '500 coins — 35,00 €' },
];

// ============================================================
// COMMANDE +buy
// Achète des coins via PayPal sandbox
// ============================================================
module.exports = {
  name: 'buy',
  description: 'Achète des coins via PayPal (sandbox)',

  async execute(message, args, client) {
    userOps.getOrCreate(message.author.id, message.author.username);

    // Affiche le menu de sélection du pack
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`buy_select_${message.author.id}`)
      .setPlaceholder('Sélectionne un pack de coins')
      .addOptions(
        PACKS.map((pack) => ({
          label: pack.label,
          value: pack.id,
          description: `Obtenir ${pack.coins} coins`,
          emoji: '🪙',
        }))
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const embed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle('🛒 Boutique de coins')
      .setDescription(
        '**Packs disponibles :**\n' +
          PACKS.map((p) => `🪙 **${p.coins} coins** → ${p.price.toFixed(2)} €`).join('\n') +
          '\n\n> Paiement sécurisé via **PayPal Sandbox** (mode test)'
      )
      .setFooter({ text: 'Sélectionne un pack dans le menu ci-dessous' });

    const reply = await message.reply({ embeds: [embed], components: [row] });

    // Handler du menu de sélection
    client.selectHandlers.set(`buy_select_${message.author.id}`, async (interaction) => {
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({ content: '❌ Ce menu ne t\'est pas destiné.', ephemeral: true });
      }

      const packId = interaction.values[0];
      const pack = PACKS.find((p) => p.id === packId);
      if (!pack) return interaction.reply({ content: '❌ Pack invalide.', ephemeral: true });

      await interaction.deferReply({ ephemeral: true });

      try {
        // Crée la commande PayPal
        const { orderId, approvalUrl } = await createOrder(pack.price, pack.coins, message.author.id);

        // Enregistre la transaction en BDD (statut: pending)
        paymentOps.create(message.author.id, orderId, pack.price, pack.coins);

        // Bouton de confirmation après paiement
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`buy_confirm_${orderId}`)
            .setLabel('✅ J\'ai payé, vérifier mon paiement')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setLabel('🔗 Payer sur PayPal')
            .setStyle(ButtonStyle.Link)
            .setURL(approvalUrl)
        );

        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.primary)
              .setTitle('💳 Lien de paiement généré')
              .setDescription(
                `**Pack :** ${pack.coins} coins — ${pack.price.toFixed(2)} €\n\n` +
                  `1. Clique sur **"Payer sur PayPal"** ci-dessous\n` +
                  `2. Connecte-toi avec ton compte **sandbox** PayPal\n` +
                  `3. Reviens ici et clique sur **"J'ai payé"**\n\n` +
                  `> ⚠️ Mode sandbox : utilise un compte test PayPal`
              )
              .setFooter({ text: `Order ID: ${orderId}` }),
          ],
          components: [confirmRow],
        });

        // Handler du bouton de confirmation
        client.buttonHandlers.set(`buy_confirm_${orderId}`, async (btnInteraction) => {
          if (btnInteraction.user.id !== message.author.id) {
            return btnInteraction.reply({ content: '❌ Pas pour toi.', ephemeral: true });
          }

          await btnInteraction.deferReply({ ephemeral: true });

          try {
            // Capture le paiement PayPal
            const captureData = await captureOrder(orderId);

            if (captureData.status === 'COMPLETED') {
              // Paiement validé → crédite les coins
              paymentOps.complete(orderId);
              userOps.addCoins(message.author.id, pack.coins);

              // Envoie un message de confirmation
              await btnInteraction.editReply({
                embeds: [
                  success(
                    'Paiement validé !',
                    `**${pack.coins} coins** ont été ajoutés à ton compte ! 🎉\n` +
                      `Merci pour ton achat.\n\n` +
                      `Utilise \`+coins\` pour voir ton nouveau solde.`
                  ),
                ],
              });

              // Log dans le salon des paiements
              if (config.paymentLogChannelId) {
                const logChannel = message.guild.channels.cache.get(config.paymentLogChannelId);
                if (logChannel) {
                  logChannel.send({
                    embeds: [
                      success(
                        'Nouveau paiement',
                        `<@${message.author.id}> a acheté **${pack.coins} coins** pour **${pack.price.toFixed(2)} €**.\n` +
                          `Order ID: \`${orderId}\``
                      ),
                    ],
                  });
                }
              }

              // Nettoie les handlers
              client.buttonHandlers.delete(`buy_confirm_${orderId}`);
              client.selectHandlers.delete(`buy_select_${message.author.id}`);
            } else {
              await btnInteraction.editReply({
                embeds: [
                  embedError(
                    'Paiement non complété',
                    `Le statut de ton paiement est : **${captureData.status}**\n` +
                      `Assure-toi d'avoir bien complété le paiement sur PayPal.`
                  ),
                ],
              });
            }
          } catch (err) {
            console.error('[PAYPAL] Erreur de capture:', err.response?.data || err.message);
            await btnInteraction.editReply({
              embeds: [
                embedError(
                  'Erreur PayPal',
                  `Impossible de vérifier le paiement.\nErreur: \`${err.message}\`\n\n` +
                    `Contacte un administrateur avec l'Order ID: \`${orderId}\``
                ),
              ],
            });
          }
        });
      } catch (err) {
        console.error('[PAYPAL] Erreur de création:', err.response?.data || err.message);
        await interaction.editReply({
          embeds: [
            embedError(
              'Erreur PayPal',
              `Impossible de créer le lien de paiement.\nVérifie la configuration PayPal sandbox.\n\nErreur: \`${err.message}\``
            ),
          ],
        });
      }
    });
  },
};
