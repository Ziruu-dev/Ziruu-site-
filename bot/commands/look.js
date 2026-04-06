const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const config = require('../config');
const { userOps, searchOps } = require('../database/db');
const { error: embedError, success, info, COLORS } = require('../utils/embeds');

// ============================================================
// COMMANDE +look
// Ouvre un formulaire (modal) pour rechercher dans la BDD
// ============================================================
module.exports = {
  name: 'look',
  description: 'Recherche une personne dans la base de données (coûte des coins)',

  async execute(message, args, client) {
    const user = userOps.getOrCreate(message.author.id, message.author.username);

    // Vérifie que l'utilisateur a assez de coins
    if (user.coins < config.searchCost) {
      return message.reply({
        embeds: [
          embedError(
            'Coins insuffisants',
            `Tu as besoin de **${config.searchCost} coins** pour effectuer une recherche.\n` +
              `Tu possèdes actuellement **${user.coins} coin(s)**.\n\n` +
              `Utilise \`+buy\` pour acheter des coins ou invite des membres pour en gagner.`
          ),
        ],
      });
    }

    // Affiche un message avec le bouton pour ouvrir le formulaire
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`look_open_${message.author.id}`)
        .setLabel(`🔍 Ouvrir la recherche (${config.searchCost} coins)`)
        .setStyle(ButtonStyle.Primary)
    );

    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle('🔍 Recherche dans la base de données')
          .setDescription(
            `Cette recherche coûte **${config.searchCost} coins**.\n` +
              `Tu as actuellement **${user.coins} coin(s)**.\n\n` +
              `Clique sur le bouton ci-dessous pour ouvrir le formulaire de recherche.`
          )
          .setFooter({ text: 'La recherche est débitée uniquement si elle aboutit.' }),
      ],
      components: [row],
    });

    // Enregistre le handler du bouton
    client.buttonHandlers.set(`look_open_${message.author.id}`, async (interaction) => {
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({ content: '❌ Ce bouton ne t\'est pas destiné.', ephemeral: true });
      }

      // Ouvre le modal (formulaire)
      const modal = new ModalBuilder()
        .setCustomId(`look_modal_${message.author.id}`)
        .setTitle('Recherche de personne');

      const firstNameInput = new TextInputBuilder()
        .setCustomId('first_name')
        .setLabel('Prénom')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('ex: Jean');

      const lastNameInput = new TextInputBuilder()
        .setCustomId('last_name')
        .setLabel('Nom de famille')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('ex: Dupont');

      const cityInput = new TextInputBuilder()
        .setCustomId('city')
        .setLabel('Ville')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('ex: Paris');

      modal.addComponents(
        new ActionRowBuilder().addComponents(firstNameInput),
        new ActionRowBuilder().addComponents(lastNameInput),
        new ActionRowBuilder().addComponents(cityInput)
      );

      await interaction.showModal(modal);

      // Enregistre le handler du modal
      client.modalHandlers.set(`look_modal_${message.author.id}`, async (modalInteraction) => {
        const firstName = modalInteraction.fields.getTextInputValue('first_name').trim();
        const lastName  = modalInteraction.fields.getTextInputValue('last_name').trim();
        const city      = modalInteraction.fields.getTextInputValue('city').trim();

        if (!firstName && !lastName && !city) {
          return modalInteraction.reply({
            embeds: [embedError('Formulaire vide', 'Tu dois renseigner au moins un champ.')],
            ephemeral: true,
          });
        }

        // Re-vérifie les coins au moment de la soumission
        const freshUser = userOps.get(message.author.id);
        if (freshUser.coins < config.searchCost) {
          return modalInteraction.reply({
            embeds: [embedError('Coins insuffisants', `Il te faut ${config.searchCost} coins.`)],
            ephemeral: true,
          });
        }

        await modalInteraction.deferReply({ ephemeral: true });

        // Lance la recherche
        const results = searchOps.searchPersonsAdvanced({ firstName, lastName, city });

        if (results.length === 0) {
          // Aucun résultat → on ne débite PAS les coins
          searchOps.log(message.author.id, { firstName, lastName, city }, 0, false);

          return modalInteraction.editReply({
            embeds: [
              info(
                'Aucun résultat',
                `Aucune personne trouvée pour :\n` +
                  `• Prénom : **${firstName || '-'}**\n` +
                  `• Nom : **${lastName || '-'}**\n` +
                  `• Ville : **${city || '-'}**\n\n` +
                  `✅ Aucun coin débité.`
              ),
            ],
          });
        }

        // Résultats trouvés → on débite les coins
        userOps.removeCoins(message.author.id, config.searchCost);
        searchOps.log(message.author.id, { firstName, lastName, city }, config.searchCost, true);

        // Construit l'embed de résultats
        const embed = new EmbedBuilder()
          .setColor(COLORS.success)
          .setTitle(`✅ ${results.length} résultat(s) trouvé(s)`)
          .setDescription(
            `**${config.searchCost} coins** ont été débités.\n` +
              `Il te reste **${freshUser.coins - config.searchCost} coin(s)**.`
          )
          .setTimestamp();

        for (const person of results) {
          embed.addFields({
            name: `👤 ${person.first_name} ${person.last_name}`,
            value:
              `📍 Ville : **${person.city || 'N/A'}**\n` +
              `📧 Email : **${person.email || 'N/A'}**\n` +
              `📞 Téléphone : **${person.phone || 'N/A'}**\n` +
              `📝 Info : **${person.extra_info || 'N/A'}**`,
            inline: false,
          });
        }

        await modalInteraction.editReply({ embeds: [embed] });

        // Nettoie les handlers
        client.modalHandlers.delete(`look_modal_${message.author.id}`);
        client.buttonHandlers.delete(`look_open_${message.author.id}`);
      });
    });
  },
};
