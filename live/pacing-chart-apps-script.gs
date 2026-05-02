// ════════════════════════════════════════════════════════════════════════════
// onOpen() — adds a custom "🏃 Cocodona Tools" menu to the sheet's menu bar
// every time the spreadsheet is opened. Each menu item is a one-click run of
// the corresponding function — effectively the "button" UX for the script.
// ════════════════════════════════════════════════════════════════════════════

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🏃 Cocodona Tools')
    .addItem('▶ Build All (full rebuild)',           'buildAll')
    .addSeparator()
    .addItem('🔢 Recompute Data (Variables → sheet)', 'recomputeData')
    .addItem('🎨 Format Data Sheet',                  'formatDataSheet')
    .addItem('🗺️ Refresh Visual Grid',                'buildVisualGrid')
    .addItem('📊 Refresh Pace Breakdown',             'buildPaceBreakdown')
    .addSeparator()
    .addItem('💾 Backup Gear Checklist (safe — copy current tab)', 'backupGearChecklist')
    .addItem('🔄 Upgrade Gear Checklist columns (preserves edits)', 'migrateGearChecklistToApproachA')
    .addSeparator()
    .addItem('🛑 DANGER: Recreate Gear Checklist',       'wipeAndRecreateGearChecklist')
    .addItem('⚠️ Wipe + recreate Variables tab',         'buildModelVariables')
    .addToUi();
}


// ════════════════════════════════════════════════════════════════════════════
// onEdit() — watches the Variables tab for the H1 checkbox being toggled.
// When checked, runs buildAll() then resets the checkbox.
//
// Note: simple onEdit triggers have a 30-second timeout. If buildAll exceeds
// that (the Visual tab has 6,000+ cell formats), fall back to the custom menu
// which has no timeout. The checkbox auto-resets so it can be retoggled.
// ════════════════════════════════════════════════════════════════════════════

function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== VARIABLES_TAB_NAME) return;
  if (e.range.getA1Notation() !== 'H1') return;
  if (String(e.value).toUpperCase() !== 'TRUE') return;

  // Reset the checkbox FIRST so timeouts don't leave it stuck
  e.range.setValue(false);

  try {
    buildAll();
  } catch (err) {
    // Best-effort error surface — alert may fail under simple-trigger context
    try { SpreadsheetApp.getUi().alert('buildAll error: ' + err); } catch (_) {}
    Logger.log('buildAll error from checkbox: ' + err);
  }
}


// Cocodona 250 — Pacing VISUAL GRID Builder
// Builds a heatmap-style grid in a "Visual" tab:
//   - Rows    = aid stations (Y-axis), 23 AS top-to-bottom
//   - Columns = time (X-axis), 30-min buckets, 0h → 130h (261 columns)
//   - Cells colored:
//       light grey   = night hours (7 PM → 6 AM) — applied to all "empty" night cells
//       light blue   = within FAST..A-GOAL band for that AS
//       darker blue  = MID line (centerline through the band)
//       red          = B-GOAL (100h target ceiling)
//       gray         = Aravaipa hard cutoff
//   - Borders:
//       vertical line at each day boundary (every 24h, i.e. every 48 cells)
//       horizontal line between each AS row
//       thicker border around the entire grid
//
// Sheet: https://docs.google.com/spreadsheets/d/13anS1EmecrdNA9gPjFnVrxROzXfkkLAsgp_2P3tWClc/edit
//
// HOW TO USE:
//   1. Open the sheet
//   2. Extensions → Apps Script
//   3. Paste this entire file, save
//   4. Run buildVisualGrid (▶), authorize when prompted
//   5. Switch back to the sheet — "Visual" tab regenerates

function buildVisualGrid() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dataSheet = ss.getSheets()[0];
  const lastRow = dataSheet.getLastRow();
  // Columns: A=Name, B=Mile, C=CutoffTOD, D=CutoffH, E=FastTOD, F=FastH,
  //          G=SlowTOD, H=SlowH, I=RedTOD, J=RedH, K=MidH, L=BandBase, M=BandHeight
  const asData = dataSheet.getRange(2, 1, lastRow - 1, 13).getValues();
  const numAS = asData.length;

  // Remove existing Visual tab
  const oldViz = ss.getSheetByName('Visual');
  if (oldViz) ss.deleteSheet(oldViz);
  const viz = ss.insertSheet('Visual', 1);

  // Time grid setup
  const stepHours = 0.5;
  const maxHours = 130;
  const numTimeCols = Math.floor(maxHours / stepHours) + 1; // 261

  // Race start (editable via Variables!B24) — drives header TODs, night shading,
  // and the live current-hour highlight.
  const startTime = readRaceStart();
  const startClockHour = startTime.getHours() + startTime.getMinutes() / 60;

  // Night = clock TOD between 19:00 and 06:00, regardless of race start.
  function isNight(h) {
    const hOfDay = ((h % 24) + 24) % 24;
    const clockHour = (startClockHour + hOfDay) % 24;
    return clockHour >= 19 || clockHour < 6;
  }

  // ── Header rows ────────────────────────────────────────────
  // Row 1: hour values (every 30 min)
  // Row 2: TOD labels (only at every 6h to avoid clutter)
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const headerHours = ['Aid Station', 'Mile'];
  const headerTODs  = ['', ''];

  for (let c = 0; c < numTimeCols; c++) {
    const h = c * stepHours;
    headerHours.push(h.toFixed(1));
    if (h % 6 === 0) {
      const tod = new Date(startTime.getTime() + h * 3600000);
      const day = dayNames[tod.getDay()];
      let hr = tod.getHours();
      const ampm = hr >= 12 ? 'PM' : 'AM';
      if (hr === 0) hr = 12; else if (hr > 12) hr -= 12;
      headerTODs.push(day + ' ' + hr + ampm);
    } else {
      headerTODs.push('');
    }
  }

  viz.getRange(1, 1, 1, headerHours.length).setValues([headerHours])
    .setFontWeight('bold').setBackground('#202124').setFontColor('#FFFFFF')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  viz.getRange(2, 1, 1, headerTODs.length).setValues([headerTODs])
    .setFontStyle('italic').setFontColor('#5F6368').setFontWeight('bold')
    .setHorizontalAlignment('center');

  // ── Build AS rows + color matrix ───────────────────────────
  const eps = stepHours / 2;
  const values = [];
  const colors = [];

  // Color constants
  const COLOR_NIGHT  = '#F1F3F4';  // light grey
  const COLOR_BAND   = '#A4C2F4';  // light blue
  const COLOR_MID    = '#1A73E8';  // darker blue
  const COLOR_RED    = '#EA4335';  // red
  const COLOR_CUTOFF = '#9AA0A6';  // gray

  for (let i = 0; i < numAS; i++) {
    const name    = asData[i][0];
    const mile    = asData[i][1];
    const cutoffH = asData[i][3];
    const fastH   = asData[i][5];
    const slowH   = asData[i][7];
    const redH    = asData[i][9];
    const midH    = asData[i][10];

    const valRow = [name, 'M' + mile];
    const colRow = [null, null];

    for (let c = 0; c < numTimeCols; c++) {
      const h = c * stepHours;
      let bg = null;

      // Layer 0: night shading (lowest priority — only if cell is otherwise empty)
      if (isNight(h)) {
        bg = COLOR_NIGHT;
      }

      // Layer 1: cutoff (gray) — overrides night
      if (typeof cutoffH === 'number' && cutoffH > 0 && Math.abs(h - cutoffH) <= eps) {
        bg = COLOR_CUTOFF;
      }

      // Layer 2: FAST..A-GOAL band — overrides night/cutoff
      if (typeof fastH === 'number' && typeof slowH === 'number'
          && h >= fastH - eps && h <= slowH + eps) {
        bg = COLOR_BAND;
      }

      // Layer 3: MID centerline — overrides band
      if (typeof midH === 'number' && Math.abs(h - midH) <= eps) {
        bg = COLOR_MID;
      }

      // Layer 4: B-GOAL line — top priority
      if (typeof redH === 'number' && Math.abs(h - redH) <= eps) {
        bg = COLOR_RED;
      }

      valRow.push('');
      colRow.push(bg);
    }

    values.push(valRow);
    colors.push(colRow);
  }

  // Write all values and backgrounds in batch
  const totalCols = 2 + numTimeCols;
  const dataRange = viz.getRange(3, 1, numAS, totalCols);
  dataRange.setValues(values);
  dataRange.setBackgrounds(colors);

  // Format AS name + mile cells
  viz.getRange(3, 1, numAS, 1).setFontWeight('bold').setHorizontalAlignment('left');
  viz.getRange(3, 2, numAS, 1).setFontStyle('italic').setFontColor('#5F6368').setHorizontalAlignment('right');

  // ── Sizing ─────────────────────────────────────────────────
  viz.setFrozenRows(2);
  viz.setFrozenColumns(2);
  viz.setColumnWidth(1, 175);
  viz.setColumnWidth(2, 55);
  for (let c = 3; c <= totalCols; c++) viz.setColumnWidth(c, 26);
  viz.setRowHeight(1, 22);
  viz.setRowHeight(2, 22);
  for (let r = 3; r < 3 + numAS; r++) viz.setRowHeight(r, 22);

  // ── Borders ────────────────────────────────────────────────
  // Outer border around whole grid (thick)
  viz.getRange(1, 1, 2 + numAS, totalCols).setBorder(
    true, true, true, true, false, false,
    '#202124', SpreadsheetApp.BorderStyle.SOLID_THICK
  );

  // Horizontal line between each AS row (thin)
  // setBorder args: top, left, bottom, right, vertical, horizontal
  viz.getRange(3, 1, numAS, totalCols).setBorder(
    null, null, null, null, null, true,
    '#DADCE0', SpreadsheetApp.BorderStyle.SOLID
  );

  // Vertical line at each day boundary (every 24h = every 48 columns past col 2)
  // Day boundaries occur at h=24 (Tue 5 AM), h=48 (Wed 5 AM), etc. — but we treat
  // h=0 (race start, Mon 5 AM) as day 1 start, so verticals at h=24, 48, 72, 96, 120
  for (let h = 24; h < maxHours; h += 24) {
    const colIdx = 2 + Math.round(h / stepHours) + 1; // +1 to put border BEFORE this col
    if (colIdx <= totalCols) {
      viz.getRange(1, colIdx, 2 + numAS, 1).setBorder(
        null, true, null, null, null, null,
        '#202124', SpreadsheetApp.BorderStyle.SOLID_MEDIUM
      );
    }
  }

  // Vertical separator between AS-info columns (A,B) and time cells (C+)
  viz.getRange(1, 3, 2 + numAS, 1).setBorder(
    null, true, null, null, null, null,
    '#202124', SpreadsheetApp.BorderStyle.SOLID_MEDIUM
  );

  // Make column headers vertical text rotation
  viz.getRange(1, 3, 1, numTimeCols).setVerticalAlignment('middle')
    .setTextRotation(0);  // keep horizontal — too many cols for vertical to be readable

  // ── Legend below the grid ──────────────────────────────────
  const legendStart = 3 + numAS + 2;
  viz.getRange(legendStart, 1).setValue('LEGEND').setFontWeight('bold');
  viz.getRange(legendStart + 1, 1).setValue('FAST↔A-GOAL band');
  viz.getRange(legendStart + 1, 2).setBackground(COLOR_BAND);
  viz.getRange(legendStart + 2, 1).setValue('MID centerline');
  viz.getRange(legendStart + 2, 2).setBackground(COLOR_MID).setFontColor('#FFFFFF');
  viz.getRange(legendStart + 3, 1).setValue('B-GOAL (100h)');
  viz.getRange(legendStart + 3, 2).setBackground(COLOR_RED).setFontColor('#FFFFFF');
  viz.getRange(legendStart + 4, 1).setValue('Aravaipa cutoff');
  viz.getRange(legendStart + 4, 2).setBackground(COLOR_CUTOFF).setFontColor('#FFFFFF');
  viz.getRange(legendStart + 5, 1).setValue('Night (7 PM – 6 AM)');
  viz.getRange(legendStart + 5, 2).setBackground(COLOR_NIGHT);
  viz.getRange(legendStart + 6, 1).setValue('Current hour (live)');
  viz.getRange(legendStart + 6, 2).setBackground('#FFEB3B').setFontWeight('bold');

  // ── Current-hour column highlight (live, updates with NOW()) ──
  // Conditional format rule: highlight the column whose 30-min bucket
  // matches the current time elapsed from race start (Variables!B24).
  //
  // The rule paints yellow on the CURRENT-hour column across header rows
  // (1-2) AND empty/night AS-grid cells (rows 3..2+numAS), but skips cells
  // that already carry a pacing-band color (Cutoff / FAST↔A-GOAL band /
  // MID / B-GOAL). Conditional formatting overrides direct backgrounds, so
  // the formula explicitly excludes those cells by checking the per-AS
  // hour values on the data sheet.
  //
  // Hour for column C: H = (COL - 3) * 0.5
  // Visual row R (R≥3) maps to data-sheet row R-1 (viz has 2 header rows;
  // dataSheet has 1 header row + AS rows starting at row 2).
  // dataSheet cols: D=Cutoff(h), F=FAST(h), H=A-GOAL(h), J=B-GOAL(h), K=MID(h)
  // eps = 0.25 (stepHours/2) — must match the AS-grid coloring tolerance.
  //
  // Sheets blocks direct cross-sheet refs in conditional formatting; INDIRECT
  // is the documented workaround.
  // Sheets re-evaluates NOW() on recalcs (set spreadsheet to recalc every
  // minute for tightest tracking: File → Settings → Calculation).
  const dataSheetName = dataSheet.getName().replace(/'/g, "''");
  const dRef = "INDIRECT(\"'" + dataSheetName + "'!D\"&(ROW()-1))";
  const fRef = "INDIRECT(\"'" + dataSheetName + "'!F\"&(ROW()-1))";
  const hRef = "INDIRECT(\"'" + dataSheetName + "'!H\"&(ROW()-1))";
  const jRef = "INDIRECT(\"'" + dataSheetName + "'!J\"&(ROW()-1))";
  const kRef = "INDIRECT(\"'" + dataSheetName + "'!K\"&(ROW()-1))";
  const formula =
    '=AND(' +
      'COLUMN() = FLOOR((NOW() - INDIRECT("Variables!$B$24")) * 48) + 3,' +
      'OR(' +
        'ROW() <= 2,' +
        'NOT(OR(' +
          'ABS((COLUMN()-3)*0.5 - ' + dRef + ') <= 0.25,' +
          'AND((COLUMN()-3)*0.5 >= ' + fRef + ' - 0.25, (COLUMN()-3)*0.5 <= ' + hRef + ' + 0.25),' +
          'ABS((COLUMN()-3)*0.5 - ' + kRef + ') <= 0.25,' +
          'ABS((COLUMN()-3)*0.5 - ' + jRef + ') <= 0.25' +
        '))' +
      ')' +
    ')';
  const liveRange = viz.getRange(1, 3, 2 + numAS, totalCols - 2);
  const liveRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(formula)
    .setBackground('#FFEB3B')
    .setFontColor('#202124')
    .setBold(true)
    .setRanges([liveRange])
    .build();
  viz.setConditionalFormatRules([liveRule]);

  // Activate the new tab
  ss.setActiveSheet(viz);

  Logger.log('Visual grid built: ' + numAS + ' AS rows × ' + numTimeCols +
             ' time cols, w/ night shading + day-boundary borders + live current-hour column.');
}


// ════════════════════════════════════════════════════════════════════════════
// Pace Breakdown tab — per-section pace (min/mi) + overall averages
// ════════════════════════════════════════════════════════════════════════════

function buildPaceBreakdown() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Read from Variables tab if present; otherwise use hardcoded defaults
  const vars = readModelVariables();

  // Section data: [name, distance_mi, difficulty_multiplier]
  // Variables tab provides [name, end_mile, difficulty] — convert to distance below.
  let sectionsRaw;
  if (vars && vars.sections && vars.sections.length === 22) {
    // Convert [name, end_mile, difficulty] → [name, distance, difficulty]
    sectionsRaw = vars.sections;
  } else {
    sectionsRaw = [
      ["Start → Cottonwood",       7.4,   1.00],
      ["Cottonwood → Lane Mtn",    32.5,  1.55],
      ["Lane Mtn → Crown King",    36.6,  1.30],
      ["Crown King → Arrastra",    51.0,  0.92],
      ["Arrastra → Kamp Kipa",     60.8,  1.00],
      ["Kamp Kipa → Wamatochick",  67.4,  0.98],
      ["Wamatochick → Whiskey",    75.6,  0.95],
      ["Whiskey → Watson",         82.8,  0.92],
      ["Watson → Fain",            96.5,  1.10],
      ["Fain → Mingus",            107.2, 1.45],
      ["Mingus → Jerome",          124.2, 0.95],
      ["Jerome → Dead Horse",      132.9, 0.98],
      ["Dead Horse → Deer Pass",   146.9, 1.05],
      ["Deer Pass → Sedona Posse", 159.1, 1.05],
      ["Sedona Posse → Schnebly",  176.1, 1.55],
      ["Schnebly → Munds",         190.0, 1.00],
      ["Munds → Kelly",            202.7, 0.95],
      ["Kelly → Fort Tuthill",     211.0, 0.92],
      ["Fort Tuthill → Walnut",    227.1, 1.00],
      ["Walnut → Wildcat",         234.1, 1.00],
      ["Wildcat → Trinity",        249.4, 1.00],
      ["Trinity → Finish",         253.3, 0.92],
    ];
  }

  // Convert end_mile to distance (subtract previous end_mile)
  const sections = [];
  let prev = 0;
  sectionsRaw.forEach(function(s) {
    sections.push([s[0], s[1] - prev, s[2]]);
    prev = s[1];
  });

  // Base paces (min/mi)
  const basePace = (vars && vars.basePace) ? vars.basePace : {fast: 10.85, slow: 13.41, red: 19.43};

  // Remove existing tab and recreate
  const old = ss.getSheetByName('Pace Breakdown');
  if (old) ss.deleteSheet(old);
  const sheet = ss.insertSheet('Pace Breakdown', 2);

  // Helpers
  function fmtPace(minPerMi) {
    const m = Math.floor(minPerMi);
    let s = Math.round((minPerMi - m) * 60);
    if (s === 60) return (m + 1) + ':00';
    return m + ':' + (s < 10 ? '0' + s : s);
  }
  function fmtMPH(minPerMi) {
    if (!minPerMi || minPerMi <= 0) return '—';
    return (60 / minPerMi).toFixed(2) + ' mph';
  }
  function fmtDur(totalMin) {
    const h = Math.floor(totalMin / 60);
    const m = Math.round(totalMin - h * 60);
    return h + 'h' + (m < 10 ? '0' + m : m) + 'm';
  }

  // Header row — pace, mph, and time columns for each band
  const header = ['Section', 'Mi', 'Difficulty',
                  'FAST pace', 'A-GOAL pace', 'B-GOAL pace',
                  'FAST mph', 'A-GOAL mph', 'B-GOAL mph',
                  'FAST time', 'A-GOAL time', 'B-GOAL time'];
  sheet.getRange(1, 1, 1, header.length).setValues([header])
    .setFontWeight('bold').setBackground('#202124').setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');

  // Body rows
  const rows = sections.map(function(s) {
    const name = s[0], dist = s[1], diff = s[2];
    const fp = basePace.fast * diff;
    const sp = basePace.slow * diff;
    const rp = basePace.red  * diff;
    return [name, dist, diff,
            fmtPace(fp), fmtPace(sp), fmtPace(rp),
            fmtMPH(fp),  fmtMPH(sp),  fmtMPH(rp),
            fmtDur(dist * fp), fmtDur(dist * sp), fmtDur(dist * rp)];
  });
  sheet.getRange(2, 1, rows.length, header.length).setValues(rows);

  // Color-code rows by difficulty
  const COLOR_HARD = '#FCE8E6';   // light red — major climbs (≥1.40)
  const COLOR_MID  = '#FFF7E0';   // light yellow — climbs (1.10–1.39)
  const COLOR_EASY = '#E6F4EA';   // light green — descents (≤0.95)
  for (let i = 0; i < sections.length; i++) {
    const diff = sections[i][2];
    let bg = null;
    if (diff >= 1.40) bg = COLOR_HARD;
    else if (diff >= 1.10) bg = COLOR_MID;
    else if (diff <= 0.95) bg = COLOR_EASY;
    if (bg) sheet.getRange(2 + i, 1, 1, header.length).setBackground(bg);
    if (diff >= 1.40) sheet.getRange(2 + i, 1, 1, header.length).setFontWeight('bold');
  }

  // ── Total distance row ─────────────────────────────────────
  const totalRow = rows.length + 2;
  let totalDist = 0;
  sections.forEach(function(s) { totalDist += s[1]; });
  sheet.getRange(totalRow, 1).setValue('TOTAL DISTANCE').setFontWeight('bold');
  sheet.getRange(totalRow, 2).setValue(totalDist.toFixed(1)).setFontWeight('bold');

  // ── AS stop times (dwell + sleep + medic) ──────────────────
  // Dwell budgets per band — read from Variables if present
  const dwellDropBag    = (vars && vars.dwell) ? vars.dwell.dropBag    : {fast: 8,  slow: 15, red: 25};
  const dwellPassthru   = (vars && vars.dwell) ? vars.dwell.passthru   : {fast: 3,  slow: 6,  red: 10};
  const dwellMedicExtra = (vars && vars.dwell) ? vars.dwell.medicExtra : {fast: 5,  slow: 10, red: 15};
  // Sleep schedule: dynamic array of {name, mile, duration} from Variables
  const sleepArr = (vars && vars.sleep && vars.sleep.length) ? vars.sleep : [
    {name: 'Camp Wamatochick',     mile: 67.4,  duration: 30},
    {name: 'Sedona Posse Grounds', mile: 159.1, duration: 60},
    {name: 'Fort Tuthill',         mile: 211.0, duration: 30},
  ];

  // AS dwell type map: from Variables tab (mile string → "drop bag" | "pass-through" | "finish")
  const dwellMap = (vars && vars.asDwellMap) ? vars.asDwellMap : {};

  function sleepAt(mile) {
    for (let i = 0; i < sleepArr.length; i++) {
      if (Math.abs(mile - sleepArr[i].mile) < 0.05) return sleepArr[i].duration;
    }
    return 0;
  }
  function dwellTypeAt(mile) {
    return dwellMap[mile.toFixed(1)] || 'drop bag';   // default if unknown
  }

  // AS catalog: [name, mile] — type/label/durations computed dynamically below
  const asStops = [
    ["Cottonwood Creek",       7.4],
    ["Lane Mtn",               32.5],
    ["Crown King",             36.6],
    ["Arrastra Creek",         51.0],
    ["Kamp Kipa",              60.8],
    ["Camp Wamatochick",       67.4],
    ["Whiskey Row",            75.6],
    ["Watson Lake",            82.8],
    ["Fain Ranch",             96.5],
    ["Mingus Mountain",        107.2],
    ["Jerome",                 124.2],
    ["Dead Horse",             132.9],
    ["Deer Pass",              146.9],
    ["Sedona Posse Grounds",   159.1],
    ["Schnebly Hill",          176.1],
    ["Munds Park",             190.0],
    ["Kelly Canyon",           202.7],
    ["Fort Tuthill",           211.0],
    ["Walnut Canyon",          227.1],
    ["Wildcat Hill",           234.1],
    ["Trinity Heights",        249.4],
    ["FINISH Heritage Sq",     253.3],
  ];

  function stopMins(name, mile) {
    // Returns {fast, slow, red, label, kind} total stop time in minutes
    const type = dwellTypeAt(mile);
    if (type === 'finish') {
      return {fast: 0, slow: 0, red: 0, label: 'finish (no dwell)', kind: 'finish'};
    }

    const isPass = (type === 'pass-through');
    const base = isPass ? dwellPassthru : dwellDropBag;

    // Sleep duration at this AS (0 if not in user's sleep schedule)
    const sleepDur = sleepAt(mile);
    const isFT = Math.abs(mile - 211.0) < 0.05;
    const medic = isFT ? dwellMedicExtra : {fast: 0, slow: 0, red: 0};

    // Build label
    let label = isPass ? 'pass-through' : 'drop bag';
    if (sleepDur > 0) label += ' + ' + sleepDur + 'm sleep';
    if (isFT) label += ' + mandatory medic';

    return {
      fast: base.fast + sleepDur + medic.fast,
      slow: base.slow + sleepDur + medic.slow,
      red:  base.red  + sleepDur + medic.red,
      label: label,
      kind: sleepDur > 0 ? 'sleep' : (isPass ? 'pass' : 'drop'),
    };
  }

  function fmtMin(m) {
    if (m === 0) return "—";
    if (m < 60) return m + "m";
    const h = Math.floor(m / 60), mm = m - h*60;
    return h + "h" + (mm < 10 ? "0" + mm : mm) + "m";
  }

  const stopTableStart = totalRow + 3;
  sheet.getRange(stopTableStart, 1).setValue('AS STOP TIMES (dwell + sleep + medic)')
    .setFontWeight('bold').setBackground('#202124').setFontColor('#FFFFFF');

  const stopHeader = ['AS', 'Mile', 'Stop type', 'FAST stop', 'A-GOAL stop', 'B-GOAL stop'];
  sheet.getRange(stopTableStart + 1, 1, 1, stopHeader.length).setValues([stopHeader])
    .setFontWeight('bold').setBackground('#F1F3F4');

  // Compute meta for every AS once; reuse for rows + colors
  const stopMeta = asStops.map(function(s) { return stopMins(s[0], s[1]); });

  const stopRows = asStops.map(function(s, i) {
    const m = stopMeta[i];
    return [s[0], s[1], m.label, fmtMin(m.fast), fmtMin(m.slow), fmtMin(m.red)];
  });
  sheet.getRange(stopTableStart + 2, 1, stopRows.length, stopHeader.length).setValues(stopRows);

  // Color-code stop rows
  const COLOR_STOP_SLEEP = '#E8DAEF';   // lavender — sleep stops
  const COLOR_STOP_DROP  = '#D4E6F1';   // light blue — drop bag
  const COLOR_STOP_PASS  = '#F8F9FA';   // very light grey — pass-through
  const COLOR_STOP_FIN   = '#FFD700';   // gold — finish
  for (let i = 0; i < asStops.length; i++) {
    const kind = stopMeta[i].kind;
    let bg = null;
    if (kind === 'sleep')       bg = COLOR_STOP_SLEEP;
    else if (kind === 'drop')   bg = COLOR_STOP_DROP;
    else if (kind === 'pass')   bg = COLOR_STOP_PASS;
    else if (kind === 'finish') bg = COLOR_STOP_FIN;
    if (bg) sheet.getRange(stopTableStart + 2 + i, 1, 1, stopHeader.length).setBackground(bg);
    if (kind === 'sleep') {
      sheet.getRange(stopTableStart + 2 + i, 1, 1, stopHeader.length).setFontWeight('bold');
    }
  }

  // Totals row for stop times
  let totFast = 0, totSlow = 0, totRed = 0;
  stopMeta.forEach(function(m) {
    totFast += m.fast; totSlow += m.slow; totRed += m.red;
  });
  const stopTotalRow = stopTableStart + 2 + asStops.length;
  sheet.getRange(stopTotalRow, 1, 1, 3).setValues([["TOTAL non-moving (AS dwell + sleep)", "", ""]])
    .setFontWeight('bold').setBackground('#202124').setFontColor('#FFFFFF');
  sheet.getRange(stopTotalRow, 4, 1, 3).setValues([[fmtMin(totFast), fmtMin(totSlow), fmtMin(totRed)]])
    .setFontWeight('bold').setBackground('#202124').setFontColor('#FFFFFF');

  // Border around stop table
  sheet.getRange(stopTableStart + 1, 1, asStops.length + 2, stopHeader.length).setBorder(
    true, true, true, true, true, true,
    '#DADCE0', SpreadsheetApp.BorderStyle.SOLID
  );

  // ── Overall averages section ───────────────────────────────
  const summaryStart = stopTotalRow + 3;
  sheet.getRange(summaryStart, 1, 1, 9).setValue('').merge();
  sheet.getRange(summaryStart, 1).setValue('OVERALL AVERAGES (incl. AS time + sleep)')
    .setFontWeight('bold').setBackground('#202124').setFontColor('#FFFFFF');

  const overallRows = [
    ['Metric',                         '', '', '🟢 FAST',    '🟡 A-GOAL',    '🔴 B-GOAL'],
    ['Total finish time',              '', '', '55h',         '69h',         '100h'],
    ['Total finish TOD',               '', '', 'Wed 12:00 PM','Thu 2:00 AM', 'Fri 9:00 AM'],
    ['Overall pace (total ÷ 253.3 mi)','', '', '13:02 min/mi','16:21 min/mi','23:41 min/mi'],
    ['Overall MPH',                    '', '', '4.61 mph',    '3.67 mph',    '2.53 mph'],
    ['Moving pace (moving ÷ 253.3 mi)','', '', '12:01 min/mi','14:50 min/mi','21:30 min/mi'],
    ['Moving MPH',                     '', '', '4.99 mph',    '4.04 mph',    '2.79 mph'],
    ['Moving time',                    '', '', '50.70 h',     '62.63 h',     '90.75 h'],
    ['AS dwell time',                  '', '', '2.30 h',      '4.37 h',      '7.25 h'],
    ['Sleep time',                     '', '', '2.00 h',      '2.00 h',      '2.00 h'],
  ];
  sheet.getRange(summaryStart + 1, 1, overallRows.length, 6).setValues(overallRows);
  sheet.getRange(summaryStart + 1, 1, 1, 6).setFontWeight('bold').setBackground('#F1F3F4');
  sheet.getRange(summaryStart + 2, 4, 1, 3).setBackground('#A4C2F4').setFontWeight('bold');  // FAST/A-GOAL/B-GOAL row highlight

  // ── Difficulty legend ──────────────────────────────────────
  const legendStart = summaryStart + overallRows.length + 3;
  sheet.getRange(legendStart, 1).setValue('DIFFICULTY MULTIPLIER LEGEND').setFontWeight('bold');
  sheet.getRange(legendStart + 1, 1).setValue('≥1.40 (major climb / heat-exposed)')
    .setBackground(COLOR_HARD).setFontWeight('bold');
  sheet.getRange(legendStart + 2, 1).setValue('1.10–1.39 (sustained climb)')
    .setBackground(COLOR_MID);
  sheet.getRange(legendStart + 3, 1).setValue('0.96–1.09 (rolling)');
  sheet.getRange(legendStart + 4, 1).setValue('≤0.95 (downhill / easy)')
    .setBackground(COLOR_EASY);

  // ── Sizing & formatting ────────────────────────────────────
  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 55);
  sheet.setColumnWidth(3, 80);
  for (let c = 4; c <= 12; c++) sheet.setColumnWidth(c, 95);
  sheet.setFrozenRows(1);

  // Borders on the section table
  sheet.getRange(1, 1, 1 + rows.length, header.length).setBorder(
    true, true, true, true, true, true,
    '#DADCE0', SpreadsheetApp.BorderStyle.SOLID
  );

  // Borders on overall averages table
  sheet.getRange(summaryStart + 1, 1, overallRows.length, 6).setBorder(
    true, true, true, true, true, true,
    '#DADCE0', SpreadsheetApp.BorderStyle.SOLID
  );

  ss.setActiveSheet(sheet);
  Logger.log('Pace Breakdown tab built: ' + rows.length + ' sections + overall averages.');
}


// ════════════════════════════════════════════════════════════════════════════
// Variables tab — all model knobs in one editable place
// ════════════════════════════════════════════════════════════════════════════
//
// This tab is the SOURCE OF TRUTH for the pacing model.
// `buildPaceBreakdown()` reads from this tab if present (otherwise falls back
// to hardcoded defaults). Edit values here, then re-run `buildPaceBreakdown()`
// to see updated section paces / times.
//
// To also propagate edits to the Visual tab (per-AS arrival TODs), you'd need
// a `recomputeData()` function (not included — would re-run the full model and
// overwrite the data sheet).

const VARIABLES_TAB_NAME = 'Variables';

function buildModelVariables() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const old = ss.getSheetByName(VARIABLES_TAB_NAME);
  if (old) ss.deleteSheet(old);
  const sh = ss.insertSheet(VARIABLES_TAB_NAME, 3);

  // Helper: write a section header
  function header(row, col, label, span) {
    span = span || 4;
    const r = sh.getRange(row, col, 1, span);
    r.merge();
    r.setValue(label).setFontWeight('bold').setBackground('#202124').setFontColor('#FFFFFF')
      .setHorizontalAlignment('center');
  }

  // ── 0. RUN BUTTON (checkbox-style) ────────────────────────
  // Real clickable button via checkbox + onEdit trigger:
  // toggling H1 fires onEdit → buildAll() → uncheck.
  sh.getRange('F1:G1').merge()
    .setValue('▶ Run buildAll()').setBackground('#1A73E8')
    .setFontColor('#FFFFFF').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle')
    .setFontSize(11);
  sh.getRange('H1').insertCheckboxes();
  sh.getRange('H1').setBackground('#FFEB3B')
    .setHorizontalAlignment('center').setVerticalAlignment('middle')
    .setFontWeight('bold');
  sh.getRange('F2:H2').merge()
    .setValue('Toggle H1 ↑ to run, or use 🏃 Cocodona Tools menu')
    .setBackground('#FFFDE7').setFontStyle('italic')
    .setHorizontalAlignment('center').setFontSize(9);
  sh.setRowHeight(1, 32);
  sh.setRowHeight(2, 22);

  // ── 1. BASE MOVING PACES (display only — auto-computed) ───
  header(1, 1, 'BASE MOVING PACES (min/mi) — AUTO-COMPUTED, do not edit', 3);
  sh.getRange(2, 1, 1, 3).setValues([['Band', 'Pace', 'Notes']])
    .setFontWeight('bold').setBackground('#F1F3F4');
  sh.getRange(3, 1, 3, 3).setValues([
    ['🟢 FAST', 10.85, 'Auto-computed from target finish times by recomputeData()'],
    ['🟡 A-GOAL', 13.41, '↑ same'],
    ['🔴 B-GOAL',  19.43, '↑ same'],
  ]);
  // Grey + italic = display-only (NOT editable). Edit targets at B23:B25 instead.
  sh.getRange(3, 2, 3, 1).setBackground('#F1F3F4').setFontStyle('italic').setFontColor('#5F6368');

  // ── 2. AS DWELL TIME ──────────────────────────────────────
  header(7, 1, 'AS DWELL TIME (min)', 4);
  sh.getRange(8, 1, 1, 4).setValues([['Stop type', '🟢 FAST', '🟡 A-GOAL', '🔴 B-GOAL']])
    .setFontWeight('bold').setBackground('#F1F3F4');
  sh.getRange(9, 1, 3, 4).setValues([
    ['drop bag',                    8,  15, 25],
    ['pass-through',                3,  6,  10],
    ['medic extra (Fort Tuthill)',  5,  10, 15],
  ]);
  sh.getRange(9, 2, 3, 3).setBackground('#D9EAD3');

  // ── 3. SLEEP SCHEDULE (cols F-K, rows 4-8) ────────────────
  header(4, 6, 'SLEEP SCHEDULE (min) — pick any 3 of the 8 sleep stations', 6);
  sh.getRange(5, 6, 1, 6).setValues([[
    'AS (dropdown)', 'Mile (auto)', 'Duration', 'Notes', 'Past section', 'Upcoming section',
  ]])
    .setFontWeight('bold').setBackground('#F1F3F4');

  // Default values (Mile + Notes + Past + Upcoming get auto-filled by formulas)
  sh.getRange(6, 6, 3, 3).setValues([
    ['Camp Wamatochick',     null, 30],
    ['Sedona Posse Grounds', null, 60],
    ['Fort Tuthill',         null, 30],
  ]);

  // Dropdown validation: 8 sleep stations + "-none-" to disable a row
  const sleepASList = [
    '-none-',
    'Kamp Kipa', 'Camp Wamatochick', 'Whiskey Row', 'Mingus Mountain',
    'Dead Horse', 'Sedona Posse Grounds', 'Munds Park', 'Fort Tuthill',
  ];
  const sleepValidation = SpreadsheetApp.newDataValidation()
    .requireValueInList(sleepASList, true)
    .setAllowInvalid(false)
    .setHelpText('Pick a sleep station, or "-none-" to disable this row')
    .build();
  sh.getRange('F6:F8').setDataValidation(sleepValidation);

  // Auto-fill formulas: F=AS dropdown (input), G=mile, H=duration (input), I=notes, J=past, K=upcoming
  function mileFormula(row) {
    return '=IFERROR(IFS(' +
      'F' + row + '="Kamp Kipa",60.8,' +
      'F' + row + '="Camp Wamatochick",67.4,' +
      'F' + row + '="Whiskey Row",75.6,' +
      'F' + row + '="Mingus Mountain",107.2,' +
      'F' + row + '="Dead Horse",132.9,' +
      'F' + row + '="Sedona Posse Grounds",159.1,' +
      'F' + row + '="Munds Park",190.0,' +
      'F' + row + '="Fort Tuthill",211.0' +
      '),"")';
  }
  sh.getRange('G6').setFormula(mileFormula(6));
  sh.getRange('G7').setFormula(mileFormula(7));
  sh.getRange('G8').setFormula(mileFormula(8));

  function notesFormula(row) {
    return '=IFERROR(IFS(' +
      'F' + row + '="Kamp Kipa","Pre-100k; indoor heated; alternative to Camp Wamatochick",' +
      'F' + row + '="Camp Wamatochick","Post-100k first sleep candidate; indoor + shower",' +
      'F' + row + '="Whiskey Row","Indoor heated + medic; Grand Highland Hotel courtyard",' +
      'F' + row + '="Mingus Mountain","Top of mountain ~7,800ft; indoor + shower; pre-Verde Valley descent",' +
      'F' + row + '="Dead Horse","Verde Valley; OUTDOOR + shower; can be cold at night",' +
      'F' + row + '="Sedona Posse Grounds","Pre-Schnebly climb; indoor + medic + gear check",' +
      'F' + row + '="Munds Park","Coconino Plateau ~6,900ft; OUTDOOR; upper-30s°F at night",' +
      'F' + row + '="Fort Tuthill","Last indoor; CK drop bag arrives; mandatory medic check"' +
      '),"")';
  }
  sh.getRange('I6').setFormula(notesFormula(6));
  sh.getRange('I7').setFormula(notesFormula(7));
  sh.getRange('I8').setFormula(notesFormula(8));

  function pastFormula(row) {
    return '=IFERROR(IFS(' +
      'F' + row + '="Kamp Kipa","3mi steep climb to Mt Union ridge (+3,012ft); cold + dark",' +
      'F' + row + '="Camp Wamatochick","~1,000ft descent + confusing dirt road intersections",' +
      'F' + row + '="Whiskey Row","8mi gradual descent + 2.5mi pavement into Prescott",' +
      'F' + row + '="Mingus Mountain","Sustained climb (+2,862ft) to ~7,800ft summit",' +
      'F' + row + '="Dead Horse","Verde Valley descent + river wading; possibly hot",' +
      'F' + row + '="Sedona Posse Grounds","Gentle climb into Sedona basin; can be hot",' +
      'F' + row + '="Munds Park","Rolling Coconino Plateau; cold (upper-30s°F)",' +
      'F' + row + '="Fort Tuthill","8mi rolling rim toward Flagstaff"' +
      '),"")';
  }
  sh.getRange('J6').setFormula(pastFormula(6));
  sh.getRange('J7').setFormula(pastFormula(7));
  sh.getRange('J8').setFormula(pastFormula(8));

  function upcomingFormula(row) {
    return '=IFERROR(IFS(' +
      'F' + row + '="Kamp Kipa","6.6mi to Camp Wamatochick: ~1,000ft descent + dirt road nav",' +
      'F' + row + '="Camp Wamatochick","8.2mi to Whiskey Row: gradual descent + 2.5mi pavement",' +
      'F' + row + '="Whiskey Row","7.2mi to Watson Lake: flat sidewalk + riparian",' +
      'F' + row + '="Mingus Mountain","17mi descent to Jerome: -4,428ft technical + Verde heat",' +
      'F' + row + '="Dead Horse","14mi to Deer Pass: no-passing zone first 4mi, baby-head rocks",' +
      'F' + row + '="Sedona Posse Grounds","17mi to Schnebly: BIG climb (+3,580ft) on slickrock",' +
      'F' + row + '="Munds Park","12.7mi to Kelly Canyon: rolling rim, volcanic rock",' +
      'F' + row + '="Fort Tuthill","16.1mi to Walnut: rolling AZT + traffic crossings + nav"' +
      '),"")';
  }
  sh.getRange('K6').setFormula(upcomingFormula(6));
  sh.getRange('K7').setFormula(upcomingFormula(7));
  sh.getRange('K8').setFormula(upcomingFormula(8));

  // Coloring: F (dropdown) + H (duration) green editable; G/I/J/K auto-formula grey/italic
  sh.getRange('F6:F8').setBackground('#D9EAD3');
  sh.getRange('G6:G8').setBackground('#F1F3F4').setFontStyle('italic').setFontColor('#5F6368');
  sh.getRange('H6:H8').setBackground('#D9EAD3');
  sh.getRange('I6:I8').setBackground('#F1F3F4').setFontStyle('italic').setFontColor('#5F6368');
  sh.getRange('J6:J8').setBackground('#F1F3F4').setFontStyle('italic').setFontColor('#5F6368');
  sh.getRange('K6:K8').setBackground('#F1F3F4').setFontStyle('italic').setFontColor('#5F6368');

  // ── 4. TARGET FINISH TIMES (rows 14-19) ───────────────────
  header(14, 1, 'TARGET FINISH TIMES (h)', 3);
  sh.getRange(15, 1, 1, 3).setValues([['Band', 'Hours', 'TOD']])
    .setFontWeight('bold').setBackground('#F1F3F4');
  sh.getRange(16, 1, 4, 3).setValues([
    ['🟢 FAST',    55,  'Wed 12:00 PM'],
    ['🟡 A-GOAL',    69,  'Thu 2:00 AM'],
    ['🔴 B-GOAL',     100, 'Fri 9:00 AM'],
    ['⛔ CUTOFF', 125, 'Sat 10:00 AM (Aravaipa hard cutoff — race rule, NOT editable)'],
  ]);
  // FAST/A-GOAL/B-GOAL editable (green); CUTOFF fixed race rule (grey/italic)
  sh.getRange(16, 2, 3, 1).setBackground('#D9EAD3');
  sh.getRange(19, 2, 1, 1).setBackground('#F1F3F4').setFontStyle('italic').setFontColor('#5F6368');

  // ── 5. RACE START (rows 22-24) ────────────────────────────
  header(22, 1, 'RACE START', 3);
  sh.getRange(23, 1, 1, 3).setValues([['Field', 'Value', 'Notes']])
    .setFontWeight('bold').setBackground('#F1F3F4');
  // B24 = real Date object so Visual + recomputeData can read it. Editable (green).
  sh.getRange(24, 1, 1, 3).setValues([
    ['Race start datetime', new Date(2026, 4, 4, 5, 0), 'Mass start — edit as datetime (e.g. 5/4/2026 5:00:00)']
  ]);
  sh.getRange('B24').setNumberFormat('ddd mmm dd yyyy h:mm AM/PM').setBackground('#D9EAD3');

  // ── 6. SECTION DIFFICULTY MULTIPLIERS (cols F-I, rows 11-34) ──
  header(11, 6, 'SECTION DIFFICULTY MULTIPLIERS', 4);
  sh.getRange(12, 6, 1, 4).setValues([['Section', 'End Mile', 'Difficulty', 'Notes']])
    .setFontWeight('bold').setBackground('#F1F3F4');
  const sectionData = [
    ['Start → Cottonwood',       7.4,   1.00, 'Rolling start, cool dawn'],
    ['Cottonwood → Lane Mtn',    32.5,  1.55, 'KILLER 25mi: heat + exposure + loose rock'],
    ['Lane Mtn → Crown King',    36.6,  1.30, 'Short steep climb'],
    ['Crown King → Arrastra',    51.0,  0.92, 'Descent off CK ridge'],
    ['Arrastra → Kamp Kipa',     60.8,  1.00, 'Rolling, near Mt Union'],
    ['Kamp Kipa → Wamatochick',  67.4,  0.98, 'Rolling, downhill-ish'],
    ['Wamatochick → Whiskey',    75.6,  0.95, 'Downhill into Prescott'],
    ['Whiskey → Watson',         82.8,  0.92, 'Urban downhill'],
    ['Watson → Fain',            96.5,  1.10, 'Rolling-climb, exposure, A-frame ladders'],
    ['Fain → Mingus',            107.2, 1.45, 'MAJOR CLIMB to ~7,800 ft'],
    ['Mingus → Jerome',          124.2, 0.95, 'Big descent into Verde Valley (-4,400ft)'],
    ['Jerome → Dead Horse',      132.9, 0.98, 'Gentle descent, river crossing'],
    ['Dead Horse → Deer Pass',   146.9, 1.05, 'Rolling, no-passing zone'],
    ['Deer Pass → Sedona Posse', 159.1, 1.05, 'Gentle into Sedona basin'],
    ['Sedona Posse → Schnebly',  176.1, 1.55, 'BIG CLIMB +3,580ft, slickrock'],
    ['Schnebly → Munds',         190.0, 1.00, 'Coconino Plateau rolling'],
    ['Munds → Kelly',            202.7, 0.95, 'Easy rim'],
    ['Kelly → Fort Tuthill',     211.0, 0.92, 'Easy descent toward Flagstaff'],
    ['Fort Tuthill → Walnut',    227.1, 1.00, 'Rolling rim'],
    ['Walnut → Wildcat',         234.1, 1.00, 'Rolling'],
    ['Wildcat → Trinity',        249.4, 1.00, 'Mt Elden up-then-down (rollercoaster)'],
    ['Trinity → Finish',         253.3, 0.92, 'Urban descent into Flagstaff'],
  ];
  // Section difficulty data starts at row 13 in cols F-I
  sh.getRange(13, 6, sectionData.length, 4).setValues(sectionData);
  // Difficulty (col H = 8) editable → green
  sh.getRange(13, 8, sectionData.length, 1).setBackground('#D9EAD3');
  // End Mile (col G = 7) display-only race-rule data → grey/italic
  sh.getRange(13, 7, sectionData.length, 1)
    .setBackground('#F1F3F4').setFontStyle('italic').setFontColor('#5F6368');

  // ── 7. AS DWELL TYPE MAP (cols F-I, rows 37-60) ──────────
  const dwellMapStart = 37;
  header(dwellMapStart, 6, 'AS DWELL TYPE MAP — set the dwell category for each AS', 4);
  sh.getRange(dwellMapStart + 1, 6, 1, 4).setValues([['AS', 'Mile', 'Dwell type', 'Notes']])
    .setFontWeight('bold').setBackground('#F1F3F4');

  const asDwellTypeData = [
    ['Cottonwood Creek',     7.4,   'pass-through', ''],
    ['Lane Mtn',             32.5,  'pass-through', ''],
    ['Crown King',           36.6,  'drop bag',     'Drop bag also rolls forward to Fort Tuthill'],
    ['Arrastra Creek',       51.0,  'pass-through', ''],
    ['Kamp Kipa',            60.8,  'drop bag',     'Sleep station available'],
    ['Camp Wamatochick',     67.4,  'drop bag',     'Sleep station + shower available'],
    ['Whiskey Row',          75.6,  'drop bag',     'Sleep station available'],
    ['Watson Lake',          82.8,  'pass-through', ''],
    ['Fain Ranch',           96.5,  'drop bag',     ''],
    ['Mingus Mountain',      107.2, 'drop bag',     'Sleep station + shower available'],
    ['Jerome',               124.2, 'pass-through', ''],
    ['Dead Horse',           132.9, 'drop bag',     'Sleep station + shower available'],
    ['Deer Pass',            146.9, 'drop bag',     ''],
    ['Sedona Posse Grounds', 159.1, 'drop bag',     'Sleep station available'],
    ['Schnebly Hill',        176.1, 'drop bag',     ''],
    ['Munds Park',           190.0, 'drop bag',     'Sleep station available'],
    ['Kelly Canyon',         202.7, 'pass-through', ''],
    ['Fort Tuthill',         211.0, 'drop bag',     'Mandatory medic check + extra dwell time'],
    ['Walnut Canyon',        227.1, 'drop bag',     ''],
    ['Wildcat Hill',         234.1, 'drop bag',     ''],
    ['Trinity Heights',      249.4, 'pass-through', ''],
    ['FINISH Heritage Sq',   253.3, 'finish',       'No dwell — race over'],
  ];
  const dwellMapDataStart = dwellMapStart + 2;  // row 39
  sh.getRange(dwellMapDataStart, 6, asDwellTypeData.length, 4).setValues(asDwellTypeData);

  // Dropdown validation for the Dwell type column (col H = 8)
  const dwellTypeValidation = SpreadsheetApp.newDataValidation()
    .requireValueInList(['drop bag', 'pass-through', 'finish'], true)
    .setAllowInvalid(false)
    .setHelpText('Pick: drop bag, pass-through, or finish')
    .build();
  sh.getRange(dwellMapDataStart, 8, asDwellTypeData.length, 1).setDataValidation(dwellTypeValidation);
  // Editable type col (H) green; AS name (F) default; mile (G) display-only grey
  sh.getRange(dwellMapDataStart, 8, asDwellTypeData.length, 1).setBackground('#D9EAD3');
  sh.getRange(dwellMapDataStart, 7, asDwellTypeData.length, 1)
    .setBackground('#F1F3F4').setFontStyle('italic').setFontColor('#5F6368');

  // ── Footer note ───────────────────────────────────────────
  const footRow = dwellMapDataStart + asDwellTypeData.length + 2;  // row 63
  sh.getRange(footRow, 1, 1, 11).merge()
    .setValue('🟢 Green cells = editable. After editing, toggle the H1 checkbox (or run "Build All" from the menu) to apply changes.')
    .setFontStyle('italic').setBackground('#FEF7E0').setHorizontalAlignment('center');

  // ── Sizing ─────────────────────────────────────────────────
  // Left side (small reference tables): cols A-D
  sh.setColumnWidth(1, 240);   // A: stop type / band labels
  sh.setColumnWidth(2, 90);    // B: numeric values
  sh.setColumnWidth(3, 90);    // C: notes / TOD
  sh.setColumnWidth(4, 280);   // D: long notes
  sh.setColumnWidth(5, 30);    // E: gap between left and right
  // Right side (big config tables): cols F-K
  sh.setColumnWidth(6, 240);   // F: AS name / Section name
  sh.setColumnWidth(7, 90);    // G: mile
  sh.setColumnWidth(8, 100);   // H: duration / difficulty / dwell-type dropdown
  sh.setColumnWidth(9, 280);   // I: notes (right side)
  sh.setColumnWidth(10, 280);  // J: past section (sleep only)
  sh.setColumnWidth(11, 280);  // K: upcoming section (sleep only)
  sh.setFrozenRows(2);  // freeze through row 2 — the run-button merged cell spans rows 1–2

  ss.setActiveSheet(sh);
  Logger.log('Variables tab built.');
}


// ────────────────────────────────────────────────────────────────────────────
// Read the Variables tab — returns {basePace, dwell, sleep, sections} or null
// if the tab doesn't exist (caller falls back to hardcoded defaults).
// ────────────────────────────────────────────────────────────────────────────

// Read race start datetime from Variables!B24. Falls back to Mon 04-May-2026 05:00 AM
// if the cell is empty, malformed, or the Variables tab doesn't exist.
function readRaceStart() {
  const DEFAULT = new Date(2026, 4, 4, 5, 0);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(VARIABLES_TAB_NAME);
  if (!sh) return DEFAULT;
  const v = sh.getRange('B24').getValue();
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  // Tolerate a string fallback (legacy "Mon 04-May-2026 05:00 AM")
  if (typeof v === 'string' && v) {
    const parsed = new Date(v);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return DEFAULT;
}


function readModelVariables() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(VARIABLES_TAB_NAME);
  if (!sh) return null;

  // Base paces: B3:B5
  const basePace = {
    fast: Number(sh.getRange('B3').getValue()),
    slow: Number(sh.getRange('B4').getValue()),
    red:  Number(sh.getRange('B5').getValue()),
  };

  // Dwell: B9:D11
  const dwellVals = sh.getRange(9, 2, 3, 3).getValues();
  const dwell = {
    dropBag:    {fast: dwellVals[0][0], slow: dwellVals[0][1], red: dwellVals[0][2]},
    passthru:   {fast: dwellVals[1][0], slow: dwellVals[1][1], red: dwellVals[1][2]},
    medicExtra: {fast: dwellVals[2][0], slow: dwellVals[2][1], red: dwellVals[2][2]},
  };

  // Sleep: rows 6-8, cols F=name, G=mile (auto-formula), H=duration
  // Returns array of {name, mile, duration} for active rows.
  // Rows with "-none-" or empty name/mile/duration are filtered out.
  const sleepVals = sh.getRange(6, 6, 3, 3).getValues();
  const sleep = sleepVals
    .filter(function(r) {
      return r[0] && r[0] !== '-none-' && r[1] && Number(r[2]) > 0;
    })
    .map(function(r) { return {name: String(r[0]), mile: Number(r[1]), duration: Number(r[2])}; });

  // Sections: rows 13-34, cols F=name, G=end_mile, H=difficulty
  const sectionVals = sh.getRange(13, 6, 22, 3).getValues();
  const sections = sectionVals
    .filter(function(r) { return r[0]; })
    .map(function(r) { return [String(r[0]), Number(r[1]), Number(r[2])]; });

  // AS dwell type map: rows 39-60, cols F=name, G=mile, H=type
  const dwellMapVals = sh.getRange(39, 6, 22, 3).getValues();
  const asDwellMap = {};   // keyed by mile (string with 1 decimal) → type string
  dwellMapVals.forEach(function(r) {
    if (r[0] && r[1]) asDwellMap[Number(r[1]).toFixed(1)] = String(r[2]);
  });

  return {basePace: basePace, dwell: dwell, sleep: sleep, sections: sections, asDwellMap: asDwellMap};
}


// ════════════════════════════════════════════════════════════════════════════
// recomputeData() — runs the pacing model from Variables and writes per-AS
// arrival TODs back to the data sheet (first tab). After running this, the
// Visual tab can be rebuilt and will reflect the updated times.
// ════════════════════════════════════════════════════════════════════════════

function recomputeData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const vars = readModelVariables();
  if (!vars) {
    throw new Error('Variables tab not found. Run buildModelVariables() first.');
  }

  const varsSheet = ss.getSheetByName(VARIABLES_TAB_NAME);

  // Target finish times: B16:B18 (FAST, A-GOAL, B-GOAL) in hours
  const targetVals = varsSheet.getRange(16, 2, 3, 1).getValues();
  const targets = {
    fast: Number(targetVals[0][0]),
    slow: Number(targetVals[1][0]),
    red:  Number(targetVals[2][0]),
  };

  // Race start: read from Variables!B24 (editable). Falls back to Mon 04-May-2026 05:00.
  const raceStart = readRaceStart();

  // Sections: convert Variables [name, end_mile, difficulty] to [name, dist, end_mile, diff]
  const sections = [];
  let prev = 0;
  vars.sections.forEach(function(s) {
    sections.push({name: s[0], dist: s[1] - prev, endMile: s[1], diff: s[2]});
    prev = s[1];
  });

  // AS classification: dwell type comes from the AS DWELL TYPE MAP in Variables tab.
  // Sleep durations are dynamic — taken from vars.sleep array (user picks any 3 of 8).
  function dwellAt(endMile, band) {
    const key = endMile.toFixed(1);
    const type = vars.asDwellMap ? vars.asDwellMap[key] : null;

    if (type === 'finish') return 0;

    // Base dwell from type (default to drop bag if missing/unknown)
    let total;
    if (type === 'pass-through')      total = vars.dwell.passthru[band];
    else                              total = vars.dwell.dropBag[band];

    // Sleep: check if this AS is one of the user's chosen sleep stops
    for (let i = 0; i < vars.sleep.length; i++) {
      if (Math.abs(endMile - vars.sleep[i].mile) < 0.05) {
        total += vars.sleep[i].duration;
        break;
      }
    }

    // Mandatory medic extra: Fort Tuthill always (race-rule, not dwell-type-driven)
    if (Math.abs(endMile - 211.0) < 0.05) total += vars.dwell.medicExtra[band];

    return total;
  }

  // ── Run the model for each band ─────────────────────────────
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  function fmtTOD(ms) {
    const dt = new Date(ms);
    let hr = dt.getHours();
    const mn = dt.getMinutes();
    const ampm = hr >= 12 ? 'PM' : 'AM';
    if (hr === 0) hr = 12; else if (hr > 12) hr -= 12;
    return dayNames[dt.getDay()] + ' ' + hr + ':' + (mn < 10 ? '0' + mn : mn) + ' ' + ampm;
  }

  const results = {};
  ['fast', 'slow', 'red'].forEach(function(band) {
    // Compute base pace such that total = target
    let nonMovingMin = 0;
    sections.forEach(function(s) { nonMovingMin += dwellAt(s.endMile, band); });
    const targetMin = targets[band] * 60;
    const movingBudget = targetMin - nonMovingMin;

    let weightedDist = 0;
    sections.forEach(function(s) { weightedDist += s.dist * s.diff; });
    const basePace = movingBudget / weightedDist;

    // Walk through, accumulating
    let cumMin = 0;
    const arrivals = [];
    sections.forEach(function(s) {
      cumMin += s.dist * s.diff * basePace;
      arrivals.push({
        endMile: s.endMile,
        arriveMs: raceStart.getTime() + cumMin * 60000,
        arriveH: cumMin / 60,
      });
      cumMin += dwellAt(s.endMile, band);
    });

    results[band] = {arrivals: arrivals, basePace: basePace};
  });

  // ── Write computed base paces back to Variables tab (cells B3:B5) ──
  varsSheet.getRange(3, 2, 3, 1).setValues([
    [Number(results.fast.basePace.toFixed(2))],
    [Number(results.slow.basePace.toFixed(2))],
    [Number(results.red.basePace.toFixed(2))],
  ]);

  // ── Write arrival TODs to the data sheet ────────────────────
  const dataSheet = ss.getSheets()[0];
  const lastRow = dataSheet.getLastRow();
  const numAS = lastRow - 1;
  const existingMiles = dataSheet.getRange(2, 2, numAS, 1).getValues();

  // Build arrival lookup by endMile
  const arrByMile = {};
  results.fast.arrivals.forEach(function(a, i) {
    arrByMile[a.endMile.toFixed(1)] = {
      fast: a,
      slow: results.slow.arrivals[i],
      red:  results.red.arrivals[i],
    };
  });

  let updated = 0;
  for (let r = 0; r < numAS; r++) {
    const mile = Number(existingMiles[r][0]);
    if (mile === 0) continue;  // skip Start row (preserve existing 0.0 values)
    const key = mile.toFixed(1);
    const a = arrByMile[key];
    if (!a) continue;

    const fastH = a.fast.arriveH;
    const slowH = a.slow.arriveH;
    const redH  = a.red.arriveH;
    const midH = (fastH + slowH) / 2;
    const bandHeight = slowH - fastH;
    const dataRow = r + 2;

    // Cols E-M: FAST TOD, FAST h, A-GOAL TOD, SLOW h, B-GOAL TOD, RED h, MID h, BAND base, BAND height
    dataSheet.getRange(dataRow, 5, 1, 9).setValues([[
      fmtTOD(a.fast.arriveMs), Number(fastH.toFixed(2)),
      fmtTOD(a.slow.arriveMs), Number(slowH.toFixed(2)),
      fmtTOD(a.red.arriveMs),  Number(redH.toFixed(2)),
      Number(midH.toFixed(2)),
      Number(fastH.toFixed(2)),
      Number(bandHeight.toFixed(2)),
    ]]);
    updated++;
  }

  Logger.log('Data sheet recomputed: ' + updated + ' rows updated. ' +
             'Base paces: FAST=' + results.fast.basePace.toFixed(2) +
             ', A-GOAL=' + results.slow.basePace.toFixed(2) +
             ', B-GOAL='  + results.red.basePace.toFixed(2) + ' min/mi.');
}


// ════════════════════════════════════════════════════════════════════════════
// formatDataSheet() — formats the first tab (raw pacing data) with:
//   - Renamed band headers (FAST / A-GOAL / B-GOAL)
//   - Color-coded columns by band (FAST=green, A-GOAL=yellow, B-GOAL=red, cutoff=grey)
//   - Bold AS names, right-aligned numbers, centered TODs
//   - Frozen header row + AS-name column, thick finish-row border, table border
// ════════════════════════════════════════════════════════════════════════════

function formatDataSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheets()[0];
  const lastRow = sheet.getLastRow();
  const lastCol = 13;

  // Updated headers (rename SLOW → A-GOAL, RED → B-GOAL)
  const newHeaders = [
    'AS Name', 'Mile', 'Cutoff TOD', 'Cutoff (h)',
    'FAST TOD', 'FAST (h)', 'A-GOAL TOD', 'A-GOAL (h)',
    'B-GOAL TOD', 'B-GOAL (h)', 'MID (h)', 'BAND base', 'BAND height',
  ];
  sheet.getRange(1, 1, 1, newHeaders.length).setValues([newHeaders]);

  // Header row styling
  sheet.getRange(1, 1, 1, lastCol)
    .setFontWeight('bold')
    .setBackground('#202124').setFontColor('#FFFFFF')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setRowHeight(1, 32);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);  // freeze AS Name + Mile

  // Column widths
  sheet.setColumnWidth(1, 220);  // AS Name
  sheet.setColumnWidth(2, 60);   // Mile
  sheet.setColumnWidth(3, 135);  // Cutoff TOD
  sheet.setColumnWidth(4, 80);   // Cutoff (h)
  sheet.setColumnWidth(5, 135);  // FAST TOD
  sheet.setColumnWidth(6, 75);   // FAST (h)
  sheet.setColumnWidth(7, 135);  // A-GOAL TOD
  sheet.setColumnWidth(8, 85);   // A-GOAL (h)
  sheet.setColumnWidth(9, 135);  // B-GOAL TOD
  sheet.setColumnWidth(10, 85);  // B-GOAL (h)
  sheet.setColumnWidth(11, 75);  // MID (h)
  sheet.setColumnWidth(12, 90);  // BAND base
  sheet.setColumnWidth(13, 90);  // BAND height

  const dataRows = lastRow - 1;
  if (dataRows > 0) {
    // Color-code by band (data rows only)
    sheet.getRange(2, 3,  dataRows, 2).setBackground('#F1F3F4');     // Cutoff: grey
    sheet.getRange(2, 5,  dataRows, 2).setBackground('#D9EAD3');     // FAST: green
    sheet.getRange(2, 7,  dataRows, 2).setBackground('#FFF2CC');     // A-GOAL: yellow
    sheet.getRange(2, 9,  dataRows, 2).setBackground('#F4CCCC');     // B-GOAL: red
    sheet.getRange(2, 11, dataRows, 3)                                // MID + BAND helpers: pale
      .setBackground('#FAFAFA').setFontStyle('italic').setFontColor('#5F6368');

    // Bold AS Name column
    sheet.getRange(2, 1, dataRows, 1).setFontWeight('bold');

    // Numeric columns: right-aligned, 1–2 decimal places
    sheet.getRange(2, 2,  dataRows, 1).setHorizontalAlignment('right').setNumberFormat('0.0');
    sheet.getRange(2, 4,  dataRows, 1).setHorizontalAlignment('right').setNumberFormat('0.00');
    sheet.getRange(2, 6,  dataRows, 1).setHorizontalAlignment('right').setNumberFormat('0.00');
    sheet.getRange(2, 8,  dataRows, 1).setHorizontalAlignment('right').setNumberFormat('0.00');
    sheet.getRange(2, 10, dataRows, 1).setHorizontalAlignment('right').setNumberFormat('0.00');
    sheet.getRange(2, 11, dataRows, 3).setHorizontalAlignment('right').setNumberFormat('0.00');

    // TOD columns: centered
    sheet.getRange(2, 3, dataRows, 1).setHorizontalAlignment('center');
    sheet.getRange(2, 5, dataRows, 1).setHorizontalAlignment('center');
    sheet.getRange(2, 7, dataRows, 1).setHorizontalAlignment('center');
    sheet.getRange(2, 9, dataRows, 1).setHorizontalAlignment('center');

    // FINISH row: thick top border + bolder text
    sheet.getRange(lastRow, 1, 1, lastCol)
      .setFontWeight('bold')
      .setBorder(true, null, null, null, null, null,
                 '#202124', SpreadsheetApp.BorderStyle.SOLID_THICK);
  }

  // Outer table border
  sheet.getRange(1, 1, lastRow, lastCol).setBorder(
    true, true, true, true, true, true,
    '#DADCE0', SpreadsheetApp.BorderStyle.SOLID
  );

  Logger.log('Data sheet formatted: headers renamed, color-coded by band.');
}


// ════════════════════════════════════════════════════════════════════════════
// Build everything in one shot
// ════════════════════════════════════════════════════════════════════════════

function buildAll() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // Only seed Variables tab if it doesn't exist yet — never overwrite user edits.
  // To explicitly wipe + reset Variables, use the menu's "Reset Variables Tab" item.
  if (!ss.getSheetByName(VARIABLES_TAB_NAME)) {
    buildModelVariables();
  }
  recomputeData();        // reads Variables, writes data sheet TODs
  formatDataSheet();      // renames headers + applies styling
  buildVisualGrid();      // rebuilds Visual tab from (now-formatted) data sheet
  buildPaceBreakdown();   // rebuilds Pace Breakdown from Variables
  // Seed Gear Checklist only if it doesn't exist (user-edited checkboxes preserved).
  if (!ss.getSheetByName(GEAR_TAB_NAME)) {
    buildGearChecklist();
  }
}


// ════════════════════════════════════════════════════════════════════════════
// buildGearChecklist() — builds the "Gear Checklist" tab.
//
// ⚠️ MANUAL-ONLY TAB. This script ONLY seeds the structure (item list,
// categories, dropdown, formatting). Jason fills in the checkboxes and the
// Drop Bag AS column himself as he physically packs. The Category column
// tells you what the requirement is; the checkboxes track what is actually
// already packed. Never auto-check or auto-assign anything in this tab.
//
// To protect manual edits:
//   • buildAll() seeds this tab ONLY when it doesn't already exist.
//   • Re-running buildGearChecklist() WIPES the entire tab — only invoke when
//     the user explicitly opts in via the destructive menu item.
//
// Columns:
//   A: Item              (gear name — duplicate row across AS uses the SAME name)
//   B: Category          (Required / Cold Weather / Vest / Fueling / etc.)
//   C: Qty (this row)    (count for THIS allocation, not the global total)
//   D: Initial Pack ☐    (going to AZ — packed in suitcase/duffel)
//   E: Race Day Carry ☐  (on person / in vest at start)
//   F: Drop Bag ☐        (packed into a drop bag)
//   G: Drop Bag AS       (dropdown: which AS — autopopulated from drop bag list)
//   H: Notes
//   I: Item Total        (auto SUMIF: total qty across all rows w/ same Item name)
//
// Multi-bag splits (Approach A — one row per AS allocation):
//   • Same item across multiple drop bags? Duplicate the row in-place, keep
//     the EXACT same Item name in column A, set Qty (C) to the per-row count,
//     pick the AS in column G, tick Drop Bag (F).
//   • Example: 12 LiquidIV split → 3 rows, all named "LiquidIV":
//       LiquidIV / 6 / Crown King
//       LiquidIV / 4 / Mingus
//       LiquidIV / 2 / Sedona Posse
//   • Column I "Item Total" SUMIFs across rows with the same Item name — scan
//     it to verify total allocation matches your target.
//   • Sort or filter by Drop Bag AS (G) for per-bag views; the right-hand
//     "DROP BAG ALLOCATION" block tallies items + qty per AS.
// ════════════════════════════════════════════════════════════════════════════

const GEAR_TAB_NAME = 'Gear Checklist';

// Drop bag AS list (mile-ordered) — used for the Drop Bag AS dropdown.
// "(none)" = leave blank; "Start (direct-to-finish)" = bag goes from start to finish line.
const DROP_BAG_STATIONS = [
  '(none)',
  'Start (direct-to-finish)',
  'Crown King M36.6',
  'Kamp Kipa M60.8',
  'Camp Wamatochick M67.4',
  'Whiskey Row M75.6',
  'Fain Ranch M96.5',
  'Mingus Mountain M107.2',
  'Dead Horse M132.9',
  'Deer Pass M146.9',
  'Sedona Posse M159.1',
  'Schnebly Hill M176.1',
  'Munds Park M190.0',
  'Fort Tuthill M211.0 (CK bag rolls here)',
  'Walnut Canyon M227.1',
  'Wildcat Hill M234.1',
];

function buildGearChecklist() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const old = ss.getSheetByName(GEAR_TAB_NAME);
  if (old) ss.deleteSheet(old);
  const sh = ss.insertSheet(GEAR_TAB_NAME, 4);

  // ── Header ──────────────────────────────────────────────
  const headers = [
    'Item', 'Category', 'Qty (this row)',
    'Initial Pack (→AZ)', 'Race Day Carry', 'Drop Bag',
    'Drop Bag AS', 'Notes', 'Item Total',
  ];
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#202124').setFontColor('#FFFFFF')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeight(1, 38);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);

  // Tooltip on the Item header explaining the row-duplication convention.
  sh.getRange(1, 1).setNote(
    'Multi-AS items: duplicate the row, keep the EXACT same Item name here. ' +
    'Set Qty (col C) to THIS row\'s allocation. Set Drop Bag AS in col G.\n\n' +
    'Column I "Item Total" auto-sums all rows with the same Item name so you ' +
    'can verify total allocation matches your target.\n\n' +
    'Tip: sort or filter by Drop Bag AS (col G) to see what\'s in each bag. ' +
    'The right-hand DROP BAG ALLOCATION block also tallies per AS.'
  );

  // Column widths
  sh.setColumnWidth(1, 280);  // A: Item
  sh.setColumnWidth(2, 130);  // B: Category
  sh.setColumnWidth(3, 80);   // C: Qty (this row)
  sh.setColumnWidth(4, 140);  // D: Initial Pack
  sh.setColumnWidth(5, 130);  // E: Race Day Carry
  sh.setColumnWidth(6, 100);  // F: Drop Bag
  sh.setColumnWidth(7, 240);  // G: Drop Bag AS
  sh.setColumnWidth(8, 360);  // H: Notes
  sh.setColumnWidth(9, 90);   // I: Item Total (SUMIF)

  // ── Default gear inventory ──────────────────────────────
  // [item, category, qty, initial, raceDay, dropBag, dropBagAS, notes]
  //
  // ⚠️ MANUAL-ONLY CHECKLIST. The Category column tells you WHAT THE ITEM IS;
  // the checkbox columns are filled in BY HAND once Jason has actually packed
  // the item. ALL CHECKBOXES SEED FALSE. Drop Bag AS seeds to '(none)'.
  // Never auto-check or auto-assign. The user updates this manually as they
  // physically pack their kit.
  const rows = [
    // ── REQUIRED GEAR (mandatory, on person, entire course) ──
    ['Cell Phone',                       'Required',     1, false, false, false, '(none)', 'On person — entire course'],
    ['GPS device w/ course loaded',      'Required',     1, false, false, false, '(none)', 'Smartphone in airplane mode counts'],
    ['Headlamp',                         'Required',     1, false, false, false, '(none)', 'Plus extra batteries / charger'],
    ['Headlamp spare batteries',         'Required',     2, false, false, false, '(none)', ''],
    ['Backup headlamp',                  'Required',     1, false, false, false, '(none)', 'Optional redundancy in a drop bag'],
    ['Collapsible cup',                  'Required',     1, false, false, false, '(none)', 'For hot drinks at AS'],
    ['Space blanket',                    'Required',     1, false, false, false, '(none)', ''],
    ['Whistle',                          'Required',     1, false, false, false, '(none)', ''],
    ['Bib + safety pins/belt',           'Required',     1, false, false, false, '(none)', 'Pickup race-eve at DCR'],

    // ── COLD WEATHER GEAR (mandatory leaving CK + listed gear-check stations) ──
    ['Gloves',                           'Cold Weather', 1, false, false, false, '(none)', 'On person from CK forward'],
    ['Warm hat / neck gaiter',           'Cold Weather', 1, false, false, false, '(none)', 'On person from CK forward'],
    ['Long sleeve top',                  'Cold Weather', 1, false, false, false, '(none)', 'On person from CK forward'],
    ['Insulatory upper layer (puffy)',   'Cold Weather', 1, false, false, false, '(none)', 'On person from CK forward'],
    ['Waterproof jacket w/ hood',        'Cold Weather', 1, false, false, false, '(none)', 'Required if rain/snow forecast'],

    // ── VEST / HYDRATION ──
    ['Race vest',                        'Vest',         1, false, false, false, '(none)', '7-flask vest, 4.92 L total cap'],
    ['Soft flask 800 mL — Front R',      'Vest',         1, false, false, false, '(none)', 'Personal mix flask'],
    ['Soft flask 800 mL — Front L',      'Vest',         1, false, false, false, '(none)', 'Water'],
    ['Soft flask 360 mL — Side R',       'Vest',         1, false, false, false, '(none)', 'Spare water'],
    ['Soft flask 360 mL — Side L',       'Vest',         1, false, false, false, '(none)', 'Spare water'],
    ['Bite-valve flask 1 L — Back C',    'Vest',         1, false, false, false, '(none)', 'Coconut water leg 1, then water'],
    ['Soft flask 800 mL — Back R',       'Vest',         1, false, false, false, '(none)', 'Personal mix flask'],
    ['Soft flask 800 mL — Back L',       'Vest',         1, false, false, false, '(none)', 'Water'],

    // ── FUELING ──
    ['Neversecond C30 gels (no caf)',    'Fueling',      0, false, false, false, '(none)', 'Pocket fuel start → Cottonwood'],
    ['Neversecond C30 gels (no caf) — bulk','Fueling',   0, false, false, false, '(none)', 'Drop bag restock'],
    ['Neversecond C30 gels (caf)',       'Fueling',      0, false, false, false, '(none)', 'Caffeine post-CK only'],
    ['LiquidIV packets',                 'Fueling',      0, false, false, false, '(none)', 'On-person + in pocket'],
    ['LiquidIV packets — bulk',          'Fueling',      0, false, false, false, '(none)', 'Drop bag restock'],
    ['Salt caps (SaltStick 215 mg)',     'Fueling',      0, false, false, false, '(none)', 'Vest pocket'],
    ['Salt caps (SaltStick 215 mg) — bulk','Fueling',    0, false, false, false, '(none)', 'Drop bag restock'],
    ['Personal mix powder (50g/serving)','Fueling',      0, false, false, false, '(none)', 'Drop bag restock'],
    ['Coconut water (canned 800 mL)',    'Fueling',      0, false, false, false, '(none)', 'Pre-sleep recovery sip'],
    ['Personal meal replacement',        'Fueling',      0, false, false, false, '(none)', 'Sleep stop fueling'],

    // ── APPAREL ──
    ['Race shoes (start)',               'Apparel',      1, false, false, false, '(none)', 'Trained-in pair'],
    ['Spare shoes',                      'Apparel',      0, false, false, false, '(none)', 'Optional swap pre-Verde descent'],
    ['Spare shoes (size up if swelling)','Apparel',      0, false, false, false, '(none)', 'Late-race feet swell ½–1 size'],
    ['Socks (start pair)',               'Apparel',      1, false, false, false, '(none)', 'On feet'],
    ['Spare socks',                      'Apparel',      0, false, false, false, '(none)', '1 pair per major bag — distribute'],
    ['Shorts (start)',                   'Apparel',      1, false, false, false, '(none)', 'On body'],
    ['Spare shorts',                     'Apparel',      0, false, false, false, '(none)', 'Fresh kit at sleep stops'],
    ['Shirt (start, sun)',               'Apparel',      1, false, false, false, '(none)', 'Light, sun-coverage'],
    ['Spare shirts',                     'Apparel',      0, false, false, false, '(none)', 'Fresh kit at sleep stops'],
    ['Sun hat',                          'Apparel',      1, false, false, false, '(none)', 'On head'],
    ['Sunglasses',                       'Apparel',      1, false, false, false, '(none)', 'On face'],
    ['Sun sleeves',                      'Apparel',      1, false, false, false, '(none)', 'On arms'],
    ['Sunscreen',                        'Apparel',      1, false, false, false, '(none)', 'In vest pocket'],
    ['Sunscreen restock',                'Apparel',      0, false, false, false, '(none)', 'Drop bag restock'],
    ['Buff / neck cooler',               'Apparel',      1, false, false, false, '(none)', 'Doubles as cold-weather neck gaiter'],

    // ── FOOT CARE ──
    ['Lube (Squirrel\'s Nut Butter)',    'Foot Care',    1, false, false, false, '(none)', 'Pre-race + reapply at every sleep stop'],
    ['Lube restock',                     'Foot Care',    0, false, false, false, '(none)', 'Drop bag restock'],
    ['Leukotape',                        'Foot Care',    1, false, false, false, '(none)', 'Pre-cut strips'],
    ['Leukotape restock',                'Foot Care',    0, false, false, false, '(none)', 'Drop bag restock'],
    ['Foot powder',                      'Foot Care',    0, false, false, false, '(none)', 'One per sleep stop'],
    ['Blister kit',                      'Foot Care',    0, false, false, false, '(none)', 'Drop bag restock'],

    // ── SLEEP KIT ──
    ['Eye mask',                         'Sleep Kit',    0, false, false, false, '(none)', 'One per planned sleep stop'],
    ['Earplugs',                         'Sleep Kit',    0, false, false, false, '(none)', 'One per planned sleep stop'],
    ['Backup alarm watch',               'Sleep Kit',    1, false, false, false, '(none)', 'Second alarm independent of phone'],

    // ── HEAT MANAGEMENT ──
    ['Bandana (ice)',                    'Heat',         1, false, false, false, '(none)', 'Soak in ice water at AS'],
    ['Bandana (ice) restock',            'Heat',         0, false, false, false, '(none)', 'Drop bag restock'],
    ['Cooling towel',                    'Heat',         0, false, false, false, '(none)', 'Drop bag restock'],

    // ── MEDICAL / FIRST AID ──
    ['Anti-chafe tape (extra)',          'Medical',      0, false, false, false, '(none)', ''],
    ['Tums / GI rescue',                 'Medical',      0, false, false, false, '(none)', 'Vest pocket'],
    ['Imodium',                          'Medical',      0, false, false, false, '(none)', 'Vest pocket'],
    ['NSAID (Tylenol — NOT ibuprofen)',  'Medical',      0, false, false, false, '(none)', 'Use sparingly; ibuprofen risks kidney issues'],
    ['Caffeine pills (100 mg)',          'Medical',      0, false, false, false, '(none)', 'Sleep monsters fallback'],

    // ── DOCS / PRINTOUTS ──
    ['Race brief (printed, laminated)',  'Docs',         0, false, false, false, '(none)', 'Phone + 1 in every drop bag'],
    ['Failure cards (laminated set)',    'Docs',         0, false, false, false, '(none)', 'Distribute per failure-card map'],
    ['AS atlas pages (printed)',         'Docs',         0, false, false, false, '(none)', 'One per AS — drop bag insert'],
    ['Cash + ID',                        'Docs',         1, false, false, false, '(none)', 'Vest pocket — Watson Lake $5 entry'],

    // ── CHARGING / ELECTRONICS ──
    ['Battery pack (10,000 mAh)',        'Electronics',  1, false, false, false, '(none)', 'Vest — keep phone alive'],
    ['Phone cable (USB-C)',              'Electronics',  0, false, false, false, '(none)', ''],
    ['Watch charger',                    'Electronics',  1, false, false, false, '(none)', 'Charge during sleep stops'],

    // ── TRAVEL / LOGISTICS (going to AZ) ──
    ['Suitcase / duffel',                'Travel',       1, false, false, false, '(none)', 'AZ trip'],
    ['Drop bag containers (15)',         'Travel',      15, false, false, false, '(none)', 'Labeled with bib + AS name'],
    ['Sharpie + label tape',             'Travel',       1, false, false, false, '(none)', 'For drop bag labeling at DCR'],
    ['Race-eve outfit',                  'Travel',       1, false, false, false, '(none)', 'Sun 03-May at DCR'],
    ['Post-race recovery clothes',       'Travel',       1, false, false, false, '(none)', 'Bag stays at finish/hotel'],
    ['Toiletries (race-eve)',            'Travel',       1, false, false, false, '(none)', ''],
  ];

  const numRows = rows.length;
  sh.getRange(2, 1, numRows, 8).setValues(rows);

  // ── Item Total (col I): SUMIF across rows with same Item name ──────
  // Full-column refs so duplicated rows are picked up automatically without
  // needing to widen the formula range.
  const itemTotalFormulas = [];
  for (let r = 0; r < numRows; r++) {
    itemTotalFormulas.push([
      '=IF($A' + (r + 2) + '="","",SUMIF($A:$A,$A' + (r + 2) + ',$C:$C))'
    ]);
  }
  sh.getRange(2, 9, numRows, 1).setFormulas(itemTotalFormulas);

  // ── Checkbox validation on D, E, F ─────────────────────
  const checkboxRule = SpreadsheetApp.newDataValidation()
    .requireCheckbox()
    .build();
  sh.getRange(2, 4, numRows, 3).setDataValidation(checkboxRule);

  // ── Drop Bag AS dropdown on G ──────────────────────────
  const asRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(DROP_BAG_STATIONS, true)
    .setAllowInvalid(false)
    .build();
  sh.getRange(2, 7, numRows, 1).setDataValidation(asRule);

  // ── Per-row formatting ─────────────────────────────────
  sh.getRange(2, 1, numRows, 9).setVerticalAlignment('middle');
  sh.getRange(2, 1, numRows, 1).setFontWeight('bold');
  sh.getRange(2, 2, numRows, 1).setHorizontalAlignment('center')
    .setFontStyle('italic').setFontColor('#5F6368');
  sh.getRange(2, 3, numRows, 1).setHorizontalAlignment('center');
  sh.getRange(2, 4, numRows, 3).setHorizontalAlignment('center');
  sh.getRange(2, 8, numRows, 1).setFontColor('#5F6368').setFontStyle('italic')
    .setWrap(true);
  // Item Total column: visually distinct (computed, not editable in spirit).
  sh.getRange(2, 9, numRows, 1).setHorizontalAlignment('center')
    .setFontStyle('italic').setFontColor('#5F6368').setBackground('#F1F3F4');
  for (let r = 2; r <= numRows + 1; r++) sh.setRowHeight(r, 28);

  // ── Color-band by Category (zebra by category for scanability) ──
  const categoryColors = {
    'Required':     '#FCE5CD',  // peach (mandatory entire course)
    'Cold Weather': '#CFE2F3',  // light blue
    'Vest':         '#D9EAD3',  // light green
    'Fueling':      '#FFF2CC',  // light yellow
    'Apparel':      '#F4CCCC',  // light pink
    'Foot Care':    '#EAD1DC',  // lavender
    'Sleep Kit':    '#D9D2E9',  // muted purple
    'Heat':         '#F9CB9C',  // orange
    'Medical':      '#E6B8AF',  // muted red
    'Docs':         '#FFE599',  // gold
    'Electronics':  '#B6D7A8',  // sage
    'Travel':       '#F1F3F4',  // grey
  };
  for (let i = 0; i < numRows; i++) {
    const cat = rows[i][1];
    const bg = categoryColors[cat];
    if (bg) sh.getRange(i + 2, 2, 1, 1).setBackground(bg);
  }

  // ── Conditional format: row turns light green when ALL applicable boxes ticked ──
  // Rule fires when D AND ((E only) OR (F+G filled)).
  // Visual cue: complete rows fade to confirm packing is done.
  const completeRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(
      '=AND($D2=TRUE, OR(AND($E2=TRUE, $F2=FALSE), AND($F2=TRUE, $G2<>"", $G2<>"(none)")))'
    )
    .setBackground('#E8F5E9')  // very light green — "done"
    .setRanges([sh.getRange(2, 1, numRows, 8)])
    .build();

  // ── Conditional format: Drop Bag ✓ but no AS picked — orange warning ──
  const missingASRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($F2=TRUE, OR($G2="", $G2="(none)"))')
    .setBackground('#FFF3CD')  // amber warning
    .setRanges([sh.getRange(2, 7, numRows, 1)])
    .build();

  sh.setConditionalFormatRules([completeRule, missingASRule]);

  // ── Borders ────────────────────────────────────────────
  sh.getRange(1, 1, numRows + 1, 9).setBorder(
    true, true, true, true, true, true,
    '#DADCE0', SpreadsheetApp.BorderStyle.SOLID
  );
  sh.getRange(1, 1, 1, 9).setBorder(
    true, true, true, true, true, true,
    '#202124', SpreadsheetApp.BorderStyle.SOLID_THICK
  );

  // ── Summary block (top-right) ──────────────────────────
  sh.getRange(1, 10, 1, 2).merge().setValue('PACKING PROGRESS')
    .setFontWeight('bold').setBackground('#202124').setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  const lastDataRow = numRows + 1;
  const summary = [
    ['Initial Pack (→AZ)', '=COUNTIF(D2:D' + lastDataRow + ',TRUE) & " / " & COUNTA(A2:A' + lastDataRow + ')'],
    ['Race Day Carry',     '=COUNTIF(E2:E' + lastDataRow + ',TRUE) & " / " & COUNTIF(E2:E' + lastDataRow + ',"<>") '],
    ['Drop Bags packed',   '=COUNTIF(F2:F' + lastDataRow + ',TRUE) & " / " & COUNTIF(F2:F' + lastDataRow + ',"<>")'],
    ['Drop Bag AS missing','=COUNTIFS(F2:F' + lastDataRow + ',TRUE,G2:G' + lastDataRow + ',"(none)") + COUNTIFS(F2:F' + lastDataRow + ',TRUE,G2:G' + lastDataRow + ',"")'],
  ];
  sh.getRange(2, 10, 4, 2).setValues(summary);
  sh.getRange(2, 10, 4, 1).setFontWeight('bold');
  sh.getRange(2, 11, 4, 1).setHorizontalAlignment('center')
    .setBackground('#F1F3F4');
  sh.setColumnWidth(10, 240);  // J: AS / label column (fits longest AS name)
  sh.setColumnWidth(11, 90);   // K: Items count / progress value
  sh.setColumnWidth(12, 90);   // L: Total Qty (allocation block only)
  sh.getRange(1, 10, 5, 2).setBorder(
    true, true, true, true, true, true,
    '#202124', SpreadsheetApp.BorderStyle.SOLID
  );

  // ── Drop Bag Allocation block (rows 7+, cols J-L) ──────
  // Per-AS subtotals: counts items packed (F=TRUE) and sums Qty per AS.
  // Lets Jason answer "what's in the Crown King bag?" at a glance and spot
  // over/under-allocation against his target (compare to Item Total in col I).
  const allocStartRow = 7;
  sh.getRange(allocStartRow, 10, 1, 3).merge()
    .setValue('DROP BAG ALLOCATION (per AS)')
    .setFontWeight('bold').setBackground('#202124').setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  sh.setRowHeight(allocStartRow, 32);
  sh.getRange(allocStartRow + 1, 10, 1, 3)
    .setValues([['Aid Station', 'Items ✓', 'Total Qty']])
    .setFontWeight('bold').setBackground('#5F6368').setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');

  const asList = DROP_BAG_STATIONS.filter(function(x) { return x !== '(none)'; });
  const allocRows = asList.map(function(as) {
    const escaped = as.replace(/"/g, '""');  // defensive — none currently contain quotes
    return [
      as,
      '=COUNTIFS(F2:F' + lastDataRow + ',TRUE,G2:G' + lastDataRow + ',"' + escaped + '")',
      '=SUMIFS(C2:C' + lastDataRow + ',G2:G' + lastDataRow + ',"' + escaped + '",F2:F' + lastDataRow + ',TRUE)',
    ];
  });
  sh.getRange(allocStartRow + 2, 10, allocRows.length, 3).setValues(allocRows);
  sh.getRange(allocStartRow + 2, 10, allocRows.length, 1).setFontWeight('bold')
    .setVerticalAlignment('middle').setWrap(true);
  sh.getRange(allocStartRow + 2, 11, allocRows.length, 2).setHorizontalAlignment('center')
    .setBackground('#F1F3F4').setVerticalAlignment('middle');
  for (let r = allocStartRow + 2; r < allocStartRow + 2 + allocRows.length; r++) {
    sh.setRowHeight(r, 28);
  }

  // Highlight rows where allocated items exist (Items ✓ > 0) — soft green.
  const allocRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$K' + (allocStartRow + 2) + '>0')
    .setBackground('#E8F5E9')
    .setRanges([sh.getRange(allocStartRow + 2, 10, allocRows.length, 3)])
    .build();
  // Append to existing rules (don't clobber completeRule + missingASRule).
  const existingRules = sh.getConditionalFormatRules();
  sh.setConditionalFormatRules(existingRules.concat([allocRule]));

  sh.getRange(allocStartRow, 10, allocRows.length + 2, 3).setBorder(
    true, true, true, true, true, true,
    '#202124', SpreadsheetApp.BorderStyle.SOLID
  );

  ss.setActiveSheet(sh);
  Logger.log('Gear Checklist built: ' + numRows + ' items.');
}


// ════════════════════════════════════════════════════════════════════════════
// backupGearChecklist() — duplicates the current Gear Checklist tab to a new
// timestamped tab. Safe, non-destructive. Called directly from the menu and
// also automatically by wipeAndRecreateGearChecklist() before any wipe.
//
// Returns the name of the backup tab, or null if there was nothing to back up.
// ════════════════════════════════════════════════════════════════════════════

function backupGearChecklist(silent) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = silent ? null : SpreadsheetApp.getUi();
  const existing = ss.getSheetByName(GEAR_TAB_NAME);
  if (!existing) {
    if (ui) ui.alert('No "Gear Checklist" tab found — nothing to back up.');
    return null;
  }
  const ts = Utilities.formatDate(
    new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH-mm'
  );
  const backupName = 'Gear Backup ' + ts;
  const copy = existing.copyTo(ss);
  copy.setName(backupName);
  // Tint the backup tab grey so it's clearly an archive
  copy.setTabColor('#9AA0A6');
  if (ui) {
    ui.alert(
      'Backup created',
      'Saved a copy of "Gear Checklist" as:\n\n    ' + backupName +
        '\n\nThe original tab is unchanged.',
      ui.ButtonSet.OK
    );
  }
  Logger.log('Gear Checklist backed up as "' + backupName + '"');
  return backupName;
}


// ════════════════════════════════════════════════════════════════════════════
// wipeAndRecreateGearChecklist() — destructive. Two-step confirmation +
// auto-backup before invoking buildGearChecklist().
//
// Confirmation flow:
//   1. First dialog: explains exactly what will be lost. Yes/No.
//   2. Auto-backup: copies the existing Gear Checklist tab to a timestamped
//      "Gear Backup ..." tab so manual edits are recoverable even on accident.
//   3. Second dialog (typed confirmation): user must type WIPE to proceed.
//   4. Wipe + recreate.
//   5. Final dialog: summary with backup tab name.
// ════════════════════════════════════════════════════════════════════════════

function wipeAndRecreateGearChecklist() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const existing = ss.getSheetByName(GEAR_TAB_NAME);

  // ── Step 1: scary first dialog ─────────────────────────────
  const lossList = existing
    ? '• ALL ticked checkboxes (Initial Pack, Race Day Carry, Drop Bag)\n' +
      '• ALL Drop Bag AS assignments\n' +
      '• ALL custom rows you have added\n' +
      '• ALL edits to quantities and notes'
    : '(No existing tab found — a fresh checklist will be seeded.)';
  const firstResp = ui.alert(
    '⚠ STOP — DESTRUCTIVE ACTION ⚠',
    'You are about to WIPE the "Gear Checklist" tab.\n\n' +
    'The following manual edits will be PERMANENTLY ERASED from the active tab:\n\n' +
    lossList + '\n\n' +
    (existing
      ? 'A timestamped BACKUP COPY will be created automatically before the wipe so you can recover.\n\n'
      : '') +
    'Are you sure you want to continue?',
    ui.ButtonSet.YES_NO
  );
  if (firstResp !== ui.Button.YES) {
    ui.alert('Cancelled. Your Gear Checklist is unchanged.');
    return;
  }

  // ── Step 2: auto-backup ────────────────────────────────────
  const backupName = existing ? backupGearChecklist(true) : null;

  // ── Step 3: typed confirmation ─────────────────────────────
  const typedResp = ui.prompt(
    'Type WIPE to confirm',
    (backupName
      ? 'Backup saved as: "' + backupName + '"\n\n'
      : '') +
    'To proceed with the wipe, type WIPE (all caps) and click OK.\n' +
    'Click Cancel to abort.',
    ui.ButtonSet.OK_CANCEL
  );
  if (typedResp.getSelectedButton() !== ui.Button.OK ||
      typedResp.getResponseText().trim() !== 'WIPE') {
    ui.alert(
      'Cancelled.',
      (backupName
        ? 'Your Gear Checklist is unchanged. The backup tab "' + backupName +
          '" was created and remains in the workbook — feel free to delete it if not needed.'
        : 'Your Gear Checklist is unchanged.'),
      ui.ButtonSet.OK
    );
    return;
  }

  // ── Step 4: wipe + recreate ────────────────────────────────
  buildGearChecklist();

  // ── Step 5: summary ────────────────────────────────────────
  ui.alert(
    'Gear Checklist recreated',
    '✓ New empty checklist seeded.\n' +
    (backupName
      ? '✓ Previous tab archived as "' + backupName + '".'
      : '✓ No prior tab existed — nothing to archive.'),
    ui.ButtonSet.OK
  );
}


// ════════════════════════════════════════════════════════════════════════════
// migrateGearChecklistToApproachA() — non-destructive in-place upgrade.
//
// Adds the Approach A structure (column I "Item Total" + DROP BAG ALLOCATION
// per-AS block + A1 note + renamed "Qty (this row)" header) to an existing
// Gear Checklist tab WITHOUT wiping any of Jason's manual edits — checkboxes,
// AS picks, custom rows, notes, and any rows that have already been duplicated
// for multi-AS splits all survive.
//
// Auto-backs up first as a safety net. Idempotent — safe to re-run.
// ════════════════════════════════════════════════════════════════════════════

function migrateGearChecklistToApproachA() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(GEAR_TAB_NAME);

  if (!sh) {
    ui.alert(
      'No "Gear Checklist" tab found',
      'Run "Build All" first to seed the checklist, then re-run this upgrade.',
      ui.ButtonSet.OK
    );
    return;
  }

  // Idempotency: if I1 already says 'Item Total', migration ran before.
  const i1 = sh.getRange(1, 9).getValue();
  if (i1 === 'Item Total') {
    const resp = ui.alert(
      'Already upgraded',
      'Column I already shows "Item Total" — Approach A appears to be in place.\n\n' +
      'Re-run anyway? This will refresh the SUMIF formulas, A1 note, summary ' +
      'formulas, and the per-AS allocation block. Manual edits in cols A-H are ' +
      'untouched.',
      ui.ButtonSet.YES_NO
    );
    if (resp !== ui.Button.YES) return;
  }

  // Auto-backup before any structural change.
  const backupName = backupGearChecklist(true);

  // ── Detect data extent from column A (row 2 down to last contiguous item) ──
  const colA = sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), 1).getValues();
  let numRows = 0;
  for (let i = 0; i < colA.length; i++) {
    if (colA[i][0] !== '' && colA[i][0] != null) {
      numRows = i + 1;
    } else {
      break;
    }
  }
  const lastDataRow = numRows + 1;

  // ── Header updates: rename C, add I ────────────────────────────────────
  sh.getRange(1, 3).setValue('Qty (this row)')
    .setFontWeight('bold').setBackground('#202124').setFontColor('#FFFFFF')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.getRange(1, 9).setValue('Item Total')
    .setFontWeight('bold').setBackground('#202124').setFontColor('#FFFFFF')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setColumnWidth(3, 80);
  sh.setColumnWidth(9, 90);

  // ── A1 hover note documenting the duplication convention ──────────────
  sh.getRange(1, 1).setNote(
    'Multi-AS items: duplicate the row, keep the EXACT same Item name here. ' +
    'Set Qty (col C) to THIS row\'s allocation. Set Drop Bag AS in col G.\n\n' +
    'Column I "Item Total" auto-sums all rows with the same Item name so you ' +
    'can verify total allocation matches your target.\n\n' +
    'Tip: sort or filter by Drop Bag AS (col G) to see what\'s in each bag. ' +
    'The right-hand DROP BAG ALLOCATION block also tallies per AS.'
  );

  // ── Item Total formulas on col I for every existing data row ──────────
  if (numRows > 0) {
    const formulas = [];
    for (let r = 0; r < numRows; r++) {
      formulas.push([
        '=IF($A' + (r + 2) + '="","",SUMIF($A:$A,$A' + (r + 2) + ',$C:$C))'
      ]);
    }
    sh.getRange(2, 9, numRows, 1).setFormulas(formulas);
    sh.getRange(2, 9, numRows, 1).setHorizontalAlignment('center')
      .setFontStyle('italic').setFontColor('#5F6368').setBackground('#F1F3F4')
      .setVerticalAlignment('middle');
  }

  // ── Borders extended to 9 cols ────────────────────────────────────────
  if (numRows > 0) {
    sh.getRange(1, 1, numRows + 1, 9).setBorder(
      true, true, true, true, true, true,
      '#DADCE0', SpreadsheetApp.BorderStyle.SOLID
    );
  }
  sh.getRange(1, 1, 1, 9).setBorder(
    true, true, true, true, true, true,
    '#202124', SpreadsheetApp.BorderStyle.SOLID_THICK
  );

  // ── Right-side column widths for the new layout ───────────────────────
  sh.setColumnWidth(10, 240);  // J
  sh.setColumnWidth(11, 90);   // K
  sh.setColumnWidth(12, 90);   // L

  // ── Refresh existing summary block (J1:K5) to current row count ───────
  // J1: PACKING PROGRESS header — merge J1:K1 if not already merged.
  try { sh.getRange(1, 10, 1, 2).breakApart(); } catch (e) {}
  sh.getRange(1, 10, 1, 2).merge().setValue('PACKING PROGRESS')
    .setFontWeight('bold').setBackground('#202124').setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  if (numRows > 0) {
    const summary = [
      ['Initial Pack (→AZ)', '=COUNTIF(D2:D' + lastDataRow + ',TRUE) & " / " & COUNTA(A2:A' + lastDataRow + ')'],
      ['Race Day Carry',     '=COUNTIF(E2:E' + lastDataRow + ',TRUE) & " / " & COUNTIF(E2:E' + lastDataRow + ',"<>") '],
      ['Drop Bags packed',   '=COUNTIF(F2:F' + lastDataRow + ',TRUE) & " / " & COUNTIF(F2:F' + lastDataRow + ',"<>")'],
      ['Drop Bag AS missing','=COUNTIFS(F2:F' + lastDataRow + ',TRUE,G2:G' + lastDataRow + ',"(none)") + COUNTIFS(F2:F' + lastDataRow + ',TRUE,G2:G' + lastDataRow + ',"")'],
    ];
    sh.getRange(2, 10, 4, 2).setValues(summary);
    sh.getRange(2, 10, 4, 1).setFontWeight('bold');
    sh.getRange(2, 11, 4, 1).setHorizontalAlignment('center')
      .setBackground('#F1F3F4');
  }
  sh.getRange(1, 10, 5, 2).setBorder(
    true, true, true, true, true, true,
    '#202124', SpreadsheetApp.BorderStyle.SOLID
  );

  // ── DROP BAG ALLOCATION block at J7:L (per-AS subtotals) ──────────────
  const allocStartRow = 7;
  // Defensive unmerge in target zone in case a prior partial migration left
  // merged cells. Sized generously to cover all 15 AS rows + header + title.
  try { sh.getRange(allocStartRow, 10, DROP_BAG_STATIONS.length + 5, 3).breakApart(); } catch (e) {}

  sh.getRange(allocStartRow, 10, 1, 3).merge()
    .setValue('DROP BAG ALLOCATION (per AS)')
    .setFontWeight('bold').setBackground('#202124').setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  sh.setRowHeight(allocStartRow, 32);
  sh.getRange(allocStartRow + 1, 10, 1, 3)
    .setValues([['Aid Station', 'Items ✓', 'Total Qty']])
    .setFontWeight('bold').setBackground('#5F6368').setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');

  const asList = DROP_BAG_STATIONS.filter(function(x) { return x !== '(none)'; });
  const allocFormulas = asList.map(function(as) {
    const escaped = as.replace(/"/g, '""');
    // Use a safe end row even if numRows is currently 0.
    const endRow = Math.max(lastDataRow, 2);
    return [
      as,
      '=COUNTIFS(F2:F' + endRow + ',TRUE,G2:G' + endRow + ',"' + escaped + '")',
      '=SUMIFS(C2:C' + endRow + ',G2:G' + endRow + ',"' + escaped + '",F2:F' + endRow + ',TRUE)',
    ];
  });
  sh.getRange(allocStartRow + 2, 10, allocFormulas.length, 3).setValues(allocFormulas);
  sh.getRange(allocStartRow + 2, 10, allocFormulas.length, 1).setFontWeight('bold')
    .setVerticalAlignment('middle').setWrap(true);
  sh.getRange(allocStartRow + 2, 11, allocFormulas.length, 2).setHorizontalAlignment('center')
    .setBackground('#F1F3F4').setVerticalAlignment('middle');
  for (let r = allocStartRow + 2; r < allocStartRow + 2 + allocFormulas.length; r++) {
    sh.setRowHeight(r, 28);
  }

  // Append-only conditional format for the alloc block. De-dupe any rule
  // that already targets the same range (so re-runs don't stack copies).
  const existingRules = sh.getConditionalFormatRules();
  const filteredRules = existingRules.filter(function(rule) {
    const ranges = rule.getRanges();
    if (ranges.length !== 1) return true;
    const r = ranges[0];
    return !(r.getRow() === allocStartRow + 2 &&
             r.getColumn() === 10 &&
             r.getNumColumns() === 3);
  });
  const allocRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$K' + (allocStartRow + 2) + '>0')
    .setBackground('#E8F5E9')
    .setRanges([sh.getRange(allocStartRow + 2, 10, allocFormulas.length, 3)])
    .build();
  sh.setConditionalFormatRules(filteredRules.concat([allocRule]));

  sh.getRange(allocStartRow, 10, allocFormulas.length + 2, 3).setBorder(
    true, true, true, true, true, true,
    '#202124', SpreadsheetApp.BorderStyle.SOLID
  );

  ui.alert(
    'Gear Checklist upgraded',
    '✓ Column I "Item Total" added with SUMIF formulas (' + numRows + ' rows)\n' +
    '✓ Column C renamed to "Qty (this row)"\n' +
    '✓ A1 hover note added with duplication convention\n' +
    '✓ DROP BAG ALLOCATION block installed at J7:L\n' +
    '✓ Summary formulas refreshed to current row count\n\n' +
    (backupName
      ? 'Backup saved as "' + backupName + '" (delete it once you confirm.)'
      : '(No backup created — tab existed but was empty.)') + '\n\n' +
    'Your existing rows, checkboxes, AS assignments, and notes are unchanged.',
    ui.ButtonSet.OK
  );
}
