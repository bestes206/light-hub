import { elk, qc } from './frames.js';

// Known services in probe order. First match wins and determines protocol.
const SERVICE_TABLE = [
  {
    service: '0000fff0-0000-1000-8000-00805f9b34fb',
    writeChar: '0000fff3-0000-1000-8000-00805f9b34fb',
    protocol: 'elk',
  },
  {
    service: '0000ffe0-0000-1000-8000-00805f9b34fb',
    writeChar: '0000ffe1-0000-1000-8000-00805f9b34fb',
    protocol: 'elk',
  },
  {
    service: '0000ff10-0000-1000-8000-00805f9b34fb',
    writeChar: '0000ff12-0000-1000-8000-00805f9b34fb',
    protocol: 'qc',
  },
];

const SERVICE_TO_ENTRY = Object.fromEntries(SERVICE_TABLE.map(e => [e.service, e]));

const NAME_PREFIXES = [
  'ELK-',        // Lotus Lantern
  'MELK',        // ELK variants
  'LEDBLE',      // ELK family
  'LED-',        // generic
  'Smart Light', // DayBetter
  'DAY',         // DayBetter variants
  'DB-',         // DayBetter variants
];

const REQUEST_FILTERS = {
  filters: [
    ...SERVICE_TABLE.map(e => ({ services: [e.service] })),
    ...NAME_PREFIXES.map(p => ({ namePrefix: p })),
  ],
  optionalServices: SERVICE_TABLE.map(e => e.service),
};

const CONNECT_TIMEOUT_MS = 8000;
const QC_MIN_DELAY_MS = 150; // Firmware requirement for DayBetter.

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timeout after ${ms}ms`)), ms)),
  ]);
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export class ELKBLEDOMDriver {
  constructor() {
    // Keyed by BluetoothDevice.id.
    this._chars = new Map();          // id → BluetoothRemoteGATTCharacteristic
    this._protocols = new Map();      // id → 'elk' | 'qc'
    this._lastWriteAt = new Map();    // id → ms timestamp (for QC rate-limiting)
    this._rgbModeSent = new Set();    // id → whether QC "set RGB mode" has been sent this session
    this._disconnectCbs = new Map();  // id → callback
  }

  isSupported() {
    return typeof navigator !== 'undefined' && !!navigator.bluetooth;
  }

  async requestDevice() {
    if (!this.isSupported()) throw new Error('Web Bluetooth not available');
    return await navigator.bluetooth.requestDevice(REQUEST_FILTERS);
  }

  async getKnownDevices() {
    if (!this.isSupported() || !navigator.bluetooth.getDevices) return [];
    try {
      return await navigator.bluetooth.getDevices();
    } catch (e) {
      return [];
    }
  }

  async connect(device, savedHints = {}) {
    const server = await withTimeout(device.gatt.connect(), CONNECT_TIMEOUT_MS, 'gatt.connect');

    // Probe order: if the device record already knows its service, try that first;
    // otherwise run through SERVICE_TABLE in declared order.
    const probeOrder = savedHints.service
      ? [
          SERVICE_TO_ENTRY[savedHints.service],
          ...SERVICE_TABLE.filter(e => e.service !== savedHints.service),
        ].filter(Boolean)
      : SERVICE_TABLE;

    let matched = null;
    let ch = null;
    for (const entry of probeOrder) {
      try {
        const svc = await server.getPrimaryService(entry.service);
        ch = await svc.getCharacteristic(entry.writeChar);
        matched = entry;
        break;
      } catch (e) {
        // try next
      }
    }
    if (!matched) {
      device.gatt.disconnect();
      throw new Error('No supported service found on device');
    }

    this._chars.set(device.id, ch);
    this._protocols.set(device.id, matched.protocol);
    this._rgbModeSent.delete(device.id);
    this._lastWriteAt.delete(device.id);

    device.addEventListener('gattserverdisconnected', () => {
      this._chars.delete(device.id);
      this._protocols.delete(device.id);
      this._rgbModeSent.delete(device.id);
      this._lastWriteAt.delete(device.id);
      const cb = this._disconnectCbs.get(device.id);
      if (cb) cb();
    });

    return { service: matched.service, writeChar: matched.writeChar, protocol: matched.protocol };
  }

  isConnected(device) {
    return this._chars.has(device.id);
  }

  _protocolOf(device) {
    return this._protocols.get(device.id);
  }

  async _write(device, bytes) {
    const ch = this._chars.get(device.id);
    if (!ch) throw new Error('Not connected');

    // QC firmware requires 150ms minimum between writes. Enforce here so callers don't have to.
    if (this._protocolOf(device) === 'qc') {
      const last = this._lastWriteAt.get(device.id) || 0;
      const wait = QC_MIN_DELAY_MS - (Date.now() - last);
      if (wait > 0) await delay(wait);
    }

    if (ch.properties.writeWithoutResponse) {
      await ch.writeValueWithoutResponse(bytes);
    } else {
      await ch.writeValue(bytes);
    }
    this._lastWriteAt.set(device.id, Date.now());
  }

  async setPower(device, on) {
    const proto = this._protocolOf(device);
    if (proto === 'qc') {
      await this._write(device, on ? qc.buildPowerOn() : qc.buildPowerOff());
    } else {
      await this._write(device, on ? elk.buildPowerOn() : elk.buildPowerOff());
    }
  }

  async setColor(device, { r, g, b }) {
    const proto = this._protocolOf(device);
    if (proto === 'qc') {
      // Firmware requires "set RGB mode" once before the first color change. Cached per-connection.
      if (!this._rgbModeSent.has(device.id)) {
        await this._write(device, qc.buildSetRgbMode());
        this._rgbModeSent.add(device.id);
      }
      await this._write(device, qc.buildColor(r, g, b));
    } else {
      await this._write(device, elk.buildColor(r, g, b));
    }
  }

  async setBrightness(device, percent) {
    const proto = this._protocolOf(device);
    if (proto === 'qc') {
      await this._write(device, qc.buildBrightness(percent));
    } else {
      await this._write(device, elk.buildBrightness(percent));
    }
  }

  disconnect(device) {
    try { device.gatt.disconnect(); } catch (e) { /* ignore */ }
    this._chars.delete(device.id);
    this._protocols.delete(device.id);
    this._rgbModeSent.delete(device.id);
    this._lastWriteAt.delete(device.id);
  }

  onDisconnect(device, callback) {
    this._disconnectCbs.set(device.id, callback);
  }
}
