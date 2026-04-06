const fs   = require('fs');
const path = require('path');

// ============================================================
// DOSSIER DES BASES DE DONNÉES
// ============================================================
const DB_FOLDER = path.join(__dirname, '..', 'data', 'databases');
if (!fs.existsSync(DB_FOLDER)) {
  fs.mkdirSync(DB_FOLDER, { recursive: true });
  // Fichier CSV d'exemple (sans discord_id)
  fs.writeFileSync(
    path.join(DB_FOLDER, 'exemple.csv'),
    'prenom,nom,ville,departement,adresse,email,telephone,ip,info\n' +
    'Jean,Dupont,Paris,75,12 rue de la Paix,jean@test.com,0601020304,192.168.1.1,Test\n' +
    'Marie,Martin,Lyon,69,5 avenue Berthelot,marie@test.com,0611223344,10.0.0.2,Test2\n',
    'utf8'
  );
}

// ============================================================
// ALIASES DE COLONNES  →  champs canoniques
// Permet de reconnaître n'importe quel nom de colonne CSV
// ============================================================
const FIELD_ALIASES = {
  firstName:  ['prenom', 'prénom', 'firstname', 'first_name', 'forename', 'given_name', 'givenname'],
  lastName:   ['nom', 'name', 'lastname', 'last_name', 'surname', 'family_name', 'familyname'],
  city:       ['ville', 'city', 'commune', 'localite', 'localité', 'municipality'],
  department: ['departement', 'département', 'department', 'dept', 'dep', 'cp', 'codepostal', 'code_postal', 'zip'],
  address:    ['adresse', 'address', 'addr', 'rue', 'voie', 'street'],
  phone:      ['telephone', 'téléphone', 'phone', 'tel', 'mobile', 'portable', 'gsm', 'numero', 'numéro', 'num'],
  email:      ['email', 'mail', 'courriel', 'e_mail', 'e-mail', 'emailaddress'],
  ip:         ['ip', 'ip_address', 'adresse_ip', 'ipv4', 'ipv6'],
};

// Reverse map : nom_de_colonne_normalisé → champ canonique
const COL_TO_FIELD = {};
for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
  for (const alias of aliases) COL_TO_FIELD[alias] = field;
}

// Labels d'affichage pour l'embed Discord
const FIELD_LABELS = {
  firstName:  'Prénom',
  lastName:   'Nom',
  city:       'Ville',
  department: 'Département',
  address:    'Adresse',
  phone:      'Téléphone',
  email:      'Email',
  ip:         'IP',
};

// ============================================================
// NORMALISATION
// Supprime les accents, met en minuscules, trim
// "Élodie" → "elodie"
// ============================================================
function normalize(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Tokenise une valeur en sous-chaînes (pour index partiel)
function tokenize(str) {
  return normalize(str)
    .split(/[\s,;._\-/\\@]+/)
    .filter(t => t.length >= 2);
}

// ============================================================
// PARSEURS
// ============================================================
function parseCsv(content) {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean);
  if (lines.length < 2) return [];

  // Détecte le séparateur dominant
  const first = lines[0];
  const counts = { ',': 0, ';': 0, '\t': 0 };
  for (const ch of first) if (ch in counts) counts[ch]++;
  const sep = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

  const headers = lines[0].split(sep).map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());

  return lines.slice(1).map(line => {
    const values = line.split(sep);
    const obj = {};
    headers.forEach((h, i) => {
      const v = (values[i] || '').trim().replace(/^["']|["']$/g, '');
      if (v) obj[h] = v;
    });
    return obj;
  }).filter(row => Object.keys(row).length > 0);
}

function parseJson(content) {
  try {
    const data = JSON.parse(content);
    if (Array.isArray(data)) return data;
    if (typeof data === 'object') {
      // { "records": [...] } ou { "data": [...] }
      const arr = Object.values(data).find(v => Array.isArray(v));
      return arr || [data];
    }
    return [];
  } catch { return []; }
}

// ============================================================
// CHARGEMENT DES FICHIERS
// ============================================================
function loadAllFiles() {
  const exts = ['.csv', '.tsv', '.json', '.txt'];
  const files = fs.readdirSync(DB_FOLDER).filter(f => exts.includes(path.extname(f).toLowerCase()));
  const result = [];
  for (const file of files) {
    const fp   = path.join(DB_FOLDER, file);
    const stat = fs.statSync(fp);
    const ext  = path.extname(file).toLowerCase();
    const content = fs.readFileSync(fp, 'utf8');
    const rows = ext === '.json' ? parseJson(content) : parseCsv(content);
    if (rows.length > 0) result.push({ filename: file, rows, mtime: stat.mtimeMs });
  }
  return result;
}

// ============================================================
// INDEX EN MÉMOIRE (inverted index)
// ============================================================
class DatabaseIndex {
  constructor() {
    this._dbs        = [];   // [{ filename, rows, mtime }]
    this._tokenIdx   = new Map(); // token → Set<"fi:ri">
    this._fieldIdx   = new Map(); // canonicalField → Map<normalizedValue → Set<"fi:ri">>
    this._lastBuild  = 0;
    this.TTLMS       = 3 * 60 * 1000; // rebuid toutes les 3 min ou si fichier changé
  }

  // ——————————————————————————————————————
  // Construit / reconstruit l'index
  // ——————————————————————————————————————
  build() {
    const dbs = loadAllFiles();
    this._dbs = dbs;
    this._tokenIdx.clear();
    this._fieldIdx.clear();

    let total = 0;
    for (let fi = 0; fi < dbs.length; fi++) {
      const { rows } = dbs[fi];
      for (let ri = 0; ri < rows.length; ri++) {
        const key = `${fi}:${ri}`;
        const row = rows[ri];
        total++;

        for (const [col, val] of Object.entries(row)) {
          if (!val) continue;
          const colNorm     = normalize(col);
          const canonField  = COL_TO_FIELD[colNorm] || colNorm;
          const valNorm     = normalize(String(val));

          // ── Index par champ canonique (matching exact/partiel par champ)
          if (!this._fieldIdx.has(canonField)) this._fieldIdx.set(canonField, new Map());
          const fMap = this._fieldIdx.get(canonField);
          if (!fMap.has(valNorm)) fMap.set(valNorm, new Set());
          fMap.get(valNorm).add(key);

          // ── Index global par token (matching partiel cross-champ)
          for (const token of tokenize(String(val))) {
            if (!this._tokenIdx.has(token)) this._tokenIdx.set(token, new Set());
            this._tokenIdx.get(token).add(key);
          }
        }
      }
    }

    this._lastBuild = Date.now();
    console.log(`[INDEX] ${total} lignes indexées depuis ${dbs.length} fichier(s) dans ${DB_FOLDER}`);
  }

  // ——————————————————————————————————————
  // Vérifie si l'index doit être reconstruit
  // (TTL ou fichier modifié depuis la dernière indexation)
  // ——————————————————————————————————————
  _needsRebuild() {
    if (!this._lastBuild) return true;
    if (Date.now() - this._lastBuild > this.TTLMS) return true;
    // Vérifie les mtimes
    try {
      const exts = ['.csv', '.tsv', '.json', '.txt'];
      const files = fs.readdirSync(DB_FOLDER).filter(f => exts.includes(path.extname(f).toLowerCase()));
      for (const file of files) {
        const mtime = fs.statSync(path.join(DB_FOLDER, file)).mtimeMs;
        const known = this._dbs.find(d => d.filename === file);
        if (!known || known.mtime !== mtime) return true;
      }
    } catch { return true; }
    return false;
  }

  // ——————————————————————————————————————
  // Force un rechargement immédiat
  // ——————————————————————————————————————
  refresh() {
    this.build();
  }

  // ——————————————————————————————————————
  // RECHERCHE PRINCIPALE
  // query = { firstName, lastName, city, department, address, phone, email, ip }
  // Retourne [{ filename, row, score }] trié par pertinence
  // ——————————————————————————————————————
  search(query) {
    if (this._needsRebuild()) this.build();

    const activeTerms = Object.entries(query).filter(([, v]) => v && String(v).trim());
    if (!activeTerms.length) return [];

    const scores = new Map(); // key → score

    for (const [field, rawValue] of activeTerms) {
      const needle = normalize(rawValue);
      const tokens = tokenize(rawValue);

      // ── 1. Matching exact/partiel dans le champ canonique correspondant
      const fMap = this._fieldIdx.get(field);
      if (fMap) {
        for (const [indexedVal, keys] of fMap) {
          const points = matchScore(needle, indexedVal);
          if (points > 0) {
            for (const k of keys) scores.set(k, (scores.get(k) || 0) + points * 2); // bonus champ correct
          }
        }
      }

      // ── 2. Matching token global (cross-champ, pour les colonnes mal nommées)
      for (const token of tokens) {
        for (const [indexToken, keys] of this._tokenIdx) {
          const pts = matchScore(token, indexToken);
          if (pts > 0) {
            for (const k of keys) scores.set(k, (scores.get(k) || 0) + pts);
          }
        }
      }
    }

    // Assemble les résultats
    const results = [];
    for (const [key, score] of scores) {
      const [fi, ri] = key.split(':').map(Number);
      const db = this._dbs[fi];
      if (db && db.rows[ri]) results.push({ filename: db.filename, row: db.rows[ri], score });
    }

    // Trie par score décroissant puis déduplique
    results.sort((a, b) => b.score - a.score);
    const seen = new Set();
    return results.filter(r => {
      const k = JSON.stringify(r.row);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  stats() {
    return {
      files:  this._dbs.length,
      rows:   this._dbs.reduce((s, d) => s + d.rows.length, 0),
      tokens: this._tokenIdx.size,
      fields: this._fieldIdx.size,
      builtAt: this._lastBuild ? new Date(this._lastBuild).toLocaleString('fr-FR') : 'jamais',
    };
  }
}

// ——————————————————————————————————————
// Score de correspondance entre needle et une valeur indexée
// Retourne 0 (aucune), 1 (contient), 2 (commence par), 3 (exact)
// ——————————————————————————————————————
function matchScore(needle, indexed) {
  if (!needle || !indexed) return 0;
  if (indexed === needle)              return 3; // exact
  if (indexed.startsWith(needle))     return 2; // commence par
  if (indexed.includes(needle))       return 1; // contient
  if (needle.includes(indexed))       return 1; // needle plus large
  return 0;
}

// ============================================================
// INSTANCE GLOBALE (partagée par tout le bot)
// ============================================================
const globalIndex = new DatabaseIndex();

// ============================================================
// FORMATTER UN RÉSULTAT POUR L'EMBED DISCORD
// Utilise les labels canoniques quand possible
// ============================================================
function formatRow(row) {
  const lines = [];
  // Affiche d'abord les champs canoniques dans l'ordre
  const canonOrder = ['firstName', 'lastName', 'phone', 'email', 'city', 'department', 'address', 'ip'];
  const displayed  = new Set();

  for (const canon of canonOrder) {
    const aliases = FIELD_ALIASES[canon] || [];
    for (const [col, val] of Object.entries(row)) {
      if (!val) continue;
      const colNorm = normalize(col);
      if (aliases.includes(colNorm) && !displayed.has(col)) {
        lines.push(`**${FIELD_LABELS[canon] || canon}:** ${val}`);
        displayed.add(col);
        break;
      }
    }
  }

  // Colonnes inconnues en dernier
  for (const [col, val] of Object.entries(row)) {
    if (val && !displayed.has(col)) {
      lines.push(`**${col}:** ${val}`);
    }
  }

  return lines.join('\n') || '_Aucune donnée_';
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  searchAll: (query) => globalIndex.search(query),
  refreshIndex: ()   => globalIndex.refresh(),
  indexStats: ()     => globalIndex.stats(),
  formatRow,
  DB_FOLDER,
};
