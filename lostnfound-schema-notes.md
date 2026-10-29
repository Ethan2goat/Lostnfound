# Lost & Found — Database Schema (as of current Supabase state)

> **Historical snapshot (pre-2026-10-08).** Once the `supabase db pull` baseline lands, `supabase/migrations/` is the source of truth for the schema. The planned schema changes (`post_photos`, `post_embeddings`, `buildings`, `matches`, `push_tokens`, `reports`, pipeline status columns, the `closed` claim status) are listed in the `LostnFound.md` v0.6 changelog.

This reflects the schema as actually built in Supabase (from screenshots), plus the design
decisions made in the schema-design conversation. Items marked **⚠ verify** are things that
were decided in conversation but weren't visibly confirmed in the latest screenshots — check
these directly in Supabase before relying on them.

---

## Naming convention

All tables and columns are lowercase, `snake_case`. Postgres folds unquoted identifiers to
lowercase automatically — capitalized names only survive if quoted everywhere, which causes
constant friction (query errors, mismatched app code). Keep everything lowercase.

**Known issue to fix:** `users.Username` is currently capitalized (should be `username`) and
the `users` table itself may have been created with a capitalized name (`"Users"`) at one
point during setup — confirm current actual table name and column casing before writing app
code against it.

---

## Table: `users`

Public-facing profile table, distinct from Supabase's own `auth.users`. `users.id` deliberately
**mirrors** `auth.users.id` (same value, not independently generated) so a user's profile row
and their Auth identity are the same identity.

| Column | Type | Default | Primary Key | Notes |
|---|---|---|---|---|
| `id` | `uuid` | *(none)* | ✅ | Must be supplied explicitly (from `auth.users.id`) at insert — never auto-generate this |
| `username` | `varchar` | *(none)* | | Currently capitalized as `Username` — rename to lowercase |
| `created_at` | `timestamptz` | `now()` | | |

**Foreign key:** `id → auth.users.id`
- On update: `no action` (id should never change)
- On delete: `cascade` (deleting the Auth account removes this profile too) — **⚠ verify this is still set**, since it was decided early and not visible in the latest `users` screenshot

**Still open / not yet resolved:**
- ~~Whether to add an `email` column~~ — **resolved: no.** Contact-email delivery for FR-5.3 goes through a `SECURITY DEFINER` function (`get_contact_email`) that reads `auth.users.email` directly, gated on claim approval — no denormalized copy on `public.users`, no sync problem. See `LostnFound.md` §12.9. A user's own email (for self-display) comes from `claims.email` client-side, no query needed.
- Whether/what `school_id` is for — never resolved, currently not in the table at all
- Column-level grants to restrict `update` to only `username` (not `id`, not `created_at`) — discussed, not yet implemented
- RLS: enabled, 0 policies written yet (see RLS section below)

---

## Table: `posts`

Holds **both** found-item posts and lost-item posts, distinguished by `type`. This single-table
design was chosen deliberately so a newly-inserted post (either type) can be matched against
existing posts of the opposite type — enabling both "loser finds a found post" and "finder
finds a lost post" flows without duplicating matching logic across two tables.

| Column | Type | Default | Primary Key | Notes |
|---|---|---|---|---|
| `id` | `uuid` | `gen_random_uuid()` | ✅ | Post's own independent identity |
| `type` | `text` | *(none)* | | Should have `check (type in ('found','lost'))` — **⚠ verify constraint exists**, add via SQL Editor if not |
| `category` | `text` | *(none)* | | Plain text/enum-style column, no separate `categories` table (deliberately skipped for MVP) |
| `description` | `text` | *(none)* | | |
| `resolved` | `bool` | `false` | | Marks item as returned/resolved |
| `created_at` | `timestamptz` | `now()` | | |
| `user_id` | `uuid` | *(none)* | | FK to `users.id` — no default, must be supplied explicitly by app (whoever's logged in) |
| `embedding` | `vector` | *(none)* | | Requires the `vector` extension (Supabase lists it as "vector", same as pgvector). Dimension currently placeholder `vector(512)` — **must match whatever embedding model is finalized**; changing dimension later requires regenerating all stored embeddings |

**Foreign key:** `posts_user_id_fkey` — `user_id → public.users.id`
- On update: `no action`
- On delete: **restrict** (decided in conversation — a user with active posts must resolve/delete them before their account can be removed; prevents silent orphaning) — **⚠ verify this is actually set to restrict/no action and not cascade**, since it wasn't visible in the latest screenshot

**Still open:**
- `not null` constraints on `type`, `user_id`, `resolved` — should be enforced but not confirmed set in latest screenshot
- Final embedding dimension, pending model choice
- RLS: enabled, 0 policies written yet

---

## Table: `claims`

Records claim *attempts* — not posts themselves. A claim always has a `post_id` (the post being
claimed) and a `claimant_id` (whoever's initiating contact). This same shape covers both
directions: a loser claiming a found post, or a finder claiming ("I found this") a lost post —
direction is inferred by joining back to `posts.type`, not stored redundantly.

| Column | Type | Default | Primary Key | Notes |
|---|---|---|---|---|
| `id` | `uuid` | `gen_random_uuid()` | ✅ | |
| `post_id` | `uuid` | *(none)* | | FK to `posts.id` — no default, must reference an existing post |
| `claimant_id` | `uuid` | *(none)* | | FK to `users.id` — no default, must reference an existing user |
| `status` | `text` | `'pending'::text` | | Should have `check (status in ('pending','approved','rejected'))` — **⚠ verify constraint exists** |
| `created_at` | `timestamptz` | `now()` | | |

**Foreign key:** `claims_claimant_id_fkey` — `claimant_id → public.users.id`
- On update: `no action`
- On delete: **restrict / no action** (a user with pending or historical claims can't have their account deleted out from under those records)

**Foreign key:** `claims_post_id_fkey` — `post_id → public.posts.id`
- On update: `no action`
- On delete: **no action** (a post with claims attached can't be deleted until claims are resolved — prevents orphaned claim history)

**Still open:**
- `not null` constraints on `post_id`, `claimant_id`, `status` — should be enforced, not confirmed set
- RLS policy will need to check *both* `claimant_id = auth.uid()` **and** whether the requester owns the related post (via join to `posts.user_id`), since both the claimant and the post owner need visibility into a claim

---

## Relationships summary

```
auth.users.id
      │ (mirrors, no default, on delete cascade)
      ▼
   users.id (PK)
      │
      ├──────────────────────────────┐
      │ (on delete restrict)         │ (on delete restrict)
      ▼                              ▼
  posts.user_id              claims.claimant_id
      │
      │ (on delete no action)
      ▼
  claims.post_id
```

---

## Row Level Security (RLS)

Current state (confirmed via SQL query): all three tables (`users`, `posts`, `claims`) have:
- `rls_enabled = true` — correct, required for any table in the exposed `public` schema
- `rls_forced = false` — correct, should stay false (forcing RLS would also restrict the
  table owner / service role, not just end users)
- `policy_count = 0` — **no policies written yet**, meaning all three tables are currently
  completely inaccessible via the client API (locked, not open) until policies are added

**Policies still to design:**
- `users`: public read; `update` restricted to own row (`auth.uid() = id`) with `with check`
  to prevent changing `id`; column-level grant to limit which columns are updatable
- `posts`: public read (browsing); `update`/`delete` restricted to `user_id = auth.uid()`
- `claims`: `select` should allow both the claimant and the related post's owner to see the
  row (requires a join/subquery against `posts.user_id`, not just a direct column check)

---

## Extensions

- **`vector`** (pgvector) — installed, enables the `vector` column type on `posts.embedding`
  and future similarity search via `pgvector`'s ivfflat/hnsw index types

---

## Not yet built (per MVP requirements, still pending)

- Actual RLS policies (see above)
- Column-level grants restricting which fields are updatable on `users` and `posts`
- Any table for match/notification logging (deferred until posts + claims are working
  end-to-end)
- `check` constraints on `posts.type` and `claims.status` — confirm these actually got added,
  since the Supabase table-editor UI doesn't expose a check-constraint field while creating a
  new table (only after, via editing the column, or directly via SQL Editor)
