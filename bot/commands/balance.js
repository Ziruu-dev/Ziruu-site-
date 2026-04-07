const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { userOps, inviteOps } = require('../database/db');
const { COLORS } = require('../utils/embeds');
const config = require('../config');

// ============================================================
// COMMANDE +balance [@utilisateur]
// Affiche le solde avec un bouton "En ajouter"
// ============================================================
module.exports = {
  name: 'balance',
  description: 'Affiche ton solde de coins',

  async execute(message, args, client) {
    const target = message.mentions.users.first() || message.author;
    const user = userOps.getOrCreate(target.id, target.username);
    const validInvites = inviteOps.countValid(target.id);

    const embed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle(`🪙 Balance de ${target.username}`)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '💰 Coins disponibles', value: `**${user.coins}** coins`, inline: true },
        { name: '📈 Total gagné', value: `**${user.total_earned}** coins`, inline: true },
        { name: '👥 Invitations valides', value: `**${validInvites}**`, inline: true },
        { name: '💱 Taux', value: `1€ = **${config.coinsPerEur}** coins`, inline: true },
        { name: '🔍 Coût recherche', value: `**${config.searchCost}** coin/recherche`, inline: true },
      )
      .setFooter({ text: `Membre depuis le ${new Date(user.created_at).toLocaleDateString('fr-FR')}` })
      .setTimestamp();

    // Bouton "En ajouter" uniquement si c'est son propre profil
    const components = [];
    if (target.id === message.author.id) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`balance_add_${message.author.id}`)
          .setLabel('➕ En ajouter')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`balance_buy_${message.author.id}`)
          .setLabel('🛒 Acheter des coins')
          .setStyle(ButtonStyle.Primary)
      );
      components.push(row);

      // Handler : affiche l'embed de paiement
      client.buttonHandlers.set(`balance_add_${message.author.id}`, async (interaction) => {
        if (interaction.user.id !== message.author.id) {
          return interaction.reply({ content: '❌ Pas pour toi.', ephemeral: true });
        }
        await interaction.reply({
          embeds: [buildPayEmbed(config)],
          ephemeral: true,
        });
      });

      // Handler : lance la commande +buy
      client.buttonHandlers.set(`balance_buy_${message.author.id}`, async (interaction) => {
        if (interaction.user.id !== message.author.id) {
          return interaction.reply({ content: '❌ Pas pour toi.', ephemeral: true });
        }
        await interaction.reply({
          content: '> Lance `+buy` dans un salon pour acheter des coins via PayPal.',
          ephemeral: true,
        });
      });
    }

    await message.reply({ embeds: [embed], components });
  },
};

/**
 * Construit l'embed de paiement (PayPal + Crypto)
 */
function buildPayEmbed(config) {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('💳 Comment acheter des coins ?')
    .setDescription(
      `**Taux :** 1€ = **${config.coinsPerEur} coins**\n\n` +
        `**Via PayPal :**\n` +
        `> [Clique ici pour payer](${config.paypal.meUrl})\n` +
        `> Envoie le montant souhaité et **précise ton ID Discord** dans la note.\n\n` +
        `**Via Crypto (${config.cryptoType}) :**\n` +
        `> \`${config.cryptoAddress}\`\n` +
        `> Envoie la preuve de paiement à un admin.\n\n` +
        `> ⚠️ Les coins sont crédités manuellement sous 24h pour les paiements crypto.`
    )
    .setFooter({ text: 'Mode sandbox — Paiements de test uniquement' });
}
