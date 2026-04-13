import { Store } from './store.js';
import { parseRoute, navigate, onRouteChange, back } from './router.js';
import * as ui from './ui.js';
import { hueFromPointer, placeWheelPin } from './ui.js';
import { hueToRgb } from './color.js';

const params = new URLSearchParams(location.search);
const useMock = params.get('mock') === '1';

const driverModule = useMock
  ? await import('./mock-driver.js')
  : await import('./ble.js');

const driver = new driverModule.ELKBLEDOMDriver();
const store = new Store();

// Per-device runtime state, keyed by localId
const runtime = new Map();   // localId → { status, device }
function statusOf(localId) {
  return runtime.get(localId)?.status || 'NEW';
}
function setStatus(localId, status) {
  const cur = runtime.get(localId) || {};
  runtime.set(localId, { ...cur, status });
  render();
}
function setDeviceRef(localId, device) {
  const cur = runtime.get(localId) || {};
  runtime.set(localId, { ...cur, device });
}

// Render

const root = document.getElementById('app');

function render() {
  if (!driver.isSupported()) {
    root.innerHTML = ui.renderUnsupported();
    return;
  }
  const route = parseRoute();
  if (route.name === 'list') renderList();
  else if (route.name === 'detail') renderDetail(route.localId);
}

function renderList() {
  const devices = store.list();
  const statuses = {};
  for (const d of devices) statuses[d.localId] = statusOf(d.localId);
  root.innerHTML = ui.renderListScreen({ devices, statuses });
}

function renderDetail(localId) {
  const device = store.findByLocalId(localId);
  const status = statusOf(localId);
  root.innerHTML = ui.renderDetailScreen({ device, status });

  if (!device) return;
  const wheelWrap = root.querySelector('[data-action="wheel"]');
  const pin = root.querySelector('#wheel-pin');
  if (wheelWrap && pin) {
    const wheel = wheelWrap.querySelector('.wheel');
    requestAnimationFrame(() => {
      const { r, g, b } = device.lastColor;
      const hue = rgbToHue(r, g, b);
      placeWheelPin(pin, wheel, hue);
    });
  }
}

function rgbToHue(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  if (d === 0) return 0;
  let h;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h = h * 60;
  if (h < 0) h += 360;
  return h;
}

// Event delegation

let writeTimer = null;
function throttledWrite(fn) {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(fn, 150);
}

// Long-press on tile → menu. suppressClick swallows the click event that fires
// immediately after a long-press so we don't also navigate to detail.
let pressTimer = null;
let suppressClick = false;

root.addEventListener('click', async (e) => {
  if (suppressClick) { suppressClick = false; return; }
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;

  if (action === 'open') {
    navigate('detail', { localId: target.dataset.localId });
  } else if (action === 'back') {
    back();
  } else if (action === 'add') {
    await pairFlow();
  } else if (action === 'connect-all') {
    await connectAll();
  } else if (action === 'reconnect') {
    const localId = parseRoute().localId;
    await reconnect(localId);
  } else if (action === 'power') {
    const localId = parseRoute().localId;
    const device = store.findByLocalId(localId);
    const ref = runtime.get(localId)?.device;
    if (!ref) { await reconnect(localId); return; }
    const newOn = !device.lastOn;
    try {
      await driver.setPower(ref, newOn);
      store.updateState(localId, { lastOn: newOn });
    } catch (err) {
      console.error('setPower failed:', err);
      setStatus(localId, 'OFFLINE');
      return;
    }
    render();
  } else if (action === 'swatch') {
    const [r, g, b] = target.dataset.color.split(',').map(Number);
    const localId = parseRoute().localId;
    const ref = runtime.get(localId)?.device;
    if (!ref) return;
    try {
      await driver.setColor(ref, { r, g, b });
      store.updateState(localId, { lastColor: { r, g, b } });
    } catch (err) {
      console.error('setColor failed:', err);
      setStatus(localId, 'OFFLINE');
      return;
    }
    render();
  }
});

// Detail screen brightness slider
root.addEventListener('input', (e) => {
  const target = e.target;
  if (target.dataset.action !== 'brightness') return;
  const localId = parseRoute().localId;
  const percent = parseInt(target.value, 10);
  // Immediate visual feedback: update the label and glow intensity.
  const label = root.querySelector('.label');
  if (label) label.textContent = `Brightness ${percent}%`;
  const device = store.findByLocalId(localId);
  const glow = root.querySelector('.detail-glow');
  if (device && glow) {
    const { r, g, b } = device.lastColor;
    const scale = 12 + (percent / 100) * 32;
    glow.style.boxShadow = `0 0 ${scale}px rgb(${r},${g},${b})`;
    glow.style.opacity = 0.3 + (percent / 100) * 0.7;
  }
  const ref = runtime.get(localId)?.device;
  if (!ref) return;
  throttledWrite(async () => {
    try {
      await driver.setBrightness(ref, percent);
      store.updateState(localId, { lastBrightness: percent });
      // Skip full render during drag — keeps slider smooth.
    } catch (err) {
      console.error('setBrightness failed:', err);
      setStatus(localId, 'OFFLINE');
    }
  });
});

// Detail screen color wheel drag
let wheelDragging = false;
root.addEventListener('pointerdown', (e) => {
  // Long-press detection on tiles
  const tile = e.target.closest('.tile');
  if (tile) {
    const localId = tile.dataset.localId;
    pressTimer = setTimeout(() => {
      pressTimer = null;
      suppressClick = true;
      showTileMenu(localId);
    }, 600);
    return;
  }
  // Color wheel drag
  const wheelWrap = e.target.closest('[data-action="wheel"]');
  if (!wheelWrap) return;
  wheelDragging = true;
  wheelWrap.setPointerCapture(e.pointerId);
  applyWheel(e);
});
root.addEventListener('pointermove', (e) => {
  if (!wheelDragging) return;
  applyWheel(e);
});
root.addEventListener('pointerup', () => {
  wheelDragging = false;
  clearTimeout(pressTimer);
  pressTimer = null;
});
root.addEventListener('pointercancel', () => {
  wheelDragging = false;
  clearTimeout(pressTimer);
  pressTimer = null;
});

function updateGlowPreview({ r, g, b }) {
  const glow = root.querySelector('.detail-glow');
  if (!glow) return;
  const c = `rgb(${r}, ${g}, ${b})`;
  glow.style.background = c;
  glow.style.boxShadow = `0 0 40px ${c}, 0 0 12px ${c}`;
}

function applyWheel(e) {
  const wheelWrap = root.querySelector('[data-action="wheel"]');
  if (!wheelWrap) return;
  const wheel = wheelWrap.querySelector('.wheel');
  const pin = root.querySelector('#wheel-pin');
  const hue = hueFromPointer(wheel, e.clientX, e.clientY);
  const { r, g, b } = hueToRgb(hue);
  pin.style.color = `rgb(${r},${g},${b})`;
  placeWheelPin(pin, wheel, hue);
  updateGlowPreview({ r, g, b });

  const localId = parseRoute().localId;
  const ref = runtime.get(localId)?.device;
  if (!ref) return;
  throttledWrite(async () => {
    try {
      await driver.setColor(ref, { r, g, b });
      store.updateState(localId, { lastColor: { r, g, b } });
    } catch (err) {
      console.error('setColor failed:', err);
      setStatus(localId, 'OFFLINE');
    }
  });
}

// Pair flow

async function pairFlow() {
  let device;
  try {
    device = await driver.requestDevice();
  } catch (e) {
    return; // user cancelled or no devices
  }
  // Resolve identity
  let record = store.findByBleId(device.id) || store.findByOriginalName(device.name);
  if (record && record.bleId !== device.id) {
    const ok = confirm(`Is this "${record.name}"?`);
    if (ok) store.updateBleId(record.localId, device.id);
    else record = null;
  }
  // Connect
  if (record) setStatus(record.localId, 'CONNECTING');
  let connInfo;
  try {
    connInfo = await driver.connect(device, record || {});
  } catch (e) {
    alert(`Couldn't connect: ${e.message}`);
    if (record) setStatus(record.localId, 'OFFLINE');
    return;
  }
  // Add new record if needed
  if (!record) {
    const name = await promptName(device.name || 'New Light');
    if (!name) { driver.disconnect(device); return; }
    record = store.add({
      bleId: device.id,
      name,
      originalName: device.name,
      protocol: connInfo.protocol,
      service: connInfo.service,
      writeChar: connInfo.writeChar,
    });
  }
  setDeviceRef(record.localId, device);
  setStatus(record.localId, 'CONNECTED');
  driver.onDisconnect(device, () => handleDisconnect(record.localId));
  render();
}

function promptName(suggested) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = ui.renderNameModal(suggested);
    document.body.appendChild(wrap);
    const cleanup = () => wrap.remove();
    wrap.addEventListener('click', (e) => {
      const action = e.target.dataset?.action;
      if (action === 'modal-cancel') { cleanup(); resolve(null); }
      else if (action === 'modal-save') {
        const v = document.getElementById('modal-name-input').value.trim();
        cleanup();
        resolve(v || suggested);
      }
    });
  });
}

async function connectAll() {
  for (const record of store.list()) {
    if (statusOf(record.localId) === 'CONNECTED') continue;
    try {
      const device = await driver.requestDevice();
      let target = store.findByBleId(device.id) || store.findByOriginalName(device.name);
      if (!target) target = record;
      setStatus(target.localId, 'CONNECTING');
      const info = await driver.connect(device, target);
      store.updateBleId(target.localId, device.id);
      setDeviceRef(target.localId, device);
      setStatus(target.localId, 'CONNECTED');
      driver.onDisconnect(device, () => handleDisconnect(target.localId));
    } catch (e) {
      break;
    }
  }
  render();
}

async function reconnect(localId) {
  const record = store.findByLocalId(localId);
  if (!record) return;
  setStatus(localId, 'CONNECTING');
  try {
    const known = await driver.getKnownDevices();
    let device = known.find(d => d.id === record.bleId);
    if (!device) device = await driver.requestDevice();
    await driver.connect(device, record);
    if (device.id !== record.bleId) store.updateBleId(localId, device.id);
    setDeviceRef(localId, device);
    setStatus(localId, 'CONNECTED');
    driver.onDisconnect(device, () => handleDisconnect(localId));
  } catch (e) {
    setStatus(localId, 'OFFLINE');
  }
}

function handleDisconnect(localId) {
  setStatus(localId, 'DISCONNECTED');
  setTimeout(async () => {
    if (statusOf(localId) !== 'DISCONNECTED') return;
    await reconnect(localId);
  }, 500);
}

// Long-press tile menu

function showTileMenu(localId) {
  const device = store.findByLocalId(localId);
  if (!device) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = ui.renderTileMenu(device);
  document.body.appendChild(wrap);
  const cleanup = () => wrap.remove();
  wrap.addEventListener('click', async (e) => {
    const action = e.target.dataset?.action;
    if (action === 'modal-cancel') cleanup();
    else if (action === 'tile-rename') {
      cleanup();
      const newName = await promptName(device.name);
      if (newName) { store.rename(localId, newName); render(); }
    } else if (action === 'tile-remove') {
      cleanup();
      if (confirm(`Remove "${device.name}"?`)) {
        const ref = runtime.get(localId)?.device;
        if (ref) driver.disconnect(ref);
        runtime.delete(localId);
        store.remove(localId);
        render();
      }
    }
  });
}

// Bootstrap

onRouteChange(render);
window.addEventListener('hashchange', render);
render();
autoReconnect();

async function autoReconnect() {
  if (!driver.isSupported()) return;
  const known = await driver.getKnownDevices();
  if (known.length === 0) return; // no persisted permissions; fall back to tap-to-connect
  for (const record of store.list()) {
    const device = known.find(d => d.id === record.bleId);
    if (!device) continue;
    setStatus(record.localId, 'CONNECTING');
    try {
      await driver.connect(device, record);
      setDeviceRef(record.localId, device);
      setStatus(record.localId, 'CONNECTED');
      driver.onDisconnect(device, () => handleDisconnect(record.localId));
    } catch (e) {
      setStatus(record.localId, 'OFFLINE');
    }
  }
}
