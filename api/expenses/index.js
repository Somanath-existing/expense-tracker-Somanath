const { sql, json, requireAuth, checkOrigin, validateTransaction } = require('../_lib');

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

    // Build a safe parameterised query using positional $N placeholders.
    // All user-supplied values are passed as params — never interpolated into SQL.
    const conditions = ['user_id = $1'];
    const params = [uid];

    const addParam = (sql, val) => {
      params.push(val);
      conditions.push(sql.replace('?', `$${params.length}`));
    };

    if (search && typeof search === 'string') {
      addParam('title ILIKE ?', `%${search.trim().slice(0, 100)}%`);
    }
    if (category && typeof category === 'string' && category.trim().length <= 100) {
      addParam('category = ?', category.trim());
    }
    if (type && ['income', 'expense'].includes(type)) {
      addParam('type = ?', type);
    }
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
      addParam("date >= ?::date", from);
    }
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      addParam("date <= ?::date", to);
    }

    const whereClause = conditions.join(' AND ');
    const query = `
      SELECT id, title, amount::float8 AS amount,
             to_char(date, 'YYYY-MM-DD') AS date,
             category, type, note
      FROM expenses
      WHERE ${whereClause}
      ORDER BY date DESC, id DESC
      LIMIT 500
    `;

    const rows = await db(query, params);
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
