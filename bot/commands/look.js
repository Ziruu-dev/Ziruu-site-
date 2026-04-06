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
const { searchAll, formatRow } = require('../utils/csvSearch');
const { logSearch } = require('../utils/logger');
const { error: embedError, COLORS } = require('../utils/embeds');

// ============================================================
// COMMANDE +look — Recherche dans les bases de données
// Coûte 1 coin | Remboursé si aucun résultat | Tout en ephemeral
// ============================================================
module.exports = {
  name: 'look',
  description: `Recherche dans les bases de données (${config.searchCost} coin)`,

  async execute(message, args, client) {
    const user = userOps.getOrCreate(message.author.id, message.author.username);

    if (user.coins < config.searchCost) {
      return message.reply({
        embeds: [
          embedError(
            'Coins insuffisants',
            `Il te faut **${config.searchCost} coin** pour effectuer une recherche.\n` +
              `Tu as **${user.coins} coin(s)**.\n\n` +
              `Utilise \`+balance\` pour en acheter ou inviter des membres.`
          ),
        ],
        ephemeral: false,
      });
    }

    // Supprime le message original pour rester discret
    message.delete().catch(() => {});

    // Ouvre directement le modal
    // On doit d'abord envoyer un message éphémère puis ouvrir le modal via une interaction
    // → Ici on utilise un bouton invisible pour déclencher le modal
    const triggerRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`look_trigger_${message.author.id}_${Date.now()}`)
        .setLabel('🔍 Ouvrir la recherche')
        .setStyle(ButtonStyle.Primary)
    );

    const triggerMsg = await message.channel.send({
      content: `<@${message.author.id}> Clique pour ouvrir le formulaire de recherche (**${config.searchCost} coin**).`,
      components: [triggerRow],
    });

    // Identifiant unique pour cette session de recherche
    const sessionId = `${message.author.id}_${Date.now()}`;
    const buttonId = `look_trigger_${message.author.id}_${Date.now()}`;

    // Le handler du bouton n'a qu'une seule chance (60s)
    const collector = triggerMsg.createMessageComponentCollector({
      filter: (i) => i.user.id === message.author.id,
      max: 1,
      time: 60_000,
    });

    collector.on('collect', async (interaction) => {
      // Ouvre le modal de recherche
      const modal = new ModalBuilder()
        .setCustomId(`look_modal_${sessionId}`)
        .setTitle('🔍 Recherche dans les bases de données');

      // Champ 1 : Nom + Prénom
      const nameInput = new TextInputBuilder()
        .setCustomId('name')
        .setLabel('Nom et/ou Prénom')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('ex: Jean Dupont  (laisse vide si pas besoin)');

      // Champ 2 : Téléphone / IP
      const phoneIpInput = new TextInputBuilder()
        .setCustomId('phone_ip')
        .setLabel('Téléphone et/ou IP')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('ex: 0601020304  ou  192.168.1.1');

      // Champ 3 : Ville / Département
      const locationInput = new TextInputBuilder()
        .setCustomId('location')
        .setLabel('Ville et/ou Département')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('ex: Paris  ou  75');

      // Champ 4 : Adresse / Email
      const addressInput = new TextInputBuilder()
        .setCustomId('address_email')
        .setLabel('Adresse et/ou Email')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('ex: 12 rue de la Paix  ou  jean@mail.com');

      // Champ 5 : ID Discord
      const discordIdInput = new TextInputBuilder()
        .setCustomId('discord_id')
        .setLabel('ID Discord')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('ex: 123456789012345678');

      modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(phoneIpInput),
        new ActionRowBuilder().addComponents(locationInput),
        new ActionRowBuilder().addComponents(addressInput),
        new ActionRowBuilder().addComponents(discordIdInput)
      );

      await interaction.showModal(modal);

      // Enregistre le handler du modal
      client.modalHandlers.set(`look_modal_${sessionId}`, async (modalInteraction) => {
        // Supprime le message déclencheur
        triggerMsg.delete().catch(() => {});

        const rawName      = modalInteraction.fields.getTextInputValue('name').trim();
        const rawPhoneIp   = modalInteraction.fields.getTextInputValue('phone_ip').trim();
        const rawLocation  = modalInteraction.fields.getTextInputValue('location').trim();
        const rawAddEmail  = modalInteraction.fields.getTextInputValue('address_email').trim();
        const discordId    = modalInteraction.fields.getTextInputValue('discord_id').trim();

        // Parse les champs combinés
        const nameParts    = rawName.split(/\s+/);
        const firstName    = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : '';
        const lastName     = nameParts.length > 0 ? nameParts[nameParts.length - 1] : rawName;

        // Téléphone vs IP : si contient des points c'est une IP
        const phoneIpParts = rawPhoneIp.split(/[\s,;]+/);
        let phone = '', ip = '';
        for (const p of phoneIpParts) {
          if (p.includes('.') && p.split('.').length >= 4) ip = p;
          else if (p) phone = p;
        }

        // Ville vs Département : si c'est un nombre c'est un département
        const locationParts = rawLocation.split(/[\s,;]+/);
        let city = '', department = '';
        for (const p of locationParts) {
          if (/^\d{2,3}$/.test(p)) department = p;
          else if (p) city = p;
        }

        // Adresse vs Email
        let address = '', email = '';
        if (rawAddEmail.includes('@')) {
          email = rawAddEmail;
        } else {
          address = rawAddEmail;
        }

        const query = { firstName, lastName, city, department, address, phone, email, discordId, ip };

        // Vérifie qu'au moins un champ est rempli
        const hasQuery = Object.values(query).some(Boolean);
        if (!hasQuery) {
          return modalInteraction.reply({
            embeds: [embedError('Formulaire vide', 'Tu dois renseigner au moins un champ.')],
            ephemeral: true,
          });
        }

        await modalInteraction.deferReply({ ephemeral: true });

        // Re-vérifie les coins
        const freshUser = userOps.get(message.author.id);
        if (!freshUser || freshUser.coins < config.searchCost) {
          return modalInteraction.editReply({
            embeds: [embedError('Coins insuffisants', `Il te faut ${config.searchCost} coin.`)],
          });
        }

        // ——————————————————————————————————————
        // RECHERCHE : CSV + SQLite en parallèle
        // ——————————————————————————————————————
        const csvResults = searchAll(query);
        const sqlResults = searchOps.searchPersonsAdvanced
          ? (() => {
              try { return searchOps.searchPersonsAdvanced(query); } catch { return []; }
            })()
          : [];

        // Fusionne les résultats (CSV en priorité, puis SQLite)
        const allResults = [
          ...csvResults.map((r) => ({ source: r.filename, data: r.row })),
          ...sqlResults.map((r) => ({ source: 'base interne', data: r })),
        ];

        // ——————————————————————————————————————
        // AUCUN RÉSULTAT → REMBOURSEMENT
        // ——————————————————————————————————————
        if (allResults.length === 0) {
          searchOps.log(message.author.id, query, 0, false);
          logSearch(message.author.username, message.author.id, query, 0, 0);

          return modalInteraction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(COLORS.warning)
                .setTitle('❌ Aucun résultat trouvé')
                .setDescription(
                  '> Aucune correspondance dans les bases de données.\n\n' +
                    '✅ **Aucun coin débité** — remboursement automatique.'
                )
                .setTimestamp(),
            ],
          });
        }

        // ——————————————————————————————————————
        // RÉSULTATS TROUVÉS → DÉBIT DU COIN
        // ——————————————————————————————————————
        userOps.removeCoins(message.author.id, config.searchCost);
        searchOps.log(message.author.id, query, config.searchCost, true);
        logSearch(message.author.username, message.author.id, query, allResults.length, config.searchCost);

        const remaining = freshUser.coins - config.searchCost;

        // Pagine les résultats (max 10 par page pour ne pas dépasser la limite Discord)
        const PAGE_SIZE = 5;
        const pages = [];

        for (let i = 0; i < allResults.length; i += PAGE_SIZE) {
          const slice = allResults.slice(i, i + PAGE_SIZE);
          const embed = new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle(`✅ ${allResults.length} résultat(s) — page ${pages.length + 1}/${Math.ceil(allResults.length / PAGE_SIZE)}`)
            .setDescription(`**${config.searchCost} coin** débité | Solde restant : **${remaining} coin(s)**`)
            .setTimestamp();

          for (const result of slice) {
            embed.addFields({
              name: `📁 Source : ${result.source}`,
              value: formatRow(result.data) || '_Données vides_',
              inline: false,
            });
          }

          pages.push(embed);
        }

        // Envoi de la première page
        if (pages.length === 1) {
          return modalInteraction.editReply({ embeds: [pages[0]] });
        }

        // Plusieurs pages → boutons de navigation
        let currentPage = 0;

        const navRow = (page) =>
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`look_prev_${sessionId}`)
              .setLabel('◀ Précédent')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(page === 0),
            new ButtonBuilder()
              .setCustomId(`look_next_${sessionId}`)
              .setLabel('Suivant ▶')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(page >= pages.length - 1)
          );

        const replyMsg = await modalInteraction.editReply({
          embeds: [pages[0]],
          components: [navRow(0)],
        });

        // Handler de navigation
        const navCollector = replyMsg.createMessageComponentCollector({
          filter: (i) => i.user.id === message.author.id,
          time: 120_000,
        });

        navCollector.on('collect', async (navInteraction) => {
          if (navInteraction.customId === `look_prev_${sessionId}`) currentPage--;
          if (navInteraction.customId === `look_next_${sessionId}`) currentPage++;

          await navInteraction.update({
            embeds: [pages[currentPage]],
            components: [navRow(currentPage)],
          });
        });

        navCollector.on('end', () => {
          replyMsg.edit({ components: [] }).catch(() => {});
        });

        // Nettoie le handler modal
        client.modalHandlers.delete(`look_modal_${sessionId}`);
      });
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') {
        triggerMsg.delete().catch(() => {});
        client.modalHandlers.delete(`look_modal_${sessionId}`);
      }
    });
  },
};
