const bcrypt = require('bcryptjs');
const { sql, json, setAuthCookie, rateLimit, getRealIp } = require('../_lib');

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const ip = getRealIp(req);
  if (rateLimit(`reg:${ip}`, 15 * 60 * 1000, 10))
    return json(res, 429, { error: 'Too many attempts. Please wait 15 minutes.' });

  const { email: rawEmail, password } = req.body || {};
  const email = String(rawEmail || '').trim().toLowerCase();
  const errors = [];

  if (!emailRe.test(email) || email.length > 254) errors.push('A valid email address is required');
  if (typeof password !== 'string' || password.length < 8 || password.length > 72)
    errors.push('Password must be between 8 and 72 characters');
  if (errors.length) return json(res, 400, { errors });

  try {
    const db = sql();
    const hash = await bcrypt.hash(password, 12);
    const rows = await db`
      INSERT INTO users (email, password_hash) VALUES (${email}, ${hash})
      RETURNING id, email
    `;
    setAuthCookie(res, rows[0].id);
    return json(res, 201, { email: rows[0].email });
  } catch (e) {
    if (e.code === '23505') return json(res, 409, { error: 'That email is already registered.' });
    console.error('register error', e);
    return json(res, 500, { error: 'Registration failed. Please try again.' });
  }
};
