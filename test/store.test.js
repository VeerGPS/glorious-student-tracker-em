'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { MongoAdapter, mongoUriCandidates, explainDbError } = require('../src/store');

test('a pasted MongoDB connection string with special characters in the password still works', async () => {
  // Atlas accepts the password "p@ss/26#"; only the percent-encoded form is valid in a URI.
  const good = 'mongodb+srv://school:p%40ss%2F26%23@cluster0.ab1cd.mongodb.net/?retryWrites=true';
  const tried = [];
  class FakeClient {
    constructor(uri) { this.uri = uri; }
    async connect() {
      tried.push(this.uri);
      if (this.uri !== good) {
        const err = new Error('Password contains unescaped characters');
        err.name = 'MongoParseError';
        throw err;
      }
    }
    db() { return { command: async () => ({ ok: 1 }) }; }
    async close() {}
  }
  const adapter = new MongoAdapter('  mongodb+srv://school:p@ss/26#@cluster0.ab1cd.mongodb.net/?retryWrites=true\n', 'gps', FakeClient);
  await adapter.connect();
  assert.deepStrictEqual(tried, ['mongodb+srv://school:p@ss/26#@cluster0.ab1cd.mongodb.net/?retryWrites=true', good]);

  // The "<db_password>" brackets from the Atlas template are dropped when the password is refused.
  assert.deepStrictEqual(mongoUriCandidates('mongodb+srv://school:<Gps2026>@c.mongodb.net/'), [
    'mongodb+srv://school:<Gps2026>@c.mongodb.net/',
    'mongodb+srv://school:%3CGps2026%3E@c.mongodb.net/',
    'mongodb+srv://school:Gps2026@c.mongodb.net/'
  ]);
  // A correct string is used as it is, and only once.
  assert.deepStrictEqual(mongoUriCandidates('"mongodb+srv://school:Gps2026@c.mongodb.net/"'), ['mongodb+srv://school:Gps2026@c.mongodb.net/']);
  assert.deepStrictEqual(mongoUriCandidates('mongodb://localhost:27017'), ['mongodb://localhost:27017']);
});

test('a network problem is not retried with other forms of the password', async () => {
  let attempts = 0;
  class DownClient {
    constructor() {}
    async connect() {
      attempts += 1;
      const err = new Error('Server selection timed out after 10000 ms');
      err.name = 'MongoServerSelectionError';
      throw err;
    }
    async close() {}
  }
  const adapter = new MongoAdapter('mongodb+srv://school:p@ss@c.mongodb.net/', 'gps', DownClient);
  await assert.rejects(adapter.connect(), /timed out/);
  assert.strictEqual(attempts, 1);
});

test('database problems are explained in plain words without the password', () => {
  const auth = Object.assign(new Error('bad auth : authentication failed'), { code: 8000 });
  assert.match(explainDbError(auth, 'MONGODB_URI_EM'), /user name or password is wrong.*MONGODB_URI_EM/);
  const parse = Object.assign(new Error('Invalid connection string'), { name: 'MongoParseError' });
  assert.match(explainDbError(parse), /not written correctly/);
  assert.match(explainDbError(new Error('querySrv ENOTFOUND _mongodb._tcp.cluster0.x.mongodb.net')), /address .* was not found/);
  const down = Object.assign(new Error('Server selection timed out'), { name: 'MongoServerSelectionError' });
  assert.match(explainDbError(down), /Network Access/);
  const other = explainDbError(new Error('failed for mongodb+srv://school:secret@c.mongodb.net/x'));
  assert.ok(!other.includes('secret'), other);
});
