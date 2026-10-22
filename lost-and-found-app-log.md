# Lost & Found App — Planning Log

## Goals
- Primary: hands-on engineering experience with a broader stack than a typical side project
- Secondary: a strong internship application project
- Scope: campus-only, student-to-student (peer-to-peer), no org/venue accounts

---

## 1. Idea Validation

**Question:** Is a lost-and-found app with AI image matching a good idea?

**Findings:**
- The concept is already validated at the B2B level. Boomerang (Miami-based) has raised $7.7M total funding and works with venues like Universal Studios, major stadiums, and airports, reporting 3x+ higher recovery rates using AI matching. Several smaller players exist (Lost and Found Software, Simply Foundtastic, Amanat, FindIt AI).
- Most funded competitors are **B2B/venue-mediated** (a business logs found items, users search against them).
- **Gap identified:** peer-to-peer / campus-community matching with no institutional mediation is less crowded — only small, early-stage apps operate there.
- Core risk isn't the AI, it's the **two-sided marketplace cold-start problem**: the app is useless until both lost and found posts exist in the same place/time. Campus scope directly solves this by providing built-in density.

**Decision:** Proceed, scoped to one campus, P2P model.

---

## 2. Internship/Resume Fit

**Question:** Is this a good project for internship applications specifically?

**Research findings:**
- Hiring managers prioritize problem-solving ability, technical understanding, communication, and ownership — not novelty or complexity for its own sake.
- Depth on one hard subsystem (e.g., the matching pipeline) beats a feature-complete app with shallow implementation.
- Originality matters less than being able to explain your own architectural decisions — copying a tutorial is the actual red flag, not building in an existing product category.
- A real userbase, even small, gives concrete metrics and real "what I learned from actual usage" material for interviews — valuable but not required to get value from the project.
- A clear README explaining *why* you made technical decisions is itself a signal recruiters weigh.

**Decision:** Build MVP first, but plan to go deep on the matching pipeline as the "hard subsystem" story for interviews. Try to get real campus usage after MVP for real metrics/anecdotes.

---

## 3. Technical Design Decisions

### AI matching cost problem
**Issue raised:** Calling a vision AI API to compare every pair of posts (image A vs image B) is O(n×m) — cost explodes with users.

**Solution:** Change the AI's role from "pairwise judge" to "one-time feature extractor."
- Run each uploaded photo through an embedding model **once** at upload time → get a vector.
- Matching against all other posts is then just **math** (cosine similarity / nearest-neighbor search), not further API calls.
- Cost grows linearly with posts, not quadratically with comparisons.
- Can self-host an open embedding model (CLIP/SigLIP) to avoid per-call API costs entirely.

### Text-to-image matching (no photo available)
**Issue raised:** Person who lost an item may only have a text description, not a photo — can this still be compared to a found item's photo?

**Answer:** Yes — CLIP-style models embed both images and text into the **same shared vector space**, so a text description and a photo can be compared directly via cosine similarity without any conversion step. Text-to-image similarity is a weaker signal than image-to-image, so it should eventually be combined with structured metadata (category, location, time) rather than trusted alone — but that scoring layer is a post-MVP concern.

### Storage
- pgvector (free Postgres extension) suggested as sufficient at campus scale — no need for a dedicated vector DB service yet.

---

## 4. MVP Scope (Agreed)

**In scope:**
1. Authentication via **.edu email** (also doubles as baseline trust/anti-fraud layer for free)
2. Post a lost or found item: photo *or* text description, category, timestamp
3. Basic search area / browse
4. AI pipeline: generate embedding vector per post (image or text) at upload time
5. Matching: nearest-neighbor search, ranked by similarity score
6. Category as a hard filter before vector search (cheap, big quality win)
7. Chronological logic: found timestamp ≥ lost timestamp; sort ties by recency
8. Store metadata needed for future advanced scoring (location, timestamps, category) even though not used for scoring yet
9. Simple match notification (email or in-app) when a new post scores above a threshold
10. "My posts" view + ability to mark a post resolved
11. Minimal contact flow: "I think this is mine" reveals the other user's campus email (no in-app chat needed)

**Explicitly excluded from MVP (Phase 2):**
- Weighted multi-signal scoring (location proximity, time-decay weighting combined with embeddings)
- Ownership-verification / challenge-question fraud prevention
- In-app real-time chat/messaging
- Org/venue accounts, shipping/delivery, payments, ratings/reviews, report tooling

---

## 5. Open / Future Considerations (Phase 2+)
- Full weighted match scoring (embedding similarity + location + time + category)
- Fraud prevention: identifying-detail verification before releasing contact info
- Handling visually near-identical common items (e.g., generic black phone cases)
- Blurring sensitive info visible in photos (IDs, documents)
- Listing expiration/archiving policy
- Report/spam handling

---

## 6. Next Step
Begin building the MVP per the scope in Section 4, starting with auth + basic CRUD before layering in the embedding pipeline.

---

## 7. Security & Access Control (RLS) — Implemented

**Question:** Since Supabase exposes Postgres directly to the client, how is access control actually enforced?

### Architecture decision: RLS-native, not app-mediated
Two options considered:
- **RLS-native (chosen):** frontend talks directly to Supabase; Postgres Row Level Security is the real security boundary.
- **App-mediated:** a separate backend server holds DB credentials, enforces authorization in server code.

Went with RLS-native — it's how Supabase is designed to be used, avoids standing up/hosting a second always-running service (doesn't fit the ~$0 budget / campus-project scope), and keeps enforcement in one place rather than every future route having to remember its own check. Trade-off noted: RLS doesn't eliminate the risk of a missed rule, it just moves where that rule has to be written — mitigated by testing each policy before moving to the next table (see Section 8).

### Column-level grants
RLS controls *which rows* a user can touch, not *which columns*. Where a user should edit only some fields on a row they own, layered Postgres column-level `GRANT`/`REVOKE` on top of RLS:
```sql
REVOKE UPDATE ON public.<table> FROM authenticated;
GRANT UPDATE (<editable_columns>) ON public.<table> TO authenticated;
```

### `users` table
- **SELECT** — public read (`using (true)`); once a row is visible, all its columns are visible, so `created_at` needs no separate rule.
- **UPDATE** — own row only (`auth.uid() = id`, checked both before and after the update), column grant restricts writes to `username` only. `id`/`created_at` fully locked from any update.
- **INSERT** — no client-facing policy needed. `users.id` must mirror `auth.users.id`, so the row is created by a `SECURITY DEFINER` trigger on signup, which bypasses RLS entirely rather than the client inserting directly.
- **DELETE** — no client-facing policy needed. Deleting `auth.users` cascades to `public.users` (FK `on delete cascade`). Actual account deletion (FR-6.5) needs a privileged operation — planned as a Supabase Edge Function running with the service role, not something the anon/authenticated client key can do directly. **Still to build.**
- Considered and rejected: hiding `id` from reads. A user's own id is already known via `auth.uid()` in their session, and other users legitimately need to read a post owner's `user_id` — hiding it protects nothing and breaks functionality.

### `posts` table
- **SELECT** — asymmetric by type. Lost posts openly browsable by any authenticated user (recognizing a lost item is spontaneous, shouldn't require posting first). Found posts gated: visible only if the viewer posted it themselves, OR the viewer currently has an active (unresolved) lost post of their own.
  - **This is an explicit MVP placeholder**, modeled after a "you can't shop found listings without having lost something yourself" rule (like a dating app gating browsing behind having your own profile up). The *final* intended rule is narrower — a found post should only be visible if it's a real candidate match for the viewer's specific lost post, determined by the future ranking pipeline against a stored `matches` table. That table doesn't exist yet, so the current policy uses "any active lost post" as a temporary stand-in. Swapping to the real rule later only requires changing the inner condition, not the policy's structure.
- **INSERT** — must post as yourself (`user_id = auth.uid()`), `type` must be `lost` or `found`. Column grant limits insertable columns to `type, category, description, user_id, embedding` — `id`, `created_at`, `resolved` are excluded so their defaults (`gen_random_uuid()`, `now()`, `false`) are always used instead of client-supplied values.
- **UPDATE** — own row only. Column grant limits edits to `type, category, description, resolved` — `id`, `user_id`, `created_at`, `embedding` locked (embedding regeneration, if ever needed on edit, should go through a deliberate trigger/RPC, not a general update grant).
- **DELETE** — own row only. Caveat: the `claims.post_id → posts.id` FK is `no action`, so a post with any claims attached can't actually be deleted even though RLS allows the attempt — the delete will fail at the database level with a foreign-key error. Frontend should surface this as a clear message ("resolve or reject claims before deleting") rather than a raw Postgres error.

### `claims` table
- **SELECT** — visible to either party: the claimant (`claimant_id = auth.uid()`) or the related post's owner (via join to `posts.user_id`). Symmetric for both claim directions (finder claiming a lost post, searcher claiming a found post) — no special-casing needed, since it's always "claimant" vs. "post owner" regardless of which one lost vs. found the item.
- **INSERT** — must claim as yourself, on a post that isn't your own and isn't resolved. For found posts specifically, the same "active lost post" gating condition from the `posts` SELECT policy is repeated here, so a user can't claim a found post via direct API call that the UI would never have shown them.
- **UPDATE** — two separate policies, since two different roles can update different fields for different reasons:
  - Post owner can set `status` to `approved` or `rejected` (their own row check, via join to `posts.user_id`).
  - Claimant can withdraw their own claim, but only while it's still `pending` — checked to only ever transition to `status = 'withdrawn'`, never any other value.
  - Column grant restricts all updates on this table to the `status` field only — `post_id`/`claimant_id` can never change after creation by anyone.
- **DELETE** — intentionally no policy. Claims are kept as a permanent audit record (supports future abuse investigation) — consistent with the FK `on delete restrict`/`no action` behavior already in the schema. Rejected and withdrawn claims stay as rows; nothing is ever removed, only `status` changes.
- **Schema fix:** added a `'withdrawn'` value to the `status` check constraint (`pending`, `approved`, `rejected`, `withdrawn`) to support claimant withdrawal without needing a `DELETE` path.

### Schema hardening done alongside RLS
- Added `not null` constraints on `posts.type`/`user_id`/`resolved` and `claims.post_id`/`claimant_id`.
- Added `check` constraints: `posts.type IN ('lost','found')`, `claims.status IN ('pending','approved','rejected','withdrawn')`.

### Still to build
- `matches` table (post-embedding-pipeline) — needed to swap the `posts`/`claims` MVP placeholder condition for the real candidate-match rule.
- `users` account-deletion Edge Function (FR-6.5).
- Confirm the `users` signup trigger (`SECURITY DEFINER`, mirrors `auth.users.id` → `public.users.id`) actually exists — this is what INSERT relies on instead of an RLS policy.

---

## 8. Testing RLS Policies

RLS bugs are invisible until you actually query as a real, restricted user — the Supabase SQL Editor runs as a superuser/service role by default, which bypasses RLS entirely, so a query working there proves nothing about whether RLS is correct.

**1. Inspect what's actually active, before testing behavior**
```sql
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('users', 'posts', 'claims')
ORDER BY tablename, cmd;
```
Confirms every intended policy exists, with no stray/duplicate/leftover ones (e.g. an old permissive `using (true)` policy still sitting alongside a newer restrictive one, silently overriding it — permissive policies OR together, so one bad leftover can undo a correct policy sitting right next to it).

**2. Create real test accounts, not just one**
At least two `.edu`-pattern accounts (or a dev bypass on the domain check), so you can test both sides of every "own row vs. someone else's row" and "claimant vs. post owner" condition. Testing with only one account can't catch cross-user leaks, since every row will always be "yours."

**3. Test through the actual client, not the SQL Editor**
Use `supabase-js` in a small script or directly in the app, logged in as each test user, and confirm:
- You can read/write what you should.
- You get zero rows (not an error) when a `SELECT` policy blocks you — RLS filters rows silently, it doesn't throw.
- You get a permission error when a column grant blocks a write.
- You get a permission error (or zero rows updated) when an RLS policy blocks an update/delete attempt on a row that isn't yours.

Supabase also supports impersonating a role directly in the SQL Editor for a faster check without leaving the dashboard:
```sql
SET ROLE authenticated;
SET request.jwt.claim.sub = '<test-user-uuid>';
-- run your test query here
RESET ROLE;
```
This runs the query *as* that user, with RLS actually enforced, rather than as the superuser.

**4. Test each policy in isolation, one table at a time**
Matches the same incremental approach used to build them: verify `users` fully (read own/others, update own username, try updating `id`, try updating someone else's row) before moving to `posts`, then `claims` — catching a bug on one table before it's compounded by testing multiple tables' interactions at once.

**5. Specific edge cases worth deliberately trying, given what's been built:**
- Try updating your own `username` — should succeed.
- Try including `id` in an update payload, even to its own unchanged value — should fail (column grant).
- Try reading a found post with no active lost post of your own — should return zero rows.
- Try reading your *own* found post with no active lost post — should still succeed (`user_id = auth.uid()` clause).
- Try inserting a claim on your own post — should fail.
- Try inserting a claim on an already-resolved post — should fail.
- Try approving a claim as the claimant instead of the post owner — should fail.
- Try withdrawing a claim after it's already been approved — should fail (status must be `pending`).
- Try setting a withdrawn claim's status to `approved` as the claimant — should fail (`with check` only allows `withdrawn`).
- Try deleting a post that has an active claim on it — should fail with a foreign-key error, not succeed.

A policy that "looks right" on paper but hasn't been run against a real second test account is the most common way these bugs slip through — worth treating this testing pass as a required step before moving on to the next table, not an optional cleanup at the end.

---

## 9. Devlog — First Real RLS Test Pass

Section 7 documents the *designed* end state. This section is the actual debugging log from running that design against two real test accounts for the first time — every entry below is a real bug that surfaced only once actual requests were fired at the database, not caught by reading the policy SQL. Logging it this way (problem → cause → fix → verified) going forward, since this is closer to what real engineering debugging looks like and is better interview material than a clean "here's the final design" writeup alone.

**Test accounts used:** `aditya_test`, `neeky_test`, and a third fresh account `johnny` (created partway through, useful specifically *because* it had zero prior posts/claims — a clean slate for testing "no access yet" cases).

### 9.1 — `claims` INSERT was missing its found-post gating condition

**Problem:** Ran `SELECT policyname, cmd, qual, with_check FROM pg_policies` to inventory what was actually live before testing. The `claims` INSERT policy's `with_check` only contained the claimant/ownership/resolved checks — the "must have an active lost post to claim a found post" clause (the whole anti-shopping rule from Section 7) was missing entirely.

**Cause:** Best guess — an earlier, simpler draft of the policy got applied and was never replaced with the full version once the found-post gating logic was added.

**Fix:** Dropped and recreated the policy with the complete `WITH CHECK`, restoring the nested `p.type = 'lost' OR EXISTS (...)` condition.

**Verified:** Re-ran the `pg_policies` inventory and confirmed the full condition was present in `with_check`.

### 9.2 — `claims` had no column-level INSERT grant at all

**Problem:** Checked `information_schema.role_column_grants` for `claims` and found `INSERT` privilege present on *every* column — `post_id`, `claimant_id`, `created_at`, `id`, and critically `status`. No `REVOKE`/`GRANT` had ever been applied to `claims` for `INSERT`, only for `UPDATE`.

**Why it mattered:** This meant a client could insert a claim with `status = 'approved'` directly, completely bypassing the finder's approval step — the exact trust mechanism FR-5.2 exists to enforce.

**Fix:**
```sql
REVOKE INSERT ON public.claims FROM authenticated;
GRANT INSERT (post_id, claimant_id) ON public.claims TO authenticated;
```
Only `post_id`/`claimant_id` stay insertable; `id`, `created_at`, and `status` fall back to their defaults (`gen_random_uuid()`, `now()`, `'pending'`) no matter what a client sends.

**Verified:** Re-checked the grants (only `post_id`/`claimant_id` showed `INSERT`), then later confirmed live — an insert explicitly trying to set `status = 'approved'` was rejected, while an insert omitting `status` succeeded and correctly defaulted to `'pending'`.

### 9.3 — Signup trigger for `public.users` never existed

**Problem:** Started real testing by checking whether the two test accounts had mirrored `public.users` rows. Zero rows came back. Traced this to `pg_trigger` on `auth.users` — every trigger present was a Postgres-internal `RI_ConstraintTrigger` (FK plumbing), none was an actual signup trigger.

**Cause:** This had been flagged as an unconfirmed "still to build" item all the way back in the original schema notes (`lostnfound-schema-notes.md`) — it turned out to genuinely never have been built, not just unconfirmed.

**Fix:** Created the trigger, researched and matched to Supabase's own documented pattern (including their `search_path = ''` security recommendation, which the first draft of this trigger didn't have):
```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, username)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;

create or replace trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
```
Backfilled the two pre-existing test accounts by hand, since the trigger only fires on *new* signups going forward.

**Verified:** Created a third throwaway account (`johnny`) through the dashboard and confirmed it got a `public.users` row automatically, with `username` populated from the email prefix — no manual insert needed. Confirmed the trigger works for real future signups, not just the two backfilled accounts.

### 9.4 — Infinite recursion in the `posts` SELECT policy

**Problem:** First real attempt to browse posts as a test user threw `ERROR: 42P17: infinite recursion detected in policy for relation "posts"`.

**Cause:** The found-post gating policy checks "does this user have an active lost post" by subquerying `posts` — from *inside a policy that governs `posts`*. Every row-visibility check on `posts` requires evaluating that same policy, which requires querying `posts` again, which requires evaluating the policy again — Postgres detects the cycle and aborts rather than loop forever. Confirmed via research as a well-known, commonly-hit Postgres/Supabase pattern whenever a policy subqueries its own table, not something specific to this schema.

**Fix:** Wrapped the self-check in a `SECURITY DEFINER` helper function, which bypasses RLS on its internal query (since it runs as the function's owner rather than the querying user), breaking the cycle:
```sql
create or replace function public.has_active_lost_post(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.posts
    where user_id = uid
    and type = 'lost'
    and resolved = false
  );
$$;
```
Both the `posts` SELECT policy and the `claims` INSERT policy (9.1) were rewritten to call `public.has_active_lost_post(auth.uid())` instead of embedding the raw subquery directly.

**Verified:** Re-ran the same browse query that originally threw the recursion error — it returned cleanly. Considered alternatives (avoiding the self-reference entirely, caching the fact in the JWT) and confirmed via research that a `SECURITY DEFINER` function is the standard fix specifically for this shape of problem (a fast-changing fact that lives inside the same table the policy protects) — JWT caching fits slower-changing facts like admin role, not something that changes every time a post is created or resolved.

### 9.5 — Test posts silently never existed

**Problem:** After fixing 9.4, tested whether a user with an active lost post could see another user's found post. Got zero rows back — expected at least one.

**Cause:** The original post-creation statements had been run *before* 9.3 was fixed, back when `public.users` was still empty — so every one of those inserts had actually failed on the `posts.user_id → public.users.id` foreign key at the time, and the conversation moved on to diagnosing 9.3/9.4 without ever circling back to re-run them. The posts referenced in later steps had never really been created.

**Fix:** Re-ran the original post-creation inserts (one lost post, one found post) now that `public.users` actually had rows to reference.

**Verified:** Re-ran the visibility check — this time it correctly returned the found post.

### 9.6 — Foreign key error chased a red herring before finding the real cause

**Problem:** Re-creating the test posts (9.5) still failed on insert: `violates foreign key constraint "Posts_user_id_fkey"`, `Key is not present in table "users"`.

**False lead:** The capital `P` in `Posts_user_id_fkey` looked like a sign of a duplicate, differently-cased `"Posts"`/`"Users"` table left over from initial schema setup (a known risk flagged in the original schema notes). Checked `information_schema.tables` directly — ruled this out. Only one `public.users` existed; the capitalization was just a naming fossil from however the constraint was originally auto-named, not a sign of a second table.

**Real cause:** The manual backfill of the two test accounts into `public.users` (done as part of fixing 9.3) had never actually taken effect. This had gone undetected because the verification query at the time used a `LEFT JOIN`, which shows `NULL` for `username` both when a row is missing entirely *and* when a row exists with a blank username — it couldn't distinguish the two cases, so the "it looks empty" signal was misread as "already inserted, just unnamed."

**Fix:** Re-ran the backfill using `ON CONFLICT (id) DO NOTHING` (safe to re-run regardless of current state), and verified with a direct, unambiguous query instead of a join:
```sql
INSERT INTO public.users (id, username)
SELECT id, split_part(email, '@', 1)
FROM auth.users
WHERE email IN ('iamadityadogra@gmail.com', 'iamneeky@guadalupe.com')
ON CONFLICT (id) DO NOTHING;
```
Switched from hardcoded UUIDs to an email-based lookup here specifically to remove copy-paste id mismatches as a source of future bugs.

**Verified:** Direct `SELECT ... WHERE id IN (...)` (no join) confirmed both rows now genuinely existed with real usernames. Post creation then succeeded.

### 9.7 — `claims` INSERT blocked again mid-testing — this time a real gap, briefly mistaken for a false alarm

**Problem:** First live claim-creation attempt (as a real test user, post-9.2 fix) threw `permission denied for table claims`.

**Cause:** Checked `information_schema.table_privileges` — the table-level `REVOKE INSERT` from 9.2 had correctly applied, but the corresponding `GRANT INSERT (post_id, claimant_id)` had not actually landed (never confirmed at the time it was first run).

**Fix:** Re-applied `GRANT INSERT (post_id, claimant_id) ON public.claims TO authenticated;` and re-verified via `information_schema.role_column_grants` before retrying.

**Verified:** The claim insert succeeded.

**Related false alarm right after:** The very next test — deliberately trying to insert a claim with `status = 'approved'` spoofed in — threw the *same* `permission denied` error. Initial concern was that the real fix from above hadn't actually taken either. Isolated by running the plain insert (no `status`) alone: it succeeded cleanly. Confirmed the spoof-test error wasn't a bug at all — it was the 9.2 column grant correctly doing its job, blocking the one column it was specifically designed to block. Same error text, two different meanings — one a real gap, one a working guardrail — worth remembering that `permission denied` alone doesn't tell you which.

### 9.8 — Full approve/reject/withdraw sequence — passed, with one useful surprise

Ran the full adversarial sequence: claimant approving their own claim (should fail), post owner approving it (should succeed), claimant withdrawing an already-approved claim (should fail), claimant withdrawing a genuinely pending claim (should succeed).

**Useful surprise:** "Claimant approves own claim" and "claimant withdraws an approved claim" are both blocked, but not the same way. The first threw an explicit `42501 new row violates row-level security policy` error; the second silently updated zero rows with no error at all. Cause: RLS blocks happen at two different stages — `USING` decides which rows you can even attempt to touch (fails silently, zero rows), `WITH CHECK` validates the row *after* the proposed update (fails loudly, explicit error). The claimant's own-claim-approval attempt passed `USING` (he's genuinely the claimant on a genuinely pending row) but failed `WITH CHECK` (the target value `'approved'` isn't allowed by the withdraw-only policy) — hence the explicit error. The approved-claim-withdrawal attempt failed `USING` outright (`status = 'pending'` was no longer true), so it never reached `WITH CHECK` at all — hence the silent no-op.

**Verified:** Every step behaved as intended; the two different failure modes above were both confirmed deliberately, not just noticed by accident.

### 9.9 — Delete blocked by foreign key, not RLS

**Problem/test:** Post owner attempted to delete a found post that had an approved claim attached.

**Result:** Failed with `ERROR: 23503 ... violates foreign key constraint "claims_post_id_fkey"`, `Key is still referenced from table "claims"`.

**Why this one's worth logging separately:** Distinct error code (`23503`, foreign-key violation) from every other failure in this session (`42501`, permission/RLS). Confirms this specific protection — "a post with claims can't be deleted" — lives at the schema/constraint layer, not RLS. Matches the intended design from Section 7 (`claims_post_id_fkey` is `on delete no action`), and confirms the frontend will need to catch this specific error and surface a real message ("resolve or reject claims before deleting") rather than a raw Postgres error.

### Side effects noticed during testing, not yet acted on

- **Duplicate claim rows.** Several identical claim rows (same `post_id`/`claimant_id`/`status`) ended up in the table as a byproduct of re-running insert statements while debugging 9.7. Harmless for testing, but surfaced a real, undecided gap: nothing currently stops a user from submitting multiple pending claims on the same post. Two options considered, neither yet implemented:
  ```sql
  -- Option: enforce at most one pending claim per (post, claimant)
  CREATE UNIQUE INDEX one_pending_claim_per_user_per_post
  ON public.claims (post_id, claimant_id)
  WHERE status = 'pending';
  ```
  Or leave as-is, since finder approval is manual anyway and duplicates are just UI clutter, not a security issue.
- **Recommended index, not yet performance-tested:** `CREATE INDEX idx_posts_user_type_resolved ON public.posts (user_id, type, resolved);` — matches the exact filter used by `has_active_lost_post`. Not urgent at current data volume; cheap to add before it matters.

### Still open after this test pass

- Full adversarial RLS test sequence has **not** been re-run against `users` since the id/trigger issues in 9.3/9.6 — only spot-checked earlier in the session, before those fixes landed.
- Decision needed on the duplicate-pending-claims question above.
- The `not null` constraint check on `posts.type`/`user_id`/`resolved` and `claims.post_id`/`claimant_id` (suggested earlier) was never actually run against the live schema to confirm those constraints exist.
- Leftover duplicate claim rows from 9.7's debugging can be cleaned up, optional.

---

## 10. Devlog — Frontend Bootstrap, Tooling, and the Auth Hook

### 10.1 — Platform correction: native mobile app, not responsive web

Caught before any real frontend work diverged down the wrong path. `LostnFound.md` (through v0.4) documented "responsive web only" as the scope, with a React + Vite + Vercel tech stack — but the actual intended platform was a native installable app (React Native) from the start. Documentation error, not a real scope change. Corrected in `LostnFound.md` v0.5: tech stack swapped to React Native + Expo, "native mobile apps" removed from the out-of-scope list, NFR8 reworded. The Vite scaffold already built at that point was discarded — none of it was reusable for a native app (different rendering model entirely, not just a different bundler).

### 10.2 — Environment setup

Node.js installed via `nvm` rather than Homebrew or the official installer — chosen specifically for per-project version control (a `.nvmrc` file can pin the exact Node version a project expects), which matters more once collaborators are involved. Installed Node 24 (current LTS at time of setup).

Scaffolded with `npx create-expo-app@latest`, choosing **Oxlint** over ESLint for linting — zero-config, faster, and the plugin-ecosystem gap versus ESLint doesn't matter at this project's current scale (solo build, no specialized lint rule requirements).

### 10.3 — Folder structure mishaps: `src` and `.git` both landed outside `frontend/`

**Problem:** `mkdir -p src/types` and `supabase init` were run from the project root (`Lostandfound/`) rather than from inside `frontend/`, so both `src/types/database.ts` and the `supabase/` config folder landed as siblings of `frontend/` instead of `src` being nested inside it.

**Cause:** Terminal commands run from whatever directory the terminal happened to be in at the time, not from where they were conceptually intended to apply.

**Fix:** `supabase/` was left in place — correct there, since it's tooling/config, not app code, and doesn't need to be inside `frontend/` at all. `src/` was merged into `frontend/src/` with `cp -r src/. frontend/src/` followed by `rm -rf src`, preserving Expo's own default scaffold contents (`app/`, `components/`, `constants/`, `hooks/`) already sitting in `frontend/src`.

**Related, separately:** Expo's `create-expo-app` also auto-initializes its own git repo inside `frontend/` by default — discovered when `git status` from the project root reported "not a git repository" despite a repo clearly existing somewhere (found via `find ~/Downloads -name ".git"`). Fixed by deleting the nested repo (`rm -rf frontend/.git`, safe since it had no commits) and running `git init` at the actual project root instead, so one repo covers `frontend/`, `supabase/`, and the planning docs together.

**Verified:** `find . -name "database.ts"` confirmed the file's final correct path; `git status` from the project root correctly tracked all three top-level folders after the fix.

### 10.4 — Generated types caught a real, previously-unconfirmed schema gap

Running `supabase gen types typescript` against the live schema — the step that produces `frontend/src/types/database.ts` — surfaced something concrete: `posts.type`, `posts.user_id`, and `posts.resolved` all generated as nullable (`string | null` etc.) in the output. This was the exact `not null` constraint gap flagged as unconfirmed all the way back in 9's "still open" list — the generated types file proved definitively it had never actually been applied, since the type generator reads real column nullability straight from Postgres, not from notes or intentions.

**Fix:**
```sql
ALTER TABLE public.posts ALTER COLUMN type SET NOT NULL;
ALTER TABLE public.posts ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.posts ALTER COLUMN resolved SET NOT NULL;
```

**Verified two ways:** regenerated the types file and confirmed all three fields lost their `| null`; separately reasoned (and confirmed by the constraints applying without error) that no existing row could have had a null value in those columns, since `ALTER TABLE ... SET NOT NULL` fails outright if any row would violate it — so applying cleanly was itself proof no data was at risk. Directly queried `posts` afterward and confirmed all three existing test rows still had real, non-null values across all three columns, undisturbed by the change.

### 10.5 — GitHub reconciliation: local and remote had unrelated histories

**Problem:** First `git push` was rejected — `[rejected] main -> main (fetch first)`. GitHub's repo wasn't actually empty (a mistaken assumption); it likely had an auto-created README from initial repo setup on the website.

**Fix:** `git pull origin main --allow-unrelated-histories --no-rebase` (the `--no-rebase` needed on top of the unrelated-histories flag, since git additionally required an explicit reconcile strategy for the divergent branches) — resolved via the default merge commit message in `vim`, then `git push -u origin main` succeeded.

**Verified:** confirmed on GitHub's web UI that the full project (not just the original README) was present after the push.

### 10.6 — Auth Hook: `.edu` domain restriction (FR-1.5), including a URL mix-up during testing

Built as a `before-user-created` Postgres function hook (see `LostnFound.md` 12.8 for the full design/reasoning) rather than client-side validation, matching the same "enforce at the layer that can't be bypassed" philosophy as RLS.

**First test attempt — via Dashboard "Add User"** — succeeded in creating a non-`.edu` test account, which shouldn't have happened. Root cause turned out to be that the hook had never actually been registered yet in Dashboard → Authentication → Hooks (still showing the empty "Create an auth hook" state at the time) — not a flaw in the function itself. Once actually added and saved there, direct dashboard-created-user testing was set aside in favor of testing through the real `supabase.auth.signUp()` path instead, since that's the actual path the real app will use.

**Second issue, while writing a standalone test script:** got `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` — the Supabase client was receiving an HTML page back instead of a JSON API response. Traced to `EXPO_PUBLIC_SUPABASE_URL` in `.env` being set to the **dashboard page URL** (`https://supabase.com/dashboard/project/[ref]`) rather than the actual **API URL** (`https://[ref].supabase.co`) — an easy mix-up since both are plausible-looking Supabase URLs, but only one is the real API endpoint.

**Fix:** corrected `.env` to the proper `https://[ref].supabase.co` format.

**Verified, via a standalone script calling `supabase.auth.signUp()` directly** (loaded with `node --env-file=.env`, reading the real project `.env` rather than hardcoding credentials in the test script):
- A non-`.edu` email was rejected, with the hook's exact custom error message coming through
- A real `.edu` email was correctly allowed through

Both directions confirmed, closing out FR-1.5 as genuinely implemented and tested, not just written.

### 10.7 — Auth context scaffolded, `feature/auth` branch opened

Started the actual sign-in/sign-up UI work with a shared `AuthContext` (`src/context/AuthContext.tsx`) — tracks the current Supabase session app-wide via `onAuthStateChange`, so individual screens don't each need to independently check login state.

Adopted the branch-per-feature workflow discussed for this project going forward: `git checkout -b feature/auth` before starting this work, rather than continuing to commit straight to `main` now that `main` has a working, pushed baseline worth protecting.

### Team update

A second contributor joined the project partway through this stage. Worth revisiting: the git branching guidance up to this point (kept deliberately lightweight — no PR review requirement, no `develop` branch — specifically because a heavier process was considered overkill for a *solo* developer) may be worth one more look now that there are two people committing. The core recommendation (feature branches, `main` stays deployable) likely still holds, but this is a good moment to also settle: does a second contributor's work get merged via a reviewed pull request now, or still merged locally the same lightweight way? Not yet decided.

---

## 11. Devlog — AuthContext, AuthProvider, and Session Handling

Continuation of Section 10's frontend bootstrap, still on `feature/auth`. This section covers building the actual session-state layer on top of `lib/supabase.ts`, plus three research-backed decisions made along the way.

### 11.1 — `lib/supabase.ts` finalized: plain `AsyncStorage`, no `Platform.OS` branching

Confirmed the client should use unconditional `AsyncStorage` as the session storage adapter — no web/native branching, since the project is native-only (per the v0.5 platform correction in `LostnFound.md`). This matches Supabase's own current default recommendation for React Native. `createClient<Database>(...)` is used with the generated types from 10.4, giving typed `.from(...)` calls throughout the app.

Added an `AppState` listener alongside the client, registered once at module scope:
```ts
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh()
  } else {
    supabase.auth.stopAutoRefresh()
  }
})
```
Without this, `autoRefreshToken: true` doesn't proactively refresh just because the app is foregrounded, and keeps attempting refreshes while backgrounded. This registers once, at import time — a bug here would most likely show up as the listener firing more than once due to a duplicate module import, not a mistake in the listener itself.

**Storage decision, made explicitly rather than defaulted into:** plain `AsyncStorage` is unencrypted on-device storage. A stronger option — `LargeSecureStore` (AES-256 key in `expo-secure-store`/Keychain, encrypted session blob in `AsyncStorage`, needed because SecureStore alone caps around 2KB per value, smaller than a session) — was considered and deliberately deferred. RLS is the real security boundary here, not local storage, so `AsyncStorage` is a legitimate MVP choice. Documented as a known, revisitable trade-off rather than an oversight.

### 11.2 — `users.email` question (open since the original schema notes) resolved: no column added

The original schema notes flagged `users.email` as unresolved — needed for FR-5.3's post-approval contact exchange, but never decided how. Resolution: **no column added to `public.users` at all.**

Reasoning: any email column readable by the client would break the entire point of gating contact info behind claim approval, since `users` SELECT is currently `using (true)` (public read) and RLS can't restrict individual columns — a column grant `REVOKE`/`GRANT` would be needed on top, denormalizing `auth.users.email` and creating a sync problem (stale copy if a user changes their email) with no corresponding upside.

Instead, contact-email delivery goes through a dedicated `SECURITY DEFINER` function that reads `auth.users.email` directly — no denormalized copy, always current, no new column-grant surface to maintain:
```sql
CREATE OR REPLACE FUNCTION public.get_contact_email(claim_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result text;
BEGIN
  SELECT
    CASE
      WHEN c.claimant_id = auth.uid() THEN owner_auth.email
      WHEN p.user_id = auth.uid() THEN claimant_auth.email
      ELSE NULL
    END
  INTO result
  FROM public.claims c
  JOIN public.posts p ON p.id = c.post_id
  JOIN auth.users owner_auth ON owner_auth.id = p.user_id
  JOIN auth.users claimant_auth ON claimant_auth.id = c.claimant_id
  WHERE c.id = claim_id AND c.status = 'approved';

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_contact_email(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_contact_email(uuid) TO authenticated;
```
Returns the *other* party's email (never the caller's own), and only for an `approved` claim where the caller is genuinely the claimant or the post owner — otherwise `NULL`, matching the existing "fail quiet" pattern already used throughout the RLS `USING` clauses.

**Still to do:** this function bypasses `claims` RLS internally (that's the point of `SECURITY DEFINER`), which means its own `CASE`/`WHERE` logic — not RLS — is now the only thing preventing a wrong-party email leak. Needs the same real-two-test-account adversarial pass described in Section 8: claimant on an approved claim, owner on an approved claim, an unrelated third account, and a still-`pending` claim, confirming the right party gets an email and everyone else gets `null`. Not yet run.

For viewing a user's *own* email (e.g. a "My Profile" screen) — a different case, not gated by anything — `claims.email` from the already-fetched JWT claims is used directly, no query needed.

### 11.3 — `onAuthStateChange` deadlock warning checked against installed version — not applicable

Supabase historically documented a real deadlock risk: `await`ing another Supabase auth call (e.g. `getClaims()`) directly inside the `onAuthStateChange` callback could hang, since the callback ran synchronously while holding an internal lock. The documented workaround wrapped the awaited call in `setTimeout(..., 0)`.

Checked against the currently installed version, `@supabase/supabase-js@2.116.0` — past the `2.107.0` release that removed the `navigator.locks`-based mutex causing this class of deadlock (release notes: "remove navigator.locks-based mutex; introduce commit guard + dispose()"). Confirmed by checking the current live `onAuthStateChange` reference page, which no longer carries the deadlock warning or the `setTimeout` example that used to be there.

**Conclusion:** `AuthProvider`'s callback awaits `getClaims()` directly, without a `setTimeout` wrapper, and this is fine on the installed version:
```tsx
supabase.auth.onAuthStateChange(async (_event, _session) => {
  const { data } = await supabase.auth.getClaims()
  setClaims(data?.claims ?? null)
})
```
Worth re-checking if `@supabase/supabase-js` is ever downgraded, or if a future contributor's environment pins an older version.

### 11.4 — Files created this session

```
frontend/src/lib/supabase.ts              # client + AsyncStorage + AppState listener
frontend/src/hooks/use-auth-context.tsx   # AuthContext, useAuthContext()
frontend/src/providers/auth-provider.tsx  # fetches claims + profile, subscribes to auth changes
```
`AuthProvider` fetches `claims` via `getClaims()` (not `getSession()`/`getUser()`, for the same reason `getClaims()` is used elsewhere — no network round-trip just to check login state), then fetches the matching `public.users` row keyed on `claims.sub`, using explicit column selection (`select('id, username, created_at')`) rather than `select('*')` — deliberate, since it fails loudly and specifically if a future column-grant change removes read access to a column, rather than silently breaking on `*`.

**Still open:**
- `components/splash-screen-controller.tsx` not yet created.
- `app/_layout.tsx` not yet wired with `AuthProvider`, `SplashScreenController`, or `Stack.Protected`.
- Login/signup screens not yet built — plumbing exists, no UI calls `signInWithPassword`/`signUp` yet.
- Email verification + password reset deep-linking (FR-1.2, tied to Section 10.6's flagged gap) — scheduled right after the above, before Phase 0 is considered done.
- CAPTCHA/bot protection on signup — deliberately deferred to near Phase 4 (real campus launch); Supabase's default auth rate limits are already active with no setup needed.

---

## 12. CEO Plan Review (2026-10-08)

Ran `/plan-ceo-review` (Selective Expansion mode) plus an independent outside-voice review. The full decision list is in the `LostnFound.md` v0.6 changelog. Deferred items are in `TODOS.md`.

### 12.1 — Correction to 11.4: the auth layer isn't committed yet

Section 11.4 lists `use-auth-context.tsx` and `auth-provider.tsx` as created. In the repo, both are **0 bytes**. `lib/supabase.ts` also doesn't have the `AppState` listener described in 11.1. The designs in 11.1–11.3 still stand, but the code hasn't been written. **New rule for this log:** a feature is marked done only once it's committed, the same "verified means confirmed live" standard already used for SQL in section 9.

### 12.2 — Root cause behind six earlier bugs

Bugs 9.1, 9.2, 9.3, 9.6, 9.7 and 10.4 share one cause: schema changes were made by hand in the dashboard and never confirmed. The fix is structural, not more care:
- `supabase db pull` baseline into `supabase/migrations/`
- every change goes in as a migration through a PR
- the pgTAP suite turns section 8's checklist into CI tests
- a staging project gets every change before prod

### 12.3 — Biggest corrections from the review

- §12.6 only matched in one direction (on lost-post insert). A found item posted after the lost post was never matched. The pipeline now runs in both directions.
- The client could write `posts.embedding` directly. That's now server-side only.
- No storage design existed for the photos in FR-2.1. There's now a private bucket, a storage policy that defers to the posts RLS, and EXIF stripping on the device.
- Launch blockers that weren't in the plan at all: Supabase's default SMTP only reaches team members, and the app stores require report/block and in-app account deletion.
- Matches-gated found-post visibility was dropped for launch, since it would hide true matches that fall outside someone's top-K.

### 12.4 — Resolved open items from earlier sections

- Duplicate pending claims (section 9): partial unique index adopted.
- Two-contributor git workflow (10.7): PR, green CI, one approval. Staging deploys automatically; prod deploys manually.
- Open Question 1, academic vs. product: run it for one full semester (Spring 2027), then decide based on the numbers.
