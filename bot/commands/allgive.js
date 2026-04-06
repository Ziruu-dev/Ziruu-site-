const { userOps } = require('../database/db');
const { success, error: embedError, warning } = require('../utils/embeds');
const config = require('../config');

// ============================================================
// COMMANDE +allgive <montant>
// Donne des coins à tous les membres enregistrés (rôle requis)
// ============================================================
module.exports = {
  name: 'allgive',
  description: 'Donne des coins à tout le monde (rôle requis)',

  async execute(message, args) {
    // Vérifie le rôle autorisé
    const hasRole =
      message.member.roles.cache.has(config.giveRoleId) ||
      message.member.roles.cache.has(config.adminRoleId) ||
      message.member.permissions.has('Administrator') ||
      message.author.id === config.ownerId;

    if (!hasRole) {
      return message.reply({
        embeds: [embedError('Permission refusée', 'Tu n\'as pas le rôle requis pour utiliser `+allgive`.')],
      });
    }

    const amount = parseInt(args[0]);

    if (isNaN(amount) || amount <= 0) {
      return message.reply({
        embeds: [
          embedError(
            'Usage incorrect',
            '`+allgive <montant>`\n**Exemple :** `+allgive 10`'
          ),
        ],
      });
    }

    // Récupère tous les membres Discord du serveur qui ont rejoint le bot
    const allUsers = userOps.getAll();

    if (allUsers.length === 0) {
      return message.reply({
        embeds: [warning('Aucun utilisateur', 'Aucun utilisateur enregistré dans la base de données.')],
      });
    }

    // Confirmation avant d'exécuter (pour éviter les erreurs)
    const confirmMsg = await message.reply({
      embeds: [
        warning(
          'Confirmation requise',
          `Tu es sur le point de donner **${amount} coin(s)** à **${allUsers.length} utilisateur(s)**.\n` +
            `Total distribué : **${amount * allUsers.length} coins**.\n\n` +
            `Réponds \`oui\` pour confirmer (15 secondes).`
        ),
      ],
    });

    const filter = (m) => m.author.id === message.author.id && m.content.toLowerCase() === 'oui';
    const collector = message.channel.createMessageCollector({ filter, max: 1, time: 15_000 });

    collector.on('collect', () => {
      // Distribue les coins
      for (const { discord_id } of allUsers) {
        userOps.addCoins(discord_id, amount);
      }

      confirmMsg.edit({
        embeds: [
          success(
            '✅ Coins distribués !',
            `**+${amount} coin(s)** ajoutés à **${allUsers.length} utilisateur(s)**.\n` +
              `Total distribué : **${amount * allUsers.length} coins**.`
          ),
        ],
      });
    });

    collector.on('end', (collected) => {
      if (collected.size === 0) {
        confirmMsg.edit({
          embeds: [warning('Annulé', 'La distribution a été annulée (temps écoulé).')],
          components: [],
        });
      }
    });
  },
};
