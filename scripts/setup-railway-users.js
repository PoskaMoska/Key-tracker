const bcrypt = require('bcrypt');
const database = require('../src/db/database');
const { initDatabase } = require('../src/db/init');

const DEFAULT_USERS = [
  {
    name: 'Администратор',
    phone: '+380501234567',
    password: process.env.ADMIN_PASSWORD || 'admin123',
    isAdmin: true,
  },
  {
    name: 'Пользователь',
    phone: '',
    password: process.env.USER_PASSWORD || 'user123',
    isAdmin: false,
  },
];

async function upsertUser(user) {
  const passwordHash = await bcrypt.hash(user.password, 10);
  const role = user.isAdmin ? 'ADMIN' : 'USER';

  const result = await database.query(
    `
      INSERT INTO users (name, phone, password_hash, is_admin, role)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (name) DO UPDATE SET
        phone = EXCLUDED.phone,
        password_hash = EXCLUDED.password_hash,
        is_admin = EXCLUDED.is_admin,
        role = EXCLUDED.role
      RETURNING id, name, phone, is_admin, role
    `,
    [user.name, user.phone, passwordHash, user.isAdmin, role]
  );

  return result.rows[0];
}

async function main() {
  try {
    const result = await initDatabase();

    if (result.storage !== 'postgres') {
      throw new Error('DATABASE_URL or POSTGRES_URL is not set');
    }

    // Check if there are any users already
    const countRes = await database.query('SELECT COUNT(*) FROM users');
    const userCount = parseInt(countRes.rows[0].count, 10);
    
    if (userCount > 0) {
      console.log('Users already exist in the database. Skipping default users setup to prevent recreating deleted users.');
      return;
    }

    console.log('Setting up Railway users...');

    for (const user of DEFAULT_USERS) {
      const saved = await upsertUser(user);
      console.log(`Upserted ${saved.name} (${saved.role})`);
    }

    console.log('Railway setup complete.');
    console.log(`Admin: ${DEFAULT_USERS[0].name} / ${DEFAULT_USERS[0].password}`);
    console.log(`User: ${DEFAULT_USERS[1].name} / ${DEFAULT_USERS[1].password}`);
    console.log('Zone access data will be stored in PostgreSQL table zone_access.');
  } catch (error) {
    console.error('Railway setup failed:', error);
    process.exitCode = 1;
  } finally {
    await database.end();
  }
}

main();
