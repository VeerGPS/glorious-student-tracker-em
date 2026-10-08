'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store, FileAdapter } = require('../src/store');
const { WhatsAppService } = require('../src/whatsapp');
const { createApp, openStore } = require('../server');

async function startServer(options = {}) {
  const dataDir = options.dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'gps-test-'));
  const config = { dataDir, adminPassword: options.adminPassword || '', sessionSecret: '' };
  const adapter = options.adapter || new FileAdapter(dataDir);
  const store = new Store(adapter);
  const whatsapp = new WhatsAppService({ store, dataDir, disabled: false, minGapMs: 0 });
  await openStore(store, config);
  const app = createApp({ store, whatsapp, config });
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(method, url, body, token) {
    const res = await fetch(base + url, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, headers: res.headers };
  }

  return {
    base,
    store,
    whatsapp,
    dataDir,
    call,
    async close() {
      await new Promise(resolve => server.close(resolve));
      await store.close();
    }
  };
}

// Signs in as the office, sets a real password on first run, returns the token.
async function adminToken(srv) {
  let res = await srv.call('POST', '/api/login', { role: 'admin', password: 'gps369' });
  if (res.status === 200 && res.data.me.mustChangePassword) {
    res = await srv.call('POST', '/api/me/password', { current: 'gps369', next: 'office-pass-1' }, res.data.token);
    return res.data.token;
  }
  res = await srv.call('POST', '/api/login', { role: 'admin', password: 'office-pass-1' });
  return res.data.token;
}

module.exports = { startServer, adminToken };
