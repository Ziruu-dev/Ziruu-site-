require('dotenv').config();

module.exports = {
  // Discord
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  guildId: process.env.GUILD_ID,

  // Propriétaire du bot (seul à pouvoir utiliser +pay)
  ownerId: process.env.OWNER_ID,

  // Rôles
  staffRoleId: process.env.STAFF_ROLE_ID,
  adminRoleId: process.env.ADMIN_ROLE_ID,
  giveRoleId: process.env.GIVE_ROLE_ID, // Rôle autorisé à utiliser +give / +allgive

  // Canaux
  logChannelId: process.env.LOG_CHANNEL_ID,
  paymentLogChannelId: process.env.PAYMENT_LOG_CHANNEL_ID,
  payChannelId: process.env.PAY_CHANNEL_ID, // Salon où +pay poste l'embed de paiement

  // PayPal
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET,
    mode: process.env.PAYPAL_MODE || 'sandbox',
    baseUrl:
      process.env.PAYPAL_MODE === 'live'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com',
    meUrl: process.env.PAYPAL_ME_URL || 'https://paypal.me/tonlien', // Lien PayPal.me
  },

  // Crypto
  cryptoAddress: process.env.CRYPTO_ADDRESS || 'Ton adresse crypto ici',
  cryptoType: process.env.CRYPTO_TYPE || 'USDT (TRC20)',

  // Économie
  coinsPerInvite: parseInt(process.env.COINS_PER_INVITE) || 1,
  coinsPerEur: parseInt(process.env.COINS_PER_EUR) || 10,   // 1€ = 10 coins
  searchCost: parseInt(process.env.SEARCH_COST) || 1,        // +look coûte 1 coin
  welcomeCoins: parseInt(process.env.WELCOME_COINS) || 1,    // 1 coin à la 1ère arrivée

  // Anti-abus
  minAccountAgeDays: parseInt(process.env.MIN_ACCOUNT_AGE_DAYS) || 7,
  rejoinCooldownHours: parseInt(process.env.REJOIN_COOLDOWN_HOURS) || 48,
  maxInvitesPerDay: parseInt(process.env.MAX_INVITES_PER_DAY) || 10,

  // Préfixe
  prefix: '+',
};
