# Lost & Found App — Requirements Analysis & Project Plan

Version: 0.6.1 (zero-spend until MVP, 2026-10-22 — see Changelog)

---

## Changelog (v0.6 → v0.6.1)

**Budget rule: spend $0 until the MVP works end to end** (post → match → claim → contact exchange, tested with friends). Anything that costs money waits until then. Where v0.6 assumed a paid item, the free substitute below applies for the MVP:

| v0.6 assumed | MVP (free) | Pay later, when |
|---|---|---|
| Apple Developer account ($99/yr) | Test on our own phones with Expo Go | Before App Store / TestFlight submission |
| Google Play account ($25 one-time) | Expo Go; Android builds sideloaded to testers | Before the Play closed test |
| Resend + custom domain (~$10/yr) for auth email | "Confirm email" off while testing with friends; before real students sign up, use a free sender that needs no domain (Brevo free tier or a Gmail app password) | Only if free sending limits or deliverability become a problem |
| CLIP hosted on Modal | Open-source CLIP (`openai/clip-vit-base-patch32`, 512-dim, matches `vector(512)`) run locally for development and the eval set, then on a free Hugging Face Space (CPU) for the MVP | If cold starts or limits on the free Space hurt real usage |

**Timeline impact (T12):** store submissions (TestFlight, Play closed test) move from "by Dec 6" to "after the MVP works", which pushes the store-approved public launch later than Spring 2027 week 1 unless the MVP is done early. Accepted trade-off: no money spent on a product that doesn't work yet. Re-plan the launch date once the MVP is working.

**Must be undone before real users:** "Confirm email" turned back on (with working email sending), so nobody can sign up as someone else's utdallas.edu address.

---

## Changelog (v0.5 → v0.6)

Result of a full `/plan-ceo-review` pass plus an independent outside-voice review. Decision IDs (D#/T#) refer to the review record. Where a T# conflicts with a D#, the T# wins.

**Architecture**
- **Matching pipeline is server-side (D2, T3, T8).** "Self-hosted CLIP" and "no backend server" (§12.1) contradicted each other: the model has to run somewhere. Decision: a JWT-authenticated `process-post` Edge Function, called by the client once a post's photos are uploaded. It checks that the caller owns the post, calls a hosted CLIP/SigLIP endpoint (Modal, scale-to-zero), and writes embeddings and `matches` with the service role. **The client can no longer write `embedding`** (it was in the INSERT grant, which let anyone steer the ranking). A one-day hosting spike comes first (cold-start latency, free-tier math). Fallback: Supabase's built-in gte-small, text only.
- **v1 embeds the description plus the first photo** (T8). Each embedding row records `model`/`dim`, so multi-photo embedding can be added later without a migration headache (see TODOS.md).
- **Matching runs in both directions (D10).** Any new post, lost or found, is scored against active posts of the opposite type, and `matches` is upserted for both sides. Previously, a found post created after a lost post was never matched against it.
- **Pipeline status and retry (D12).** `posts.pipeline_status` (`draft`/`pending`/`ready`/`failed`), plus `pipeline_attempts` and `pipeline_error`. Upserts are idempotent (unique `(lost_post_id, found_post_id)`). A pg_cron sweeper retries up to 5 times. The UI shows "Finding matches…" while a post is pending.
- **Draft-first post creation (D13).** Insert the post as a draft → re-encode and upload photos to `post-photos/{post_id}/` → insert `post_photos` rows → flip to `pending`. Cron deletes drafts older than 24h.
- **Ranking lives in a pure TS module** `supabase/functions/_shared/ranking.ts` (D21). The pipeline and the eval script share it. Every `matches` row stores its component scores and `weights_version`.
- **Migrations-first (D9).** Schema, RLS, grants, functions and the Auth Hook move to `supabase/migrations/`. Nothing gets edited by hand in the dashboard again. Six devlog bugs (9.1, 9.2, 9.3, 9.6, 9.7, 10.4) came from SQL that never actually landed.

**Matching rules**
- **Category becomes a score term, not a hard filter (T5):** same = 1, adjacent = 0.5, otherwise 0. FR-4.3 updated.
- **Date filter gets a grace window (D20):** `found_date >= lost_date - 3 days`. Closeness in time is handled by the time term. Dates are stored as `date`, not timestamps. FR-4.4 updated.
- **Location is a UTD building picker (D4):** a `buildings` table with lat/lng, an optional `location_note`, and an "Other / outdoor" row. Proximity is the haversine distance. Free-text location (FR-2.3) couldn't support FR-4.8's location term.

**Security**
- **Found-post visibility (T4, supersedes the §12.6 upgrade plan).** The "has an active lost post" gate is now the launch rule. `matches` drives ranking and push notifications only, not RLS. Gating on matches would permanently hide any true match that missed someone's top-K. Revisiting it is a P3 TODO.
- **Private photo bucket (D14).** The storage SELECT policy defers to the posts RLS, and the client gets signed URLs.
- **EXIF stripped (D15).** Photos are resized to about 1280px and re-encoded on the device before upload, which removes GPS metadata.
- **Push tokens go in an owner-only `push_tokens` table (D26)**, never on `users`, because `users` is publicly readable.
- **Type is locked after creation (D17).** `type` is removed from the posts UPDATE grant. Editing a matchable field resets `pipeline_status` to `pending`.

**Claims**
- **New terminal status `closed` (D18).** Resolving a post closes its pending claims. The check constraint is now `pending`/`approved`/`rejected`/`withdrawn`/`closed`.
- **One pending claim per user per post (D19):** a partial unique index. The client maps error 23505 to "already claimed".
- **Outcome snapshot (D5, T6).** On claim insert, a trigger copies similarity, component scores, final score, rank and `weights_version` onto the claim, server-side. There's no FK to `matches`. The purpose is measuring real-world precision; a few dozen claims a semester is too few to auto-tune the weights.

**Launch requirements (T1, T2)**
- Ship on iOS and Android ($99 Apple Developer account). **Report/block (FR-6.1, minimal version) and in-app account deletion (FR-6.5)** are now MVP, because both app stores require them.
- Custom SMTP (Resend plus a domain with SPF/DKIM). Supabase's default sender only delivers to project team members, which would block FR-1.2 for every real user. Delivery must be tested against real @utdallas.edu inboxes.
- Expo push notifications (D26) only when the final score is at or above a threshold and the match is new, capped at 3 per user per day (T10).
- Minimal share link (T11): the OS share sheet with "Found: [category] near [building] — yours?" plus a deep link.

**Quality and delivery**
- pgTAP suite in `supabase/tests/` covering every RLS policy, grant, function, storage policy and trigger, plus `deno test` for the ranking. Both run in GitHub Actions on every PR (D22).
- A second free Supabase project serves as staging. CI auto-deploys to staging; prod deploys through a manual `workflow_dispatch` (T9). Every change goes through a PR with one approval.
- An eval set of about 30 pairs plus **same-category look-alike distractors**, with each lost description written by someone other than the photographer. A script reports precision@5 (D6, T7).
- An `ops_health` view, plus one structured log line per pipeline run.

**Timeline (T12)**
- Oct 20: auth UI, SMTP, migrations baseline, CLIP spike.
- Nov 15: CRUD, photos, core RLS pgTAP.
- Dec 6: pipeline, claims, push, report/block, delete-account. TestFlight and a Play closed test start (12+ testers, 14 days).
- **Public launch: UTD Spring 2027, week 1.**
- **Cut line: Nov 22.** If behind, cut in this order: eval hard negatives → Discord alert → building picker → share link. Never cut: migrations, RLS tests, store compliance, SMTP.

---

## Changelog (v0.4 → v0.5)

- **Platform corrected: native mobile app (React Native + Expo), not responsive web.** Earlier drafts of this document (through v0.4) listed native mobile apps as out of scope indefinitely and specified a React + Vite web frontend hosted on Vercel — this was a documentation error, not a real scope decision. The actual, intended platform has been a native installable app from the start. Corrected here: removed the "native mobile apps" out-of-scope line in Section 1.2, updated the Section 8 tech stack from React + Vite/Vercel to React Native + Expo, and reworded NFR8 to reflect a native app rather than a mobile browser experience. This does not affect anything already built — Supabase, the schema, and every RLS policy in Section 12 are frontend-agnostic and carry over unchanged regardless of which client (web or native) calls them.

## Changelog (v0.3 → v0.4)

- **Security architecture decided: RLS-native, not app-mediated.** Considered routing all data access through a separate backend server (app holds DB credentials, enforces authorization in server code) versus enforcing access directly in Postgres via Row Level Security, since Supabase exposes the database straight to the client. Decision: stay RLS-native. This matches how Supabase is designed to be used, avoids standing up and hosting a second service (against the ~$0 budget / "buildable in days" constraints in A6 and ADR-4), and keeps enforcement in one place (the database) rather than requiring every future endpoint to remember its own authorization check. See new Section 12 for the full reasoning and the specific policies designed so far.
- **Column-level write restrictions adopted as a deliberate pattern**, layered on top of RLS, anywhere a user should be able to edit *some but not all* fields on a row they own (e.g. `users.username` editable, `users.id`/`users.created_at` locked). Supabase's own docs flag this as an advanced feature not recommended for most use cases in favor of a roles table, but for MVP's simple single-column locks it's the right-sized tool. See Section 12.2.
- **Found-post visibility gated behind having an active lost post — MVP placeholder, not the final rule.** The intended final behavior (Section 12.4) is "you can only browse found posts that are plausible candidate matches for your own lost post," which requires the FR-4.8 ranking pipeline and a stored `matches` table to exist. Since that pipeline is itself in-scope for MVP (not Phase 2 — see note below), the placeholder rule (any user with an active, unresolved lost post can browse all found posts) is a deliberate, temporary stand-in until the matching pipeline is built, at which point the policy is swapped to check real match data instead. Lost posts remain openly browsable by any authenticated user throughout — no gate on that side.
- **Clarification, not a scope change: the embedding/matching pipeline (FR-4.1–4.5) is MVP, not Phase 2.** This came up as a point of confusion worth documenting explicitly: "Phase 2" in Section 9's phased delivery plan ("Phase 2 — Embedding pipeline + ranking") refers to a phase *within* the MVP build sequence, distinct from the separate "Phase 2 (post-MVP)" language used elsewhere in this document for genuinely deferred work (Claude vision enrichment, challenge-verification, moderation dashboard, etc.). The self-hosted CLIP/SigLIP embedding generation, pgvector similarity search, and category/date filtering are all MVP must-haves per Section 1.2 and FR-4.1–4.5.

## Changelog (v0.2 → v0.3)

- **Re-ranking is now a self-built scoring algorithm, not a Claude call.** Combining embedding similarity \+ category \+ date/location signals into a ranked score is done with your own hand-written (initially linear/weighted) scoring function, not an LLM. This removes the last per-search AI cost from the pipeline entirely and, more importantly, gives you an ownable, explainable piece of engineering for interviews rather than a black-box LLM decision. See ADR-2 (updated) and FR-4.8.

## Changelog (v0.1 → v0.2)

This revision reconciles the original v0.1 draft with a separate MVP-scoping conversation. Two real disagreements were found and resolved as follows — **worth a deliberate second look, not just accepting the merge:**

1. **MVP scope was overloaded.** v0.1 marked ownership-verification challenges (FR-5.x), consent-gated redaction (FR-3.4), the moderation/admin dashboard (FR-6.x), and Claude-based re-ranking as **M (must-have)**. Moved to **Phase 2 (post-MVP)** here — the MVP goal is a working end-to-end demo fast, not a hardened product on day one.  
2. **AI cost architecture conflict.** v0.1's pipeline calls Claude vision once per post *and* once per search (top-K rerank) — real, ongoing per-post and per-search cost. Replaced for MVP with a **self-hosted CLIP/SigLIP embedding model**: one embedding generated per post at upload time (free beyond compute), matching done via vector similarity math (effectively free), no LLM call in the search path at all. Claude vision enrichment \+ rerank is kept as a documented **Phase 2 upgrade path** once/if precision needs justify the added cost.  
3. **Deployment scope confirmed:** single campus, student-to-student, no institutional/venue integration. This answers Open Question 1 from v0.1.  
4. **Contact flow simplified for MVP:** no challenge-based verification yet. `.edu` email requirement at signup is the MVP-level trust layer. A "this is mine" claim reveals the other party's campus email directly. Full challenge-question verification (FR-5.2–5.4) is Phase 2\.  
5. Project framing (academic vs. product) is still an **open question** — see Section 10\.

Everything else below (personas, risk register, success metrics, tech stack, most NFRs) is retained from v0.1 largely as-is; only priorities and the phased plan were substantively rewritten.

---

## 1\. Project Overview

A web application where users report items they have found (photo \+ description) and users who have lost something search by describing it or uploading a photo. An AI matching pipeline surfaces likely matches by comparing vector embeddings. When both parties agree on a match, contact is exchanged via campus email.

### 1.1 Problem Statement

Existing lost-and-found processes are fragmented: physical lost-and-found desks, campus Facebook groups, Discord servers, bulletin boards. Two structural failures:

1. Search is keyword-based. A finder writes "black leather bifold with a red stripe"; the loser searches "wallet." No match.  
2. No identity verification. Anyone who sees a post claiming "found AirPods" can claim them.

MVP addresses (1) directly via embedding-based semantic \+ visual matching. (2) is addressed at MVP with a lightweight trust layer (`.edu`\-restricted signup); a stronger challenge-based verification flow is planned for Phase 2 once there's a working product to harden.

### 1.2 Scope

**In scope (MVP):**

- Account creation and authentication (`.edu` email required)  
- Found-item reporting with image upload and/or description  
- Lost-item search via photo or natural-language description  
- AI-assisted matching and ranked results (embedding similarity \+ category/date filtering)  
- Simple claim flow: "I think this is mine" reveals contact email after finder confirmation  
- Post lifecycle: mark resolved, auto-hide from search  
- Basic match notifications

**Deferred to Phase 2 (not MVP):**

- Ownership verification challenge questions  
- Redacted/partial listing views  
- Consent-gated, multi-step contact exchange  
- Admin moderation dashboard and content reporting tooling  
- Claude vision-based attribute enrichment per post  
- Claude-based re-ranking of search results  
- Saved-search alerts  
- High-value item stricter verification path

**Out of scope (indefinitely, MVP and beyond unless revisited):**

- In-app chat/messaging  
- Payments, rewards, or bounties  
- Multi-language support  
- Integration with institutional lost-and-found systems

### 1.3 Assumptions

| \# | Assumption | Impact if wrong |
| :---- | :---- | :---- |
| A1 | Deployment is scoped to a single campus | Open-public scope needs geo-partitioning, much heavier moderation |
| A2 | Expected volume at launch: small (dozens to low hundreds of posts) | Higher volume would justify indexed ANN search sooner; brute-force/pgvector is fine at this scale |
| A3 | Users have `.edu` email and are willing to be contacted by email | If not, need in-app messaging, which adds moderation surface |
| A4 | Physical handover happens off-platform | If the app must coordinate handover locations, that's a whole additional module |
| A5 | Single language (English) at launch | Multilingual would change the embedding model choice |
| A6 | Budget is $0 until the MVP works end to end: no paid AI inference, hosting, domains, or store accounts (see v0.6.1 changelog for free substitutes) | This is why MVP uses an open-source embedding model on free hosting rather than a paid per-call API |

---

## 2\. Stakeholders & Personas

| Persona | Goal | Primary pain |
| :---- | :---- | :---- |
| Finder (Maya, picks up a phone in a lecture hall) | Discharge the item quickly with minimal effort | Doesn't want to carry it around or handle repeated false claims |
| Loser (Dev, left his backpack somewhere yesterday) | Find out fast whether anyone has it | Doesn't know where he lost it; can't describe it in the finder's vocabulary |
| (Phase 2\) Moderator/Admin | Keep the platform clean and non-abusive | Needs to spot fraudulent claims and inappropriate uploads |

*(Institution/facilities persona removed for MVP — no institutional integration in scope.)*

---

## 3\. Functional Requirements

Priority: **M** \= MVP (must have), **S** \= should have (early Phase 2), **C** \= could have (later Phase 2+)

### 3.1 Authentication & Accounts

| ID | Requirement | Pri |
| :---- | :---- | :---- |
| FR-1.1 | Users register with `.edu` email \+ password | M |
| FR-1.2 | Email verification required before posting or claiming | M |
| FR-1.3 | Sign in, sign out, password reset | M |
| FR-1.4 | Profile stores display name and contact email; email not publicly visible until a claim is approved | M |
| FR-1.5 | Signup domain restricted to your campus's `.edu` | M |
| FR-1.6 | OAuth sign-in (Google) | C |

### 3.2 Reporting a Found Item

| ID | Requirement | Pri |
| :---- | :---- | :---- |
| FR-2.1 | Authenticated user uploads 1–5 photos of a found item | M |
| FR-2.2 | User provides a free-text description and selects a category | M |
| FR-2.3 | User picks a UTD building (plus optional location note) and a date *(v0.6, D4: was free text)* | M |
| FR-2.4 | On submission, system generates and stores an embedding vector | M |
| FR-2.5 | User can edit or delete their own posts | M |
| FR-2.6 | User can mark an item "returned," archiving it from search | M |
| FR-2.7 | Posts auto-expire after a configurable period (default 90 days) | S |
| FR-2.8 | Image PII/content screening before publication | S *(moved from M — Phase 2 hardening)* |

### 3.3 Searching for a Lost Item

| ID | Requirement | Pri |
| :---- | :---- | :---- |
| FR-3.1 | User submits a description and/or photo of their lost item | M |
| FR-3.2 | User can optionally supply lost-location and lost-date to narrow results | M |
| FR-3.3 | System returns a ranked list of candidates by similarity score | M |
| FR-3.4 | Each result shows the full listing (photo \+ description) | M *(changed from redacted — redaction deferred to Phase 2 alongside verification)* |
| FR-3.5 | System explains why each candidate matched, in plain language | C |
| FR-3.6 | User can save a search as a standing alert | S |
| FR-3.7 | User can browse all active posts without a search prompt | M |

### 3.4 AI Matching Pipeline (MVP-simplified)

| ID | Requirement | Pri |
| :---- | :---- | :---- |
| FR-4.1 | At post time, a self-hosted embedding model (CLIP/SigLIP) generates a vector from the photo, or from the text description if no photo is provided | M |
| FR-4.2 | Embeddings stored in Postgres via pgvector | M |
| FR-4.3 | Category is a score term (same=1, adjacent=0.5, else 0), not a hard filter *(v0.6, T5)* | M |
| FR-4.4 | Chronological filter with grace window: found date ≥ lost date − 3 days; closeness scored by the time term *(v0.6, D20)* | M |
| FR-4.5 | Search retrieves candidates via vector similarity, filtered by category and date, sorted by score | M |
| FR-4.6 | Every pipeline run is logged (latency, no cost logging needed — no per-call billing at MVP) | S |
| FR-4.7 | *(Phase 2\)* Claude vision enrichment per post → structured attributes (color, brand, marks) | C |
| FR-4.8 | Custom ranking algorithm: combine embedding similarity \+ category match \+ date/time proximity \+ location proximity into a single score using hand-picked weights (e.g. `score = w1*similarity + w2*category + w3*time + w4*location`) | S — pull into MVP once basic vector search (FR-4.5) works |
| FR-4.9 | Log each search's computed component scores and final ranking, to support later weight tuning and evaluation | S |

### 3.5 Claim & Contact (MVP-simplified)

| ID | Requirement | Pri |
| :---- | :---- | :---- |
| FR-5.1 | A searcher can initiate a claim ("I think this is mine") on a candidate | M |
| FR-5.2 | Finder is notified and approves or rejects the claim | M |
| FR-5.3 | On approval, both parties' contact emails are exchanged | M |
| FR-5.4 | Rate limit: max 5 claims per user per 24 hours | S |
| FR-5.5 | Finder can reject without giving a reason | M |
| FR-5.6 | *(Phase 2\)* Challenge-question ownership verification before finder sees a claim | C |
| FR-5.7 | *(Phase 2\)* Claim history retained for audit/abuse investigation | S |
| FR-5.8 | *(Phase 2\)* High-value item posts require stricter verification path | C |

### 3.6 Moderation, Safety & Privacy — all Phase 2

| ID | Requirement | Pri |
| :---- | :---- | :---- |
| FR-6.1 | Users can report a post or user for abuse (minimal: reports table + hide-on-report + block) | M *(v0.6, T1: app-store requirement)* |
| FR-6.2 | Admin dashboard for reported content, takedown, suspension | C |
| FR-6.3 | ID-document photos flagged and withheld from public view | S |
| FR-6.4 | Automated image screening (nudity, violence, PII) | S |
| FR-6.5 | Account and data deletion | M *(kept as MVP — basic legal/privacy hygiene, low effort)* |
| FR-6.6 | Privacy policy and terms presented at signup | M *(same reasoning)* |

---

## 4\. Non-Functional Requirements (mostly unchanged from v0.1)

| ID | Category | Requirement |
| :---- | :---- | :---- |
| NFR1 | Performance | Search returns results within a few seconds; no hard SLA needed at MVP scale |
| NFR2 | Scalability | Support a few thousand posts without architectural change — campus scale, not public scale |
| NFR3 | Cost | AI inference cost should be near-zero at MVP (self-hosted embeddings); revisit if Phase 2 adds Claude calls |
| NFR4 | Availability | Best-effort; no formal uptime target needed for a student project |
| NFR5 | Security | No API keys in client code; auth-gated write access |
| NFR6 | Privacy | Store only what's needed; images not indexed by public search engines |
| NFR7 | Accessibility | Reasonable effort: alt text, keyboard nav — full WCAG audit is Phase 2 |
| NFR8 | Usability | A finder can post an item in under 60 seconds in the native app |
| NFR9 | Observability | Basic logging is enough at MVP; full dashboards are Phase 2 |
| NFR10 | Maintainability | Keep matching logic and prompts (if any) in separate, testable modules |

---

## 5\. Key Architectural Decisions

**ADR-1: One-time embedding, not per-comparison AI calls (unchanged principle, changed implementation)** Decision: Generate an embedding once per post at upload time; all matching is vector math against stored embeddings, not further AI calls. Rationale: avoids the O(n×m) cost explosion of comparing every pair via an API call.

**ADR-2 (revised again in v0.6):** read "self-hosted" below as "a server-side, hosted CLIP/SigLIP endpoint (Modal, scale-to-zero) called only by the `process-post` Edge Function." The client never computes or writes embeddings. See the v0.6 changelog.

**ADR-2 (revised): Self-hosted CLIP/SigLIP embeddings for MVP, not a paid API** v0.1 proposed Voyage AI (text-only) plus Claude vision enrichment. For MVP, use a self-hosted CLIP-family model instead: it embeds both images and text into the same vector space, so a text-only lost-item description can be compared directly against a found-item photo embedding — no separate enrichment step, no per-call cost. Revisit a paid/managed embedding provider only if self-hosting proves to be an operational burden.

**ADR-3 (deferred): LangGraph orchestration — Phase 2** Not needed for MVP's simpler pipeline (upload → embed → store; search → embed query → vector search → filter → sort → custom score). Worth introducing once the pipeline gains branches (verification, escalation paths) in Phase 2\.

**ADR-5: Custom ranking algorithm instead of LLM-based re-ranking** Decision: combine similarity \+ category \+ date \+ location signals into a final ranking with a self-written scoring function (start linear/hand-weighted; consider learned weights later if labeled data becomes available), rather than an LLM rerank call. Rationale: two benefits over an LLM rerank step — (1) it removes the remaining per-search AI cost from the pipeline, keeping the whole search path effectively free to run; (2) it's a fully explainable, ownable piece of the system, which is stronger interview material than "I called Claude to rerank" — you can walk through the exact weighting logic and how you'd iterate on it with real usage data. Trade-off: less semantically flexible than an LLM judging match quality in natural language — a hand-weighted score can't reason about nuance the way a rerank call might. Acceptable at MVP scale; revisit if precision proves insufficient once you have real usage data to evaluate against.

**ADR-4: Contact exchange without verification, at MVP** v0.1's consent-gated, challenge-verified introduction is a good design — but it's Phase 2\. MVP trust model: `.edu`\-restricted signup \+ finder manually approves/rejects each claim (no automated question). This keeps the claim flow buildable in days, not weeks, while still requiring a human decision point before any contact info is shared.

---

## 6\. Risk Register (retained from v0.1, MVP-relevant subset)

| \# | Risk | Likelihood | Impact | Mitigation |
| :---- | :---- | :---- | :---- | :---- |
| R1 | Fraudulent claims | High | High | Finder holds final approval; `.edu` accountability; Phase 2 adds challenge verification |
| R2 | AI false positives waste time | High | Medium | Similarity threshold; frame results as "possible matches" |
| R3 | AI false negatives — real match missed | Medium | High | Category \+ date filters keep recall reasonable; browse-all fallback |
| R7 | Cold start — no posts, no users | High | High | Campus scope gives built-in density; consider seeding/promoting at semester start |
| R9 | Image storage costs/abuse | Low | Medium | File size limits, upload rate limits |

*(R4 "runaway inference cost" and R5/R8, largely mitigated at MVP by the architecture change in ADR-2 — no per-call billing to run away. Re-add as active risks if/when Phase 2 introduces Claude vision/rerank calls.)*

---

## 7\. Success Metrics (unchanged in spirit, MVP-realistic targets)

| Metric | Target (first semester) |
| :---- | :---- |
| Match rate (searches producing a claimed item) | Track it — no hard target yet, MVP goal is signal, not a KPI |
| Claim-to-return conversion | Track it |
| Time from post to return (median) | Track it |
| Active users on campus | A real, even small, number for your own portfolio/interview story |

*(Precision@5 and a hand-built evaluation set from v0.1 are still a good idea — worth doing once you have a working search, to validate matching quality before investing in Phase 2 re-ranking.)*

---

## 8\. Tech Stack (largely retained from v0.1)

| Layer | Choice | Notes |
| :---- | :---- | :---- |
| Frontend | React Native \+ TypeScript, via Expo | Native installable app (iOS \+ Android), not a web app — see v0.5 changelog |
| Styling | React Native's built-in styling (StyleSheet / Flexbox) |  |
| Backend/DB | Supabase (Postgres, Auth, Storage, RLS) |  |
| Vector search | pgvector | Sufficient at campus scale |
| Embeddings | Self-hosted CLIP/SigLIP | Changed from Voyage AI — avoids per-call cost at MVP |
| Ranking | Custom scoring function  | See ADR-5 |
| Vision AI | *(Phase 2 only)* Claude API, for attribute enrichment only | Not used in MVP pipeline at all |
| Orchestration | Plain functions for MVP; LangGraph in Phase 2 |  |
| Email | Free SMTP (Brevo free tier or Gmail app password) for MVP; Resend + domain later if needed | Transactional only. $0 until MVP (v0.6.1) |
| Hosting | Expo Go for MVP testing; EAS + store accounts at launch; Supabase free tier (backend); CLIP on a free Hugging Face Space | $0 until MVP (v0.6.1) |

---

## 9\. Phased Delivery Plan (rewritten to match MVP scope)

**Phase 0 — Foundations**

- Repo, Supabase project, schema v1, RLS policies  
- Auth flow (`.edu`\-restricted signup) end to end  
- Exit criteria: a user can sign up, log in, see an empty dashboard

**Phase 1 — Basic CRUD \+ naive matching**

- Post lost/found items (photo or text, category, timestamp, location)  
- Browse/search with plain filters (category, date) — no AI yet  
- Exit criteria: users can post and find things via manual filters

**Phase 2 — Embedding pipeline \+ ranking**

- Self-hosted CLIP/SigLIP embedding generation at upload time  
- pgvector storage and similarity search  
- Custom ranking algorithm: hand-weighted score combining embedding similarity \+ category filter \+ date/time proximity \+ location proximity  
- Log component scores per search for future tuning/evaluation  
- Exit criteria: a plausible query surfaces a relevant seeded item near the top, and you can explain why the score put it there

**Phase 3 — Claim & notification flow**

- "I think this is mine" claim → finder approve/reject → email exchange  
- Match notifications (new post scores above threshold)  
- "My posts" view, mark-resolved  
- Exit criteria: two test accounts complete a full post → search → claim → connect cycle

**Phase 4 — Real usage**

- Launch to your campus (group chat, subreddit, etc.)  
- Collect real usage data and failure cases

**Phase 5+ — Hardening (post-MVP)**

- Challenge-based ownership verification  
- Redacted listings  
- Claude vision enrichment \+ rerank (if precision needs justify the cost)  
- Admin/moderation dashboard, reporting tooling  
- Weighted multi-signal scoring

---

## 10\. Open Questions

1. **Academic vs. product framing** — is this for a class with a deadline/rubric, or a real thing you intend to keep running? This affects how much of the SDLC documentation and Phase 2 hardening actually matters versus just being useful practice. *(Still open — worth deciding before Phase 3.)*  
2. **Photo visibility policy** — MVP currently shows full listings (not redacted). Worth revisiting once real users are on it: does showing full photos/descriptions invite more false claims than expected?  
3. Everything else from v0.1's Open Questions (LangGraph runtime choice, institutional partnership for seed data) is Phase 2-relevant, not MVP-blocking — revisit when you get there.
4. ~~Security/access-control architecture~~ — resolved, see Section 12: RLS-native, with column-level grants for partial-row edits and a documented placeholder → `matches`-table upgrade path for found-post visibility.

---

## 11\. Requirements Traceability

Maintain a simple table mapping requirement ID → code module → test cases once implementation starts. Not needed before Phase 1 begins.

---

## 12\. Security & Access Control Architecture

This section documents the access-control decisions made while implementing the schema in `lostnfound-schema-notes.md`. The actual SQL policies live there; this section captures the reasoning, so future changes are made deliberately rather than by re-deriving the logic from scratch.

### 12.1 RLS-native, not app-mediated

Two architectures were considered:

- **RLS-native (chosen):** the frontend talks directly to Supabase/Postgres. Row Level Security policies, enforced by the database on every query regardless of caller, are the actual security boundary. No separate backend server.
- **App-mediated:** a separate backend server holds privileged database credentials; the frontend talks only to that server; authorization is enforced in server code (e.g. an `if` check per route).

Both are legitimate, established patterns — this isn't "RLS is safer," it's "which is the right fit for this project." RLS-native was chosen because:
- It's how Supabase is designed to be used; fighting that means re-implementing what the platform already provides.
- It avoids standing up, hosting, and securing a second always-running service, which doesn't fit A6 (~$0 AI/infra budget) or ADR-4's "buildable in days, not weeks."
- Enforcement lives in one place (the database schema) rather than needing to be remembered on every future API route.

Trade-off, noted honestly: RLS doesn't eliminate the risk of a missed rule — it just moves where that rule has to be written correctly. The mitigation is process, not architecture: write each policy, verify it against `pg_policies`, and test with a real logged-in user before moving to the next table (the approach used throughout Section 12.2–12.4 below).

**v0.6 exception, adopted:** the matching pipeline needs privileged access (service role, plus the CLIP endpoint's secret), so it runs in one Edge Function, `process-post`. That function checks the caller owns the post before doing anything. The rest of the system stays RLS-native.

**Future option, not adopted for MVP:** if a specific need arises that RLS/RPC genuinely can't express (e.g. safely calling a paid third-party API without exposing its key to the browser), a single serverless Edge Function scoped to just that call is the lighter-weight alternative to a full backend server.

### 12.2 Column-level write restrictions

RLS controls *which rows* a user can touch, not *which columns* within an allowed row. Where a user should be able to edit only some fields on their own row, this is enforced with Postgres column-level `GRANT`/`REVOKE`, layered on top of an RLS policy:

```sql
REVOKE UPDATE ON public.<table> FROM authenticated;
GRANT UPDATE (<editable_column(s)>) ON public.<table> TO authenticated;
```

Applied so far:
- `users`: only `username` is writable. `id` and `created_at` are fully locked from any update, for any row, regardless of ownership.
- `claims`: only `status` is writable, and only by the post owner (via the RLS policy in 12.4) — `post_id` and `claimant_id` can never be changed after creation by anyone through the client API.

Note: `id` being unreadable was considered and deliberately rejected — a user's own `auth.uid()` is already known to them via their session, so hiding it from `SELECT` protects nothing and would break legitimate cross-user reads (e.g. seeing who posted an item).

### 12.3 `users` table policies

- Public `SELECT` (read access, including `created_at` — RLS governs row visibility only; once a row is visible, all its columns are visible, so no separate rule was needed to make `created_at` readable).
- `UPDATE` restricted via RLS to `auth.uid() = id` (own row only, before and after the update), combined with the column grant in 12.2 restricting the update to `username` only.

### 12.4 `claims` table policies

Claims are visible to either party involved, not just the post owner — this was corrected from an earlier draft that would have left the claimant unable to see the status of their own claim:

- **SELECT:** visible if `claimant_id = auth.uid()` OR the requester owns the related post (`posts.user_id = auth.uid()` via join).
- **INSERT:** a user may create a claim only as themselves (`claimant_id = auth.uid()`), on a post that is not their own and not already resolved. See 12.5 for the additional found-post-specific condition.
- **UPDATE:** only the related post's owner may update a claim (approve/reject), restricted at the column level to the `status` field only (12.2).
- **DELETE:** intentionally no policy — claims are kept as a permanent record (supports FR-5.7 / audit trail and matches the `on delete restrict`/`no action` FK behavior already in the schema notes).

This design works symmetrically for both claim directions without any special-casing: a finder claiming against someone's lost post, and a searcher claiming against someone's found post, both reduce to "claimant" and "post owner" roles — whoever posted first is always the one who approves.

**Multiple approved claims per post are explicitly allowed** — RLS has no concept of "how many claims already exist," it evaluates each row independently, so a post owner can approve multiple claims on the same post. Final confirmation of a genuine match happens off-platform between the parties via email (per ADR-4's contact-exchange design); the app does not need to enforce a single winner.

### 12.5 `posts` table visibility — asymmetric by type

- **Lost posts:** openly browsable by any authenticated user, no gate. Rationale: recognizing a lost item ("I've seen that somewhere") is spontaneous and shouldn't require the viewer to have posted anything first.
- **Found posts:** not freely browsable. Intended final behavior: a user may only see found posts that are plausible candidate matches for a lost post they themselves posted, determined by the FR-4.8 ranking pipeline against a stored `matches` table (see 12.6). This prevents "shopping" through found-item listings and claiming items with no real basis for the claim.
- **MVP placeholder (current implementation):** since the `matches` table doesn't exist until the embedding/ranking pipeline (Section 9, Phase 2 of the delivery plan) is built, found-post visibility is gated on a looser proxy condition — the viewer has at least one active (unresolved) lost post. This is intentionally not the final rule; see 12.6 for the upgrade path. A user can always see their own posts regardless of type.
- The `claims` INSERT policy (12.4) carries the matching condition as well, so visibility and claim-creation stay consistent — a user can't claim a found post via a direct API call that the UI wouldn't have shown them.

### 12.6 Planned upgrade: `matches` table (post-embedding-pipeline)

> **Superseded in v0.6 (T4, D10).** `matches` is still built. It's filled in **both directions** (lost and found inserts) and written only by the service role, but it drives **ranking and push notifications only, not RLS**. The "has an active lost post" gate in §12.5 is the launch rule. Gating on matches would permanently hide any true match that misses someone's top-K. Narrowing visibility is a P3 item in TODOS.md, to be decided with Spring 2027 data. The original design is kept below for history.

Once FR-4.1–4.5 (embeddings + vector search) and FR-4.8 (custom ranking) are built, add:

```sql
CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lost_post_id uuid NOT NULL REFERENCES public.posts(id),
  found_post_id uuid NOT NULL REFERENCES public.posts(id),
  score numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Populated with each lost post's top-K candidates whenever the ranking algorithm runs (ideally triggered synchronously on lost-post creation, to avoid a dead window where a real match exists but hasn't been materialized yet). Then swap the placeholder condition in both the `posts` SELECT policy and the `claims` INSERT policy from "has any active lost post" to "a `matches` row connects the viewer's lost post to this specific found post." The policy *shape* doesn't change, only the inner `EXISTS` condition — expected to be a small, low-risk edit once the pipeline exists, not a rebuild.

### 12.7 Deferred hardening, not needed for MVP

Discussed as legitimate patterns but intentionally not adopted now, to revisit only if a concrete need arises:
- **Views for reads / RPC functions for writes** — narrows the client's access surface further than raw table grants, and gets closer to a "stored procedure" model without requiring a separate backend server. Reasonable next step if/when business logic (e.g. claim rate-limiting, FR-5.4) outgrows what RLS conditions can express cleanly.
- **Trigger-based column locking** — an alternative/backup to the `GRANT`/`REVOKE` pattern in 12.2, enforced via a `BEFORE UPDATE` trigger that rejects changes to specific columns. Worth adding as defense-in-depth if the column grants are ever at risk of being loosened by a future migration.

### 12.8 Auth Hooks — `.edu` domain restriction (FR-1.5)

Supabase has no built-in "restrict signup to this email domain" setting, so FR-1.5 needed a deliberate implementation choice: a client-side check (simple, but bypassable by anyone calling the Auth API directly) versus a server-side **Auth Hook** (matches the RLS-native philosophy from 12.1 — enforcement that can't be routed around).

**Decision: a `before-user-created` Auth Hook, implemented as a Postgres function**, not an HTTP endpoint — keeps the enforcement inside the database alongside every other access-control rule in this section, and avoids standing up a separate HTTP endpoint just for one domain check.

```sql
CREATE OR REPLACE FUNCTION public.restrict_signup_by_email_domain(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  user_email text;
BEGIN
  user_email := event->'user'->>'email';

  IF user_email !~* '@utdallas\.edu$' THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 400,
        'message', 'utdallas.edu email addresses are allowed to sign up.'
      )
    );
  END IF;

  RETURN jsonb_build_object('user', event->'user');
END;
$$;

GRANT EXECUTE ON FUNCTION public.restrict_signup_by_email_domain TO supabase_auth_admin;
```

The function is deliberately **not** `SECURITY DEFINER` — Supabase's own guidance specifically warns against it for hook functions, since a dashboard-created `SECURITY DEFINER` function inherits the broad `postgres` role's privileges, which is more access than this function needs. Instead, `supabase_auth_admin` (the specific role Supabase Auth uses to call hooks) is granted `EXECUTE` directly and explicitly.

Connected via Dashboard → Authentication → Auth Hooks → Before User Created, pointed at this function. Verified working end-to-end through the real `supabase.auth.signUp()` path (not just the Dashboard's manual "Add User," which may not exercise the identical code path) — confirmed both that a non-`.edu` email is rejected with the custom message, and that a real `.edu` email is correctly allowed through.

### 12.9 Contact email delivery (FR-5.3) — RPC reads `auth.users` directly, no column added

FR-1.4/FR-5.3 require exchanging contact emails once a claim is approved, but the schema notes left open *how* email should be stored or surfaced. Resolved: **no `email` column was added to `public.users`.**

A plain column was rejected because `users` SELECT is public (`using (true)`, per 12.3) — RLS can't restrict individual columns, so any column on that table is readable by every authenticated user the moment the row is visible. A column-level `GRANT`/`REVOKE` restriction (the pattern from 12.2) could lock it back down, but that still means denormalizing `auth.users.email` into `public.users`, with no mechanism to keep it in sync if a user's email ever changes via Supabase's email-change flow.

Instead, a single `SECURITY DEFINER` function delivers the email, gated by claim approval, reading `auth.users` directly (the same mechanism `handle_new_user`, 9.3, already relies on):

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

The function always returns the *other* party's email relative to the caller, and only for an `approved` claim where the caller is genuinely the claimant or the post owner — any other case (wrong claim, wrong caller, claim not yet approved) returns `NULL` rather than erroring, consistent with how RLS `USING` clauses already fail quiet elsewhere in this schema.

**Note on RLS coverage:** because this function is `SECURITY DEFINER`, it bypasses the `claims` SELECT policy (12.4) internally — the function's own `CASE`/`WHERE` logic is the only safeguard against a wrong-party email leak, with no RLS backstop. This needs its own adversarial test pass (claimant, post owner, unrelated third account, still-pending claim) before being relied on, per the same testing discipline as Section 8.

A user's *own* email (for a "My Profile" view, say) doesn't need this function at all — it's already available client-side via `claims.email` from the JWT claims fetched at login, with no database round-trip.

