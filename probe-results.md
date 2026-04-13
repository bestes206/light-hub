# Probe results

Date: 2026-04-12

## Per-strip findings

### Strips 1 & 2 — Lotus Lantern (both)
- BLE name: `ELK-BLEDOM` and typo variant `ELK-BLEDDM`
- Service UUID: `0000fff0-0000-1000-8000-00805f9b34fb`
- Write characteristic: `0000fff3-0000-1000-8000-00805f9b34fb`
- `writeWithoutResponse` supported: **yes**
- Power on (`7E 00 04 F0 00 01 FF 00 EF`): **works**
- Power off (`7E 00 04 00 00 00 FF 00 EF`): **works**
- Set color RED (`7E 00 05 03 FF 00 00 00 EF`): **works**
- Protocol family: **ELK-BLEDOM** (9-byte `7E…EF` frames)

### Strip 3 — DayBetter ("Smart Light")
- BLE name: `Smart Light`
- Service UUID: `0000ff10-0000-1000-8000-00805f9b34fb`
- Write characteristic: `0000ff12-0000-1000-8000-00805f9b34fb`
- Notify characteristic: `0000ff11-...` (unused by controller)
- Protocol family: **QC Light Protocol** (A0-framed with CRC-16/MODBUS)
- Confirmed working commands:
  - Power ON: `A0 11 04 01 B1 21`
  - Power OFF: `A0 11 04 00 70 E1`
- Full protocol extracted from DayBetter APK `com.th.daybetter` v1.6.6

## Bluefy capability

- HTTP over LAN at `http://<mac-ip>:8000/probe.html`: **not supported** ("oops sorry, we can't perform your request")
- HTTPS via GitHub Pages: **pending** — Pages first build in progress
- `getDevices()` support: **NO** — both Chrome desktop and nRF Connect tests confirm the API is not available. App must use tap-to-connect pattern per session (documented in spec).

## Decision

✅ **Proceed to Task 4**, with the following plan amendments:

1. The driver must support **both protocols**. Implementation plan amended to add:
   - QC Light Protocol frame builders in `frames.js` (alongside existing ELK builders)
   - CRC-16/MODBUS helper
   - Per-device `protocol` field in the store (`"elk"` or `"qc"`)
   - Service-UUID-based protocol detection at connect time
   - Name filter extended to include `namePrefix: 'Smart Light'` and `services: [0000ff10-...]`
   - 150ms inter-write delay for QC devices (required by DayBetter firmware)

2. **Must still validate Bluefy HTTPS works.** After Pages deploys, retest probe.html at `https://bestes206.github.io/light-hub/probe.html` on iOS Bluefy before marking the gate fully closed.

## QC Light Protocol reference (from APK decompile)

### Frame format
```
[0xA0] [cmd] [length] [...payload] [crc_lo] [crc_hi]
```
- `length` = 3 + payload length (total bytes excluding CRC)
- CRC = CRC-16/MODBUS (poly 0xA001, init 0xFFFF, reflected) over first `length` bytes
- Appended little-endian

### Command codes
| Name | Code |
|------|------|
| LIGHT_SWITCH | `0x11` |
| LIGHT_MODE | `0x12` |
| LIGHT_BRIGHTNESS | `0x13` |
| LIGHT_COLOR | `0x15` |
| LIGHT_COLOR_TEMPERATURE | `0x20` |

### Confirmed byte sequences
```
Power ON         A0 11 04 01 B1 21
Power OFF        A0 11 04 00 70 E1
Set RGB mode     A0 12 05 01 00 B0 F0
Set CCT mode     A0 12 05 00 00 B1 60
Color Red        A0 15 07 FF 00 00 FF 7C 5B   (4-byte payload R,G,B,W)
Color Green      A0 15 07 00 FF 00 FF 7C 7F
Color Blue       A0 15 07 00 00 FF FF 0D BF
Color White      A0 15 07 FF FF FF FF 0D 9B
Brightness 100%  A0 13 04 64 D0 CA
Brightness 50%   A0 13 04 32 50 F4
Brightness 1%    A0 13 04 01 10 E1
```

### Quirks
- Before color writes, send `0x12 01 00` (RGB mode). Before CCT writes, `0x12 00 00`.
- RGB payload is 4 bytes: `R, G, B, W`. Use `W=0xFF` on RGB writes.
- Brightness is 1 byte, range 0-100 decimal (0x00-0x64).
- Minimum 150ms delay between writes (firmware requirement).
- Send order for "turn on with color": mode → brightness → color.

### Source references
- `com/th/common/utils/BleDataUtils.java` — frame builder
- `com/th/common/utils/m.java` — CRC-16/MODBUS
- `com/th/common/protocol/qc/model/DeviceCommand.java` — command opcodes
- `com/th/qc/command/CommandUtil.java` — high-level senders
