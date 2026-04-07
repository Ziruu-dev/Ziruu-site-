const { joinOps, inviteOps } = require('../database/db');
const { warning } = require('../utils/embeds');
const config = require('../config');

module.exports = {
  name: 'guildMemberRemove',

  async execute(member, client) {
    // Enregistre le départ dans l'historique anti-abus
    joinOps.log(member.id, 'leave');

    // Marque l'invitation comme invalide (l'invité est parti)
    inviteOps.markLeft(member.id);

    // Met à jour le cache des invitations
    try {
      const newInvites = await member.guild.invites.fetch();
      client.inviteCache.set(member.guild.id, new Map(newInvites.map((i) => [i.code, i.uses])));
    } catch {
      // Peut échouer si le bot n'a plus accès au serveur
    }

    // Log dans le salon
    if (config.logChannelId) {
      const logChannel = member.guild.channels.cache.get(config.logChannelId);
      if (logChannel) {
        logChannel.send({
          embeds: [
            warning(
              'Membre parti',
              `**${member.user.username}** a quitté le serveur.\nSes coins d'invitation ont été révoqués.`
            ),
          ],
        });
      }
    }

    console.log(`[DÉPART] ${member.user.username} a quitté — invitation marquée invalide.`);
  },
};
