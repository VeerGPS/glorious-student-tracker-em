'use strict';

/**
 * WhatsApp Web link for the school's own number (via Baileys).
 * - Only the office (admin) can link or unlink it.
 * - The login is kept in MongoDB when the school uses MongoDB, so a restart of
 *   the hosting server does not ask for a new QR scan. Otherwise it is kept in
 *   the local data folder.
 * - Messages go out one at a time with a pause between them.
 */

const fs = require('fs');
const path = require('path');

let baileys = null;
function lib() {
  if (!baileys) baileys = require('@whiskeysockets/baileys');
  return baileys;
}

async function useMongoAuthState(collection) {
  const { BufferJSON, initAuthCreds, proto } = lib();
  const read = async key => {
    const doc = await collection.findOne({ _id: key });
    return doc ? JSON.parse(doc.value, BufferJSON.reviver) : null;
  };
  const write = (key, value) => collection.replaceOne(
    { _id: key },
    { _id: key, value: JSON.stringify(value, BufferJSON.replacer) },
    { upsert: true }
  );
  const creds = (await read('creds')) || initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const out = {};
          await Promise.all(ids.map(async id => {
            let value = await read(`${type}-${id}`);
            if (type === 'app-state-sync-key' && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
            out[id] = value;
          }));
          return out;
        },
        set: async data => {
          const tasks = [];
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? write(key, value) : collection.deleteOne({ _id: key }));
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: () => write('creds', creds)
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class WhatsAppService {
  constructor({ store, dataDir, legacyDir, disabled, minGapMs }) {
    this.store = store;
    this.dir = path.join(dataDir, 'whatsapp_auth');
    this.legacyDir = legacyDir;
    this.disabled = Boolean(disabled);
    this.minGapMs = minGapMs === undefined ? 2500 : minGapMs;
    this.sock = null;
    this.state = 'disconnected'; // disconnected | connecting | qr | connected
    this.qr = null;
    this.user = null;
    this.lastError = null;
    this.retryTimer = null;
    this.retries = 0;
    this.queue = Promise.resolve();
    this.lastSendAt = 0;
    this.numberCache = new Map();
    this.generation = 0;
  }

  get useMongo() {
    return this.store.kind === 'mongodb';
  }

  authCollection() {
    return this.store.adapter.collection('whatsapp_auth');
  }

  async hasSavedLogin() {
    if (this.useMongo) return Boolean(await this.authCollection().findOne({ _id: 'creds' }));
    return fs.existsSync(path.join(this.dir, 'creds.json'));
  }

  async clearSavedLogin() {
    if (this.useMongo) await this.authCollection().deleteMany({});
    fs.rmSync(this.dir, { recursive: true, force: true });
  }

  // Reconnects automatically when the school had already linked WhatsApp.
  async start() {
    if (this.disabled) return;
    if (!this.useMongo && this.legacyDir && !fs.existsSync(this.dir) && fs.existsSync(path.join(this.legacyDir, 'creds.json'))) {
      fs.mkdirSync(path.dirname(this.dir), { recursive: true });
      fs.cpSync(this.legacyDir, this.dir, { recursive: true });
    }
    if (await this.hasSavedLogin()) await this.connect().catch(err => { this.lastError = err.message; });
  }

  status(includeQr = false) {
    return {
      enabled: !this.disabled,
      state: this.state,
      connected: this.state === 'connected',
      phone: this.user ? this.user.phone : null,
      name: this.user ? this.user.name : null,
      qr: includeQr ? this.qr : null,
      error: this.lastError
    };
  }

  async link(fresh = false) {
    if (this.disabled) throw new Error('WhatsApp sending is turned off on this server.');
    if (fresh) await this.unlink();
    if (this.state === 'connected' || this.state === 'connecting' || this.state === 'qr') return this.status(true);
    await this.connect();
    return this.status(true);
  }

  async unlink() {
    this.generation += 1;
    clearTimeout(this.retryTimer);
    const sock = this.sock;
    this.sock = null;
    if (sock) {
      try { await sock.logout(); } catch { /* already logged out */ }
      try { sock.end(undefined); } catch { /* ignore */ }
    }
    await this.clearSavedLogin();
    this.state = 'disconnected';
    this.qr = null;
    this.user = null;
    this.numberCache.clear();
  }

  async connect() {
    const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = lib();
    const QRCode = require('qrcode');
    const pino = require('pino');
    const generation = ++this.generation;
    this.state = 'connecting';
    this.lastError = null;

    const auth = this.useMongo
      ? await useMongoAuthState(this.authCollection())
      : await useMultiFileAuthState(this.dir);

    const sock = makeWASocket({
      auth: auth.state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      browser: ['School Tracker', 'Chrome', '2.0']
    });
    this.sock = sock;
    sock.ev.on('creds.update', auth.saveCreds);
    sock.ev.on('connection.update', async update => {
      if (generation !== this.generation) return;
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        this.qr = await QRCode.toDataURL(qr, { width: 280, margin: 1 }).catch(() => null);
        this.state = 'qr';
      }
      if (connection === 'open') {
        this.state = 'connected';
        this.qr = null;
        this.retries = 0;
        const id = (sock.user && sock.user.id) || '';
        this.user = { phone: id.split(':')[0].split('@')[0], name: (sock.user && sock.user.name) || '' };
      }
      if (connection === 'close') {
        const code = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode;
        this.sock = null;
        this.user = null;
        this.qr = null;
        if (code === DisconnectReason.loggedOut) {
          this.state = 'disconnected';
          this.lastError = 'WhatsApp was logged out from the phone. Please link again.';
          await this.clearSavedLogin().catch(() => {});
          return;
        }
        this.retries += 1;
        // Never linked yet (waiting for a QR scan): stop after a few tries so the
        // office sees a clear message instead of "connecting" forever.
        if (!(auth.state.creds && auth.state.creds.registered) && this.retries >= 4) {
          this.state = 'disconnected';
          this.retries = 0;
          this.lastError = 'Could not finish linking. Check the internet connection, then press "Link school WhatsApp" again.';
          return;
        }
        this.state = 'connecting';
        const delay = Math.min(60000, 3000 * this.retries);
        this.retryTimer = setTimeout(() => {
          if (generation === this.generation) this.connect().catch(err => { this.state = 'disconnected'; this.lastError = err.message; });
        }, delay);
      }
    });
  }

  isConnected() {
    return this.state === 'connected' && Boolean(this.sock);
  }

  // Runs sends one after another with a pause between them.
  enqueue(task) {
    const run = this.queue.then(async () => {
      const wait = this.lastSendAt + this.minGapMs + Math.floor(Math.random() * (this.minGapMs / 2)) - Date.now();
      if (this.lastSendAt && wait > 0) await sleep(wait);
      try {
        return await task();
      } finally {
        this.lastSendAt = Date.now();
      }
    });
    this.queue = run.catch(() => {});
    return run;
  }

  async jidFor(number) {
    const jid = `91${number}@s.whatsapp.net`;
    if (this.numberCache.has(number)) return this.numberCache.get(number);
    let result = jid;
    try {
      const [check] = (await this.sock.onWhatsApp(jid)) || [];
      if (check && check.exists === false) result = null;
      else if (check && check.jid) result = check.jid;
    } catch {
      result = jid; // lookup failed; try sending anyway
    }
    this.numberCache.set(number, result);
    return result;
  }

  async send(number, content) {
    if (!this.isConnected()) throw new Error('School WhatsApp is not linked.');
    return this.enqueue(async () => {
      if (!this.isConnected()) throw new Error('School WhatsApp disconnected.');
      const jid = await this.jidFor(number);
      if (!jid) throw new Error(`+91 ${number} is not on WhatsApp`);
      await this.sock.sendMessage(jid, content);
    });
  }

  sendText(number, text) {
    return this.send(number, { text });
  }

  sendDocument(number, buffer, fileName, caption) {
    return this.send(number, { document: buffer, mimetype: 'application/pdf', fileName, caption });
  }

  // Lets tests run the send pipeline without a real WhatsApp account.
  useTestSocket(sock) {
    this.sock = sock;
    this.state = sock ? 'connected' : 'disconnected';
    this.user = sock ? { phone: '919999999999', name: 'Test' } : null;
  }

  async stop() {
    this.generation += 1;
    clearTimeout(this.retryTimer);
    if (this.sock) {
      try { this.sock.end(undefined); } catch { /* ignore */ }
    }
    this.sock = null;
  }
}

module.exports = { WhatsAppService };
