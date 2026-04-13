import { runSuite, assertEqual, assertDeepEqual, assert } from './lib/assert.js';
import { Store } from '../src/store.js';

// Simple in-memory storage that mimics localStorage interface.
const makeMemStorage = () => {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    clear: () => { for (const k of Object.keys(data)) delete data[k]; },
    _data: data,
  };
};

const tests = {
  'load from empty storage returns empty list'() {
    const s = new Store(makeMemStorage());
    assertDeepEqual(s.list(), []);
  },

  'add device persists to storage'() {
    const mem = makeMemStorage();
    const s = new Store(mem);
    const device = s.add({
      bleId: 'abc',
      name: 'Living Room',
      originalName: 'ELK-BLEDOM-1',
      protocol: 'elk',
      service: 'svc',
      writeChar: 'wch',
    });
    assert(device.localId, 'localId assigned');
    assert(device.addedAt, 'addedAt assigned');
    assertEqual(device.protocol, 'elk');
    assertEqual(s.list().length, 1);
    // Verify it persisted
    const s2 = new Store(mem);
    assertEqual(s2.list().length, 1);
    assertEqual(s2.list()[0].name, 'Living Room');
    assertEqual(s2.list()[0].protocol, 'elk');
  },

  'add device with qc protocol round-trips'() {
    const mem = makeMemStorage();
    const s = new Store(mem);
    const device = s.add({
      bleId: 'ff',
      name: 'Kid Lamp',
      originalName: 'Smart Light',
      protocol: 'qc',
      service: '0000ff10-0000-1000-8000-00805f9b34fb',
      writeChar: '0000ff12-0000-1000-8000-00805f9b34fb',
    });
    assertEqual(device.protocol, 'qc');
    const s2 = new Store(mem);
    assertEqual(s2.list()[0].protocol, 'qc');
  },

  'add device defaults to elk protocol when not specified'() {
    const s = new Store(makeMemStorage());
    const d = s.add({ bleId: '1', name: 'x' });
    assertEqual(d.protocol, 'elk');
  },

  'findByLocalId returns the right device'() {
    const s = new Store(makeMemStorage());
    const a = s.add({ bleId: '1', name: 'A' });
    const b = s.add({ bleId: '2', name: 'B' });
    assertEqual(s.findByLocalId(a.localId).name, 'A');
    assertEqual(s.findByLocalId(b.localId).name, 'B');
    assertEqual(s.findByLocalId('nope'), undefined);
  },

  'findByBleId matches'() {
    const s = new Store(makeMemStorage());
    s.add({ bleId: 'xyz', name: 'X' });
    assertEqual(s.findByBleId('xyz').name, 'X');
    assertEqual(s.findByBleId('nope'), undefined);
  },

  'findByOriginalName matches'() {
    const s = new Store(makeMemStorage());
    s.add({ bleId: '1', name: 'Bedroom', originalName: 'ELK-BLEDOM-FOO' });
    assertEqual(s.findByOriginalName('ELK-BLEDOM-FOO').name, 'Bedroom');
  },

  'rename updates the device name'() {
    const s = new Store(makeMemStorage());
    const d = s.add({ bleId: '1', name: 'Old' });
    s.rename(d.localId, 'New');
    assertEqual(s.findByLocalId(d.localId).name, 'New');
  },

  'remove deletes by localId'() {
    const s = new Store(makeMemStorage());
    const a = s.add({ bleId: '1', name: 'A' });
    s.add({ bleId: '2', name: 'B' });
    s.remove(a.localId);
    assertEqual(s.list().length, 1);
    assertEqual(s.list()[0].name, 'B');
  },

  'updateState patches lastColor/lastBrightness/lastOn'() {
    const s = new Store(makeMemStorage());
    const d = s.add({ bleId: '1', name: 'A' });
    s.updateState(d.localId, { lastColor: { r: 1, g: 2, b: 3 }, lastBrightness: 50, lastOn: true });
    const got = s.findByLocalId(d.localId);
    assertDeepEqual(got.lastColor, { r: 1, g: 2, b: 3 });
    assertEqual(got.lastBrightness, 50);
    assertEqual(got.lastOn, true);
  },

  'updateBleId rebinds without changing localId'() {
    const s = new Store(makeMemStorage());
    const d = s.add({ bleId: 'old', name: 'A' });
    const localId = d.localId;
    s.updateBleId(localId, 'new');
    assertEqual(s.findByLocalId(localId).bleId, 'new');
  },

  'corrupted storage falls back to empty list (does not throw)'() {
    const mem = makeMemStorage();
    mem.setItem('light-hub:devices', 'not-json{{{');
    const s = new Store(mem);
    assertDeepEqual(s.list(), []);
  },

  'unknown schema version falls back to empty list'() {
    const mem = makeMemStorage();
    mem.setItem('light-hub:devices', JSON.stringify({ schemaVersion: 999, devices: [] }));
    const s = new Store(mem);
    assertDeepEqual(s.list(), []);
  },
};

export const run = () => runSuite('store.js', tests);
