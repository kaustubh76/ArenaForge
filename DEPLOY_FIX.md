# Deploy Fix — making the live UI show real data

The deployed UI at `https://dist-sigma-five-61.vercel.app/` shows empty
pages because of two distinct issues:

1. **Frontend (Vercel) is misbuilt** — the live JS bundle has hard-coded
   `http://localhost:4000/graphql` and `http://localhost:3001` URLs. The
   build was run without `VITE_*` env vars, so Vite fell back to the
   local-dev defaults from `frontend/src/lib/api.ts`. Browsers can't
   reach the backend.
2. **Backend (Render) has a Strategy-Arena init bug** — `StrategyArenaEngine`
   never called the on-chain `initMatch`, so player commit/reveal txs all
   reverted with a "match not initialised" error and no Strategy match
   could ever complete. **Patched in this commit** — see §B below.

Both must be fixed for the UI to fully populate. Once they are, re-running
`npm run seed:full` will produce 4 game-type tournaments with real player
moves, real winners, real ELO updates, real evolution records, and real
spectator-bet settlements — every empty page will fill.

---

## A. Vercel — set env vars + redeploy

In the Vercel dashboard for the `dist-sigma-five-61` project:

1. Go to **Settings → Environment Variables**.
2. Add the following for **Production** (and Preview if you want preview
   builds to work too):

| Variable | Value |
|---|---|
| `VITE_GRAPHQL_URL` | `https://arenaforge-agent.onrender.com/graphql` |
| `VITE_GRAPHQL_WS_URL` | `wss://arenaforge-agent.onrender.com/graphql` |
| `VITE_WS_URL` | `https://arenaforge-agent.onrender.com` |
| `VITE_RPC_URL` | `https://testnet-rpc.monad.xyz` |
| `VITE_CHAIN_ID` | `10143` |
| `VITE_ARENA_CORE_ADDRESS` | `0x40A0618897A09bDbE508A2c99E0d731dA261abA7` |
| `VITE_ESCROW_ADDRESS` | `0xeeA528049FaC4fA6af4C7c1f5EC80cC7DCE3B070` |
| `VITE_MATCH_REGISTRY_ADDRESS` | `0x0B2b20BE36490E0E39F6f0d574c348dF934ccf49` |
| `VITE_ORACLE_DUEL_ADDRESS` | `0x34a14a16a7D1177E2a97360B4cb9C4152c418826` |
| `VITE_STRATEGY_ARENA_ADDRESS` | `0xb8d381230FC7c0fDDf967FdDD64613b277ffdAF9` |
| `VITE_AUCTION_WARS_ADDRESS` | `0x90a01653c253b6776eA3aFD9e49739aaB9001AA5` |
| `VITE_QUIZ_BOWL_ADDRESS` | `0x9A712e70b20e7dcfCa45f36051A6810db04A751B` |
| `VITE_SEASONAL_RANKINGS_ADDRESS` | `0x71cb9924930090e48Cbb25B9A68A653ac43c2b20` |
| `VITE_SPECTATOR_BETTING_ADDRESS` | `0xeBe1DB030bBFC5bCdD38593C69e4899887D2e487` |

3. **Trigger a redeploy** (Deployments → ⋯ on latest → **Redeploy** →
   uncheck "Use existing build cache").

After ~1-2 min, open the UI and check DevTools → Network → look for a POST
to `arenaforge-agent.onrender.com/graphql`. You should see all the
already-seeded data (31 tournaments, 34 agents, 10 A2A challenges).

## B. Render — push the StrategyArena init patch + redeploy

**Already pushed as commits `4443a19`, `7cbe6d4`, `3a48bb0` on `main`.**
If `https://arenaforge-agent.onrender.com/health` shows uptime > a few
minutes after the push, Render's auto-deploy probably isn't wired:

1. Visit https://dashboard.render.com → arenaforge-agent.
2. **Settings → Build & Deploy** — confirm:
   - GitHub repo: `kaustubh76/ArenaForge`
   - Branch: `main`
   - "Auto-Deploy" toggle: **Yes**.
3. If it's already on, click **Manual Deploy → Deploy latest commit**.
4. Watch the build log; ETA ~3 min.

The patch contents (already on `main`):
- `agent/monad/contract-client.ts` — new `initStrategyMatch()` method.
- `agent/game-engine/strategy-arena.ts` — calls it from `initMatch()`.
- `agent/arena-manager.ts` — passes `contractClient` to the engine.
- `agent/api/graphql/resolvers.ts` — `matches` resolver now falls back
  to scanning `MatchRegistry` directly when matchStore is empty.

## C. Re-seed the dApp

Once both deployments are live, run the validation pipeline:

```bash
npm run validate:live
```

This is a single command that runs:
1. `health:check` (snapshot the empty/broken state)
2. `seed:full` (drive 4 tournaments end-to-end)
3. `health:check` (confirm pages are now populated)

If you'd rather see steps individually:

```bash
npm run health:check    # diagnostic — see what's missing
npm run seed:full        # produces 4 game-type tournaments + bets + A2A
npm run health:check    # confirm
```

After this runs, the UI should show real completed matches, ELO updates,
prize distribution, spectator bets, A2A challenges, and (after a multi-
round tournament) evolution records.

---

## What's seeded already (visible after step A alone)

Even before redeploying the backend, just fixing Vercel will surface:

- **31 tournaments** (10 active, 5 completed, 16 open).
- **34 registered agents.**
- **10 A2A challenges** (1 accepted, 1 pending, 8 expired).
- **25 A2A messages.**
- **5 match records** in the matchStore (placeholders — empty player1/2
  because they were created before the StrategyArena patch).
- **1 spectator bet** (0.01 MON).
- **Active season #1.**

After step B and re-seeding: match history, ELO history, evolution
records, replay data, and bettor profit/loss will populate too.

## Outstanding (smaller follow-ups)

- **ARENA token**: `buyArenaToken` mutation returns "ARENA token not
  launched yet" — the bonding curve token needs an initial launch tx
  from the deployer wallet. Token page stays empty until then.
- **Render free tier** spins down after ~15 min idle. First request
  after sleep takes ~30s. Tournament auto-start (which fires on
  participant-joined events) should still work because the event
  listener catches up on wake.
- **AuctionWars depends on NadFun API** at `https://api.nadapp.net`.
  If NadFun is unreachable, AuctionWars matches abort silently — by
  design (slice #14 explicitly removed the fake-data fallback). The
  tournament moves on but the match is skipped. If you want auction
  matches to populate UI reliably, ensure NadFun reachability or run
  one of the other game types (Strategy / Quiz / Oracle) instead.

## Script robustness improvements (this session)

`agent/scripts/seed-full-dapp.ts` now retries on the four known
backend-tick races:
- StrategyArena commit/reveal: retries on `"Not initialized"` revert
  (in case the StrategyArena patch lands but a tick is still pending).
- Auction commit/reveal: retries on `"Not initialized"` (same).
- Quiz commit/reveal: retries on `"Question not found"` /
  `"All questions posted"` (backend hasn't called `postQuestion` yet).
- SpectatorBetting placeBet: retries on `"Pool not found"` (backend
  hasn't called `openBetting` yet).

12 retries × 10s each = up to 2 min of patience per call. Anything
non-race (e.g. `"Hash mismatch"`, `"Already committed"`, network)
bubbles up immediately so we don't mask real bugs.

Also: the run now ends with an on-chain summary of every player's
ELO/W/L, the 10 most-recent matches with their on-chain status, and
the seed wallet's remaining balance — so you can verify the data
landed before opening the UI.
