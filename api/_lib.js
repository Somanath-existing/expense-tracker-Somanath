// Shared helpers for all Vercel serverless functions
try { require('dotenv').config({ path: '.env.local' }); } catch (_) {}
const { neon } = require('@neondatabase/serverless');
const jwt = require('jsonwebtoken');

// ── Startup guard: fail fast if critical env vars are missing ──────────────
if (!process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. Cannot start.');
}
if (!process.env.DATABASE_URL) {
  throw new Error('FATAL: DATABASE_URL environment variable is not set. Cannot start.');
}

// ── Database ────────────────────────────────────────────────────────────────
let _sql;
function sql() {
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql;
}

// ── Security helpers ─────────────────────────────────────────────────────────
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  // Disable caching for all API responses so history navigation / back button cannot expose user data
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
  // Tight CSP: only same-origin scripts/styles; no inline scripts from API responses
  'Content-Security-Policy': "default-src 'none'",
};

function json(res, status, body) {
  res.status(status);
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  res.end(JSON.stringify(body));
}

// ── Real IP (non-spoofable on Vercel) ────────────────────────────────────────
// x-forwarded-for can be forged by clients; x-real-ip is set by Vercel's infra.
function getRealIp(req) {
  return (
    req.headers['x-real-ip'] ||
    // Fall back: take only the FIRST address from XFF (leftmost = client)
    // and strip anything a client could have prepended via multiple hops.
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    'unknown'
  );
}

// ── CSRF: Origin check for mutating methods ───────────────────────────────────
// SameSite=Strict is the primary defence. This is a belt-and-suspenders check.
function checkOrigin(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin requests (curl, server-to-server) have no Origin
  if (process.env.ALLOWED_ORIGIN) {
    if (origin === process.env.ALLOWED_ORIGIN) return true;
  }
  const host = req.headers.host;
  if (host && (origin === `https://${host}` || origin === `http://${host}`)) {
    return true;
  }
  json(res, 403, { error: 'Forbidden: cross-origin request rejected' });
  return false;
}

// Parse httpOnly cookie
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(part => {
    const [k, ...v] = part.trim().split('=');
    if (k) out[k.trim()] = decodeURIComponent(v.join('='));
  });
  return out;
}

function requireAuth(req, res) {
  const token = parseCookies(req).token;
  if (!token) { json(res, 401, { error: 'Not authenticated' }); return null; }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return Number(payload.sub);
  } catch {
    json(res, 401, { error: 'Session expired. Please log in again.' });
    return null;
  }
}

function setAuthCookie(res, userId) {
  const token = jwt.sign({ sub: String(userId) }, process.env.JWT_SECRET, { expiresIn: '7d' });
  // Always set Secure unless explicitly running on localhost (dev only)
  const isLocalDev = (process.env.NODE_ENV !== 'production') && !process.env.VERCEL;
  const secureFlag = isLocalDev ? '' : '; Secure';
  res.setHeader('Set-Cookie',
    `token=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${7 * 86400}${secureFlag}`
  );
}

function clearAuthCookie(res) {
  const isLocalDev = (process.env.NODE_ENV !== 'production') && !process.env.VERCEL;
  const secureFlag = isLocalDev ? '' : '; Secure';
  res.setHeader('Set-Cookie',
    `token=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureFlag}`
  );
}

// ── Validation ───────────────────────────────────────────────────────────────
const DEFAULT_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Bills', 'Entertainment', 'Other', 'Salary', 'Freelance', 'Investment'];
// Keep CATEGORIES as the default list (used by migrate + fallback validation)
const CATEGORIES = DEFAULT_CATEGORIES;
const INCOME_CATS = new Set(['Salary', 'Freelance', 'Investment']);

function validateTransaction(body, allowedCategories) {
  const cats = allowedCategories || CATEGORIES;
  const errors = [];
  const t = {
    title:    String(body.title    || '').trim(),
    note:     String(body.note     || '').trim(),
    amount:   Number(body.amount),
    date:     String(body.date     || ''),
    category: body.category,
    type:     body.type,
  };
  if (!t.title || t.title.length > 200)  errors.push('Title is required (max 200 chars)');
  if (!Number.isFinite(t.amount) || t.amount <= 0 || t.amount > 1e9) errors.push('Amount must be a positive number');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date) || isNaN(Date.parse(t.date)))  errors.push('Valid date is required');
  const todayStr = new Date().toISOString().split('T')[0];
  if (t.date > todayStr)                  errors.push('Date cannot be in the future');
  if (!cats.includes(t.category))         errors.push('Invalid category');
  if (!['income', 'expense'].includes(t.type)) errors.push("Type must be 'income' or 'expense'");
  if (t.note.length > 1000)               errors.push('Note too long (max 1000 chars)');
  return { errors, t };
}

// ── Simple in-memory rate limiter ─────────────────────────────────────────────
// Note: resets per cold-start on Vercel. Pair with a shared store (Upstash/Redis)
// for production-grade limiting. Using x-real-ip makes it harder to spoof.
const _hits = new Map();
function rateLimit(key, windowMs, max) {
  const now = Date.now();
  const rec = _hits.get(key) || { count: 0, reset: now + windowMs };
  if (now > rec.reset) { rec.count = 0; rec.reset = now + windowMs; }
  rec.count++;
  _hits.set(key, rec);
  return rec.count > max;
}

module.exports = {
  sql, json,
  requireAuth, setAuthCookie, clearAuthCookie,
  validateTransaction,
  rateLimit, getRealIp, checkOrigin,
  CATEGORIES, DEFAULT_CATEGORIES, INCOME_CATS,
};
