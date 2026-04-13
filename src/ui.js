import { hsvToRgb, polarToHue } from './color.js';

const rgbStr = ({ r, g, b }) => `rgb(${r}, ${g}, ${b})`;

const glowStyle = (color, on) => {
  if (!on) return 'background: var(--status-new); box-shadow: none;';
  const c = rgbStr(color);
  return `background: ${c}; box-shadow: 0 0 14px ${c}, 0 0 4px ${c};`;
};

export function renderUnsupported() {
  return `
    <div class="unsupported">
      <h2>Web Bluetooth not available</h2>
      <p>Open this page in <strong>Bluefy</strong> on iOS, or Chrome on desktop / Android.</p>
    </div>
  `;
}

export function renderListScreen({ devices, statuses }) {
  const tilesHtml = devices.map(d => {
    const status = statuses[d.localId] || 'NEW';
    const statusClass = {
      NEW: '',
      CONNECTING: 'connecting',
      DISCONNECTED: 'connecting',
      CONNECTED: 'connected',
      OFFLINE: 'offline',
    }[status] || '';
    const offClass = !d.lastOn ? 'off' : '';
    const meta = d.lastOn
      ? `${d.lastBrightness}%`
      : 'off';
    return `
      <div class="tile ${offClass}" data-action="open" data-local-id="${d.localId}">
        <div class="tile-glow" style="${glowStyle(d.lastColor, d.lastOn)}"></div>
        <div>
          <div class="tile-name">${escapeHtml(d.name)}</div>
          <div class="tile-meta">${meta}</div>
        </div>
        <div style="flex:1"></div>
        <div class="tile-status ${statusClass}"></div>
      </div>
    `;
  }).join('');

  const empty = devices.length === 0 ? `
    <div class="empty">
      <p>No lights yet.</p>
      <button class="cta" data-action="add">+ Add a light</button>
    </div>
  ` : '';

  const toolbar = devices.length > 0 ? `
    <div class="toolbar">
      <button data-action="add">+ Add light</button>
      <button data-action="connect-all">Connect all</button>
    </div>
  ` : '';

  return `
    <div class="app-header">LIGHTS</div>
    ${tilesHtml}
    ${empty}
    ${toolbar}
  `;
}

export function renderDetailScreen({ device, status }) {
  if (!device) {
    return `
      <button class="detail-back" data-action="back">‹ Back</button>
      <p style="text-align:center; color: var(--text-dim);">Light not found.</p>
    `;
  }
  const offline = status !== 'CONNECTED';
  const banner = offline ? `<div class="detail-offline-banner" data-action="reconnect">Disconnected — tap to retry</div>` : '';

  return `
    <button class="detail-back" data-action="back">‹ Back</button>
    <div class="detail-title">${escapeHtml(device.name)}</div>
    <div class="detail-sub">${escapeHtml(device.originalName || '')} · ${status.toLowerCase()}</div>
    ${banner}
    <div class="detail-controls ${offline ? 'disabled' : ''}">
      <div class="detail-glow" style="${glowStyle(device.lastColor, device.lastOn)}"></div>
      <div class="wheel-wrap" data-action="wheel">
        <div class="wheel"></div>
        <div class="wheel-pin" id="wheel-pin" style="color: ${rgbStr(device.lastColor)};"></div>
      </div>
      <div class="swatch-row">
        <button class="swatch" data-action="swatch" data-color="255,255,255" style="background: white;"></button>
        <button class="swatch" data-action="swatch" data-color="255,180,100" style="background: rgb(255,180,100);"></button>
      </div>
      <div class="label">Brightness ${device.lastBrightness}%</div>
      <input class="bright-slider" type="range" min="0" max="100" value="${device.lastBrightness}" data-action="brightness">
      <button class="power-toggle ${device.lastOn ? 'on' : ''}" data-action="power">
        ${device.lastOn ? 'ON' : 'OFF'}
      </button>
    </div>
  `;
}

export function placeWheelPin(pinEl, wheelEl, hue) {
  const rect = wheelEl.getBoundingClientRect();
  const radius = rect.width * 0.42;
  const rad = hue * Math.PI / 180;
  const x = Math.cos(rad) * radius;
  const y = -Math.sin(rad) * radius;
  pinEl.style.left = `${rect.width / 2 + x}px`;
  pinEl.style.top = `${rect.height / 2 + y}px`;
}

export function hueFromPointer(wheelEl, clientX, clientY) {
  const rect = wheelEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return polarToHue(clientX - cx, clientY - cy);
}

export function renderNameModal(suggested) {
  return `
    <div class="modal-backdrop" data-modal="name">
      <div class="modal">
        <h3>Name this light</h3>
        <input id="modal-name-input" value="${escapeHtml(suggested)}" autofocus>
        <div class="modal-buttons">
          <button data-action="modal-cancel">Cancel</button>
          <button class="primary" data-action="modal-save">Save</button>
        </div>
      </div>
    </div>
  `;
}

export function renderConfirmModal(message) {
  return `
    <div class="modal-backdrop" data-modal="confirm">
      <div class="modal">
        <h3>${escapeHtml(message)}</h3>
        <div class="modal-buttons">
          <button data-action="modal-cancel">No</button>
          <button class="primary" data-action="modal-confirm">Yes</button>
        </div>
      </div>
    </div>
  `;
}

export function renderTileMenu(device) {
  return `
    <div class="modal-backdrop" data-modal="tile-menu">
      <div class="modal">
        <h3>${escapeHtml(device.name)}</h3>
        <div class="modal-buttons" style="flex-direction: column;">
          <button data-action="tile-rename">Rename</button>
          <button data-action="tile-remove">Remove</button>
          <button data-action="modal-cancel">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
