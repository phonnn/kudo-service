# Project "Good Job" — Architecture Reference

Internal peer-recognition & reward platform. This document captures every design
decision made during architecture review, with the reasoning behind each so the
"why" is recoverable later (and answerable in review).

The guiding rule throughout: **the append-only ledger is the sole source of truth;
everything else is a projection, an append, or a best-effort side-effect.** Almost
every decision below is a consequence of taking that rule seriously.

---

## Table of contents

1. [System overview](#1-system-overview)
2. [Core principles](#2-core-principles)
3. [Data model](#3-data-model)
4. [Flow: Send a kudo](#4-flow-send-a-kudo)
5. [Flow: Receive / credit](#5-flow-receive--credit)
6. [Flow: Redeem a reward](#6-flow-redeem-a-reward)
7. [Concurrency & the transaction boundary](#7-concurrency--the-transaction-boundary)
8. [Scaling the read paths](#8-scaling-the-read-paths)
9. [Real-time feed & notifications](#9-real-time-feed--notifications)
10. [Error system](#10-error-system)
11. [Infrastructure as tools (libs)](#11-infrastructure-as-tools-libs)
12. [Application structure (domain modules)](#12-application-structure-domain-modules)
13. [Repository pattern & unit-of-work](#13-repository-pattern--unit-of-work)
14. [Layering](#14-layering)
15. [Repository layout](#15-repository-layout)
16. [Deliberate scope choices & trade-offs](#16-deliberate-scope-choices--trade-offs)

---

## 1. System overview

Employees recognize each other by sending **kudos** — a transfer of points (10–50)
carrying a mandatory description, a "core value" tag, and optional media. Points come
from two separate buckets:

- **Giving budget (A):** 200 points/month, company-funded, resets on the 1st. Can only
  be *given away* — never redeemed for yourself.
- **Earned balance (B):** points received from others. This is what gets redeemed for
  rewards (hoodie, afternoon off, etc.).

A single kudo moves points from the sender's giving budget into the recipient's earned
balance. Kudos appear in a **live feed** where people react and comment; tagged/recipient
users get **real-time notifications**. Earned points are spent in a **reward catalog**,
with double-spend protection.

Analogy that keeps the two buckets straight: it's a **casino-chip** system — the company
hands everyone monthly chips that can only be given to others (giving budget); the chips
you *receive* can be cashed at the prize counter (earned balance). The two never mix.

---

## 2. Core principles

These recur throughout the design. Each later section is an application of one or more.

**P1 — The ledger is the only source of truth.** `point_ledger` is append-only and
authoritative. Balances (A and B) are *projections* derived from it, never the truth
themselves. A `SUM` over the ledger is the *audit* path, never the *serving* path.

**P2 — Money and presentation are separate entities.** The financial record
(`point_transfer` + ledger rows) and the social artifact (`feed_post`) are distinct,
with distinct lifecycles, linked by a nullable FK. You can edit or delete the post
without touching the points; the feed can carry non-kudo post types later.

**P3 — One synchronous request, asynchronous fan-out behind it.** The client sends all
data in one call. The server synchronously commits *only the financial invariant plus a
durable outbox event*, then responds "sent." Everything else — credit, projection, feed
publish, notifications, media — runs asynchronously, guaranteed to run by the outbox.

**P4 — The sync boundary is drawn around failures the user must see.** Budget-exceeded
blocks the send (synchronous). A too-long video, a delayed feed publish, a missed
notification do **not** fail the kudo (asynchronous, degrade gracefully). What's
synchronous = the minimal set of effects whose failure means *this action failed*.

**P5 — The transaction wraps exactly one invariant.** A transaction exists to protect an
invariant that concurrency can violate. Here that's the sender's budget (and, at redeem
time, the earned balance). Appends and derivations don't need locks and stay outside.

**P6 — At-least-once + idempotent everywhere.** Every event consumer assumes at-least-once
delivery and is idempotent (`ON CONFLICT DO NOTHING` / processed-events dedupe). This is
what makes the system correct *and* makes the broker swappable — no handler ever relied on
exactly-once.

**P7 — Durable store is truth; real-time push is an accelerant.** Notifications are
persisted before they're pushed. A user never loses a notification because a socket was
down — they refetch from the DB on reconnect.

**P8 — Infrastructure is a set of swappable tools.** Each infra concern (database,
messaging, auth, realtime, storage) is a self-contained library that owns its interface
and its config contract. The app *chooses* a provider by supplying config; the tool
enacts the choice internally. Domain code never sees a vendor name.

---

## 3. Data model

Two worlds, linked by a nullable FK: the **financial** world (money, audited, immutable)
and the **social** world (posts, editable, soft-deletable).

### Financial

```
point_ledger (C)                    -- SOURCE OF TRUTH, append-only
  id            bigserial pk
  user_id       fk users            -- whose balance this row affects
  delta         int                 -- +credit / -debit
  ledger_type   enum('giving_spend','earn','redeem_spend','reversal','adjustment')
  ref_type      enum('kudo','redemption')
  ref_id        uuid                -- transfer.id or redemption.id
  idempotency_key text unique       -- dedupe / double-spend guard
  created_at    timestamptz
  index (user_id, ledger_type, created_at)

sender_balance (A)                  -- giving-budget projection; one row per user per month
  user_id       fk
  period        text                -- e.g. '2026-08'
  spent         int
  pk (user_id, period)

receiver_balance (B)                -- earned/usable projection
  user_id       pk fk
  earned_points int
  version       int                 -- optimistic-lock aid
  updated_at

point_transfer                      -- one logical send; the money record only
  id            uuid pk
  sender_id     fk users
  recipient_id  fk users            -- CHECK (sender_id <> recipient_id)  [self-give guard]
  points        int  CHECK (points BETWEEN 10 AND 50)
  core_value    enum(...)
  status        enum('pending','completed','reversed')
  reversal_of   uuid null           -- self-ref, for compensations
  created_at
```

### Social

```
feed_post                           -- the primary social object; extensible
  id            uuid pk
  author_id     fk users
  type          enum('kudo','announcement','milestone',...)
  body          text                -- description; editable
  point_transfer_id uuid null fk    -- present for kudos; null for non-kudo posts
  visibility    enum('global','team',...)
  status        enum('pending','published')   -- pending until money settles
  created_at, edited_at, deleted_at (soft delete)

feed_media                          -- media belongs to the POST, not the transfer
  id, post_id fk, kind('image','video'),
  object_key text,                  -- points at the storage tool; bytes live in object storage
  status enum('pending','ready','rejected'), duration_ms
```

### Rewards

```
reward                              -- the catalog; a plain entity
  id, name, cost_points, stock int null,   -- null = unlimited, N = finite
  active bool, created_at

redemption
  id            uuid pk
  user_id       fk
  reward_id     fk
  cost_points   int                 -- SNAPSHOT of cost at redeem time (catalog may reprice)
  idempotency_key text unique       -- rapid-double-click guard
  status        enum('confirmed','failed')
  created_at
```

### Infra & delivery

```
outbox                              -- transactional outbox; guarantees event publish
  id, topic, payload jsonb, created_at, published_at null

notification                        -- persisted before pushed (P7)
  id, user_id fk, type('kudo_received','mention','reaction','comment'),
  payload jsonb, read_at null, created_at
  index (user_id, read_at, created_at)   -- unread lookup, keyset order
```

**Why `cost_points` is snapshotted on redemption:** if the hoodie is later repriced, past
redemptions must still reflect what was actually charged. Never join to
`reward.cost_points` for historical truth — read the snapshot.

**Why `feed_post` carries a nullable `point_transfer_id` rather than a polymorphic
attachment table:** YAGNI. A real, enforced FK covers "a post may or may not carry a
transfer" (null = the future non-kudo posts). The polymorphic attachment table is deferred
until a *second* attachment kind actually exists.

---

## 4. Flow: Send a kudo

The send path is: **one synchronous financial transaction, then an asynchronous fan-out
guaranteed by the outbox.** From the client's perspective it's a single call that returns
"sent"; behind it, several consumers do independent work.

### The invariant that ties feed and money together

> A kudo is visible in the feed **exactly when** its points have durably transferred.

- Feed visibility ⟹ financial finality — guaranteed by the `pending → published` flip,
  which only happens *after* the money commits.
- Financial finality ⟹ eventual visibility — guaranteed by the outbox event.

### Phase 0 — Media upload (no DB state)

Client requests a presigned upload URL from the **storage tool**, uploads the file
directly to object storage, and receives an `object_key`. This happens entirely before
the send request. If it fails, the user retries the upload — no DB state exists yet.
The server never touches video bytes (this is the "handle video without blocking the
server / avoid OOM" answer).

### Phase 1 — The send request (ONE synchronous transaction)

```
BEGIN
  UPDATE A(sender) WHERE spent + :points <= 200
  INSERT point_ledger: debit(sender, giving_spend, idempotency_key)   -- then ledger
  INSERT point_transfer(status='pending')
  INSERT feed_post(status='pending', point_transfer_id)
  INSERT outbox('kudo.debited', {post_id, transfer_id, sender, recipient, points})
COMMIT  → respond "sent" to the client
fail    → rollback; nothing happened; client retries safely (idempotency key)
```

Properties: one lock (sender's own row), everything else appends, no I/O, no media, no
network. Because the only lock is on the *actor's own* row, **no cross-user lock ordering
exists and the deadlock class is designed out** — not merely retried.

**Ordering rule (sender side): balance → ledger, atomically.** The invariant lives on the
balance, so the check-and-decrement is the gate; the ledger records the gated fact. Both
in one transaction, so there's no window where budget moved but the ledger didn't, and no
compensation is needed on the sender's own step.

### Phase 2 — After commit (asynchronous, cannot corrupt money)

Guaranteed to run because the outbox row committed *with* the transaction:

```
- outbox relay publishes 'kudo.debited' to the event bus  (guaranteed publish)
- credit consumer inserts the receiver's ledger credit + flips post to 'published'
- projection consumer folds ledger → receiver_balance (B)
- notification + feed fan-out
- video-processing job (validates <= 3 min, transcodes, marks media ready/rejected)
```

Nothing after COMMIT can fail in a way that corrupts points — the points are already
durable. A failed notification means a missed toast, not lost points. A too-long video
gets marked `rejected` and the card shows text without it — **the recognition succeeds
even if the video is bad.**

### The API response

The response returns the kudo with per-part states: `transfer: completed`,
`post: publishing`, `media: processing`. The frontend renders an optimistic "Sent ✓";
the media slot shows a spinner until a later signal (SSE event or refetch) flips it to
ready. The user perceives an instant atomic success; the eventual consistency is invisible.

### Why the outbox (the crux)

Without it, "respond sync, do the rest async" is a lie: after the financial commit the
process could crash before emitting the event, leaving money moved but the kudo never in
the feed and its video never processed. Writing the event into an `outbox` table *inside
the financial transaction* makes "money committed" and "event will publish" one atomic
fact. A relay then publishes outbox rows and marks them done. Crash anywhere → the relay
picks up the unpublished row on restart. This is the canonical solution to the dual-write
problem and the single strongest distributed-systems signal in the design.

### Failure matrix

| Fails at | Points moved? | Post created? | User sees | Recovery |
|---|---|---|---|---|
| Media upload (Phase 0) | No | No | Upload error | Retry upload |
| Budget check (Phase 1) | No | No | "Insufficient budget" | Adjust points |
| Mid-transaction crash | No (rolled back) | No | Generic error | Retry (idempotent) |
| Response lost after commit | Yes | Yes | Timeout | Retry → dedup returns existing |
| Video too long (Phase 2) | Yes | Yes | Card w/o video, "media rejected" | By design |
| Notification publish (Phase 2) | Yes | Yes | Kudo works, no toast | Reconciliation / acceptable |

---

## 5. Flow: Receive / credit

Triggered by the `kudo.debited` event. This is the saga tail — the only genuinely
distributed part, and it begins *after* the money has already durably left the sender.

**Ordering rule (receiver side): ledger → balance.** The receiver has *no invariant to
gate* (you can always add points to someone). So the ledger credit is authoritative on
arrival, written first; the balance B is a pure projection folded afterward. If the
projection fails, just retry — the money is already correct in the ledger.

```
CONSUME kudo.debited:
  INSERT point_ledger: credit(recipient, earn)   -- idempotent on (transfer_id,'earn')
  UPDATE point_transfer status='completed'
  UPDATE feed_post status='published'            -- now visible in the feed
  emit kudo.credited

CONSUME kudo.credited (async projections, retry-only, never touch money):
  fold ledger → receiver_balance (B)
  feed fan-out / notifications / @-mentions
```

### Failure handling (drives off the error taxonomy — see §10)

- **Transient** (DB blip, deadlock, broker hiccup) → retry ladder: ~5 attempts, exponential
  backoff with jitter, header-tracked retry count on a dedicated retry topic.
- **Permanent & certain** (receiver deactivated/deleted mid-flight) → auto-compensate:
  write a **reversal** ledger entry crediting back the sender's **budget (A)** — *not* B —
  and void/unpublish the post. Refunding to A (not B) is critical: the sender spent giving
  budget, so the refund must be spendable-as-giving again, never convertible to redeemable
  points (that would be a points-laundering bug).
- **Exhausted / unknown** → dead-letter, then **ledger-state reconciliation**: check whether
  a credit already exists. If it does, the credit actually succeeded — just complete the
  projection. If it doesn't, refund the sender. Never blind-refund an unknown failure —
  that risks double-credit. This DLQ path is admin-assisted (deliberate scope choice given
  low volume, see §16).

Compensation appears in exactly **one** place — a permanently uncreditable receiver — and
it's a single, well-defined, idempotent reversal, not scattered per-step undo logic.

---

## 6. Flow: Redeem a reward

Redemption is *structurally the same shape* as sending — an invariant-gated debit recorded
in the ledger — so it reuses the entire machinery. It's actually the simpler half:
single-sided debit, no receiver, no cross-user compensation. Points leave B and are
consumed; the catalog is the sink.

| | Send kudo | Redeem reward |
|---|---|---|
| Invariant gated | sender budget ≥ points | user earned balance ≥ cost |
| Balance gated | A (giving budget) | **B (earned)** |
| Ledger rows | debit + credit (2) | **debit only (1)** — a sink |
| Credited to | recipient's B | nobody |
| Compensation | receiver-side saga tail | none (irreversible by default) |

### The redeem transaction

```
BEGIN
  lock B(user) FOR UPDATE                     -- the earned-balance row; invariant gate
  authoritative_balance := reconcile against ledger under this lock
                                              -- B is eventually consistent for DISPLAY,
                                              -- but spending must be EXACT, so reconcile here
  check authoritative_balance >= reward.cost  -- else 409 INSUFFICIENT_BALANCE, ROLLBACK
  IF reward.stock IS NOT NULL:
     lock reward row, check stock > 0, stock -= 1   -- second invariant if finite stock
  INSERT redemption(cost_points snapshot, idempotency_key, status='confirmed')
  INSERT point_ledger: debit(user, redeem_spend, ref=redemption.id)
  UPDATE B: earned -= cost                     -- projection updated under the held lock
  INSERT outbox('reward.redeemed', {...})
COMMIT → respond "redeemed"
fail   → rollback; nothing happened; safe retry
```

### Double-spend prevention — two independent guards (the headline constraint)

- **`FOR UPDATE` on B** serializes concurrent redeem requests from the same user: the
  second waits, sees the reduced balance, rejects.
- **`UNIQUE(idempotency_key)`** makes rapid *identical* clicks idempotent even across
  separate connections: the second insert conflicts, and you return the first redemption
  instead of charging twice.

Belt and suspenders: the lock handles concurrent-*different* requests; idempotency handles
concurrent-*identical* retries. Both are covered by the concurrency test.

**Finite stock** is a *second* concurrency race on a *different* row (`reward.stock`),
handled by locking the reward row and decrementing under check. Modeling at least one
finite-stock reward lets you demonstrate handling two independent races in one flow.

**Redemption is irreversible in the MVP** — a deliberate scope choice. Reversal is an
admin-only ledger adjustment (compensating credit), not a user action.

### Where the consistency cost is paid

Earned balance B is displayed *eventually-consistently and cheaply* everywhere. Redemption
is the **one** moment it must be exact, so under the `FOR UPDATE` lock it reconciles against
the ledger before checking `>= cost`. **Display is cheap and eventual; spending is exact and
pays the lock cost only on the rare write, never on the frequent read.**

---

## 7. Concurrency & the transaction boundary

The naive design ("7 steps in one transaction") holds row locks on both sender and
recipient for the transaction's whole duration — a throughput killer and a deadlock
invitation. The evolution below removes almost all of it.

### What actually needs a lock

Of the send flow's steps, only two involve locking, and they lock **different users**:

- **Sender budget check + decrement** — needs to prevent concurrent over-spend *by the same
  sender*. Locks the sender's own budget row (self-contention only, never a global hotspot).
- **Recipient balance UPDATE** — this was the real bottleneck: a popular recipient (40 kudos
  in a minute on a work anniversary) serializes every one of those transactions on a single
  `receiver_balance` row.

### The fix: drop the recipient UPDATE from the transaction entirely

The recipient balance is a *derived cache* (P1). So it doesn't belong in the hot path:

- Inside the transaction: only the ledger appends (zero contention) + content inserts.
- The `receiver_balance` cache is folded from the ledger **asynchronously** (the projection
  consumer), or computed at read-time with a short-TTL Redis cache.

Now 40 concurrent kudos to the same person are 40 independent appends — no serialization,
no hot row. And with only the sender's own budget row ever locked, **there is only one lock
per transaction, always on the actor's own row, so no lock cycle can form — the deadlock
class is eliminated by design.**

Trade-off, stated plainly: the displayed earned balance is *eventually consistent* (a few
hundred ms behind). For a recognition feed that is completely fine. The *authoritative*
balance (checked at redemption) is still computed under a lock at spend time, where
correctness actually matters.

### Do we even need a transaction? Yes — a small one.

A transaction protects an invariant concurrency can violate. Walk the steps and only one
pair qualifies: **budget check + budget increment** (the classic check-then-act race). The
irreducible atomic unit is `{budget mutation, ledger record of that mutation}` — it cannot
be smaller. Everything else is an append (safe alone) or a derivation (recomputable).

So the transaction shrinks to: **budget guard + the two ledger appends + the content
appends.** Media handling, the recipient cache, feed publish, and notifications all sit
*outside* it — they have different failure models and must never hold a lock.

The line for review:

> The transaction boundary is drawn around the single invariant that concurrent requests
> can violate — the sender's budget — plus its ledger record. Everything else is an append,
> a derivation, or an idempotent side-effect, and deliberately sits outside so it can't hold
> locks or block throughput.

### Idempotency (non-negotiable, P6)

- **Client-generated idempotency key** per send-click → hits the `UNIQUE` on the
  ledger/transfer → a retried request returns the *same* kudo, never a double-spend.
  (Client-generated UUID chosen over a derived key to avoid false-collision risk.)
- **Every consumer is at-least-once** → all inserts idempotent (`ON CONFLICT DO NOTHING`
  or a processed-events table). Without this, normal broker redelivery produces wrong
  balances.

---

## 8. Scaling the read paths

Removing the lock didn't remove the *reads*. Three high-frequency reads, each with a
scale-appropriate answer:

| Read | Naive form | Throttle at scale | Fix |
|---|---|---|---|
| Sender budget | `SELECT FOR UPDATE` one row | No — bounded to 1 row/user/month | Keep it; atomic conditional UPDATE |
| User balance | `SUM(ledger)` | **Yes — unbounded scan** | Maintained balance row + Redis; reconciliation sums only a bounded window |
| Feed | `OFFSET` pagination | **Yes — walks discarded rows** | Keyset pagination on `(created_at, id)` |

**The dangerous query is `SUM(ledger)`.** As the ledger grows to tens of millions of rows,
summing a user's whole history on every read degrades badly. Fix, in three layers:

1. A maintained `receiver_balance` row (folded from ledger events) → a read is a single-row
   PK lookup, not a SUM.
2. Redis cache in front of it → the common-case display read never touches Postgres.
3. Bounded reconciliation: the safety-net cron does **not** `SUM` all history — it keeps a
   periodic **checkpoint** ("as of month M, balance was X") and sums only ledger rows since
   the last checkpoint. Bounded work regardless of total history.

**The feed** uses **keyset pagination** (`WHERE created_at < $cursor ORDER BY created_at
DESC LIMIT n`), never `OFFSET` — constant time at any scroll depth.

Unifying principle: **the append-only source of truth is for audit and recovery, never for
serving. Serving is always from a maintained, bounded-cost projection.** A `SUM` over
history anywhere on a hot path is a red flag — it means the audit log leaked onto the
serving path.

---

## 9. Real-time feed & notifications

Real-time is **not a separate system** — it's one more consumer of the event bus the write
path already publishes to. Instead of writing to a DB, this consumer pushes to connected
clients.

```
outbox → relay → event bus ──┬──▶ credit consumer      (writes DB)
                             ├──▶ projection consumer  (updates B)
                             └──▶ realtime gateway      (pushes to clients)   ← this
```

### Two distinct features, two delivery models

- **Live feed (broadcast):** when a kudo is published or reacted/commented on, everyone
  *currently viewing the feed* sees it. Broadcast to a `feed` room.
- **Notifications (targeted + durable):** the recipient and @-mentioned users get notified
  regardless of screen, and it must persist if they're offline. Point-to-point to a
  `user:{id}` room, **persisted before pushed**.

### Transport: SSE (Server-Sent Events)

Chosen because the live channel is **server → client only** — client actions (reactions,
comments, redemptions) all go through normal REST + the write path, never up the socket.
This one-directional traffic shape is what makes SSE a fit rather than a compromise.

Benefits: plain HTTP (no upgrade handshake, proxy-friendly), native browser auto-reconnect
via `EventSource`, and auth reuses the existing HTTP `Authenticator` guard unchanged.

**Two walls that SSE does NOT solve for free — handled explicitly:**

1. **Multi-instance fan-out.** A user's stream is held by instance 2; the event is consumed
   by instance 1. SSE gives no backplane, so we build it: every instance subscribes to
   Redis Pub/Sub (or the existing bus) and pushes to *its own* locally-held streams. Each
   instance keeps an in-memory `userId → open streams` map. (This is the piece Socket.IO
   would have managed — we own it deliberately.)
2. **Browser 6-connection-per-domain limit (HTTP/1.1).** Served over **HTTP/2** so many
   streams multiplex over one connection. One `/events` stream per client, multiplexing
   event types via SSE's `event:` field (`feed.new`, `notification`, `kudo.reacted`) —
   never one connection per feature.

Also: **heartbeats** (`: keepalive` every ~20s) to keep idle proxies from killing the
stream. On reconnect the client **refetches** (latest feed page + unread notifications from
the DB) rather than relying on replayed socket delivery — the DB is truth (P7), the stream
is the accelerant.

### Feed UX behaviour

- New top-of-feed kudo → emit a lightweight `feed.new` signal → client shows a
  **"N new kudos ↑" pill**, prepends only on click (avoids scroll-jank during infinite
  scroll).
- Reaction/comment on a *visible* card → live-patch that card in place (the count ticks up).

So: **new items → pill (user-pulled); updates to visible items → live patch (pushed).**

### Notifications: persist-then-push

```
notification consumer (of kudo.credited / mention.created):
  1. INSERT notification row (durable)          ← source of truth
  2. push to user:{id} stream (best-effort)     ← live acceleration
```

Online → instant push *and* it's in the list. Offline → the push goes nowhere, but the row
persists; on next connect the client fetches unread via REST. Nothing lost.

**Delivery guarantee, stated honestly:** every notification is durably persisted; real-time
push is best-effort. This is *achievable*, unlike "guaranteed live delivery," which isn't.

The SSE transport sits behind the realtime tool's interface (§11), so WebSocket remains a
swap-in if bidirectional features are ever needed.

---

## 10. Error system

Errors are the contract that flows *up* across every layer. They speak the language of
their layer and translate at each seam: repository catches vendor errors → domain/infra
errors; service raises domain errors; a single exception filter maps them → HTTP. A vendor
error type never appears above the repository; an HTTP status never appears below the
controller.

### Taxonomy — a small, closed hierarchy

```
AppError (base)  { code, message, httpStatus, retryable, context, cause? }
  ├─ DomainError            -- business-rule violations (client "fault"), not retryable
  │    InsufficientBudgetError (409), InsufficientBalanceError (409),
  │    SelfRecognitionError (422), InvalidPointsError (422),
  │    RecipientNotFoundError (404), RewardOutOfStockError (409),
  │    RewardInactiveError (409), DuplicateRequestError (409/idempotent-return)
  ├─ InfrastructureError    -- system failures (not client's fault), often RETRYABLE
  │    DatabaseUnavailableError (503), LockTimeoutError (503/409),
  │    BrokerUnavailableError (503), MediaProcessingError (async, non-fatal)
  └─ AuthError
       UnauthenticatedError (401), ForbiddenError (403), RateLimitedError (429)
```

The two branches map to opposite handling: **DomainError = "invalid request, don't retry,
here's why"**; **InfrastructureError = "system hiccup, retrying may work."**

### The `retryable` flag is the linchpin — it unifies sync and async

The same taxonomy serves both paths:

- **Sync HTTP path:** `retryable` maps to 4xx (client error) vs 5xx (server error).
- **Async consumer path:** `retryable` *is* the retry-vs-DLQ-vs-compensate decision:
  - `retryable: true` (transient) → exponential-backoff retry ladder.
  - `retryable: false` + permanent domain condition (receiver gone) → compensate.
  - `retryable: false` + unknown → DLQ → ledger-state reconciliation.

So the async consumer's error handling is a clean switch on the error's type + `retryable`,
not ad-hoc inspection of broker internals. **One error model governs both the synchronous
and event-driven paths** — the senior signal, and only possible because the flows were
designed this way.

### Translation per layer

- **Repository** catches vendor codes and translates: Postgres `40P01` → `LockTimeoutError`,
  `23505` → `DuplicateRequestError`, connection errors → `DatabaseUnavailableError`; unknown
  → wrapped `InfrastructureError`. Postgres codes **die here** — nothing above knows Postgres
  exists. (This is also where a unique-violation on the idempotency key becomes a meaningful
  `DuplicateRequestError` the service interprets as "return the existing record.")
- **Service** turns repository *facts* (a `false` from `reserve()`) into domain *meaning*
  (`InsufficientBudgetError`). It throws domain errors, never HTTP errors.
- **Global exception filter** is the *only* place domain → HTTP mapping lives. It logs the
  rich version (`cause`, `context`) and returns only a safe version.

### Client-facing response contract

```
{ "code": "INSUFFICIENT_BUDGET",
  "message": "You have 30 points left this month; this kudo needs 50.",
  "requestId": "..." }
```

- `code` is the stable, machine-readable contract — the frontend switches on it. Never make
  the frontend parse `message`.
- `message` is human-safe; never contains SQL, stack traces, internal IDs, or vendor detail.
- `requestId` correlates to server logs without exposing internals.

**Two rules that prevent leaks:** (1) `cause`/`context` are for logs only, never the response
body — an info-leak/security requirement, not tidiness. (2) Anything that isn't an `AppError`
is an *unexpected* error → generic 500, revealing nothing, fully logged server-side.

---

## 11. Infrastructure as tools (libs)

Each infrastructure concern is a **self-contained tool library**. A tool is a black box that
publishes three things: its **functional interface** (what you can do with it), its **config
contract** (a typed, discriminated union of supported providers + each one's settings), and a
**factory** (which switches providers internally from the config). The app *chooses* a
provider by supplying a config value that satisfies the contract; the tool enacts the choice.

### Ownership split — precise

- **The lib owns the config *contract*** (the interface/type, including the provider
  discriminant). It's the authority on what a valid configuration looks like.
- **The app owns the config *value*** — and by writing `provider: 'postgres'` in a value that
  satisfies the contract, it *makes the choice*. Provider selection is encoded in the config,
  not a separate call.
- **The lib owns the switching mechanism** — the factory reads the discriminant and builds the
  implementation. The app never branches on provider; vendor packages (`pg`, `redis`) are
  dependencies of the *lib*, invisible to the app.

```ts
// libs/database/src/database.config.ts — THE LIB owns this contract
export type DatabaseConfig =
  | { provider: 'postgres'; url: string; poolSize?: number }
  | { provider: 'sqlite';   file: string }

// libs/database/src/database.factory.ts — switching is internal to the lib
export function createDatabase(cfg: DatabaseConfig): Promise<Database> {
  switch (cfg.provider) {                 // app never sees this
    case 'postgres': return makePostgres(cfg)
    case 'sqlite':   return makeSqlite(cfg)
  }
}

// app — chooses by satisfying the contract; misconfig is a COMPILE error
const database: DatabaseConfig = { provider: 'postgres', url: env.DATABASE_URL }
const db = await createDatabase(database)   // returns the Database interface
```

The payoff: **an invalid infrastructure configuration is a compile error** — choosing a
provider and misconfiguring it can't reach runtime, because the config contract is a type the
app must satisfy.

### The tools

| Tool (`libs/*`) | Interface | Providers (shipped + holes) |
|---|---|---|
| `database` | `Database` / `UnitOfWork` / repos | Postgres *(ship)*; SQLite, replica, sharded |
| `messaging` | `EventBus` (publish/subscribe) + retry/DLQ/outbox-relay | Redis Streams *(ship)*; in-memory *(tests)*, Kafka, RabbitMQ |
| `auth` | `Authenticator` → `Principal` | OIDC *(ship)*; SAML, local+2FA |
| `realtime` | `RealtimePush` (pushToUser/pushToRoom) | SSE *(ship)*; WebSocket |
| `storage` | object ops (presign/put/get/delete by key) | S3/MinIO *(ship)*; GCS, local |
| `ratelimit` | `RateLimiter.check(key)` | Redis *(ship)*; in-memory |

An in-memory `messaging` adapter remains a useful test provider: integration tests can run
the full flow without Redis. Redis Streams is the shipped durable provider and supports the
at-least-once delivery model required by the handlers.

### storage vs database — a frequent confusion

They store *different kinds of data* with *opposite access patterns*, so they are two tools:

- **`database`** = structured, transactional, queryable records (kudos, ledger, balances,
  rewards). You **query and transact** over it. Providers: Postgres, SQLite.
- **`storage`** = large opaque binary blobs (kudo/comment media). You **put and get whole
  objects by key**; you never query their contents. Providers: S3, MinIO, GCS.

They meet exactly at the boundary: media *bytes* live in `storage`; the short *object key*
referencing them lives in `database` (on `feed_media.object_key`). The DB never holds
video bytes — which is precisely what keeps the server non-blocking and OOM-safe.

### Honest boundary (say it, don't oversell)

The abstraction is "swappable among providers that meet the required capabilities," not magic
universal portability. The `database` tool requires transactional semantics (atomic
conditional write, row locking, unique constraints); a store lacking them could not preserve
correctness, and that's a documented constraint, not a gap. Naming this is more senior than
claiming total portability — and the idempotency discipline (P6) is exactly what makes the
`messaging` tool genuinely swap-safe.

**Seams now, adapters later.** Ship one provider per tool (plus the in-memory `messaging`
one for tests). The value captured is a *bounded, known* cost to swap later — a future change
becomes "write an adapter," not "rewrite the domain." Additional providers are intentionally
out of scope for the MVP.

### Where the libs live

The Nest application is isolated under `app/` (`app/src` plus `app/test`). Infrastructure
tools are **workspace packages** under `libs/*`. The app imports their public package entry points, so it can only
touch each tool's exported public surface — it *physically cannot* import a lib's internal
`providers/postgres-database.provider.ts` file, and `pg` isn't even in the app's dependency graph. The boundary
is enforced by the package manager, not by convention. (Publish to a registry only if another
repo ever needs a tool; not needed now.)

---

## 12. Application structure (domain modules)

Inside the app, code is organized **by business domain** (idiomatic NestJS). Each module is
a self-contained vertical slice owning *everything about its business concept*: entities,
value objects, business services, DTOs, error codes, and the repositories it needs.

**What a module owns vs. what it borrows:**

- **Owns** — what the concept *is* and what you can *do* with it: entities, invariants,
  services, DTOs, error definitions, and its repositories.
- **Borrows** — infrastructure *mechanism*, via injected tool interfaces (`Database`,
  `EventBus`, `RealtimePush`) from the tool-libs. Never a provider, never a vendor name.

### The contract belongs to the app

The domain vocabulary — event names + payloads, error codes, DTO shapes — is the **app's**
language (it knows the word "kudo"), not a neutral shared lib. It is distributed across the
domain modules that own each piece:

- **Event names + payloads** → owned by the module that *emits* them
  (`modules/point/events/kudo.events.ts`). Consumers import the type from the emitter.
- **Error codes** → `modules/<domain>/errors/*.errors.ts` (each extends the shared `AppError`
  base, so the one global filter still maps them centrally).
- **DTOs** → each module's `dto/`.

The **libs are domain-agnostic tools**; anything that knows what a kudo is lives in the app.
The separate **web repo** consumes the app's *public* contract (error codes + DTO shapes) as
a downstream consumer — ideally via a generated API client / OpenAPI spec, so the app remains
the single source of truth. Direction is app → (exposes contract) → web, never a shared
co-owned package.

### Cross-module communication is via events, not imports

`kudo` does not import `notification`. On credit, `kudo` emits `kudo.credited` to the
`EventBus`; `notification`'s consumer subscribes. Modules depend on event contracts, not on
each other's internals — the same event backbone the whole system runs on.

### Composition seam

Only a single `infra` module calls the tool factories (`createDatabase(cfg)`,
`createMessaging(cfg)`, …), reading env to build each tool's config value (the provider
*choice*), and binds the returned tool interfaces to DI tokens (`DATABASE`, `EVENT_BUS`,
`REALTIME`, `AUTHENTICATOR`, `STORAGE`). Domain services just `@Inject(DATABASE)`. So
"choose the provider via config" happens in exactly one place, and every domain module stays
infrastructure-agnostic.

---

## 13. Repository pattern & unit-of-work

Plain repositories aren't enough here: the invariants span *multiple* repositories inside
*one* transaction (budget reserve + ledger appends + transfer + post + outbox). So it's
**repository pattern + unit-of-work**.

Repositories are injectable singleton providers and never open connections or transactions.
The **unit of work** opens a transaction in the database tool's async context; repository
calls made inside `run()` automatically resolve `database.client()` to that same transaction.

```ts
class UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T>;   // the txn boundary
}
```

`UnitOfWork` is a reusable, framework-agnostic service exported by `libs/database`. The app's
`InfraModule` constructs it from the shared `Database` and exports it as a Nest provider. Domain
services inject the class directly; there is no interface token or `useExisting` alias because
there is only one implementation.

Repository ownership is **one repository per table/read model** (`SenderBalanceRepository`,
`PointTransferRepository`, `PointLedgerRepository`, `FeedPostRepository`, and
`OutboxRepository`). Nest creates and injects them through their owning modules. When called
inside the unit of work, all use the same async-context Kysely transaction, so this separation
improves ownership and testability without creating extra pools, connections, or
transaction boundaries. Each repository file also owns the Kysely schema for its table; schemas
are not collected in a global infrastructure or module-level interface.

Repository classes are injected directly. Separate repository interfaces are intentionally
omitted because each table has one fixed Kysely implementation and no interface DI token;
duplicating every method signature would not create a real substitution boundary. Tests mock
the required class methods with `Pick<Repository, ...>`. Interfaces remain at genuinely
swappable infrastructure ports such as `Database`, `EventBus`, and `OutboxSource`.

Repository ownership follows the owning domain module. `FeedPostRepository` and its table
schema live in `FeedModule`, not `PointModule`; `OutboxRepository` similarly lives in
`OutboxModule`. `PointModule` imports those modules and injects their exported repositories, so
their writes still participate in the same transaction as the budget, transfer, and ledger.

The service writes the whole atomic core inside one `run`:

```ts
await uow.run(async () => {
  if (!await budget.reserve(senderId, period, points)) throw new InsufficientBudgetError();
  await ledger.appendDebit({ userId: senderId, points, type: 'giving_spend' });
  const t = await transfers.create({ senderId, recipientId, points, status: 'pending' });
  await posts.create({ authorId: senderId, transferId: t.id, status: 'pending' });
  await outbox.enqueue('kudo.debited', { /* ... */ });
  return t;
});
```

**The invariant-bearing operations are repository *methods*, not primitives the caller
assembles** — so the atomicity of "check and reserve" lives inside the adapter where the SQL
guarantees it. The domain calls `budget.reserve()` (atomic by contract) and cannot express a
non-atomic check-then-act, because the port doesn't expose one:

```ts
interface BudgetRepository {
  reserve(userId, period, points): Promise<boolean>;   // atomic conditional UPDATE; false if it would exceed cap
  refund(userId, period, points): Promise<void>;       // compensation
}
interface BalanceRepository {
  lockForUpdate(userId): Promise<Balance>;             // FOR UPDATE, for redemption
  apply(userId, delta): Promise<void>;
}
interface LedgerRepository {
  appendDebit(e): Promise<LedgerRow>;
  appendCredit(e): Promise<LedgerRow>;                 // idempotent on (refId, type)
  balanceOf(userId, type): Promise<number>;            // sums since checkpoint only
}
```

The database adapter is where `run()` becomes a real transaction. It stores the active Kysely
transaction in `AsyncLocalStorage`; injectable repositories ask the shared `Database` for a
typed client and transparently receive the active transaction (or the root client outside a
unit of work). **All transactional machinery is concentrated in this adapter.** This project
uses **Kysely with its PostgreSQL dialect**: the database
library owns client/pool creation and transaction execution, while each table repository defines
its own Kysely schema fragment beside its queries. There is no global or module-wide schema;
each repository requests a typed view of its own table. Kysely preserves precise control over `FOR UPDATE`,
atomic conditional writes, and `ON CONFLICT` while providing compile-time query and result types.

**Read/write split (light CQRS):** the feed and balance-display reads have different shape and
performance rules (keyset pagination, cached projections) than transactional writes. They use
dedicated query services against read models, *outside* the UoW — they don't mutate and don't
need transactions. Write path = transactional repositories + UoW; read path = query services.

---

## 14. Layering

Three layers, each defined by what it's *forbidden* from doing:

- **Controller** — the edge. Parses/validates HTTP input (DTOs: shape/type/range), extracts
  the authenticated `Principal`, extracts the idempotency-key header, calls *one* service,
  maps result/thrown-error to an HTTP response. **Forbidden:** any business rule, any DB
  access, any transaction knowledge. Thin enough to swap HTTP for gRPC by rewriting only
  controllers. (The rule "10–50 is valid" is domain knowledge, not a controller check.)

- **Service (application/use-case)** — the brain. Owns the use-case flow, the **transaction
  boundary** (it calls `uow.run`), the business decisions (a `false` from `reserve` →
  `InsufficientBudgetError`), and orchestration order (balance→ledger on send, ledger→balance
  on receive). Calls repository/port *interfaces*. Throws *domain* errors, never HTTP errors.
  **Forbidden:** SQL, knowing the store/broker vendor.

- **Repository** — the hands. Executes DB work behind a domain-language interface; owns the
  SQL-level correctness primitives (atomic conditional UPDATE, `FOR UPDATE`, idempotent
  insert). **Forbidden:** business decisions — it reports a *fact* (`reserve` returned false),
  the service interprets its *meaning*.

Plus a **domain-objects** sub-layer inside the middle tier: pure rules with no I/O (a
`Points` value object enforcing 10–50, `sender ≠ recipient`, snapshot-cost-at-redeem). These
are trivially unit-testable (no mocks, no DB) and can't be bypassed — `Points.create(75)`
throws before any service or DB is involved. This directly earns the "unit tests for point
calculation logic" requirement.

**Dependency rule:** controller → service → repository *interface* + port interfaces; the
concrete adapter is injected (DI). Vendor names appear only in adapters; business rules only
in services + domain objects; HTTP only in controllers. Errors bubble up gaining meaning:
SQL outcome → domain error (service) → HTTP status (filter).

---

## 15. Repository layout

The backend separates the Nest application under `app/` from reusable infrastructure tools
under `libs/` (the web app remains a separate repository).

```
kudos-api/
├── package.json
├── .env.example                   # DB_PROVIDER, MQ_PROVIDER, AUTH_PROVIDER, RT_PROVIDER, STORAGE_PROVIDER, ...
│
├── libs/                          # each = a self-contained TOOL (own interface + config contract)
│   ├── database/     src/{index,database.config,database.factory}.ts, interfaces/, providers/, types/
│   ├── messaging/    src/{index,messaging.config,messaging.factory}.ts, interfaces/, providers/, services/
│   ├── auth/         src/... providers/{oidc,local}/
│   ├── realtime/     src/... providers/{sse,websocket}/
│   ├── storage/      src/... providers/{s3,minio,local}/
│   └── ratelimit/    src/... providers/{redis,memory}/
│
├── app/                           # Nest application boundary
│   ├── src/
│   │   ├── main.ts                # bootstrap, global exception filter, validation pipe
│   │   ├── app.module.ts
│   │   ├── infra/                 # composition seam — ONLY place tool factories are called
│   │   ├── shared/                # errors, filters, decorators
│   │   ├── modules/               # one self-contained vertical slice per business domain
│   │   │   ├── point/             # budgets, transfers, ledger, PointTransferService.sendKudo
│   │   │   ├── outbox/            # owns outbox schema, source port binding, and DB repository
│   │   │   ├── feed/
│   │   │   ├── reaction/
│   │   │   ├── reward/
│   │   │   ├── notification/
│   │   │   ├── realtime/
│   │   │   ├── budget/
│   │   │   └── auth/
│   │   └── workers/               # DB-blind consumers; depend on module ports, not schemas/Database
│   └── test/                      # end-to-end tests and their Jest config
│
├── docker/  Dockerfile.api, docker-compose.yml (api, postgres, redis, minio)
├── .github/workflows/ci.yml
└── README.md
```

**Dependency direction:** a domain module depends *up* on `shared/` and *sideways* on tool
**tokens** (never tool implementations), never on another module's internals (cross-module =
events). `pg`/`redis` appear nowhere under `modules/` — sealed inside the tool-libs,
surfaced only as injected interfaces. NestJS lives only in `app/src/`; the tool-libs are plain
TypeScript.

---

## 16. Deliberate scope choices & trade-offs

Stated explicitly so each reads as a *choice*, not a gap:

- **One provider per tool** (plus in-memory `messaging` for tests). The seam is the
  deliverable; additional adapters are out of scope. Swapping later = write an adapter, not a
  rewrite.
- **Synchronous single transaction is the default, not the saga.** For an internal tool at
  modest QPS, strong consistency is essentially free and correct. The event-driven receiver
  tail is used where it earns its keep (decoupling the credit/projection path); knowing *when
  not* to reach for the saga is the point.
- **Displayed balances are eventually consistent; spending is exact.** Display reads from
  cached projections (cheap); redemption reconciles under lock (exact). The cost is paid only
  on the rare write.
- **Deleting a kudo post does NOT refund points.** Recognition, once given, is permanent; its
  presentation is editable. There's structurally no points field on the post to clear.
- **Redemption is irreversible in the MVP.** Reversal is an admin-only ledger adjustment, not
  a user action.
- **DLQ path is admin-assisted, not fully automated.** Given the near-zero permanent-failure
  rate of an internal tool, a fully-automated distributed reconciliation system would be
  over-engineering. A simple admin queue + "reconcile & refund" is proportionate.
- **`feed_post` uses a direct nullable FK, not a polymorphic attachment table** — deferred
  until a second attachment kind exists (YAGNI).
- **Repository interfaces are omitted until substitution is real.** Each table currently has
  one injected Kysely repository class. Add an interface token only when a second implementation
  or a true external port appears; do not duplicate signatures speculatively.

### One-line summary

> An append-only ledger is the sole source of truth. A single small transaction protects the
> one invariant concurrency can violate (the sender's budget / the redeemer's balance) plus
> its ledger record; a transactional outbox makes "money committed" and "event will publish"
> one atomic fact, so the request returns "sent" synchronously while credit, projection, feed
> publish, notifications, and media fan out asynchronously and idempotently. Balances are
> bounded-cost projections read for display and reconciled exactly only at spend time.
> Real-time is a socket-shaped consumer of the same event bus (SSE, server→client), and
> infrastructure is a set of swappable tools whose provider the app chooses via a typed config
> contract. One typed error model — keyed on a `retryable` flag — governs both the HTTP and
> the event-driven paths.
