# Design System — Lost & Found

## Product Context
- **What this is:** A campus-only lost & found app. Finders post a found item with a photo in under 60 seconds; people who lost something get AI-ranked matches, claim, and exchange emails once the other person approves.
- **Who it's for:** UT Dallas students, usually on their phone, often stressed and walking between classes.
- **Space/industry:** Lost & found and peer-to-peer listings (Boomerang-style matching, Depop/Vinted-style trust patterns). Deliberately *not* a browsing marketplace.
- **Project type:** Native mobile app (React Native + Expo), iOS and Android.
- **Memorable thing:** **Trustworthy and the fastest option.** Calm and "built for UTD" are secondary.

## Aesthetic Direction
- **Direction:** Industrial/Utilitarian with warmth. A well-run front desk, not a marketplace.
- **Decoration level:** Minimal. Type, photos, and status do the work.
- **Mood:** Factual, quick, reassuring through clarity. It always tells you exactly where things stand.
- **Signature motif:** item cards styled as a paper **claim tag**: a photo thumbnail, a title, a mono metadata line (`FOUND 2:14 PM · ECSS 2.4`), and a small punched-hole circle in the top-right corner. Use it for every item card. Don't add other decoration.
- **Preview:** `~/.gstack/projects/Ethan2goat-Lostnfound/designs/design-system-20261022/preview.html`

## Core Rules
1. **Answer first.** Home is a status screen ("2 possible matches", "Finding matches…", "No one has posted it yet, we'll notify you"), not a feed. The feed comes second.
2. **Every claim is checkable.** Times, places, distances, and match reasons go in mono metadata lines. Never show an unexplained score; always show *why* something matched.
3. **Color means something.** Orange = needs your action. Green = verified or approved. Everything else is ink and paper. Never use color as decoration.
4. **Never a dead end.** Search (keywords + filters) is always available as a fallback when there's no photo or the matcher misses. Every empty state offers a next step.
5. **Thumb-first.** The primary action is pinned at the bottom of the screen. Touch targets are at least 48pt for one-handed use while walking.

## Navigation
Bottom tabs: **Home · Search · Post · My posts.**
- **Home:** status of your lost items and matches, then "Recently found near you".
- **Search:** keyword box, a Found/Lost toggle, and filter chips (category, building, date range); results are claim-tag cards, newest first. Found items only appear if the user has an active lost post (anti-shopping rule, LostnFound.md §12.5). Otherwise show "Post what you lost to search found items". Lost items are always searchable. Footer: "Not here? Post what you lost and we'll notify you when it's found."
- **Post:** Lost/Found toggle, photos (0-5), category chips, building, date, optional description. One pinned primary button.
- **My posts:** your posts with their status (Finish posting / Finding matches… / N matches / Failed, retrying) plus the claims inbox.

## Typography
All free Google Fonts, loaded with `expo-font` via the `@expo-google-fonts/*` packages.

| Role | Font | Package | Weights | Use |
|---|---|---|---|---|
| Display | **Schibsted Grotesk** | `@expo-google-fonts/schibsted-grotesk` | 600, 700, 800 | Screen titles, status headlines, big numbers |
| Body / UI | **Instrument Sans** | `@expo-google-fonts/instrument-sans` | 400, 500, 600 | Everything else: body, labels, buttons, inputs |
| Data | **IBM Plex Mono** | `@expo-google-fonts/ibm-plex-mono` | 400, 500 | Metadata lines, times, building codes, distances, match values, section labels (uppercase, letter-spaced) |

Why: Schibsted Grotesk was built for a news publisher, so it reads as factual and confident. Instrument Sans stays clear at small sizes. Mono metadata makes details look verifiable and keeps digits from shifting.

**Scale (pt, React Native):**

| Token | Size / line height | Font |
|---|---|---|
| `display` | 34 / 38 | Schibsted Grotesk 700, letterSpacing -0.5 |
| `title` | 28 / 32 | Schibsted Grotesk 700, letterSpacing -0.4 |
| `headline` | 22 / 28 | Schibsted Grotesk 600 |
| `body` | 16 / 24 | Instrument Sans 400 |
| `bodyStrong` | 16 / 24 | Instrument Sans 600 |
| `callout` | 14 / 20 | Instrument Sans 500 |
| `meta` | 12 / 18 | IBM Plex Mono 400 |
| `label` | 12 / 16 | IBM Plex Mono 500, uppercase, letterSpacing 1 |

Never use system-ui, Inter, Roboto or Space Grotesk as the primary font.

## Color
- **Approach:** Restrained. One action color, one confirmation color, neutrals for everything else.

| Token | Light | Dark | Use |
|---|---|---|---|
| `paper` | `#F7F5F0` | `#0F1113` | App background |
| `surface` | `#FFFFFF` | `#191C1F` | Cards, inputs, tab bar |
| `ink` | `#15181B` | `#F2EFE8` | Text **and primary buttons** |
| `onInk` | `#FFFFFF` | `#0F1113` | Text on primary buttons |
| `muted` | `#5E646B` | `#A3A8AD` | Secondary text, metadata |
| `line` | `#E3DED4` | `#2A2E33` | Borders, dividers |
| `action` | `#E87500` (UTD Orange) | `#F28A2A` | "Needs you" badges, unread markers, active-match accent bar. **Fill with ink text; never orange text on paper or white (fails contrast).** |
| `actionSoft` | `#FCEBD9` | `#3A2615` | Subtle action backgrounds |
| `confirm` | `#154734` (UTD Green) | `#5FBF8F` | Verified, approved, match reasons ✓ |
| `confirmSoft` | `#DCEBE3` | `#15291F` | Verified badge background |
| `error` | `#B42318` | `#F0706A` | Errors, destructive actions |
| `warning` | `#9A5B00` | `#E0A43A` | Warnings |
| `info` | `#1F4FB8` | `#7FA6F5` | Informational notes (rare) |

- **Primary buttons are ink (black in light mode), not orange.** Highest contrast, quickest to spot, and orange stays meaningful.
- **Dark mode:** surfaces are redesigned rather than inverted, and accents are lifted for contrast. Follow the system setting by default.

## Spacing
- **Base unit:** 4pt. **Density:** comfortable.
- **Scale:** `xxs 2 · xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32 · xxxl 48`
- Screen side padding 16-18pt. Gap between cards 12-14pt. Minimum touch target 48pt; primary button height 52pt.

## Layout
- **Approach:** Grid-disciplined, single column, thumb-first.
- The primary action sits in a sticky bottom area, above the home indicator, with the content fading out behind it.
- **Radius:** `sm 6` (thumbnails) · `md 10` (inputs, tag cards) · `lg 16` (status cards, hero photo) · `button 14` · `full 999` (chips, badges). Don't round everything the same amount.
- **Item card (claim tag):** 76pt square thumbnail on the left; title (Instrument Sans 600, 16pt) and a mono metadata line on the right; optional green match-reason line; punched-hole circle (10pt, 1.5pt `line` border) in the top-right corner.
- **Status card:** surface, 16pt padding, `lg` radius. When it needs action, add a 1pt orange border and a 4pt orange left bar.

## Motion
- **Approach:** Minimal-functional. Motion only explains a change.
- **Easing:** enter ease-out · exit ease-in · move ease-in-out.
- **Duration:** micro 100ms (press feedback) · short 150-200ms (toggles, chips) · medium 250ms (screen and sheet transitions).
- **The one moment:** a new match arriving. The card slides in (250ms ease-out) with a light haptic (`expo-haptics` impact light).
- "Finding matches…" uses a slow opacity pulse on a small dot (1.4s). No spinners on cards, no skeleton shimmer.
- Respect the system "reduce motion" setting.

## Voice in the UI
- Plain and specific: "Found 2:14 PM · ECSS 2.4", not "Recently found!".
- Say what happens next: "Emails are only shared after the finder approves your claim."
- No exclamation marks in status text; no marketing copy inside the app.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-10-22 | Initial design system created | /design-consultation, based on LostnFound.md v0.6.1 plus research on campus lost-and-found and student marketplace apps. Memorable thing: trustworthy and fastest. |
| 2026-10-22 | Status-first Home instead of a feed | Users are mid-panic and want an answer, not browsing |
| 2026-10-22 | Ink primary buttons; orange/green reserved for meaning | Color that always means something builds trust; ink is the fastest CTA to spot |
| 2026-10-22 | Claim-tag card motif with mono metadata | Reads instantly as lost-and-found; makes details look verifiable |
| 2026-10-22 | Search tab with keyword + filters | User requirement: a fallback when there's no photo or the matcher misses (FR-3.7) |
| 2026-10-22 | UTD orange/green used for meaning only, not branding | "Built for UTD" is secondary to trust and speed |
| 2026-10-22 | Free Google Fonts only | $0 budget until MVP |
