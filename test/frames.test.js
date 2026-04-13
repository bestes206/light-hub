import { runSuite, assertBytes, assertEqual } from './lib/assert.js';
import { elk, qc, crc16modbus } from '../src/frames.js';

const tests = {
  // ===== ELK-BLEDOM (9-byte 7E…EF frames) =====

  'elk.buildPowerOn returns canonical 9-byte frame'() {
    assertBytes(
      elk.buildPowerOn(),
      new Uint8Array([0x7e, 0x00, 0x04, 0xf0, 0x00, 0x01, 0xff, 0x00, 0xef]),
    );
  },

  'elk.buildPowerOff returns canonical 9-byte frame'() {
    assertBytes(
      elk.buildPowerOff(),
      new Uint8Array([0x7e, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0x00, 0xef]),
    );
  },

  'elk.buildColor packs RGB into bytes 4-6'() {
    assertBytes(
      elk.buildColor(255, 107, 53),
      new Uint8Array([0x7e, 0x00, 0x05, 0x03, 0xff, 0x6b, 0x35, 0x00, 0xef]),
    );
  },

  'elk.buildColor with all zeros'() {
    assertBytes(
      elk.buildColor(0, 0, 0),
      new Uint8Array([0x7e, 0x00, 0x05, 0x03, 0x00, 0x00, 0x00, 0x00, 0xef]),
    );
  },

  'elk.buildColor clamps out-of-range values'() {
    assertBytes(
      elk.buildColor(300, -10, 256),
      new Uint8Array([0x7e, 0x00, 0x05, 0x03, 0xff, 0x00, 0xff, 0x00, 0xef]),
    );
  },

  'elk.buildBrightness 0 percent → 0x00'() {
    assertBytes(
      elk.buildBrightness(0),
      new Uint8Array([0x7e, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0xef]),
    );
  },

  'elk.buildBrightness 100 percent → 0x64'() {
    assertBytes(
      elk.buildBrightness(100),
      new Uint8Array([0x7e, 0x00, 0x01, 0x64, 0x00, 0x00, 0x00, 0x00, 0xef]),
    );
  },

  'elk.buildBrightness 50 percent → 0x32'() {
    assertBytes(
      elk.buildBrightness(50),
      new Uint8Array([0x7e, 0x00, 0x01, 0x32, 0x00, 0x00, 0x00, 0x00, 0xef]),
    );
  },

  'elk.buildBrightness clamps below 0 and above 100'() {
    assertBytes(
      elk.buildBrightness(-10),
      new Uint8Array([0x7e, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0xef]),
    );
    assertBytes(
      elk.buildBrightness(150),
      new Uint8Array([0x7e, 0x00, 0x01, 0x64, 0x00, 0x00, 0x00, 0x00, 0xef]),
    );
  },

  // ===== CRC-16/MODBUS =====
  // poly 0xA001 (reflected), init 0xFFFF, returns 16-bit number.
  // Test vectors verified against real DayBetter firmware responses.

  'crc16modbus of empty input is 0xFFFF'() {
    assertEqual(crc16modbus(new Uint8Array([])), 0xFFFF);
  },

  'crc16modbus of [0xA0,0x11,0x04,0x01] is 0x21B1 (little-endian B1 21)'() {
    // Power-on payload. Confirmed bytes from DayBetter firmware: A0 11 04 01 B1 21
    // Little-endian append means low byte 0xB1 first, high byte 0x21 second — so integer value is 0x21B1.
    assertEqual(crc16modbus(new Uint8Array([0xA0, 0x11, 0x04, 0x01])), 0x21B1);
  },

  'crc16modbus of [0xA0,0x11,0x04,0x00] is 0xE170 (little-endian 70 E1)'() {
    assertEqual(crc16modbus(new Uint8Array([0xA0, 0x11, 0x04, 0x00])), 0xE170);
  },

  'crc16modbus of [0xA0,0x13,0x04,0x64] is 0xCAD0 (little-endian D0 CA)'() {
    // Brightness=100 payload. Confirmed: A0 13 04 64 D0 CA.
    assertEqual(crc16modbus(new Uint8Array([0xA0, 0x13, 0x04, 0x64])), 0xCAD0);
  },

  // ===== QC Light Protocol =====
  // Frame: A0 [cmd] [length] [payload] [crc_lo] [crc_hi]
  // length = 3 + payload.length
  // CRC computed over first `length` bytes, appended little-endian.

  'qc.buildPowerOn returns canonical frame'() {
    assertBytes(
      qc.buildPowerOn(),
      new Uint8Array([0xA0, 0x11, 0x04, 0x01, 0xB1, 0x21]),
    );
  },

  'qc.buildPowerOff returns canonical frame'() {
    assertBytes(
      qc.buildPowerOff(),
      new Uint8Array([0xA0, 0x11, 0x04, 0x00, 0x70, 0xE1]),
    );
  },

  'qc.buildSetRgbMode returns canonical frame'() {
    // Payload is [0x01, 0x00] — mode=1 RGB, subparam=0. CRC: B0 F0.
    assertBytes(
      qc.buildSetRgbMode(),
      new Uint8Array([0xA0, 0x12, 0x05, 0x01, 0x00, 0xB0, 0xF0]),
    );
  },

  'qc.buildColor RED returns canonical frame'() {
    // Payload is [R,G,B,W] with W=0xFF. length=7.
    assertBytes(
      qc.buildColor(255, 0, 0),
      new Uint8Array([0xA0, 0x15, 0x07, 0xFF, 0x00, 0x00, 0xFF, 0x7C, 0x5B]),
    );
  },

  'qc.buildColor GREEN'() {
    assertBytes(
      qc.buildColor(0, 255, 0),
      new Uint8Array([0xA0, 0x15, 0x07, 0x00, 0xFF, 0x00, 0xFF, 0x7C, 0x7F]),
    );
  },

  'qc.buildColor BLUE'() {
    assertBytes(
      qc.buildColor(0, 0, 255),
      new Uint8Array([0xA0, 0x15, 0x07, 0x00, 0x00, 0xFF, 0xFF, 0x0D, 0xBF]),
    );
  },

  'qc.buildColor WHITE'() {
    assertBytes(
      qc.buildColor(255, 255, 255),
      new Uint8Array([0xA0, 0x15, 0x07, 0xFF, 0xFF, 0xFF, 0xFF, 0x0D, 0x9B]),
    );
  },

  'qc.buildColor clamps out-of-range'() {
    assertBytes(
      qc.buildColor(300, -10, 256),
      new Uint8Array([0xA0, 0x15, 0x07, 0xFF, 0x00, 0xFF, 0xFF, 0x3D, 0xAB]),
    );
  },

  'qc.buildBrightness 100 → 0x64 with canonical CRC'() {
    assertBytes(
      qc.buildBrightness(100),
      new Uint8Array([0xA0, 0x13, 0x04, 0x64, 0xD0, 0xCA]),
    );
  },

  'qc.buildBrightness 50 → 0x32'() {
    assertBytes(
      qc.buildBrightness(50),
      new Uint8Array([0xA0, 0x13, 0x04, 0x32, 0x50, 0xF4]),
    );
  },

  'qc.buildBrightness 1 → 0x01'() {
    assertBytes(
      qc.buildBrightness(1),
      new Uint8Array([0xA0, 0x13, 0x04, 0x01, 0x10, 0xE1]),
    );
  },

  'qc.buildBrightness clamps out-of-range'() {
    assertBytes(
      qc.buildBrightness(-5),
      new Uint8Array([0xA0, 0x13, 0x04, 0x00, 0xD1, 0x21]),
    );
    assertBytes(
      qc.buildBrightness(250),
      new Uint8Array([0xA0, 0x13, 0x04, 0x64, 0xD0, 0xCA]),
    );
  },
};

export const run = () => runSuite('frames.js', tests);
