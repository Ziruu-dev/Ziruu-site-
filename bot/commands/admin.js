const { EmbedBuilder } = require('discord.js');
const { userOps, abuseOps, searchOps: dbSearchOps } = require('../database/db');
const { refreshIndex, indexStats } = require('../utils/csvSearch');
const { success, error: embedError, info, warning, COLORS } = require('../utils/embeds');
const config = require('../config');

// ============================================================
// COMMANDE +admin <sous-commande> [args]
// Réservée aux admins uniquement
// Sous-commandes :
//   addcoins @user <montant>
//   removecoins @user <montant>
//   setcoins @user <montant>
//   ban @user <raison>
//   unban @user
//   flagged
//   addperson <prénom> <nom> <ville> <email> <téléphone>
// ============================================================
module.exports = {
  name: 'admin',
  description: 'Commandes d\'administration (admin uniquement)',

  async execute(message, args) {
    // Vérifie les permissions
    const isAdmin = message.member.roles.cache.has(config.adminRoleId) ||
                    message.member.permissions.has('Administrator');

    if (!isAdmin) {
      return message.reply({ embeds: [embedError('Accès refusé', 'Cette commande est réservée aux administrateurs.')] });
    }

    const sub = args[0]?.toLowerCase();

    // ——————————————————————————————————————
    // +admin addcoins @user <montant>
    // ——————————————————————————————————————
    if (sub === 'addcoins') {
      const target = message.mentions.users.first();
      const amount = parseInt(args[2]);

      if (!target || isNaN(amount) || amount <= 0) {
        return message.reply('Usage: `+admin addcoins @user <montant>`');
      }

      userOps.getOrCreate(target.id, target.username);
      userOps.addCoins(target.id, amount);
      const updated = userOps.get(target.id);

      return message.reply({
        embeds: [
          success(
            'Coins ajoutés',
            `+**${amount}** coins ajoutés à <@${target.id}>.\nNouveau solde : **${updated.coins} coins**.`
          ),
        ],
      });
    }

    // ——————————————————————————————————————
    // +admin removecoins @user <montant>
    // ——————————————————————————————————————
    if (sub === 'removecoins') {
      const target = message.mentions.users.first();
      const amount = parseInt(args[2]);

      if (!target || isNaN(amount) || amount <= 0) {
        return message.reply('Usage: `+admin removecoins @user <montant>`');
      }

      userOps.getOrCreate(target.id, target.username);
      userOps.removeCoins(target.id, amount);
      const updated = userOps.get(target.id);

      return message.reply({
        embeds: [
          success(
            'Coins retirés',
            `-**${amount}** coins retirés à <@${target.id}>.\nNouveau solde : **${updated.coins} coins**.`
          ),
        ],
      });
    }

    // ——————————————————————————————————————
    // +admin setcoins @user <montant>
    // ——————————————————————————————————————
    if (sub === 'setcoins') {
      const target = message.mentions.users.first();
      const amount = parseInt(args[2]);

      if (!target || isNaN(amount) || amount < 0) {
        return message.reply('Usage: `+admin setcoins @user <montant>`');
      }

      userOps.getOrCreate(target.id, target.username);
      userOps.setCoins(target.id, amount);

      return message.reply({
        embeds: [
          success('Coins définis', `Solde de <@${target.id}> défini à **${amount} coins**.`),
        ],
      });
    }

    // ——————————————————————————————————————
    // +admin ban @user <raison>
    // ——————————————————————————————————————
    if (sub === 'ban') {
      const target = message.mentions.users.first();
      const reason = args.slice(2).join(' ') || 'Abus détecté';

      if (!target) {
        return message.reply('Usage: `+admin ban @user <raison>`');
      }

      userOps.getOrCreate(target.id, target.username);
      abuseOps.flag(target.id, `[ADMIN BAN] ${reason}`);

      return message.reply({
        embeds: [
          warning('Utilisateur banni', `<@${target.id}> a été marqué comme abuseur.\nRaison : ${reason}`)
        ],
      });
    }

    // ——————————————————————————————————————
    // +admin flagged
    // Liste les utilisateurs flagués
    // ——————————————————————————————————————
    if (sub === 'flagged') {
      const flags = abuseOps.list();

      if (!flags.length) {
        return message.reply({ embeds: [info('Anti-abus', 'Aucun utilisateur flagué.')] });
      }

      const lines = flags.slice(0, 20).map((f) => {
        const date = new Date(f.flagged_at).toLocaleDateString('fr-FR');
        return `<@${f.discord_id}> — ${f.reason} (${date})`;
      });

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.warning)
            .setTitle('⚠️ Utilisateurs flagués (anti-abus)')
            .setDescription(lines.join('\n'))
            .setTimestamp(),
        ],
      });
    }

    // ——————————————————————————————————————
    // +admin addperson <prénom> <nom> <ville> <email> <téléphone>
    // Ajoute une personne dans la BDD de test
    // ——————————————————————————————————————
    if (sub === 'addperson') {
      const [, , firstName, lastName, city, email, phone, department, address, ip] = args;

      if (!firstName || !lastName) {
        return message.reply(
          'Usage: `+admin addperson <prénom> <nom> [ville] [email] [téléphone] [département] [adresse] [ip]`'
        );
      }

      dbSearchOps.addPerson(firstName, lastName, city, email, phone, department, address, ip);

      return message.reply({
        embeds: [
          success(
            'Personne ajoutée',
            `**${firstName} ${lastName}** ajouté(e) à la base interne.`
          ),
        ],
      });
    }

    // ——————————————————————————————————————
    // +admin reindex
    // Force la reconstruction de l'index CSV
    // ——————————————————————————————————————
    if (sub === 'reindex') {
      refreshIndex();
      const stats = indexStats();
      return message.reply({
        embeds: [
          success(
            'Index reconstruit',
            `**${stats.rows} lignes** indexées depuis **${stats.files} fichier(s)**.\n` +
            `Tokens : **${stats.tokens}** | Champs : **${stats.fields}**\n` +
            `Dossier : \`data/databases/\``
          ),
        ],
      });
    }

    // ——————————————————————————————————————
    // +admin indexstats
    // Affiche les statistiques de l'index
    // ——————————————————————————————————————
    if (sub === 'indexstats') {
      const stats = indexStats();
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.info)
            .setTitle('📊 Statistiques de l\'index')
            .addFields(
              { name: 'Fichiers indexés', value: `**${stats.files}**`, inline: true },
              { name: 'Lignes totales',   value: `**${stats.rows}**`,  inline: true },
              { name: 'Tokens uniques',   value: `**${stats.tokens}**`,inline: true },
              { name: 'Champs reconnus',  value: `**${stats.fields}**`,inline: true },
              { name: 'Dernière indexation', value: stats.builtAt, inline: false }
            )
            .setTimestamp(),
        ],
      });
    }

    // ——————————————————————————————————————
    // +admin creditpay @user <montant_euros>
    // Crédite manuellement un paiement PayPal.me / crypto
    // ——————————————————————————————————————
    if (sub === 'creditpay') {
      const target = message.mentions.users.first();
      const euros = parseFloat(args[2]);

      if (!target || isNaN(euros) || euros <= 0) {
        return message.reply('Usage: `+admin creditpay @user <montant_euros>`\nExemple : `+admin creditpay @Ziruu 10`');
      }

      const coins = Math.floor(euros * config.coinsPerEur);
      userOps.getOrCreate(target.id, target.username);
      userOps.addCoins(target.id, coins);
      const updated = userOps.get(target.id);

      // Log dans le salon des paiements si configuré
      if (config.paymentLogChannelId) {
        const logChannel = message.guild.channels.cache.get(config.paymentLogChannelId);
        logChannel?.send({
          embeds: [
            success(
              'Paiement manuel crédité',
              `<@${target.id}> — **${euros}€** → **+${coins} coins** (crédité par <@${message.author.id}>)`
            ),
          ],
        });
      }

      return message.reply({
        embeds: [
          success(
            'Paiement crédité',
            `**${euros}€** = **+${coins} coins** ajoutés à <@${target.id}>.\n` +
            `Nouveau solde : **${updated.coins} coins**.`
          ),
        ],
      });
    }

    // ——————————————————————————————————————
    // Aide
    // ——————————————————————————————————————
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.info)
          .setTitle('🛠️ Commandes Admin')
          .setDescription(
            '**💰 Coins**\n' +
            '`+admin addcoins @user <n>` — Ajouter des coins\n' +
            '`+admin removecoins @user <n>` — Retirer des coins\n' +
            '`+admin setcoins @user <n>` — Définir les coins\n' +
            '`+admin creditpay @user <euros>` — Créditer un paiement PayPal.me/crypto\n\n' +
            '**🛡️ Anti-abus**\n' +
            '`+admin ban @user <raison>` — Marquer comme abuseur\n' +
            '`+admin flagged` — Voir les utilisateurs flagués\n\n' +
            '**🗄️ Base de données**\n' +
            '`+admin addperson <prénom> <nom> [ville] [email] [tel] [dept] [adresse] [ip]`\n' +
            '`+admin reindex` — Reconstruire l\'index de recherche\n' +
            '`+admin indexstats` — Statistiques de l\'index'
          ),
      ],
    });
  },
};
