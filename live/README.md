# Live Documents — Google Sheets / Docs Link Index

Sheets and Docs that need live editing during race-week prep. Markdown files in this repo are version-controlled; live docs are NOT.

## Drop Bag Manifest (Sheet)
- **Purpose:** master inventory of all 15 bags, items, packed-status, verified-status
- **URL:** TODO — paste Google Sheet URL once created
- **Recommended columns:** AS, Mile, Bag color/#, Item, Quantity, Source location, Packed (✓), Verified (✓), Notes
- **Used by:** `strategy/04-drop-bag-manifest.md`

## Pacing Chart (Sheet) ✅ CREATED — DATA UPDATED 2026-04-28 (sleep plan v2 = 2.0h)
> ⚠️ The Google Sheet currently has **the old 2.5h sleep model data**. Local CSV (`live/pacing-chart-data.csv`) has been regenerated for the new 2.0h model. **To refresh the sheet:** open the sheet, select rows 2–24 in the first tab, delete, then paste the new contents of `live/pacing-chart-data.csv`. Then re-run `buildVisualGrid` in Apps Script to rebuild the Visual tab. Borders + night shading you applied to the Visual tab will regenerate automatically.

- **Purpose:** visual pacing chart — FAST/A-GOAL band + MID line + B-GOAL line + Cutoff line per AS
- **URL:** https://docs.google.com/spreadsheets/d/13anS1EmecrdNA9gPjFnVrxROzXfkkLAsgp_2P3tWClc/edit
- **Source data:** `live/pacing-chart-data.csv` (in this repo)
- **Apps Script builder:** `live/pacing-chart-apps-script.gs` — paste into Extensions → Apps Script. Includes a `onOpen()` trigger that adds a **"🏃 Cocodona Tools"** menu to the sheet's menu bar (next to File / Edit / View / etc.). After pasting + saving the script, refresh the sheet once for the menu to appear. Menu items:
  - ▶ Build All (full rebuild)
  - 🔢 Recompute Data
  - 🗺️ Refresh Visual Grid
  - 📊 Refresh Pace Breakdown
  - ⚙️ Reset Variables Tab

  **Optional in-sheet drawing button:** the Variables tab has a blue "RUN buildAll()" callout in cells F1:H2. To wire it up as a clickable button: right-click the callout → **Insert drawing** (or use Insert → Drawing) → save → right-click the drawing → **Assign script** → enter `buildAll`. Alternatively just use the menu — same result.

  Five callable functions:
  - `buildModelVariables()` → builds the **"Variables" tab** with all model knobs (green cells = editable):
    - Base moving paces (auto-updated by `recomputeData`)
    - AS dwell time per band (drop-bag, pass-through, medic-extra)
    - Sleep schedule (Camp Wamatochick / Sedona Posse / Fort Tuthill durations)
    - **Target finish times** (FAST/A-GOAL/B-GOAL/CUTOFF hours — these drive the model)
    - Race start datetime
    - Section difficulty multipliers (22 sections)
  - `recomputeData()` → reads Variables, runs the pacing model, writes per-AS arrival TODs back to the data sheet. Also writes computed base paces back to Variables (B3:B5).
  - `buildVisualGrid()` → builds the "Visual" tab (heatmap). Reads from data sheet — run `recomputeData()` first if Variables changed.
  - `buildPaceBreakdown()` → builds "Pace Breakdown" tab (3 tables: per-section pace, per-AS stop, overall averages). Reads from Variables.
  - `buildAll()` → full rebuild: recomputeData → Visual → Pace Breakdown. **Does NOT touch Variables tab if it already exists** — your edits are preserved. To wipe + reseed Variables to defaults, use `⚙️ Reset Variables Tab` from the menu (the only way to overwrite it).

**Workflow for tweaking the model:**
1. Run `buildAll()` once to seed everything
2. Edit green cells in the Variables tab — most-impactful edits:
   - **Target finish times** (B23–B25): change FAST/A-GOAL/B-GOAL hour targets → all band TODs shift
   - **Sleep durations** (C16–C18): change minutes per sleep stop → moving budget rebalances
   - **AS dwell** (B9:D11) per band
   - **Section difficulty** (C36:C57) per section
3. Run **`buildAll()`** again (or just `recomputeData()` then `buildVisualGrid()` + `buildPaceBreakdown()`) — all 3 tabs propagate from your edits.
- **Used by:** `strategy/06-pacing-blocks.md`
- **Columns:**
 - A: AS Name | B: Mile | C: Cutoff TOD | D: Cutoff (h)
 - E: FAST TOD | F: FAST (h) | G: A-GOAL TOD | H: A-GOAL (h) | I: B-GOAL TOD | J: B-GOAL (h)
 - K: MID (h) = AVG(FAST, A-GOAL)
 - L: BAND base (= FAST h, used for stacked-area trick)
 - M: BAND height (= A-GOAL − FAST, colored area on chart)
- **What the visual grid shows:**
 - Light blue cells = FAST ↔ A-GOAL range (target window) for that AS at that time
 - Darker blue cell = MID target (centerline of band) snapped to the 30-min bucket
 - Red cell = B-GOAL (100h ceiling — below this is at-risk-of-DQ)
 - Gray cell = Aravaipa hard cutoff (DQ if you're past this)

## Pacing Tracker (Sheet — separate, race-day TOD log)
- **Purpose:** during-race actual TOD vs. cutoff math
- **URL:** TODO
- **Recommended columns:** AS, Mile, Cutoff TOD, Target TOD, Actual TOD, Margin (hh:mm), Sleep taken (min), Notes
- **Used by:** `strategy/06-pacing-blocks.md`
- **Pre-populate** from cutoff table; fill in actual TOD at each AS

## Strategy Doc (Doc)
- **Purpose:** living strategy notes, race-week pivots, late-breaking course updates
- **URL:** TODO
- **Used by:** Jason during race-week prep + race-eve

## Fueling Test Log (Sheet, optional)
- **Purpose:** if running training-day fueling tests in race-week
- **URL:** TODO
- **Used by:** `strategy/05-fueling-baseline.md`

## How to add a new live doc
1. Create the Doc/Sheet in Google Drive
2. Get a shareable link (view-only for backups, edit for live)
3. Add a section in this file with: Purpose, URL, columns/sections, Used by
4. Link it from the related markdown file in `strategy/`
