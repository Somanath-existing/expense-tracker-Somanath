const { json, clearAuthCookie } = require('../_lib');

module.exports = function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  clearAuthCookie(res);
  return json(res, 200, { ok: true });
};
