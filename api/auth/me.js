const { sql, json, requireAuth } = require('../_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  const uid = requireAuth(req, res);
  if (!uid) return;
  const db = sql();
  const rows = await db`SELECT email FROM users WHERE id = ${uid}`;
  if (!rows[0]) return json(res, 401, { error: 'Not authenticated' });
  return json(res, 200, rows[0]);
};
