@AGENTS.md

# tavalod — project rules

Persian (RTL) PWA for groups of friends: groups → events → expenses → balances → settlements.
Product rule: **every number shown must be explainable and the books must always balance.**

## Money
- Money is a whole number of Toman: `bigint` in TS, `int8` in Postgres, a decimal **string** in JSON / forms / API. Never `number`, never float.
- Percentages are basis points (100% = 10000). Weights are ×100 (1.5 nights = 150).
- All financial math lives in `src/domain/` (pure, no DB, fully tested). Services and UI call it; never re-implement splits or balances elsewhere.
- Balances are always **derived** from expenses + settlement allocations (`loadGroupLedger` → `computeBalances`); nothing caches a balance.
- Every money write: one transaction → `requireMember` → `lockGroup` → (idempotency claim for creates) → validate with domain → write → `writeAudit` → `notifyMembers`.
- Deferred DB triggers (`drizzle/0001_integrity_triggers.sql`) refuse unbalanced payers/shares/allocations at commit. Don't disable them.
- Only *confirmed* settlements change balances. Only the receiver (or an admin for a guest receiver) confirms.
- Copy says «پیشنهاد تسویه با انتقال کمتر» — the greedy algorithm is not guaranteed minimal.

## Data
- Money references point at `group_members.id` (members may be guests with `user_id` null). A guest is bound to a user only via a single-use `claim` invite.
- Migrations are forward-only and additive (expand/contract); generate with `npm run db:generate`, never edit an applied migration.
- Offline: only *creating* expenses/settlements is queued (IndexedDB per user, `tavalod-<userId>`), replayed through `/api/sync` with idempotency keys.

## Commands
- `npm run db:up` (dev Postgres on 127.0.0.1:5433) · `npm run db:migrate` · `npm run dev`
- `npm test` (unit + integration; integration wipes the `tavalod_test` DB) · `npm run e2e` · `npm run typecheck` · `npm run lint`
- Deploy: `deploy/deploy.sh` — see `docs/operations.md`.
