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
