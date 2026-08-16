const http = require('http');
const fs = require('fs');
const path = require('path');
const database = require('./db/database');
const { initDatabase } = require('./db/init');
const { authenticate, checkRole } = require('./middleware/auth');
const { handleLogin, handleWhoami, handleTryAutoLogin } = require('./routes/auth');
const { handleGetState, handleTakeKeys, handleReturnKeys, handleSetComment, handleGetHistory } = require('./routes/keys');
const { handleGetUsers, handleAddUser, handleUpdateUser, handleDeleteUser, handleChangePassword } = require('./routes/users');
const { handleGetZoneAccess, handleGetZoneAccessFull, handleReplaceZoneAccess } = require('./routes/zoneAccess');
const { handleParseVoice } = require('./routes/voice');
const { handleSubscribe, handleUnsubscribe, handleGetVapidKey, handleTestPush } = require('./routes/push');
const PushService = require('./services/PushService');
const botdataRoutes = require('./routes/botdata');
const zoneAddressRoutes = require('./routes/zoneAddresses');
const KeyService = require('./services/KeyService');
const { getPathname, requireAuth, requireRole, sendJson, withErrorHandling } = require('./utils/http');

const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const APP_VERSION = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'dev';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const sseClients = new Set();
let sseInterval = null;
let startedServer = null;

async function sendSSEUpdate() {
  if (sseClients.size === 0) {
    return;
  }

  const state = await KeyService.getState();
  const zones = getDefaultZones();
  const data = JSON.stringify({ zones, state });

  sseClients.forEach((client) => {
    try {
      client.write(`data: ${data}\n\n`);
    } catch (error) {
      sseClients.delete(client);
    }
  });
}

function getDefaultZones() {
  const dataFile = path.join(ROOT, '../data.json');
  if (fs.existsSync(dataFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      if (Array.isArray(data.zones)) {
        return data.zones;
      }
    } catch (error) {
      console.error('Error loading zones:', error);
    }
  }

  return [];
}

function serveStaticFile(req, res) {
  let filePath = req.url === '/' ? 'index.html' : req.url;
  filePath = path.join(ROOT, '../public', path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, ''));

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
}

function createServer() {
  return http.createServer(async (req, res) => {
    const pathname = getPathname(req);

    if (!pathname.startsWith('/api/')) {
      if (pathname === '/health') {
        sendJson(res, 200, {
          ok: true,
          status: 'healthy',
          version: APP_VERSION,
          database: database.isPostgreSQL() ? (database.isConnected ? 'connected' : 'disconnected') : 'memory',
        });
        return;
      }

      serveStaticFile(req, res);
      return;
    }

    const method = req.method || 'GET';
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const route = matchRoute(pathname, method);
    if (!route) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    return route(req, res);
  });
}

function matchRoute(pathname, method) {
  const routes = {
    'POST /api/login': withErrorHandling(handleLogin),
    'POST /api/try-auto-login': withErrorHandling(handleTryAutoLogin),
    'GET /api/whoami': withErrorHandling(requireAuth(authenticate, handleWhoami)),
    'GET /api/state': withErrorHandling(requireAuth(authenticate, handleGetState)),
    'POST /api/take': withErrorHandling(requireAuth(authenticate, handleTakeKeys)),
    'POST /api/return': withErrorHandling(requireAuth(authenticate, handleReturnKeys)),
    'POST /api/comment': withErrorHandling(requireRole(checkRole, ['ADMIN'], handleSetComment)),
    'GET /api/history': withErrorHandling(requireAuth(authenticate, handleGetHistory)),
    'GET /api/people': withErrorHandling(requireAuth(authenticate, handleGetUsers)),
    'POST /api/people/add': withErrorHandling(requireRole(checkRole, ['ADMIN'], handleAddUser)),
    'POST /api/people/update': withErrorHandling(requireRole(checkRole, ['ADMIN'], handleUpdateUser)),
    'POST /api/people/delete': withErrorHandling(requireRole(checkRole, ['ADMIN'], handleDeleteUser)),
    'POST /api/change-password': withErrorHandling(requireRole(checkRole, ['ADMIN'], handleChangePassword)),
    'GET /api/zone-access': withErrorHandling(requireAuth(authenticate, handleGetZoneAccess)),
    'GET /api/zone-access/full': withErrorHandling(requireAuth(authenticate, handleGetZoneAccessFull)),
    'PUT /api/zone-access': withErrorHandling(requireRole(checkRole, ['ADMIN'], handleReplaceZoneAccess)),
    'POST /api/voice/parse': withErrorHandling(requireAuth(authenticate, handleParseVoice)),
    'GET /api/botdata/stats': withErrorHandling(requireAuth(authenticate, botdataRoutes)),
    'GET /api/botdata/keys': withErrorHandling(requireAuth(authenticate, botdataRoutes)),
    'GET /api/botdata/keys/zone/:zone': withErrorHandling(requireAuth(authenticate, botdataRoutes)),
    'GET /api/botdata/houses': withErrorHandling(requireAuth(authenticate, botdataRoutes)),
    'GET /api/botdata/houses/zone/:zone': withErrorHandling(requireAuth(authenticate, botdataRoutes)),
    'GET /api/botdata/houses/search': withErrorHandling(requireAuth(authenticate, botdataRoutes)),
    'GET /api/botdata/equipments': withErrorHandling(requireAuth(authenticate, botdataRoutes)),
    'GET /api/botdata/equipments/house/:houseId': withErrorHandling(requireAuth(authenticate, botdataRoutes)),
    'POST /api/botdata/import': withErrorHandling(requireRole(checkRole, ['ADMIN'], botdataRoutes)),
    'GET /api/push/vapid-key': withErrorHandling(handleGetVapidKey),
    'POST /api/push/subscribe': withErrorHandling(requireAuth(authenticate, handleSubscribe)),
    'POST /api/push/unsubscribe': withErrorHandling(requireAuth(authenticate, handleUnsubscribe)),
    'POST /api/push/test': withErrorHandling(requireAuth(authenticate, handleTestPush)),
  };

  const routeKey = `${method} ${pathname}`;
  if (routes[routeKey]) {
    return routes[routeKey];
  }

  // Handle botdata routes with query parameters
  if (pathname.startsWith('/api/botdata/') && method === 'GET') {
    return withErrorHandling(requireAuth(authenticate, botdataRoutes));
  }
  if (pathname.startsWith('/api/botdata/') && method === 'POST') {
    return withErrorHandling(requireRole(checkRole, ['ADMIN'], botdataRoutes));
  }

  if (pathname.startsWith('/api/zone-access') && method === 'GET') {
    return withErrorHandling(requireAuth(authenticate, pathname === '/api/zone-access/full' ? handleGetZoneAccessFull : handleGetZoneAccess));
  }

  // Handle zone address routes
  if (pathname.startsWith('/api/zones/') && method === 'GET') {
    return withErrorHandling(zoneAddressRoutes);
  }
  if (pathname.startsWith('/api/search/') && method === 'GET') {
    return withErrorHandling(zoneAddressRoutes);
  }

  if (pathname === '/api/events' && method === 'GET') {
    return withErrorHandling(handleEvents);
  }

  return null;
}

async function handleEvents(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  res.write(': connected\n\n');
  sseClients.add(res);
  try {
    await sendSSEUpdate();
  } catch (error) {
    console.error('Initial SSE update error:', error);
  }

  const pingInterval = setInterval(() => {
    res.write(': ping\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(pingInterval);
    sseClients.delete(res);
  });
}

async function startServer(port = DEFAULT_PORT) {
  await initDatabase();

  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', resolve);
  });

  sseInterval = setInterval(() => {
    sendSSEUpdate().catch((error) => {
      console.error('SSE update error:', error);
    });
  }, 5000);

  // Schedule push notification check at 21:00 every day
  const scheduleEveningReminder = () => {
    const now = new Date();
    const target = new Date(now);
    target.setHours(21, 0, 0, 0);
    if (target <= now) {
      target.setDate(target.getDate() + 1);
    }
    const delay = target.getTime() - now.getTime();
    console.log(`[Push] Evening reminder scheduled at ${target.toLocaleString()}`);

    setTimeout(async () => {
      try {
        console.log('[Push] Evening reminder: checking unreturned keys...');
        const results = await PushService.notifyUsersWithUnreturnedKeys();
        console.log(`[Push] Reminded ${results.length} users`);
      } catch (err) {
        console.error('[Push] Evening reminder error:', err);
      }
      scheduleEveningReminder();
    }, delay);
  };
  scheduleEveningReminder();

  startedServer = server;
  return server;
}

async function stopServer(server = startedServer) {
  if (sseInterval) {
    clearInterval(sseInterval);
    sseInterval = null;
  }

  sseClients.clear();

  if (server && server.listening) {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  await database.end();
  startedServer = null;
}

function registerShutdownSignal(signal) {
  process.on(signal, () => {
    stopServer().then(() => {
      process.exit(0);
    }).catch((error) => {
      console.error('Error during shutdown:', error);
      process.exit(1);
    });
  });
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

registerShutdownSignal('SIGTERM');
registerShutdownSignal('SIGINT');

if (require.main === module) {
  startServer().then((server) => {
    const address = server.address();
    console.log(`Server running on port ${address.port}`);
    console.log(`App version: ${APP_VERSION}`);
  }).catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = {
  createServer,
  startServer,
  stopServer
};
