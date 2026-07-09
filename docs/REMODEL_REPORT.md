# 2v2 Basketball Tournament Remodel Report

## 1. Research Notes

This app should stay small because the event is small: a family 2v2 basketball tournament. The useful ideas from larger sports products are the ones that reduce work on game day, not the ones that add administration.

### Products and patterns reviewed

- **GameChanger** focuses on live scorekeeping, team schedules, rosters, stats, video/live following, and post-game summaries. The key lesson is that score entry should immediately feed spectators and standings, because families care most about "what is happening now?" and "who is winning?" Source: [GameChanger overview](https://en.wikipedia.org/wiki/GameChanger).
- **Sportdata-style event platforms** combine registration, scheduling, live results, ranking systems, and public broadcast/display surfaces. The lesson for this app is the end-to-end flow: enroll -> schedule -> score -> rank -> display. Source: [Sportdata overview](https://en.wikipedia.org/wiki/Sportdata).
- **Round-robin tournaments** are well suited for small groups because everyone plays everyone else once, which is fairer and gives more play time. The downside is match count, but a family 2v2 event usually has few teams, so round robin remains the best default. Source: [Round-robin tournament](https://en.wikipedia.org/wiki/Round-robin_tournament).
- **Single-elimination brackets** are fast and exciting, but weaker for a family tournament because half the teams can be out after one game. They are better as a finale after round robin than as the whole event. Source: [Single-elimination tournament](https://en.wikipedia.org/wiki/Single-elimination_tournament).
- **Double-elimination/repechage ideas** solve the "one bad game and you are done" problem, but add schedule complexity. Your current app already has a second-chance/repechage concept, which is a good compromise if the group wants bracket drama. Source: [Double-elimination tournament](https://en.wikipedia.org/wiki/Double-elimination_tournament).
- **Swiss-system tournaments** are useful when there are too many entrants for round robin but you still do not want early elimination. For this family 2v2 context, Swiss is probably overkill unless the tournament grows a lot. Source: [Swiss-system tournament](https://en.wikipedia.org/wiki/Swiss-system_tournament).

### Feature takeaways

- Keep **enrollment lightweight** and mobile-first.
- Keep **team balancing transparent**, because family tournaments are social and perceived fairness matters.
- Make **Standings the home base**: progress, next match, leaders, and public display should all be visible there.
- Keep **round robin as the default**, with bracket/repechage as optional spice.
- Avoid enterprise event-management complexity: no payments, venues, notifications, referee assignments, or long setup wizard unless the family event truly needs them.

## 2. Existing Code Analysis

The existing app is already quite mature. It is a React + TypeScript + Vite frontend with a Fastify + SQLite backend. It supports organiser auth, participant tournament access, self-enrollment, player photos, tournament-scoped rosters, fairness-balanced teams, round-robin generation, knockout/bracket matches, repechage, public display mode, scoring, standings, player leaderboards, and awards.

Core preserved features:

- Family basketball tournament identity.
- 2v2 default team size.
- Participant password entry.
- Organiser/admin mode.
- Player directory and tournament roster.
- Balanced team generation and manual player swaps.
- Team locking/unlocking.
- Round-robin, knockout, and custom match creation.
- Player-level score entry.
- Standings, leaderboards, awards, and public display mode.
- English/French/Portuguese UI strings.

Main opportunities found:

- The **Standings** page had the right data but not enough game-day context. It showed rankings after play started, but did not summarize readiness, progress, or next match.
- The visual system was heavily dark blue and card-heavy. On a phone outdoors or in a busy family setting, the app benefits from brighter surfaces and stronger hierarchy.
- The public display mode was already a strong idea and should remain a first-class spectator surface.
- The app should keep avoiding feature bloat. It is tempting to add full league-management concepts, but they would make this less friendly for a one-afternoon family tournament.

## 3. Remodel Implemented

### Game-day overview

The Standings page now includes a game-day panel that:

- Shows current tournament readiness or progress.
- Calculates players, teams, and completed/total games.
- Highlights a live or next scheduled match.
- Gives quick access to the relevant next screen.
- Keeps the public TV/display link visible when available.

This turns Standings into the natural first screen during the event.

### Visual refresh

The app now uses a brighter court-side dashboard style:

- Light neutral background for better outdoor readability.
- Green/orange sports accents without staying trapped in one dark-blue palette.
- Cards and controls tightened to 8px radii.
- Flatter top navigation and clearer active states.
- Responsive treatment for the game-day panel on phones.

### Documentation

This report is intended as the living remodel brief. It records research, current product analysis, design direction, open challenges, and test results.

## 4. Product Direction I Recommend

For a family 2v2 basketball tournament, I would make the app feel like a **game-day control table**:

- **Before play:** Enroll players, confirm roster, generate balanced teams.
- **Start:** Lock teams, generate round robin.
- **During play:** Standings shows next match and progress; Games handles score entry.
- **Spectators:** Public display mode stays open on a TV/tablet.
- **End:** Awards and leaderboard become the fun recap.

### Suggested future improvements

- Add a simple "Finals from standings" button that creates 1st vs 2nd after round robin.
- Add optional game target rules per tournament: timed game, first to 11, first to 21.
- Add a small "fairness explanation" modal on Teams so players understand why teams were paired.
- Add offline-friendly refresh handling for Raspberry Pi/local Wi-Fi use.
- Add export/share recap after the tournament: champion, MVP, top scorer, closest game.

## 5. Topics I Would Challenge

- **Do we really need formats beyond round robin + final?** Knockout/repechage is fun, but for a family event, guaranteed play time may matter more than bracket purity.
- **Should player self-rating count 50%?** It is transparent and easy, but families may underrate or overrate themselves. A post-tournament adjustment could make future events fairer.
- **Should the public display be accessible without a password?** It is convenient, but anyone with the link can view it. For a family tournament this is probably acceptable, but it is a deliberate privacy tradeoff.
- **Should team size remain configurable?** The app currently supports more than 2v2 in settings. I kept that feature, but the product identity should still default strongly to 2v2.

## 6. Tests Run

Automated/local checks:

- `npm run typecheck` passed.
- `npm run build` passed.

Browser smoke tests:

- Opened `http://localhost:5173/`.
- Verified the home page renders the tournament entry form.
- Verified no browser console errors on the home page.
- Opened `http://localhost:5173/display/tournament-1-1`.
- Verified public display mode renders tournament title, standings, and awards.
- Verified no browser console errors in display mode.
- Tested display mode at desktop/default viewport.
- Tested display mode at `390 x 844` mobile viewport.
- Verified no horizontal overflow in display mode on mobile.
- Tested home page at `390 x 844` mobile viewport.
- Verified no horizontal overflow on the home page.
- Verified home card radius is `8px`.

Known test limitation:

- I did not authenticate through the private organiser flow in the browser because no plaintext credentials are available in the local database. The new private Standings panel is covered by TypeScript/build checks and uses existing authenticated API calls (`getStats` and `getGames`).

