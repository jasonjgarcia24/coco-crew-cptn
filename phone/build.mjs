// phone/build.mjs — renders phone/*.md into a single self-contained HTML file
// optimized for Android Chrome on a Pixel. Inline CSS, no JS deps, no network.
// Anchor IDs auto-generated on every heading so the TOC + table cells can deep-link.

import { marked } from 'marked';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

marked.setOptions({ gfm: true, breaks: false });

// Slugify a heading's text for use as an anchor id.
function slugify(text) {
  return text.toLowerCase()
    .replace(/<[^>]+>/g, '')        // strip inline html
    .replace(/&[a-z]+;/g, '')       // strip html entities
    .replace(/[^\w\s-]/g, '')       // drop punctuation/emoji
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);
}

// Walk rendered HTML and add id="..." to every heading.
function addHeadingIds(html) {
  return html.replace(/<h([1-6])>(.+?)<\/h\1>/g, (_, level, inner) => {
    const slug = slugify(inner);
    return `<h${level} id="${slug}">${inner}</h${level}>`;
  });
}

// Extract h2 headings from raw markdown so we can build the TOC.
function extractH2(md) {
  return md.split('\n')
    .filter(l => /^## /.test(l))
    .map(l => l.replace(/^## /, '').trim())
    .map(text => ({ text, slug: slugify(text) }));
}

const briefMd = readFileSync('race-brief-phone.md', 'utf8');
const cardsMd = readFileSync('as-cards-phone.md', 'utf8');

const briefHtml = addHeadingIds(marked.parse(briefMd));
const cardsHtml = addHeadingIds(marked.parse(cardsMd));

const cardH2 = extractH2(cardsMd);
const glanceItem = cardH2.find(h => /Race-at-a-glance/i.test(h.text));
const glanceSlug = glanceItem ? glanceItem.slug : 'as-cards';

const dayLinks = cardH2
  .filter(h => /^DAY \d/i.test(h.text))
  .map(h => {
    const short = h.text.replace(/—.*$/, '').trim();  // "DAY 1"
    return `<a href="#${h.slug}">${short}</a>`;
  })
  .join('');

const builtAt = new Date().toLocaleString('en-US', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric', month: 'short', day: '2-digit',
  hour: '2-digit', minute: '2-digit',
});

const css = `
:root {
  --bg: #FFFFFF;
  --fg: #202124;
  --fg-soft: #5F6368;
  --accent: #1A73E8;
  --rule: #DADCE0;
  --pill-bg: #F1F3F4;
  --warn: #FCE5CD;
  --topbar-h: 56px;
  --toc-h: 52px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1F1F1F;
    --fg: #E8EAED;
    --fg-soft: #9AA0A6;
    --accent: #8AB4F8;
    --rule: #3C4043;
    --pill-bg: #292A2D;
    --warn: #5D4037;
  }
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
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 12px;
}
.topbar h1 { margin: 0; font-size: 17px; font-weight: 700; }
.topbar small { font-size: 11px; opacity: 0.7; white-space: nowrap; }
nav.toc {
  display: flex; flex-wrap: nowrap; gap: 6px;
  padding: 8px 12px;
  background: var(--bg);
  border-bottom: 1px solid var(--rule);
  position: sticky; top: var(--topbar-h); z-index: 9;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
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
main { padding: 0 16px; max-width: 760px; margin: 0 auto; }
section + section {
  border-top: 4px solid var(--rule);
  margin-top: 32px;
  padding-top: 12px;
}
h1, h2, h3 { line-height: 1.25; margin-top: 1.4em; margin-bottom: 0.4em; }
h1 { font-size: 26px; }
h2 {
  font-size: 22px;
  padding-bottom: 4px;
  border-bottom: 2px solid var(--rule);
}
h3 { font-size: 18px; color: var(--accent); }
h3 + ul, h3 + p { margin-top: 6px; }
p, li { font-size: 17px; }
ul, ol { padding-left: 22px; }
li { margin-bottom: 4px; }
strong { font-weight: 700; }
em { font-style: italic; }
hr { border: 0; border-top: 4px dashed var(--rule); margin: 24px 0; }
table {
  width: 100%; border-collapse: collapse;
  font-size: 14px;
  display: block; overflow-x: auto;
  margin: 12px 0;
  border: 1px solid var(--rule);
  -webkit-overflow-scrolling: touch;
}
th, td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--rule);
  white-space: nowrap;
  vertical-align: top;
}
th { background: var(--pill-bg); font-weight: 700; }
tr td:first-child, tr th:first-child { font-weight: 600; }
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
footer {
  text-align: center;
  padding: 24px 16px;
  color: var(--fg-soft);
  font-size: 13px;
  border-top: 1px solid var(--rule);
  margin-top: 32px;
}
`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
<meta name="theme-color" content="#202124">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<title>Cocodona 250 — Phone Pack</title>
<style>${css}</style>
</head>
<body>
<a id="top"></a>
<header class="topbar">
  <h1>🏃 Cocodona 250</h1>
  <small>built ${builtAt}</small>
</header>
<nav class="toc">
  <a href="#race-brief">📋 Brief</a>
  <a href="#${glanceSlug}">🗺️ At-a-glance</a>
  ${dayLinks}
</nav>
<main>
  <section id="race-brief">
    ${briefHtml}
  </section>
  <section id="as-cards">
    ${cardsHtml}
  </section>
</main>
<a class="fab" href="#top" aria-label="Back to top">⬆</a>
<footer>
  Solo · crewless · pacerless · offline-pack v${builtAt}
</footer>
</body>
</html>
`;

mkdirSync('build', { recursive: true });
writeFileSync('build/cocodona-phone.html', html);
console.log(`✓ Rendered ${html.length} bytes`);
