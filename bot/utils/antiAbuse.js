const config = require('../config');
const { joinOps, inviteOps, abuseOps } = require('../database/db');

// ============================================================
// SYSTÈME ANTI-ABUS
// ============================================================

/**
 * Vérifie si un compte est trop récent pour recevoir des coins d'invitation
 * @param {GuildMember} member
 * @returns {{ valid: boolean, reason?: string }}
 */
function checkAccountAge(member) {
  const createdAt = member.user.createdAt;
  const ageMs = Date.now() - createdAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  if (ageDays < config.minAccountAgeDays) {
    return {
      valid: false,
      reason: `Compte trop récent (${Math.floor(ageDays)} jours, minimum ${config.minAccountAgeDays} jours)`,
    };
  }
  return { valid: true };
}

/**
 * Vérifie si un utilisateur a quitté/rejoint trop récemment (farm d'invitations)
 * @param {string} discordId
 * @returns {{ valid: boolean, reason?: string }}
 */
function checkRejoinCooldown(discordId) {
  const lastLeft = joinOps.lastLeft(discordId);
  if (!lastLeft) return { valid: true };

  const leftAt = new Date(lastLeft.at).getTime();
  const cooldownMs = config.rejoinCooldownHours * 60 * 60 * 1000;
  const elapsed = Date.now() - leftAt;

  if (elapsed < cooldownMs) {
    const remaining = Math.ceil((cooldownMs - elapsed) / (1000 * 60 * 60));
    return {
      valid: false,
      reason: `Rejoin trop rapide (encore ${remaining}h de cooldown)`,
    };
  }
  return { valid: true };
}

/**
 * Vérifie si l'inviteur n'a pas dépassé son quota journalier d'invitations
 * @param {string} inviterId
 * @returns {{ valid: boolean, reason?: string }}
 */
function checkDailyInviteLimit(inviterId) {
  const count = inviteOps.countTodayFor(inviterId);
  if (count >= config.maxInvitesPerDay) {
    return {
      valid: false,
      reason: `Limite journalière d'invitations atteinte (${count}/${config.maxInvitesPerDay})`,
    };
  }
  return { valid: true };
}

/**
 * Vérifie si un utilisateur est déjà marqué comme abuseur
 * @param {string} discordId
 */
function isAbuser(discordId) {
  return abuseOps.isFlagged(discordId);
}

/**
 * Effectue toutes les vérifications anti-abus à l'arrivée d'un membre
 * @param {GuildMember} member
 * @param {string} inviterId - ID de la personne ayant invité
 * @returns {{ canCredit: boolean, reason?: string }}
 */
function validateNewMember(member, inviterId) {
  // 1. Compte trop récent ?
  const ageCheck = checkAccountAge(member);
  if (!ageCheck.valid) {
    abuseOps.flag(member.id, ageCheck.reason);
    return { canCredit: false, reason: ageCheck.reason };
  }

  // 2. Rejoins trop souvent ?
  const rejoinCheck = checkRejoinCooldown(member.id);
  if (!rejoinCheck.valid) {
    abuseOps.flag(member.id, rejoinCheck.reason);
    return { canCredit: false, reason: rejoinCheck.reason };
  }

  // 3. L'inviteur a atteint sa limite journalière ?
  if (inviterId) {
    const limitCheck = checkDailyInviteLimit(inviterId);
    if (!limitCheck.valid) {
      return { canCredit: false, reason: limitCheck.reason };
    }
  }

  // 4. L'invité est déjà blacklisté ?
  if (isAbuser(member.id)) {
    return { canCredit: false, reason: 'Utilisateur blacklisté (abus détecté précédemment)' };
  }

  return { canCredit: true };
}

module.exports = { validateNewMember, checkAccountAge, checkRejoinCooldown, isAbuser };
