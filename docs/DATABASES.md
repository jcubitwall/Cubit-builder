# The databases

Cubit Builder keeps its data in two databases. Nothing is kept in files: not in R2, not in this repo.

| | What's in it | Reached through |
|---|---|---|
| **MariaDB** (structured) | team and roles · customers, their history, their homes · each home's name, owner, revision, who saved it, lock and unlocks · signings · price book and price history · shop-list ticks · STEP import log · an index row for every photo, signed PDF and STEP file | Cloudflare **Hyperdrive** (binding `MARIADB`) |
| **MongoDB** (unstructured) | each home's design and every earlier version · drafts · the team's library (walls, layers, shapes, sub-models, windows & doors, adopted products, kitchens, devices) and every earlier version · library edits · settings · customers' selections · signed records (signatures + summary) · the Cubit catalogue (models, pods, decks, walls, layers, units, families, brands, stores, projects, fixtures, sinks) | the **cubit-mongo** Worker (`workers/mongo`, service binding `MONGO`) |
| **R2** | only bytes: photos, signed PDFs, STEP files. Each one has its row in MariaDB `files`. | binding `STEPS` |

The tables are created by `functions/_sql.js` (`SCHEMA`); the collections are described in `functions/_mongo.js` and `functions/_seed.js`.

## Why the gateway Worker

The site's server code can't keep a connection open between requests. Hyperdrive solves that for MariaDB. Hyperdrive doesn't do MongoDB, so `workers/mongo` holds one MongoDB connection inside a Durable Object that stays warm (about 35 ms a query instead of about 300 ms for a fresh connection), and the site calls it through a service binding.

## Setting it up

Both databases should be in Montreal (AWS `ca-central-1`) so customer data stays in Canada and close to Cloudflare's Toronto/Montreal data centres.

### 1. MongoDB Atlas

1. mongodb.com/atlas → create a project → **Create cluster** → provider AWS, region **ca-central-1 (Montreal)**. M0 (free) holds everything for now; M10 when the team grows.
2. **Database Access** → add a user (password auth, a long random password), role *Read and write to any database*.
3. **Network Access** → add `0.0.0.0/0` (Cloudflare has no fixed addresses; the password and TLS protect it).
4. **Connect → Drivers** → copy the `mongodb+srv://…` string and put the password in it.

### 2. MariaDB

AWS RDS for MariaDB, region **ca-central-1**, smallest instance (`db.t4g.micro`), 20 GB, **public access: yes**, a long random master password, initial database name `cubit`. In its security group allow inbound 3306 from anywhere (Hyperdrive connects over TLS from changing addresses). Any MariaDB 10.6+ host works the same way.

### 3. Cloudflare

1. **Hyperdrive → Create configuration**: name `cubit-mariadb`, type MySQL, host/port/database/user/password from RDS. Hyperdrive tests the connection when it's saved.
2. **The gateway Worker**: from this repo, `cd workers/mongo && npm install && npx wrangler deploy`, then `npx wrangler secret put MONGODB_URI` and paste the Atlas string. (Or Workers → cubit-mongo → Settings → Variables and secrets.)
3. **Pages → cubit-builder → Settings → Bindings → Add**:
   - Hyperdrive: variable `MARIADB` → configuration `cubit-mariadb`
   - Service binding: variable `MONGO` → Worker `cubit-mongo`, entrypoint `MongoGateway`
   - (R2 `STEPS` stays as it is)
4. **Pages → Settings → Runtime**: compatibility date 2026-09-01 or later (that turns on `nodejs_compat`, which the MariaDB driver needs).
5. The Workers Paid plan ($5 a month) is needed: the free plan allows 10 ms of CPU per request, too little for a database driver.

### 4. Moving the data in (once)

1. Deploy. Open **`/migrate.html`** as an admin and press **Move everything**. It copies the JSON files in R2 and the repo's `data/` folder into the databases, step by step, then shows a check: every row should say ✓.
2. Use the app for a bit. When you're happy, press **Delete the old JSON files in R2**. Photos and STEP files stay in R2: they're bytes, indexed in MariaDB.
3. The repo's `data/` folder is then deleted in a follow-up commit (the migration reads it from the deployed site, so it stays until step 1 is done).

Every step can be run again; *Empty both databases first* starts clean.

## After the move

- **STEP imports** don't commit to the repo any more. The GitHub Action fetches the library through the job's one-hour signed link (`/api/file?…&seed=1`), scans the file against that copy, and sends back what changed (`POST /api/file?…`). See `tools/step-import/db_sync.py`.
- **Catalogue tools** (`tools/brands/north_air.py`, `tools/stores/home_depot.py`) write a JSON file on your computer; send it in as an admin with `POST /api/seed/brands` (or `/stores`). From a terminal behind Cloudflare Access: `cloudflared access curl https://cubit-builder.pages.dev/api/seed/brands -X POST -H 'content-type: application/json' --data @brands.json`.
- **Backups**: Atlas takes snapshots (M10 and up; on M0 use `mongodump`); RDS takes daily snapshots (7 days by default).

## Running it locally

You need MariaDB (or MySQL), MongoDB (or FerretDB 2) and `wrangler`:

```sh
npm install                                   # the MariaDB driver
(cd workers/mongo && npm install)
printf 'MONGODB_URI=mongodb://127.0.0.1:27017/\n' > workers/mongo/.dev.vars
(cd workers/mongo && npx wrangler dev --port 8788) &
```

Then a `wrangler.toml` next to `index.html` (not committed) with `pages_build_output_dir = "."`, the R2 bucket `STEPS`, a Hyperdrive binding `MARIADB` with `localConnectionString = "mysql://user:pass@127.0.0.1:3306/cubit"`, and a service binding `MONGO` → `cubit-mongo` / `MongoGateway`; run `npx wrangler pages dev .`. Locally there's no Cloudflare Access, so nobody is signed in: for testing, set the sign-in yourself in `_auth.js` on your copy only.
