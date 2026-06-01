import { ItemView, WorkspaceLeaf, MarkdownView, Notice, Modal, App, Editor } from 'obsidian';
import { generate, type GenerateOptions } from './engine/generate';
import { generateName } from './engine/names';
import { toBlazon } from './engine/blazon';
import { renderSvg, furSwatchSvg } from './engine/render';
import { encodeSpec, decodeSpec } from './engine/config';
import {
  GENERATABLE, FIELD_TINCTURES, METALS, COLOURS, hexOf, labelOf, contrasts, tinctureClass,
  furInfo, makeFur, matchPreset, NAMED_FURS, FUR_PATTERNS, FUR_PRESETS,
  isCustomFur, listCustomFurs, makeCustomFur, parseCustomFur,
} from './engine/tinctures';
import { getCharge, chargeGroups, isImported, listImportedChargeIds } from './engine/charges';
import {
  shieldAssetGroups, getShieldAsset,
  ordinaryAssetGroups, getOrdinaryAsset, isImportedOrdinary,
  fieldAssetGroups, getFieldAsset,
  variationAssetGroups, getVariationAsset,
  listShieldAssetIds, listOrdinaryAssetIds, listFieldAssetIds, listVariationAssetIds,
} from './engine/assets';
import {
  SHIELDS, SHIELD_LABEL, POSITIONS, POSITION_LABEL, positionOf,
  DIVISIONS, VARIATIONS, ORDINARIES,
  DIVISION_LABEL, VARIATION_LABEL, ORDINARY_LABEL, ARRANGEMENT_LABEL,
  arrangementsFor,
} from './engine/options';
import type {
  Spec, Tincture, FieldMode, Division, Variation, OrdinaryType, Arrangement,
  ShieldShape, Position, ChargeGroup, FurPattern, Field,
} from './engine/types';
import { downloadSvg, exportPng, safeFilename } from './export';
import { HeraldryGuideModal } from './guideModal';
import type HeraldryWeaverPlugin from './main';

export const VIEW_TYPE_HERALDRY = 'heraldry-weaver-view';

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}
function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
function defaultContrast(t: Tincture): Tincture {
  return tinctureClass(t) === 'metal' ? 'gules' : 'argent';
}
function chargeLabel(id: string): string {
  return cap(getCharge(id)?.singular ?? id);
}

interface Roll {
  seed: string;
  name: string;
  spec: Spec;
}

export class HeraldryWeaverView extends ItemView {
  plugin: HeraldryWeaverPlugin;
  private mode: 'roll' | 'build' = 'roll';
  private label = '';
  private seed = randomSeed();
  private spec: Spec;
  private results: Roll[] = [];
  /** Custom/variant furs created via the fur editor this session, kept so they
   * stay available as swatches even after selecting another tincture. */
  private customFurs: Tincture[] = [];
  private previewShield?: HTMLElement;
  private previewBlazon?: HTMLElement;
  private previewName?: HTMLElement;

  constructor(leaf: WorkspaceLeaf, plugin: HeraldryWeaverPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.label = generateName(this.seed);
    this.spec = generate(this.seed, this.genOptions());
  }

  /** Imported asset pools fed to the random generator, when the user opts in. */
  private genOptions(): GenerateOptions {
    if (!this.plugin.settings.includeCustomInRolls) return {};
    return {
      shields: listShieldAssetIds(),
      charges: listImportedChargeIds(),
      ordinaries: listOrdinaryAssetIds(),
      fields: listFieldAssetIds(),
      variations: listVariationAssetIds(),
      furs: listCustomFurs().map((f) => makeCustomFur(f.id)),
    };
  }

  getViewType(): string { return VIEW_TYPE_HERALDRY; }
  getDisplayText(): string { return 'Heraldry Weaver'; }
  getIcon(): string { return 'shield'; }

  async onOpen(): Promise<void> { this.render(); }
  async onClose(): Promise<void> { this.contentEl.empty(); }

  /** Public so the plugin can refresh open panels (e.g. after reloading charges). */
  refresh(): void { this.render(); }

  // --- helpers ---------------------------------------------------------------

  private setSvg(parent: HTMLElement, svg: string): void {
    parent.empty();
    const node = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    parent.appendChild(node);
  }
  private activeEditor(): Editor | null {
    // The side panel holds focus when its buttons are clicked, so the "active"
    // view isn't the note. Fall back to the most recently focused main-area
    // leaf, which is the note the user was editing.
    let view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      const leaf = this.app.workspace.getMostRecentLeaf();
      if (leaf && leaf.view instanceof MarkdownView) view = leaf.view;
    }
    if (!view) return null;
    if (view.getMode() === 'preview') return null; // reading view has no insert point
    return view.editor;
  }
  private named(): boolean { return this.label.trim().length > 0; }

  private select(seed: string, name: string, spec?: Spec): void {
    this.seed = seed;
    this.label = name;
    this.spec = spec ?? generate(seed, this.genOptions());
  }

  /** Resolve a custom name source in the background and apply it if it returns,
   *  so a slow/hung provider never blocks the visible roll. Ignored if the user
   *  has rolled again (seed changed) in the meantime. */
  private async upgradeName(seed: string): Promise<void> {
    try {
      const name = await this.plugin.resolveName(seed);
      if (name && this.seed === seed && name !== this.label) {
        this.label = name;
        this.render();
      }
    } catch {
      /* keep the built-in name already shown */
    }
  }

  /** Same as upgradeName but for a 9-result grid. */
  private async upgradeNames(): Promise<void> {
    const target = this.results;
    const seeds = target.map((r) => r.seed);
    try {
      const names = await Promise.all(seeds.map((s) => this.plugin.resolveName(s).catch(() => null)));
      if (this.results !== target) return; // user rolled again; these names are stale
      let changed = false;
      target.forEach((r, i) => {
        if (names[i] && names[i] !== r.name) { r.name = names[i] as string; changed = true; }
      });
      if (!changed) return;
      const sel = target.find((r) => r.seed === this.seed);
      if (sel) this.label = sel.name;
      this.render();
    } catch {
      /* keep built-in names */
    }
  }

  private async ensureSaved(): Promise<boolean> {
    if (!this.named()) {
      new Notice('Name the arms first (type a name in the box).');
      return false;
    }
    await this.plugin.saveArms(this.label.trim(), this.spec);
    return true;
  }

  // --- spec editing (build mode) ---------------------------------------------

  private setFieldMode(mode: FieldMode): void {
    const f = this.spec.field;
    if (mode === 'plain') {
      this.spec.field = { mode: 'plain', tinctures: [f.tinctures[0] ?? 'azure'] };
      return;
    }
    if (mode === 'image') {
      const first = fieldAssetGroups()[0]?.ids[0];
      this.spec.field = { mode: 'image', tinctures: [f.tinctures[0] ?? 'azure'], image: f.image ?? first, keepColour: f.keepColour ?? true, bg: f.bg ?? 'argent' };
      return;
    }
    const t0 = f.tinctures[0] ?? 'or';
    const t1 = f.tinctures[1] ?? defaultContrast(t0);
    if (mode === 'division') {
      this.spec.field = { mode, tinctures: [t0, t1], division: f.division ?? 'per-pale' };
    } else {
      this.spec.field = { mode, tinctures: [t0, t1], variation: f.variation ?? 'barry' };
    }
  }

  private setOrdinary(type: OrdinaryType | ''): void {
    if (!type) {
      this.spec.ordinary = undefined;
      return;
    }
    const prim = this.spec.field.tinctures[0];
    this.spec.ordinary = {
      type,
      tincture: this.spec.ordinary?.tincture ?? defaultContrast(prim),
      keepColour: this.spec.ordinary?.keepColour,
      colourMap: this.spec.ordinary?.colourMap,
    };
  }

  private addCharge(): void {
    const prim = this.spec.field.tinctures[0];
    this.spec.charges.push({
      charge: 'mullet',
      tincture: defaultContrast(prim),
      count: 1,
      arrangement: 'one',
      position: 'center',
    });
  }

  private removeCharge(i: number): void {
    this.spec.charges.splice(i, 1);
  }

  private setChargeCount(g: ChargeGroup, count: number): void {
    g.count = count;
    const valid = arrangementsFor(count);
    if (!valid.includes(g.arrangement)) g.arrangement = valid[0];
  }

  private ruleHint(): string | null {
    const f = this.spec.field;
    if (f.mode !== 'plain') return null;
    const prim = f.tinctures[0];
    if (tinctureClass(prim) === 'fur') return null; // furs are neutral
    if (this.spec.ordinary && !contrasts(prim, this.spec.ordinary.tincture)) {
      return 'Breaks the rule of tincture (like on like).';
    }
    if (this.spec.charges.some((g) => !contrasts(prim, g.tincture))) {
      return 'Breaks the rule of tincture (like on like).';
    }
    return null;
  }

  // --- small UI builders -----------------------------------------------------

  private selectRow(
    parent: HTMLElement,
    label: string,
    options: [string, string][],
    current: string,
    onChange: (v: string) => void,
  ): void {
    const row = parent.createDiv({ cls: 'hw-field' });
    row.createSpan({ cls: 'hw-field-label', text: label });
    const sel = row.createEl('select', { cls: 'hw-select' });
    for (const [val, lab] of options) {
      const o = sel.createEl('option', { text: lab, value: val });
      if (val === current) o.selected = true;
    }
    sel.onchange = () => onChange(sel.value);
  }

  /** Charge "Type" picker, grouped into <optgroup>s by category (built-in,
   *  pack, then imported subfolders) once there's more than one group. */
  private chargeTypeRow(
    parent: HTMLElement,
    current: string,
    onChange: (v: string) => void,
  ): void {
    const row = parent.createDiv({ cls: 'hw-field' });
    row.createSpan({ cls: 'hw-field-label', text: 'Type' });
    const sel = row.createEl('select', { cls: 'hw-select' });
    const groups = chargeGroups();
    const flat = groups.length <= 1;
    for (const grp of groups) {
      const target = flat
        ? sel
        : sel.createEl('optgroup', { attr: { label: grp.label } });
      for (const id of grp.ids) {
        const o = target.createEl('option', { text: chargeLabel(id), value: id });
        if (id === current) o.selected = true;
      }
    }
    sel.onchange = () => onChange(sel.value);
  }

  /** Which imported asset's colour (scope + lower-cased hex) currently has its
   *  remap palette open, if any. Scope is `c<index>` for a charge, `ord` for the
   *  ordinary. */
  private colourEdit: { scope: string; hex: string } | null = null;

  /** Shared "Original colours" toggle + per-colour remap palette for any target
   *  carrying { keepColour, colourMap } (imported charge or ordinary). */
  private colourEditor(
    card: HTMLElement,
    target: { keepColour?: boolean; colourMap?: Record<string, string> },
    palette: string[],
    scope: string,
  ): void {
    const row = card.createDiv({ cls: 'hw-field' });
    row.createSpan({ cls: 'hw-field-label', text: 'Colours' });
    const pill = row.createEl('button', { cls: 'hw-pill', text: 'Original colours' });
    pill.title = 'Keep the artwork\u2019s own colours (then recolour individual ones below)';
    if (target.keepColour) pill.addClass('is-selected');
    pill.onclick = () => {
      target.keepColour = !target.keepColour;
      if (!target.keepColour) this.colourEdit = null;
      this.render();
    };

    if (!target.keepColour || !palette.length) return;

    const palRow = card.createDiv({ cls: 'hw-field hw-field-swatches' });
    palRow.createSpan({ cls: 'hw-field-label', text: `Recolour (${palette.length})` });
    const sw = palRow.createDiv({ cls: 'hw-swatches' });
    for (const orig of palette) {
      const key = orig.toLowerCase();
      const mapped = target.colourMap?.[key];
      const b = sw.createEl('button', { cls: 'hw-swatch' });
      b.style.background = mapped ?? orig;
      b.title = mapped ? `${orig} \u2192 ${mapped}` : orig;
      if (mapped) b.addClass('is-mapped');
      if (this.colourEdit && this.colourEdit.scope === scope && this.colourEdit.hex === key) {
        b.addClass('is-selected');
      }
      b.onclick = () => {
        const open = this.colourEdit?.scope === scope && this.colourEdit?.hex === key;
        this.colourEdit = open ? null : { scope, hex: key };
        this.render();
      };
    }

    if (this.colourEdit && this.colourEdit.scope === scope) {
      const key = this.colourEdit.hex;
      const ed = card.createDiv({ cls: 'hw-field hw-field-swatches hw-colour-editor' });
      ed.createSpan({ cls: 'hw-field-label', text: 'Map to' });
      const opts = ed.createDiv({ cls: 'hw-swatches' });
      const reset = opts.createEl('button', { cls: 'hw-swatch hw-swatch-reset', text: '\u21ba' });
      reset.title = 'Keep original colour';
      reset.style.background = key;
      if (!target.colourMap?.[key]) reset.addClass('is-selected');
      reset.onclick = () => {
        if (target.colourMap) {
          delete target.colourMap[key];
          if (!Object.keys(target.colourMap).length) delete target.colourMap;
        }
        this.render();
      };
      for (const t of GENERATABLE.filter((x) => tinctureClass(x) !== 'fur')) {
        const hex = hexOf(t);
        const b = opts.createEl('button', { cls: 'hw-swatch' });
        b.style.background = hex;
        b.title = labelOf(t);
        if ((target.colourMap?.[key] ?? '').toLowerCase() === hex.toLowerCase()) b.addClass('is-selected');
        b.onclick = () => {
          target.colourMap = { ...(target.colourMap ?? {}), [key]: hex };
          this.render();
        };
      }
    }
  }

  /** Colour controls for an imported charge instance. */
  private colourControls(card: HTMLElement, g: ChargeGroup, ci: number): void {
    if (!isImported(g.charge)) return;
    this.colourEditor(card, g, getCharge(g.charge)?.palette ?? [], `c${ci}`);
  }

  /** A select combining built-in options with imported asset groups. Built-ins
   *  go under a "Built-in" optgroup once any imported group is present. */
  private groupedSelect(
    parent: HTMLElement,
    label: string,
    base: [string, string][],
    groups: { label: string; ids: string[] }[],
    idLabel: (id: string) => string,
    current: string,
    onChange: (v: string) => void,
  ): void {
    const row = parent.createDiv({ cls: 'hw-field' });
    row.createSpan({ cls: 'hw-field-label', text: label });
    const sel = row.createEl('select', { cls: 'hw-select' });
    const baseTarget = groups.length
      ? sel.createEl('optgroup', { attr: { label: 'Built-in' } })
      : sel;
    for (const [val, lab] of base) {
      const o = baseTarget.createEl('option', { text: lab, value: val });
      if (val === current) o.selected = true;
    }
    for (const grp of groups) {
      const og = sel.createEl('optgroup', { attr: { label: grp.label } });
      for (const id of grp.ids) {
        const o = og.createEl('option', { text: idLabel(id), value: id });
        if (id === current) o.selected = true;
      }
    }
    sel.onchange = () => onChange(sel.value);
  }

  private swatchRow(
    parent: HTMLElement,
    label: string,
    current: Tincture,
    onPick: (t: Tincture) => void,
    palette: readonly Tincture[] = GENERATABLE,
  ): HTMLElement {
    const row = parent.createDiv({ cls: 'hw-field hw-field-swatches' });
    row.createSpan({ cls: 'hw-field-label', text: label });
    const sw = row.createDiv({ cls: 'hw-swatches' });
    for (const t of palette) {
      const b = sw.createEl('button', { cls: 'hw-swatch' });
      b.title = labelOf(t);
      b.setAttr('aria-label', labelOf(t));
      if (tinctureClass(t) === 'fur') {
        // Show the actual fur pattern so it's distinguishable from a plain
        // metal/colour swatch (ermine vs argent, vair vs azure).
        b.addClass('hw-swatch-fur');
        const node = new DOMParser()
          .parseFromString(furSwatchSvg(t), 'image/svg+xml')
          .documentElement;
        b.appendChild(node);
      } else {
        b.style.background = hexOf(t);
      }
      if (t === current) b.addClass('is-selected');
      b.onclick = () => onPick(t);
    }
    return sw;
  }

  /**
   * A field tincture row: the standard swatches plus, for furs, the currently
   * selected fur (so variants/customs stay visible) and a button to open the
   * fur editor.
   */
  private fieldTinctureRow(parent: HTMLElement, label: string, idx: number): void {
    const cur = this.spec.field.tinctures[idx];
    const sw = this.swatchRow(
      parent, label, cur,
      (t) => { this.spec.field.tinctures[idx] = t; this.render(); },
      FIELD_TINCTURES,
    );
    // Surface custom/variant furs (the current one, plus any made this session)
    // as selectable swatches so picking another tincture never loses them.
    this.rememberFur(cur);
    const extras = [...this.customFurs];
    if ((furInfo(cur) || isCustomFur(cur)) && !FIELD_TINCTURES.includes(cur) && !extras.includes(cur)) {
      extras.unshift(cur);
    }
    for (const fur of extras) {
      const b = sw.createEl('button', { cls: 'hw-swatch hw-swatch-fur' });
      if (fur === cur) b.addClass('is-selected');
      b.title = labelOf(fur);
      b.setAttr('aria-label', labelOf(fur));
      b.appendChild(new DOMParser().parseFromString(furSwatchSvg(fur), 'image/svg+xml').documentElement);
      b.onclick = () => { this.spec.field.tinctures[idx] = fur; this.render(); };
    }
    const more = sw.createEl('button', { cls: 'hw-swatch hw-swatch-more', text: '\u2026' });
    more.title = 'Fur variants & custom';
    more.setAttr('aria-label', 'Fur variants and custom');
    more.onclick = () => this.openFurEditor(idx);
  }

  /** Background tincture for an image field (fills any transparent areas of the
   *  art). A "none" chip keeps it transparent. */
  private backgroundRow(parent: HTMLElement, field: Field): void {
    const row = parent.createDiv({ cls: 'hw-field hw-field-swatches' });
    row.createSpan({ cls: 'hw-field-label', text: 'Background' });
    const sw = row.createDiv({ cls: 'hw-swatches' });
    const mark = (el: HTMLElement): void => {
      sw.querySelectorAll('.hw-swatch').forEach((e) => e.removeClass('is-selected'));
      el.addClass('is-selected');
    };
    const none = sw.createEl('button', { cls: 'hw-swatch hw-swatch-reset', text: '\u2298' });
    none.title = 'No background (transparent)';
    none.setAttr('aria-label', 'No background');
    if (!field.bg) none.addClass('is-selected');
    none.onclick = () => { delete field.bg; mark(none); this.render(); };
    for (const t of [...METALS, ...COLOURS] as Tincture[]) {
      const b = sw.createEl('button', { cls: 'hw-swatch' });
      b.style.background = hexOf(t);
      b.title = labelOf(t);
      b.setAttr('aria-label', labelOf(t));
      if (field.bg === t) b.addClass('is-selected');
      b.onclick = () => { field.bg = t; mark(b); this.render(); };
    }
  }

  private openGuide(): void {
    new HeraldryGuideModal(this.app, this.plugin.settings.outline).open();
  }

  private openFurEditor(idx: number): void {
    new FurEditorModal(
      this.app,
      this.spec.field.tinctures[idx],
      (fur) => {
        this.spec.field.tinctures[idx] = fur;
        this.rememberFur(fur);
        this.render();
      },
    ).open();
  }

  /** Keep a created variant/custom fur in the swatch row for the session. */
  private rememberFur(t: Tincture): void {
    if ((furInfo(t) || isCustomFur(t)) && !FIELD_TINCTURES.includes(t) && !this.customFurs.includes(t)) {
      this.customFurs.push(t);
    }
  }

  private sliderRow(
    parent: HTMLElement,
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    fmt: (v: number) => string,
    onInput: (v: number) => void,
  ): void {
    const row = parent.createDiv({ cls: 'hw-field' });
    row.createSpan({ cls: 'hw-field-label', text: label });
    const wrap = row.createDiv({ cls: 'hw-slider-wrap' });
    const slider = wrap.createEl('input', { cls: 'hw-slider' });
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(value);
    const out = wrap.createSpan({ cls: 'hw-slider-value', text: fmt(value) });
    // Live preview on drag (oninput); never rebuilds controls, so focus holds.
    slider.oninput = () => {
      const v = Number(slider.value);
      out.setText(fmt(v));
      onInput(v);
    };
  }

  private positionGrid(
    parent: HTMLElement,
    current: Position,
    onPick: (p: Position) => void,
  ): void {
    const row = parent.createDiv({ cls: 'hw-field' });
    row.createSpan({ cls: 'hw-field-label', text: 'Position' });
    const grid = row.createDiv({ cls: 'hw-posgrid' });
    for (const p of POSITIONS) {
      const cell = grid.createEl('button', { cls: 'hw-poscell' });
      cell.setAttr('aria-label', POSITION_LABEL[p]);
      cell.title = POSITION_LABEL[p];
      cell.createSpan({ cls: 'hw-posdot' });
      if (p === current) cell.addClass('is-selected');
      cell.onclick = () => onPick(p);
    }
  }

  // --- render ----------------------------------------------------------------

  private render(): void {
    const root = this.contentEl;
    const scrollTop = root.scrollTop;
    root.empty();
    root.addClass('hw-view');

    // mode tabs
    const tabs = root.createDiv({ cls: 'hw-tabs' });
    const rollTab = tabs.createEl('button', { text: 'Roll' });
    const buildTab = tabs.createEl('button', { text: 'Build' });
    rollTab.toggleClass('is-active', this.mode === 'roll');
    buildTab.toggleClass('is-active', this.mode === 'build');
    rollTab.onclick = () => { this.mode = 'roll'; this.render(); };
    buildTab.onclick = () => { this.mode = 'build'; this.render(); };
    const guideTab = tabs.createEl('button', { text: 'Guide', cls: 'hw-guide-btn' });
    guideTab.title = 'Heraldry guide — terms, options & examples';
    guideTab.onclick = () => this.openGuide();

    // shared name box
    const controls = root.createDiv({ cls: 'hw-view-controls' });
    const input = controls.createEl('input', { type: 'text', placeholder: 'Name\u2026' });
    input.value = this.label;
    input.addEventListener('input', () => { this.label = input.value; });

    if (this.mode === 'roll') {
      const genBtn = controls.createEl('button', { text: 'Generate' });
      genBtn.onclick = () => {
        const v = input.value.trim();
        const seed = v || randomSeed();
        // Show the arms immediately with an instant built-in name; if a custom
        // name source is configured, upgrade the name asynchronously so a slow
        // or hung provider can never block the roll.
        this.select(seed, v || generateName(seed));
        this.results = [];
        this.render();
        if (!v) void this.upgradeName(seed);
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') genBtn.click();
      });

      const rolls = root.createDiv({ cls: 'hw-buttons' });
      rolls.createEl('button', { text: 'Roll 1' }).onclick = () => {
        const seed = randomSeed();
        this.select(seed, generateName(seed));
        this.results = [];
        this.render();
        void this.upgradeName(seed);
      };
      rolls.createEl('button', { text: 'Roll 9' }).onclick = () => {
        // Generate 9 visually distinct results — reroll on a repeated blazon so
        // the grid never shows the same arms twice.
        const picked: { seed: string; spec: Spec }[] = [];
        const seen = new Set<string>();
        const opts = this.genOptions();
        for (let guard = 0; picked.length < 9 && guard < 300; guard++) {
          const seed = randomSeed();
          const spec = generate(seed, opts);
          const key = toBlazon(spec);
          if (seen.has(key)) continue;
          seen.add(key);
          picked.push({ seed, spec });
        }
        this.results = picked.map((p) => ({ seed: p.seed, name: generateName(p.seed), spec: p.spec }));
        const first = this.results[0];
        this.select(first.seed, first.name, first.spec);
        this.render();
        void this.upgradeNames();
      };
    } else {
      this.renderBuilder(root);
    }

    this.renderPreview(root);
    this.renderActions(root);
    if (this.mode === 'roll' && this.results.length > 1) this.renderResults(root);
    this.renderLibrary(root);
    // Rebuilding the panel resets scroll to the top; restore where the user was
    // so tweaking a charge/tincture doesn't jump the view.
    root.scrollTop = scrollTop;
  }

  private renderBuilder(root: HTMLElement): void {
    const panel = root.createDiv({ cls: 'hw-builder' });
    const f = this.spec.field;

    this.groupedSelect(
      panel, 'Shield',
      SHIELDS.map((s) => [s, SHIELD_LABEL[s]] as [string, string]),
      shieldAssetGroups(),
      (id) => getShieldAsset(id)?.label ?? id,
      this.spec.shield,
      (v) => { this.spec.shield = v as ShieldShape; this.render(); },
    );

    const fieldModes: [string, string][] = [['plain', 'Plain'], ['division', 'Divided'], ['variation', 'Variation']];
    if (fieldAssetGroups().length) fieldModes.push(['image', 'Image']);
    this.selectRow(
      panel, 'Field', fieldModes, f.mode,
      (v) => { this.setFieldMode(v as FieldMode); this.render(); },
    );

    if (f.mode === 'image') {
      this.groupedSelect(
        panel, 'Image', [], fieldAssetGroups(),
        (id) => getFieldAsset(id)?.label ?? id,
        f.image ?? '',
        (v) => { this.spec.field.image = v; delete this.spec.field.colourMap; this.colourEdit = null; this.render(); },
      );
      this.sliderRow(
        panel, 'Image size', f.scale ?? 1, 0.5, 2.5, 0.05,
        (v) => `${v.toFixed(2)}\u00d7`,
        (v) => { this.spec.field.scale = v; this.refreshPreview(); },
      );
      this.sliderRow(
        panel, 'Offset X', f.offsetX ?? 0, -50, 50, 1,
        (v) => (v === 0 ? 'centre' : `${v > 0 ? '+' : ''}${v}%`),
        (v) => { this.spec.field.offsetX = v; this.refreshPreview(); },
      );
      this.sliderRow(
        panel, 'Offset Y', f.offsetY ?? 0, -50, 50, 1,
        (v) => (v === 0 ? 'centre' : `${v > 0 ? '+' : ''}${v}%`),
        (v) => { this.spec.field.offsetY = v; this.refreshPreview(); },
      );
      this.backgroundRow(panel, this.spec.field);
      this.colourEditor(panel, this.spec.field, (f.image ? getFieldAsset(f.image)?.palette : undefined) ?? [], 'field');
      // When the art is flattened to a silhouette, expose the fill tincture.
      if (this.spec.field.keepColour === false) {
        this.fieldTinctureRow(panel, 'Tincture', 0);
      }
    } else {
      this.fieldTinctureRow(panel, f.mode === 'plain' ? 'Tincture' : 'Tincture 1', 0);
      if (f.mode !== 'plain') {
        this.fieldTinctureRow(panel, 'Tincture 2', 1);
        if (f.mode === 'division') {
          this.selectRow(
            panel, 'Division',
            DIVISIONS.map((d) => [d, DIVISION_LABEL[d]] as [string, string]),
            f.division ?? 'per-pale',
            (v) => { this.spec.field.division = v as Division; this.render(); },
          );
        } else {
          this.groupedSelect(
            panel, 'Variation',
            VARIATIONS.map((v) => [v, VARIATION_LABEL[v]] as [string, string]),
            variationAssetGroups(),
            (id) => getVariationAsset(id)?.label ?? id,
            f.variation ?? 'barry',
            (v) => { this.spec.field.variation = v as Variation; this.render(); },
          );
        }
      }
    }

    this.groupedSelect(
      panel, 'Ordinary',
      [['', 'None'], ...ORDINARIES.map((o) => [o, ORDINARY_LABEL[o]] as [string, string])],
      ordinaryAssetGroups(),
      (id) => getOrdinaryAsset(id)?.singular ?? id,
      this.spec.ordinary?.type ?? '',
      (v) => { this.setOrdinary(v as OrdinaryType | ''); this.render(); },
    );
    if (this.spec.ordinary) {
      const o = this.spec.ordinary;
      const importedOrd = isImportedOrdinary(o.type);
      if (!importedOrd || !o.keepColour) {
        this.swatchRow(
          panel, 'Ordinary tincture', o.tincture,
          (t) => { o.tincture = t; this.render(); },
        );
      }
      if (importedOrd) {
        this.colourEditor(panel, o, getOrdinaryAsset(o.type)?.palette ?? [], 'ord');
        this.sliderRow(
          panel, 'Ordinary size', o.scale ?? 1, 0.3, 2.5, 0.05,
          (v) => `${v.toFixed(2)}\u00d7`,
          (v) => { o.scale = v; this.refreshPreview(); },
        );
        this.sliderRow(
          panel, 'Centre offset', o.offsetX ?? 0, -50, 50, 1,
          (v) => (v === 0 ? 'centre' : `${v > 0 ? '+' : ''}${v}%`),
          (v) => { o.offsetX = v; this.refreshPreview(); },
        );
      }
    }

    // Layered charges: each group is an independent card.
    const charges = panel.createDiv({ cls: 'hw-charges' });
    this.spec.charges.forEach((g, i) => {
      const card = charges.createDiv({ cls: 'hw-charge-card' });
      const head = card.createDiv({ cls: 'hw-charge-head' });
      head.createSpan({ cls: 'hw-charge-title', text: `Charge ${i + 1}` });
      head.createEl('button', { cls: 'hw-charge-remove', text: '\u00d7' }).onclick = () => {
        this.removeCharge(i);
        this.render();
      };

      this.chargeTypeRow(
        card,
        g.charge,
        (v) => { g.charge = v; delete g.colourMap; this.colourEdit = null; this.render(); },
      );
      // The single-tincture swatch only applies when the charge is being
      // recoloured; for imported art kept in its own colours, the per-colour
      // palette (below) governs instead, so drop the redundant row.
      if (!isImported(g.charge) || !g.keepColour) {
        this.swatchRow(
          card, 'Tincture', g.tincture,
          (t) => { g.tincture = t; this.render(); },
        );
      }
      this.colourControls(card, g, i);
      this.positionGrid(
        card, positionOf(g),
        (p) => { g.position = p; this.render(); },
      );
      this.selectRow(
        card, 'Count',
        [['1', '1'], ['2', '2'], ['3', '3']],
        String(g.count),
        (v) => { this.setChargeCount(g, Number(v)); this.render(); },
      );
      const arrs = arrangementsFor(g.count);
      if (positionOf(g) === 'center' && arrs.length > 1) {
        this.selectRow(
          card, 'Arrangement',
          arrs.map((a) => [a, ARRANGEMENT_LABEL[a]] as [string, string]),
          g.arrangement,
          (v) => { g.arrangement = v as Arrangement; this.render(); },
        );
      }
      this.sliderRow(
        card, 'Size', g.scale ?? 1, 0.3, 1.8, 0.05,
        (v) => `${Math.round(v * 100)}%`,
        (v) => { g.scale = v; this.refreshPreview(); },
      );

      const mirror = card.createDiv({ cls: 'hw-field' });
      mirror.createSpan({ cls: 'hw-field-label', text: 'Mirror' });
      const toggles = mirror.createDiv({ cls: 'hw-toggles' });
      const hb = toggles.createEl('button', { cls: 'hw-toggle', text: '\u21c4' });
      hb.title = 'Mirror horizontally';
      if (g.flipX) hb.addClass('is-selected');
      hb.onclick = () => { g.flipX = !g.flipX; hb.toggleClass('is-selected', !!g.flipX); this.refreshPreview(); };
      const vb = toggles.createEl('button', { cls: 'hw-toggle', text: '\u21c5' });
      vb.title = 'Flip vertically';
      if (g.flipY) vb.addClass('is-selected');
      vb.onclick = () => { g.flipY = !g.flipY; vb.toggleClass('is-selected', !!g.flipY); this.refreshPreview(); };
    });

    const addRow = panel.createDiv({ cls: 'hw-field' });
    addRow.createEl('button', { cls: 'hw-add-charge', text: '+ Add charge' }).onclick = () => {
      this.addCharge();
      this.render();
    };
  }

  private renderPreview(root: HTMLElement): void {
    const preview = root.createDiv({ cls: 'hw-view-preview' });
    const shield = preview.createDiv({ cls: 'hw-shield' });
    this.setSvg(shield, renderSvg(this.spec, { uid: `view-${uid()}`, outline: this.plugin.settings.outline }));
    const nameEl = preview.createDiv({ cls: 'hw-block-name', text: this.named() ? this.label : 'Unnamed' });
    const blazon = preview.createDiv({ cls: 'hw-block-blazon', text: toBlazon(this.spec) });
    const hint = this.ruleHint();
    if (hint) preview.createDiv({ cls: 'hw-rule-hint', text: hint });
    this.previewShield = shield;
    this.previewBlazon = blazon;
    this.previewName = nameEl;
  }

  /** Re-render just the preview (shield + blazon + name) without rebuilding controls. */
  private refreshPreview(): void {
    if (this.previewShield) {
      this.setSvg(
        this.previewShield,
        renderSvg(this.spec, { uid: `view-${uid()}`, outline: this.plugin.settings.outline }),
      );
    }
    if (this.previewBlazon) this.previewBlazon.setText(toBlazon(this.spec));
    if (this.previewName) this.previewName.setText(this.named() ? this.label : 'Unnamed');
  }

  private renderActions(root: HTMLElement): void {
    const actions = root.createDiv({ cls: 'hw-buttons' });
    actions.createEl('button', { text: 'Save' }).onclick = async () => {
      if (await this.ensureSaved()) {
        new Notice(`Saved arms: ${this.label.trim()}`);
        this.render();
      }
    };
    actions.createEl('button', { text: 'Copy reference' }).onclick = async () => {
      if (!(await this.ensureSaved())) return;
      await navigator.clipboard.writeText(`\`${this.plugin.settings.inlinePrefix}${this.label.trim()}\``);
      new Notice('Saved & copied inline reference.');
    };
    actions.createEl('button', { text: 'Insert block' }).onclick = () => {
      const editor = this.activeEditor();
      if (!editor) { new Notice('Open a note in editing view (not reading mode) first.'); return; }
      editor.replaceSelection(this.blockText());
      new Notice('Inserted heraldry block.');
    };
    actions.createEl('button', { text: 'SVG' }).onclick = () =>
      downloadSvg(renderSvg(this.spec, { uid: 'export', outline: this.plugin.settings.outline }), `${safeFilename(this.label || 'arms')}.svg`);
    actions.createEl('button', { text: 'PNG' }).onclick = () =>
      exportPng(renderSvg(this.spec, { uid: 'export', outline: this.plugin.settings.outline }), this.plugin.settings.pngSize, `${safeFilename(this.label || 'arms')}.png`)
        .catch((e: Error) => new Notice(`PNG export failed: ${e.message}`));
    actions.createEl('button', { text: 'Copy config' }).onclick = async () => {
      await navigator.clipboard.writeText(encodeSpec(this.spec));
      new Notice('Config copied — share it to reproduce these arms.');
    };
    actions.createEl('button', { text: 'Import config' }).onclick = () => {
      new ImportConfigModal(this.app, (text) => {
        const spec = decodeSpec(text);
        if (!spec) {
          new Notice('Could not read that config.');
          return;
        }
        this.mode = 'build';
        this.spec = spec;
        this.render();
      }).open();
    };
  }

  private renderResults(root: HTMLElement): void {
    root.createEl('p', { cls: 'hw-settings-empty', text: 'Click a result to select it, then Save.' });
    const grid = root.createDiv({ cls: 'hw-results-grid' });
    for (const r of this.results) {
      const card = grid.createDiv({ cls: 'hw-result-card' });
      if (r.seed === this.seed) card.addClass('is-selected');
      this.setSvg(card, renderSvg(r.spec, { uid: `roll-${r.seed}`, outline: this.plugin.settings.outline }));
      card.createDiv({ cls: 'hw-result-name', text: r.name });
      // Single click: select + update preview in place (so the result grid
      // survives for the double-click). Double click: open it in Build.
      card.onclick = () => {
        this.select(r.seed, r.name, r.spec);
        grid.querySelectorAll('.hw-result-card').forEach((el) => el.removeClass('is-selected'));
        card.addClass('is-selected');
        this.refreshPreview();
      };
      card.ondblclick = () => {
        this.select(r.seed, r.name, r.spec);
        this.mode = 'build';
        this.render();
      };
    }
  }

  private renderLibrary(root: HTMLElement): void {
    const all = Object.keys(this.plugin.arms);
    const total = all.length;
    root.createEl('h4', { text: `Saved arms (${total})`, cls: 'hw-view-heading' });
    if (total === 0) {
      root.createEl('p', { text: 'Nothing saved yet.', cls: 'hw-settings-empty' });
      return;
    }
    // Newest first (saveArms keeps key order = save order, newest last).
    const recent = [...all].reverse().slice(0, 10);
    const list = root.createDiv({ cls: 'hw-library' });
    for (const name of recent) this.renderLibraryItem(list, name);

    const more = root.createEl('button', {
      cls: 'hw-browse-all',
      text: total > recent.length ? `Browse all ${total}\u2026` : 'Search saved\u2026',
    });
    more.onclick = () => this.openBrowser();
  }

  /** One saved-arms row: mini shield, name, blazon, Load / Insert ref / Delete. */
  private renderLibraryItem(list: HTMLElement, name: string): void {
    const spec = this.plugin.arms[name];
    const item = list.createDiv({ cls: 'hw-library-item' });
    const mini = item.createDiv({ cls: 'hw-inline' });
    this.setSvg(mini, renderSvg(spec, { uid: `lib-${name}`, outline: this.plugin.settings.outline }));
    const meta = item.createDiv({ cls: 'hw-library-meta' });
    meta.createDiv({ cls: 'hw-library-name', text: name });
    meta.createDiv({ cls: 'hw-library-blazon', text: toBlazon(spec) });
    const btns = item.createDiv({ cls: 'hw-library-btns' });
    btns.createEl('button', { text: 'Load' }).onclick = () => this.loadSaved(name);
    btns.createEl('button', { text: 'Insert ref' }).onclick = () => {
      const editor = this.activeEditor();
      if (!editor) { new Notice('Open a note in editing view (not reading mode) first.'); return; }
      editor.replaceSelection(`\`${this.plugin.settings.inlinePrefix}${name}\``);
    };
    btns.createEl('button', { text: 'Delete' }).onclick = async () => {
      delete this.plugin.arms[name];
      await this.plugin.saveAll();
      this.render();
    };
  }

  /** Load a saved arms into the builder. */
  private loadSaved(name: string): void {
    const spec = this.plugin.arms[name];
    if (!spec) return;
    this.mode = 'build';
    this.select(name, name, JSON.parse(JSON.stringify(spec)) as Spec);
    this.results = [];
    this.render();
  }

  /** Open the searchable saved-arms browser in a modal. */
  private openBrowser(): void {
    new ArmsBrowserModal(
      this.app,
      this.plugin,
      (name) => this.loadSaved(name),
      () => this.render(),
    ).open();
  }

  private blockText(): string {
    const lines = ['```heraldry'];
    if (this.named()) lines.push(`name: ${this.label.trim()}`);
    if (this.seed !== this.label.trim()) lines.push(`seed: ${this.seed}`);
    if (this.plugin.settings.staticInserts) lines.push('controls: false');
    lines.push('```', '');
    return lines.join('\n');
  }
}

let _uid = 0;
function uid(): number { return _uid++; }

/** Simple modal to paste a shared config string. */
class ImportConfigModal extends Modal {
  private onSubmit: (text: string) => void;
  constructor(app: App, onSubmit: (text: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: 'Import heraldry config' });
    contentEl.createEl('p', {
      cls: 'hw-settings-empty',
      text: 'Paste an HF config string (HF1:\u2026) or spec JSON.',
    });
    const ta = contentEl.createEl('textarea', { cls: 'hw-import-textarea' });
    ta.rows = 5;
    const row = contentEl.createDiv({ cls: 'hw-buttons' });
    const load = row.createEl('button', { text: 'Load', cls: 'mod-cta' });
    load.onclick = () => {
      this.onSubmit(ta.value);
      this.close();
    };
    row.createEl('button', { text: 'Cancel' }).onclick = () => this.close();
  }
  onClose(): void {
    this.contentEl.empty();
  }
}

/**
 * Searchable / filterable browser over all saved arms. Opens as a modal so it
 * scales past the ~10 shown inline in the side panel. Search matches the name
 * and the blazon, so terms like "gules", "lion", or "per pale" filter too.
 */
class ArmsBrowserModal extends Modal {
  private query = '';
  private sort: 'recent' | 'name' = 'recent';
  private usage: 'all' | 'used' | 'unused' = 'all';
  private usedNames: Set<string> | null = null;
  private scanning = false;
  private grid?: HTMLElement;
  private count?: HTMLElement;

  constructor(
    app: App,
    private plugin: HeraldryWeaverPlugin,
    private onPick: (name: string) => void,
    private onChange: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass('hw-browser-modal');
    const { contentEl } = this;
    contentEl.createEl('h3', { text: 'Browse saved arms' });

    const controls = contentEl.createDiv({ cls: 'hw-browser-controls' });
    const search = controls.createEl('input', { type: 'search' });
    search.placeholder = 'Search name, tincture, charge\u2026';
    search.value = this.query;
    search.addEventListener('input', () => { this.query = search.value; this.renderGrid(); });

    const sortBtn = controls.createEl('button', { text: 'Recent' });
    sortBtn.onclick = () => {
      this.sort = this.sort === 'recent' ? 'name' : 'recent';
      sortBtn.setText(this.sort === 'recent' ? 'Recent' : 'A\u2013Z');
      this.renderGrid();
    };

    const usageSel = controls.createEl('select', { cls: 'dropdown hw-browser-usage' });
    usageSel.createEl('option', { text: 'All', attr: { value: 'all' } });
    usageSel.createEl('option', { text: 'Used', attr: { value: 'used' } });
    usageSel.createEl('option', { text: 'Unused', attr: { value: 'unused' } });
    usageSel.value = this.usage;
    usageSel.title = 'Filter by whether the arms are referenced in the vault';
    usageSel.onchange = () => {
      this.usage = usageSel.value as 'all' | 'used' | 'unused';
      if (this.usage !== 'all' && !this.usedNames) this.scanUsage();
      else this.renderGrid();
    };

    this.count = contentEl.createDiv({ cls: 'hw-browser-count' });
    this.grid = contentEl.createDiv({ cls: 'hw-browser-grid' });
    this.renderGrid();
    window.setTimeout(() => search.focus(), 0);
  }

  private async scanUsage(): Promise<void> {
    this.scanning = true;
    this.renderGrid();
    try {
      this.usedNames = await this.plugin.computeUsedArmsNames();
    } catch {
      this.usedNames = new Set();
    }
    this.scanning = false;
    this.renderGrid();
  }

  private names(): string[] {
    const all = Object.keys(this.plugin.arms);
    const ordered = this.sort === 'name'
      ? [...all].sort((a, b) => a.localeCompare(b))
      : [...all].reverse();
    const used = this.usedNames;
    const base = this.usage !== 'all' && used
      ? ordered.filter((n) => (this.usage === 'used' ? used.has(n) : !used.has(n)))
      : ordered;
    const q = this.query.trim().toLowerCase();
    if (!q) return base;
    const terms = q.split(/\s+/);
    return base.filter((name) => {
      const hay = `${name} ${toBlazon(this.plugin.arms[name])}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }

  private renderGrid(): void {
    if (!this.grid || !this.count) return;
    const total = Object.keys(this.plugin.arms).length;
    if (this.scanning) {
      this.count.setText('Scanning the vault for references\u2026');
      this.grid.empty();
      return;
    }
    const names = this.names();
    const suffix = this.usage === 'used' ? ' used' : this.usage === 'unused' ? ' unused' : '';
    this.count.setText(
      this.usage !== 'all' && this.usedNames
        ? `${names.length}${suffix} of ${total}`
        : `${names.length} of ${total}`,
    );
    this.grid.empty();
    if (names.length === 0) {
      const msg =
        this.usage === 'used'
          ? 'No saved arms are referenced in any note yet.'
          : this.usage === 'unused'
            ? 'No unused saved arms — every one is referenced somewhere.'
            : 'No matches.';
      this.grid.createEl('p', { cls: 'hw-settings-empty', text: msg });
      return;
    }
    for (const name of names) {
      const spec = this.plugin.arms[name];
      const card = this.grid.createDiv({ cls: 'hw-browser-card' });
      const mini = card.createDiv({ cls: 'hw-inline' });
      const node = new DOMParser()
        .parseFromString(renderSvg(spec, { uid: `browse-${name}`, outline: this.plugin.settings.outline }), 'image/svg+xml')
        .documentElement;
      mini.appendChild(node);
      card.createDiv({ cls: 'hw-browser-name', text: name });
      card.createDiv({ cls: 'hw-browser-blazon', text: toBlazon(spec) });
      card.onclick = () => { this.onPick(name); this.close(); };
      const del = card.createEl('button', { cls: 'hw-browser-del', text: '\u00d7' });
      del.setAttr('aria-label', 'Delete');
      del.onclick = async (e) => {
        e.stopPropagation();
        delete this.plugin.arms[name];
        await this.plugin.saveAll();
        this.onChange();
        this.renderGrid();
      };
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/**
 * Fur editor: pick a standard named fur, or build a custom one (pattern +
 * countered toggle + base/figure tinctures) with a live preview.
 */
class FurEditorModal extends Modal {
  private pattern: FurPattern;
  private counter: boolean;
  private base: Tincture;
  private figure: Tincture;
  private preview?: HTMLElement;
  private label?: HTMLElement;
  /** Recolour target for imported custom furs (null = original colours). */
  private furTarget: Tincture | null = null;

  constructor(app: App, current: Tincture, private onPick: (fur: Tincture) => void) {
    super(app);
    const info = furInfo(current) ?? FUR_PRESETS.ermine;
    this.pattern = info.pattern;
    this.counter = info.counter;
    this.base = info.base;
    this.figure = info.figure;
    this.furTarget = parseCustomFur(current)?.target ?? null;
  }

  onOpen(): void {
    this.modalEl.addClass('hw-fur-modal');
    const { contentEl } = this;
    contentEl.createEl('h3', { text: 'Furs' });

    // --- standard named presets ---
    contentEl.createEl('div', { cls: 'hw-fur-section', text: 'Standard furs' });
    const presets = contentEl.createDiv({ cls: 'hw-fur-presets' });
    for (const name of NAMED_FURS) {
      const cell = presets.createDiv({ cls: 'hw-fur-cell' });
      const tile = cell.createDiv({ cls: 'hw-fur-tile' });
      tile.appendChild(new DOMParser().parseFromString(furSwatchSvg(name), 'image/svg+xml').documentElement);
      cell.createDiv({ cls: 'hw-fur-name', text: labelOf(name) });
      cell.onclick = () => { this.onPick(name); this.close(); };
    }

    // --- imported custom furs (cover-filled semé sheets) ---
    const furs = listCustomFurs();
    if (furs.length) {
      contentEl.createEl('div', { cls: 'hw-fur-section', text: 'Imported furs' });
      const recolour = contentEl.createDiv({ cls: 'hw-field hw-field-swatches' });
      recolour.createSpan({ cls: 'hw-field-label', text: 'Recolour' });
      const rsw = recolour.createDiv({ cls: 'hw-swatches' });
      const cells = contentEl.createDiv({ cls: 'hw-fur-presets' });
      const drawCells = (): void => {
        cells.empty();
        for (const f of furs) {
          const cell = cells.createDiv({ cls: 'hw-fur-cell' });
          const tile = cell.createDiv({ cls: 'hw-fur-tile' });
          const fur = makeCustomFur(f.id, this.furTarget ?? undefined);
          tile.appendChild(new DOMParser().parseFromString(furSwatchSvg(fur), 'image/svg+xml').documentElement);
          cell.createDiv({ cls: 'hw-fur-name', text: f.label });
          cell.onclick = () => { this.onPick(fur); this.close(); };
        }
      };
      const mark = (el: HTMLElement): void => {
        rsw.querySelectorAll('.hw-swatch').forEach((e) => e.removeClass('is-selected'));
        el.addClass('is-selected');
      };
      const orig = rsw.createEl('button', { cls: 'hw-swatch hw-swatch-reset', text: '\u21ba' });
      orig.title = 'Original colours';
      if (!this.furTarget) orig.addClass('is-selected');
      orig.onclick = () => { this.furTarget = null; mark(orig); drawCells(); };
      for (const t of [...METALS, ...COLOURS] as Tincture[]) {
        const b = rsw.createEl('button', { cls: 'hw-swatch' });
        b.style.background = hexOf(t);
        b.title = labelOf(t);
        if (this.furTarget === t) b.addClass('is-selected');
        b.onclick = () => { this.furTarget = t; mark(b); drawCells(); };
      }
      drawCells();
    }

    // --- custom builder ---
    contentEl.createEl('div', { cls: 'hw-fur-section', text: 'Custom' });
    const custom = contentEl.createDiv({ cls: 'hw-fur-custom' });

    const patternRow = custom.createDiv({ cls: 'hw-field' });
    patternRow.createSpan({ cls: 'hw-field-label', text: 'Pattern' });
    const psel = patternRow.createEl('select');
    for (const p of FUR_PATTERNS) {
      const o = psel.createEl('option', { text: p[0].toUpperCase() + p.slice(1), value: p });
      if (p === this.pattern) o.selected = true;
    }
    psel.onchange = () => { this.pattern = psel.value as FurPattern; this.refresh(); };

    const counterRow = custom.createDiv({ cls: 'hw-field' });
    counterRow.createSpan({ cls: 'hw-field-label', text: 'Countered' });
    const cb = counterRow.createEl('input', { type: 'checkbox' });
    cb.checked = this.counter;
    cb.onchange = () => { this.counter = cb.checked; this.refresh(); };

    this.furSwatchPicker(custom, 'Base', () => this.base, (t) => { this.base = t; this.refresh(); });
    this.furSwatchPicker(custom, 'Figure', () => this.figure, (t) => { this.figure = t; this.refresh(); });

    const previewRow = custom.createDiv({ cls: 'hw-fur-preview-row' });
    this.preview = previewRow.createDiv({ cls: 'hw-fur-tile hw-fur-preview' });
    this.label = previewRow.createDiv({ cls: 'hw-fur-name' });

    const apply = custom.createEl('button', { cls: 'mod-cta', text: 'Use this fur' });
    apply.onclick = () => { this.onPick(this.currentFur()); this.close(); };

    this.refresh();
  }

  private furSwatchPicker(parent: HTMLElement, label: string, get: () => Tincture, set: (t: Tincture) => void): void {
    const row = parent.createDiv({ cls: 'hw-field' });
    row.createSpan({ cls: 'hw-field-label', text: label });
    const sw = row.createDiv({ cls: 'hw-swatches' });
    for (const t of [...METALS, ...COLOURS] as Tincture[]) {
      const b = sw.createEl('button', { cls: 'hw-swatch' });
      b.style.background = hexOf(t);
      b.title = labelOf(t);
      if (t === get()) b.addClass('is-selected');
      b.onclick = () => {
        set(t);
        sw.querySelectorAll('.hw-swatch').forEach((el) => el.removeClass('is-selected'));
        b.addClass('is-selected');
      };
    }
  }

  private currentFur(): Tincture {
    const fur = makeFur(this.pattern, this.base, this.figure, this.counter);
    // Collapse to the canonical preset name when the combo is a standard fur.
    const info = furInfo(fur)!;
    return matchPreset(info) ?? fur;
  }

  private refresh(): void {
    if (this.preview) {
      this.preview.empty();
      this.preview.appendChild(
        new DOMParser().parseFromString(furSwatchSvg(this.currentFur()), 'image/svg+xml').documentElement,
      );
    }
    if (this.label) this.label.setText(labelOf(this.currentFur()));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
