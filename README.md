# Taawun / VISS CRM

A login-protected CRM that replaces the monthly Excel files (Renewals, Follow-up trackers, Meta Leads)
across all 6 locations. Managers see everything; agents see only their assigned, location-scoped customers.

## Features
- **Roles:** Manager (all data, all agents) and Agent (own customers only).
- **Unified customer database** with a `List` field: Renewal / Lead / Follow-up / Trial / Unscheduled.
- **Excel import** that auto-detects the 3 formats and **updates existing customers** (matched by phone +
  program + location) or adds new ones. Re-upload each month to keep data current. Manual history is preserved.
- **"Who to call today" dashboard:** renewals due soon, follow-ups due/overdue, and manager-review items.
- **3-stage follow-up automation:** logging a follow-up sets the next date to **+2 days**, then **+5 days**,
  then **flags the customer for manager review**.
- **Record actions:** log calls, change status, set next follow-up, add notes.
- **Add new lead** form.
- **Activity history:** every call / note / status change / import is timestamped per customer and per agent.
- **User & location admin** for the manager.

## Tech
React (Vite) · Node/Express · Prisma · PostgreSQL. The server also serves the built client, so it deploys
as a single web service.

## Project layout
```
crm-app/
  client/                 React app (Vite)
  server/
    src/
      routes/             auth, customers, dashboard, import, users, locations
      services/import/    detect.js, parsers.js, index.js (upsert engine)
      lib/                date.js, phone.js, mappings.js, prisma.js
      middleware/auth.js  JWT + role guards
    prisma/
      schema.prisma
      seed.js             creates manager + locations, ingests seed-data/*.xlsx
      seed-data/          your 20 June Excel files (bundled for first-run seeding)
    scripts/test-parsers.js   validates parsing against seed-data (no DB needed)
  Dockerfile, render.yaml      one-click-ish deploy
  GO-LIVE.md                   step-by-step deploy guide
```

## Run locally
You need a PostgreSQL database (e.g. a free Neon one — see GO-LIVE.md step 1).

```bash
# 1. configure the server env
cd server
cp .env.example .env
#   edit .env and paste your DATABASE_URL and a JWT_SECRET

# 2. install + create the schema + seed your June data
npm install
npx prisma db push        # creates all tables
npm run db:seed           # creates manager + agents + imports the 20 Excel files

# 3. start the API (terminal 1)
npm run dev               # http://localhost:4000

# 4. start the client (terminal 2)
cd ../client
npm install
npm run dev               # http://localhost:5173  (proxies /api to :4000)
```

Default manager login after seeding: `manager@taawun-crm.local` / `manager123` (change it immediately in
the Users page). Auto-created agents get the password `changeme123` — reset them in the Users page.

## Monthly update workflow
1. Log in as a manager → **Import Excel**.
2. Drag in your Renewal / Follow-up / Meta Leads sheets (any mix). Format is detected automatically.
3. Existing customers are updated; new rows are added; the dashboard reflects new follow-up/renewal dates.

## Validate parsing without a database
```bash
cd server && node scripts/test-parsers.js
```
This parses every file in `prisma/seed-data/` and prints record counts per format.

## Going live
See **GO-LIVE.md**.
