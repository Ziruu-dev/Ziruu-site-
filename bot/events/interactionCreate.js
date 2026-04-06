module.exports = {
  name: 'interactionCreate',

  async execute(interaction, client) {
    // Gère les soumissions de modals (formulaires)
    if (interaction.isModalSubmit()) {
      const handler = client.modalHandlers.get(interaction.customId);
      if (handler) {
        try {
          await handler(interaction, client);
        } catch (err) {
          console.error('[MODAL] Erreur:', err);
          interaction.reply({ content: '❌ Erreur lors du traitement du formulaire.', ephemeral: true }).catch(() => {});
        }
      }
      return;
    }

    // Gère les boutons
    if (interaction.isButton()) {
      const handler = client.buttonHandlers.get(interaction.customId);
      if (handler) {
        try {
          await handler(interaction, client);
        } catch (err) {
          console.error('[BUTTON] Erreur:', err);
          interaction.reply({ content: '❌ Erreur.', ephemeral: true }).catch(() => {});
        }
      }
      return;
    }

    // Gère les menus déroulants (StringSelectMenu)
    if (interaction.isStringSelectMenu()) {
      const handler = client.selectHandlers.get(interaction.customId);
      if (handler) {
        try {
          await handler(interaction, client);
        } catch (err) {
          console.error('[SELECT] Erreur:', err);
          interaction.reply({ content: '❌ Erreur.', ephemeral: true }).catch(() => {});
        }
      }
    }
  },
};
