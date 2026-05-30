import { App, Modal } from 'obsidian';
import { renderSvg } from './engine/render';
import { GUIDE_INTRO, GUIDE_SECTIONS } from './guide';

/** A scrollable reference to the plugin's heraldry options, each illustrated
 *  with a rendered mini-shield. Opened from the panel and from Settings. */
export class HeraldryGuideModal extends Modal {
  private outline?: string;

  constructor(app: App, outline?: string) {
    super(app);
    this.outline = outline;
  }

  onOpen(): void {
    this.modalEl.addClass('hw-guide-modal');
    const c = this.contentEl;
    c.empty();
    c.addClass('hw-guide');

    c.createEl('h2', { text: 'Heraldry guide', cls: 'hw-guide-title' });
    c.createEl('p', { text: GUIDE_INTRO, cls: 'hw-guide-intro' });

    let uid = 0;
    for (const section of GUIDE_SECTIONS) {
      c.createEl('h3', { text: section.title, cls: 'hw-guide-section-title' });
      if (section.intro) c.createEl('p', { text: section.intro, cls: 'hw-guide-section-intro' });

      const grid = c.createDiv({ cls: 'hw-guide-grid' });
      for (const entry of section.entries) {
        const card = grid.createDiv({ cls: 'hw-guide-card' });
        const art = card.createDiv({ cls: 'hw-guide-art' });
        const svg = renderSvg(entry.spec, { uid: `guide-${uid++}`, outline: this.outline });
        const node = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
        art.appendChild(node);
        card.createDiv({ cls: 'hw-guide-name', text: entry.name });
        card.createDiv({ cls: 'hw-guide-note', text: entry.note });
      }
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
