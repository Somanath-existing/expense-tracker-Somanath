// Run once: node api/migrate.js
// Also called by Vercel buildCommand so the schema is always up-to-date.
try { require('dotenv').config({ path: '.env.local' }); } catch (_) {}
const { neon } = require('@neondatabase/serverless');

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL environment variable is not defined.');
    process.exit(1);
  }
  if (process.env.DATABASE_URL === '[SENSITIVE]') {
    console.log('Skipping database migration: DATABASE_URL is masked as [SENSITIVE] in this environment.');
    process.exit(0);
  }
  const sql = neon(process.env.DATABASE_URL);
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS expenses (
      id       SERIAL PRIMARY KEY,
      user_id  INT  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title    TEXT NOT NULL,
      amount   NUMERIC(12,2) NOT NULL CHECK (amount > 0),
      date     DATE NOT NULL,
      category TEXT NOT NULL,
      type     TEXT NOT NULL DEFAULT 'expense' CHECK (type IN ('income','expense')),
      note     TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS categories (
      id       SERIAL PRIMARY KEY,
      user_id  INT REFERENCES users(id) ON DELETE CASCADE,
      name     TEXT NOT NULL,
      type     TEXT NOT NULL CHECK (type IN ('income', 'expense')),
      emoji    TEXT NOT NULL DEFAULT '📦',
      color    TEXT NOT NULL DEFAULT '#636e72',
      is_default BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT now(),
      CONSTRAINT uq_user_category UNIQUE NULLS NOT DISTINCT (user_id, name)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_cat_user ON categories (user_id)`;

  // Insert default system categories (user_id = NULL) if not already present
  const defaultCats = [
    { name: 'Food',          type: 'expense', emoji: '🍔', color: '#ff6b6b' },
    { name: 'Transport',     type: 'expense', emoji: '🚗', color: '#4ecdc4' },
    { name: 'Shopping',      type: 'expense', emoji: '🛍️', color: '#feca57' },
    { name: 'Bills',         type: 'expense', emoji: '📄', color: '#a29bfe' },
    { name: 'Entertainment', type: 'expense', emoji: '🎬', color: '#fd79a8' },
    { name: 'Other',         type: 'expense', emoji: '📦', color: '#636e72' },
    { name: 'Salary',        type: 'income',  emoji: '💼', color: '#55efc4' },
    { name: 'Freelance',     type: 'income',  emoji: '💻', color: '#74b9ff' },
    { name: 'Investment',    type: 'income',  emoji: '📈', color: '#fdcb6e' },
  ];

  for (const c of defaultCats) {
    await sql`
      INSERT INTO categories (user_id, name, type, emoji, color, is_default)
      VALUES (NULL, ${c.name}, ${c.type}, ${c.emoji}, ${c.color}, true)
      ON CONFLICT (user_id, name) DO NOTHING
    `;
  }

  await sql`CREATE INDEX IF NOT EXISTS idx_exp_user_date ON expenses (user_id, date DESC)`;
  console.log('Migration complete.');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
