const { sql, json, requireAuth, validateTransaction, CATEGORIES } = require('../_lib');

const COLS = `id, title, amount::float8 AS amount,
  to_char(date, 'YYYY-MM-DD') AS date, category, type, note`;

module.exports = async function handler(req, res) {
  const uid = requireAuth(req, res);
  if (!uid) return;
  const db = sql();

  // ── GET /api/expenses ──────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { search, category, type, from, to } = req.query;
    // Build conditions dynamically — neon tagged-template doesn't support
    // runtime SQL fragments easily so we use a raw parameterised query string.
    const conditions = ['user_id = $1'];
    const params = [uid];
    const add = (expr, val) => { params.push(val); conditions.push(expr.replace('?', `$${params.length}`)); };

    if (search)   add("title ILIKE ?", `%${String(search).slice(0, 100)}%`);
    if (CATEGORIES.includes(category)) add('category = ?', category);
    if (['income', 'expense'].includes(type)) add('type = ?', type);
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) add('date >= ?', from);
    if (/^\d{4}-\d{2}-\d{2}$/.test(to))   add('date <= ?', to);

    const q = `SELECT ${COLS} FROM expenses WHERE ${conditions.join(' AND ')}
               ORDER BY date DESC, id DESC LIMIT 500`;
    const rows = await db(q, params);
    return json(res, 200, rows);
  }

  // ── POST /api/expenses ─────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { errors, t } = validateTransaction(req.body || {});
    if (errors.length) return json(res, 400, { errors });

    const rows = await db`
      INSERT INTO expenses (user_id, title, amount, date, category, type, note)
      VALUES (${uid}, ${t.title}, ${t.amount}, ${t.date}, ${t.category}, ${t.type}, ${t.note})
      RETURNING id, title, amount::float8 AS amount, to_char(date, 'YYYY-MM-DD') AS date, category, type, note
    `;
    return json(res, 201, rows[0]);
  }

  return json(res, 405, { error: 'Method not allowed' });
};
