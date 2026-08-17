const bcrypt = require('bcrypt');
const database = require('../database');

class User {
  constructor() {
    this.memoryUsers = new Map();
    this.nextId = 1;
    this.initialized = false;
    this.tableExistsCache = new Map();
  }

  createDuplicateNameError() {
    const error = new Error('Сотрудник с таким именем уже существует');
    error.statusCode = 409;
    error.exposeMessage = 'Сотрудник с таким именем уже существует';
    return error;
  }

  isDuplicateNameError(error) {
    return error && error.code === '23505' && error.constraint === 'users_name_key';
  }

  async initializeDefaults() {
    if (this.initialized || database.isPostgreSQL()) return;
    
    const bcrypt = require('bcrypt');
    const defaultUsers = [
      { name: 'Администратор', password: 'admin123', isAdmin: true },
    ];

    for (const u of defaultUsers) {
      const id = this.nextId++;
      const passwordHash = await bcrypt.hash(u.password, 10);
      this.memoryUsers.set(id, {
        id,
        name: u.name,
        phone: '',
        isAdmin: u.isAdmin,
        role: u.isAdmin ? 'ADMIN' : 'USER',
        passwordHash: passwordHash,
        loginCount: 0
      });
    }
    this.initialized = true;
  }

  async createTable() {
    if (database.isPostgreSQL()) {
      const query = `
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          phone TEXT,
          password_hash TEXT,
          is_admin BOOLEAN DEFAULT false,
          role TEXT DEFAULT 'USER'
        )
      `;
      await database.query(query);
      await this.ensureColumns();
    }
  }

  async ensureColumns() {
    if (database.isPostgreSQL()) {
      await database.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT');
      await database.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT');
      await database.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false');
      await database.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT \'USER\'');
      await database.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0');
    }
  }

  async tableExists(tableName) {
    if (!database.isPostgreSQL()) return false;
    if (this.tableExistsCache.has(tableName)) {
      return this.tableExistsCache.get(tableName);
    }

    const result = await database.query(
      `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = $1
        ) AS exists
      `,
      [tableName]
    );

    const exists = !!(result.rows[0] && result.rows[0].exists);
    this.tableExistsCache.set(tableName, exists);
    return exists;
  }

  mapUserRow(row) {
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      isAdmin: row.is_admin,
      role: row.role,
      passwordHash: row.password_hash,
      plainPassword: '',
      source: 'users',
      loginCount: row.login_count || 0
    };
  }

  mapLegacyPeopleRow(row) {
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      isAdmin: row.is_admin,
      role: row.role || (row.is_admin ? 'ADMIN' : 'USER'),
      passwordHash: row.password_hash,
      plainPassword: row.plain_password || '',
      source: 'people'
    };
  }

  async findLegacyByUsername(name) {
    if (!(await this.tableExists('people'))) {
      return null;
    }

    const result = await database.query('SELECT * FROM people WHERE name = $1', [name]);
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapLegacyPeopleRow(result.rows[0]);
  }

  async findLegacyById(id) {
    if (!(await this.tableExists('people'))) {
      return null;
    }

    const result = await database.query('SELECT * FROM people WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapLegacyPeopleRow(result.rows[0]);
  }

  async addRoleColumn() {
    await this.ensureColumns();
  }

  async migrateRoles() {
    if (database.isPostgreSQL()) {
      try {
        await database.query('UPDATE users SET role = \'ADMIN\' WHERE is_admin = true');
        await database.query('UPDATE users SET role = \'USER\' WHERE is_admin = false OR is_admin IS NULL');
      } catch (error) {
        console.error('Error migrating roles:', error);
      }
    }
  }

  async create(name, phone, isAdmin = false, password = null) {
    if (!password || String(password).length < 4) {
      throw new Error('Password must be at least 4 characters');
    }

    if (database.isPostgreSQL()) {
      const passwordHash = await bcrypt.hash(password, 10);
      const query = `
        INSERT INTO users (name, phone, password_hash, is_admin, role)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      let result;
      try {
        result = await database.query(query, [
          name, phone, passwordHash, isAdmin, isAdmin ? 'ADMIN' : 'USER'
        ]);
      } catch (error) {
        if (this.isDuplicateNameError(error)) {
          throw this.createDuplicateNameError();
        }
        throw error;
      }
      
      return {
        id: result.rows[0].id,
        name: result.rows[0].name,
        phone: result.rows[0].phone,
        isAdmin: result.rows[0].is_admin,
        role: result.rows[0].role
      };
    } else {
      // In-memory storage
      const existingUser = await this.findByUsername(name);
      if (existingUser) {
        throw this.createDuplicateNameError();
      }

      const id = this.nextId++;
      const user = {
        id,
        name,
        phone,
        isAdmin,
        role: isAdmin ? 'ADMIN' : 'USER'
      };
      
      if (password) {
        user.passwordHash = await bcrypt.hash(password, 10);
      }
      
      this.memoryUsers.set(id, user);
      return user;
    }
  }

  async getAll() {
    if (database.isPostgreSQL()) {
      const usersResult = await database.query('SELECT * FROM users ORDER BY name');
      const merged = usersResult.rows.map((row) => this.mapUserRow(row));
      const seenNames = new Set(merged.map((user) => String(user.name || '').trim().toLowerCase()));

      if (await this.tableExists('people')) {
        const peopleResult = await database.query('SELECT * FROM people ORDER BY name');
        peopleResult.rows.forEach((row) => {
          const mapped = this.mapLegacyPeopleRow(row);
          const key = String(mapped.name || '').trim().toLowerCase();
          if (key && !seenNames.has(key)) {
            merged.push(mapped);
            seenNames.add(key);
          }
        });
      }
      
      return merged.map((user) => ({
        id: user.id,
        name: user.name,
        phone: user.phone,
        isAdmin: user.isAdmin,
        role: user.role
      })).sort((a, b) => a.name.localeCompare(b.name));
    } else {
      // In-memory storage
      return Array.from(this.memoryUsers.values())
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  async update(id, data) {
    const userId = Number(id);

    if (database.isPostgreSQL()) {
      const setClauses = [];
      const params = [];
      let paramIndex = 1;

      if (data.name !== undefined) {
        setClauses.push(`name = $${paramIndex++}`);
        params.push(data.name);
      }
      if (data.phone !== undefined) {
        setClauses.push(`phone = $${paramIndex++}`);
        params.push(data.phone);
      }
      if (data.isAdmin !== undefined) {
        setClauses.push(`is_admin = $${paramIndex++}`);
        params.push(data.isAdmin);
        setClauses.push(`role = $${paramIndex++}`);
        params.push(data.isAdmin ? 'ADMIN' : 'USER');
      }

      if (setClauses.length === 0) {
        throw new Error('No fields to update');
      }

      params.push(userId);
      const query = `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

      let result;
      try {
        result = await database.query(query, params);
      } catch (error) {
        if (this.isDuplicateNameError(error)) {
          throw this.createDuplicateNameError();
        }
        throw error;
      }
      
      if (result.rows.length === 0) {
        throw new Error('User not found');
      }
      
      return {
        id: result.rows[0].id,
        name: result.rows[0].name,
        phone: result.rows[0].phone,
        isAdmin: result.rows[0].is_admin,
        role: result.rows[0].role
      };
    } else {
      // In-memory storage
      const user = this.memoryUsers.get(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const duplicateUser = await this.findByUsername(data.name);
      if (duplicateUser && duplicateUser.id !== userId) {
        throw this.createDuplicateNameError();
      }
      
      user.name = data.name || user.name;
      user.phone = data.phone || user.phone;
      user.isAdmin = data.isAdmin !== undefined ? data.isAdmin : user.isAdmin;
      user.role = user.isAdmin ? 'ADMIN' : 'USER';
      
      return user;
    }
  }

  async delete(id) {
    const userId = Number(id);
    if (database.isPostgreSQL()) {
      const query = 'DELETE FROM users WHERE id = $1';
      await database.query(query, [userId]);
    } else {
      this.memoryUsers.delete(userId);
    }
  }

  async changePassword(id, newPassword) {
    const userId = Number(id);
    if (!newPassword || String(newPassword).length < 4) {
      throw new Error('Password must be at least 4 characters');
    }

    if (database.isPostgreSQL()) {
      const passwordHash = await bcrypt.hash(newPassword, 10);
      const query = 'UPDATE users SET password_hash = $1 WHERE id = $2';
      await database.query(query, [passwordHash, userId]);
    } else {
      const user = this.memoryUsers.get(userId);
      if (user) {
        user.passwordHash = await bcrypt.hash(newPassword, 10);
      }
    }
  }

  async findByUsername(name) {
    // Lazy init if not initialized
    if (!this.initialized && !database.isPostgreSQL()) {
      await this.initializeDefaults();
    }

    if (database.isPostgreSQL()) {
      const query = 'SELECT * FROM users WHERE name = $1';
      const result = await database.query(query, [name]);
      
      if (result.rows.length > 0) {
        return this.mapUserRow(result.rows[0]);
      }

      return this.findLegacyByUsername(name);
    } else {
      // In-memory storage
      const searchName = name.toLowerCase().trim();
      for (const user of this.memoryUsers.values()) {
        const userName = user.name.toLowerCase().trim();
        if (userName === searchName) {
          return user;
        }
      }
      return null;
    }
  }

  async findById(id, preferredSource = '') {
    if (database.isPostgreSQL()) {
      if (preferredSource === 'people') {
        const legacyUser = await this.findLegacyById(id);
        if (legacyUser) {
          return legacyUser;
        }
      }

      const query = 'SELECT * FROM users WHERE id = $1';
      const result = await database.query(query, [id]);
      
      if (result.rows.length > 0) {
        return this.mapUserRow(result.rows[0]);
      }

      return this.findLegacyById(id);
    } else {
      // In-memory storage
      return this.memoryUsers.get(id) || null;
    }
  }

  async incrementLoginCount(id) {
    const userId = Number(id);
    if (database.isPostgreSQL()) {
      const query = 'UPDATE users SET login_count = COALESCE(login_count, 0) + 1 WHERE id = $1 RETURNING login_count';
      const result = await database.query(query, [userId]);
      if (result.rows.length > 0) {
        return result.rows[0].login_count;
      }
      return 0;
    } else {
      const user = this.memoryUsers.get(userId);
      if (user) {
        user.loginCount = (user.loginCount || 0) + 1;
        return user.loginCount;
      }
      return 0;
    }
  }

  async getLoginCount(id) {
    const userId = Number(id);
    if (database.isPostgreSQL()) {
      const query = 'SELECT login_count FROM users WHERE id = $1';
      const result = await database.query(query, [userId]);
      if (result.rows.length > 0) {
        return result.rows[0].login_count || 0;
      }
      return 0;
    } else {
      const user = this.memoryUsers.get(userId);
      return user ? (user.loginCount || 0) : 0;
    }
  }

  async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  static async verifyPasswordStatic(password, hash) {
    return await bcrypt.compare(password, hash);
  }
}

// Export singleton instance
module.exports = new User();
