const { sql, json, requireAuth } = require('../_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  const uid = requireAuth(req, res);
  if (!uid) return;

  const { month } = req.query;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    return json(res, 400, { error: 'month=YYYY-MM is required' });

  const from = `${month}-01`;
  const db = sql();

  const rows = await db`
    SELECT type, category,
           SUM(amount)::float8 AS total,
           COUNT(*)::int        AS count
    FROM   expenses
    WHERE  user_id = ${uid}
      AND  date >= ${from}::date
      AND  date <  (${from}::date + interval '1 month')
    GROUP  BY type, category
    ORDER  BY total DESC
  `;

  const sumType = t => rows.filter(r => r.type === t).reduce((s, r) => s + r.total, 0);
  const income  = sumType('income');
  const expense = sumType('expense');

  return json(res, 200, {
    income,
    expense,
    balance: income - expense,
    total: expense,
    byCategory: rows
      .filter(r => r.type === 'expense')
      .map(({ category, total, count }) => ({ category, total, count })),
    incomeByCategory: rows
      .filter(r => r.type === 'income')
      .map(({ category, total, count }) => ({ category, total, count })),
  });
};
