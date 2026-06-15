# 2v2 Basketball Championship

A small, self-hosted web app to plan and run a one-afternoon 2v2 basketball
championship with friends and family:

- Friends **self-enroll** on their phones (name, height, weight, years playing,
  whether they play regularly, and a self-rated skill).
- The app builds **fairness-balanced 2v2 teams** from those attributes, and you
  can tap to **swap players** or rename teams before locking them in.
- Locking the teams generates a **round-robin schedule** automatically.
- A **scoring dashboard** records each player's points per game.
- Live **standings**, **player leaderboards** and **highlights** update as you go.

It is designed to run as a single process on a Raspberry Pi (or any computer)
and be opened by everyone on the same Wi-Fi.

---

## Tech stack

- **Frontend:** React + TypeScript + Vite (mobile-first).
- **Backend:** Node.js + Fastify, serving both the API and the built frontend.
- **Database:** SQLite via `better-sqlite3` (a single file, no separate server).
- **Access control:** public self-enrollment + a single shared **admin password**
  that unlocks score entry, team management and deletions.

---

## Quick start (development)

Requires **Node.js 18+** (Node 20 LTS recommended).

```bash
npm install
npm run dev
```

- API runs on `http://localhost:3000`
- Frontend (with hot reload) runs on `http://localhost:5173` and proxies `/api`
  calls to the backend.

The default admin password in development is `changeme`. Set your own with an
environment variable: `ADMIN_PASSWORD=secret npm run dev`.

---

## Production build

```bash
npm install
npm run build      # builds the frontend into ./dist
ADMIN_PASSWORD=your-secret npm start
```

`npm start` runs the Fastify server, which serves the API **and** the built
frontend from a single port (default `3000`). Open `http://<machine-ip>:3000`.

On startup the server prints every URL it can be reached at on your network.

---

## Running on a Raspberry Pi

1. **Install Node.js** (LTS) on the Pi, e.g. via [NodeSource](https://github.com/nodesource/distributions)
   or `sudo apt install nodejs npm`. Check with `node -v` (needs 18+).

2. **Copy the project** to the Pi (git clone or `scp`) and install + build:

   ```bash
   cd sports-event-planner
   npm install
   npm run build
   ```

3. **Set your admin password and start it:**

   ```bash
   cp .env.example .env     # then edit .env and set ADMIN_PASSWORD
   ADMIN_PASSWORD="your-secret" npm start
   ```

   (Environment variables in `.env` are read by your shell/process manager; the
   simplest path is to pass `ADMIN_PASSWORD` inline as shown.)

4. **Find the Pi's IP** (`hostname -I`) and share `http://<pi-ip>:3000` with
   everyone. They can enroll and watch standings; you log in as **Admin** (top
   right) with your password to manage teams and enter scores.

### Keep it running after reboot (optional)

Using `pm2`:

```bash
sudo npm install -g pm2
ADMIN_PASSWORD="your-secret" pm2 start "npm start" --name bball
pm2 save
pm2 startup        # follow the printed instructions
```

Or a minimal `systemd` service at `/etc/systemd/system/bball.service`:

```ini
[Unit]
Description=2v2 Basketball Championship
After=network.target

[Service]
WorkingDirectory=/home/pi/sports-event-planner
Environment=ADMIN_PASSWORD=your-secret
Environment=PORT=3000
ExecStart=/usr/bin/npm start
Restart=on-failure
User=pi

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now bball
```

---

## Docker (optional)

```bash
docker build -t bball .
docker run -p 3000:3000 -e ADMIN_PASSWORD=your-secret -v "$(pwd)/data:/data" -e DB_PATH=/data/data.db bball
```

The volume keeps your `data.db` between restarts.

---

## How fairness balancing works

Each player gets a transparent **0-100 rating** from a weighted blend of
normalized attributes (see [`server/services/balance.ts`](server/services/balance.ts)):

| Attribute            | Weight | Notes                                  |
| -------------------- | ------ | -------------------------------------- |
| Self-rated skill     | 50%    | The strongest signal.                  |
| Years playing        | 20%    | Capped at 15 years (diminishing).      |
| Plays regularly      | 10%    | Simple yes/no bonus.                   |
| Height               | 20%    | A small athleticism factor.            |

Weight (kg) is stored for info but does **not** raise a player's rating.

Teams are formed with a greedy "snake" pairing: players are sorted by rating and
the strongest is paired with the weakest, the next strongest with the next
weakest, and so on. This keeps every pair's combined rating close to the
average. The app shows a **balance gap** (difference between the strongest and
weakest team) so you can judge fairness; tap two players to swap them and watch
the gap change. With an odd number of players, the middle-rated player sits out
(shown under "Sitting out / unassigned").

The weights are all in one place at the top of `balance.ts` if you want to tune
them.

---

## Daily flow on game day

1. Share the URL; friends open **Enroll** and add themselves.
2. As organiser, log in via **Admin**.
3. Go to **Teams** -> *Generate balanced teams* -> swap/rename if you like ->
   *Lock & schedule*.
4. Open **Games** and enter each player's points; *Save as final* when a game
   ends. Optionally *Add an extra game* for a final between the top two.
5. Everyone watches **Standings** update live.

---

## Project structure

```
server/
  index.ts            # Fastify app, serves API + built frontend
  db/                 # SQLite connection, schema, data-access layer
  routes/             # players, teams, games, stats, admin
  services/           # balance (fairness), schedule (round-robin), stats, auth
src/
  pages/              # Enroll, Players, Teams, Dashboard (Games), Stats
  api.ts              # typed fetch client
  AdminContext.tsx    # admin login state
```

## Notes / out of scope

- One shared admin password (no per-user accounts).
- Designed for a trusted local network; it does not set up HTTPS or expose
  itself to the public internet.
- Standings refresh when you navigate between tabs (no live websockets).
