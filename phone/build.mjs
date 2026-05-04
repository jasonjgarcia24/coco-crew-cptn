// phone/build.mjs — renders phone/*.md into a single self-contained HTML
// optimized for Android Chrome on a Pixel. Inline CSS, no JS deps, no network.
//
// Structure: two collapsible top-level sections (Aid Station Cards, Race Brief).
// H2 sub-sections inside each are also collapsible. Default open, except "Legend"
// (default closed). Anchors are placed on <details> elements so clicking a TOC
// link auto-opens the collapsed section in modern Chrome.

import { marked } from 'marked';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

marked.setOptions({ gfm: true, breaks: false });

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Minimal CSV parser. Handles quoted fields with embedded commas/newlines/
// doubled-up double-quotes ("" → ").
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cell += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c === '\r') { /* skip */ }
      else cell += c;
    }
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function slugify(text) {
  return text.toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);
}

function addHeadingIds(html) {
  return html.replace(/<h([1-6])>(.+?)<\/h\1>/g, (_, level, inner) => {
    const slug = slugify(inner);
    return `<h${level} id="${slug}">${inner}</h${level}>`;
  });
}

// Mile-marker → stable AS id used to sync a card with its at-a-glance row
// for the click-to-highlight feature. "M7.4" → "m74", "M0" → "m0", etc.
function extractMileSlug(text) {
  const m = text.match(/M(\d+(?:\.\d+)?)/);
  return m ? 'm' + m[1].replace('.', '') : null;
}

// Wrap each H3 (AS card) + the content beneath it in a <div class="card …">
// alternating odd/even, so the page can paint a zebra-stripe background.
// Counter resets per H2 section (passed in as `body`) so each phase starts
// fresh from "odd". Used to make adjacent aid stations visually separable
// under fatigue. Also stamps `data-as="<mile-slug>"` so the card is
// clickable and syncs with its matching at-a-glance row.
function wrapCardsInBody(body, gearData) {
  const parts = body.split(/(?=<h3\b)/);
  if (parts.length === 0) return body;
  const firstIsH3 = parts[0].startsWith('<h3');
  if (!firstIsH3 && parts.length === 1) return body;  // no H3s in this section
  const head = firstIsH3 ? '' : parts[0];
  const cardParts = firstIsH3 ? parts : parts.slice(1);
  const cards = cardParts.map((card, i) => {
    const cls = i % 2 === 0 ? 'card card-odd' : 'card card-even';
    const h3match = card.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/);
    const slug = h3match ? extractMileSlug(h3match[1]) : null;
    const dataAttr = slug ? ` data-as="${slug}"` : '';
    const target = extractAGoalTarget(card);
    const targetAttr = target.iso ? ` data-target="${target.iso}"` : '';
    const bgoalLabel = slug ? B_GOAL_TIMES[slug] : null;
    const gear = (gearData && slug) ? renderGearSection(gearData.get(slug)) : '';
    const pace = slug ? renderPaceSection(target, bgoalLabel) : '';
    return `<div class="${cls}"${dataAttr}${targetAttr}>${card}${pace}${gear}</div>`;
  });
  return head + cards.join('');
}

// Stamp `data-as` on each at-a-glance table row by extracting the mile
// marker from its first cell. Header rows use <th> so they're skipped.
function addTableRowIds(html) {
  return html.replace(/<tr>(\s*<td>([^<]*)<\/td>[\s\S]*?)<\/tr>/g, (full, inner, firstTd) => {
    const slug = extractMileSlug(firstTd);
    return slug ? `<tr data-as="${slug}">${inner}</tr>` : full;
  });
}

// === Gear Checklist sync ===
// Loads the Drop Bag rows from the user's Gear Checklist CSV (exported from
// the Pacing Chart spreadsheet) and groups them by mile-slug so we can inject
// a default-closed "Drop bag" details into each AS card during render.

// The gear sheet's Drop Bag AS column is free-text from a dropdown like
// "Crown King M36.6". Extract the mile marker to get the same slug used by
// the AS cards. Special-case "Start (direct-to-finish)" → m0.
function gearAsToSlug(asText) {
  if (!asText) return null;
  if (/^start\b/i.test(asText.trim())) return 'm0';
  return extractMileSlug(asText);
}

// Column layout matches buildGearChecklist() in live/pacing-chart-apps-script.gs:
//   A: Item, B: Category, C: Qty (this row), D: Initial Pack,
//   E: Race Day Carry, F: Drop Bag, G: Drop Bag AS, H: Notes, I: Item Total
function parseGearCSV(csv) {
  const rows = parseCSV(csv);
  const groups = new Map();
  for (let i = 1; i < rows.length; i++) {  // skip header row
    const r = rows[i];
    if (!r || !r[0]) continue;
    if (String(r[5] || '').toUpperCase() !== 'TRUE') continue;  // F = Drop Bag ☐
    const slug = gearAsToSlug(r[6]);                            // G = Drop Bag AS
    if (!slug) continue;
    if (!groups.has(slug)) groups.set(slug, []);
    groups.get(slug).push({
      item: r[0] || '',
      qty: r[2] || '',
      notes: r[7] || '',
    });
  }
  return groups;
}

// Two paths to get the CSV:
//   1. Auto-fetch from a published-to-web URL (PHONE_GEAR_CSV_URL env var
//      or `.gear-csv-url` file in phone/) — true sync, needs internet at build.
//   2. Local file at `phone/gear-checklist.csv` — drop in via manual sheet
//      export, fully offline.
// Falls back silently if neither is present.
async function loadGearData() {
  let csv = null;
  let source = null;

  let url = process.env.PHONE_GEAR_CSV_URL;
  if (!url && existsSync('.gear-csv-url')) {
    url = readFileSync('.gear-csv-url', 'utf8').trim();
  }
  if (url) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        csv = await res.text();
        source = 'published-to-web URL';
      } else {
        console.warn(`  × Gear CSV fetch failed: HTTP ${res.status}`);
      }
    } catch (e) {
      console.warn(`  × Gear CSV fetch error: ${e.message}`);
    }
  }
  if (!csv && existsSync('gear-checklist.csv')) {
    csv = readFileSync('gear-checklist.csv', 'utf8');
    source = 'gear-checklist.csv';
  }
  if (!csv) {
    console.log('  · No gear data — drop-bag sections skipped');
    return new Map();
  }
  const groups = parseGearCSV(csv);
  let total = 0;
  groups.forEach(items => total += items.length);
  console.log(`  · Gear data: ${total} drop-bag items across ${groups.size} aid stations (from ${source})`);
  return groups;
}

function renderGearSection(items) {
  if (!items || items.length === 0) return '';
  const lis = items.map(it => {
    const qty = it.qty ? ` <span class="gear-qty">×${escapeHtml(it.qty)}</span>` : '';
    const notes = it.notes ? ` <em class="gear-notes">${escapeHtml(it.notes)}</em>` : '';
    return `<li><strong>${escapeHtml(it.item)}</strong>${qty}${notes}</li>`;
  }).join('');
  return `<details class="gear-section">` +
    `<summary class="gear-summary">🎒 Drop bag (${items.length} ${items.length === 1 ? 'item' : 'items'})</summary>` +
    `<ul class="gear-list">${lis}</ul>` +
    `</details>`;
}

// === Pace tracking ===
// A-GOAL is the realistic target — the pace dropdown's status compares
// the click-to-highlight timestamp (or live now) against this. B-GOAL is
// shown alongside as a worst-acceptable reference, but doesn't drive the
// status. A-GOAL is parsed live from the card's 🟢🟡 bullet (second time);
// B-GOAL is looked up from the static map below, sourced from the Pacing
// Chart sheet's B-GOAL TOD column. Update this map if the band recomputes.

const B_GOAL_TIMES = {
  'm0':    '5:00 AM Mon',
  'm74':   '7:23 AM Mon',
  'm325':  '8:09 PM Mon',
  'm366':  '10:03 PM Mon',
  'm51':   '2:45 AM Tue',
  'm608':  '6:05 AM Tue',
  'm674':  '8:36 AM Tue',
  'm756':  '11:32 AM Tue',
  'm828':  '2:06 PM Tue',
  'm965':  '7:09 PM Tue',
  'm1072': '12:35 AM Wed',
  'm1242': '6:44 AM Wed',
  'm1329': '9:40 AM Wed',
  'm1469': '2:50 PM Wed',
  'm1591': '7:24 PM Wed',
  'm1761': '5:21 AM Thu',
  'm1900': '10:16 AM Thu',
  'm2027': '2:35 PM Thu',
  'm2110': '5:14 PM Thu',
  'm2271': '11:37 PM Thu',
  'm2341': '2:18 AM Fri',
  'm2494': '7:40 AM Fri',
  'm2533': '9:00 AM Fri',
};

const RACE_DAY_MAP = {
  Sun: 3, Mon: 4, Tue: 5, Wed: 6, Thu: 7, Fri: 8, Sat: 9, // May 2026 dates
};

// "6:38 AM Mon" → Date(2026, 4, 4, 6, 38). Returns null on parse failure.
function parseRaceTime(s) {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2}):(\d{2})\s+(AM|PM)\s+(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const ampm = m[3];
  const day = m[4];
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  const date = RACE_DAY_MAP[day];
  if (date == null) return null;
  return new Date(2026, 4, date, h, mm); // month index: May = 4
}

// First 🟢🟡 bullet in a rendered card holds the FAST/A-GOAL arrival
// window: "🟢🟡 6:19 AM Mon - 6:38 AM Mon". The second time is A-GOAL,
// which drives the pace status comparison.
function extractAGoalTarget(cardHtml) {
  const m = cardHtml.match(
    /<li>🟢🟡\s+\d{1,2}:\d{2}\s+(?:AM|PM)\s+\w{3}\s*-\s*(\d{1,2}:\d{2}\s+(?:AM|PM)\s+\w{3})\b/
  );
  if (!m) return { iso: null, label: null };
  const date = parseRaceTime(m[1]);
  return {
    iso: date ? date.toISOString() : null,
    label: m[1],
  };
}

function renderPaceSection(target, bgoalLabel) {
  if (!target.iso) return '';
  const bgoal = bgoalLabel
    ? `<div class="pace-row"><span class="pace-label">B-GOAL</span><span class="pace-bgoal">${escapeHtml(bgoalLabel)}</span></div>`
    : '';
  return `<details class="pace-section">` +
    `<summary class="pace-summary">⏱ Pace</summary>` +
    `<div class="pace-body">` +
      `<div class="pace-row"><span class="pace-label">Now</span><span class="pace-now">—</span></div>` +
      `<div class="pace-row"><span class="pace-label">Target (A-GOAL)</span><span class="pace-target">${escapeHtml(target.label)}</span></div>` +
      bgoal +
      `<div class="pace-status">Tap the card to mark arrived.</div>` +
    `</div>` +
    `</details>`;
}

// Wrap each H2 section in <details> so it's collapsible. The id moves from the
// h2 to the <details> so anchor links auto-open the section.
//
// Note: JS String.split with a position-0 lookahead does NOT emit a leading
// empty string, so we have to detect whether parts[0] is itself an H2 section.
function wrapH2InDetails(html, gearData) {
  const parts = html.split(/(?=<h2\b)/);
  if (parts.length === 0) return html;
  const firstIsH2 = parts[0].startsWith('<h2');
  const head = firstIsH2 ? '' : parts[0];
  const sectionParts = firstIsH2 ? parts : parts.slice(1);
  const sections = sectionParts.map(part => {
    const m = part.match(/^<h2\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h2>([\s\S]*)$/);
    if (!m) return part;
    const [, id, h2text, body] = m;
    const isLegend = /legend/i.test(h2text);
    const openAttr = isLegend ? '' : ' open';
    return `<details${openAttr} class="h2-section" id="${id}">` +
      `<summary class="h2-summary"><h2>${h2text}</h2></summary>` +
      `<div class="h2-body">${wrapCardsInBody(body, gearData)}</div>` +
      `</details>`;
  });
  return head + sections.join('');
}

function extractH2(md) {
  return md.split('\n')
    .filter(l => /^## /.test(l))
    .map(l => l.replace(/^## /, '').trim())
    .map(text => ({ text, slug: slugify(text) }));
}

const briefMd = readFileSync('race-brief-phone.md', 'utf8');
const cardsMd = readFileSync('as-cards-phone.md', 'utf8');

const gearData = await loadGearData();

const briefHtml = wrapH2InDetails(addHeadingIds(marked.parse(briefMd)));
const cardsHtml = wrapH2InDetails(
  addTableRowIds(addHeadingIds(marked.parse(cardsMd))),
  gearData
);

// TOC: phase pills derived from H2 headings whose text starts with a phase emoji.
const phaseH2s = extractH2(cardsMd).filter(h => /^[🔥🥶]/.test(h.text));
const phaseLinks = phaseH2s.map(h => {
  const short = h.text.replace(/\s—.*$/, '').trim();
  return `<a href="#${h.slug}">${short}</a>`;
}).join('');

const builtAt = new Date().toLocaleString('en-US', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric', month: 'short', day: '2-digit',
  hour: '2-digit', minute: '2-digit',
});

const css = `
/* Force light mode regardless of OS setting — designed for desert-sun
   readability. color-scheme on :root tells the browser to render scrollbars,
   form controls, and other UA-supplied chrome in light mode too. */
:root {
  color-scheme: light;
  --bg: #FFFFFF;
  --fg: #202124;
  --fg-soft: #5F6368;
  --accent: #1A73E8;
  --rule: #DADCE0;
  --pill-bg: #F1F3F4;
  --section-bg: #F8F9FA;
  --topbar-h: 48px;
  --toc-h: 52px;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: calc(var(--topbar-h) + var(--toc-h) + 8px); }
body {
  margin: 0;
  font: 17px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", sans-serif;
  background: var(--bg);
  color: var(--fg);
  -webkit-text-size-adjust: 100%;
  padding-bottom: 6em;
}
.topbar {
  background: var(--fg);
  color: var(--bg);
  padding: 10px 16px;
  position: sticky; top: 0; z-index: 10;
  height: var(--topbar-h);
  display: flex; align-items: center; gap: 12px;
}
.topbar h1 { margin: 0; font-size: 17px; font-weight: 700; flex: 1; }
.topbar small { font-size: 11px; opacity: 0.7; }
nav.toc {
  display: flex; flex-wrap: nowrap; gap: 6px;
  padding: 8px 12px;
  background: var(--bg);
  border-bottom: 1px solid var(--rule);
  position: sticky; top: var(--topbar-h); z-index: 9;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  height: var(--toc-h);
  align-items: center;
}
nav.toc a {
  background: var(--pill-bg);
  color: var(--fg);
  padding: 8px 14px;
  border-radius: 999px;
  font-size: 14px;
  text-decoration: none;
  white-space: nowrap;
  min-height: 36px;
  display: inline-flex; align-items: center;
  flex-shrink: 0;
}
nav.toc a:active { background: var(--accent); color: #FFF; }
main { padding: 0 12px; max-width: 760px; margin: 0 auto; }

/* Disclosure marker — single style for all <summary>. */
summary { cursor: pointer; user-select: none; list-style: none; }
summary::-webkit-details-marker { display: none; }
summary::before {
  content: "▸";
  display: inline-block;
  margin-right: 0.4em;
  font-size: 0.85em;
  opacity: 0.7;
  transition: transform 0.15s ease;
  transform-origin: center;
}
details[open] > summary::before { transform: rotate(90deg); }

/* Top-level section (Aid Station Cards / Race Brief) */
.top-section {
  margin: 16px 0;
  border: 1px solid var(--rule);
  border-radius: 10px;
  background: var(--section-bg);
  overflow: hidden;
}
.top-summary {
  padding: 12px 14px;
  font-size: 18px;
  font-weight: 700;
  background: var(--fg);
  color: var(--bg);
}
.top-summary::before { color: var(--bg); }
.top-body { padding: 4px 12px 12px; background: var(--bg); }

/* Nested H2 collapsible section */
.h2-section { margin: 12px 0; }
.h2-summary {
  padding: 8px 0 4px;
  border-bottom: 2px solid var(--rule);
}
.h2-summary h2 {
  display: inline;
  margin: 0;
  font-size: 19px;
  line-height: 1.3;
  font-weight: 700;
}
.h2-body { padding-top: 6px; }

h3 {
  font-size: 17px;
  color: var(--accent);
  margin: 16px 0 4px;
  line-height: 1.3;
}
h3 + ul, h3 + p { margin-top: 4px; }
p, li { font-size: 16px; }
ul, ol { padding-left: 22px; margin: 4px 0 12px; }
li { margin-bottom: 3px; }
strong { font-weight: 700; }
em { font-style: italic; }
hr { border: 0; border-top: 2px dashed var(--rule); margin: 16px 0; }

table {
  width: 100%; border-collapse: collapse;
  font-size: 13px;
  display: block; overflow-x: auto;
  margin: 8px 0;
  border: 1px solid var(--rule);
  -webkit-overflow-scrolling: touch;
}
th, td {
  padding: 5px 7px;
  border-bottom: 1px solid var(--rule);
  white-space: nowrap;
  vertical-align: top;
}
th { background: var(--pill-bg); font-weight: 700; }
tr td:first-child, tr th:first-child { font-weight: 600; }
/* Zebra-stripe AS rows in the at-a-glance table for fatigue legibility. */
tbody tr:nth-child(even) td { background: var(--pill-bg); }

/* Zebra-stripe individual AS cards within each phase. Counter resets per
   phase so every phase starts with "odd" (white) regardless of card count. */
.card {
  margin: 0 -8px;
  padding: 4px 8px 8px;
  border-radius: 6px;
}
.card.card-even {
  background: var(--pill-bg);
}
.card h3 { margin-top: 8px; }

/* Click-to-highlight: tap any AS card or at-a-glance row to mark it.
   State persists via localStorage so it survives reload + airplane mode.
   Tapping the card highlights its matching table row too (and vice versa).
   Color is Material Orange 200 — softer than 300 so the text stays primary
   while the warm peach still reads clearly against the white and gray
   zebra rows under desert sun. */
[data-as] { cursor: pointer; }
.card[data-as].highlighted,
tbody tr[data-as].highlighted td {
  background: #FFCC80;
}

/* Pace dropdown — default-closed details inside each AS card. Shows live
   wall clock, the A-GOAL target arrival, and an on-track/behind status.
   Status uses the click-to-highlight timestamp as the assumed arrival;
   if the card isn't highlighted, status falls back to comparing live now
   vs. target ("if you arrived now, you'd be …"). */
.pace-section {
  margin: 6px 0 4px;
  border: 1px solid var(--rule);
  border-radius: 6px;
  background: var(--bg);
}
.pace-summary {
  padding: 6px 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--fg-soft);
}
.pace-body {
  padding: 4px 12px 8px;
  font-size: 14px;
}
.pace-row {
  display: flex;
  justify-content: space-between;
  padding: 2px 0;
}
.pace-label {
  color: var(--fg-soft);
  font-weight: 600;
}
.pace-now, .pace-target, .pace-bgoal {
  font-variant-numeric: tabular-nums;
}
.pace-bgoal {
  color: var(--fg-soft);
  font-size: 13px;
}
.pace-status {
  margin-top: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: 600;
  text-align: center;
  background: var(--pill-bg);
  color: var(--fg-soft);
}
.pace-status.pace-ahead { background: #C8E6C9; color: #1B5E20; }
.pace-status.pace-behind { background: #FFCDD2; color: #B71C1C; }
.pace-status.pace-pending { background: var(--pill-bg); color: var(--fg-soft); }

/* Drop-bag contents synced from the Pacing Chart Gear Checklist tab.
   Default-closed details inside each AS card with a drop bag.
   Bordered + own background so it stays distinct whether the parent
   card is white, gray, or peach (highlighted). */
.gear-section {
  margin: 8px 0 4px;
  border: 1px solid var(--rule);
  border-radius: 6px;
  background: var(--bg);
}
.gear-summary {
  padding: 6px 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--fg-soft);
}
.gear-list {
  margin: 0;
  padding: 4px 12px 8px 28px;
  font-size: 14px;
  list-style: "🎒  ";
}
.gear-list li { margin-bottom: 4px; line-height: 1.4; }
.gear-qty {
  display: inline-block;
  font-size: 12px;
  font-weight: 700;
  color: var(--fg-soft);
  background: var(--pill-bg);
  padding: 1px 7px;
  border-radius: 999px;
  margin-left: 4px;
}
.gear-notes {
  font-size: 12px;
  color: var(--fg-soft);
  font-style: italic;
}

.fab {
  position: fixed; bottom: 18px; right: 18px;
  background: var(--accent); color: #FFF;
  width: 52px; height: 52px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  text-decoration: none; font-size: 22px; font-weight: 700;
  box-shadow: 0 2px 10px rgba(0,0,0,0.3);
  z-index: 8;
}
`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
<meta name="theme-color" content="#202124">
<meta name="mobile-web-app-capable" content="yes">
<title>Cocodona 250</title>
<style>${css}</style>
</head>
<body>
<a id="top"></a>
<header class="topbar">
  <h1>🏃 Cocodona 250</h1>
  <small>${builtAt}</small>
</header>
<nav class="toc">
  <a href="#race-at-a-glance">🗺️ Glance</a>
  ${phaseLinks}
  <a href="#race-brief">📋 Brief</a>
</nav>
<main>
  <details open class="top-section" id="aid-station-cards">
    <summary class="top-summary">🗺️ Aid Station Cards</summary>
    <div class="top-body">${cardsHtml}</div>
  </details>
  <details open class="top-section" id="race-brief">
    <summary class="top-summary">📋 Race Brief</summary>
    <div class="top-body">${briefHtml}</div>
  </details>
</main>
<a class="fab" href="#top" aria-label="Back to top">⬆</a>
<script>
// Tap-to-highlight aid stations + pace tracking.
//
// localStorage shape (under STORE_KEY):
//   { "m74": 1715252100000, "m366": null, ... }
//   - key   = mile-slug shared between card and at-a-glance row
//   - value = ms epoch when the card was tapped (=> assumed arrival)
//             or null if highlighted but timestamp unknown (legacy data)
//
// Migration: older builds stored a plain array (["m74","m366"]); convert
// to the new object form with null timestamps so legacy highlights survive.
(function () {
  var STORE_KEY = 'cocodona-as-highlights';
  var state = {};
  try {
    var raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    if (Array.isArray(raw)) {
      raw.forEach(function (slug) { state[slug] = null; });
    } else if (raw && typeof raw === 'object') {
      state = raw;
    }
  } catch (e) { state = {}; }

  var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function fmtRaceTime(d) {
    var h = d.getHours();
    var mm = String(d.getMinutes()).padStart(2, '0');
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + mm + ' ' + ampm + ' ' + DAY_NAMES[d.getDay()];
  }
  function fmtDelta(min) {
    if (min === 0) return 'on the dot';
    var abs = Math.abs(min);
    if (abs >= 60) {
      var h = Math.floor(abs / 60);
      var m = abs % 60;
      return h + 'h ' + (m ? m + 'm ' : '') + (min > 0 ? 'ahead' : 'behind');
    }
    return abs + ' min ' + (min > 0 ? 'ahead' : 'behind');
  }

  function paintHighlights() {
    var ids = Object.keys(state);
    document.querySelectorAll('[data-as]').forEach(function (el) {
      el.classList.toggle('highlighted', ids.indexOf(el.dataset.as) !== -1);
    });
  }

  function refreshPace() {
    var now = new Date();
    var nowLabel = fmtRaceTime(now);
    document.querySelectorAll('.card[data-target]').forEach(function (card) {
      var target = new Date(card.dataset.target);
      if (isNaN(target.getTime())) return;
      var slug = card.dataset.as;
      var arrivedMs = (slug in state) ? state[slug] : undefined;
      var nowEl = card.querySelector('.pace-now');
      var statusEl = card.querySelector('.pace-status');
      if (nowEl) nowEl.textContent = nowLabel;
      if (!statusEl) return;

      if (typeof arrivedMs === 'number') {
        // Highlighted with known arrival timestamp — frozen comparison.
        var arrived = new Date(arrivedMs);
        var deltaMin = Math.round((target - arrived) / 60000);
        statusEl.textContent =
          'Arrived ' + fmtRaceTime(arrived) + ' · ' +
          (deltaMin >= 0 ? '✓ ' : '⚠ ') + fmtDelta(deltaMin);
        statusEl.className = 'pace-status ' + (deltaMin >= 0 ? 'pace-ahead' : 'pace-behind');
      } else if (arrivedMs === null) {
        // Highlighted but no timestamp (legacy) — fall back to live compare.
        var liveDelta = Math.round((target - now) / 60000);
        statusEl.textContent =
          'Marked arrived (no timestamp) · ' +
          (liveDelta >= 0 ? '✓ ' : '⚠ ') + fmtDelta(liveDelta) + ' if now';
        statusEl.className = 'pace-status ' + (liveDelta >= 0 ? 'pace-ahead' : 'pace-behind');
      } else {
        // Not marked. Show predictive "would be X if arrived now".
        var predDelta = Math.round((target - now) / 60000);
        statusEl.textContent =
          'Tap card to mark arrived · would be ' + fmtDelta(predDelta) + ' now';
        statusEl.className = 'pace-status pace-pending';
      }
    });
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  paintHighlights();
  refreshPace();
  setInterval(refreshPace, 60000);

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-as]');
    if (!el) return;
    // Skip clicks on anchors, summaries, or anything inside the nested
    // gear/pace dropdowns — those have their own behavior.
    if (e.target.closest('a')) return;
    if (e.target.closest('summary')) return;
    if (e.target.closest('.gear-section, .pace-section')) return;
    var id = el.dataset.as;
    if (id in state) {
      delete state[id];
    } else {
      state[id] = Date.now();
    }
    save();
    paintHighlights();
    refreshPace();
  });
})();
</script>
</body>
</html>
`;

mkdirSync('build', { recursive: true });
writeFileSync('build/cocodona-phone.html', html);
console.log(`✓ Rendered ${html.length} bytes`);
