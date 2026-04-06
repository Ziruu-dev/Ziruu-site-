const { EmbedBuilder } = require('discord.js');
const { userOps } = require('../database/db');
const { COLORS } = require('../utils/embeds');

// ============================================================
// COMMANDE +top
// Classement des utilisateurs par coins
// ============================================================
module.exports = {
  name: 'top',
  description: 'Classement des utilisateurs par coins',

  async execute(message) {
    const top = userOps.top(10);

    if (!top.length) {
      return message.reply('Aucun utilisateur enregistré.');
    }

    const medals = ['🥇', '🥈', '🥉'];
    const lines = top.map((u, i) => {
      const medal = medals[i] || `**${i + 1}.**`;
      return `${medal} <@${u.discord_id}> — **${u.coins} coins**`;
    });

    const embed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle('🏆 Top 10 — Classement des coins')
      .setDescription(lines.join('\n'))
      .setTimestamp();

    message.reply({ embeds: [embed] });
  },
};
