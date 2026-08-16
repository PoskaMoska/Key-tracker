const webpush = require('web-push');
const PushSubscription = require('../db/models/PushSubscription');
const KeyService = require('./KeyService');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BD-h3oEn2TWg0_4yF9tgtnThop8V8AoD-ORiIQNTshB_j7tNqJiDRLyTNcHSMBYuZwDplnEl5awgPt9wjPphjdY';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'Z-FvRFSzs2-zSupR8MlrtmE8a4CBNpXHSs-H3xeCtMU';

webpush.setVapidDetails(
  'mailto:keytracker@example.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

class PushService {
  getVapidPublicKey() {
    return VAPID_PUBLIC_KEY;
  }

  async subscribe(userId, subscription) {
    const existing = await PushSubscription.findByEndpoint(subscription.endpoint);
    if (existing) return existing;

    return await PushSubscription.create({
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    });
  }

  async unsubscribe(endpoint) {
    await PushSubscription.deleteByEndpoint(endpoint);
  }

  async sendToUser(userId, title, body) {
    const subs = await PushSubscription.findByUserId(userId);
    if (!subs.length) return [];

    const results = [];
    for (const sub of subs) {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        }, JSON.stringify({ title, body }));
        results.push({ ok: true, endpoint: sub.endpoint });
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await PushSubscription.deleteByEndpoint(sub.endpoint);
        }
        results.push({ ok: false, endpoint: sub.endpoint, error: err.message });
      }
    }
    return results;
  }

  async sendToAllUsers(title, body) {
    const allSubs = await PushSubscription.getAll();
    const results = [];
    for (const sub of allSubs) {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        }, JSON.stringify({ title, body }));
        results.push({ ok: true, endpoint: sub.endpoint, userId: sub.user_id || sub.userId });
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await PushSubscription.deleteByEndpoint(sub.endpoint);
        }
        results.push({ ok: false, endpoint: sub.endpoint, userId: sub.user_id || sub.userId, error: err.message });
      }
    }
    return results;
  }

  async notifyUsersWithUnreturnedKeys() {
    const state = await KeyService.getState();
    const takenByPerson = new Map();

    Object.entries(state).forEach(([bundleId, data]) => {
      if (data && data.personName) {
        if (!takenByPerson.has(data.personName)) {
          takenByPerson.set(data.personName, []);
        }
        takenByPerson.get(data.personName).push(bundleId);
      }
    });

    if (!takenByPerson.size) return [];

    const UserModel = require('../db/models/User');
    const allUsers = await UserModel.getAll();
    const results = [];

    for (const [personName, bundleIds] of takenByPerson) {
      const user = allUsers.find((u) => u.name === personName);
      if (!user) continue;

      const count = bundleIds.length;
      const bundleList = bundleIds.join(', ');
      const title = 'Нагадування: поверніть ключі!';
      const body = `У вас досі ${count} зв'язк${count === 1 ? 'а' : 'и'} (${bundleList}). Не забудьте повернути до кінця дня.`;

      const sent = await this.sendToUser(user.id, title, body);
      results.push({ personName, bundleIds, sent });
    }

    return results;
  }
}

module.exports = new PushService();
