const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const config                       = require('../config');
const { userOps, searchOps }       = require('../database/db');
const { searchAll, formatRow, indexStats } = require('../utils/csvSearch');
const { logSearch }                = require('../utils/logger');
const { error: embedError, COLORS } = require('../utils/embeds');

// ============================================================
// COMMANDE +look
// Modal avec 5 champs indépendants — coûte 1 coin
// Remboursé si aucun résultat — tout en ephemeral
// ============================================================
module.exports = {
  name: 'look',
  description: `Recherche dans les bases de données (${config.searchCost} coin)`,

  async execute(message, args, client) {
    const user = userOps.getOrCreate(message.author.id, message.author.username);

    // ── Vérification des coins
    if (user.coins < config.searchCost) {
      return message.reply({
        embeds: [
          embedError(
            'Coins insuffisants',
            `Il te faut **${config.searchCost} coin** pour effectuer une recherche.\n` +
            `Tu as **${user.coins} coin(s)**.\n\n` +
            `Utilise \`+balance\` pour en acheter ou inviter des membres pour en gagner.`
          ),
        ],
      });
    }

    // ── Supprime le message +look pour garder le salon propre
    message.delete().catch(() => {});

    const sessionId = `${message.author.id}_${Date.now()}`;

    // ── Message éphémère avec bouton déclencheur du modal
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`look_open_${sessionId}`)
        .setLabel(`🔍 Ouvrir la recherche  (${config.searchCost} coin)`)
        .setStyle(ButtonStyle.Primary)
    );

    const triggerMsg = await message.channel.send({
      content: `<@${message.author.id}> Clique pour ouvrir le formulaire.`,
      components: [row],
    });

    // ── Collecteur sur le bouton (60 secondes, uniquement l'auteur)
    const btnCollector = triggerMsg.createMessageComponentCollector({
      filter: (i) => i.user.id === message.author.id && i.customId === `look_open_${sessionId}`,
      max: 1,
      time: 60_000,
    });

    btnCollector.on('collect', async (btnInteraction) => {
      // ── Construit le modal avec 5 champs séparés
      const modal = new ModalBuilder()
        .setCustomId(`look_modal_${sessionId}`)
        .setTitle('🔍 Recherche — Remplis au moins 1 champ');

      // Champ 1 : Prénom (indépendant)
      const firstNameInput = new TextInputBuilder()
        .setCustomId('first_name')
        .setLabel('Prénom')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(50)
        .setPlaceholder('ex : Jean');

      // Champ 2 : Nom (indépendant)
      const lastNameInput = new TextInputBuilder()
        .setCustomId('last_name')
        .setLabel('Nom de famille')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(50)
        .setPlaceholder('ex : Dupont');

      // Champ 3 : Téléphone et/ou IP
      const phoneIpInput = new TextInputBuilder()
        .setCustomId('phone_ip')
        .setLabel('Téléphone  et/ou  Adresse IP')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(80)
        .setPlaceholder('ex : 0601020304   ou   192.168.1.1');

      // Champ 4 : Ville et/ou Département
      const locationInput = new TextInputBuilder()
        .setCustomId('location')
        .setLabel('Ville  et/ou  Département (numéro)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(80)
        .setPlaceholder('ex : Paris   ou   75   ou   Paris 75');

      // Champ 5 : Adresse postale et/ou Email
      const addressEmailInput = new TextInputBuilder()
        .setCustomId('address_email')
        .setLabel('Adresse postale  et/ou  Email')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(120)
        .setPlaceholder('ex : 12 rue de la Paix   ou   jean@mail.com');

      modal.addComponents(
        new ActionRowBuilder().addComponents(firstNameInput),
        new ActionRowBuilder().addComponents(lastNameInput),
        new ActionRowBuilder().addComponents(phoneIpInput),
        new ActionRowBuilder().addComponents(locationInput),
        new ActionRowBuilder().addComponents(addressEmailInput)
      );

      await btnInteraction.showModal(modal);

      // ── Handler du modal
      client.modalHandlers.set(`look_modal_${sessionId}`, async (modalInteraction) => {
        triggerMsg.delete().catch(() => {});

        // ── Lecture des champs
        const firstName   = modalInteraction.fields.getTextInputValue('first_name').trim();
        const lastName    = modalInteraction.fields.getTextInputValue('last_name').trim();
        const rawPhoneIp  = modalInteraction.fields.getTextInputValue('phone_ip').trim();
        const rawLocation = modalInteraction.fields.getTextInputValue('location').trim();
        const rawAddrMail = modalInteraction.fields.getTextInputValue('address_email').trim();

        // ── Parse téléphone vs IP
        let phone = '', ip = '';
        for (const part of rawPhoneIp.split(/[\s,;]+/)) {
          if (/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(part)) ip = part;
          else if (part) phone = part;
        }

        // ── Parse ville vs département
        let city = '', department = '';
        for (const part of rawLocation.split(/[\s,;]+/)) {
          if (/^\d{2,3}$/.test(part)) department = part;
          else if (part) city += (city ? ' ' : '') + part;
        }

        // ── Parse adresse vs email
        let address = '', email = '';
        if (rawAddrMail.includes('@')) email = rawAddrMail;
        else address = rawAddrMail;

        const query = { firstName, lastName, phone, ip, city, department, address, email };

        // ── Au moins 1 champ obligatoire
        if (!Object.values(query).some(Boolean)) {
          return modalInteraction.reply({
            embeds: [embedError('Formulaire vide', 'Remplis au moins un champ pour lancer la recherche.')],
            ephemeral: true,
          });
        }

        await modalInteraction.deferReply({ ephemeral: true });

        // ── Vérifie à nouveau les coins (délai entre ouverture et soumission)
        const freshUser = userOps.get(message.author.id);
        if (!freshUser || freshUser.coins < config.searchCost) {
          return modalInteraction.editReply({
            embeds: [embedError('Coins insuffisants', `Il te faut ${config.searchCost} coin.`)],
          });
        }

        // ── RECHERCHE (CSV/JSON/TSV + SQLite interne)
        const csvResults = searchAll(query);

        let sqlResults = [];
        try {
          sqlResults = searchOps.searchPersonsAdvanced(query);
        } catch { /* ignore */ }

        const allResults = [
          ...csvResults.map(r => ({ source: r.filename, data: r.row, score: r.score })),
          ...sqlResults.map(r => ({ source: 'base interne', data: r, score: 1 })),
        ];

        // ── Aucun résultat → remboursement automatique
        if (allResults.length === 0) {
          searchOps.log(message.author.id, query, 0, false);
          logSearch(message.author.username, message.author.id, query, 0, 0);

          return modalInteraction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(COLORS.warning)
                .setTitle('❌ Aucun résultat')
                .setDescription(
                  '> Aucune correspondance trouvée dans les bases de données.\n\n' +
                  '✅ **Aucun coin débité** — remboursement automatique.'
                )
                .setTimestamp(),
            ],
          });
        }

        // ── Résultats trouvés → débit du coin
        userOps.removeCoins(message.author.id, config.searchCost);
        searchOps.log(message.author.id, query, config.searchCost, true);
        logSearch(message.author.username, message.author.id, query, allResults.length, config.searchCost);

        const remaining = freshUser.coins - config.searchCost;

        // ── Pagine (5 résultats par page)
        const PAGE_SIZE = 5;
        const pages = [];
        const totalPages = Math.ceil(allResults.length / PAGE_SIZE);

        for (let i = 0; i < allResults.length; i += PAGE_SIZE) {
          const slice = allResults.slice(i, i + PAGE_SIZE);
          const embed = new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle(`✅ ${allResults.length} résultat(s) — page ${pages.length + 1}/${totalPages}`)
            .setDescription(
              `**${config.searchCost} coin** débité · Solde restant : **${remaining} coin(s)**`
            )
            .setTimestamp();

          for (const res of slice) {
            embed.addFields({
              name: `📁 ${res.source}`,
              value: formatRow(res.data),
              inline: false,
            });
          }
          pages.push(embed);
        }

        // ── Page unique → envoi direct
        if (pages.length === 1) {
          client.modalHandlers.delete(`look_modal_${sessionId}`);
          return modalInteraction.editReply({ embeds: [pages[0]] });
        }

        // ── Multi-pages → boutons de navigation
        let currentPage = 0;
        const navButtons = (page) =>
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
          components: [navButtons(0)],
        });

        const navCollector = replyMsg.createMessageComponentCollector({
          filter: (i) => i.user.id === message.author.id,
          time: 120_000,
        });

        navCollector.on('collect', async (nav) => {
          if (nav.customId === `look_prev_${sessionId}`) currentPage--;
          if (nav.customId === `look_next_${sessionId}`) currentPage++;
          await nav.update({ embeds: [pages[currentPage]], components: [navButtons(currentPage)] });
        });

        navCollector.on('end', () => {
          replyMsg.edit({ components: [] }).catch(() => {});
        });

        client.modalHandlers.delete(`look_modal_${sessionId}`);
      });
    });

    btnCollector.on('end', (_, reason) => {
      if (reason === 'time') {
        triggerMsg.delete().catch(() => {});
        client.modalHandlers.delete(`look_modal_${sessionId}`);
      }
    });
  },
};
