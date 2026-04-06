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
          `**💰 Via PayPal**\n` +
          `> Envoie le montant de ton choix via le lien ci-dessous.\n` +
          `> ⚠️ **Mets ton ID Discord en note** pour que je t'identifie.\n\n` +
          `**🔗 [Clique ici pour payer via PayPal](${config.paypal.meUrl})**\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `**🪙 Via Crypto (${config.cryptoType})**\n` +
          `\`\`\`${config.cryptoAddress}\`\`\`` +
          `> Envoie une preuve de paiement à un admin après le virement.\n` +
          `> Les coins seront crédités sous **24h**.\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `**📦 Exemples :**\n` +
          `> 1€ → **${config.coinsPerEur} coins**\n` +
          `> 5€ → **${config.coinsPerEur * 5} coins**\n` +
          `> 10€ → **${config.coinsPerEur * 10} coins**\n` +
          `> 50€ → **${config.coinsPerEur * 50} coins**`
      )
      .setThumbnail('https://cdn.discordapp.com/emojis/💰.png')
      .setFooter({ text: 'Utilise +buy pour le paiement automatique via PayPal sandbox' })
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
