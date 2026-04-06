const { userOps } = require('../database/db');
const { success, error: embedError } = require('../utils/embeds');
const config = require('../config');

// ============================================================
// COMMANDE +give @user <montant>
// Donne des coins à un utilisateur (rôle GIVE requis)
// ============================================================
module.exports = {
  name: 'give',
  description: 'Donne des coins à un utilisateur (rôle requis)',

  async execute(message, args) {
    // Vérifie le rôle autorisé
    const hasRole =
      message.member.roles.cache.has(config.giveRoleId) ||
      message.member.roles.cache.has(config.adminRoleId) ||
      message.member.permissions.has('Administrator') ||
      message.author.id === config.ownerId;

    if (!hasRole) {
      return message.reply({
        embeds: [embedError('Permission refusée', 'Tu n\'as pas le rôle requis pour utiliser `+give`.')],
      });
    }

    const target = message.mentions.users.first();
    const amount = parseInt(args[1]);

    if (!target || isNaN(amount) || amount <= 0) {
      return message.reply({
        embeds: [
          embedError(
            'Usage incorrect',
            '`+give @utilisateur <montant>`\n**Exemple :** `+give @Ziruu 10`'
          ),
        ],
      });
    }

    userOps.getOrCreate(target.id, target.username);
    userOps.addCoins(target.id, amount);
    const updated = userOps.get(target.id);

    return message.reply({
      embeds: [
        success(
          'Coins ajoutés',
          `**+${amount} coin(s)** donnés à <@${target.id}> par <@${message.author.id}>.\n` +
            `Nouveau solde de ${target.username} : **${updated.coins} coin(s)**.`
        ),
      ],
    });
  },
};
