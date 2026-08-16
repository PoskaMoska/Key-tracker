const database = require('../database');

class PushSubscriptionModel {
  constructor() {
    this.memoryData = new Map();
    this.idCounter = 1;
  }

  async createTable() {
    if (!database.isPostgreSQL()) return;
    await database.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        endpoint TEXT NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
      )
    `);
  }

  async create(subscription) {
    if (database.isPostgreSQL()) {
      const result = await database.query(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [subscription.userId, subscription.endpoint, subscription.p256dh, subscription.auth]
      );
      return result.rows[0];
    }
    const id = this.idCounter++;
    const entry = { id, ...subscription, createdAt: Date.now() };
    this.memoryData.set(id, entry);
    return entry;
  }

  async findByUserId(userId) {
    if (database.isPostgreSQL()) {
      const result = await database.query(
        'SELECT * FROM push_subscriptions WHERE user_id = $1',
        [userId]
      );
      return result.rows;
    }
    return Array.from(this.memoryData.values()).filter((s) => s.userId === userId);
  }

  async findByEndpoint(endpoint) {
    if (database.isPostgreSQL()) {
      const result = await database.query(
        'SELECT * FROM push_subscriptions WHERE endpoint = $1',
        [endpoint]
      );
      return result.rows[0] || null;
    }
    return Array.from(this.memoryData.values()).find((s) => s.endpoint === endpoint) || null;
  }

  async deleteByEndpoint(endpoint) {
    if (database.isPostgreSQL()) {
      await database.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
      return;
    }
    for (const [id, sub] of this.memoryData) {
      if (sub.endpoint === endpoint) { this.memoryData.delete(id); break; }
    }
  }

  async deleteByUserId(userId) {
    if (database.isPostgreSQL()) {
      await database.query('DELETE FROM push_subscriptions WHERE user_id = $1', [userId]);
      return;
    }
    for (const [id, sub] of this.memoryData) {
      if (sub.userId === userId) this.memoryData.delete(id);
    }
  }

  async getAll() {
    if (database.isPostgreSQL()) {
      const result = await database.query('SELECT * FROM push_subscriptions');
      return result.rows;
    }
    return Array.from(this.memoryData.values());
  }
}

module.exports = new PushSubscriptionModel();
