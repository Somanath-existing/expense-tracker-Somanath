// Run once: node api/migrate.js
// Also called by Vercel buildCommand so the schema is always up-to-date.
try { require('dotenv').config({ path: '.env.local' }); } catch (_) {}
const { neon } = require('@neondatabase/serverless');

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL environment variable is not defined.');
    process.exit(1);
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
  await sql`CREATE INDEX IF NOT EXISTS idx_exp_user_date ON expenses (user_id, date DESC)`;
  console.log('Migration complete.');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
