// ============================================================
// ZIRUU DISCORD BOT — Point d'entrée principal
// ============================================================
require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
} = require('discord.js');

const fs = require('fs');
const path = require('path');
const config = require('./config');

// ——————————————————————————————————————
// CRÉATION DU CLIENT
// ——————————————————————————————————————
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildInvites,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

// ——————————————————————————————————————
// COLLECTIONS
// ——————————————————————————————————————

// Commandes texte (+look, +coins, ...)
client.commands = new Collection();

// Cache des invitations par serveur : Map<guildId, Map<code, uses>>
client.inviteCache = new Map();

// Handlers dynamiques pour les interactions (modals, boutons, menus)
client.modalHandlers  = new Map();
client.buttonHandlers = new Map();
client.selectHandlers = new Map();

// ——————————————————————————————————————
// CHARGEMENT DES COMMANDES
// ——————————————————————————————————————
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.name) {
    client.commands.set(command.name, command);
    console.log(`[CMD] Commande chargée: +${command.name}`);
  }
}

// ——————————————————————————————————————
// CHARGEMENT DES ÉVÉNEMENTS
// ——————————————————————————————————————
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter((f) => f.endsWith('.js'));

for (const file of eventFiles) {
  const event = require(path.join(eventsPath, file));

  const handler = (...args) => event.execute(...args, client);

  if (event.once) {
    client.once(event.name, handler);
  } else {
    client.on(event.name, handler);
  }

  console.log(`[EVENT] Événement enregistré: ${event.name}`);
}

// ——————————————————————————————————————
// GESTION DES ERREURS NON CAPTURÉES
// ——————————————————————————————————————
process.on('unhandledRejection', (err) => {
  console.error('[ERREUR] Promesse non gérée:', err);
});

process.on('uncaughtException', (err) => {
  console.error('[ERREUR] Exception non capturée:', err);
});

// ——————————————————————————————————————
// CONNEXION AU BOT (attend que la BDD soit prête)
// ——————————————————————————————————————
if (!config.token) {
  console.error('[ERREUR] DISCORD_TOKEN manquant dans le fichier .env');
  process.exit(1);
}

const { ready: dbReady, getSqlConstructor } = require('./database/db');
const { setSqlConstructor } = require('./utils/csvSearch');

dbReady.then(() => {
  // Partage le constructeur sql.js avec le moteur de recherche CSV
  // pour qu'il puisse lire les fichiers .db dans data/databases/
  setSqlConstructor(getSqlConstructor());
  console.log('[BOT] Base de données chargée, connexion à Discord...');
  return client.login(config.token);
}).catch((err) => {
  console.error('[ERREUR] Impossible de démarrer:', err.message);
  process.exit(1);
});
