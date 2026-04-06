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
const { logPayment, logError } = require('../utils/logger');
const { success, error: embedError, COLORS } = require('../utils/embeds');

// Packs disponibles — taux : 1€ = 10 coins
const PACKS = [
  { id: 'pack_1',   coins: 10,  price: 1.00,  label: '10 coins — 1,00 €' },
  { id: 'pack_5',   coins: 50,  price: 5.00,  label: '50 coins — 5,00 €' },
  { id: 'pack_10',  coins: 100, price: 10.00, label: '100 coins — 10,00 €' },
  { id: 'pack_50',  coins: 500, price: 50.00, label: '500 coins — 50,00 €' },
];

// ============================================================
// COMMANDE +buy — Achète des coins via PayPal sandbox
// ============================================================
module.exports = {
  name: 'buy',
  description: 'Achète des coins via PayPal (1€ = 10 coins)',

  async execute(message, args, client) {
    userOps.getOrCreate(message.author.id, message.author.username);

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`buy_select_${message.author.id}`)
      .setPlaceholder('Sélectionne un pack de coins')
      .addOptions(
        PACKS.map((pack) => ({
          label: pack.label,
          value: pack.id,
          description: `${pack.coins} coins pour ${pack.price.toFixed(2)}€`,
          emoji: '🪙',
        }))
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const embed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle('🛒 Boutique de coins')
      .setDescription(
        `**Taux : 1€ = ${config.coinsPerEur} coins**\n\n` +
          PACKS.map((p) => `🪙 **${p.coins} coins** — ${p.price.toFixed(2)} €`).join('\n') +
          '\n\n> Paiement via **PayPal Sandbox** (mode test)'
      )
      .setFooter({ text: 'Sélectionne un pack dans le menu ci-dessous' });

    await message.reply({ embeds: [embed], components: [row] });

    client.selectHandlers.set(`buy_select_${message.author.id}`, async (interaction) => {
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({ content: '❌ Pas pour toi.', ephemeral: true });
      }

      const packId = interaction.values[0];
      const pack = PACKS.find((p) => p.id === packId);
      if (!pack) return interaction.reply({ content: '❌ Pack invalide.', ephemeral: true });

      await interaction.deferReply({ ephemeral: true });

      try {
        const { orderId, approvalUrl } = await createOrder(pack.price, pack.coins, message.author.id);
        paymentOps.create(message.author.id, orderId, pack.price, pack.coins);

        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`buy_confirm_${orderId}`)
            .setLabel('✅ J\'ai payé — Vérifier')
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
                  `1. Clique **"Payer sur PayPal"**\n` +
                  `2. Connecte-toi avec ton compte sandbox PayPal\n` +
                  `3. Reviens ici et clique **"J'ai payé"**`
              )
              .setFooter({ text: `Order ID: ${orderId}` }),
          ],
          components: [confirmRow],
        });

        client.buttonHandlers.set(`buy_confirm_${orderId}`, async (btnInteraction) => {
          if (btnInteraction.user.id !== message.author.id) {
            return btnInteraction.reply({ content: '❌ Pas pour toi.', ephemeral: true });
          }

          await btnInteraction.deferReply({ ephemeral: true });

          try {
            const captureData = await captureOrder(orderId);

            if (captureData.status === 'COMPLETED') {
              paymentOps.complete(orderId);
              userOps.addCoins(message.author.id, pack.coins);
              logPayment(message.author.username, message.author.id, orderId, pack.price, pack.coins);

              await btnInteraction.editReply({
                embeds: [
                  success(
                    'Paiement validé !',
                    `**+${pack.coins} coins** ajoutés à ton compte ! 🎉\n` +
                      `Utilise \`+balance\` pour voir ton solde.`
                  ),
                ],
              });

              if (config.paymentLogChannelId) {
                const ch = message.guild.channels.cache.get(config.paymentLogChannelId);
                if (ch) {
                  ch.send({
                    embeds: [
                      success(
                        'Paiement reçu',
                        `<@${message.author.id}> — **${pack.coins} coins** pour **${pack.price.toFixed(2)} €**\n\`${orderId}\``
                      ),
                    ],
                  });
                }
              }

              client.buttonHandlers.delete(`buy_confirm_${orderId}`);
              client.selectHandlers.delete(`buy_select_${message.author.id}`);
            } else {
              await btnInteraction.editReply({
                embeds: [
                  embedError(
                    'Paiement non complété',
                    `Statut : **${captureData.status}**\nAssure-toi d'avoir finalisé le paiement sur PayPal.`
                  ),
                ],
              });
            }
          } catch (err) {
            logError('PAYPAL_CAPTURE', err);
            await btnInteraction.editReply({
              embeds: [
                embedError(
                  'Erreur PayPal',
                  `Impossible de vérifier le paiement.\nOrder ID : \`${orderId}\`\nContacte un admin.`
                ),
              ],
            });
          }
        });
      } catch (err) {
        logError('PAYPAL_CREATE', err);
        await interaction.editReply({
          embeds: [
            embedError(
              'Erreur PayPal',
              `Impossible de créer le lien de paiement.\nVérifie la config PayPal sandbox.\n\`${err.message}\``
            ),
          ],
        });
      }
    });
  },
};
