const { userOps } = require('../database/db');
const { success, error: embedError } = require('../utils/embeds');
const config = require('../config');

// ============================================================
// COMMANDE +remove @user <montant>
// Retire des coins à un utilisateur (rôle requis)
// ============================================================
module.exports = {
  name: 'remove',
  description: 'Retire des coins à un utilisateur (rôle requis)',

  async execute(message, args) {
    const hasRole =
      message.member.roles.cache.has(config.giveRoleId) ||
      message.member.roles.cache.has(config.adminRoleId) ||
      message.member.permissions.has('Administrator') ||
      message.author.id === config.ownerId;

    if (!hasRole) {
      return message.reply({
        embeds: [embedError('Permission refusée', 'Tu n\'as pas le rôle requis pour utiliser `+remove`.')],
      });
    }

    const target = message.mentions.users.first();
    // Accepte virgule (0,5) ou point (0.5)
    const rawAmount = (args[1] || '').replace(',', '.');
    const amount = parseFloat(rawAmount);

    if (!target || isNaN(amount) || amount <= 0) {
      return message.reply({
        embeds: [
          embedError(
            'Usage incorrect',
            '`+remove @utilisateur <montant>`\n' +
            'Exemples : `+remove @Ziruu 10` · `+remove @Ziruu 0,5`'
          ),
        ],
      });
    }

    const coins = Math.round(amount);
    const user = userOps.getOrCreate(target.id, target.username);

    if (user.coins < coins) {
      return message.reply({
        embeds: [
          embedError(
            'Solde insuffisant',
            `<@${target.id}> n'a que **${user.coins} coin(s)**, impossible de retirer **${coins}**.`
          ),
        ],
      });
    }

    userOps.removeCoins(target.id, coins);
    const updated = userOps.get(target.id);

    return message.reply({
      embeds: [
        success(
          'Coins retirés',
          `**-${coins} coin(s)** retirés à <@${target.id}> par <@${message.author.id}>.\n` +
          `Nouveau solde : **${updated.coins} coin(s)**.`
        ),
      ],
    });
  },
};
