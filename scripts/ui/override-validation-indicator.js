/**
 * Override Validation Indicator - floating, draggable button with tooltip
 * - Pulses when there are invalid overrides pending
 * - Hover: shows a compact tooltip summary of changes
 * - Left-click: opens full OverrideValidationDialog
 * - Right-click: accepts all (clears all invalid overrides)
 * - Drag to move; position persists in localStorage
 */

import { VISIBILITY_STATES, COVER_STATES } from '../constants.js';

class OverrideValidationIndicator {
  static #instance = null;

  static getInstance() {
    if (!this.#instance) this.#instance = new this();
    return this.#instance;
  }

  constructor() {
    this._el = null;
    this._tooltipEl = null;
    this._data = null; // { overrides: [], tokenName }
    this._drag = { active: false, start: { x: 0, y: 0 }, offset: { x: 0, y: 0 }, moved: false };
  }

  show(overrideData, tokenName, movedTokenId = null) {
    // Ensure latest styles are injected or refreshed (hot-reload safe)
    this.#ensureStyles();
    this._data = { overrides: Array.isArray(overrideData) ? overrideData : [], tokenName, movedTokenId };
    if (!this._el) this.#createElement();
    this.#updateBadge();
    this._el.classList.add('pf2e-visioner-override-indicator--visible');
    this._el.classList.add('pulse');
  }

  hide() {
    if (!this._el) return;
    this._el.classList.remove('pf2e-visioner-override-indicator--visible');
    this._el.classList.remove('pulse');
    this.#hideTooltip();
  }

  update(overrideData, tokenName) {
    // Ensure latest styles are applied (hot-reload safe)
    this.#ensureStyles();
    this._data = { overrides: Array.isArray(overrideData) ? overrideData : [], tokenName };
    this.#updateBadge();
    if (this._tooltipEl?.isConnected) this.#renderTooltipContents();
  }

  async openDialog() {
    if (!this._data?.overrides?.length) return;
    try {
  const { OverrideValidationDialog } = await import('./override-validation-dialog.js');
  // Expose moved token id for grouping via a global scratch, then show dialog
  try { game.pf2eVisioner = game.pf2eVisioner || {}; game.pf2eVisioner.lastMovedTokenId = this._data.movedTokenId || null; } catch {}
  await OverrideValidationDialog.show(this._data.overrides, this._data.tokenName);
      // Keep indicator visible; user can minimize dialog back
    } catch (e) {
      console.error('PF2E Visioner | Failed to open OverrideValidationDialog from indicator:', e);
    }
  }

  async clearAll() {
    if (!this._data?.overrides?.length) return;
    try {
      const { default: AvsOverrideManager } = await import('../chat/services/infra/avs-override-manager.js');
      for (const { observerId, targetId } of this._data.overrides) {
        await AvsOverrideManager.removeOverride(observerId, targetId);
      }
      ui.notifications?.info?.(`Cleared ${this._data.overrides.length} invalid override(s)`);
      this.hide();
    } catch (e) {
      console.error('PF2E Visioner | Failed to clear overrides from indicator:', e);
    }
  }

  async keepAll() {
    if (!this._data?.overrides?.length) return;
    try {
      // Retain overrides and dismiss indicator; dialog handles the semantics of "keep".
      this.hide();
      ui.notifications?.info?.('Kept all current overrides');
    } catch (e) {
      console.error('PF2E Visioner | Failed to keep overrides from indicator:', e);
    }
  }

  #createElement() {
    this.#ensureStyles();

    const el = document.createElement('div');
    el.className = 'pf2e-visioner-override-indicator';
    el.innerHTML = `
      <div class="indicator-icon"><i class="fas fa-exclamation-triangle"></i></div>
      <div class="indicator-badge">0</div>
    `;

    // Restore position
    try {
      const saved = localStorage.getItem('pf2e-visioner-override-indicator-pos');
      if (saved) {
        const pos = JSON.parse(saved);
        if (pos?.left) el.style.left = pos.left;
        if (pos?.top) el.style.top = pos.top;
      }
    } catch {}

    // Mouse handlers
    el.addEventListener('mousedown', (ev) => this.#onMouseDown(ev));
    document.addEventListener('mousemove', (ev) => this.#onMouseMove(ev));
    document.addEventListener('mouseup', (ev) => this.#onMouseUp(ev));

    // Hover tooltip
    el.addEventListener('mouseenter', () => this.#showTooltip());
    el.addEventListener('mouseleave', () => this.#hideTooltip());

    // Clicks
    el.addEventListener('click', async (ev) => {
      if (this._drag.moved) return; // ignore click after drag
      ev.preventDefault();
      ev.stopPropagation();
      await this.openDialog();
    });
    el.addEventListener('contextmenu', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.shiftKey) {
        await this.keepAll();
      } else {
        await this.clearAll();
      }
    });

    document.body.appendChild(el);
    this._el = el;
  }

  #onMouseDown(event) {
    if (event.button !== 0) return; // left only for drag
    this._drag.active = true;
    this._drag.moved = false;
    this._drag.start.x = event.clientX;
    this._drag.start.y = event.clientY;
    const rect = this._el.getBoundingClientRect();
    this._drag.offset.x = event.clientX - rect.left;
    this._drag.offset.y = event.clientY - rect.top;
    this._el.classList.add('dragging');
  }

  #onMouseMove(event) {
    if (!this._drag.active) return;
    const dx = event.clientX - this._drag.start.x;
    const dy = event.clientY - this._drag.start.y;
    if (!this._drag.moved && Math.hypot(dx, dy) > 4) this._drag.moved = true;
    if (!this._drag.moved) return;
    const x = event.clientX - this._drag.offset.x;
    const y = event.clientY - this._drag.offset.y;
    const maxX = window.innerWidth - this._el.offsetWidth;
    const maxY = window.innerHeight - this._el.offsetHeight;
    this._el.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
    this._el.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
  }

  #onMouseUp() {
    if (!this._drag.active) return;
    this._drag.active = false;
    this._el.classList.remove('dragging');
    if (this._drag.moved) {
      try {
        localStorage.setItem(
          'pf2e-visioner-override-indicator-pos',
          JSON.stringify({ left: this._el.style.left, top: this._el.style.top })
        );
      } catch {}
      setTimeout(() => (this._drag.moved = false), 50);
    } else {
      this._drag.moved = false;
    }
  }

  #updateBadge() {
    const count = this._data?.overrides?.length || 0;
    const badge = this._el?.querySelector('.indicator-badge');
    if (badge) badge.textContent = String(count);
    this._el?.classList.toggle('has-items', count > 0);
    // Ensure pulse animation reflects presence of items
    if (count > 0) this._el?.classList.add('pulse');
    else this._el?.classList.remove('pulse');
  }

  #showTooltip() {
    if (!this._data?.overrides?.length) return;
    if (this._tooltipEl?.isConnected) return;
    const tip = document.createElement('div');
    tip.className = 'pf2e-visioner-override-tooltip';
    this._tooltipEl = tip;
    this.#renderTooltipContents();

    document.body.appendChild(tip);
    const rect = this._el.getBoundingClientRect();
    tip.style.left = rect.right + 8 + 'px';
    tip.style.top = Math.max(8, rect.top - 8) + 'px';
  }

  #hideTooltip() {
    if (this._tooltipEl?.parentElement) this._tooltipEl.parentElement.removeChild(this._tooltipEl);
    this._tooltipEl = null;
  }

  #renderTooltipContents() {
    if (!this._tooltipEl) return;
    const all = this._data?.overrides || [];
    const movedId = this._data?.movedTokenId ?? (globalThis?.game?.pf2eVisioner?.lastMovedTokenId ?? null);

    const mkVis = (key) => {
      const cfg = VISIBILITY_STATES?.[key] || { icon: 'fas fa-eye', label: 'Observed', cssClass: 'visibility-observed' };
      const label = game?.i18n?.localize?.(cfg.label) || cfg.label || '';
      const cls = cfg.cssClass || `visibility-${key}`;
      return `<i class="${cfg.icon} state-indicator ${cls}" data-state="${key}" title="${label}"></i>`;
    };
    const mkCover = (key) => {
      const cfg = COVER_STATES?.[key] || { icon: 'fas fa-shield', label: 'Cover', cssClass: 'cover-none' };
      const label = game?.i18n?.localize?.(cfg.label) || cfg.label || '';
      const cls = cfg.cssClass || `cover-${key}`;
      return `<i class="${cfg.icon} state-indicator ${cls}" data-state="${key}" title="${label}"></i>`;
    };

    const buildRow = (o) => {
      const prevVis = o.state || (o.hasConcealment ? 'concealed' : 'observed');
      const prevCover = o.hasCover ? (o.expectedCover || 'standard') : 'none';
      const curVis = o.currentVisibility || 'observed';
      const curCover = o.currentCover || 'none';
      const reasons = (o.reasonIcons || []).map((r) => `<i class="${r.icon}" title="${r.text}"></i>`).join('');
      return `
        <div class="tip-row">
          <div class="who">${o.observerName} <i class="fas fa-arrow-right"></i> ${o.targetName}</div>
          <div class="state-pair vis">${mkVis(prevVis)} <i class="fas fa-arrow-right"></i> ${mkVis(curVis)}</div>
          <div class="state-pair cover">${mkCover(prevCover)} <i class="fas fa-arrow-right"></i> ${mkCover(curCover)}</div>
          <div class="reasons">${reasons}</div>
        </div>
      `;
    };

    // If we know the moved token, split into two groups; otherwise render flat up to 6
    let contentHTML = '';
    if (movedId) {
      const asObserver = all.filter((o) => o.observerId === movedId);
      const asTarget = all.filter((o) => o.targetId === movedId);
      // Cap total to 6 items, prefer showing at least some of each group
      const cap = 6;
      const half = Math.max(1, Math.floor(cap / 2));
      const firstSlice = asObserver.slice(0, half);
      const secondSlice = asTarget.slice(0, cap - firstSlice.length);
      // If observer had fewer than half, top up from target up to cap
      const obsExtra = asObserver.slice(firstSlice.length, cap - secondSlice.length);
      const tgtExtra = asTarget.slice(secondSlice.length, cap - firstSlice.length - obsExtra.length);

      const section = (title, arr, groupKey) => arr.length
        ? `
          <div class="tip-group" data-group="${groupKey}">
            <div class="tip-group-header">
              <div class="tip-subheader">${title}</div>
            </div>
            <div class="tip-group-body">${arr.map(buildRow).join('')}</div>
          </div>
        `
        : '';

      const observerRows = [...firstSlice, ...obsExtra];
      const targetRows = [...secondSlice, ...tgtExtra];

      contentHTML = section('Overrides as observer', observerRows, 'observer') + section('Overrides as target', targetRows, 'target');
      if (!contentHTML) contentHTML = '<div class="tip-empty">No details available</div>';
    } else {
      const items = all.slice(0, 6);
      contentHTML = items.map(buildRow).join('') || '<div class="tip-empty">No details available</div>';
    }

    this._tooltipEl.innerHTML = `
      <div class="tip-header"><i class="fas fa-exclamation-triangle"></i> ${this._data?.overrides?.length || 0} override(s) to validate</div>
      ${contentHTML}
      <div class="tip-footer">
        <div class="footer-bottom"><span>Left-click: open details</span></div>
        <div class="footer-right">
          <span>Right-click: clear all</span>
          <span>Shift+Right-click: keep all</span>
        </div>
      </div>
    `;
  }

  #ensureStyles() {
    const existing = document.getElementById('pf2e-visioner-override-indicator-styles');
    const css = `
      .pf2e-visioner-override-indicator {
        position: fixed; top: 60%; left: 10px; width: 42px; height: 42px; background: var(--color-bg-option, rgba(0,0,0,0.85)); border: 2px solid var(--pf2e-visioner-warning); border-radius: 9px; color: var(--color-text-light-primary, #fff); display: none; align-items: center; justify-content: center; cursor: move; z-index: 1001; font-size: 18px; box-shadow: 0 2px 8px rgba(0,0,0,0.35); transition: transform .15s ease, box-shadow .15s ease; user-select: none; overflow: visible;
      }
      .pf2e-visioner-override-indicator--visible { display: flex; }
      .pf2e-visioner-override-indicator.dragging { cursor: grabbing; transform: scale(1.06); box-shadow: 0 4px 18px rgba(0,0,0,0.5); }
    .pf2e-visioner-override-indicator .indicator-icon { pointer-events: none; }
  .pf2e-visioner-override-indicator .indicator-badge { position: absolute; top: -6px; right: -6px; background: var(--pf2e-visioner-danger); color: var(--color-text-light-primary, #fff); border-radius: 10px; padding: 2px 6px; font-size: 11px; border: 1px solid rgba(0,0,0,0.2); }
  /* Transform-based pulse ring for broad compatibility (no color-mix needed) */
  .pf2e-visioner-override-indicator.pulse::after {
    content: '';
    position: absolute;
    inset: -6px;
    border-radius: 12px;
    border: 2px solid var(--pf2e-visioner-warning);
    opacity: 0;
    transform: scale(1);
    pointer-events: none;
    animation: pv-pulse-ring 1.2s ease-out infinite;
  }
  @keyframes pv-pulse-ring {
    0% { opacity: 0.6; transform: scale(0.9); }
    70% { opacity: 0; transform: scale(1.35); }
    100% { opacity: 0; transform: scale(1.35); }
  }

      .pf2e-visioner-override-tooltip { position: fixed; min-width: 280px; max-width: 400px; background: rgba(30,30,30,0.98); color: var(--color-text-light-primary, #fff); border: 1px solid var(--color-border-light-primary, #555); border-radius: 8px; padding: 6px; z-index: 1002; font-size: 12px; box-shadow: 0 2px 16px rgba(0,0,0,0.45); backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
      /* Explicit state colors for tooltip icons to ensure colorblind palettes apply correctly */
  .pf2e-visioner-override-tooltip .state-indicator.visibility-observed { color: var(--visibility-observed) !important; }
  .pf2e-visioner-override-tooltip .state-indicator.visibility-concealed { color: var(--visibility-concealed) !important; }
  .pf2e-visioner-override-tooltip .state-indicator.visibility-hidden { color: var(--visibility-hidden) !important; }
  .pf2e-visioner-override-tooltip .state-indicator.visibility-undetected { color: var(--visibility-undetected) !important; }
  .pf2e-visioner-override-tooltip .state-indicator.cover-none { color: var(--cover-none) !important; }
  .pf2e-visioner-override-tooltip .state-indicator.cover-lesser { color: var(--cover-lesser) !important; }
  .pf2e-visioner-override-tooltip .state-indicator.cover-standard { color: var(--cover-standard) !important; }
  .pf2e-visioner-override-tooltip .state-indicator.cover-greater { color: var(--cover-greater) !important; }
    /* Normalize cover icon visual size vs visibility */
    .pf2e-visioner-override-tooltip .state-indicator[class*='cover-'] { font-size: 1.08em; }
    .pf2e-visioner-override-tooltip .tip-header { font-weight: 600; margin-bottom: 6px; color: var(--pf2e-visioner-warning); }
    .pf2e-visioner-override-tooltip .tip-group { margin-top: 4px; }
    .pf2e-visioner-override-tooltip .tip-group-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 4px; }
    .pf2e-visioner-override-tooltip .tip-subheader { font-weight: 600; color: var(--color-text-dark-secondary, #bbb); }
    .pf2e-visioner-override-tooltip .tip-group-body { margin-top: 2px; }
    .pf2e-visioner-override-tooltip .tip-row { display: grid; grid-template-columns: 1fr auto auto auto; column-gap: 8px; row-gap: 4px; align-items: center; padding: 6px 0; border-top: 1px solid rgba(255,255,255,0.06); }
    .pf2e-visioner-override-tooltip .tip-row:first-of-type { border-top: none; }
    .pf2e-visioner-override-tooltip .who { color: #ddd; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pf2e-visioner-override-tooltip .state-pair { display: inline-flex; align-items: center; gap: 4px; color: #aaa; }
    .pf2e-visioner-override-tooltip .state-pair i.fas.fa-arrow-right { color: #999; }
    .pf2e-visioner-override-tooltip .state-pair i.state-indicator { margin: 0; }
    .pf2e-visioner-override-tooltip .reasons { display: inline-flex; align-items: center; gap: 4px; color: var(--pf2e-visioner-info, #90caf9); }
    .pf2e-visioner-override-tooltip .reasons i { font-size: 11px; }
    .pf2e-visioner-override-tooltip .tip-footer { display: flex; flex-direction: row; align-items: flex-end; justify-content: space-between; margin-top: 6px; color: #bbb; gap: 12px; }
    .pf2e-visioner-override-tooltip .tip-footer .footer-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
    .pf2e-visioner-override-tooltip .tip-footer .footer-bottom { white-space: nowrap; }
    .pf2e-visioner-override-tooltip .tip-empty { color: var(--color-text-dark-secondary, #bbb); padding: 8px 0; }
    `;
    if (existing) {
      existing.textContent = css;
    } else {
      const style = document.createElement('style');
      style.id = 'pf2e-visioner-override-indicator-styles';
      style.textContent = css;
      document.head.appendChild(style);
    }
  }
}

const overrideValidationIndicator = OverrideValidationIndicator.getInstance();
export default overrideValidationIndicator;
export { OverrideValidationIndicator };
