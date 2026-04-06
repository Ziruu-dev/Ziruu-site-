const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../utils/embeds');
const config = require('../config');

module.exports = {
  name: 'help',
  description: 'Affiche la liste des commandes',

  async execute(message) {
    const isStaff =
      message.member.roles.cache.has(config.staffRoleId) ||
      message.member.roles.cache.has(config.adminRoleId);
    const isGive =
      message.member.roles.cache.has(config.giveRoleId) || isStaff;
    const isOwner = message.author.id === config.ownerId;

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle('📖 Commandes disponibles')
      .addFields(
        {
          name: '🔍 Recherche',
          value:
            `\`+look\` — Rechercher dans les bases de données (**${config.searchCost} coin**)\n` +
            `> Si aucun résultat → remboursement automatique\n` +
            `> Résultats visibles uniquement par toi`,
        },
        {
          name: '🪙 Coins',
          value:
            '`+balance [@user]` — Voir ton solde (bouton "En ajouter")\n' +
            '`+buy` — Acheter des coins via PayPal sandbox\n' +
            '`+top` — Classement des coins\n' +
            `> Taux : 1€ = **${config.coinsPerEur} coins**`,
        },
        {
          name: '👥 Invitations',
          value:
            '`+invites [@user]` — Statistiques d\'invitation\n' +
            `> 1 invitation valide = **${config.coinsPerInvite} coin**\n` +
            '> Coin révoqué si le membre repart',
        },
        {
          name: '📋 Historique',
          value: '`+history` — Tes 10 dernières recherches',
        }
      )
      .setFooter({ text: `Préfixe : ${config.prefix} | Bienvenue : ${config.welcomeCoins} coin gratuit` });

    if (isGive) {
      embed.addFields({
        name: '🎁 Distribution',
        value:
          '`+give @user <n>` — Donner des coins à un membre\n' +
          '`+allgive <n>` — Donner des coins à tout le monde',
      });
    }

    if (isStaff) {
      embed.addFields({
        name: '🛠️ Administration',
        value: '`+admin` — Voir les commandes admin',
      });
    }

    if (isOwner) {
      embed.addFields({
        name: '👑 Owner',
        value: '`+pay` — Poster l\'embed de paiement dans le salon dédié',
      });
    }

    message.reply({ embeds: [embed] });
  },
};
