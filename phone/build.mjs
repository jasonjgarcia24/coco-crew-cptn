// phone/build.mjs — renders phone/*.md into a single self-contained HTML
// optimized for Android Chrome on a Pixel. Inline CSS, no JS deps, no network.
//
// Structure: two collapsible top-level sections (Aid Station Cards, Race Brief).
// H2 sub-sections inside each are also collapsible. Default open, except "Legend"
// (default closed). Anchors are placed on <details> elements so clicking a TOC
// link auto-opens the collapsed section in modern Chrome.

import { marked } from 'marked';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

marked.setOptions({ gfm: true, breaks: false });

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

// Wrap each H3 (AS card) + the content beneath it in a <div class="card …">
// alternating odd/even, so the page can paint a zebra-stripe background.
// Counter resets per H2 section (passed in as `body`) so each phase starts
// fresh from "odd". Used to make adjacent aid stations visually separable
// under fatigue.
function wrapCardsInBody(body) {
  const parts = body.split(/(?=<h3\b)/);
  if (parts.length === 0) return body;
  const firstIsH3 = parts[0].startsWith('<h3');
  if (!firstIsH3 && parts.length === 1) return body;  // no H3s in this section
  const head = firstIsH3 ? '' : parts[0];
  const cardParts = firstIsH3 ? parts : parts.slice(1);
  const cards = cardParts.map((card, i) => {
    const cls = i % 2 === 0 ? 'card card-odd' : 'card card-even';
    return `<div class="${cls}">${card}</div>`;
  });
  return head + cards.join('');
}

// Wrap each H2 section in <details> so it's collapsible. The id moves from the
// h2 to the <details> so anchor links auto-open the section.
//
// Note: JS String.split with a position-0 lookahead does NOT emit a leading
// empty string, so we have to detect whether parts[0] is itself an H2 section.
function wrapH2InDetails(html) {
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
      `<div class="h2-body">${wrapCardsInBody(body)}</div>` +
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

const briefHtml = wrapH2InDetails(addHeadingIds(marked.parse(briefMd)));
const cardsHtml = wrapH2InDetails(addHeadingIds(marked.parse(cardsMd)));

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
</body>
</html>
`;

mkdirSync('build', { recursive: true });
writeFileSync('build/cocodona-phone.html', html);
console.log(`✓ Rendered ${html.length} bytes`);
