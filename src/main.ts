import { Plugin, Notice, WorkspaceLeaf } from 'obsidian';
import { generate } from './engine/generate';
import { generateName } from './engine/names';
import { runNameScript, type ScriptHost } from './nameScript';
import { toBlazon } from './engine/blazon';
import { renderSvg } from './engine/render';
import { generateArms } from './engine/index';
import { chargeFromSvg } from './engine/importCharge';
import { wmfToSvg } from './engine/wmf';
import {
  clearAllAssets,
  ordinaryFromSvg, registerOrdinaryAsset,
  shieldFromSvg, registerShieldAsset,
  fieldFromSvg, registerFieldAsset,
  variationFromSvg, registerVariationAsset,
  furFromSvg,
} from './engine/assets';
import { registerCustomFur, clearCustomFurs } from './engine/tinctures';
import {
  registerCharge,
  clearImportedCharges,
  registerBundledCharge,
  clearBundledCharges,
} from './engine/charges';
import { PACK_CHARGES } from './engine/packCharges';
import { encodeSpec, decodeSpec } from './engine/config';
import type { Spec, Arms } from './engine/types';
import {
  HeraldrySettings,
  DEFAULT_SETTINGS,
  HeraldrySettingTab,
} from './settings';
import { downloadSvg, exportPng, safeFilename } from './export';
import { HeraldryWeaverView, VIEW_TYPE_HERALDRY } from './view';

interface SavedData {
  settings: HeraldrySettings;
  arms: Record<string, Spec>;
}

/** Public API exposed at app.plugins.plugins['heraldry-weaver'].api. */
export interface HeraldryApi {
  generate(seed: string): Spec;
  generateName(seed: string): string;
  toBlazon(spec: Spec): string;
  renderSvg(spec: Spec, uid?: string | number): string;
  generateArms(seed: string, uid?: string | number): Arms;
  saveArms(name: string, spec: Spec): Promise<void>;
  getArms(name: string): Spec | undefined;
  listArms(): string[];
  /** Raw SVG for a seed/name (deterministic). */
  svg(seedOrName: string): string;
  /** A fenced ```heraldry block for a note. unique => bake a fresh random seed. */
  block(name: string, opts?: { seed?: string; unique?: boolean; motto?: string }): string;
  /** An inline reference token, e.g. `heraldry:Name` (deterministic by name). */
  inline(name: string): string;
  encodeConfig(spec: Spec): string;
  decodeConfig(input: string): Spec | null;
  /** Register a custom name source: (seed) => name. Replaces the built-in. */
  setNameProvider(fn: NameProvider): void;
  clearNameProvider(): void;
  hasNameProvider(): boolean;
}

export type NameProvider = (seed: string) => string | Promise<string>;

interface BlockParams {
  name?: string;
  seed?: string;
  motto?: string;
  bare?: string;
  /** Whether the interactive buttons (Reroll/Save/SVG/PNG) render. */
  controls?: boolean;
}

let uidCounter = 0;

/** Reserved type-subfolders scanned under the asset root, one per element. */
export const RESERVED_ASSET_FOLDERS = ['charges', 'ordinaries', 'shields', 'fields', 'variations', 'furs'] as const;

export default class HeraldryWeaverPlugin extends Plugin {
  settings: HeraldrySettings = { ...DEFAULT_SETTINGS };
  arms: Record<string, Spec> = {};
  importedCharges: string[] = [];
  nameProvider: NameProvider | null = null;
  api!: HeraldryApi;

  async onload(): Promise<void> {
    await this.loadAll();
    this.applyPack();
    await this.loadCustomCharges();

    this.api = {
      generate,
      generateName,
      toBlazon,
      renderSvg: (spec, uid) =>
        renderSvg(spec, { uid: uid ?? `api${uidCounter++}`, outline: this.settings.outline }),
      generateArms,
      saveArms: (name, spec) => this.saveArms(name, spec),
      getArms: (name) => this.arms[name],
      listArms: () => Object.keys(this.arms),
      svg: (seedOrName) =>
        renderSvg(generate(seedOrName), {
          uid: `api${uidCounter++}`,
          outline: this.settings.outline,
        }),
      block: (name, opts = {}) => this.blockMarkdown(name, opts),
      inline: (name) => `\`${this.settings.inlinePrefix}${name}\``,
      encodeConfig: encodeSpec,
      decodeConfig: decodeSpec,
      setNameProvider: (fn) => {
        this.nameProvider = fn;
      },
      clearNameProvider: () => {
        this.nameProvider = null;
      },
      hasNameProvider: () => this.nameProvider !== null,
    };

    this.registerMarkdownCodeBlockProcessor('heraldry', (src, el, ctx) => {
      this.renderBlock(src, el, this.noteTitle(ctx.sourcePath), this.frontmatterSeed(ctx.sourcePath));
    });

    this.registerMarkdownPostProcessor((el, ctx) => {
      this.processInline(el, this.noteTitle(ctx.sourcePath), this.frontmatterSeed(ctx.sourcePath));
    });

    this.registerView(
      VIEW_TYPE_HERALDRY,
      (leaf) => new HeraldryWeaverView(leaf, this),
    );

    this.addRibbonIcon('shield', 'Open Heraldry Weaver', () => {
      void this.activateView();
    });

    this.addCommand({
      id: 'open-panel',
      name: 'Open panel',
      callback: () => void this.activateView(),
    });

    this.addCommand({
      id: 'insert-block',
      name: 'Insert block from note title',
      editorCallback: (editor, ctx) => {
        const name = ctx.file?.basename ?? 'New arms';
        editor.replaceSelection('```heraldry\nname: ' + name + '\n```\n');
      },
    });

    this.addCommand({
      id: 'insert-random-block',
      name: 'Insert random block',
      editorCallback: (editor) => {
        const seed = Math.random().toString(36).slice(2, 9);
        editor.replaceSelection('```heraldry\nseed: ' + seed + '\n```\n');
      },
    });

    this.addCommand({
      id: 'reload-custom-assets',
      name: 'Reload custom assets',
      callback: async () => {
        await this.loadCustomCharges();
        new Notice(`Loaded ${this.importedCharges.length} custom asset(s).`);
        this.refreshViews();
      },
    });

    this.addSettingTab(new HeraldrySettingTab(this.app, this));
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_HERALDRY);
    let leaf: WorkspaceLeaf | null;
    if (existing.length > 0) {
      leaf = existing[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: VIEW_TYPE_HERALDRY, active: true });
      }
    }
    if (leaf) void workspace.revealLeaf(leaf);
  }

  // --- persistence -----------------------------------------------------------

  async loadAll(): Promise<void> {
    const data = (await this.loadData()) as Partial<SavedData> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings);
    this.arms = data?.arms ?? {};
  }

  async saveAll(): Promise<void> {
    await this.saveData({ settings: this.settings, arms: this.arms });
  }

  async saveArms(name: string, spec: Spec): Promise<void> {
    // Re-insert so the key order tracks most-recently-saved (newest last),
    // which the library's "recent" view and browser rely on. Updating an
    // existing key in place would otherwise keep its original position.
    delete this.arms[name];
    // Deep-copy: the panel keeps editing its live spec object, and storing it
    // by reference would let later edits silently mutate the saved entry (so
    // existing references/blocks would render the wrong arms).
    this.arms[name] = JSON.parse(JSON.stringify(spec)) as Spec;
    await this.saveAll();
  }

  /** Register or remove the bundled charge pack per the current setting. */
  applyPack(): void {
    clearBundledCharges();
    if (this.settings.enablePack) {
      for (const def of PACK_CHARGES) registerBundledCharge(def);
    }
  }

  /**
   * Scan the asset root's reserved type-subfolders (charges/, ordinaries/,
   * shields/, fields/, variations/) for .svg and .wmf files and register each
   * as the matching element. Within a type folder, nested subfolders become
   * picker categories. Falls back to migrating the old chargeFolder setting.
   */
  async loadCustomCharges(): Promise<void> {
    clearImportedCharges();
    clearAllAssets();
    clearCustomFurs();
    this.importedCharges = [];
    const adapter = this.app.vault.adapter;

    let root = this.settings.assetFolder?.trim();
    if (!root) {
      const cf = this.settings.chargeFolder?.trim() ?? '';
      root = cf.replace(/\/charges\/?$/i, '') || cf;
    }
    if (!root) return;
    const rootNorm = root.replace(/\/+$/, '');

    const usedIds = new Set<string>();
    const uniqueId = (prefix: string, rel: string): string => {
      const slug = `${prefix}-${rel}`
        .replace(/\.(svg|wmf)$/i, '')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'item';
      let id = slug;
      let n = 2;
      while (usedIds.has(id)) id = `${slug}-${n++}`;
      usedIds.add(id);
      return id;
    };

    const loadSvg = async (path: string): Promise<string | null> => {
      try {
        if (/\.wmf$/i.test(path)) return wmfToSvg(await adapter.readBinary(path));
        return await adapter.read(path);
      } catch {
        return null;
      }
    };

    const scanType = async (
      sub: string,
      handler: (id: string, svg: string, base: string, category: string) => void,
    ): Promise<void> => {
      const typeRoot = `${rootNorm}/${sub}`;
      try {
        if (!(await adapter.exists(typeRoot))) return;
      } catch {
        return;
      }
      const found: { path: string; category: string }[] = [];
      const walk = async (dir: string, depth: number): Promise<void> => {
        if (depth > 10 || found.length > 5000) return;
        let listing: { files: string[]; folders: string[] };
        try {
          listing = await adapter.list(dir);
        } catch {
          return;
        }
        for (const file of listing.files) {
          if (!/\.(svg|wmf)$/i.test(file)) continue;
          const rel = file.startsWith(typeRoot + '/') ? file.slice(typeRoot.length + 1) : file;
          const slash = rel.lastIndexOf('/');
          found.push({ path: file, category: slash >= 0 ? rel.slice(0, slash) : '' });
        }
        for (const f of listing.folders) await walk(f, depth + 1);
      };
      await walk(typeRoot, 0);
      for (const { path, category } of found) {
        const name = path.split('/').pop() ?? path;
        const base = name.replace(/\.(svg|wmf)$/i, '');
        const rel = path.startsWith(typeRoot + '/') ? path.slice(typeRoot.length + 1) : name;
        const svg = await loadSvg(path);
        if (!svg) continue;
        handler(uniqueId(sub, rel), svg, base, category);
      }
    };

    try {
      if (!(await adapter.exists(rootNorm))) return;
    } catch {
      return;
    }

    const recolor = this.settings.recolorImports;
    await scanType('charges', (id, svg, base, category) => {
      registerCharge(chargeFromSvg(id, svg, { recolor, label: base, category }));
      this.importedCharges.push(id);
    });
    await scanType('ordinaries', (id, svg, base, category) => {
      registerOrdinaryAsset(ordinaryFromSvg(id, svg, { recolor, label: base, category }));
      this.importedCharges.push(id);
    });
    await scanType('shields', (id, svg, base, category) => {
      const s = shieldFromSvg(id, svg, { label: base, category });
      if (s) {
        registerShieldAsset(s);
        this.importedCharges.push(id);
      }
    });
    await scanType('fields', (id, svg, base, category) => {
      registerFieldAsset(fieldFromSvg(id, svg, { label: base, category }));
      this.importedCharges.push(id);
    });
    await scanType('variations', (id, svg, base, category) => {
      registerVariationAsset(variationFromSvg(id, svg, { label: base, category }));
      this.importedCharges.push(id);
    });
    await scanType('furs', (id, svg, base, category) => {
      registerCustomFur(furFromSvg(id, svg, { label: base, category }));
      this.importedCharges.push(id);
    });
  }

  /**
   * Create the asset root (if needed) and its reserved type-subfolders. Returns
   * how many were newly created vs already present so the caller can report.
   */
  async createAssetFolders(): Promise<{ created: number; existing: number; root: string }> {
    const root = this.settings.assetFolder?.trim().replace(/\/+$/, '');
    if (!root) return { created: 0, existing: 0, root: '' };
    const adapter = this.app.vault.adapter;
    let created = 0;
    let existing = 0;
    const ensure = async (path: string, count: boolean): Promise<void> => {
      try {
        if (await adapter.exists(path)) {
          if (count) existing++;
          return;
        }
        await this.app.vault.createFolder(path);
        if (count) created++;
      } catch {
        // ignore (e.g. created concurrently); treat as present
        if (count) existing++;
      }
    };
    await ensure(root, false);
    for (const sub of RESERVED_ASSET_FOLDERS) await ensure(`${root}/${sub}`, true);
    return { created, existing, root };
  }

  refreshViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_HERALDRY)) {
      const view = leaf.view;
      if (view instanceof HeraldryWeaverView) view.refresh();
    }
  }

  /** Build a fenced heraldry block string for templates / Insert block. */
  blockMarkdown(
    name: string,
    opts: { seed?: string; unique?: boolean; motto?: string } = {},
  ): string {
    const nm = (name ?? '').toString().trim();
    let seed = opts.seed;
    if (!seed && opts.unique) seed = Math.random().toString(36).slice(2, 10);
    const lines = ['```heraldry'];
    if (nm) lines.push(`name: ${nm}`);
    if (seed && seed !== nm) lines.push(`seed: ${seed}`);
    if (opts.motto) lines.push(`motto: ${opts.motto}`);
    lines.push('```', '');
    return lines.join('\n');
  }

  /**
   * Resolve a name for a rolled seed. If a custom name provider has been
   * registered (via the API), use it; otherwise the built-in generator.
   * Best-effort: any failure falls back so rolling never breaks.
   */
  async resolveName(seed: string): Promise<string> {
    if (this.nameProvider) {
      try {
        const name = (await this.nameProvider(seed))?.toString().trim();
        if (name) return name;
      } catch {
        // fall through
      }
    }
    if (this.settings.nameSource === 'script' && this.settings.nameScript.trim()) {
      try {
        return await runNameScript(
          this.settings.nameScript,
          this.app as unknown as ScriptHost,
          this.settings.nameApiPlugin || 'randomness',
          seed,
        );
      } catch (e) {
        this.noticeNameError(e);
        // fall through to built-in
      }
    }
    return generateName(seed);
  }

  private lastNameError = 0;
  /** Surface a name-script failure at most once every few seconds (a bulk roll
   * fires resolveName many times; we don't want a wall of notices). */
  private noticeNameError(e: unknown): void {
    const now = Date.now();
    if (now - this.lastNameError < 4000) return;
    this.lastNameError = now;
    new Notice(`Heraldry Weaver name script error: ${(e as Error)?.message ?? e}`);
  }

  // --- rendering helpers -----------------------------------------------------

  private setSvg(parent: HTMLElement, svg: string): void {
    const node = new DOMParser().parseFromString(svg, 'image/svg+xml')
      .documentElement;
    parent.appendChild(node);
  }

  private parseBlock(src: string): BlockParams {
    const params: BlockParams = {};
    for (const raw of src.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const m = line.match(/^(\w+)\s*:\s*(.+)$/);
      if (m) {
        const key = m[1].toLowerCase();
        const val = m[2].trim();
        if (key === 'name' || key === 'seed' || key === 'motto') params[key] = val;
        else if (key === 'controls') params.controls = !/^(false|no|off|0)$/i.test(val);
      } else if (/^(static|readonly|locked)$/i.test(line)) {
        params.controls = false;
      } else if (!params.bare) {
        params.bare = line;
      }
    }
    return params;
  }

  /** Basename (no extension) of a note path, used as a default seed. */
  private noteTitle(sourcePath?: string): string | undefined {
    if (!sourcePath) return undefined;
    return (sourcePath.split('/').pop() ?? sourcePath).replace(/\.md$/i, '');
  }

  /** Read the configured seed property from a note's frontmatter, if present. */
  /**
   * Names of saved arms that are referenced by at least one note in the vault.
   * A reference counts when it resolves to a saved entry (matching resolve()):
   * an explicit inline key, a block's name/bare, or a bare reference whose note
   * title matches — but NOT when a `seed:` or frontmatter seed forces generation.
   */
  async computeUsedArmsNames(): Promise<Set<string>> {
    const used = new Set<string>();
    const prefix = this.settings.inlinePrefix?.trim();
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const inlineRe = prefix ? new RegExp('`' + esc(prefix) + '([^`|]*)(?:\\|[^`]*)?`', 'g') : null;
    const blockRe = /```+\s*heraldry[^\n]*\n([\s\S]*?)```/g;

    for (const file of this.app.vault.getMarkdownFiles()) {
      let content: string;
      try {
        content = await this.app.vault.cachedRead(file);
      } catch {
        continue;
      }
      const title = file.basename;
      const fmSeed = this.frontmatterSeed(file.path);

      if (inlineRe) {
        inlineRe.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = inlineRe.exec(content)) !== null) {
          const key = m[1].trim();
          if (key) used.add(key);
          else if (!fmSeed) used.add(title);
        }
      }

      blockRe.lastIndex = 0;
      let b: RegExpExecArray | null;
      while ((b = blockRe.exec(content)) !== null) {
        const p = this.parseBlock(b[1]);
        if (p.seed || fmSeed) continue; // these generate rather than look up a saved entry
        const key = p.name ?? p.bare ?? title;
        if (key) used.add(key);
      }
    }
    return used;
  }

  private frontmatterSeed(sourcePath?: string): string | undefined {
    if (!sourcePath) return undefined;
    const prop = this.settings.seedProperty?.trim();
    if (!prop) return undefined;
    const fm = this.app.metadataCache.getCache(sourcePath)?.frontmatter as Record<string, unknown> | undefined;
    const v = fm?.[prop];
    return v == null || v === '' ? undefined : String(v);
  }

  /**
   * Resolve a block to a spec. Precedence for the ARMS seed:
   *   1. explicit `seed:` in the block
   *   2. a seed from the note's frontmatter (the "random but linked" mechanism —
   *      every bare reference on the page reads the same value)
   *   3. a saved entry / generation from name / bare / note title
   * The LABEL is independent: name > bare > note title.
   */
  private resolve(
    params: BlockParams,
    ctx: { fmSeed?: string; title?: string } = {},
  ): { spec: Spec; label: string; seed: string } {
    const { fmSeed, title } = ctx;
    const label = params.name ?? params.bare ?? params.seed ?? title ?? 'Arms';

    if (params.seed) {
      return { spec: generate(params.seed), label, seed: params.seed };
    }
    if (fmSeed) {
      return { spec: generate(fmSeed), label, seed: fmSeed };
    }
    const key = params.name ?? params.bare ?? title;
    if (key && this.arms[key]) {
      return { spec: this.arms[key], label, seed: key };
    }
    const seed = key ?? 'arms';
    return { spec: generate(seed), label, seed };
  }

  // --- block codeblock processor ---------------------------------------------

  private renderBlock(
    src: string,
    el: HTMLElement,
    title?: string,
    fmSeed?: string,
  ): void {
    const params = this.parseBlock(src);
    const resolved = this.resolve(params, { fmSeed, title });
    let current = resolved.spec;

    const block = el.createDiv({ cls: 'hw-block' });
    const shield = block.createDiv({ cls: 'hw-shield' });
    const name = block.createDiv({ cls: 'hw-block-name' });
    const blazonEl = block.createDiv({ cls: 'hw-block-blazon' });
    const mottoEl = params.motto
      ? block.createDiv({ cls: 'hw-block-motto' })
      : null;
    // Controls (Reroll/Save/SVG/PNG) default on, but a block can switch them
    // off with `controls: false` (or a bare `static` tag) for a fixed display.
    const showControls = params.controls !== false;
    const buttons = showControls ? block.createDiv({ cls: 'hw-buttons' }) : null;

    const paint = () => {
      shield.empty();
      this.setSvg(
        shield,
        renderSvg(current, {
          uid: `block-${resolved.label}-${uidCounter++}`,
          outline: this.settings.outline,
        }),
      );
      name.setText(resolved.label);
      blazonEl.setText(toBlazon(current));
      if (mottoEl && params.motto) mottoEl.setText(`\u201c${params.motto}\u201d`);
    };
    paint();

    if (!buttons) return;

    buttons.createEl('button', { text: 'Reroll' }).onclick = () => {
      current = generate(`${resolved.seed}~${Math.random().toString(36).slice(2, 8)}`);
      paint();
    };
    buttons.createEl('button', { text: 'Save' }).onclick = async () => {
      await this.saveArms(resolved.label, current);
      new Notice(`Saved arms: ${resolved.label}`);
    };
    buttons.createEl('button', { text: 'SVG' }).onclick = () => {
      downloadSvg(
        renderSvg(current, { uid: 'export', outline: this.settings.outline }),
        `${safeFilename(resolved.label)}.svg`,
      );
    };
    buttons.createEl('button', { text: 'PNG' }).onclick = () => {
      exportPng(
        renderSvg(current, { uid: 'export', outline: this.settings.outline }),
        this.settings.pngSize,
        `${safeFilename(resolved.label)}.png`,
      ).catch((e: unknown) => new Notice(`PNG export failed: ${e instanceof Error ? e.message : String(e)}`));
    };
  }

  // --- inline processor ------------------------------------------------------

  private processInline(el: HTMLElement, title?: string, fmSeed?: string): void {
    const prefix = this.settings.inlinePrefix;
    if (!prefix) return;
    const codes = el.querySelectorAll('code');
    codes.forEach((code) => {
      const text = code.textContent ?? '';
      if (!text.startsWith(prefix)) return;
      // Syntax: `prefix[key][|size]`. An explicit key resolves as a saved entry
      // or is generated. A bare key reads the frontmatter seed (so it matches a
      // bare block on the same page), else the note title. Size is a px number
      // (e.g. 120) or any CSS length (e.g. 4em).
      const [rawKey, sizeToken] = text.slice(prefix.length).split('|');
      const explicit = rawKey.trim();
      let spec: Spec;
      if (explicit) {
        spec = this.arms[explicit] ?? generate(explicit);
      } else if (fmSeed) {
        spec = generate(fmSeed);
      } else if (title) {
        spec = this.arms[title] ?? generate(title);
      } else {
        return;
      }
      const span = createSpan({ cls: 'hw-inline' });
      span.setAttr('aria-label', toBlazon(spec));
      const node = new DOMParser().parseFromString(
        renderSvg(spec, { uid: `inline-${explicit || fmSeed || title}`, outline: this.settings.outline }),
        'image/svg+xml',
      ).documentElement;
      const size = sizeToken?.trim();
      if (size) {
        const css = /^\d+(\.\d+)?$/.test(size) ? `${size}px` : size;
        node.setCssStyles({ height: css, width: 'auto' });
        span.addClass('hw-inline-sized');
      }
      span.appendChild(node);
      code.replaceWith(span);
    });
  }
}
