import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const result = await build({
  entryPoints: [resolve(root, 'src/engine/index.ts')],
  bundle: true,
  format: 'iife',
  globalName: 'HF',
  write: false,
  target: 'es2019',
});
const engineJs = result.outputFiles[0].text;

const seedSets = {
  Kingmaker: [
    'Restov', 'Tuskwater', 'Pitax', 'New Stetven', 'Mivon', 'Tatzlford',
    'Varnhold', 'Nivakta\u2019s Crossing', 'Silverstep', 'Fort Drelev',
  ],
  Houses: [
    'House Surtova', 'House Orlovsky', 'House Lebeda', 'House Medvyed',
    'House Garess', 'House Lodovka', 'House Rogarvia', 'House Aldori',
  ],
  Random: Array.from({ length: 10 }, () => Math.random().toString(36).slice(2, 9)),
};

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Heraldry Weaver \u2014 Playground</title>
<style>
  :root { --bg:#1c1b18; --panel:#26241f; --line:#3a382f; --ink:#ece7d8; --muted:#a39e8c; --accent:#c9a44c; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: ui-sans-serif, system-ui, sans-serif; background:var(--bg); color:var(--ink); }
  header { padding:20px 24px; border-bottom:1px solid var(--line); display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; }
  h1 { font-size:20px; font-weight:600; margin:0; letter-spacing:.3px; }
  header .sub { color:var(--muted); font-size:13px; }
  .controls { padding:16px 24px; display:flex; gap:10px; align-items:center; flex-wrap:wrap; border-bottom:1px solid var(--line); }
  input[type=text] { background:var(--panel); border:1px solid var(--line); color:var(--ink); padding:8px 11px; border-radius:8px; font-size:14px; min-width:220px; }
  button { background:var(--panel); border:1px solid var(--line); color:var(--ink); padding:8px 14px; border-radius:8px; font-size:14px; cursor:pointer; }
  button:hover { border-color:var(--accent); }
  button.primary { background:var(--accent); color:#1c1b18; border-color:var(--accent); font-weight:600; }
  .tabs { display:flex; gap:6px; margin-left:auto; }
  .tabs button.active { border-color:var(--accent); color:var(--accent); }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:16px; padding:24px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:14px 12px 12px; text-align:center; cursor:pointer; transition:border-color .15s; }
  .card:hover { border-color:var(--accent); }
  .card svg { width:96px; height:auto; display:block; margin:0 auto 10px; }
  .card .name { font-size:14px; font-weight:600; }
  .card .blazon { font-size:11.5px; color:var(--muted); margin-top:3px; line-height:1.45; font-style:italic; }
  .inline-demo { padding:0 24px 28px; }
  .infobox { display:inline-block; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:4px 0; }
  .infobox table { border-collapse:collapse; font-size:13px; }
  .infobox td { padding:7px 14px; border-bottom:1px solid var(--line); }
  .infobox tr:last-child td { border-bottom:none; }
  .infobox td:first-child { color:var(--muted); }
  .infobox svg { height:1.1em; width:auto; vertical-align:-0.18em; }
  h2 { font-size:14px; color:var(--muted); font-weight:600; text-transform:uppercase; letter-spacing:.5px; padding:0 24px; margin:6px 0 0; }
</style>
</head>
<body>
<header>
  <h1>\u269c Heraldry Weaver</h1>
  <span class="sub">engine playground \u2014 v0.1.0-alpha.1 (Tier 0, self-drawn)</span>
</header>
<div class="controls">
  <input id="seed" type="text" placeholder="Type a name or seed\u2026 e.g. House Aldori">
  <button class="primary" id="render">Render</button>
  <button id="reroll">Random batch</button>
  <div class="tabs" id="tabs"></div>
</div>
<div class="grid" id="grid"></div>

<h2>Inline demo \u2014 shields inside a markdown-style infobox</h2>
<div class="inline-demo">
  <div class="infobox"><table id="infobox"></table></div>
</div>

<script>${engineJs}</script>
<script>
  const SEED_SETS = ${JSON.stringify(seedSets)};
  const grid = document.getElementById('grid');
  let activeSet = 'Kingmaker';

  function card(seed) {
    const arms = HF.generateArms(seed, 'pg-' + seed);
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = arms.svg +
      '<div class="name">' + escapeHtml(seed) + '</div>' +
      '<div class="blazon">' + escapeHtml(arms.blazon) + '</div>';
    el.title = 'Click to reroll this one with a fresh seed';
    el.onclick = () => {
      const fresh = seed + '~' + Math.random().toString(36).slice(2, 6);
      el.replaceWith(card(fresh));
    };
    return el;
  }

  function renderSet(name) {
    activeSet = name;
    grid.innerHTML = '';
    for (const s of SEED_SETS[name]) grid.appendChild(card(s));
    for (const b of document.querySelectorAll('#tabs button'))
      b.classList.toggle('active', b.dataset.set === name);
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  const tabs = document.getElementById('tabs');
  for (const name of Object.keys(SEED_SETS)) {
    const b = document.createElement('button');
    b.textContent = name; b.dataset.set = name;
    b.onclick = () => renderSet(name);
    tabs.appendChild(b);
  }

  document.getElementById('render').onclick = () => {
    const v = document.getElementById('seed').value.trim();
    if (!v) return;
    grid.prepend(card(v));
  };
  document.getElementById('seed').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('render').click();
  });
  document.getElementById('reroll').onclick = () => {
    SEED_SETS.Random = Array.from({ length: 10 }, () => Math.random().toString(36).slice(2, 9));
    renderSet('Random');
  };

  // inline infobox demo
  const ib = document.getElementById('infobox');
  const rows = [
    ['Capital', 'Restov'],
    ['Ruling house', 'House Surtova'],
    ['Vassal', 'House Lebeda'],
    ['Settlement', 'Tatzlford'],
  ];
  for (const [k, v] of rows) {
    const arms = HF.generateArms(v, 'ib-' + v);
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>' + k + '</td><td>' + arms.svg + ' ' + escapeHtml(v) + '</td>';
    ib.appendChild(tr);
  }

  renderSet('Kingmaker');
</script>
</body>
</html>
`;

const out = resolve(root, 'playground/heraldry-weaver-playground.html');
writeFileSync(out, html);
console.log('wrote', out, '(' + Math.round(html.length / 1024) + ' KB)');
