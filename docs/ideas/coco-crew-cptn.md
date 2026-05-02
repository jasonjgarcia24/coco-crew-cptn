# coco-crew-cptn — Solo Cocodona 250 Strategy Hub

## Problem Statement
**How might we give a solo, crewless, pacerless Cocodona 250 runner a fatigue-proof strategy hub that pre-commits decisions while rested, so the runner at mile 180 just executes?**

## Recommended Direction
A lightweight repo of **markdown briefs + linked Google Sheets/Docs**, structured as an **Aid-Station Atlas** (one page per AS, 23 pages total) supplemented by **Failure-Mode Cards** (printed, in each drop bag) and a **Pre-committed Contracts** cover page. No app, no build, no React. Claude reads markdown for context and helps draft/update; humans (Jason) edit Sheets/Docs live.

The fundamental design constraint: every artifact is written for **Jason-at-mile-180-on-no-sleep**, not Jason-today. That's the audience for every word.

## Key Assumptions to Validate
- [ ] **Source files lock by race-eve.** Aravaipa was still updating as of 2026-04-20 (Fain Ranch moved). Treat the 4 source files as living documents that can refresh up to Sun 03-May-2026 EOD; freeze after.
- [ ] **Drop bags will be physically loaded** with printed Atlas pages + laminated Failure Cards. If Jason won't print + carry, the format should pivot phone-only.
- [ ] **`daily-ops` has enough sweat-rate / fueling data** to derive realistic targets for the fueling baseline. If gaps, flag estimates explicitly.
- [ ] **The Cottonwood Creek → Crown King 25-mile section is the killer.** Plan must anchor heat, water, and fueling there. If Jason has different intel suggesting elsewhere is harder, reshape priorities.
- [ ] **6-hour pacing blocks beat per-mile splits at 250mi.** No per-mile pacing math.

## MVP Scope
**In:**
- `sources/` — 4 raw race files, untouched
- `CLAUDE.md` — project rules (audience = fatigued future-self, no scope creep)
- `README.md` — what/why/how
- `strategy/00-contracts.md` — signed pre-commitments
- `strategy/01-race-brief.md` — single-page race summary
- `strategy/02-aid-station-atlas/` — 23 pages (start + 21 AS + finish), each a single printable page
- `strategy/03-failure-cards/` — heat (CC→CK), GI, sleep monsters, foot rot, hyponatremia, no-passing-zone, low motivation, gear-check-fail, DNF-vs-DNFing
- `strategy/04-drop-bag-manifest.md` — 14 drop-bag stations + Crown King↔Fort Tuthill shared bag, linked Google Sheet
- `strategy/05-fueling-baseline.md` — derived from `daily-ops`
- `strategy/06-pacing-blocks.md` — 6-hour blocks vs. cutoffs
- `strategy/07-sleep-plan.md` — 8 sleep stations, target hours, hard floors
- `strategy/08-heat-strategy.md` — Cottonwood → Crown King anchor
- `phone/` — condensed versions for thumb-scrolling on race day
- `live/` — link index for Google Sheets/Docs

**Out:**
- App, dashboard, build pipeline
- Live crew/pacer coordination
- Per-mile pacing splits
- Generic ultra templates
- Post-race retro tooling

## Not Doing (and Why)
- **No web app or React UI** — one week to race, no time, no need; markdown + Sheets/Docs is enough
- **No live crew dashboard** — no crew
- **No GPS / live tracking integration** — that's `Cocodona250-Runner-Dashboard`'s job
- **No reusability across races** — Cocodona 2026 only; reuse later
- **No per-mile pacing** — fiction at 250mi; 6-hour blocks max
- **No nuanced prose anywhere in race-facing docs** — every artifact is "if X, then Y"
- **No "have your crew do X" patterns** — solo + crewless. If a strategy needs a crew, redesign as drop-bag pre-positioning + decision card.

## Open Questions
- Which Google Sheets / Docs are the canonical "live" sources? (drop bag manifest, pacing tracker, others?) — link in `live/README.md` once created.
- What's already in `daily-ops` as a sweat-rate / fueling baseline? — needs review before drafting `strategy/05-fueling-baseline.md`.
- Print + laminate logistics: who prints, when, on what paper, to fit which drop bags? — operational, not Claude's problem.
- Will Jason carry a paper master copy on his person, or rely on phone + drop-bag-distributed copies? — affects whether `phone/` needs to be self-contained.
