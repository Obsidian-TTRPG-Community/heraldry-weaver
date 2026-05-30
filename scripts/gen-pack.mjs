import { readFileSync, writeFileSync } from 'node:fs';

// Dev-time generator: reads curated game-icons.net SVGs (CC BY 3.0) from an
// extracted copy of github.com/game-icons/icons and bakes them into a TS module
// plus a CREDITS file. Not shipped; output (packCharges.ts, CREDITS.md) is.

const SRC = '/tmp/gi/icons-master';

// id (= slug), author folder, blazon label, article.
const LIST = [
  ['lion', 'lorc', 'lion', 'a'],
  ['eagle-emblem', 'lorc', 'eagle', 'an'],
  ['eagle-head', 'delapouite', "eagle's head", 'an'],
  ['wolf-head', 'lorc', "wolf's head", 'a'],
  ['bear-head', 'delapouite', "bear's head", 'a'],
  ['stag-head', 'lorc', "stag's head", 'a'],
  ['horse-head', 'delapouite', "horse's head", 'a'],
  ['boar', 'caro-asercion', 'boar', 'a'],
  ['dragon-head', 'lorc', "dragon's head", 'a'],
  ['griffin-symbol', 'delapouite', 'griffin', 'a'],
  ['fox-head', 'lorc', "fox's head", 'a'],
  ['bull-horns', 'lorc', "bull's horns", 'a'],
  ['raven', 'lorc', 'raven', 'a'],
  ['snake', 'lorc', 'serpent', 'a'],
  ['castle', 'delapouite', 'castle', 'a'],
  ['tower-flag', 'delapouite', 'tower', 'a'],
  ['anchor', 'lorc', 'anchor', 'an'],
  ['galleon', 'lorc', 'ship', 'a'],
  ['crown', 'badges', 'crown', 'a'],
  ['sun', 'badges', 'sun in splendour', 'a'],
  ['rose', 'lorc', 'rose', 'a'],
  ['oak-leaf', 'delapouite', 'oak leaf', 'an'],
  ['harp', 'delapouite', 'harp', 'a'],
  ['battle-axe', 'lorc', 'battle axe', 'a'],
  ['thor-hammer', 'delapouite', 'hammer', 'a'],
  ['trident', 'lorc', 'trident', 'a'],
  ['gauntlet', 'delapouite', 'gauntlet', 'a'],
  ['sword-brandish', 'delapouite', 'sword', 'a'],
];

const BG = /<path\b[^>]*\bd="M0 0h512v512H0z"[^>]*\/>/g;

const entries = [];
const creditLines = [];
for (const [slug, author, label, article] of LIST) {
  let svg = readFileSync(`${SRC}/${author}/${slug}.svg`, 'utf8').trim();
  svg = svg.replace(BG, '');
  entries.push({ id: slug, label, article, svg });
  creditLines.push(`- **${label}** (\`${slug}\`) — ${author}`);
}

const ts = `// AUTO-GENERATED. Bundled charge pack from game-icons.net (CC BY 3.0).
// Do not edit by hand — regenerate via scripts/gen-pack.mjs. See CREDITS.md.
import { chargeFromSvg } from './importCharge';
import type { ChargeDef } from './charges';

interface PackRaw { id: string; label: string; article: string; svg: string; }

const RAW: PackRaw[] = ${JSON.stringify(entries)};

export const PACK_CHARGES: ChargeDef[] = RAW.map((r) =>
  chargeFromSvg(r.id, r.svg, {
    recolor: true,
    label: r.label,
    article: r.article === 'an' ? 'an' : 'a',
  }),
);

export const PACK_IDS: string[] = PACK_CHARGES.map((c) => c.id);
`;
writeFileSync('src/engine/packCharges.ts', ts);

const credits = `# Credits

## Bundled charge pack

Heraldry Forge bundles a set of charge silhouettes from
[game-icons.net](https://game-icons.net), used under the
[Creative Commons Attribution 3.0 license (CC BY 3.0)](https://creativecommons.org/licenses/by/3.0/).
Backgrounds were removed and the icons are recoloured to the chosen tincture at
render time. Each charge and its artist:

${creditLines.join('\n')}

Artists: Lorc, Delapouite, Caro Asercion, and the game-icons.net "badges" set —
see https://game-icons.net for full author pages. CC BY 3.0 requires attribution
but not share-alike; this file satisfies that requirement.

## Plugin

Heraldry Forge plugin code is licensed MIT.
`;
writeFileSync('CREDITS.md', credits);

console.log(`Generated ${entries.length} pack charges -> src/engine/packCharges.ts`);
console.log(`Wrote CREDITS.md`);
