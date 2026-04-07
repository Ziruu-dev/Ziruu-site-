const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');
const { error: embedError, COLORS } = require('../utils/embeds');

// ============================================================
// COMMANDE +pay
// Accessible UNIQUEMENT par le propriétaire du bot (OWNER_ID)
// Poste un embed permanent dans le salon de paiement avec :
//   - Lien PayPal
//   - Adresse crypto
// ============================================================
module.exports = {
  name: 'pay',
  description: 'Poste l\'embed de paiement dans le salon dédié (owner uniquement)',

  async execute(message, args) {
    // Seul le owner peut utiliser cette commande
    if (message.author.id !== config.ownerId) {
      return message.reply({
        embeds: [embedError('Accès refusé', 'Cette commande est réservée au propriétaire du bot.')],
      });
    }

    // Supprime le message de commande
    message.delete().catch(() => {});

    // Détermine le salon cible
    const targetChannel = config.payChannelId
      ? message.guild.channels.cache.get(config.payChannelId)
      : message.channel;

    if (!targetChannel) {
      return message.author.send('❌ Salon de paiement introuvable. Vérifie `PAY_CHANNEL_ID` dans le `.env`.');
    }

    const embed = new EmbedBuilder()
      .setColor(0x00b0f4)
      .setTitle('💳 Acheter des coins')
      .setDescription(
        `**Taux :** 1 € = **${config.coinsPerEur} coins**\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `**💰 Via PayPal (paiement manuel)**\n` +
          `> 1. Clique sur le lien et envoie ton paiement\n` +
          `> 2. ⚠️ **Mets ton ID Discord en note du paiement**\n` +
          `> 3. Un admin créditera tes coins sous 24h\n\n` +
          `**🔗 [Clique ici pour payer via PayPal](${config.paypal.meUrl})**\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `**⚡ Via PayPal (paiement automatique)**\n` +
          `> Tape \`+buy\` dans n'importe quel salon\n` +
          `> → Les coins sont crédités **instantanément** après paiement\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `**🪙 Via Crypto (${config.cryptoType})**\n` +
          `\`\`\`${config.cryptoAddress}\`\`\`` +
          `> Envoie une preuve de paiement à un admin (screenshot).\n` +
          `> Les coins seront crédités sous **24h**.\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `**📦 Exemples de montants :**\n` +
          `> 1€ → **${config.coinsPerEur} coins**\n` +
          `> 5€ → **${config.coinsPerEur * 5} coins**\n` +
          `> 10€ → **${config.coinsPerEur * 10} coins**\n` +
          `> 50€ → **${config.coinsPerEur * 50} coins**`
      )
      .setFooter({ text: '+buy = automatique | PayPal.me = manuel (admin crédite avec +admin creditpay)' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('💳 Payer via PayPal')
        .setStyle(ButtonStyle.Link)
        .setURL(config.paypal.meUrl),
      new ButtonBuilder()
        .setLabel('🛒 Paiement automatique (+buy)')
        .setStyle(ButtonStyle.Secondary)
        .setCustomId('pay_auto_disabled')
        .setDisabled(true)
    );

    await targetChannel.send({ embeds: [embed], components: [row] });

    // Confirme au owner en MP
    message.author.send('✅ Embed de paiement posté dans le salon.').catch(() => {});
  },
};
