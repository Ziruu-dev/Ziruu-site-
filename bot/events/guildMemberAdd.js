const config = require('../config');
const { userOps, inviteOps, joinOps } = require('../database/db');
const { validateNewMember } = require('../utils/antiAbuse');
const { success, error: embedError } = require('../utils/embeds');

module.exports = {
  name: 'guildMemberAdd',

  async execute(member, client) {
    const { guild } = member;

    // Enregistre l'action dans l'historique
    joinOps.log(member.id, 'join');

    // S'assure que l'utilisateur existe en BDD
    userOps.getOrCreate(member.id, member.user.username);

    // ——————————————————————————————————————
    // DÉTECTION DE L'INVITEUR
    // ——————————————————————————————————————
    let inviterId = null;
    let usedCode = null;

    try {
      const newInvites = await guild.invites.fetch();
      const oldInvites = client.inviteCache.get(guild.id) || new Map();

      // Trouve le code dont le compteur d'utilisation a augmenté
      for (const [code, invite] of newInvites) {
        const oldUses = oldInvites.get(code) || 0;
        if (invite.uses > oldUses) {
          usedCode = code;
          inviterId = invite.inviter?.id ?? null;
          break;
        }
      }

      // Met à jour le cache
      client.inviteCache.set(guild.id, new Map(newInvites.map((i) => [i.code, i.uses])));
    } catch (err) {
      console.error('[INVITES] Erreur lors de la récupération des invitations:', err);
    }

    // ——————————————————————————————————————
    // ANTI-ABUS + CRÉDIT DES COINS
    // ——————————————————————————————————————
    if (inviterId && inviterId !== member.id) {
      const check = validateNewMember(member, inviterId);

      if (check.canCredit) {
        // Enregistre l'invitation en BDD
        inviteOps.record(inviterId, member.id, usedCode || 'unknown');
        inviteOps.credit(member.id);

        // Crédite l'inviteur
        userOps.getOrCreate(inviterId, 'unknown');
        userOps.addCoins(inviterId, config.coinsPerInvite);

        console.log(
          `[INVITES] ${member.user.username} invité par ${inviterId} — +${config.coinsPerInvite} coin(s)`
        );

        // Log dans le salon de logs si configuré
        if (config.logChannelId) {
          const logChannel = guild.channels.cache.get(config.logChannelId);
          if (logChannel) {
            logChannel.send({
              embeds: [
                success(
                  'Nouvelle invitation',
                  `**${member.user.username}** a rejoint via une invitation de <@${inviterId}>.\n` +
                    `+${config.coinsPerInvite} coin(s) crédité(s) à <@${inviterId}>.`
                ).setFooter({ text: `Code: ${usedCode || 'inconnu'}` }),
              ],
            });
          }
        }
      } else {
        console.log(
          `[ANTI-ABUS] Invitation refusée pour ${member.user.username}: ${check.reason}`
        );

        if (config.logChannelId) {
          const logChannel = guild.channels.cache.get(config.logChannelId);
          if (logChannel) {
            logChannel.send({
              embeds: [
                embedError(
                  'Invitation refusée (anti-abus)',
                  `**${member.user.username}** — invitation non créditée.\n**Raison:** ${check.reason}`
                ),
              ],
            });
          }
        }
      }
    }
  },
};
