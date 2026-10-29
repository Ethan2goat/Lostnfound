# TODOS

Deferred work from the 2026-10-08 CEO plan review. Full decision record:
`~/.gstack/projects/Ethan2goat-Lostnfound/ceo-plans/2026-10-08-mvp-matching-pipeline.md`

## P2 — "Why this matched" explanation (FR-3.5)

- **What:** Show each candidate's component scores in plain language, e.g. "Looks similar · Same category · Found 1 day after · 120m away".
- **Why:** Builds user trust, cuts wasted claims on obviously wrong candidates (R2), and puts the explainable ranking (ADR-5) on screen.
- **Pros:** No AI call needed, since the data is already on the `matches` rows. Strong demo moment.
- **Cons:** The copy depends on score thresholds, which will change while the weights are being tuned.
- **Context:** Deferred in review decision D7. Pick the thresholds once the eval set (hard-negative distractors, T7) has settled the weights.
- **Effort:** S (CC: S)
- **Depends on:** stable weights from the eval set.

## P2 — Multi-photo embeddings

- **What:** Embed every photo on a post, not just the first, into a `post_embeddings` table. Similarity becomes the best score across all photo/text pairs.
- **Why:** Better recall when the first photo is a bad angle.
- **Pros:** `model` and `dim` columns already exist, so this is an additive upgrade.
- **Cons:** One extra table, more CLIP calls per post.
- **Context:** Originally D11. Cut from v1 by outside-voice decision T8 to reduce pre-launch machinery. v1 embeds 1 text + the first photo.
- **Effort:** S (CC: S)
- **Depends on:** launch data showing misses caused by the first photo.

## P3 — Revisit found-post visibility gating (LostnFound.md §12.5–12.6)

- **What:** After one semester, decide whether to narrow found-post visibility from "has an active lost post" to matches-based or category-based.
- **Why:** The original anti-shopping goal. Decide using real evidence of shopping (reports, rejected-claim rate) rather than guessing.
- **Pros:** Tighter protection if abuse shows up.
- **Cons:** Matches-gating can permanently hide true matches that miss someone's top-K. This is why T4 kept the simpler rule for launch.
- **Context:** Deferred by T4. Matches currently drive ranking and push notifications only, not RLS.
- **Effort:** M (CC: S)
- **Depends on:** claim-outcome snapshots (T6) and report data from Spring 2027.

## P3 — HNSW vector index

- **What:** `create index ... using hnsw (embedding vector_cosine_ops)` on the embeddings table.
- **Why:** A brute-force pgvector scan takes single-digit milliseconds at campus scale, but its cost grows linearly with the number of posts. HNSW keeps candidate retrieval fast past about 10k posts.
- **Pros:** One migration and no app changes.
- **Cons:** Approximate results (a small loss in recall), more memory, slower inserts.
- **Context:** Not needed for the MVP (assumption A2: dozens to hundreds of posts). Added from the eng review on 2026-10-22.
- **Trigger:** `ops_health` shows the process-post candidate query taking more than 100ms, or there are more than 10k active posts.
- **Depends on:** nothing.
