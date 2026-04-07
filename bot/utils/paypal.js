const axios = require('axios');
const config = require('../config');

/**
 * Récupère un token d'accès PayPal (OAuth2 Client Credentials)
 */
async function getAccessToken() {
  const credentials = Buffer.from(
    `${config.paypal.clientId}:${config.paypal.clientSecret}`
  ).toString('base64');

  try {
    const response = await axios.post(
      `${config.paypal.baseUrl}/v1/oauth2/token`,
      'grant_type=client_credentials',
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
      }
    );
    return response.data.access_token;
  } catch (err) {
    // Donne un message d'erreur clair selon le code HTTP
    if (err.response) {
      const status = err.response.status;
      const data = err.response.data;
      if (status === 401) {
        throw new Error(
          `Identifiants PayPal invalides (401).\n` +
          `Vérifie que tu as bien copié le **Client ID** et le **Secret** depuis\n` +
          `developer.paypal.com → Apps & Credentials → Sandbox.\n` +
          `Détail: ${JSON.stringify(data)}`
        );
      }
      throw new Error(`PayPal auth erreur ${status}: ${JSON.stringify(data)}`);
    }
    throw new Error(`PayPal injoignable: ${err.message}`);
  }
}

/**
 * Crée une commande PayPal
 * @returns {{ orderId, approvalUrl }}
 */
async function createOrder(amountEur, coins, discordId) {
  const token = await getAccessToken();

  try {
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
            description: `Achat de ${coins} coins — Discord: ${discordId}`,
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

    if (!approvalUrl) {
      throw new Error('Aucun lien d\'approbation reçu de PayPal.');
    }

    return { orderId: order.id, approvalUrl };
  } catch (err) {
    if (err.response) {
      const data = err.response.data;
      throw new Error(`PayPal createOrder erreur ${err.response.status}: ${JSON.stringify(data)}`);
    }
    throw err;
  }
}

/**
 * Capture (finalise) un paiement PayPal après approbation
 */
async function captureOrder(orderId) {
  const token = await getAccessToken();

  try {
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
  } catch (err) {
    if (err.response) {
      const data = err.response.data;
      throw new Error(`PayPal capture erreur ${err.response.status}: ${JSON.stringify(data)}`);
    }
    throw err;
  }
}

/**
 * Vérifie le statut d'une commande PayPal
 */
async function getOrderStatus(orderId) {
  const token = await getAccessToken();
  const response = await axios.get(
    `${config.paypal.baseUrl}/v2/checkout/orders/${orderId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
}

module.exports = { createOrder, captureOrder, getOrderStatus };
