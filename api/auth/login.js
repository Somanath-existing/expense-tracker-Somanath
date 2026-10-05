const bcrypt = require('bcryptjs');
const { sql, json, setAuthCookie, rateLimit, getRealIp } = require('../_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const ip = getRealIp(req);
  if (rateLimit(`login:${ip}`, 15 * 60 * 1000, 20))
    return json(res, 429, { error: 'Too many attempts. Please wait 15 minutes.' });

  const { email: rawEmail, password } = req.body || {};
  const email = String(rawEmail || '').trim().toLowerCase();

  const db = sql();
  const rows = await db`SELECT id, password_hash FROM users WHERE email = ${email}`;

  // Always hash-compare to prevent timing attacks even when user not found
  const dummyHash = '$2a$12$dummyhashtopreventtimingattacks00000000000000000000000';
  const hash = rows[0]?.password_hash || dummyHash;
  const valid = await bcrypt.compare(String(password || ''), hash);

  if (!rows[0] || !valid)
    return json(res, 401, { error: 'Incorrect email or password.' });

  setAuthCookie(res, rows[0].id);
  return json(res, 200, { email });
};
