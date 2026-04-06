const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Crée le dossier data si nécessaire
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'bot.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ============================================================
// TABLES
// ============================================================
db.exec(`
  -- Utilisateurs
  CREATE TABLE IF NOT EXISTS users (
    discord_id   TEXT PRIMARY KEY,
    username     TEXT NOT NULL,
    coins        INTEGER NOT NULL DEFAULT 0,
    total_earned INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Suivi du coin de bienvenue (une seule fois par utilisateur, même s'il revient)
  CREATE TABLE IF NOT EXISTS welcome_given (
    discord_id TEXT PRIMARY KEY,
    given_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Invitations
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
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id   TEXT NOT NULL,
    query_data   TEXT NOT NULL,
    coins_spent  INTEGER NOT NULL,
    result_found INTEGER NOT NULL DEFAULT 0,
    searched_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (discord_id) REFERENCES users(discord_id)
  );

  -- Transactions PayPal
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

  -- Base de données test (personnes à rechercher)
  CREATE TABLE IF NOT EXISTS persons (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name  TEXT NOT NULL,
    city       TEXT,
    department TEXT,
    address    TEXT,
    email      TEXT,
    phone      TEXT,
    discord_id TEXT,
    ip         TEXT,
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
// OPÉRATIONS UTILISATEURS
// ============================================================
const userOps = {
  getOrCreate(discordId, username) {
    let user = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId);
    if (!user) {
      db.prepare('INSERT INTO users (discord_id, username) VALUES (?, ?)').run(discordId, username);
      user = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId);
    }
    return user;
  },

  get(discordId) {
    return db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId);
  },

  updateUsername(discordId, username) {
    db.prepare('UPDATE users SET username = ?, updated_at = datetime(\'now\') WHERE discord_id = ?').run(username, discordId);
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
      UPDATE users SET coins = MAX(0, coins - ?), updated_at = datetime('now') WHERE discord_id = ?
    `).run(amount, discordId);
  },

  hasEnoughCoins(discordId, amount) {
    const user = db.prepare('SELECT coins FROM users WHERE discord_id = ?').get(discordId);
    return user && user.coins >= amount;
  },

  setCoins(discordId, amount) {
    db.prepare(`UPDATE users SET coins = ?, updated_at = datetime('now') WHERE discord_id = ?`).run(amount, discordId);
  },

  top(limit = 10) {
    return db.prepare('SELECT * FROM users ORDER BY coins DESC LIMIT ?').all(limit);
  },

  getAll() {
    return db.prepare('SELECT discord_id FROM users').all();
  },
};

// ============================================================
// COIN DE BIENVENUE
// ============================================================
const welcomeOps = {
  hasReceived(discordId) {
    return !!db.prepare('SELECT discord_id FROM welcome_given WHERE discord_id = ?').get(discordId);
  },

  markGiven(discordId) {
    db.prepare('INSERT OR IGNORE INTO welcome_given (discord_id) VALUES (?)').run(discordId);
  },
};

// ============================================================
// INVITATIONS
// ============================================================
const inviteOps = {
  record(inviterId, inviteeId, inviteCode) {
    return db.prepare(`
      INSERT INTO invites (inviter_id, invitee_id, invite_code) VALUES (?, ?, ?)
    `).run(inviterId, inviteeId, inviteCode);
  },

  // Vérifie si cet invité a DÉJÀ été invité par quelqu'un dans le passé
  hasEverBeenInvited(inviteeId) {
    const row = db.prepare('SELECT id FROM invites WHERE invitee_id = ?').get(inviteeId);
    return !!row;
  },

  credit(inviteeId) {
    return db.prepare(`UPDATE invites SET credited = 1 WHERE invitee_id = ? AND credited = 0`).run(inviteeId);
  },

  markLeft(inviteeId) {
    return db.prepare(`UPDATE invites SET left_at = datetime('now') WHERE invitee_id = ? AND left_at IS NULL`).run(inviteeId);
  },

  countValid(inviterId) {
    return db.prepare(`
      SELECT COUNT(*) as count FROM invites
      WHERE inviter_id = ? AND credited = 1 AND left_at IS NULL
    `).get(inviterId).count;
  },

  countTodayFor(inviterId) {
    return db.prepare(`
      SELECT COUNT(*) as count FROM invites
      WHERE inviter_id = ? AND date(joined_at) = date('now')
    `).get(inviterId).count;
  },
};

// ============================================================
// HISTORIQUE JOINS
// ============================================================
const joinOps = {
  log(discordId, action) {
    db.prepare('INSERT INTO join_history (discord_id, action) VALUES (?, ?)').run(discordId, action);
  },

  lastLeft(discordId) {
    return db.prepare(`
      SELECT at FROM join_history WHERE discord_id = ? AND action = 'leave' ORDER BY at DESC LIMIT 1
    `).get(discordId);
  },

  recentJoinCount(discordId, hours = 48) {
    return db.prepare(`
      SELECT COUNT(*) as count FROM join_history
      WHERE discord_id = ? AND action = 'join' AND at >= datetime('now', ? || ' hours')
    `).get(discordId, `-${hours}`).count;
  },
};

// ============================================================
// RECHERCHES
// ============================================================
const searchOps = {
  log(discordId, queryData, coinsSpent, resultFound) {
    db.prepare(`
      INSERT INTO search_history (discord_id, query_data, coins_spent, result_found) VALUES (?, ?, ?, ?)
    `).run(discordId, JSON.stringify(queryData), coinsSpent, resultFound ? 1 : 0);
  },

  history(discordId, limit = 10) {
    return db.prepare(`
      SELECT * FROM search_history WHERE discord_id = ? ORDER BY searched_at DESC LIMIT ?
    `).all(discordId, limit);
  },

  // Recherche avancée dans la table persons (SQLite)
  searchPersonsAdvanced({ firstName, lastName, city, department, address, phone, email, discordId, ip }) {
    let query = 'SELECT * FROM persons WHERE 1=1';
    const params = [];
    if (firstName)  { query += ' AND first_name LIKE ?'; params.push(`%${firstName}%`); }
    if (lastName)   { query += ' AND last_name  LIKE ?'; params.push(`%${lastName}%`); }
    if (city)       { query += ' AND city       LIKE ?'; params.push(`%${city}%`); }
    if (department) { query += ' AND department LIKE ?'; params.push(`%${department}%`); }
    if (address)    { query += ' AND address    LIKE ?'; params.push(`%${address}%`); }
    if (phone)      { query += ' AND phone      LIKE ?'; params.push(`%${phone}%`); }
    if (email)      { query += ' AND email      LIKE ?'; params.push(`%${email}%`); }
    if (discordId)  { query += ' AND discord_id LIKE ?'; params.push(`%${discordId}%`); }
    if (ip)         { query += ' AND ip         LIKE ?'; params.push(`%${ip}%`); }
    query += ' LIMIT 50';
    return db.prepare(query).all(...params);
  },
};

// ============================================================
// PAIEMENTS
// ============================================================
const paymentOps = {
  create(discordId, paypalOrderId, amountEur, coinsGranted) {
    return db.prepare(`
      INSERT INTO payments (discord_id, paypal_order_id, amount_eur, coins_granted) VALUES (?, ?, ?, ?)
    `).run(discordId, paypalOrderId, amountEur, coinsGranted);
  },

  complete(paypalOrderId) {
    return db.prepare(`
      UPDATE payments SET status = 'completed', completed_at = datetime('now') WHERE paypal_order_id = ?
    `).run(paypalOrderId);
  },

  get(paypalOrderId) {
    return db.prepare('SELECT * FROM payments WHERE paypal_order_id = ?').get(paypalOrderId);
  },

  userHistory(discordId) {
    return db.prepare(`SELECT * FROM payments WHERE discord_id = ? ORDER BY created_at DESC LIMIT 10`).all(discordId);
  },
};

// ============================================================
// ANTI-ABUS
// ============================================================
const abuseOps = {
  flag(discordId, reason) {
    db.prepare('INSERT INTO abuse_flags (discord_id, reason) VALUES (?, ?)').run(discordId, reason);
  },

  isFlagged(discordId) {
    return db.prepare('SELECT COUNT(*) as c FROM abuse_flags WHERE discord_id = ?').get(discordId).c > 0;
  },

  list() {
    return db.prepare('SELECT * FROM abuse_flags ORDER BY flagged_at DESC').all();
  },
};

// ============================================================
// DONNÉES DE TEST
// ============================================================
const personCount = db.prepare('SELECT COUNT(*) as c FROM persons').get().c;
if (personCount === 0) {
  const ins = db.prepare(`
    INSERT INTO persons (first_name, last_name, city, department, address, email, phone, discord_id, ip, extra_info)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const testData = [
    ['Jean',   'Dupont',  'Paris',     '75', '12 rue de la Paix',    'jean.dupont@test.com',   '0601020304', '123456789', '192.168.1.1',  'Test #1'],
    ['Marie',  'Martin',  'Lyon',      '69', '5 avenue Berthelot',   'marie.martin@test.com',  '0611223344', '987654321', '10.0.0.2',     'Test #2'],
    ['Pierre', 'Bernard', 'Marseille', '13', '88 boulevard Michelet','pierre.b@test.com',      '0622334455', '111222333', '172.16.0.5',   'Test #3'],
    ['Sophie', 'Leclerc', 'Bordeaux',  '33', '3 cours de l\'Intendance','sophie.l@test.com',  '0633445566', '444555666', '192.168.2.10', 'Test #4'],
    ['Lucas',  'Moreau',  'Lille',     '59', '14 rue Faidherbe',     'lucas.m@test.com',       '0644556677', '777888999', '10.1.1.99',    'Test #5'],
  ];
  for (const row of testData) ins.run(...row);
  console.log('[DB] Données de test insérées dans la table persons.');
}

module.exports = { db, userOps, welcomeOps, inviteOps, joinOps, searchOps, paymentOps, abuseOps };
