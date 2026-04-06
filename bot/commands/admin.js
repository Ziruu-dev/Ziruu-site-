const { EmbedBuilder } = require('discord.js');
const { userOps, abuseOps, db } = require('../database/db');
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
      const [, , firstName, lastName, city, email, phone] = args;

      if (!firstName || !lastName) {
        return message.reply('Usage: `+admin addperson <prénom> <nom> [ville] [email] [téléphone]`');
      }

      db.prepare(
        'INSERT INTO persons (first_name, last_name, city, email, phone) VALUES (?, ?, ?, ?, ?)'
      ).run(firstName, lastName, city || null, email || null, phone || null);

      return message.reply({
        embeds: [
          success(
            'Personne ajoutée',
            `**${firstName} ${lastName}** a été ajouté(e) à la base de données.`
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
            '`+admin addcoins @user <n>` — Ajouter des coins\n' +
            '`+admin removecoins @user <n>` — Retirer des coins\n' +
            '`+admin setcoins @user <n>` — Définir les coins\n' +
            '`+admin ban @user <raison>` — Marquer comme abuseur\n' +
            '`+admin flagged` — Voir les utilisateurs flagués\n' +
            '`+admin addperson <prénom> <nom> [ville] [email] [tel]` — Ajouter une personne en BDD'
          ),
      ],
    });
  },
};
