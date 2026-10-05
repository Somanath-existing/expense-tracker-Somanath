# ExpenseFlow

A personal finance tracker — income, expenses, categories, monthly summaries — with user accounts so your data follows you across devices.

**Stack:** vanilla HTML/CSS/JS frontend · Node.js serverless API · PostgreSQL (Neon) · deployed on Vercel (free tier)

---

## Features

- **Accounts** — register & sign in; each user sees only their own data
- **Transactions** — add income or expenses with title, amount, date, category, note
- **Categories** — Food, Transport, Shopping, Bills, Entertainment, Other, Salary, Freelance, Investment
- **Monthly overview** — balance, total income, total expenses, donut chart, category breakdown
- **Filters** — search, type (income/expense), category, date range
- **Security** — httpOnly cookies, bcrypt passwords, rate limiting, parameterised queries, Helmet headers

---

## Run locally

### Prerequisites
- Node.js 20+
- A free PostgreSQL database from [neon.tech](https://neon.tech)

### Steps

```bash
git clone https://github.com/YOUR_USERNAME/expense-tracker-candidate-name
cd expense-tracker-candidate-name

# Install dependencies
npm install

# Set up environment
cp .env.local.example .env.local
# Edit .env.local — paste your DATABASE_URL from Neon and generate a JWT_SECRET

# Create the database tables
node api/migrate.js

# Start locally with Vercel dev (recommended — respects vercel.json routing)
npx vercel dev
```

Then open http://localhost:3000

---



## Project structure

```
├── api/
│   ├── _lib.js               # Shared helpers (DB, auth, validation)
│   ├── migrate.js            # Schema migration (run on deploy)
│   ├── auth/
│   │   ├── register.js       # POST /api/auth/register
│   │   ├── login.js          # POST /api/auth/login
│   │   ├── logout.js         # POST /api/auth/logout
│   │   └── me.js             # GET  /api/auth/me
│   └── expenses/
│       ├── index.js          # GET/POST /api/expenses
│       ├── [id].js           # PUT/DELETE /api/expenses/:id
│       └── summary.js        # GET /api/expenses/summary
├── public/
│   ├── index.html            # Main app
│   ├── login.html            # Login / register
│   ├── app.js                # App logic
│   └── styles.css            # Design system
├── .github/workflows/
│   └── ci-cd.yml             # CI lint + Vercel deploy
├── vercel.json               # Routing + security headers
└── README.md
```

