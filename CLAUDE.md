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
- Offline: only *creating* expenses/settlements is queued (IndexedDB per user, `tavalod-<userId>`), replayed through `/api/sync` with idempotency keys. Reservations, confirming money and voting are online-only (`<OnlineOnly>`).

## Phase 2: surprises, gifts, polls (privacy rules)
- Private spaces (`private_spaces`) hold surprise data. Every read/write goes through `requireSpaceMember` (NOT_FOUND for everyone else, incl. the celebrant). The celebrant can never be a member (service + DB trigger).
- Private money has `space_id` set and is loaded only with `loadGroupLedger(db, groupId, { kind: "space", spaceId })`. The default (public) ledger, group activity (`audit_log.space_id is null`), notifications (`notifyMembers(..., { spaceId })`) and event pages must never include space rows. Private money never has `event_id` / event allocations.
- Pledge ≠ money ≠ purchase: `gift_pledges` never touch the ledger; money handed over is a settlement with `purpose` collection/refund (counts only once confirmed); the purchase is one private expense with `gift_id`. A share above a pledge cap is refused (`OverCapError`).
- Wishlist owners never see reservations (owner view, group view as owner, share link). Reservation exclusivity = item row lock + partial unique index.
- Guests, RSVP, contributors and expense sharers are separate sets; none of RSVP / invites / votes / pledges creates debt.
- Times: instants are `timestamptz` + event zone (`Asia/Tehran`), shown via `formatEventInstant`; birthdays stored in their own calendar (`users.birth_*`).
- Rollback to a release before migration 0004 is refused by `deploy/rollback.sh` once private money exists.

## Commands
- `npm run db:up` (dev Postgres on 127.0.0.1:5433) · `npm run db:migrate` · `npm run dev`
- `npm test` (unit + integration; integration wipes the `tavalod_test` DB) · `npm run e2e` · `npm run typecheck` · `npm run lint`
- Deploy: `deploy/deploy.sh` — see `docs/operations.md`.
