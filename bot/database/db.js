const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

// ============================================================
// INITIALISATION
// ============================================================
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const DB_PATH = path.join(dataDir, 'bot.db');
let db;

// Helpers SQLite via sql.js
function save() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function run(sql, params = []) {
  db.run(sql, params);
  save();
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  let result = null;
  if (stmt.step()) result = stmt.getAsObject();
  stmt.free();
  return result;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

// Promesse d'initialisation — attendue par index.js avant le login
const ready = (async () => {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      discord_id   TEXT PRIMARY KEY,
      username     TEXT NOT NULL,
      coins        INTEGER NOT NULL DEFAULT 0,
      total_earned INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS welcome_given (
      discord_id TEXT PRIMARY KEY,
      given_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS invites (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      inviter_id     TEXT NOT NULL,
      invitee_id     TEXT NOT NULL,
      invite_code    TEXT NOT NULL,
      credited       INTEGER NOT NULL DEFAULT 0,
      joined_at      TEXT NOT NULL DEFAULT (datetime('now')),
      left_at        TEXT
    );
    CREATE TABLE IF NOT EXISTS join_history (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT NOT NULL,
      action     TEXT NOT NULL,
      at         TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS search_history (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id   TEXT NOT NULL,
      query_data   TEXT NOT NULL,
      coins_spent  INTEGER NOT NULL,
      result_found INTEGER NOT NULL DEFAULT 0,
      searched_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS payments (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id      TEXT NOT NULL,
      paypal_order_id TEXT UNIQUE NOT NULL,
      amount_eur      REAL NOT NULL,
      coins_granted   INTEGER NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending',
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at    TEXT
    );
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
    CREATE TABLE IF NOT EXISTS abuse_flags (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT NOT NULL,
      reason     TEXT NOT NULL,
      flagged_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Données de test
  const count = get('SELECT COUNT(*) as c FROM persons');
  if (count && count.c === 0) {
    const testData = [
      ['Jean',   'Dupont',  'Paris',     '75', '12 rue de la Paix',       'jean.dupont@test.com',  '0601020304', '123456789', '192.168.1.1',  'Test #1'],
      ['Marie',  'Martin',  'Lyon',      '69', '5 avenue Berthelot',      'marie.martin@test.com', '0611223344', '987654321', '10.0.0.2',     'Test #2'],
      ['Pierre', 'Bernard', 'Marseille', '13', '88 boulevard Michelet',   'pierre.b@test.com',     '0622334455', '111222333', '172.16.0.5',   'Test #3'],
      ['Sophie', 'Leclerc', 'Bordeaux',  '33', '3 cours de l\'Intendance','sophie.l@test.com',     '0633445566', '444555666', '192.168.2.10', 'Test #4'],
      ['Lucas',  'Moreau',  'Lille',     '59', '14 rue Faidherbe',        'lucas.m@test.com',      '0644556677', '777888999', '10.1.1.99',    'Test #5'],
    ];
    for (const r of testData) {
      run(
        'INSERT INTO persons (first_name,last_name,city,department,address,email,phone,discord_id,ip,extra_info) VALUES (?,?,?,?,?,?,?,?,?,?)',
        r
      );
    }
    console.log('[DB] Données de test insérées.');
  }

  save();
  console.log('[DB] Base de données prête.');
})();

// ============================================================
// OPÉRATIONS UTILISATEURS
// ============================================================
const userOps = {
  getOrCreate(discordId, username) {
    let user = get('SELECT * FROM users WHERE discord_id = ?', [discordId]);
    if (!user) {
      run('INSERT INTO users (discord_id, username) VALUES (?, ?)', [discordId, username]);
      user = get('SELECT * FROM users WHERE discord_id = ?', [discordId]);
    }
    return user;
  },

  get(discordId) {
    return get('SELECT * FROM users WHERE discord_id = ?', [discordId]);
  },

  updateUsername(discordId, username) {
    run("UPDATE users SET username = ?, updated_at = datetime('now') WHERE discord_id = ?", [username, discordId]);
  },

  addCoins(discordId, amount) {
    run(
      "UPDATE users SET coins = coins + ?, total_earned = total_earned + ?, updated_at = datetime('now') WHERE discord_id = ?",
      [amount, amount > 0 ? amount : 0, discordId]
    );
  },

  removeCoins(discordId, amount) {
    run("UPDATE users SET coins = MAX(0, coins - ?), updated_at = datetime('now') WHERE discord_id = ?", [amount, discordId]);
  },

  hasEnoughCoins(discordId, amount) {
    const user = get('SELECT coins FROM users WHERE discord_id = ?', [discordId]);
    return user && user.coins >= amount;
  },

  setCoins(discordId, amount) {
    run("UPDATE users SET coins = ?, updated_at = datetime('now') WHERE discord_id = ?", [amount, discordId]);
  },

  top(limit = 10) {
    return all('SELECT * FROM users ORDER BY coins DESC LIMIT ?', [limit]);
  },

  getAll() {
    return all('SELECT discord_id FROM users');
  },
};

// ============================================================
// COIN DE BIENVENUE
// ============================================================
const welcomeOps = {
  hasReceived(discordId) {
    return !!get('SELECT discord_id FROM welcome_given WHERE discord_id = ?', [discordId]);
  },
  markGiven(discordId) {
    run('INSERT OR IGNORE INTO welcome_given (discord_id) VALUES (?)', [discordId]);
  },
};

// ============================================================
// INVITATIONS
// ============================================================
const inviteOps = {
  record(inviterId, inviteeId, inviteCode) {
    run('INSERT INTO invites (inviter_id, invitee_id, invite_code) VALUES (?, ?, ?)', [inviterId, inviteeId, inviteCode]);
  },

  hasEverBeenInvited(inviteeId) {
    return !!get('SELECT id FROM invites WHERE invitee_id = ?', [inviteeId]);
  },

  credit(inviteeId) {
    run('UPDATE invites SET credited = 1 WHERE invitee_id = ? AND credited = 0', [inviteeId]);
  },

  markLeft(inviteeId) {
    run("UPDATE invites SET left_at = datetime('now') WHERE invitee_id = ? AND left_at IS NULL", [inviteeId]);
  },

  countValid(inviterId) {
    const row = get('SELECT COUNT(*) as count FROM invites WHERE inviter_id = ? AND credited = 1 AND left_at IS NULL', [inviterId]);
    return row ? row.count : 0;
  },

  countTodayFor(inviterId) {
    const row = get("SELECT COUNT(*) as count FROM invites WHERE inviter_id = ? AND date(joined_at) = date('now')", [inviterId]);
    return row ? row.count : 0;
  },
};

// ============================================================
// HISTORIQUE JOINS
// ============================================================
const joinOps = {
  log(discordId, action) {
    run('INSERT INTO join_history (discord_id, action) VALUES (?, ?)', [discordId, action]);
  },

  lastLeft(discordId) {
    return get("SELECT at FROM join_history WHERE discord_id = ? AND action = 'leave' ORDER BY at DESC LIMIT 1", [discordId]);
  },

  recentJoinCount(discordId, hours = 48) {
    const row = get(
      "SELECT COUNT(*) as count FROM join_history WHERE discord_id = ? AND action = 'join' AND at >= datetime('now', ? || ' hours')",
      [discordId, `-${hours}`]
    );
    return row ? row.count : 0;
  },
};

// ============================================================
// RECHERCHES
// ============================================================
const searchOps = {
  log(discordId, queryData, coinsSpent, resultFound) {
    run(
      'INSERT INTO search_history (discord_id, query_data, coins_spent, result_found) VALUES (?, ?, ?, ?)',
      [discordId, JSON.stringify(queryData), coinsSpent, resultFound ? 1 : 0]
    );
  },

  history(discordId, limit = 10) {
    return all('SELECT * FROM search_history WHERE discord_id = ? ORDER BY searched_at DESC LIMIT ?', [discordId, limit]);
  },

  searchPersonsAdvanced({ firstName, lastName, city, department, address, phone, email, discordId, ip }) {
    let sql = 'SELECT * FROM persons WHERE 1=1';
    const params = [];
    if (firstName)  { sql += ' AND first_name LIKE ?'; params.push(`%${firstName}%`); }
    if (lastName)   { sql += ' AND last_name  LIKE ?'; params.push(`%${lastName}%`); }
    if (city)       { sql += ' AND city       LIKE ?'; params.push(`%${city}%`); }
    if (department) { sql += ' AND department LIKE ?'; params.push(`%${department}%`); }
    if (address)    { sql += ' AND address    LIKE ?'; params.push(`%${address}%`); }
    if (phone)      { sql += ' AND phone      LIKE ?'; params.push(`%${phone}%`); }
    if (email)      { sql += ' AND email      LIKE ?'; params.push(`%${email}%`); }
    if (discordId)  { sql += ' AND discord_id LIKE ?'; params.push(`%${discordId}%`); }
    if (ip)         { sql += ' AND ip         LIKE ?'; params.push(`%${ip}%`); }
    sql += ' LIMIT 50';
    return all(sql, params);
  },

  addPerson(firstName, lastName, city, email, phone, department, address) {
    run(
      'INSERT INTO persons (first_name, last_name, city, email, phone, department, address) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [firstName, lastName, city || null, email || null, phone || null, department || null, address || null]
    );
  },
};

// ============================================================
// PAIEMENTS
// ============================================================
const paymentOps = {
  create(discordId, paypalOrderId, amountEur, coinsGranted) {
    run(
      'INSERT INTO payments (discord_id, paypal_order_id, amount_eur, coins_granted) VALUES (?, ?, ?, ?)',
      [discordId, paypalOrderId, amountEur, coinsGranted]
    );
  },

  complete(paypalOrderId) {
    run("UPDATE payments SET status = 'completed', completed_at = datetime('now') WHERE paypal_order_id = ?", [paypalOrderId]);
  },

  get(paypalOrderId) {
    return get('SELECT * FROM payments WHERE paypal_order_id = ?', [paypalOrderId]);
  },

  userHistory(discordId) {
    return all('SELECT * FROM payments WHERE discord_id = ? ORDER BY created_at DESC LIMIT 10', [discordId]);
  },
};

// ============================================================
// ANTI-ABUS
// ============================================================
const abuseOps = {
  flag(discordId, reason) {
    run('INSERT INTO abuse_flags (discord_id, reason) VALUES (?, ?)', [discordId, reason]);
  },

  isFlagged(discordId) {
    const row = get('SELECT COUNT(*) as c FROM abuse_flags WHERE discord_id = ?', [discordId]);
    return row && row.c > 0;
  },

  list() {
    return all('SELECT * FROM abuse_flags ORDER BY flagged_at DESC');
  },
};

module.exports = { ready, userOps, welcomeOps, inviteOps, joinOps, searchOps, paymentOps, abuseOps };
