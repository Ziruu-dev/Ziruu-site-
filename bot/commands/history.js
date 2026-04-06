const { EmbedBuilder } = require('discord.js');
const { searchOps } = require('../database/db');
const { COLORS, error: embedError } = require('../utils/embeds');
const config = require('../config');

// ============================================================
// COMMANDE +history
// Affiche l'historique des recherches de l'utilisateur
// ============================================================
module.exports = {
  name: 'history',
  description: 'Affiche ton historique de recherches',

  async execute(message, args) {
    // Seul le staff peut voir l'historique d'un autre
    const target = message.mentions.users.first();
    const isStaff = message.member.roles.cache.has(config.staffRoleId) ||
                    message.member.roles.cache.has(config.adminRoleId);

    if (target && !isStaff) {
      return message.reply({ embeds: [embedError('Permission refusée', 'Seul le staff peut voir l\'historique d\'un autre membre.')] });
    }

    const userId = (target || message.author).id;
    const username = (target || message.author).username;
    const history = searchOps.history(userId, 10);

    if (!history.length) {
      return message.reply(`📋 Aucune recherche enregistrée pour **${username}**.`);
    }

    const lines = history.map((h, i) => {
      const query = JSON.parse(h.query_data);
      const parts = [
        query.firstName && `Prénom: ${query.firstName}`,
        query.lastName  && `Nom: ${query.lastName}`,
        query.city      && `Ville: ${query.city}`,
      ].filter(Boolean).join(', ');

      const date = new Date(h.searched_at).toLocaleDateString('fr-FR');
      const result = h.result_found ? '✅' : '❌';
      return `**${i + 1}.** ${result} \`${parts}\` — ${h.coins_spent} coins — ${date}`;
    });

    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle(`📋 Historique de recherches — ${username}`)
      .setDescription(lines.join('\n'))
      .setFooter({ text: '10 dernières recherches | ✅ résultat trouvé | ❌ aucun résultat' })
      .setTimestamp();

    message.reply({ embeds: [embed] });
  },
};
