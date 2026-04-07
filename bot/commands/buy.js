const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');
const { userOps } = require('../database/db');
const { COLORS } = require('../utils/embeds');

// ============================================================
// COMMANDE +buy
// Affiche les instructions de paiement manuel (PayPal.me + Crypto)
// Un admin crédite ensuite avec : +admin creditpay @user <euros>
// ============================================================
module.exports = {
  name: 'buy',
  description: 'Voir comment acheter des coins',

  async execute(message) {
    const user = userOps.getOrCreate(message.author.id, message.author.username);

    const embed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle('🛒 Acheter des coins')
      .setDescription(
        `**Taux :** 1 € = **${config.coinsPerEur} coins**\n` +
        `Ton solde actuel : **${user.coins} coin(s)**\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `**💰 Via PayPal**\n` +
        `> 1. Clique sur le bouton **"Payer via PayPal"** ci-dessous\n` +
        `> 2. Envoie le montant souhaité\n` +
        `> 3. ⚠️ **Mets ton pseudo Discord en note** du paiement\n` +
        `> 4. Un admin te créditera tes coins sous 24h\n\n` +
        `**🔗 Lien PayPal :** ${config.paypal.meUrl}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `**🪙 Via Crypto (${config.cryptoType})**\n` +
        `\`\`\`${config.cryptoAddress}\`\`\`` +
        `> Envoie une capture d'écran de la transaction à un admin.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `**📦 Exemples**\n` +
        `> 1 € → **${config.coinsPerEur} coins**\n` +
        `> 5 € → **${config.coinsPerEur * 5} coins**\n` +
        `> 10 € → **${config.coinsPerEur * 10} coins**\n` +
        `> 20 € → **${config.coinsPerEur * 20} coins**`
      )
      .setFooter({ text: 'Après ton paiement, un admin utilisera +admin creditpay pour créditer tes coins.' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('💳 Payer via PayPal')
        .setStyle(ButtonStyle.Link)
        .setURL(config.paypal.meUrl)
    );

    await message.reply({ embeds: [embed], components: [row] });
  },
};
