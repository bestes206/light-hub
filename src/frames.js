const clampByte = (n) => Math.max(0, Math.min(255, Math.round(n)));
const clampPercent = (n) => Math.max(0, Math.min(100, Math.round(n)));

// ===== ELK-BLEDOM =====
// 9-byte frames starting with 0x7E and ending with 0xEF. No CRC.
// Confirmed on Lotus Lantern hardware 2026-04-12.

export const elk = {
  buildPowerOn() {
    return new Uint8Array([0x7e, 0x00, 0x04, 0xf0, 0x00, 0x01, 0xff, 0x00, 0xef]);
  },

  buildPowerOff() {
    return new Uint8Array([0x7e, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0x00, 0xef]);
  },

  buildColor(r, g, b) {
    return new Uint8Array([
      0x7e, 0x00, 0x05, 0x03,
      clampByte(r), clampByte(g), clampByte(b),
      0x00, 0xef,
    ]);
  },

  buildBrightness(percent) {
    return new Uint8Array([
      0x7e, 0x00, 0x01, clampPercent(percent),
      0x00, 0x00, 0x00, 0x00, 0xef,
    ]);
  },
};

// ===== CRC-16/MODBUS =====
// Polynomial 0xA001 (reflected), initial 0xFFFF, no final XOR.
// Returns a 16-bit integer; caller appends as [crc & 0xFF, crc >> 8].

export function crc16modbus(bytes) {
  let crc = 0xFFFF;
  for (const b of bytes) {
    crc ^= b & 0xFF;
    for (let i = 0; i < 8; i++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xA001;
      } else {
        crc = crc >>> 1;
      }
    }
  }
  return crc & 0xFFFF;
}

// Internal helper: wrap A0-cmd-length-payload with CRC-16/MODBUS appended little-endian.
function qcFrame(cmd, payload) {
  const length = 3 + payload.length;
  const body = [0xA0, cmd, length, ...payload];
  const crc = crc16modbus(new Uint8Array(body));
  return new Uint8Array([...body, crc & 0xFF, (crc >>> 8) & 0xFF]);
}

// ===== QC Light Protocol =====
// Variable-length frames starting with 0xA0, with CRC-16/MODBUS.
// Confirmed on DayBetter "Smart Light" hardware 2026-04-12 via APK decompile.
//
// Command opcodes (from com.th.common.protocol.qc.model.DeviceCommand):
//   0x11 LIGHT_SWITCH
//   0x12 LIGHT_MODE
//   0x13 LIGHT_BRIGHTNESS
//   0x15 LIGHT_COLOR
//   0x20 LIGHT_COLOR_TEMPERATURE
//
// Quirks:
//   - Send `buildSetRgbMode()` once before color writes (firmware requires it).
//   - Color payload is [R, G, B, W]; W = 0xFF on pure-RGB writes.
//   - Minimum 150ms delay between writes (firmware requirement).

export const qc = {
  buildPowerOn() {
    return qcFrame(0x11, [0x01]);
  },

  buildPowerOff() {
    return qcFrame(0x11, [0x00]);
  },

  buildSetRgbMode() {
    // Mode 1 = RGB. Second payload byte is unused / reserved.
    return qcFrame(0x12, [0x01, 0x00]);
  },

  buildColor(r, g, b) {
    return qcFrame(0x15, [clampByte(r), clampByte(g), clampByte(b), 0xFF]);
  },

  buildBrightness(percent) {
    return qcFrame(0x13, [clampPercent(percent)]);
  },
};
