# coco-crew-cptn

Solo Cocodona 250 (2026) strategy hub for a **crewless, pacerless** runner.

> *"You are your own crew captain."*

## Race
- **Start:** Mon 04-May-2026 05:00 AM, Deep Canyon Ranch
- **Finish cutoff:** Sat 09-May-2026 10:00 AM (125 hours)
- **Distance:** 253.3 mi
- **Runner:** Jason J. Garcia
- **Crew:** none
- **Pacer:** none

## Design philosophy
Every artifact in this repo is written for **Jason at mile 180 on no sleep**. That means:
- Declarative, not deliberative ("if X, do Y" — never "consider X")
- Atomic (no cross-referencing under fatigue)
- Printable (drop bags have no wifi)
- Pre-committed (decisions made while rested, executed without renegotiation)
- Phone-readable backups for everything

## What's where
| Folder | What it is | Who edits it |
|--------|------------|--------------|
| `sources/` | Aravaipa's official race files (Runner Guide, Crew+Pacer Guide, course GeoJSON, Section Descriptions PDF) | Never edited; replace whole files only when Aravaipa updates |
| `strategy/` | The race plan: contracts, race brief, aid-station atlas, failure cards, drop bag manifest, fueling/pacing/sleep/heat | Jason + Claude |
| `phone/` | Condensed phone-optimized versions for race-day quick reference | Jason + Claude |
| `live/` | Link index for Google Sheets / Google Docs that need live editing | Jason |
| `docs/ideas/` | Strategy variations, ideation, "what if we tried X" — never race-facing | Jason + Claude |

## Day-of usage (the loop)
1. Arrive at AS
2. Open the AS atlas page (printed in drop bag, or pull up `phone/as-cards-phone.md`)
3. Execute what the page says — fueling target, sleep call, foot care call, gear check
4. Read the mental cue
5. Leave

No deliberation. No renegotiation. The well-rested-Jason already made the calls.

## Update policy
- **Source files** can refresh until **Sun 03-May-2026 EOD** — Aravaipa updates the race guide through race-eve.
- **Race-week freeze** begins Sun 03-May-2026 00:00. After that: typo fixes and contract sign-offs only.
- During the race: nothing changes. The plan executes.

## Related projects
- `~/Documents/Cocodona250-Runner-Dashboard/` — live GPS / course profile dashboard (separate concern)
- `daily-ops` CLI — sweat rate, fueling, training load (upstream biometric truth)
- `~/Documents/endurance-fueling/` — fueling tracker baseline
