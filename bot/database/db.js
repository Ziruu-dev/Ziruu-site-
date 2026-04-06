const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Crée le dossier data si nécessaire
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const db = new Database(path.join(dataDir, 'bot.db'));

// Active le mode WAL pour de meilleures performances
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ============================================================
// CRÉATION DES TABLES
// ============================================================
db.exec(`
  -- Table principale des utilisateurs
  CREATE TABLE IF NOT EXISTS users (
    discord_id   TEXT PRIMARY KEY,
    username     TEXT NOT NULL,
    coins        INTEGER NOT NULL DEFAULT 0,
    total_earned INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Table des invitations
  CREATE TABLE IF NOT EXISTS invites (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    inviter_id     TEXT NOT NULL,
    invitee_id     TEXT NOT NULL,
    invite_code    TEXT NOT NULL,
    credited       INTEGER NOT NULL DEFAULT 0,
    joined_at      TEXT NOT NULL DEFAULT (datetime('now')),
    left_at        TEXT,
    FOREIGN KEY (inviter_id) REFERENCES users(discord_id)
  );

  -- Historique des rejoins pour l'anti-abus
  CREATE TABLE IF NOT EXISTS join_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT NOT NULL,
    action     TEXT NOT NULL CHECK(action IN ('join','leave')),
    at         TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Historique des recherches
  CREATE TABLE IF NOT EXISTS search_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id  TEXT NOT NULL,
    query_data  TEXT NOT NULL,
    coins_spent INTEGER NOT NULL,
    result_found INTEGER NOT NULL DEFAULT 0,
    searched_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (discord_id) REFERENCES users(discord_id)
  );

  -- Transactions de paiement PayPal
  CREATE TABLE IF NOT EXISTS payments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id      TEXT NOT NULL,
    paypal_order_id TEXT UNIQUE NOT NULL,
    amount_eur      REAL NOT NULL,
    coins_granted   INTEGER NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at    TEXT,
    FOREIGN KEY (discord_id) REFERENCES users(discord_id)
  );

  -- Base de données test (les personnes que tu cherches)
  CREATE TABLE IF NOT EXISTS persons (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name  TEXT NOT NULL,
    city       TEXT,
    email      TEXT,
    phone      TEXT,
    extra_info TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Logs anti-abus
  CREATE TABLE IF NOT EXISTS abuse_flags (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT NOT NULL,
    reason     TEXT NOT NULL,
    flagged_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ============================================================
// REQUÊTES UTILISATEURS
// ============================================================
const userOps = {
  // Crée un utilisateur s'il n'existe pas, retourne toujours l'utilisateur
  getOrCreate(discordId, username) {
    let user = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId);
    if (!user) {
      db.prepare(
        'INSERT INTO users (discord_id, username) VALUES (?, ?)'
      ).run(discordId, username);
      user = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId);
    }
    return user;
  },

  get(discordId) {
    return db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId);
  },

  addCoins(discordId, amount) {
    db.prepare(`
      UPDATE users
      SET coins = coins + ?,
          total_earned = total_earned + ?,
          updated_at = datetime('now')
      WHERE discord_id = ?
    `).run(amount, amount > 0 ? amount : 0, discordId);
  },

  removeCoins(discordId, amount) {
    db.prepare(`
      UPDATE users
      SET coins = coins - ?,
          updated_at = datetime('now')
      WHERE discord_id = ?
    `).run(amount, discordId);
  },

  hasEnoughCoins(discordId, amount) {
    const user = db.prepare('SELECT coins FROM users WHERE discord_id = ?').get(discordId);
    return user && user.coins >= amount;
  },

  setCoins(discordId, amount) {
    db.prepare(`
      UPDATE users SET coins = ?, updated_at = datetime('now') WHERE discord_id = ?
    `).run(amount, discordId);
  },

  top(limit = 10) {
    return db.prepare('SELECT * FROM users ORDER BY coins DESC LIMIT ?').all(limit);
  },
};

// ============================================================
// REQUÊTES INVITATIONS
// ============================================================
const inviteOps = {
  record(inviterId, inviteeId, inviteCode) {
    return db.prepare(`
      INSERT INTO invites (inviter_id, invitee_id, invite_code)
      VALUES (?, ?, ?)
    `).run(inviterId, inviteeId, inviteCode);
  },

  credit(inviteeId) {
    return db.prepare(`
      UPDATE invites SET credited = 1 WHERE invitee_id = ? AND credited = 0
    `).run(inviteeId);
  },

  markLeft(inviteeId) {
    return db.prepare(`
      UPDATE invites SET left_at = datetime('now') WHERE invitee_id = ? AND left_at IS NULL
    `).run(inviteeId);
  },

  // Compte les invitations valides (invité toujours présent)
  countValid(inviterId) {
    return db.prepare(`
      SELECT COUNT(*) as count FROM invites
      WHERE inviter_id = ? AND credited = 1 AND left_at IS NULL
    `).get(inviterId).count;
  },

  // Invitations du jour pour anti-abus
  countTodayFor(inviterId) {
    return db.prepare(`
      SELECT COUNT(*) as count FROM invites
      WHERE inviter_id = ? AND date(joined_at) = date('now')
    `).get(inviterId).count;
  },
};

// ============================================================
// REQUÊTES HISTORIQUE DE JOINS
// ============================================================
const joinOps = {
  log(discordId, action) {
    db.prepare('INSERT INTO join_history (discord_id, action) VALUES (?, ?)').run(discordId, action);
  },

  // Dernière fois que cet ID a quitté
  lastLeft(discordId) {
    return db.prepare(`
      SELECT at FROM join_history
      WHERE discord_id = ? AND action = 'leave'
      ORDER BY at DESC LIMIT 1
    `).get(discordId);
  },

  // Nombre de fois que cet ID a rejoint dans les dernières X heures
  recentJoinCount(discordId, hours = 48) {
    return db.prepare(`
      SELECT COUNT(*) as count FROM join_history
      WHERE discord_id = ? AND action = 'join'
        AND at >= datetime('now', ? || ' hours')
    `).get(discordId, `-${hours}`).count;
  },
};

// ============================================================
// REQUÊTES RECHERCHES
// ============================================================
const searchOps = {
  log(discordId, queryData, coinsSpent, resultFound) {
    db.prepare(`
      INSERT INTO search_history (discord_id, query_data, coins_spent, result_found)
      VALUES (?, ?, ?, ?)
    `).run(discordId, JSON.stringify(queryData), coinsSpent, resultFound ? 1 : 0);
  },

  history(discordId, limit = 10) {
    return db.prepare(`
      SELECT * FROM search_history WHERE discord_id = ?
      ORDER BY searched_at DESC LIMIT ?
    `).all(discordId, limit);
  },

  // Recherche dans la table persons
  searchPersons(query) {
    const like = `%${query}%`;
    return db.prepare(`
      SELECT * FROM persons
      WHERE first_name LIKE ?
         OR last_name  LIKE ?
         OR city       LIKE ?
         OR email      LIKE ?
         OR phone      LIKE ?
      LIMIT 5
    `).all(like, like, like, like, like);
  },

  // Recherche avancée (prénom + nom + ville)
  searchPersonsAdvanced({ firstName, lastName, city }) {
    let query = 'SELECT * FROM persons WHERE 1=1';
    const params = [];
    if (firstName) { query += ' AND first_name LIKE ?'; params.push(`%${firstName}%`); }
    if (lastName)  { query += ' AND last_name  LIKE ?'; params.push(`%${lastName}%`); }
    if (city)      { query += ' AND city       LIKE ?'; params.push(`%${city}%`); }
    query += ' LIMIT 5';
    return db.prepare(query).all(...params);
  },
};

// ============================================================
// REQUÊTES PAIEMENTS
// ============================================================
const paymentOps = {
  create(discordId, paypalOrderId, amountEur, coinsGranted) {
    return db.prepare(`
      INSERT INTO payments (discord_id, paypal_order_id, amount_eur, coins_granted)
      VALUES (?, ?, ?, ?)
    `).run(discordId, paypalOrderId, amountEur, coinsGranted);
  },

  complete(paypalOrderId) {
    return db.prepare(`
      UPDATE payments
      SET status = 'completed', completed_at = datetime('now')
      WHERE paypal_order_id = ?
    `).run(paypalOrderId);
  },

  get(paypalOrderId) {
    return db.prepare('SELECT * FROM payments WHERE paypal_order_id = ?').get(paypalOrderId);
  },

  userHistory(discordId) {
    return db.prepare(`
      SELECT * FROM payments WHERE discord_id = ? ORDER BY created_at DESC LIMIT 10
    `).all(discordId);
  },
};

// ============================================================
// REQUÊTES ANTI-ABUS
// ============================================================
const abuseOps = {
  flag(discordId, reason) {
    db.prepare('INSERT INTO abuse_flags (discord_id, reason) VALUES (?, ?)').run(discordId, reason);
  },

  isFlagged(discordId) {
    const count = db.prepare('SELECT COUNT(*) as c FROM abuse_flags WHERE discord_id = ?').get(discordId).c;
    return count > 0;
  },

  list() {
    return db.prepare('SELECT * FROM abuse_flags ORDER BY flagged_at DESC').all();
  },
};

// ============================================================
// DONNÉES DE TEST (peuple la table persons si vide)
// ============================================================
const personCount = db.prepare('SELECT COUNT(*) as c FROM persons').get().c;
if (personCount === 0) {
  const insertPerson = db.prepare(`
    INSERT INTO persons (first_name, last_name, city, email, phone, extra_info)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const testData = [
    ['Jean', 'Dupont', 'Paris', 'jean.dupont@test.com', '0601020304', 'Test #1'],
    ['Marie', 'Martin', 'Lyon', 'marie.martin@test.com', '0611223344', 'Test #2'],
    ['Pierre', 'Bernard', 'Marseille', 'pierre.b@test.com', '0622334455', 'Test #3'],
    ['Sophie', 'Leclerc', 'Bordeaux', 'sophie.l@test.com', '0633445566', 'Test #4'],
    ['Lucas', 'Moreau', 'Lille', 'lucas.m@test.com', '0644556677', 'Test #5'],
  ];
  for (const row of testData) insertPerson.run(...row);
  console.log('[DB] Données de test insérées dans la table persons.');
}

module.exports = { db, userOps, inviteOps, joinOps, searchOps, paymentOps, abuseOps };
