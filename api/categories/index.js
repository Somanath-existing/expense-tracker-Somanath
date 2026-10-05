const { sql, json, requireAuth, checkOrigin } = require('../_lib');

const ALLOWED_EMOJIS = [
  '🍔', '🚗', '🛍️', '📄', '🎬', '📦', '💼', '💻', '📈',
  '☕', '🏥', '✈️', '🎓', '🏋️', '🐾', '🏠', '🎁', '💡',
  '📚', '👗', '🎮', '🍕', '🚌', '💰', '🏷️', '🛠️'
];

module.exports = async function handler(req, res) {
  const uid = requireAuth(req, res);
  if (!uid) return;

  const db = sql();

  // ── GET /api/categories ──────────────────────────────────────────────────
  if (req.method === 'GET') {
    // Return all categories visible to this user:
    // Global defaults (user_id IS NULL) + user custom ones (user_id = uid)
    const rows = await db`
      SELECT id, name, type, emoji, color, is_default, (user_id = ${uid}) AS is_custom
      FROM categories
      WHERE user_id IS NULL OR user_id = ${uid}
      ORDER BY (user_id IS NULL) DESC, type ASC, name ASC
    `;
    return json(res, 200, rows);
  }

  // Check CSRF origin on mutations
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    if (!checkOrigin(req, res)) return;
  }

  // ── POST /api/categories (Add new category for user) ─────────────────────
  if (req.method === 'POST') {
    const { name: rawName, type, emoji, color } = req.body || {};
    const name = String(rawName || '').trim();

    if (!name || name.length > 50) {
      return json(res, 400, { error: 'Category name is required (max 50 chars)' });
    }
    if (!['expense', 'income'].includes(type)) {
      return json(res, 400, { error: "Category type must be 'expense' or 'income'" });
    }

    const cleanEmoji = ALLOWED_EMOJIS.includes(emoji) ? emoji : '📦';
    const cleanColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#636e72';

    try {
      const rows = await db`
        INSERT INTO categories (user_id, name, type, emoji, color, is_default)
        VALUES (${uid}, ${name}, ${type}, ${cleanEmoji}, ${cleanColor}, false)
        RETURNING id, name, type, emoji, color, is_default, true AS is_custom
      `;
      return json(res, 201, rows[0]);
    } catch (e) {
      if (e.code === '23505') {
        return json(res, 409, { error: 'A category with this name already exists' });
      }
      console.error('Add category error:', e);
      return json(res, 500, { error: 'Failed to create category' });
    }
  }

  // ── PUT /api/categories/:id or ?id=X (Edit user category) ────────────────
  if (req.method === 'PUT') {
    let id = Number(req.query.id);
    if (!id) {
      const parts = (req.url || '').split('?')[0].split('/');
      const last = parts[parts.length - 1];
      if (/^\d+$/.test(last)) id = Number(last);
    }
    if (!Number.isInteger(id) || id < 1) return json(res, 400, { error: 'Invalid ID' });

    const { name: rawName, type, emoji, color } = req.body || {};
    const name = String(rawName || '').trim();

    if (!name || name.length > 50) {
      return json(res, 400, { error: 'Category name is required (max 50 chars)' });
    }
    if (!['expense', 'income'].includes(type)) {
      return json(res, 400, { error: "Category type must be 'expense' or 'income'" });
    }

    const cleanEmoji = ALLOWED_EMOJIS.includes(emoji) ? emoji : '📦';
    const cleanColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#636e72';

    // Verify ownership (cannot edit system default categories)
    const existing = await db`SELECT id, name FROM categories WHERE id = ${id} AND user_id = ${uid}`;
    if (!existing[0]) {
      return json(res, 404, { error: 'Custom category not found or cannot be edited' });
    }
    const oldName = existing[0].name;

    try {
      const rows = await db`
        UPDATE categories
        SET name = ${name}, type = ${type}, emoji = ${cleanEmoji}, color = ${cleanColor}
        WHERE id = ${id} AND user_id = ${uid}
        RETURNING id, name, type, emoji, color, is_default, true AS is_custom
      `;

      // If category name was renamed, optionally cascade update expenses of this user
      if (oldName !== name) {
        await db`
          UPDATE expenses
          SET category = ${name}
          WHERE user_id = ${uid} AND category = ${oldName}
        `;
      }

      return json(res, 200, rows[0]);
    } catch (e) {
      if (e.code === '23505') {
        return json(res, 409, { error: 'A category with this name already exists' });
      }
      console.error('Update category error:', e);
      return json(res, 500, { error: 'Failed to update category' });
    }
  }

  // ── DELETE /api/categories/:id or ?id=X (Delete user category) ───────────
  if (req.method === 'DELETE') {
    let id = Number(req.query.id);
    if (!id) {
      const parts = (req.url || '').split('?')[0].split('/');
      const last = parts[parts.length - 1];
      if (/^\d+$/.test(last)) id = Number(last);
    }
    if (!Number.isInteger(id) || id < 1) return json(res, 400, { error: 'Invalid ID' });

    // Verify it is user's custom category
    const cat = await db`SELECT name FROM categories WHERE id = ${id} AND user_id = ${uid}`;
    if (!cat[0]) {
      return json(res, 404, { error: 'Custom category not found or cannot be deleted' });
    }

    // Check if user has transactions using this category
    const inUse = await db`
      SELECT COUNT(*)::int AS count
      FROM expenses
      WHERE user_id = ${uid} AND category = ${cat[0].name}
    `;

    if (inUse[0] && inUse[0].count > 0) {
      // Reassign affected expenses to fallback 'Other' so data isn't broken
      await db`
        UPDATE expenses
        SET category = 'Other'
        WHERE user_id = ${uid} AND category = ${cat[0].name}
      `;
    }

    await db`DELETE FROM categories WHERE id = ${id} AND user_id = ${uid}`;
    return json(res, 200, { ok: true, reassignedCount: inUse[0]?.count || 0 });
  }

  return json(res, 405, { error: 'Method not allowed' });
};
