// Alias : +coins redirige vers +balance
const balance = require('./balance');

module.exports = {
  ...balance,
  name: 'coins', // gardé pour compatibilité
};
