const database = require('./database');
const User = require('./models/User');
const KeyState = require('./models/KeyState');
const History = require('./models/History');
const ZoneAccess = require('./models/ZoneAccess');
const PushSubscription = require('./models/PushSubscription');

async function initDatabase() {
  await database.connect();

  if (!database.isPostgreSQL()) {
    await User.initializeDefaults();
    return { storage: 'memory' };
  }

  await User.createTable();
  await KeyState.createTable();
  await History.createTable();
  await ZoneAccess.createTable();
  await PushSubscription.createTable();
  await User.addRoleColumn();
  await User.migrateRoles();

  return { storage: 'postgres' };
}

module.exports = {
  initDatabase,
};
