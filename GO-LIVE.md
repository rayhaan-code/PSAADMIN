# Go Live — deploy the CRM to a public URL

This takes ~10–15 minutes. You'll create two free accounts (a database and a host),
then deploy. **These steps require you** because they need your email, signups, and secrets —
they can't be done from a code editor.

There are two paths. **Path A (Render Blueprint)** is the simplest: it creates the database
AND the web service together from the included `render.yaml`.

---

## Path A — Render Blueprint (recommended, all-in-one)

### 1. Put the code on GitHub
```bash
cd crm-app
git init
git add .
git commit -m "Taawun CRM initial"
# create an empty repo at github.com/new, then:
git remote add origin https://github.com/<you>/taawun-crm.git
git branch -M main
git push -u origin main
```

### 2. Create the Render Blueprint
1. Go to **https://render.com** and sign up (free).
2. Click **New → Blueprint**.
3. Connect your GitHub and pick the `taawun-crm` repo.
4. Render reads `render.yaml` and proposes a **Postgres database** + a **web service**.
5. For the `SEED_MANAGER_PASSWORD` variable, enter a password you'll remember.
6. Click **Apply**. Render builds the Docker image, provisions Postgres, and deploys.
   - On boot the app runs `prisma db push` to create all tables automatically.

### 3. Seed your data (one time)
The tables exist but are empty. To load your June Excel files + create the manager account:
1. In Render, open the **taawun-crm** service → **Shell** tab.
2. Run:
   ```bash
   cd server && npm run db:seed
   ```
   This creates the manager login, the 6 locations, the agents, and imports the bundled sheets.

### 4. Log in
- Open the service URL Render gives you (e.g. `https://taawun-crm.onrender.com`).
- Log in with `manager@taawun-crm.local` and the `SEED_MANAGER_PASSWORD` you set.
- **Immediately** go to Users and reset passwords (manager + each agent).

### 5. Auto-updates from then on
Every month, log in as manager → **Import Excel** → upload the new sheets. Done.
(If you push new code to GitHub, Render auto-redeploys.)

---

## Path B — Neon (database) + any host

Use this if you prefer Neon for the database or a different host.

### 1. Create a free Postgres at Neon
1. Go to **https://neon.tech** → sign up → **Create project**.
2. Copy the connection string — looks like:
   `postgresql://user:pass@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`

### 2. Set up the schema + seed (from your machine)
```bash
cd server
cp .env.example .env
# paste the Neon string into DATABASE_URL, set a JWT_SECRET
npm install
npx prisma db push      # create tables
npm run db:seed         # manager + locations + agents + import 20 files
```

### 3. Deploy the web service
On Render (or Railway/Fly), create a **web service** from your GitHub repo using the included
`Dockerfile`, and set these environment variables:
- `DATABASE_URL` = your Neon string
- `JWT_SECRET` = a long random string
The container serves both the API and the website on the port the host provides.

### 4. Log in & reset passwords
Same as Path A step 4.

---

## Notes
- **Free Postgres tiers** (Neon/Render) are fine to start; upgrade later if you outgrow them.
- **Backups:** Neon and Render both offer backups on paid tiers; export periodically if you stay on free.
- **Security:** change all seeded passwords on first login. The `JWT_SECRET` must be kept private.
- **Re-seeding** is safe to run again — imports upsert by phone+program+location and won't duplicate.
