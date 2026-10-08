'use strict';

require('dotenv').config({ quiet: true });

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const compression = require('compression');

const { Store, FileAdapter, MongoAdapter } = require('./src/store');
const { createApi } = require('./src/api');
const { WhatsAppService } = require('./src/whatsapp');
const { hashPassword } = require('./src/auth');
const { importLegacy, combineLegacySources } = require('./src/legacy');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DEFAULT_SCHOOL = {
  name: 'Glorious Public School',
  address: 'Affiliated to State Board | Himatnagar, Gujarat - 383001 | Contact: gloriouspschool2009@gmail.com',
  publicUrl: ''
};
// Office password used only until it is changed on first sign-in (unless ADMIN_PASSWORD is set).
const FIRST_RUN_ADMIN_PASSWORD = 'gps369';

function readConfig(env = process.env) {
  const dataDir = path.resolve(env.DATA_DIR || path.join(ROOT, 'data'));
  return {
    port: Number(env.PORT) || 5001,
    dataDir,
    mongoUri: env.MONGODB_URI_EM || env.MONGODB_URI || readSavedMongoUri(dataDir),
    mongoDb: env.MONGODB_DB || 'gps_english_medium',
    adminPassword: env.ADMIN_PASSWORD || '',
    sessionSecret: env.SESSION_SECRET || '',
    whatsappDisabled: env.WHATSAPP_DISABLED === '1'
  };
}

// The previous version saved the connection string in mongodb_config.json.
function readSavedMongoUri(dataDir) {
  for (const file of [path.join(dataDir, 'mongodb_config.json'), path.join(ROOT, 'mongodb_config.json')]) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed && typeof parsed.uri === 'string' && parsed.uri.startsWith('mongodb')) return parsed.uri;
    } catch {
      // not there
    }
  }
  return null;
}

async function ensureSettings(store, config) {
  let s = store.settings;
  let changed = false;
  if (!s) {
    s = { id: 'main', schemaVersion: 2 };
    changed = true;
  }
  if (!s.tokenSecret) {
    s.tokenSecret = crypto.randomBytes(32).toString('base64url');
    changed = true;
  }
  if (!s.admin) {
    const { salt, hash } = hashPassword(config.adminPassword || FIRST_RUN_ADMIN_PASSWORD);
    s.admin = { salt, hash, tokenVersion: 1, mustChange: !config.adminPassword };
    changed = true;
  }
  if (!s.school) {
    s.school = { ...DEFAULT_SCHOOL };
    changed = true;
  }
  store.settings = s;
  if (changed) await store.saveSettings();
}

// One-time copy of the data saved by the previous version of the app.
async function migrateLegacy(store) {
  if (store.settings.legacyMigratedAt) return;
  const legacy = await store.adapter.loadLegacy();
  if (legacy) {
    const counts = await importLegacy(store, combineLegacySources(legacy), { includeTeachers: true, actor: 'migration' });
    console.log('Copied data from the previous version of the app:', counts);
    store.settings.legacyMigration = counts;
  }
  store.settings.legacyMigratedAt = new Date().toISOString();
  await store.saveSettings();
}

async function openStore(store, config) {
  await store.adapter.connect();
  await store.load();
  await ensureSettings(store, config);
  await migrateLegacy(store);
  store.ready = true;
}

function securityHeaders(req, res, next) {
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "font-src 'self'",
      "object-src 'none'",
      "frame-src 'self' blob:",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'"
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  });
  next();
}

function createApp({ store, whatsapp, config }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(compression());
  app.use(securityHeaders);
  app.use('/api', createApi({ store, whatsapp, config }));

  // Only the browser files in public/ are served — never data or settings files.
  app.get('/vendor/chart.umd.min.js', (req, res) => {
    res.set('Cache-Control', 'public, max-age=604800');
    res.sendFile(path.join(path.dirname(require.resolve('chart.js')), 'chart.umd.min.js'));
  });
  app.get('/vendor/xlsx.full.min.js', (req, res) => {
    res.set('Cache-Control', 'public, max-age=604800');
    res.sendFile(require.resolve('xlsx/dist/xlsx.full.min.js'));
  });
  app.use('/fonts', express.static(path.join(path.dirname(require.resolve('@fontsource/plus-jakarta-sans/package.json')), 'files'), {
    index: false,
    maxAge: '30d',
    immutable: true
  }));
  app.use(express.static(PUBLIC_DIR, {
    index: false,
    setHeaders: res => res.set('Cache-Control', 'no-cache')
  }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/') || path.extname(req.path) || /\/\./.test(req.path)) return next();
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });
  app.use((req, res) => res.status(404).type('text').send('Not found'));
  return app;
}

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}

async function start() {
  const config = readConfig();
  const adapter = config.mongoUri ? new MongoAdapter(config.mongoUri, config.mongoDb) : new FileAdapter(config.dataDir);
  const store = new Store(adapter);
  const whatsapp = new WhatsAppService({
    store,
    dataDir: config.dataDir,
    legacyDir: path.join(ROOT, 'whatsapp_auth'),
    disabled: config.whatsappDisabled
  });
  const app = createApp({ store, whatsapp, config });

  const server = app.listen(config.port, '0.0.0.0', () => {
    const lan = lanAddress();
    console.log('=======================================================');
    console.log(' Glorious Public School - Student Tracker is running');
    console.log(` On this computer:  http://localhost:${config.port}`);
    if (lan) console.log(` On school Wi-Fi:   http://${lan}:${config.port}`);
    console.log(` Data is saved in:  ${config.mongoUri ? 'MongoDB (online database)' : config.dataDir}`);
    console.log('=======================================================');
  });

  let attempt = 0;
  while (!store.ready) {
    try {
      await openStore(store, config);
    } catch (err) {
      attempt += 1;
      const delay = Math.min(60000, 3000 * attempt);
      console.error(`Could not open the database (attempt ${attempt}): ${err.message}. Retrying in ${delay / 1000}s.`);
      await adapter.close().catch(() => {});
      await new Promise(r => setTimeout(r, delay));
    }
  }
  console.log(`Database ready (${store.kind}).`);
  whatsapp.start().catch(err => console.warn('WhatsApp could not reconnect:', err.message));
  setInterval(() => {
    store.retryFailed().then(left => { if (left) console.warn(`${left} change(s) still waiting to be saved.`); });
  }, 15000).unref();

  const shutdown = async () => {
    server.close();
    await whatsapp.stop().catch(() => {});
    await store.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (require.main === module) {
  start().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { createApp, openStore, ensureSettings, readConfig, FIRST_RUN_ADMIN_PASSWORD };
