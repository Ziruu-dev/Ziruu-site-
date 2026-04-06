const config = require('../config');

module.exports = {
  name: 'messageCreate',

  async execute(message, client) {
    // Ignore les bots et les messages sans préfixe
    if (message.author.bot) return;
    if (!message.content.startsWith(config.prefix)) return;

    const args = message.content.slice(config.prefix.length).trim().split(/\s+/);
    const commandName = args.shift().toLowerCase();

    const command = client.commands.get(commandName);
    if (!command) return;

    try {
      await command.execute(message, args, client);
    } catch (err) {
      console.error(`[CMD] Erreur dans la commande ${commandName}:`, err);
      message.reply('❌ Une erreur est survenue lors de l\'exécution de cette commande.').catch(() => {});
    }
  },
};
