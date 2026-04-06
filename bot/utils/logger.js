const fs = require('fs');
const path = require('path');

// Dossier de logs
const logDir = path.join(__dirname, '..', 'data', 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const logFile = path.join(logDir, 'commands.log');

/**
 * Formate une date en français lisible
 */
function timestamp() {
  return new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
}

/**
 * Écrit une ligne dans le fichier de log
 * @param {string} level - INFO | WARN | ERROR | CMD
 * @param {string} message
 */
function write(level, message) {
  const line = `[${timestamp()}] [${level}] ${message}\n`;
  fs.appendFileSync(logFile, line, 'utf8');
  // Affiche aussi dans la console
  console.log(line.trim());
}

/**
 * Log une commande exécutée par un utilisateur
 * @param {string} username
 * @param {string} userId
 * @param {string} command
 * @param {string[]} args
 * @param {string} guildName
 */
function logCommand(username, userId, command, args, guildName) {
  const argsStr = args.length ? ` ${args.join(' ')}` : '';
  write('CMD', `[${guildName}] ${username} (${userId}) → +${command}${argsStr}`);
}

/**
 * Log une recherche
 * @param {string} username
 * @param {string} userId
 * @param {object} query
 * @param {number} results
 * @param {number} coinsSpent
 */
function logSearch(username, userId, query, results, coinsSpent) {
  const queryStr = Object.entries(query)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}="${v}"`)
    .join(', ');
  write('CMD', `[SEARCH] ${username} (${userId}) → {${queryStr}} → ${results} résultat(s) | ${coinsSpent} coin(s) débité(s)`);
}

/**
 * Log un paiement
 */
function logPayment(username, userId, orderId, amount, coins) {
  write('INFO', `[PAYMENT] ${username} (${userId}) → ${amount}€ → ${coins} coins | OrderID: ${orderId}`);
}

/**
 * Log une erreur
 */
function logError(context, error) {
  write('ERROR', `[${context}] ${error.message || error}`);
}

/**
 * Log une info générale
 */
function info(message) {
  write('INFO', message);
}

module.exports = { logCommand, logSearch, logPayment, logError, info };
