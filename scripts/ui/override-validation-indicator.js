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

  show(overrideData, tokenName) {
    this._data = { overrides: Array.isArray(overrideData) ? overrideData : [], tokenName };
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
    this._data = { overrides: Array.isArray(overrideData) ? overrideData : [], tokenName };
    this.#updateBadge();
    if (this._tooltipEl?.isConnected) this.#renderTooltipContents();
  }

  async openDialog() {
    if (!this._data?.overrides?.length) return;
    try {
      const { OverrideValidationDialog } = await import('./override-validation-dialog.js');
      await OverrideValidationDialog.show(this._data.overrides, this._data.tokenName);
      // Keep indicator visible; user can minimize dialog back
    } catch (e) {
      console.error('PF2E Visioner | Failed to open OverrideValidationDialog from indicator:', e);
    }
  }

  async clearAll() {
    if (!this._data?.overrides?.length) return;
    try {
      const { eventDrivenVisibilitySystem } = await import('../visibility/auto-visibility/EventDrivenVisibilitySystem.js');
      for (const { observerId, targetId } of this._data.overrides) {
        await eventDrivenVisibilitySystem.removeOverride(observerId, targetId);
      }
      ui.notifications?.info?.(`Cleared ${this._data.overrides.length} invalid override(s)`);
      this.hide();
    } catch (e) {
      console.error('PF2E Visioner | Failed to clear overrides from indicator:', e);
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
      await this.clearAll();
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
    const items = (this._data?.overrides || []).slice(0, 6); // show up to 6

    const mkState = (visKey, coverKey) => {
      const vCfg = VISIBILITY_STATES?.[visKey] || { icon: 'fas fa-eye', label: 'Observed', color: '#4caf50' };
      const cCfg = COVER_STATES?.[coverKey] || { icon: 'fas fa-shield', label: 'Cover', color: '#999' };
      const vLabel = game?.i18n?.localize?.(vCfg.label) || vCfg.label || '';
      const cLabel = game?.i18n?.localize?.(cCfg.label) || cCfg.label || '';
      return `<span class="state-pair"><i class="${vCfg.icon}" style="color:${vCfg.color}" title="${vLabel}"></i><i class="${cCfg.icon}" style="color:${cCfg.color}" title="${cLabel}"></i></span>`;
    };

    const rows = items.map((o) => {
      const prevVis = o.state || (o.hasConcealment ? 'concealed' : 'observed');
      const prevCover = o.hasCover ? (o.expectedCover || 'standard') : 'none';
      const curVis = o.currentVisibility || 'observed';
      const curCover = o.currentCover || 'none';
      const reasons = (o.reasonIcons || []).map((r) => `<i class="${r.icon}" title="${r.text}"></i>`).join('');
      return `
        <div class="tip-row">
          <div class="who">${o.observerName} <i class="fas fa-arrow-right"></i> ${o.targetName}</div>
          <div class="states">${mkState(prevVis, prevCover)} <i class="fas fa-arrow-right"></i> ${mkState(curVis, curCover)}</div>
          <div class="reasons">${reasons}</div>
        </div>
      `;
    }).join('');

    this._tooltipEl.innerHTML = `
      <div class="tip-header"><i class="fas fa-exclamation-triangle"></i> ${this._data?.overrides?.length || 0} override(s) to validate</div>
      ${rows || '<div class="tip-empty">No details available</div>'}
      <div class="tip-footer"><span>Left-click: open details</span><span>Right-click: accept all</span></div>
    `;
  }

  #ensureStyles() {
    if (document.getElementById('pf2e-visioner-override-indicator-styles')) return;
    const style = document.createElement('style');
    style.id = 'pf2e-visioner-override-indicator-styles';
    style.textContent = `
      .pf2e-visioner-override-indicator {
        position: fixed; top: 60%; left: 10px; width: 42px; height: 42px; background: rgba(0,0,0,0.85); border: 2px solid #ffc107; border-radius: 9px; color: #fff; display: none; align-items: center; justify-content: center; cursor: move; z-index: 1001; font-size: 18px; box-shadow: 0 2px 8px rgba(0,0,0,0.35); transition: transform .15s ease, box-shadow .15s ease; user-select: none;
      }
      .pf2e-visioner-override-indicator--visible { display: flex; }
      .pf2e-visioner-override-indicator.dragging { cursor: grabbing; transform: scale(1.06); box-shadow: 0 4px 18px rgba(0,0,0,0.5); }
      .pf2e-visioner-override-indicator .indicator-icon { pointer-events: none; }
      .pf2e-visioner-override-indicator .indicator-badge { position: absolute; top: -6px; right: -6px; background: #dc3545; color: #fff; border-radius: 10px; padding: 2px 6px; font-size: 11px; border: 1px solid rgba(0,0,0,0.2); }
      .pf2e-visioner-override-indicator.pulse { animation: pv-pulse 1.2s ease-in-out infinite; }
      @keyframes pv-pulse { 0% { box-shadow: 0 0 0 0 rgba(255,193,7,0.6) } 70% { box-shadow: 0 0 0 10px rgba(255,193,7,0) } 100% { box-shadow: 0 0 0 0 rgba(255,193,7,0) } }

      .pf2e-visioner-override-tooltip { position: fixed; min-width: 320px; max-width: 420px; background: rgba(30,30,30,0.98); color: #fff; border: 1px solid #555; border-radius: 8px; padding: 8px 10px; z-index: 1002; font-size: 12px; box-shadow: 0 2px 16px rgba(0,0,0,0.45); backdrop-filter: blur(2px); }
      .pf2e-visioner-override-tooltip .tip-header { font-weight: 600; margin-bottom: 6px; color: #ffc107; }
      .pf2e-visioner-override-tooltip .tip-row { display: grid; grid-template-columns: 1fr; gap: 2px; padding: 6px 0; border-top: 1px solid rgba(255,255,255,0.06); }
      .pf2e-visioner-override-tooltip .tip-row:first-of-type { border-top: none; }
      .pf2e-visioner-override-tooltip .who { color: #ddd; }
      .pf2e-visioner-override-tooltip .states { display: flex; align-items: center; gap: 6px; color: #aaa; }
      .pf2e-visioner-override-tooltip .state-pair i { margin-right: 2px; }
      .pf2e-visioner-override-tooltip .reasons i { margin-right: 6px; color: #90caf9; }
      .pf2e-visioner-override-tooltip .tip-footer { display: flex; justify-content: space-between; margin-top: 6px; color: #bbb; }
      .pf2e-visioner-override-tooltip .tip-empty { color: #bbb; padding: 8px 0; }
    `;
    document.head.appendChild(style);
  }
}

const overrideValidationIndicator = OverrideValidationIndicator.getInstance();
export default overrideValidationIndicator;
export { OverrideValidationIndicator };
