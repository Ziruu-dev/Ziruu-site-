const config = require('../config');
const { logCommand, logError } = require('../utils/logger');

module.exports = {
  name: 'messageCreate',

  async execute(message, client) {
    if (message.author.bot) return;
    if (!message.content.startsWith(config.prefix)) return;

    const args = message.content.slice(config.prefix.length).trim().split(/\s+/);
    const commandName = args.shift().toLowerCase();

    const command = client.commands.get(commandName);
    if (!command) return;

    // Log toutes les commandes dans le fichier
    logCommand(
      message.author.username,
      message.author.id,
      commandName,
      args,
      message.guild?.name || 'DM'
    );

    try {
      await command.execute(message, args, client);
    } catch (err) {
      logError(`CMD:${commandName}`, err);
      message.reply('❌ Une erreur est survenue. Elle a été enregistrée dans les logs.').catch(() => {});
    }
  },
};
