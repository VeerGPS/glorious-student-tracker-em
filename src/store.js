'use strict';

/**
 * In-memory store backed by MongoDB (when a connection string is configured)
 * or by a JSON file in the data folder. Every record is saved on its own, so
 * one teacher saving their class can never overwrite another teacher's data.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const COLLECTIONS = ['teachers', 'students', 'tests', 'attendance'];

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

class FileAdapter {
  constructor(dir) {
    this.kind = 'file';
    this.dir = dir;
    this.file = path.join(dir, 'school-data.json');
    this.snapshot = null;
    this.flushTimer = null;
    this.waiters = [];
  }

  async connect() {
    fs.mkdirSync(this.dir, { recursive: true });
  }

  async load() {
    if (!fs.existsSync(this.file)) return { collections: {}, settings: null };
    const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    return { collections: raw.collections || {}, settings: raw.settings || null };
  }

  async loadLegacy() {
    return null;
  }

  // The file adapter always writes the full snapshot handed over by the store.
  scheduleFlush(getSnapshot) {
    this.getSnapshot = getSnapshot;
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
      if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), 150);
    });
  }

  flush() {
    this.flushTimer = null;
    const waiters = this.waiters.splice(0);
    try {
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.getSnapshot()));
      if (fs.existsSync(this.file)) fs.copyFileSync(this.file, path.join(this.dir, 'school-data.previous.json'));
      fs.renameSync(tmp, this.file);
      waiters.forEach(w => w.resolve());
    } catch (err) {
      waiters.forEach(w => w.reject(err));
    }
  }

  async close() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flush();
    }
  }
}

// Ways to read a connection string pasted by hand. A password with @ : / ? #
// must be percent-encoded, and Atlas's "<db_password>" brackets are often left
// in; the string is tried as given first, then with those mistakes corrected.
function mongoUriCandidates(input) {
  const uri = String(input || '').trim().replace(/^(['"])(.*)\1$/, '$2').trim();
  const out = [uri];
  const start = uri.indexOf('://');
  const at = uri.lastIndexOf('@');
  if (start < 0 || at < start) return out;
  const userInfo = uri.slice(start + 3, at);
  const colon = userInfo.indexOf(':');
  if (colon < 0) return out;
  const user = userInfo.slice(0, colon);
  const password = userInfo.slice(colon + 1);
  const withPassword = pw => `${uri.slice(0, start + 3)}${encodeURIComponent(user)}:${encodeURIComponent(pw)}${uri.slice(at)}`;
  const add = x => { if (!out.includes(x)) out.push(x); };
  if (/[^A-Za-z0-9._~-]/.test(user + password)) add(withPassword(password));
  const bare = password.match(/^<(.+)>$/);
  if (bare) add(withPassword(bare[1]));
  return out;
}

function isAuthError(err) {
  return Boolean(err) && (err.code === 18 || err.code === 8000 || /auth(entication)? failed|bad auth/i.test(err.message || ''));
}

// A plain explanation of why the database cannot be opened (never includes the password).
function explainDbError(err, variable = 'MONGODB_URI') {
  const msg = String((err && err.message) || err || '');
  const where = `the ${variable} setting (on Render: Dashboard → your service → Environment)`;
  if (isAuthError(err)) {
    return `MongoDB says the user name or password is wrong. Check the user in MongoDB Atlas → Database Access, then put that exact password in ${where} and save.`;
  }
  if ((err && err.name === 'MongoParseError') || /connection string|scheme|unescaped|hostname/i.test(msg)) {
    return `The connection string in ${where} is not written correctly. Copy it again from MongoDB Atlas (Connect → Drivers) and replace <db_password> with the password, without the < > signs.`;
  }
  if (/querySrv|ENOTFOUND|EAI_AGAIN/i.test(msg)) {
    return `The database address in ${where} was not found. Copy the connection string again from MongoDB Atlas (Connect → Drivers).`;
  }
  if ((err && err.name === 'MongoServerSelectionError') || /timed out|ECONNREFUSED|ECONNRESET|closed|ReplicaSetNoPrimary/i.test(msg)) {
    return 'The database cannot be reached. In MongoDB Atlas → Network Access, allow access from anywhere (0.0.0.0/0), because Render has no fixed address, and check that the cluster is not paused.';
  }
  return `The database reported: ${msg.replace(/mongodb(\+srv)?:\/\/\S*/gi, '[connection string]').slice(0, 200)}`;
}

class MongoAdapter {
  constructor(uri, dbName, MongoClient) {
    this.kind = 'mongodb';
    this.uri = uri;
    this.dbName = dbName;
    this.MongoClient = MongoClient || require('mongodb').MongoClient;
    this.client = null;
    this.db = null;
  }

  async connect() {
    let lastErr = null;
    for (const uri of mongoUriCandidates(this.uri)) {
      try {
        this.client = new this.MongoClient(uri, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 });
        await this.client.connect();
        this.db = this.client.db(this.dbName);
        await this.db.command({ ping: 1 });
        if (uri !== this.uri.trim()) console.warn('MongoDB: connected after correcting the connection string (special characters in the password).');
        return;
      } catch (err) {
        lastErr = err;
        await this.close();
        this.client = null;
        // Only a mistyped string or a refused password is worth another form of the string.
        if (!(err.name === 'MongoParseError' || isAuthError(err))) break;
      }
    }
    throw lastErr;
  }

  async load() {
    const collections = {};
    for (const name of COLLECTIONS) {
      collections[name] = (await this.db.collection(name).find({}).toArray()).map(stripMongoId);
    }
    const settings = await this.db.collection('settings').findOne({ _id: 'main' });
    return { collections, settings: settings ? stripMongoId(settings) : null };
  }

  // Data written by the previous version of the app (one big shared document
  // plus one copy per teacher). Read only; never modified.
  async loadLegacy() {
    const school = await this.db.collection('school_data').findOne({ _id: 'glorious_public_school' });
    const perTeacher = await this.db.collection('teachers_data').find({}).toArray();
    if (!school && perTeacher.length === 0) return null;
    return { school, perTeacher };
  }

  async save(collection, doc) {
    const name = collection === 'settings' ? 'settings' : collection;
    const id = collection === 'settings' ? 'main' : doc.id;
    await this.db.collection(name).replaceOne({ _id: id }, { ...doc, _id: id }, { upsert: true });
  }

  async remove(collection, id) {
    await this.db.collection(collection).deleteOne({ _id: id });
  }

  collection(name) {
    return this.db.collection(name);
  }

  async close() {
    if (this.client) await this.client.close().catch(() => {});
  }
}

function stripMongoId(doc) {
  const { _id, ...rest } = doc;
  return rest;
}

class Store {
  constructor(adapter) {
    this.adapter = adapter;
    this.kind = adapter.kind;
    this.maps = {};
    COLLECTIONS.forEach(c => { this.maps[c] = new Map(); });
    this.settings = null;
    this.ready = false;
    this.openError = null; // why the database could not be opened, in plain words
    this.bootId = crypto.randomBytes(4).toString('hex');
    this.counter = 0;
    this.chains = new Map();
    this.failed = new Map();
  }

  get revision() {
    return `${this.bootId}.${this.counter}`;
  }

  async load() {
    const { collections, settings } = await this.adapter.load();
    COLLECTIONS.forEach(c => {
      this.maps[c].clear();
      (collections[c] || []).forEach(doc => { if (doc && doc.id) this.maps[c].set(doc.id, doc); });
    });
    this.settings = settings;
  }

  list(collection) {
    return Array.from(this.maps[collection].values());
  }

  get(collection, id) {
    return this.maps[collection].get(id) || null;
  }

  find(collection, predicate) {
    for (const doc of this.maps[collection].values()) if (predicate(doc)) return doc;
    return null;
  }

  filter(collection, predicate) {
    return this.list(collection).filter(predicate);
  }

  // Saves one record. Resolves once it is safely written to disk/database.
  // `quiet` skips the revision bump (used for bookkeeping like "last active").
  put(collection, doc, { quiet = false } = {}) {
    this.maps[collection].set(doc.id, doc);
    if (!quiet) this.counter += 1;
    return this.persist(collection, doc.id);
  }

  remove(collection, id) {
    this.maps[collection].delete(id);
    this.counter += 1;
    return this.persist(collection, id, true);
  }

  saveSettings() {
    this.counter += 1;
    return this.persist('settings', 'main');
  }

  persist(collection, id, isDelete = false) {
    if (this.adapter.kind === 'file') {
      return this.adapter.scheduleFlush(() => this.snapshot());
    }
    const key = `${collection}:${id}`;
    const previous = this.chains.get(key) || Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      try {
        if (isDelete) await this.adapter.remove(collection, id);
        else {
          const current = collection === 'settings' ? this.settings : this.maps[collection].get(id);
          if (current) await this.adapter.save(collection, clone(current));
          else await this.adapter.remove(collection, id);
        }
        this.failed.delete(key);
      } catch (err) {
        this.failed.set(key, { collection, id });
        throw err;
      }
    });
    this.chains.set(key, next);
    next.finally(() => { if (this.chains.get(key) === next) this.chains.delete(key); }).catch(() => {});
    return next;
  }

  // Retries writes that failed earlier (for example while the internet was down).
  async retryFailed() {
    const pending = Array.from(this.failed.values());
    for (const { collection, id } of pending) {
      await this.persist(collection, id).catch(() => {});
    }
    return this.failed.size;
  }

  snapshot() {
    const collections = {};
    COLLECTIONS.forEach(c => { collections[c] = this.list(c); });
    return { version: 2, savedAt: new Date().toISOString(), settings: this.settings, collections };
  }

  async close() {
    await Promise.allSettled(Array.from(this.chains.values()));
    await this.adapter.close();
  }
}

module.exports = { Store, FileAdapter, MongoAdapter, COLLECTIONS, clone, mongoUriCandidates, explainDbError };
