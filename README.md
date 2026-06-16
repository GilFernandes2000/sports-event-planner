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
- **Access control:** organiser **accounts** (email/password or Google) each own their
  tournaments; participants enter with tournament name + participant password.

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

The default organiser flow in development: open the home page, choose **Create an
account** (or use Google if configured), then create a tournament on **Events**.

Set `PUBLIC_URL` and optional Google OAuth vars in `.env` (see `.env.example`).

---

## Production build

```bash
npm install
npm run build      # builds the frontend into ./dist
npm start
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

3. **Configure and start:**

   ```bash
   cp .env.example .env     # set PUBLIC_URL; optional Google OAuth
   npm start
   ```

4. **Find the Pi's IP** (`hostname -I`) and share `https://<your-domain>` (or
   `http://<pi-ip>:3000` on a trusted LAN) with everyone. They enter the
   **tournament name and participant password** on the home page. Organisers
   **create an account** to manage their tournaments.

### Exposing on the internet

Use **HTTPS** in front of the app (Caddy, nginx, Cloudflare, or your host's
TLS). Never send passwords over plain HTTP.

- Organisers register with email/password or Google; each account only sees its own
  tournaments.
- When creating a tournament, set a strong **participant password** (random string).
  Share the tournament name and password with players.
- Login attempts are rate-limited (10 per 15 minutes per IP).
- Participant sessions expire after 7 days; they can re-enter with the password.

Example with [Caddy](https://caddyserver.com/) reverse proxy:

```text
your-domain.example {
  reverse_proxy localhost:3000
}
```

Run the app with `PUBLIC_URL` set and ensure `DB_PATH` is on a persistent
volume with restricted file permissions.

### Keep it running after reboot (optional)

Using `pm2`:

```bash
sudo npm install -g pm2
pm2 start "npm start" --name bball
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
Environment=PUBLIC_URL=https://your-domain.example
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
docker run -p 3000:3000 -e PUBLIC_URL=https://your-domain.example -v "$(pwd)/data:/data" -e DB_PATH=/data/data.db bball
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

1. Create a tournament on the **Events** page (admin) with a participant password.
   Share the tournament name and password with friends.
2. Friends open the home page, enter the name and password, then use **Enroll**.
3. As organiser, log in via **Admin**.
4. Go to **Teams** -> *Generate balanced teams* -> swap/rename if you like ->
   *Lock & schedule*.
5. Open **Games** and enter each player's points; *Save as final* when a game
   ends. Optionally *Add an extra game* for a final between the top two.
6. Everyone watches **Standings** update live.

---

## Project structure

```
server/
  index.ts            # Fastify app, serves API + built frontend
  db/                 # SQLite connection, schema, data-access layer
  routes/             # players, teams, games, stats, admin, access
  services/           # balance (fairness), schedule (round-robin), stats, auth
src/
  pages/              # Home, Enroll, Players, Teams, Dashboard (Games), Stats
  api.ts              # typed fetch client
  AdminContext.tsx    # admin login state
  TournamentAccessContext.tsx  # participant tournament session
```

## Notes / out of scope

- Open organiser registration (email/password or Google); each account owns its tournaments.
- HTTPS must be configured at the reverse proxy for public internet use.
- Standings refresh when you navigate between tabs (no live websockets).
