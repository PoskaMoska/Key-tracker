const http = require('http');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

let PORT = process.env.PORT || 3000;
const ROOT = __dirname;

// JWT secret from environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'keytracker-jwt-secret-2024';

// PostgreSQL connection
const { Pool } = require('pg');

let pool = null;

console.log('Starting server...');

// Check for PostgreSQL connection string
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
console.log('DATABASE_URL:', DATABASE_URL ? 'set' : 'not set');
console.log('POSTGRES_URL:', process.env.POSTGRES_URL ? 'set' : 'not set');

if (DATABASE_URL) {
  console.log('Using PostgreSQL database');
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
} else {
  console.log('No DATABASE_URL found, using in-memory storage');
  // Fallback to in-memory storage - users will be created in initDatabase
  var memoryData = {
    zones: [],
    state: {},
    people: [],
    history: []
  };
  var memoryId = { people: 3, history: 1 };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

// ----------------- Database Functions -----------------

// Load data from file
function loadDataFromFile() {
  const dataFile = path.join(ROOT, 'server-data.json');
  if (fs.existsSync(dataFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      if (data.state && data.people && data.history && data.id) {
        memoryData.state = data.state || {};
        memoryData.people = data.people || [];
        memoryData.history = data.history || [];
        memoryId.people = data.id.people || 3;
        memoryId.history = data.id.history || 1;
        console.log('Data loaded from file');
        return true;
      }
    } catch (e) {
      console.error('Error loading data from file:', e);
    }
  }
  return false;
}

// Save data to file
function saveDataToFile() {
  const dataFile = path.join(ROOT, 'server-data.json');
  const data = {
    state: memoryData.state,
    people: memoryData.people,
    history: memoryData.history,
    id: memoryId
  };
  try {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    console.log('Data saved to file');
  } catch (e) {
    console.error('Error saving data to file:', e);
  }
}

// Schedule periodic saves
function scheduleDataSave() {
  setInterval(() => {
    saveDataToFile();
  }, 5000); // Save every 5 seconds
}

async function initDatabase() {
  if (!pool) {
    console.log('Using in-memory storage');
    // Try to load existing data first
    const loaded = loadDataFromFile();
    
    if (!loaded) {
      // Create default users with hashed passwords for in-memory storage
      const adminHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
      const userHash = await bcrypt.hash(process.env.USER_PASSWORD || 'user123', 10);
      memoryData.people = [
        { id: 1, name: 'Администратор', phone: '+380501234567', isAdmin: true, passwordHash: adminHash }
      ];
      console.log('Default in-memory users created with hashed passwords');
    }
    
    // Start periodic saving
    scheduleDataSave();
    return;
  }
  
  try {
    // Create tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS state (
        bundle_id TEXT PRIMARY KEY,
        person_name TEXT,
        taken_at BIGINT,
        comment TEXT DEFAULT ''
      )
    `);
    console.log('State table created');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS people (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        phone TEXT DEFAULT '',
        is_admin BOOLEAN DEFAULT FALSE,
        role VARCHAR(20) DEFAULT 'USER',
        password_hash TEXT NOT NULL DEFAULT '',
        plain_password TEXT DEFAULT ''
      )
    `);
    console.log('People table created');
    
    // Check if role column exists, if not - add it
    const roleColumnCheck = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'people' AND column_name = 'role'
    `);
    
    if (roleColumnCheck.rows.length === 0) {
      console.log('Adding role column to people table...');
      await pool.query('ALTER TABLE people ADD COLUMN role VARCHAR(20) DEFAULT \'USER\'');
      console.log('Role column added');
    }
    
    // Migrate existing is_admin values to role column
    await pool.query(`
      UPDATE people SET role = 'ADMIN' WHERE is_admin = true AND role IS NULL
    `);
    await pool.query(`
      UPDATE people SET role = 'USER' WHERE is_admin = false AND role IS NULL
    `);
    await pool.query(`
      UPDATE people SET role = 'USER' WHERE role IS NULL
    `);
    console.log('Role column migration completed');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS history (
        id SERIAL PRIMARY KEY,
        bundle_id TEXT NOT NULL,
        person_name TEXT,
        action TEXT NOT NULL,
        timestamp BIGINT NOT NULL
      )
    `);
    
    console.log('Database ready');
  } catch (e) {
    console.error('Failed to initialize database:', e);
    throw e;
  }
}

// Helper function to run queries
async function dbQuery(query, params = []) {
  if (pool) {
    const result = await pool.query(query, params);
    return result;
  } else {
    // In-memory fallback
    return { rows: [], rowCount: 0 };
  }
}

// State functions
function getState() {
  if (!pool) return memoryData.state;
  // Will be populated from DB
  return null;
}

async function getStateFromDB() {
  if (!pool) return memoryData.state;
  
  try {
    const result = await pool.query('SELECT * FROM state');
    const state = {};
    for (const row of result.rows) {
      state[row.bundle_id] = {
        personName: row.person_name,
        takenAt: row.taken_at ? Number(row.taken_at) : null,
        comment: row.comment
      };
    }
    return state;
  } catch (e) {
    console.error('Error getting state:', e);
    return {};
  }
}

async function setStateInDB(bundleId, data) {
  if (!pool) {
    memoryData.state[bundleId] = data;
    return;
  }
  
  try {
    await pool.query(
      `INSERT INTO state (bundle_id, person_name, taken_at, comment) 
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (bundle_id) DO UPDATE SET 
       person_name = EXCLUDED.person_name, 
       taken_at = EXCLUDED.taken_at,
       comment = EXCLUDED.comment`,
      [bundleId, data.personName, data.takenAt, data.comment || '']
    );
  } catch (e) {
    console.error('Error setting state:', e);
  }
}

async function deleteStateFromDB(bundleId) {
  if (!pool) {
    delete memoryData.state[bundleId];
    return;
  }
  
  try {
    await pool.query('DELETE FROM state WHERE bundle_id = $1', [bundleId]);
  } catch (e) {
    console.error('Error deleting state:', e);
  }
}

// People functions
async function getPeopleFromDB() {
  if (!pool) return memoryData.people;
  
  try {
    const result = await pool.query('SELECT * FROM people ORDER BY name');
    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      isAdmin: row.is_admin || false,
      passwordHash: row.password_hash
    }));
  } catch (e) {
    console.error('Error getting people:', e);
    return [];
  }
}

// Function to get person by name with password hash (for authentication)
async function getPersonByName(name) {
  if (!pool) {
    return memoryData.people.find(p => p.name === name) || null;
  }
  
  try {
    const result = await pool.query('SELECT * FROM people WHERE name = $1', [name]);
    if (result.rows.length === 0) return null;
    return {
      id: result.rows[0].id,
      name: result.rows[0].name,
      phone: result.rows[0].phone,
      isAdmin: result.rows[0].is_admin || false,
      passwordHash: result.rows[0].password_hash,
      plainPassword: result.rows[0].plain_password
    };
  } catch (e) {
    console.error('Error getting person:', e);
    return null;
  }
}

async function addPersonToDB(name, phone, isAdmin = false, password = null) {
  // Generate a random password if not provided
  let plainPassword = password;
  if (!plainPassword) {
    plainPassword = generateRandomPassword();
  }
  
  console.log('Generated password for', name, ':', plainPassword);
  
  // Hash the password
  const passwordHash = await bcrypt.hash(plainPassword, 10);
  
  if (!pool) {
    const person = { 
      id: memoryId.people++, 
      name, 
      phone, 
      isAdmin,
      passwordHash,
      plainPassword // Store plain password for display
    };
    memoryData.people.push(person);
    console.log('Person added to memory:', name, 'with password:', plainPassword);
    return { ...person, plainPassword }; // Return plain password for display
  }
  
  try {
    const result = await pool.query(
      'INSERT INTO people (name, phone, is_admin, password_hash, plain_password) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, phone || '', isAdmin, passwordHash, plainPassword]
    );
    console.log('Person added to PostgreSQL:', name, isAdmin ? '(admin)' : '', 'with password:', plainPassword);
    return { ...result.rows[0], plainPassword }; // Return plain password for display
  } catch (e) {
    console.error('Error adding person:', e);
    throw e;
  }
}

// Helper function to generate a random password
function generateRandomPassword(length = 8) {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*';
  const all = lowercase + uppercase + numbers + symbols;
  
  let password = '';
  // Ensure at least one character from each category
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];
  
  // Fill the rest
  for (let i = password.length; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

async function updatePersonInDB(id, name, phone, isAdmin) {
  if (!pool) {
    const person = memoryData.people.find(p => p.id === id);
    if (person) {
      person.name = name;
      person.phone = phone;
      person.isAdmin = isAdmin || false;
    }
    return;
  }
  
  try {
    await pool.query(
      'UPDATE people SET name = $1, phone = $2, is_admin = $3 WHERE id = $4',
      [name, phone || '', isAdmin || false, id]
    );
  } catch (e) {
    console.error('Error updating person:', e);
    throw e;
  }
}

async function deletePersonFromDB(id) {
  if (!pool) {
    memoryData.people = memoryData.people.filter(p => p.id !== id);
    return;
  }
  
  try {
    await pool.query('DELETE FROM people WHERE id = $1', [id]);
  } catch (e) {
    console.error('Error deleting person:', e);
    throw e;
  }
}

// History functions
async function getHistoryFromDB() {
  if (!pool) return memoryData.history;
  
  try {
    const result = await pool.query('SELECT * FROM history ORDER BY timestamp DESC LIMIT 100');
    return result.rows.map(row => ({
      id: row.id,
      bundleId: row.bundle_id,
      personName: row.person_name,
      action: row.action,
      timestamp: Number(row.timestamp)
    }));
  } catch (e) {
    console.error('Error getting history:', e);
    return [];
  }
}

async function addHistoryToDB(bundleId, personName, action) {
  if (!pool) {
    const entry = { id: memoryId.history++, bundleId, personName, action, timestamp: Date.now() };
    memoryData.history.push(entry);
    return;
  }
  
  try {
    await pool.query(
      'INSERT INTO history (bundle_id, person_name, action, timestamp) VALUES ($1, $2, $3, $4)',
      [bundleId, personName, action, Date.now()]
    );
  } catch (e) {
    console.error('Error adding history:', e);
  }
}

// Zones are loaded from data.json
function getDefaultZones() {
  const dataFile = path.join(ROOT, 'data.json');
  if (fs.existsSync(dataFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      if (data.zones && Array.isArray(data.zones)) {
        return data.zones;
      }
    } catch (e) {
      console.error('Error loading zones:', e);
    }
  }
  return [];
}

function getZones() {
  return getDefaultZones();
}

// ----------------- JWT Middleware -----------------

// Extract JWT token from Authorization header
function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

// Verify JWT token and return decoded payload
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

// Middleware to check JWT authentication
function authenticate(req, res) {
  const token = extractToken(req);
  if (!token) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Authentication required' }));
    return null;
  }
  
  const decoded = verifyToken(token);
  if (!decoded) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Invalid or expired token' }));
    return null;
  }
  
  return decoded;
}

// Middleware to check user role
function checkRole(allowedRoles) {
  return (req, res) => {
    const user = authenticate(req, res);
    if (!user) return null;
    
    if (!allowedRoles.includes(user.role)) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Access denied. Insufficient permissions.' }));
      return null;
    }
    
    return user;
  };
}

// ----------------- HTTP Server -----------------

const server = http.createServer(async (req, res) => {
  console.log('Request:', req.method, req.url);
  if (!pool && !memoryData) {
    res.writeHead(503, { 'Content-Type': 'text/plain' });
    res.end('Database not ready');
    return;
  }

  // API endpoints
  if (req.url.startsWith('/api/')) {
    const method = req.method || 'GET';

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Helper functions
    function sendJson(status, data) {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    }

    async function parseBody(req) {
      return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch (e) {
            reject(e);
          }
        });
        req.on('error', reject);
      });
    }

    // Login endpoint - returns JWT token
    if (req.url === '/api/login' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const { name, password } = body;
        
        if (!name || !String(name).trim()) {
          sendJson(400, { error: 'Name is required' });
          return;
        }
        
        if (!password) {
          sendJson(400, { error: 'Password is required' });
          return;
        }
        
        const trimmedName = String(name).trim();
        
        // Get person by name (includes password hash)
        const person = await getPersonByName(trimmedName);
        
        if (!person) {
          // Debug: Check if user exists with this password
          if (pool) {
            try {
              const debugResult = await pool.query('SELECT name, plain_password FROM people WHERE plain_password = $1', [password]);
              if (debugResult.rows.length > 0) {
                console.log('Found user with matching plain password:', debugResult.rows);
                sendJson(401, { error: 'User not found. Found users with this password: ' + debugResult.rows.map(r => r.name).join(', ') });
                return;
              }
            } catch (debugError) {
              console.error('Debug query failed:', debugError);
            }
          }
          
          sendJson(401, { error: 'User not found' });
          return;
        }
        
        // Check password using bcrypt
        let passwordMatch = false;
        console.log('Password check for', person.name, ':');
        console.log('  Input password:', password);
        console.log('  Stored passwordHash length:', person.passwordHash ? person.passwordHash.length : 0);
        console.log('  Stored plainPassword:', person.plainPassword);
        
        // First try bcrypt comparison
        if (person.passwordHash && person.passwordHash.length > 0) {
          passwordMatch = await bcrypt.compare(password, person.passwordHash);
          console.log('  Bcrypt comparison result:', passwordMatch);
        }
        
        // If bcrypt comparison fails and we have plain_password, try direct comparison
        if (!passwordMatch && person.plainPassword) {
          passwordMatch = (password === person.plainPassword);
          console.log('  Plain password comparison result:', passwordMatch);
        }
        
        if (!passwordMatch) {
          sendJson(401, { error: 'Invalid password' });
          return;
        }
        
        // Create JWT token with user role
        const token = jwt.sign(
          { 
            id: person.id, 
            name: person.name, 
            role: person.isAdmin ? 'ADMIN' : 'USER' 
          },
          JWT_SECRET,
          { expiresIn: '24h' }
        );
        
        sendJson(200, { 
          token, 
          user: { 
            id: person.id, 
            name: person.name, 
            role: person.isAdmin ? 'ADMIN' : 'USER' 
          } 
        });
      } catch (e) {
        console.error('Login error:', e);
        sendJson(500, { error: 'Login failed' });
      }
      return;
    }

    // State endpoint
    if (req.url === '/api/state' && method === 'GET') {
      try {
        const state = await getStateFromDB();
        sendJson(200, { zones: getZones(), state });
      } catch (e) {
        sendJson(500, { error: 'Failed to get state' });
      }
      return;
    }

    // Take keys (anyone can take)
    if (req.url === '/api/take' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const { bundleId, personName } = body;
        
        if (!bundleId || !personName || !String(personName).trim()) {
          sendJson(400, { error: 'Missing bundleId or personName' });
          return;
        }

        await setStateInDB(bundleId, {
          personName: String(personName).trim(),
          takenAt: Date.now(),
          comment: ''
        });
        await addHistoryToDB(bundleId, String(personName).trim(), 'take');
        
        console.log('Keys taken:', bundleId, personName);
        sendJson(200, { ok: true });
      } catch (e) {
        console.error('Take error:', e);
        sendJson(500, { error: 'Failed to take keys' });
      }
      return;
    }

    // Return keys
    if (req.url === '/api/return' && method === 'POST') {
      const user = authenticate(req, res);
      if (!user) return;

      try {
        const body = await parseBody(req);
        const { bundleId } = body;
        
        const state = await getStateFromDB();
        const currentHolder = state[bundleId]?.personName;
        
        // Only the person who took the keys or an admin can return them
        if (currentHolder && currentHolder !== user.name && user.role !== 'ADMIN') {
          sendJson(403, { error: 'Вы не можете вернуть чужие ключи' });
          return;
        }
        
        await deleteStateFromDB(bundleId);
        
        if (currentHolder) {
          await addHistoryToDB(bundleId, currentHolder, 'return');
        }
        
        console.log('Keys returned:', bundleId);
        sendJson(200, { ok: true });
      } catch (e) {
        console.error('Return error:', e);
        sendJson(500, { error: 'Failed to return keys' });
      }
      return;
    }

    // Comment (ADMIN only - can write comments)
    if (req.url === '/api/comment' && method === 'POST') {
      const user = checkRole(['ADMIN'])(req, res);
      if (!user) return;
      
      try {
        const body = await parseBody(req);
        const { bundleId, comment } = body;
        
        const state = await getStateFromDB();
        const existing = state[bundleId];
        
        if (existing) {
          await setStateInDB(bundleId, {
            ...existing,
            comment: comment || ''
          });
        }
        
        sendJson(200, { ok: true });
      } catch (e) {
        sendJson(500, { error: 'Failed to set comment' });
      }
      return;
    }

    // People endpoints
    if (req.url === '/api/people' && method === 'GET') {
      try {
        const people = await getPeopleFromDB();
        sendJson(200, people);
      } catch (e) {
        sendJson(500, { error: 'Failed to get people' });
      }
      return;
    }

    if (req.url === '/api/people/add' && method === 'POST') {
      console.log('Add person request received');
      // Check if user has ADMIN role
      const user = checkRole(['ADMIN'])(req, res);
      if (!user) return;
      
      try {
        const body = await parseBody(req);
        console.log('Request body:', body);
        const trimmedName = String(body.name || '').trim();
        const trimmedPhone = String(body.phone || '').trim();
        const isAdmin = body.isAdmin === true;
        const password = body.password || null;
        
        console.log('Parsed data:', { trimmedName, trimmedPhone, isAdmin, password });
        
        if (!trimmedName) {
          sendJson(400, { error: 'Name is required' });
          return;
        }

        const result = await addPersonToDB(trimmedName, trimmedPhone, isAdmin, password);
        console.log('Person added:', trimmedName);
        sendJson(200, { 
          ok: true, 
          message: `Сотрудник создан. Роль: ${isAdmin ? 'ADMIN' : 'USER'}`
        });
      } catch (e) {
        console.error('Add person error:', e);
        sendJson(500, { error: 'Failed to add person' });
      }
      return;
    }

    if (req.url === '/api/people/update' && method === 'POST') {
      // Check if user has ADMIN role
      const user = checkRole(['ADMIN'])(req, res);
      if (!user) return;
      
      try {
        const body = await parseBody(req);
        const { id, name, phone, isAdmin } = body;
        
        // Non-admin cannot make themselves admin
        const currentUserIsAdmin = user.role === 'ADMIN';
        
        await updatePersonInDB(id, name, phone, isAdmin);
        sendJson(200, { ok: true });
      } catch (e) {
        sendJson(500, { error: 'Failed to update person' });
      }
      return;
    }

    if (req.url === '/api/people/delete' && method === 'POST') {
      // Check if user has ADMIN role
      const user = checkRole(['ADMIN'])(req, res);
      if (!user) return;
      
      try {
        const body = await parseBody(req);
        const { id } = body;
        
        await deletePersonFromDB(id);
        sendJson(200, { ok: true });
      } catch (e) {
        sendJson(500, { error: 'Failed to delete person' });
      }
      return;
    }

    // Get person password endpoint (requires ADMIN role)
    if (req.url.startsWith('/api/people/') && req.url.endsWith('/password') && method === 'GET') {
      // Check if user has ADMIN role
      const user = checkRole(['ADMIN'])(req, res);
      if (!user) return;
      
      try {
        // Extract person ID from URL
        const urlParts = req.url.split('/');
        const personId = parseInt(urlParts[urlParts.length - 2], 10);
        
        if (!personId || isNaN(personId)) {
          sendJson(400, { error: 'Invalid person ID' });
          return;
        }
        
        // Get person from database
        let person = null;
        if (pool) {
          const result = await pool.query('SELECT * FROM people WHERE id = $1', [personId]);
          if (result.rows.length > 0) {
            person = {
              id: result.rows[0].id,
              name: result.rows[0].name,
              phone: result.rows[0].phone,
              isAdmin: result.rows[0].is_admin || false,
              passwordHash: result.rows[0].password_hash,
              plainPassword: result.rows[0].plain_password
            };
          }
        } else {
          person = memoryData.people.find(p => p.id === personId);
        }
        
        if (!person) {
          sendJson(404, { error: 'Person not found' });
          return;
        }
        
        // Return the actual password
        sendJson(200, { 
          password: person.plainPassword || '••••••••'
        });
      } catch (e) {
        console.error('Get password error:', e);
        sendJson(500, { error: 'Failed to get password' });
      }
      return;
    }

    // Change password endpoint (requires ADMIN role)
    if (req.url === '/api/change-password' && method === 'POST') {
      console.log('Change password request received');
      // Check if user has ADMIN role
      const user = checkRole(['ADMIN'])(req, res);
      if (!user) return;
      
      try {
        const body = await parseBody(req);
        const { id, newPassword } = body;
        
        if (!id) {
          sendJson(400, { error: 'User ID is required' });
          return;
        }
        
        if (!newPassword || newPassword.length < 4) {
          sendJson(400, { error: 'Password must be at least 4 characters' });
          return;
        }
        
        // Hash the new password
        const passwordHash = await bcrypt.hash(newPassword, 10);
        
        // Update password in database
        if (pool) {
          await pool.query(
            'UPDATE people SET password_hash = $1 WHERE id = $2',
            [passwordHash, id]
          );
        } else {
          const person = memoryData.people.find(p => p.id === id);
          if (person) person.passwordHash = passwordHash;
        }
        
        console.log('Password changed for user ID:', id);
        sendJson(200, { ok: true, message: 'Пароль изменен' });
      } catch (e) {
        console.error('Change password error:', e);
        sendJson(500, { error: 'Failed to change password' });
      }
      return;
    }

    // Set role endpoint (requires ADMIN role)
    if (req.url === '/api/set-role' && method === 'POST') {
      // Check if user has ADMIN role
      const user = checkRole(['ADMIN'])(req, res);
      if (!user) return;
      
      try {
        const body = await parseBody(req);
        const { name, role } = body;
        
        if (!name) {
          sendJson(400, { error: 'Name is required' });
          return;
        }
        
        if (!role || !['ADMIN', 'USER'].includes(role)) {
          sendJson(400, { error: 'Role must be ADMIN or USER' });
          return;
        }
        
        const isAdmin = role === 'ADMIN';
        
        // Find person and update is_admin
        if (pool) {
          await pool.query(
            'UPDATE people SET is_admin = $1 WHERE name = $2',
            [isAdmin, name]
          );
        } else {
          const person = memoryData.people.find(p => p.name === name);
          if (person) person.isAdmin = isAdmin;
        }
        
        console.log('Role set for:', name, 'to', role);
        sendJson(200, { ok: true, message: name + ' теперь админ' });
      } catch (e) {
        sendJson(500, { error: 'Failed to set admin' });
      }
      return;
    }

    // History endpoint
    if (req.url === '/api/history' && method === 'GET') {
      try {
        const history = await getHistoryFromDB();
        sendJson(200, history);
      } catch (e) {
        sendJson(500, { error: 'Failed to get history' });
      }
      return;
    }

    // SSE Events endpoint for real-time updates
    if (req.url === '/api/events' && method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      // Send initial connection message
      res.write(': connected\n\n');

      // Send current state immediately
      try {
        const state = await getStateFromDB();
        const zones = getZones();
        res.write(`data: ${JSON.stringify({ zones, state })}\n\n`);
      } catch (e) {
        console.error('Error sending SSE initial state:', e);
      }

      // Keep connection alive with periodic pings
      const pingInterval = setInterval(() => {
        res.write(': ping\n\n');
      }, 30000);

      // Clean up when client disconnects
      req.on('close', () => {
        clearInterval(pingInterval);
      });

      return;
    }

    // Whoami endpoint - returns current user info from JWT token
    if (req.url === '/api/whoami' && method === 'GET') {
      const user = authenticate(req, res);
      if (!user) return;
      
      sendJson(200, { 
        id: user.id, 
        name: user.name, 
        role: user.role 
      });
      return;
    }

    sendJson(404, { error: 'Not found' });
    return;
  }

  // Static files
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(ROOT, path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, ''));

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
      }
      res.writeHead(500);
      res.end('Server Error');
      return;
    }

    const ext = path.extname(filePath);
    const contentType = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

// Graceful shutdown for Railway
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  if (pool) {
    pool.end().then(() => {
      console.log('Database connections closed');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    }).catch(err => {
      console.error('Error during shutdown:', err);
      process.exit(1);
    });
  } else {
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  }
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  if (pool) {
    pool.end().then(() => {
      console.log('Database connections closed');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    }).catch(err => {
      console.error('Error during shutdown:', err);
      process.exit(1);
    });
  } else {
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  }
});

// Start server with port fallback
function startServer(port) {
  console.log('Starting server on port:', port);
  initDatabase().then(() => {
    server.listen(port, '0.0.0.0', () => {
      console.log('Server running on port ' + port);
    });
  }).catch(err => {
    console.error('Failed to start:', err);
    process.exit(1);
  });
}

// Handle port in use error
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const newPort = PORT + 1;
    console.log('Port ' + PORT + ' is already in use, trying port ' + newPort);
    startServer(newPort);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});

startServer(PORT);