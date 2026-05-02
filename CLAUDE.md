# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is
Solo Cocodona 250 (2026) strategy hub. **CREWLESS, PACERLESS** effort. Runner: Jason J. Garcia.

- Race start: **Mon 04-May-2026 05:00 AM** at Deep Canyon Ranch
- Hard cutoff: **Sat 09-May-2026 10:00 AM** (125 hours, 253.3 mi)
- 21 named aid stations + 3 water stations + start + finish
- Drop bags at 14 stations (Crown King bag also goes to Fort Tuthill — one bag, two stops)
- Sleep stations at 8 (Kamp Kipa, Camp Wamatochick, Whiskey Row, Mingus, Dead Horse, Sedona Posse, Munds Park, Fort Tuthill)
- Required gear must travel entire course; gear checks at 6 AS

This is **NOT software**. It is markdown + linked Google Sheets/Docs. No build, no test suite, no package manager. Editing = writing markdown or updating linked Sheets/Docs.

## Audience for every artifact
Every doc is written for **Jason at mile 180 on no sleep**, not Jason today.
- **Declarative, not deliberative** — "if X, do Y", never "consider X"
- **Atomic** — no cross-referencing across docs under fatigue
- **Printable** — drop bags have no wifi; every race-facing page must fit on one printed page (~50 lines)
- **Pre-committed** — decisions made now, executed without renegotiation
- **Phone-friendly version exists** for every race-facing doc (`phone/`)

## Source files (upstream truth — never edit, may refresh up to race-eve)
The 4 files in `sources/` are the canonical race information from Aravaipa:
- `Cocodona_2026_Runner_Guide.md` — policies, AS table, gear, rules
- `Cocodona_2026_Crew_+_Pacer_Guide.md` — crew/pacer rules (mostly N/A for solo)
- `Cocodona_250_-_2026_course.json` — GeoJSON: 21 AS markers, 3 water stations, course LineString, no-passing zone markers
- `Section-Descriptions-250-Cocodona-2026-2.pdf` — terrain narrative per section

**Re-ingest policy:** Aravaipa was still updating these as of 2026-04-20. If the user replaces any source file, re-extract AS table / cutoffs / gear policies and update derived artifacts in `strategy/` and `phone/`. Flag any conflicts in chat before overwriting.

**Source freeze:** After race-eve (Sun 03-May-2026 EOD), source files are FROZEN.

## Structure
- `sources/` — raw upstream files, never edited
- `docs/ideas/` — ideation, variations, strategy debates (not race-facing)
- `strategy/00-contracts.md` — signed pre-commitments (sleep / pull / fuel floor / heat ceiling)
- `strategy/01-race-brief.md` — one-page summary that goes in every drop bag
- `strategy/02-aid-station-atlas/<NN>-<name>-M<mile>[-🎒][-💤].md` — one page per AS (23 pages: 21 AS + start + finish; water stations inline in adjacent AS pages). Filename suffix convention: `-🎒` if drop bag is available at this AS, `-💤` if a sleep station is available (as listed in the Runner Guide). Combined as `-🎒💤` if both. No suffix = pass-through AS.
 - Each atlas page opens with a `**Conditions ahead:**` line listing icons describing the **next leg**:
 - 🔥 hot section (heat exposure: lower-elevation daytime, Sonoran/Verde Valley/Sedona basin)
 - 🥶 cold section (sub-50°F at night, especially Coconino Plateau and Mt Elden)
 - 🏔️ high altitude (≥7,000 ft — Mt Union, Mingus, Coconino Plateau, Mt Elden)
 - 🪨 rocky / technical footing (loose rocks, slickrock, baby-head volcanic, scrambling)
 - ⬆️ steep climb — **threshold: NET gain ≥ 1,500 ft, OR sustained climb of ≥1,000 ft over <3 mi.** Rolling sections (e.g. Start→Cottonwood +1,423/-1,339 net +84) do NOT get this icon. Examples that DO: Mingus +2,862' net, Schnebly +3,580' net, Mt Elden +3,386 with 9,000' summit.
 - ⬇️ steep descent — **threshold: NET loss ≥ 1,500 ft, OR sustained descent of ≥1,000 ft over <3 mi.** Examples: Verde Valley −4,428' net, Mt Elden switchbacks (-2,000' in 2 mi).
 - **Rollercoaster legs** (both gain AND loss exceed thresholds in opposite directions) get both icons: e.g. Crown King→Arrastra (+2,005/-2,524), Wildcat→Trinity (+3,386/-3,055 with Mt Elden up-then-down).
 - 🏁 finish (only at AS 22)
 - "Conditions ahead" describes the **upcoming leg** from this AS to the next, NOT current conditions at the AS itself.
- `strategy/03-failure-cards/<mode>.md` — one card per failure mode
- `strategy/04-drop-bag-manifest.md` — markdown summary + Google Sheet link
- `strategy/05-fueling-baseline.md` — derived from `daily-ops` and `endurance-fueling`
- `strategy/06-pacing-blocks.md` — 6-hour pacing blocks vs. cutoffs
- `strategy/07-sleep-plan.md` — which sleep stations, target hours, hard floors
- `strategy/08-heat-strategy.md` — Cottonwood Creek → Crown King is the Cottonwood→Crown King; plan around it
- `strategy/09-vest-layout.md` — 7-flask vest map (4.92 L capacity), per-leg loadout instructions, refill discipline
- `phone/` — condensed phone-optimized versions of race-facing docs
- `live/` — link index for Google Sheets/Docs that need live editing

## Upstream data sources (do not duplicate)
- `daily-ops` CLI (`~/.local/bin/daily-ops`) — sweat rate, fueling baselines, training load. Source of truth for biometrics.
- `~/Documents/Cocodona250-Runner-Dashboard/` — course profile, GPS, splits. Do not rebuild here.
- `~/Documents/endurance-fueling/` — fueling tracker baseline.
- `~/Documents/endurance-training/` — training app, fueling logs.

## Editing rules for Claude
- Keep new content terse and declarative. **No prose paragraphs** in race-facing docs.
- Strategy debates / variations / "what if we tried X" → `docs/ideas/`, never the race-facing docs.
- **Never add per-mile pacing.** Pacing lives in 6-hour blocks. Per-mile precision at 250mi is fiction.
- **Never invent biometric numbers.** Pull from `daily-ops` or flag as `[ESTIMATE]`.
- **Never expand scope** into app/dashboard territory — that's a different project (`Cocodona250-Runner-Dashboard`).
- **Print-format constraint:** every race-facing page in `strategy/` must fit on one printed page (~50 lines, no horizontal scrolling).
- **Phone-format constraint:** `phone/` pages fit one mobile viewport per AS block; thumb-scrollable.
- **The Cottonwood Creek → Crown King 25-mile section is the highest-priority strategic problem.** Heat plan, water plan, fueling plan all anchor here. M7.4 → M36.6, mid-pack 10 hrs, back-of-pack 13+ hrs, exposed, hottest, hardest, two intermediate water stations cap at 1L each.
- **Solo + crewless rules:** never write "have your crew do X" or "your pacer will Y." If a strategy needs a crew, redesign it as drop-bag pre-positioning + decision card. The only race-day input is Jason looking at a printed page or his phone.

## Race-week freeze
Once race week begins (**Sun 03-May-2026 00:00**), the only edits allowed are typo fixes and contract sign-offs. No new features, no restructuring. Artifacts go into drop bags as-is.

## What's out of scope
- Live crew coordination (no crew)
- Race-day software (no phone-app development)
- Generic ultra templates (Cocodona-specific)
- Post-race retro tooling (handle separately, after the race)
- GPS tracking, course profile rendering — that's `Cocodona250-Runner-Dashboard`'s job
