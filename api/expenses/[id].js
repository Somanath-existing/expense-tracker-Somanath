const { sql, json, requireAuth, validateTransaction } = require('../_lib');

const COLS = `id, title, amount::float8 AS amount,
  to_char(date, 'YYYY-MM-DD') AS date, category, type, note`;

module.exports = async function handler(req, res) {
  const uid = requireAuth(req, res);
  if (!uid) return;

  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id < 1) return json(res, 400, { error: 'Invalid ID' });

  const db = sql();

  // ── PUT /api/expenses/:id ──────────────────────────────────────────────────
  if (req.method === 'PUT') {
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

  // ── DELETE /api/expenses/:id ───────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const rows = await db`
      DELETE FROM expenses WHERE id=${id} AND user_id=${uid} RETURNING id
    `;
    if (!rows[0]) return json(res, 404, { error: 'Transaction not found' });
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: 'Method not allowed' });
};
