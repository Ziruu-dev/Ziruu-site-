const axios = require('axios');
const config = require('../config');

// ============================================================
// CLIENT PAYPAL SANDBOX
// ============================================================

/**
 * Récupère un token d'accès PayPal (OAuth2)
 */
async function getAccessToken() {
  const credentials = Buffer.from(
    `${config.paypal.clientId}:${config.paypal.clientSecret}`
  ).toString('base64');

  const response = await axios.post(
    `${config.paypal.baseUrl}/v1/oauth2/token`,
    'grant_type=client_credentials',
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  return response.data.access_token;
}

/**
 * Crée une commande PayPal pour acheter des coins
 * @param {number} amountEur  - Montant en euros
 * @param {number} coins      - Nombre de coins à accorder
 * @param {string} discordId  - ID Discord de l'acheteur
 * @returns {object} { orderId, approvalUrl }
 */
async function createOrder(amountEur, coins, discordId) {
  const token = await getAccessToken();

  const response = await axios.post(
    `${config.paypal.baseUrl}/v2/checkout/orders`,
    {
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: {
            currency_code: 'EUR',
            value: amountEur.toFixed(2),
          },
          description: `Achat de ${coins} coins - Discord: ${discordId}`,
          custom_id: discordId,
        },
      ],
      application_context: {
        brand_name: 'Ziruu Bot',
        user_action: 'PAY_NOW',
        return_url: 'https://example.com/paypal/success',
        cancel_url: 'https://example.com/paypal/cancel',
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const order = response.data;
  const approvalUrl = order.links.find((l) => l.rel === 'approve')?.href;

  return {
    orderId: order.id,
    approvalUrl,
  };
}

/**
 * Capture (finalise) un paiement PayPal après approbation
 * @param {string} orderId - ID de la commande PayPal
 * @returns {object} données de la commande capturée
 */
async function captureOrder(orderId) {
  const token = await getAccessToken();

  const response = await axios.post(
    `${config.paypal.baseUrl}/v2/checkout/orders/${orderId}/capture`,
    {},
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data;
}

/**
 * Vérifie le statut d'une commande PayPal
 * @param {string} orderId
 */
async function getOrderStatus(orderId) {
  const token = await getAccessToken();

  const response = await axios.get(
    `${config.paypal.baseUrl}/v2/checkout/orders/${orderId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  return response.data;
}

module.exports = { createOrder, captureOrder, getOrderStatus };
