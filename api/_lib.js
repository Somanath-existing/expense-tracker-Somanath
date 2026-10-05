// Shared helpers for all Vercel serverless functions
const { neon } = require('@neondatabase/serverless');
const jwt = require('jsonwebtoken');

// ── Database ────────────────────────────────────────────────────────────────
let _sql;
function sql() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not configured');
    }
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

// ── Security helpers ─────────────────────────────────────────────────────────
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  res.end(JSON.stringify(body));
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
  const isProd = process.env.NODE_ENV === 'production';
  res.setHeader('Set-Cookie',
    `token=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${7 * 86400}${isProd ? '; Secure' : ''}`
  );
}

function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', 'token=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
}

// ── Validation ───────────────────────────────────────────────────────────────
const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Bills', 'Entertainment', 'Other', 'Salary', 'Freelance', 'Investment'];
const INCOME_CATS = new Set(['Salary', 'Freelance', 'Investment']);

function validateTransaction(body) {
  const errors = [];
  const t = {
    title: String(body.title || '').trim(),
    note:  String(body.note  || '').trim(),
    amount: Number(body.amount),
    date: String(body.date || ''),
    category: body.category,
    type: body.type,
  };
  if (!t.title || t.title.length > 200)  errors.push('Title is required (max 200 chars)');
  if (!Number.isFinite(t.amount) || t.amount <= 0 || t.amount > 1e9) errors.push('Amount must be a positive number');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date) || isNaN(Date.parse(t.date)))  errors.push('Valid date is required');
  if (!CATEGORIES.includes(t.category))   errors.push('Invalid category');
  if (!['income', 'expense'].includes(t.type)) errors.push("Type must be 'income' or 'expense'");
  if (t.note.length > 1000)               errors.push('Note too long (max 1000 chars)');
  return { errors, t };
}

// Simple in-memory rate limiter (resets per cold start — good enough for Vercel edge)
const _hits = new Map();
function rateLimit(key, windowMs, max) {
  const now = Date.now();
  const rec = _hits.get(key) || { count: 0, reset: now + windowMs };
  if (now > rec.reset) { rec.count = 0; rec.reset = now + windowMs; }
  rec.count++;
  _hits.set(key, rec);
  return rec.count > max;
}

module.exports = { sql, json, requireAuth, setAuthCookie, clearAuthCookie, validateTransaction, rateLimit, CATEGORIES, INCOME_CATS };
