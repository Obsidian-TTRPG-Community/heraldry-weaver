// In-app heraldry guide content. Each entry pairs a short, historically
// flavoured note with an example Spec that the guide modal renders as a
// mini-shield. Kept as plain data so it stays testable and easy to extend.
import type { Spec, ShieldShape, OrdinaryType, Division, Variation, Tincture } from './engine/types';

export interface GuideEntry {
  name: string;
  note: string;
  spec: Spec;
}
export interface GuideSection {
  title: string;
  intro?: string;
  entries: GuideEntry[];
}

// --- small spec builders ----------------------------------------------------
const plain = (shield: ShieldShape, t: Tincture): Spec => ({
  shield,
  field: { mode: 'plain', tinctures: [t] },
  charges: [],
});
const ordinary = (type: OrdinaryType, field: Tincture, tinc: Tincture): Spec => ({
  shield: 'heater',
  field: { mode: 'plain', tinctures: [field] },
  ordinary: { type, tincture: tinc },
  charges: [],
});
const divided = (division: Division, a: Tincture, b: Tincture): Spec => ({
  shield: 'heater',
  field: { mode: 'division', division, tinctures: [a, b] },
  charges: [],
});
const varied = (variation: Variation, a: Tincture, b: Tincture): Spec => ({
  shield: 'heater',
  field: { mode: 'variation', variation, tinctures: [a, b] },
  charges: [],
});
const charge = (id: string, field: Tincture, tinc: Tincture, count = 1): Spec => ({
  shield: 'heater',
  field: { mode: 'plain', tinctures: [field] },
  charges: [{ charge: id, tincture: tinc, count, arrangement: count > 1 ? 'two-and-one' : 'one' }],
});

export const GUIDE_INTRO =
  'Heraldry is the medieval visual language of identity \u2014 a system for designing arms ' +
  'that stay recognisable on a banner or a battlefield. Its core safeguard is the rule of ' +
  'tincture: never place a colour on another colour, nor a metal on another metal. The ' +
  'contrast is what keeps a coat of arms legible at a distance.';

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    title: 'Shields',
    intro: 'The shield shape is the canvas. Styles tended to track era and region rather than rank.',
    entries: [
      { name: 'Heater', note: 'The classic "flat-iron" shield of the 13th\u201314th centuries; the workhorse of European arms.', spec: plain('heater', 'azure') },
      { name: 'French', note: 'Square-shouldered with a small central point at the base; common in later French armory.', spec: plain('french', 'gules') },
      { name: 'Spanish', note: 'Square shoulders flowing into a smoothly rounded base, typical of Iberian heraldry.', spec: plain('spanish', 'vert') },
      { name: 'Lozenge', note: 'A diamond, traditionally used to bear the arms of women and of the clergy.', spec: plain('lozenge', 'purpure') },
      { name: 'Round', note: 'A roundel or targe, echoing the round shields of antiquity and the Celtic world.', spec: plain('round', 'sable') },
    ],
  },
  {
    title: 'The field',
    intro: 'The field is the background on which everything else sits \u2014 the first decision in any design.',
    entries: [
      { name: 'Plain', note: 'A single tincture: the simplest and oldest treatment of the field.', spec: plain('heater', 'azure') },
      { name: 'Divided (party)', note: 'The field split into two tinctures along a line \u2014 a "party" field, as in "party per pale".', spec: divided('per-pale', 'or', 'azure') },
      { name: 'Variation', note: 'A repeating two-tincture pattern such as barry, paly or checky.', spec: varied('barry', 'argent', 'azure') },
    ],
  },
  {
    title: 'Divisions',
    intro: 'Lines of partition that cut the field in two. Often used to combine, or hint at, two identities.',
    entries: [
      { name: 'Per pale', note: 'Divided vertically down the centre.', spec: divided('per-pale', 'or', 'azure') },
      { name: 'Per fess', note: 'Divided horizontally across the middle.', spec: divided('per-fess', 'argent', 'gules') },
      { name: 'Per bend', note: 'Divided by a diagonal from the upper dexter (top-left) corner.', spec: divided('per-bend', 'or', 'sable') },
      { name: 'Per chevron', note: 'Divided by an inverted-V line.', spec: divided('per-chevron', 'argent', 'vert') },
      { name: 'Per saltire', note: 'Divided into four by a diagonal cross, giving alternating triangles.', spec: divided('per-saltire', 'azure', 'or') },
      { name: 'Quarterly', note: 'Divided into four quarters \u2014 the classic way to marshal several arms together.', spec: divided('quarterly', 'gules', 'argent') },
    ],
  },
  {
    title: 'Variations',
    intro: 'Repeating patterns of two tinctures across the whole field.',
    entries: [
      { name: 'Barry', note: 'Horizontal stripes of alternating tincture.', spec: varied('barry', 'argent', 'azure') },
      { name: 'Paly', note: 'Vertical stripes of alternating tincture.', spec: varied('paly', 'or', 'gules') },
      { name: 'Checky', note: 'A chequerboard of two tinctures.', spec: varied('checky', 'argent', 'sable') },
    ],
  },
  {
    title: 'Tinctures',
    intro: 'The fixed palette, named in Norman-French. Two metals and a handful of colours.',
    entries: [
      { name: 'Or', note: 'Gold \u2014 the most prestigious metal, drawn as yellow.', spec: plain('heater', 'or') },
      { name: 'Argent', note: 'Silver \u2014 usually drawn plain white.', spec: plain('heater', 'argent') },
      { name: 'Gules', note: 'Red \u2014 said to signify warrior strength and magnanimity.', spec: plain('heater', 'gules') },
      { name: 'Azure', note: 'Blue \u2014 associated with loyalty and truth.', spec: plain('heater', 'azure') },
      { name: 'Sable', note: 'Black \u2014 for constancy, and sometimes grief.', spec: plain('heater', 'sable') },
      { name: 'Vert', note: 'Green \u2014 a later addition, linked to hope and loyalty in love.', spec: plain('heater', 'vert') },
      { name: 'Purpure', note: 'Purple \u2014 the rarest colour, evoking royalty and rank.', spec: plain('heater', 'purpure') },
    ],
  },
  {
    title: 'Furs',
    intro: 'Patterned tinctures depicting heraldic fur linings. They count as neither metal nor colour, so they sit freely against either.',
    entries: [
      { name: 'Ermine', note: 'Black tails on white \u2014 the prized winter coat of the stoat, long a mark of high rank.', spec: plain('heater', 'ermine') },
      { name: 'Vair', note: 'Interlocking blue-and-white bells, representing squirrel pelts sewn back to back.', spec: plain('heater', 'vair') },
      { name: 'Potent', note: 'A variant of vair drawn with T-shaped "crutch" (potent) figures.', spec: plain('heater', 'potent') },
    ],
  },
  {
    title: 'Ordinaries',
    intro: 'The bold geometric bands \u2014 among the earliest and simplest charges, prized because they read instantly from afar.',
    entries: [
      { name: 'Chief', note: 'A broad band across the top of the shield, often granted as an honour.', spec: ordinary('chief', 'argent', 'gules') },
      { name: 'Pale', note: 'A vertical band down the centre.', spec: ordinary('pale', 'or', 'azure') },
      { name: 'Fess', note: 'A horizontal band across the middle.', spec: ordinary('fess', 'argent', 'sable') },
      { name: 'Bend', note: 'A diagonal band from dexter chief to sinister base (top-left to bottom-right).', spec: ordinary('bend', 'or', 'gules') },
      { name: 'Bend sinister', note: 'The reversed diagonal; historically sometimes a mark of illegitimacy.', spec: ordinary('bend-sinister', 'argent', 'vert') },
      { name: 'Chevron', note: 'An inverted V, traditionally likened to the rafters of a house.', spec: ordinary('chevron', 'or', 'azure') },
      { name: 'Cross', note: 'A central upright cross \u2014 the most iconic ordinary, with countless variants.', spec: ordinary('cross', 'argent', 'gules') },
      { name: 'Saltire', note: 'A diagonal cross, as borne by St Andrew.', spec: ordinary('saltire', 'azure', 'argent') },
      { name: 'Pile', note: 'A wedge driving down into the shield from the chief.', spec: ordinary('pile', 'or', 'gules') },
    ],
  },
  {
    title: 'Charges \u2014 geometric',
    intro: 'Charges are the figures placed on the field. These simple geometric devices are the always-available core set.',
    entries: [
      { name: 'Mullet', note: 'A star, originally a spur-rowel; five points unless stated otherwise.', spec: charge('mullet', 'azure', 'or') },
      { name: 'Roundel', note: 'A solid disc; named further by tincture (a red one is a "torteau").', spec: charge('roundel', 'argent', 'gules') },
      { name: 'Annulet', note: 'A ring \u2014 a symbol of fidelity, and a common mark of a fifth son.', spec: charge('annulet', 'or', 'sable') },
      { name: 'Lozenge', note: 'A diamond shape (also the shield form used for ladies\u2019 arms).', spec: charge('lozenge', 'gules', 'argent') },
      { name: 'Billet', note: 'An upright rectangle, thought to represent a folded letter or ingot.', spec: charge('billet', 'azure', 'or') },
      { name: 'Crescent', note: 'A moon with horns upward; also the cadency mark of a second son.', spec: charge('crescent', 'sable', 'argent') },
      { name: 'Cross', note: 'A free-standing cross used as a charge rather than as a field-spanning ordinary.', spec: charge('cross', 'argent', 'gules') },
      { name: 'Heart', note: 'A heart, famously borne (flaming) by the Douglas family of Scotland.', spec: charge('heart', 'or', 'gules') },
      { name: 'Tower', note: 'A fortified tower, a canting favourite for places and castle-keepers.', spec: charge('tower', 'azure', 'argent') },
      { name: 'Sword', note: 'A blade point-upward, signifying military honour and justice.', spec: charge('sword', 'gules', 'argent') },
      { name: 'Key', note: 'A key, emblem of guardianship and office (as in the keys of St Peter).', spec: charge('key', 'azure', 'or') },
    ],
  },
  {
    title: 'Charges \u2014 the bundled pack',
    intro: 'An optional pack (on by default) adds heraldic beasts and objects from game-icons.net. A few examples \u2014 many more are in the picker.',
    entries: [
      { name: 'Lion', note: 'The king of beasts and the commonest of all heraldic charges, denoting courage.', spec: charge('lion', 'gules', 'or') },
      { name: 'Fleur-de-lis', note: 'A stylised lily, emblem of French royalty and of purity.', spec: charge('fleur', 'azure', 'or', 3) },
      { name: 'Eagle', note: 'A displayed eagle, long an imperial device from Rome to the Holy Roman Empire.', spec: charge('eagle-emblem', 'or', 'sable') },
      { name: 'Crown', note: 'A crown, marking sovereignty, lordship, or civic authority.', spec: charge('crown', 'gules', 'or') },
      { name: 'Rose', note: 'The heraldic rose, most famous in the Wars of the Roses of 15th-century England.', spec: charge('rose', 'argent', 'gules') },
    ],
  },
];
