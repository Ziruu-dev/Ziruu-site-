const fs = require('fs');
const path = require('path');

// Dossier contenant tes fichiers de bases de données (CSV, JSON, TSV)
const DB_FOLDER = path.join(__dirname, '..', 'data', 'databases');

// Crée le dossier si nécessaire + fichier exemple
if (!fs.existsSync(DB_FOLDER)) {
  fs.mkdirSync(DB_FOLDER, { recursive: true });

  // Fichier CSV d'exemple
  const exampleCsv =
    'prenom,nom,ville,departement,adresse,email,telephone,discord_id,ip,info\n' +
    'Jean,Dupont,Paris,75,12 rue de la Paix,jean@test.com,0601020304,123456789,192.168.1.1,Exemple\n' +
    'Marie,Martin,Lyon,69,5 avenue Berthelot,marie@test.com,0611223344,987654321,10.0.0.2,Exemple2\n';
  fs.writeFileSync(path.join(DB_FOLDER, 'exemple.csv'), exampleCsv, 'utf8');
}

/**
 * Parse un fichier CSV en tableau d'objets
 * Gère les virgules, points-virgules et tabulations comme séparateurs
 * @param {string} content - Contenu brut du fichier
 * @returns {object[]}
 */
function parseCsv(content) {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean);
  if (lines.length < 2) return [];

  // Détecte le séparateur
  const firstLine = lines[0];
  let sep = ',';
  if ((firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length) sep = ';';
  if ((firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length) sep = '\t';

  const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));

  return lines.slice(1).map((line) => {
    const values = line.split(sep);
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (values[i] || '').trim();
    });
    return obj;
  });
}

/**
 * Parse un fichier JSON (tableau d'objets)
 * @param {string} content
 * @returns {object[]}
 */
function parseJson(content) {
  try {
    const data = JSON.parse(content);
    return Array.isArray(data) ? data : [data];
  } catch {
    return [];
  }
}

/**
 * Charge tous les fichiers de bases de données (.csv, .tsv, .json, .txt)
 * @returns {{ filename: string, rows: object[] }[]}
 */
function loadAllDatabases() {
  const files = fs.readdirSync(DB_FOLDER).filter((f) =>
    ['.csv', '.tsv', '.json', '.txt'].includes(path.extname(f).toLowerCase())
  );

  const databases = [];
  for (const file of files) {
    const filePath = path.join(DB_FOLDER, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(file).toLowerCase();

    let rows = [];
    if (ext === '.json') {
      rows = parseJson(content);
    } else {
      rows = parseCsv(content);
    }

    if (rows.length > 0) {
      databases.push({ filename: file, rows });
    }
  }

  return databases;
}

/**
 * Recherche dans toutes les bases de données
 * @param {object} query - { firstName, lastName, city, department, address, phone, email, discordId, ip }
 * @returns {{ filename: string, row: object }[]}
 */
function searchAll(query) {
  const databases = loadAllDatabases();
  const results = [];

  // Normalise les termes de recherche
  const terms = Object.values(query)
    .filter(Boolean)
    .map((v) => v.toLowerCase().trim());

  if (terms.length === 0) return [];

  // Mappings des noms de colonnes courants vers nos champs
  const fieldAliases = {
    firstName:  ['prenom', 'firstname', 'first_name', 'prénom', 'forename', 'name'],
    lastName:   ['nom', 'lastname', 'last_name', 'surname', 'family_name'],
    city:       ['ville', 'city', 'commune', 'localite'],
    department: ['departement', 'department', 'dept', 'dep'],
    address:    ['adresse', 'address', 'addr', 'rue'],
    phone:      ['telephone', 'phone', 'tel', 'mobile', 'portable', 'numero'],
    email:      ['email', 'mail', 'courriel', 'e_mail', 'e-mail'],
    discordId:  ['discord_id', 'discord', 'discordid'],
    ip:         ['ip', 'ip_address', 'adresse_ip'],
  };

  for (const { filename, rows } of databases) {
    for (const row of rows) {
      // Valeurs de la ligne en minuscules
      const rowValues = Object.values(row).map((v) => String(v).toLowerCase());

      let matchCount = 0;

      for (const [field, value] of Object.entries(query)) {
        if (!value) continue;
        const needle = value.toLowerCase().trim();
        const aliases = fieldAliases[field] || [field.toLowerCase()];

        // Cherche dans les colonnes correspondant à ce champ
        let fieldMatch = false;
        for (const [colName, colValue] of Object.entries(row)) {
          const colLower = colName.toLowerCase();
          const isRelevantCol = aliases.some((alias) => colLower.includes(alias));
          if (isRelevantCol && String(colValue).toLowerCase().includes(needle)) {
            fieldMatch = true;
            break;
          }
        }

        // Si la colonne n'est pas trouvée par alias, cherche dans toutes les valeurs
        if (!fieldMatch && rowValues.some((v) => v.includes(needle))) {
          fieldMatch = true;
        }

        if (fieldMatch) matchCount++;
      }

      // Résultat pertinent si au moins 1 champ correspond
      if (matchCount > 0) {
        results.push({ filename, row, score: matchCount });
      }
    }
  }

  // Trie par score décroissant (les plus pertinents en premier)
  results.sort((a, b) => b.score - a.score);

  // Supprime les doublons exacts
  const seen = new Set();
  return results.filter(({ row }) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Formate un résultat de recherche en texte lisible pour l'embed Discord
 * @param {object} row
 * @returns {string}
 */
function formatRow(row) {
  const fieldLabels = {
    prenom: 'Prénom', firstname: 'Prénom', first_name: 'Prénom',
    nom: 'Nom', lastname: 'Nom', last_name: 'Nom',
    ville: 'Ville', city: 'Ville',
    departement: 'Département', department: 'Département', dept: 'Département',
    adresse: 'Adresse', address: 'Adresse',
    telephone: 'Téléphone', phone: 'Téléphone', tel: 'Téléphone', mobile: 'Téléphone', portable: 'Téléphone',
    email: 'Email', mail: 'Email',
    discord_id: 'Discord ID', discord: 'Discord ID',
    ip: 'IP', ip_address: 'IP',
  };

  return Object.entries(row)
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => {
      const label = fieldLabels[k.toLowerCase()] || k;
      return `**${label}:** ${v}`;
    })
    .join('\n');
}

module.exports = { searchAll, formatRow, loadAllDatabases };
