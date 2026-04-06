require('dotenv').config();

module.exports = {
  // Discord
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  guildId: process.env.GUILD_ID,

  // Rôles
  staffRoleId: process.env.STAFF_ROLE_ID,
  adminRoleId: process.env.ADMIN_ROLE_ID,

  // Canaux
  logChannelId: process.env.LOG_CHANNEL_ID,
  paymentLogChannelId: process.env.PAYMENT_LOG_CHANNEL_ID,

  // PayPal
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET,
    mode: process.env.PAYPAL_MODE || 'sandbox',
    baseUrl:
      process.env.PAYPAL_MODE === 'live'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com',
  },

  // Économie
  coinsPerInvite: parseInt(process.env.COINS_PER_INVITE) || 1,
  searchCost: parseInt(process.env.SEARCH_COST) || 5,
  coinsPriceEur: parseFloat(process.env.COINS_PRICE_EUR) || 1.0,

  // Anti-abus
  minAccountAgeDays: parseInt(process.env.MIN_ACCOUNT_AGE_DAYS) || 7,
  rejoinCooldownHours: parseInt(process.env.REJOIN_COOLDOWN_HOURS) || 48,
  maxInvitesPerDay: parseInt(process.env.MAX_INVITES_PER_DAY) || 10,

  // Préfixe des commandes (pour les commandes texte comme +look)
  prefix: '+',
};
