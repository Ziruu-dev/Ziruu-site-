const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../utils/embeds');
const config = require('../config');

module.exports = {
  name: 'help',
  description: 'Affiche la liste des commandes',

  async execute(message) {
    const isStaff = message.member.roles.cache.has(config.staffRoleId) ||
                    message.member.roles.cache.has(config.adminRoleId);

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle('📖 Commandes disponibles')
      .addFields(
        {
          name: '🔍 Recherche',
          value: '`+look` — Rechercher une personne (coûte des coins)',
        },
        {
          name: '🪙 Coins',
          value:
            '`+coins [@user]` — Voir ton solde\n' +
            '`+buy` — Acheter des coins (PayPal)\n' +
            '`+top` — Classement des coins',
        },
        {
          name: '👥 Invitations',
          value: '`+invites [@user]` — Voir les stats d\'invitation',
        },
        {
          name: '📋 Historique',
          value: '`+history` — Voir tes 10 dernières recherches',
        }
      )
      .setFooter({ text: `Préfixe : ${config.prefix} | Coût d'une recherche : ${config.searchCost} coins` });

    if (isStaff) {
      embed.addFields({
        name: '🛠️ Administration',
        value: '`+admin` — Voir les commandes admin',
      });
    }

    message.reply({ embeds: [embed] });
  },
};
