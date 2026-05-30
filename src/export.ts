// Image export. SVG download is a plain Blob; PNG rasterises the SVG through an
// offscreen canvas at a chosen width (preserving the 200:230 escutcheon aspect).

import { SHIELD_W, SHIELD_H } from './engine/shields';

function downloadBlob(data: Blob, filename: string): void {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function svgToDataUri(svg: string): string {
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

export function downloadSvg(svg: string, filename: string): void {
  downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), filename);
}

export function exportPng(svg: string, width: number, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = Math.max(1, Math.round(width));
      const h = Math.round((w * SHIELD_H) / SHIELD_W);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get a 2D canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Canvas toBlob returned null'));
          return;
        }
        downloadBlob(blob, filename);
        resolve();
      }, 'image/png');
    };
    img.onerror = () => reject(new Error('Failed to load SVG for rasterisation'));
    img.src = svgToDataUri(svg);
  });
}

/** Filesystem-safe version of an arms label for use as a filename. */
export function safeFilename(label: string): string {
  return (label.replace(/[^A-Za-z0-9 _-]+/g, '').trim() || 'arms').replace(/\s+/g, '-');
}
