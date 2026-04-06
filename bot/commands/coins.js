const { userOps, inviteOps } = require('../database/db');
const { coins: coinsEmbed, error: embedError } = require('../utils/embeds');
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../utils/embeds');

// ============================================================
// COMMANDE +coins [@utilisateur]
// Affiche le solde de coins d'un utilisateur
// ============================================================
module.exports = {
  name: 'coins',
  description: 'Affiche ton solde de coins (ou celui d\'un autre membre)',

  async execute(message, args) {
    // Cible : mention ou soi-même
    const target = message.mentions.users.first() || message.author;
    const user = userOps.getOrCreate(target.id, target.username);

    if (!user) {
      return message.reply({ embeds: [embedError('Erreur', 'Utilisateur introuvable.')] });
    }

    const validInvites = inviteOps.countValid(target.id);

    const embed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle(`🪙 Solde de ${target.username}`)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '💰 Coins actuels', value: `**${user.coins}** coins`, inline: true },
        { name: '📈 Total gagné', value: `**${user.total_earned}** coins`, inline: true },
        { name: '👥 Invitations valides', value: `**${validInvites}**`, inline: true }
      )
      .setFooter({ text: `Membre depuis le ${new Date(user.created_at).toLocaleDateString('fr-FR')}` })
      .setTimestamp();

    message.reply({ embeds: [embed] });
  },
};
