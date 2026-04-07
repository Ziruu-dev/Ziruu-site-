const { EmbedBuilder } = require('discord.js');
const { inviteOps, userOps } = require('../database/db');
const { COLORS } = require('../utils/embeds');

// ============================================================
// COMMANDE +invites [@utilisateur]
// Affiche les statistiques d'invitation d'un utilisateur
// ============================================================
module.exports = {
  name: 'invites',
  description: 'Affiche tes statistiques d\'invitation',

  async execute(message, args) {
    const target = message.mentions.users.first() || message.author;
    userOps.getOrCreate(target.id, target.username);

    const validInvites = inviteOps.countValid(target.id);
    const todayInvites = inviteOps.countTodayFor(target.id);
    const user = userOps.get(target.id);

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(`👥 Invitations de ${target.username}`)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '✅ Invitations valides', value: `**${validInvites}**`, inline: true },
        { name: '📅 Invitations aujourd\'hui', value: `**${todayInvites}**`, inline: true },
        { name: '🪙 Coins totaux', value: `**${user?.coins ?? 0}**`, inline: true }
      )
      .setFooter({ text: 'Les invitations invalides (membres partis) ne comptent pas.' })
      .setTimestamp();

    message.reply({ embeds: [embed] });
  },
};
