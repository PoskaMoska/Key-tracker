const { parseJsonBody, sendJson } = require('../utils/http');
const PushService = require('../services/PushService');

async function handleSubscribe(req, res, user) {
  const body = await parseJsonBody(req);
  const { subscription } = body;

  if (!subscription || !subscription.endpoint || !subscription.keys) {
    sendJson(res, 400, { error: 'Invalid subscription object' });
    return;
  }

  await PushService.subscribe(user.id, subscription);
  sendJson(res, 200, { ok: true });
}

async function handleUnsubscribe(req, res, user) {
  const body = await parseJsonBody(req);
  const { endpoint } = body;

  if (!endpoint) {
    sendJson(res, 400, { error: 'Missing endpoint' });
    return;
  }

  await PushService.unsubscribe(endpoint);
  sendJson(res, 200, { ok: true });
}

async function handleGetVapidKey(req, res) {
  sendJson(res, 200, { publicKey: PushService.getVapidPublicKey() });
}

async function handleTestPush(req, res, user) {
  const results = await PushService.sendToUser(
    user.id,
    'Тестовое уведомление',
    'Если вы это видите — push-уведомления работают!'
  );
  sendJson(res, 200, { results });
}

module.exports = {
  handleSubscribe,
  handleUnsubscribe,
  handleGetVapidKey,
  handleTestPush,
};
