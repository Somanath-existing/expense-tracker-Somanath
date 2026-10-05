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

  // ── PUT /api/expenses/:id or /api/expenses?id=X ──────────────────────────
  if (req.method === 'PUT') {
    let id = Number(req.query.id);
    if (!id) {
      const parts = (req.url || '').split('?')[0].split('/');
      const last = parts[parts.length - 1];
      if (/^\d+$/.test(last)) id = Number(last);
    }
    if (!Number.isInteger(id) || id < 1) return json(res, 400, { error: 'Invalid ID' });

    const { errors, t } = validateTransaction(req.body || {});
    if (errors.length) return json(res, 400, { errors });

    const rows = await db`
      UPDATE expenses
      SET title=${t.title}, amount=${t.amount}, date=${t.date},
          category=${t.category}, type=${t.type}, note=${t.note}
      WHERE id=${id} AND user_id=${uid}
      RETURNING id, title, amount::float8 AS amount, to_char(date, 'YYYY-MM-DD') AS date, category, type, note
    `;
    if (!rows[0]) return json(res, 404, { error: 'Transaction not found' });
    return json(res, 200, rows[0]);
  }

  // ── DELETE /api/expenses/:id or /api/expenses?id=X ───────────────────────
  if (req.method === 'DELETE') {
    let id = Number(req.query.id);
    if (!id) {
      const parts = (req.url || '').split('?')[0].split('/');
      const last = parts[parts.length - 1];
      if (/^\d+$/.test(last)) id = Number(last);
    }
    if (!Number.isInteger(id) || id < 1) return json(res, 400, { error: 'Invalid ID' });

    const rows = await db`
      DELETE FROM expenses WHERE id=${id} AND user_id=${uid} RETURNING id
    `;
    if (!rows[0]) return json(res, 404, { error: 'Transaction not found' });
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: 'Method not allowed' });
};
