const KEY = 'light-hub:devices';
const CURRENT_SCHEMA = 1;

export class Store {
  constructor(storage = localStorage) {
    this.storage = storage;
    this._devices = this._load();
  }

  _load() {
    const raw = this.storage.getItem(KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (parsed.schemaVersion !== CURRENT_SCHEMA) return [];
      return Array.isArray(parsed.devices) ? parsed.devices : [];
    } catch (e) {
      return [];
    }
  }

  _save() {
    this.storage.setItem(KEY, JSON.stringify({
      schemaVersion: CURRENT_SCHEMA,
      devices: this._devices,
    }));
  }

  list() {
    return [...this._devices];
  }

  add(partial) {
    const device = {
      localId: crypto.randomUUID(),
      bleId: partial.bleId || null,
      name: partial.name || 'Light',
      originalName: partial.originalName || partial.name || '',
      protocol: partial.protocol || 'elk',
      service: partial.service || null,
      writeChar: partial.writeChar || null,
      lastColor: partial.lastColor || { r: 255, g: 255, b: 255 },
      lastBrightness: typeof partial.lastBrightness === 'number' ? partial.lastBrightness : 100,
      lastOn: !!partial.lastOn,
      addedAt: new Date().toISOString(),
    };
    this._devices.push(device);
    this._save();
    return device;
  }

  findByLocalId(localId) {
    return this._devices.find(d => d.localId === localId);
  }

  findByBleId(bleId) {
    return this._devices.find(d => d.bleId === bleId);
  }

  findByOriginalName(name) {
    return this._devices.find(d => d.originalName === name);
  }

  rename(localId, newName) {
    const d = this.findByLocalId(localId);
    if (!d) return;
    d.name = newName;
    this._save();
  }

  remove(localId) {
    this._devices = this._devices.filter(d => d.localId !== localId);
    this._save();
  }

  updateState(localId, patch) {
    const d = this.findByLocalId(localId);
    if (!d) return;
    if (patch.lastColor !== undefined) d.lastColor = patch.lastColor;
    if (patch.lastBrightness !== undefined) d.lastBrightness = patch.lastBrightness;
    if (patch.lastOn !== undefined) d.lastOn = patch.lastOn;
    this._save();
  }

  updateBleId(localId, newBleId) {
    const d = this.findByLocalId(localId);
    if (!d) return;
    d.bleId = newBleId;
    this._save();
  }
}
