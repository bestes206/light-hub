// In-memory fake driver. Same interface as ELKBLEDOMDriver in ble.js.
// Activated via ?mock=1 query param in app.js.

let nextId = 1;

function makeFakeDevice(name) {
  return {
    id: `mock-${nextId++}`,
    name,
    gatt: {
      connect: () => Promise.resolve({}),
      disconnect: () => {},
    },
    addEventListener() {},
  };
}

// Three fake devices — two ELK, one QC — to exercise both code paths.
const FAKE_DEVICES = [
  { device: makeFakeDevice('ELK-BLEDOM-MOCK1'), protocol: 'elk',
    service: '0000fff0-0000-1000-8000-00805f9b34fb',
    writeChar: '0000fff3-0000-1000-8000-00805f9b34fb' },
  { device: makeFakeDevice('ELK-BLEDOM-MOCK2'), protocol: 'elk',
    service: '0000fff0-0000-1000-8000-00805f9b34fb',
    writeChar: '0000fff3-0000-1000-8000-00805f9b34fb' },
  { device: makeFakeDevice('Smart Light'), protocol: 'qc',
    service: '0000ff10-0000-1000-8000-00805f9b34fb',
    writeChar: '0000ff12-0000-1000-8000-00805f9b34fb' },
];

let pickIndex = 0;

export class ELKBLEDOMDriver {
  constructor() {
    this._connected = new Set();       // bleId set
    this._protocols = new Map();       // bleId → 'elk' | 'qc'
    this._disconnectCbs = new Map();   // bleId → cb
    this._state = new Map();           // bleId → {power, color, brightness}
  }

  isSupported() { return true; }

  async requestDevice() {
    const entry = FAKE_DEVICES[pickIndex % FAKE_DEVICES.length];
    pickIndex++;
    return entry.device;
  }

  async getKnownDevices() {
    return FAKE_DEVICES.map(e => e.device);
  }

  _entryFor(device) {
    return FAKE_DEVICES.find(e => e.device.id === device.id);
  }

  async connect(device) {
    await new Promise(r => setTimeout(r, 200)); // simulate BLE handshake
    const entry = this._entryFor(device);
    if (!entry) throw new Error('Unknown mock device');
    this._connected.add(device.id);
    this._protocols.set(device.id, entry.protocol);
    if (!this._state.has(device.id)) {
      this._state.set(device.id, { power: false, color: { r: 255, g: 255, b: 255 }, brightness: 100 });
    }
    return { service: entry.service, writeChar: entry.writeChar, protocol: entry.protocol };
  }

  isConnected(device) {
    return this._connected.has(device.id);
  }

  async setPower(device, on) {
    if (!this.isConnected(device)) throw new Error('Not connected');
    this._state.get(device.id).power = on;
    console.log(`[mock] ${device.name} (${this._protocols.get(device.id)}) power → ${on}`);
  }

  async setColor(device, color) {
    if (!this.isConnected(device)) throw new Error('Not connected');
    this._state.get(device.id).color = color;
    console.log(`[mock] ${device.name} (${this._protocols.get(device.id)}) color → rgb(${color.r},${color.g},${color.b})`);
  }

  async setBrightness(device, percent) {
    if (!this.isConnected(device)) throw new Error('Not connected');
    this._state.get(device.id).brightness = percent;
    console.log(`[mock] ${device.name} (${this._protocols.get(device.id)}) brightness → ${percent}%`);
  }

  disconnect(device) {
    this._connected.delete(device.id);
    this._protocols.delete(device.id);
    const cb = this._disconnectCbs.get(device.id);
    if (cb) cb();
  }

  onDisconnect(device, callback) {
    this._disconnectCbs.set(device.id, callback);
  }
}
