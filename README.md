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

## Deploy to Vercel (free)

### 1. Get a free database
- Sign up at [neon.tech](https://neon.tech)
- Create a project → copy the **Neon Serverless** connection string (starts with `postgres://`)

### 2. Deploy

```bash
npm install -g vercel
vercel login
vercel --prod
```

During setup, Vercel will ask you for environment variables. Add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Your Neon connection string |
| `JWT_SECRET` | A random 48-char secret (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `NODE_ENV` | `production` |

Vercel will automatically run `node api/migrate.js` (the buildCommand) before each deploy, keeping the schema up to date.

### 3. Set up CI/CD (GitHub Actions)

1. Push the repo to GitHub
2. In the Vercel dashboard: **Settings → Tokens** → create a token
3. In GitHub: **Settings → Secrets → Actions**, add:
   - `VERCEL_TOKEN` — the token you just created
   - `VERCEL_ORG_ID` — from `.vercel/project.json` after first deploy
   - `VERCEL_PROJECT_ID` — same file

Every push to `main` now runs the CI checks and deploys to Vercel automatically. Pull requests run CI only (no deploy).

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

---

## Why Vercel (not Render/Fly)?

Vercel's free tier doesn't sleep between requests (unlike Render free), has zero cold-start penalty for serverless functions written in Node.js, includes automatic HTTPS and global CDN, and the Neon serverless Postgres driver is built for this environment. The combination is genuinely free indefinitely for personal projects.

**Docker:** Docker isn't used here because Vercel's serverless model doesn't need it — each `api/*.js` file becomes its own function. If you want to self-host instead (VPS, Fly.io, Railway), add back the `Dockerfile` and `docker-compose.yml` from the earlier version.
