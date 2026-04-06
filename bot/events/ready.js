const { ActivityType } = require('discord.js');

module.exports = {
  name: 'ready',
  once: true,

  async execute(client) {
    console.log(`[BOT] Connecté en tant que ${client.user.tag}`);

    // Met à jour le cache des invitations au démarrage
    for (const [, guild] of client.guilds.cache) {
      try {
        const invites = await guild.invites.fetch();
        client.inviteCache.set(guild.id, new Map(invites.map((i) => [i.code, i.uses])));
        console.log(`[INVITES] Cache chargé pour ${guild.name} (${invites.size} invitations)`);
      } catch (err) {
        console.warn(`[INVITES] Impossible de charger les invitations pour ${guild.name}:`, err.message);
      }
    }

    // Statut du bot
    client.user.setPresence({
      activities: [{ name: '+look | Système de coins', type: ActivityType.Watching }],
      status: 'online',
    });
  },
};
