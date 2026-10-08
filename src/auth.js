'use strict';

const crypto = require('crypto');

const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };
const TOKEN_DAYS = 60;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64');
  const hash = crypto.scryptSync(String(password), salt, 64, SCRYPT_OPTS).toString('base64');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  if (!salt || !hash || typeof password !== 'string') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = crypto.scryptSync(password, salt, expected.length, SCRYPT_OPTS);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function signToken(payload, secret) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_DAYS * 86400000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// Fixed-window limiter kept in memory: `limit` hits per `windowMs` for each key.
class RateLimiter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  hit(key) {
    const now = Date.now();
    let entry = this.hits.get(key);
    if (!entry || entry.reset < now) {
      entry = { count: 0, reset: now + this.windowMs };
      this.hits.set(key, entry);
    }
    entry.count += 1;
    if (this.hits.size > 10000) {
      for (const [k, v] of this.hits) if (v.reset < now) this.hits.delete(k);
    }
    return entry.count <= this.limit;
  }

  isBlocked(key) {
    const entry = this.hits.get(key);
    return Boolean(entry && entry.reset >= Date.now() && entry.count >= this.limit);
  }

  clear(key) {
    this.hits.delete(key);
  }
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, RateLimiter };
