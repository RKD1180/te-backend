# Sneaker Drop Backend

Real-time high-traffic inventory system for limited edition sneaker drops.

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL (Neon)
- **ORM**: Sequelize
- **Real-time**: Socket.io
- **Auth**: JWT (jsonwebtoken + bcryptjs)

## Features

- **Atomic Reservations** — `SELECT ... FOR UPDATE` row locking prevents overselling (no two users can claim the same last item).
- **60-Second Reservation Window** — items are held for 60s, then automatically restocked.
- **Stock Recovery Service** — background job restores stock when reservations expire.
- **Real-time Updates** — WebSocket broadcasts stock changes, expiry, and purchases.
- **Drop Activity Feed** — each drop returns its 3 most recent purchasers.

## Running the App

### Prerequisites

- Node.js 18+
- A PostgreSQL database. I built this against [Neon](https://neon.tech) serverless Postgres, but any Postgres 14+ instance will work fine.

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Copy the `.env.example` file to `.env` in the `backend/` directory and fill in
your values:

```env
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://username:password@host/database?sslmode=require
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
RESERVATION_DURATION_SECONDS=60
STOCK_RECOVERY_INTERVAL_MS=5000
```

If you're using Neon, your connection string already points at a dedicated host,
so make sure SSL is on (`?sslmode=require` or `&sslmode=require` appended).

### 3. Set up the SQL schema

I've kept the schema as plain SQL files under `backend/migrations/` so it's
explicit and versioned. You have two options:

**Option A — run migrations automatically (this is what I'd do):**

```bash
npm run migrate
```

Migrations also run automatically every time the server boots, and I track
applied ones in a small `migrations` table so nothing runs twice.

**Option B — apply the SQL yourself:**

If you'd rather own the schema, run `backend/migrations/001_create_tables.sql`
directly against your database. Here's exactly what it creates:

```sql
-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Drops (limited-edition products)
CREATE TABLE IF NOT EXISTS drops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    total_stock INTEGER NOT NULL,
    available_stock INTEGER NOT NULL,
    starts_at TIMESTAMP NOT NULL,
    ends_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Reservations (the 60-second holds)
CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    drop_id UUID NOT NULL REFERENCES drops(id),
    expires_at TIMESTAMP NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'completed')),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Purchases (confirmed sales, feeds the activity feed)
CREATE TABLE IF NOT EXISTS purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    drop_id UUID NOT NULL REFERENCES drops(id),
    reservation_id UUID REFERENCES reservations(id),
    purchased_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for the hot queries
CREATE INDEX IF NOT EXISTS idx_reservations_user_id ON reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_reservations_drop_id ON reservations(drop_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_purchases_user_id ON purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_drop_id ON purchases(drop_id);
```

> A quick note on the schema: `available_stock` on `drops` is deliberately a
> plain denormalized counter rather than a computed `SUM`. Reasoning — reads here
> outnumber writes massively (every browser polls via sockets, nobody does an
> analytic scan), so I trade a tiny bit of write discipline for O(1) reads that
> never need a join. All writes to it happen inside a transaction with a row lock
> on the drop, so the counter never drifts.

### 4. Start the server

```bash
npm run dev        # Start with nodemon (watch mode) — my go-to for development
npm run start      # Plain production start
npm run seed       # Create demo users, drops, and sample purchases
```

The API will be on `http://localhost:3001`, and the Socket.io server runs on the
same port, so the frontend gets real-time updates without any extra config.

### 5. (Optional) Seed some data

```bash
npm run seed
```

This creates 5 demo users (password `password123`) and 5 drops so the dashboard
and the activity feed actually have something to show.

---

## How I handled the 60-second expiration

The pattern I reached for is a combination of **lazy expiry** at purchase time
and a **background sweep** to tidy up — there's deliberately no per-user timer
running in Node, and no cron scheduler. Here's the thinking.

**The hold.** When someone hits `POST /api/reserve`, I compute an absolute
timestamp and store it on the reservation row:

```
expires_at = now + RESERVATION_DURATION_SECONDS   // 60 by default
```

I store an absolute timestamp rather than a relative TTL for one pragmatic
reason: the expiry's source of truth lives in the database, not in process
memory. That means two app servers, or a server that restarts mid-drop, will
all agree on exactly when a hold dies. An in-memory `setTimeout` per
reservation would be lost the moment the process crashes, and that's the kind
of subtle bug that bites you at the worst time (Black Friday, basically).

**The lazy check.** Expiry is actually enforced in two places, and the more
important one is at purchase time. When a user tries to buy
(`POST /api/purchase`), I re-read the reservation and check the timestamp
*inside the same transaction* that converts the hold into a sale:

```js
if (new Date(reservation.expires_at) < now) {
  await reservation.update({ status: 'expired' });
  // deny the purchase
}
```

The key detail is that this validation and the `Purchase.create()` happen in
one transaction, so a stale reservation can never slip through and become a
sale no matter what the background job was doing at that instant. The sweep
is just housekeeping; the real guarantee is this check.

**The sweep.** A `setInterval` job in `services/stockRecovery.js` runs every
5 seconds (`STOCK_RECOVERY_INTERVAL_MS`), finds active reservations whose
`expires_at` has passed, marks them `expired`, and restores `+1` stock to the
drop — inside a transaction, and then broadcasts `stock-updated` over the
socket so every open dashboard refreshes.

I picked a fixed sweep over, say, a `pg_cron` or a message queue because for
this workload it's the smallest thing that's correct: worst case, a released
item is back on the shelf within 5 seconds, which the schema and UI tolerate
fine. If I ever needed tighter latency I'd swap the sweep for targeted
per-reservation timers on a dedicated cluster, but I wouldn't ship the timer
approach first — it's more moving parts and more crash surface for zero
benefit at this scale.

## How I stopped people from double-buying the last item

The scary scenario is the classic race: two users both see `1 left`, both hit
"Buy" at basically the same instant, and both walk away with a confirmation for
the same unit. Every inventory system has to answer this, and the answer here
is **pessimistic row locking inside a transaction** — `SELECT ... FOR UPDATE`.

The whole flow for `POST /api/reserve` is one DB transaction:

1. Open a `sequelize.transaction()`.
2. Lock the drop row for update:

   ```sql
   SELECT * FROM drops WHERE id = :dropId FOR UPDATE
   ```

3. Check the stock while holding that lock:

   ```js
   if (drop.available_stock <= 0) {
     await transaction.rollback();
     return sendError(res, { message: 'Out of stock', code: 409 });
   }
   ```

4. Decrement the counter:

   ```js
   UPDATE drops SET available_stock = available_stock - 1 WHERE id = :dropId
   ```

5. Insert the reservation and commit.

What `FOR UPDATE` buys you is that Postgres serializes access to that one row.
When two requests arrive together, the second one *blocks* at step 2 until the
first commits. Only then does it read the value — which is now `0` — fail the
step-3 check, and get a clean `409 Out of stock`. Without the lock, both could
read `1`, both pass the check, and you've sold the same sneaker twice. The
greedy check-then-decrement pattern is exactly the bug this design prevents,
which is why I never do a bare read followed by a write.

Two edge paths get the same treatment: cancelling a reservation and the expiry
sweep both restore stock with their own `available_stock = available_stock + 1`
inside a transaction, so increments and decrements always serialize against
each other and the counter can't go negative or lose a unit.

One honest caveat: `FOR UPDATE` serializes writes *per drop*, which is exactly
what you want for "the last pair" correctness. If this ever had to do tens of
thousands of concurrent reserves against a single SKU, I'd layer a queue or
`SKIP LOCKED` on top — but for the problem I was actually asked to solve
(never oversell the last item), plain old row locking is the correct, boring,
production-safe answer.


## API Endpoints

### Auth (Public)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login user |
| GET | `/api/auth/me` | Get current user (protected) |

### Drops (Protected)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/drops` | List all drops with recent purchasers |
| GET | `/api/drops/:id` | Get single drop (with recent purchasers) |
| POST | `/api/drops` | Create new drop (name, price, total_stock, starts_at, ends_at) |

### Reservations (Protected)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reserve?userId=xxx` | Get active reservations for user |
| POST | `/api/reserve` | Reserve an item (atomic with row locking) |
| DELETE | `/api/reserve/:id` | Cancel reservation |

### Purchases (Protected)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/purchase` | Complete purchase |

### Health Check
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server health check |

## Response Format

All responses follow consistent format:

```json
{
  "success": true,
  "message": "Description",
  "data": {},
  "code": 200
}
```

Error example:
```json
{
  "success": false,
  "message": "Out of stock",
  "data": null,
  "code": 409
}
```

## WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `stock-updated` | Server → Client | Broadcasts stock change |
| `reservation-expired` | Server → Client | Notifies expired reservation |
| `purchase-completed` | Server → Client | Notifies completed purchase |

## Deploying to Vercel

The project includes Vercel deployment files (`vercel.json`, `api/index.js`,
`.vercelignore`). The REST API is fully Vercel-compatible — the Express app is
exported from `api/index.js` and pending migrations run automatically on cold
start.

Steps:

1. Push the `backend/` folder to a GitHub repo (or import it directly).
2. In Vercel, create a new project and point it at the backend directory.
3. Add the same environment variables from `.env` to the Vercel project
   settings (Framework Preset: **Other**; Build Command: none; Output
   Directory: none).
4. Deploy.

**Two things to know before you rely on this:**

- **WebSockets won't work serverless.** Socket.io needs a persistent TCP
  connection; Vercel serverless functions can't hold one. The real-time
  events (`stock-updated`, etc.) are a local-development nicety. In
  production, the frontend should poll (or use server-sent events from a
  dedicated server) for stock changes.
- **The stock-recovery sweeper won't run.** `setInterval` dies with the
  function invocation on Vercel, so expired reservations won't auto-restore
  stock. If you deploy this way, restore stock lazily at read time (treat any
  `expires_at < now` reservation as expired in the `GET /api/drops` stock
  count) or run the recovery service on a small always-on host (e.g. Render,
  Railway, or a VPS).

The atomic `SELECT ... FOR UPDATE` reservation and purchase logic work
identically on Vercel — only the real-time and background bits need a
different home.

## Drop Activity Feed

`GET /api/drops` returns each drop with its **3 most recent successful
purchasers** (username + purchase time), nested under `recent_purchases`:

```json
{
  "name": "Air Jordan 1 Retro High OG",
  "price": "180.00",
  "available_stock": 3,
  "recent_purchases": [
    { "user": { "id": "...", "username": "sneakerhead_01" }, "purchased_at": "..." },
    { "user": { "id": "...", "username": "jordan_fan" },      "purchased_at": "..." },
    { "user": { "id": "...", "username": "yeezy_collector" }, "purchased_at": "..." }
  ]
}
```

Implemented in `dropController.js`: to avoid incorrect cross-row nested ordering,
purchases are queried per drop (ordered `purchased_at DESC`, limited to 3,
joined to `User` for the username). The frontend renders this list on each
product card.

## Migrations

Add new migration files in `migrations/` folder with numbered prefix:

```
migrations/
  001_create_tables.sql
  002_add_new_column.sql
```

Use `IF NOT EXISTS` for safe migrations:

```sql
CREATE TABLE IF NOT EXISTS users (...);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
```
