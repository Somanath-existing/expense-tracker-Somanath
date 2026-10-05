const { sql, json, requireAuth, checkOrigin, validateTransaction, CATEGORIES } = require('../_lib');

const COLS = `id, title, amount::float8 AS amount,
  to_char(date, 'YYYY-MM-DD') AS date, category, type, note`;

// Fetch this user's allowed categories (system defaults + their custom ones)
async function getUserCategories(db, uid) {
  const rows = await db`
    SELECT name FROM categories WHERE user_id IS NULL OR user_id = ${uid}
    ORDER BY (user_id IS NULL) DESC, name ASC
  `;
  return rows.map(r => r.name);
}

module.exports = async function handler(req, res) {
  const uid = requireAuth(req, res);
  if (!uid) return;

  // CSRF check on all mutating methods
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    if (!checkOrigin(req, res)) return;
  }

  const db = sql();

  // ── GET /api/expenses ──────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { search, category, type, from, to } = req.query;

    // Build query using tagged-template fragments to stay fully parameterised.
    // neon's tagged-template driver handles all escaping; we compose fragments safely.
    // Support filtering by any category string (default or custom)
    const categoryVal = (category && typeof category === 'string' && category.trim().length <= 100)
      ? category.trim()
      : null;
    const typeVal     = type     && ['income', 'expense'].includes(type) ? type : null;
    const fromVal     = from     && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null;
    const toVal       = to       && /^\d{4}-\d{2}-\d{2}$/.test(to)   ? to   : null;

    const rows = await db`
      SELECT ${db.unsafe(COLS)}
      FROM expenses
      WHERE user_id = ${uid}
        ${searchVal   ? db`AND title ILIKE ${searchVal}`       : db``}
        ${categoryVal ? db`AND category = ${categoryVal}`      : db``}
        ${typeVal     ? db`AND type = ${typeVal}`              : db``}
        ${fromVal     ? db`AND date >= ${fromVal}::date`       : db``}
        ${toVal       ? db`AND date <= ${toVal}::date`         : db``}
      ORDER BY date DESC, id DESC
      LIMIT 500
    `;
    return json(res, 200, rows);
  }

  // ── POST /api/expenses ─────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const userCats = await getUserCategories(db, uid);
    const { errors, t } = validateTransaction(req.body || {}, userCats);
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
      const last  = parts[parts.length - 1];
      if (/^\d+$/.test(last)) id = Number(last);
    }
    if (!Number.isInteger(id) || id < 1) return json(res, 400, { error: 'Invalid ID' });

    const userCats = await getUserCategories(db, uid);
    const { errors, t } = validateTransaction(req.body || {}, userCats);
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
      const last  = parts[parts.length - 1];
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
