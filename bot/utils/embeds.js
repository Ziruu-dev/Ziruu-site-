const { EmbedBuilder } = require('discord.js');

// Couleurs du bot
const COLORS = {
  primary: 0x5865f2,   // bleu Discord
  success: 0x57f287,   // vert
  error: 0xed4245,     // rouge
  warning: 0xfee75c,   // jaune
  info: 0x5865f2,      // bleu
  gold: 0xf1c40f,      // or (coins)
};

function success(title, description) {
  return new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle(`✅ ${title}`)
    .setDescription(description)
    .setTimestamp();
}

function error(title, description) {
  return new EmbedBuilder()
    .setColor(COLORS.error)
    .setTitle(`❌ ${title}`)
    .setDescription(description)
    .setTimestamp();
}

function info(title, description) {
  return new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(`ℹ️ ${title}`)
    .setDescription(description)
    .setTimestamp();
}

function warning(title, description) {
  return new EmbedBuilder()
    .setColor(COLORS.warning)
    .setTitle(`⚠️ ${title}`)
    .setDescription(description)
    .setTimestamp();
}

function coins(title, description) {
  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle(`🪙 ${title}`)
    .setDescription(description)
    .setTimestamp();
}

module.exports = { success, error, info, warning, coins, COLORS };
