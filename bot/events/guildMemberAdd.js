const config = require('../config');
const { userOps, welcomeOps, inviteOps, joinOps } = require('../database/db');
const { validateNewMember } = require('../utils/antiAbuse');
const { info: logInfo } = require('../utils/logger');
const { success, error: embedError, info } = require('../utils/embeds');

module.exports = {
  name: 'guildMemberAdd',

  async execute(member, client) {
    const { guild } = member;

    // Enregistre l'arrivée dans l'historique
    joinOps.log(member.id, 'join');

    // S'assure que l'utilisateur existe en BDD (ses coins sont CONSERVÉS s'il revient)
    userOps.getOrCreate(member.id, member.user.username);

    // ——————————————————————————————————————
    // COIN DE BIENVENUE (1 seule fois à vie)
    // ——————————————————————————————————————
    const alreadyGotWelcome = welcomeOps.hasReceived(member.id);

    if (!alreadyGotWelcome) {
      welcomeOps.markGiven(member.id);
      userOps.addCoins(member.id, config.welcomeCoins);
      logInfo(`[WELCOME] ${member.user.username} (${member.id}) → +${config.welcomeCoins} coin de bienvenue`);

      // Envoie un MP au nouvel arrivant
      member.send(
        `👋 Bienvenue sur **${guild.name}** !\n` +
          `Tu as reçu **${config.welcomeCoins} coin** gratuit pour tester la commande \`+look\`.\n` +
          `Tape \`+balance\` pour voir ton solde.`
      ).catch(() => {
        // L'utilisateur a peut-être les MPs désactivés
      });
    } else {
      // Revient sur le serveur → ses coins sont déjà en BDD, on ne fait rien
      logInfo(`[RETOUR] ${member.user.username} (${member.id}) → coin de bienvenue déjà donné, coins conservés`);
    }

    // ——————————————————————————————————————
    // DÉTECTION DE L'INVITEUR
    // ——————————————————————————————————————
    let inviterId = null;
    let usedCode = null;

    try {
      const newInvites = await guild.invites.fetch();
      const oldInvites = client.inviteCache.get(guild.id) || new Map();

      for (const [code, invite] of newInvites) {
        const oldUses = oldInvites.get(code) || 0;
        if (invite.uses > oldUses) {
          usedCode = code;
          inviterId = invite.inviter?.id ?? null;
          break;
        }
      }

      client.inviteCache.set(guild.id, new Map(newInvites.map((i) => [i.code, i.uses])));
    } catch (err) {
      console.error('[INVITES] Erreur:', err.message);
    }

    // ——————————————————————————————————————
    // CRÉDIT INVITATION
    // Si M. Y a déjà été invité par quelqu'un dans le passé,
    // personne ne gagne de coin même si M. Y revient avec un autre lien
    // ——————————————————————————————————————
    if (inviterId && inviterId !== member.id) {
      // Vérifie si cet invité a DÉJÀ été invité par quelqu'un avant
      const alreadyInvited = inviteOps.hasEverBeenInvited(member.id);

      if (alreadyInvited) {
        logInfo(
          `[ANTI-ABUS] ${member.user.username} avait déjà rejoint via quelqu'un d'autre → ` +
            `<@${inviterId}> ne gagne pas de coin`
        );

        if (config.logChannelId) {
          const logChannel = guild.channels.cache.get(config.logChannelId);
          logChannel?.send({
            embeds: [
              embedError(
                'Invitation non créditée',
                `**${member.user.username}** a déjà rejoint via quelqu'un d'autre dans le passé.\n` +
                  `<@${inviterId}> ne reçoit pas de coin.`
              ),
            ],
          });
        }
      } else {
        // Nouvelle invitation valide → anti-abus classique
        const check = validateNewMember(member, inviterId);

        if (check.canCredit) {
          inviteOps.record(inviterId, member.id, usedCode || 'unknown');
          inviteOps.credit(member.id);
          userOps.getOrCreate(inviterId, 'unknown');
          userOps.addCoins(inviterId, config.coinsPerInvite);

          logInfo(
            `[INVITE] ${member.user.username} invité par ${inviterId} → +${config.coinsPerInvite} coin`
          );

          if (config.logChannelId) {
            const logChannel = guild.channels.cache.get(config.logChannelId);
            logChannel?.send({
              embeds: [
                success(
                  'Invitation créditée',
                  `**${member.user.username}** a rejoint via l'invitation de <@${inviterId}>.\n` +
                    `+**${config.coinsPerInvite} coin** crédité à <@${inviterId}>.`
                ).setFooter({ text: `Code: ${usedCode || 'inconnu'}` }),
              ],
            });
          }
        } else {
          logInfo(`[ANTI-ABUS] Invitation refusée pour ${member.user.username}: ${check.reason}`);

          if (config.logChannelId) {
            const logChannel = guild.channels.cache.get(config.logChannelId);
            logChannel?.send({
              embeds: [
                embedError(
                  'Invitation refusée (anti-abus)',
                  `**${member.user.username}** — non crédité.\n**Raison :** ${check.reason}`
                ),
              ],
            });
          }
        }
      }
    }
  },
};
