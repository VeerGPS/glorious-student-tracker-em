'use strict';

// Tiny in-memory stand-in for the parts of the MongoDB driver the app uses.
function createFakeMongo() {
  const dbs = new Map();
  const clone = v => JSON.parse(JSON.stringify(v));

  function collection(db, name) {
    if (!db.has(name)) db.set(name, new Map());
    const docs = db.get(name);
    const matches = (doc, q) => Object.entries(q || {}).every(([k, v]) => doc[k] === v);
    return {
      find: q => ({ toArray: async () => Array.from(docs.values()).filter(d => matches(d, q)).map(clone) }),
      findOne: async q => {
        const d = Array.from(docs.values()).find(x => matches(x, q));
        return d ? clone(d) : null;
      },
      replaceOne: async (q, doc) => { docs.set(q._id, clone({ ...doc, _id: q._id })); },
      deleteOne: async q => { docs.delete(q._id); },
      deleteMany: async () => { docs.clear(); },
      insertOne: async doc => { docs.set(doc._id, clone(doc)); }
    };
  }

  class MongoClient {
    constructor(uri) { this.uri = uri; }
    async connect() {}
    db(name) {
      if (!dbs.has(name)) dbs.set(name, new Map());
      const db = dbs.get(name);
      return { command: async () => ({ ok: 1 }), collection: n => collection(db, n) };
    }
    async close() {}
  }

  return { MongoClient, raw: name => new MongoClient().db(name) };
}

module.exports = { createFakeMongo };
