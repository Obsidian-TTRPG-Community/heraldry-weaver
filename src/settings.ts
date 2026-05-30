import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import { toBlazon } from './engine/blazon';
import { renderSvg } from './engine/render';
import { runNameScript, type ScriptHost } from './nameScript';
import type HeraldryWeaverPlugin from './main';

export interface HeraldrySettings {
  /** Inline trigger, e.g. `heraldry:` so `\`heraldry:House X\`` renders. */
  inlinePrefix: string;
  /** Default PNG export width in pixels. */
  pngSize: number;
  /** Escutcheon outline colour. */
  outline: string;
  /** Vault-relative folder scanned for custom charge SVGs (Tier 2 import). */
  chargeFolder: string;
  /** Recolour imported charges to the chosen tincture (treat as silhouettes). */
  recolorImports: boolean;
  /** Frontmatter property bare references read for a per-note seed. */
  seedProperty: string;
  /** Include the bundled game-icons charge pack in the builder. */
  enablePack: boolean;
  /** Insert blocks with controls off (`controls: false`) so notes are static. */
  staticInserts: boolean;
  /** Where rolled names come from: the built-in generator or a custom JS snippet. */
  nameSource: 'builtin' | 'script';
  /** JS body run to produce a name (when nameSource is 'script'). */
  nameScript: string;
  /** Plugin id whose `.api` is bound to `api` inside the name script. */
  nameApiPlugin: string;
}

export const DEFAULT_SETTINGS: HeraldrySettings = {
  inlinePrefix: 'heraldry:',
  pngSize: 512,
  outline: '#20201e',
  chargeFolder: 'Heraldry Weaver/charges',
  recolorImports: true,
  seedProperty: 'heraldry-seed',
  enablePack: true,
  staticInserts: true,
  nameSource: 'builtin',
  nameScript: 'return (await api.rollUnscoped("TF-ThievesGuildName")).result;',
  nameApiPlugin: 'randomness',
};

export class HeraldrySettingTab extends PluginSettingTab {
  plugin: HeraldryWeaverPlugin;

  constructor(app: App, plugin: HeraldryWeaverPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Inline prefix')
      .setDesc('Inline code starting with this renders a shield, e.g. `heraldry:House Aldori`.')
      .addText((t) =>
        t
          .setValue(this.plugin.settings.inlinePrefix)
          .onChange(async (v) => {
            this.plugin.settings.inlinePrefix = v || 'heraldry:';
            await this.plugin.saveAll();
          }),
      );

    new Setting(containerEl)
      .setName('PNG export width')
      .setDesc('Width in pixels for exported PNGs (height keeps the shield aspect).')
      .addText((t) =>
        t.setValue(String(this.plugin.settings.pngSize)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n > 0) {
            this.plugin.settings.pngSize = n;
            await this.plugin.saveAll();
          }
        }),
      );

    new Setting(containerEl)
      .setName('Outline colour')
      .setDesc('Colour of the escutcheon outline.')
      .addText((t) =>
        t.setValue(this.plugin.settings.outline).onChange(async (v) => {
          this.plugin.settings.outline = v || '#20201e';
          await this.plugin.saveAll();
        }),
      );

    new Setting(containerEl).setName('Names').setHeading();

    new Setting(containerEl)
      .setName('Name source')
      .setDesc('Where rolled names come from. The built-in generator is deterministic per seed; a custom script can call another plugin (Randomness, Dice Roller, …) or your own logic.')
      .addDropdown((d) =>
        d
          .addOption('builtin', 'Built-in generator')
          .addOption('script', 'Custom script')
          .setValue(this.plugin.settings.nameSource)
          .onChange(async (v) => {
            this.plugin.settings.nameSource = v as 'builtin' | 'script';
            await this.plugin.saveAll();
            this.display();
          }),
      );

    if (this.plugin.settings.nameSource === 'script') {
      new Setting(containerEl)
        .setName('Connector plugin id')
        .setDesc('Plugin whose API is bound to `api` in the script. e.g. "randomness", or "obsidian-dice-roller". Leave blank if your script does not need it.')
        .addText((t) =>
          t
            .setPlaceholder('randomness')
            .setValue(this.plugin.settings.nameApiPlugin)
            .onChange(async (v) => {
              this.plugin.settings.nameApiPlugin = v.trim();
              await this.plugin.saveAll();
            }),
        );

      new Setting(containerEl)
        .setName('Name script')
        .setDesc('JavaScript run to produce one name. In scope: app, api, seed. Return a string (async is fine). Falls back to the built-in generator on any error.')
        .setClass('hw-script-setting')
        .addTextArea((t) => {
          t.setValue(this.plugin.settings.nameScript).onChange(async (v) => {
            this.plugin.settings.nameScript = v;
            await this.plugin.saveAll();
          });
          t.inputEl.rows = 4;
          t.inputEl.addClass('hw-name-script');
          t.inputEl.setAttr('spellcheck', 'false');
        });

      new Setting(containerEl)
        .setName('Test the script')
        .setDesc('Runs the script once and shows the result (or the error).')
        .addButton((b) =>
          b.setButtonText('Run once').onClick(async () => {
            try {
              const name = await runNameScript(
                this.plugin.settings.nameScript,
                this.plugin.app as unknown as ScriptHost,
                this.plugin.settings.nameApiPlugin || 'randomness',
                'test-seed',
              );
              new Notice(`Name script → ${name}`);
            } catch (e) {
              new Notice(`Name script error: ${(e as Error)?.message ?? e}`);
            }
          }),
        );
    }

    if (this.plugin.nameProvider) {
      new Setting(containerEl)
        .setName('API name provider active')
        .setDesc('A provider was registered via setNameProvider() (e.g. from Templater). It takes precedence over the settings above until cleared.');
    }

    new Setting(containerEl)
      .setName('Seed property')
      .setDesc('Frontmatter property a bare block/inline reads for a per-note seed. Set it once (e.g. from a template) to give a note random-but-consistent arms across the page.')
      .addText((t) =>
        t.setValue(this.plugin.settings.seedProperty).onChange(async (v) => {
          this.plugin.settings.seedProperty = v || 'heraldry-seed';
          await this.plugin.saveAll();
        }),
      );

    new Setting(containerEl).setName('Inserting blocks').setHeading();

    new Setting(containerEl)
      .setName('Static inserts')
      .setDesc('Insert heraldry blocks with controls off (adds a "controls: false" line) so a note shows a fixed coat of arms. Turn this off to insert rollable blocks with Reroll/Save/SVG/PNG buttons. You can always edit the line on an individual note.')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.staticInserts).onChange(async (v) => {
          this.plugin.settings.staticInserts = v;
          await this.plugin.saveAll();
        }),
      );

    new Setting(containerEl).setName('Custom charges').setHeading();

    new Setting(containerEl)
      .setName('Bundled charge pack')
      .setDesc('Include the built-in fantasy charge pack (game-icons.net, CC BY 3.0 — see CREDITS).')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.enablePack).onChange(async (v) => {
          this.plugin.settings.enablePack = v;
          await this.plugin.saveAll();
          this.plugin.applyPack();
          this.plugin.refreshViews();
        }),
      );

    new Setting(containerEl)
      .setName('Charge folder')
      .setDesc('Vault folder scanned for .svg files to use as custom charges.')
      .addText((t) =>
        t
          .setValue(this.plugin.settings.chargeFolder)
          .onChange(async (v) => {
            this.plugin.settings.chargeFolder = v;
            await this.plugin.saveAll();
          }),
      );

    new Setting(containerEl)
      .setName('Recolour imported charges')
      .setDesc('Treat imported SVGs as silhouettes and recolour them to the chosen tincture.')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.recolorImports).onChange(async (v) => {
          this.plugin.settings.recolorImports = v;
          await this.plugin.saveAll();
          await this.plugin.loadCustomCharges();
          this.plugin.refreshViews();
        }),
      );

    new Setting(containerEl)
      .setName('Reload custom charges')
      .setDesc(`${this.plugin.importedCharges.length} custom charge(s) currently loaded.`)
      .addButton((b) =>
        b.setButtonText('Reload').onClick(async () => {
          await this.plugin.loadCustomCharges();
          this.plugin.refreshViews();
          this.display();
        }),
      );

    const names = Object.keys(this.plugin.arms).sort((a, b) => a.localeCompare(b));
    new Setting(containerEl).setName('Saved arms').setHeading();

    if (names.length === 0) {
      containerEl.createEl('p', {
        text: 'No saved arms yet. Use the Save button on a heraldry codeblock to keep one.',
        cls: 'hw-settings-empty',
      });
      return;
    }

    for (const name of names) {
      const spec = this.plugin.arms[name];
      const row = new Setting(containerEl).setName(name).setDesc(toBlazon(spec));
      // tiny preview
      const preview = row.controlEl.createSpan({ cls: 'hw-inline' });
      const node = new DOMParser().parseFromString(
        renderSvg(spec, { uid: `set-${name}`, outline: this.plugin.settings.outline }),
        'image/svg+xml',
      ).documentElement;
      preview.appendChild(node);
      row.addButton((b) =>
        b
          .setButtonText('Delete')
          .setWarning()
          .onClick(async () => {
            delete this.plugin.arms[name];
            await this.plugin.saveAll();
            this.display();
          }),
      );
    }
  }
}
