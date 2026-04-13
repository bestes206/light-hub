# light-hub — Design Spec

**Date:** 2026-04-12
**Status:** Brainstorm complete, awaiting plan
**Author:** Bryan (with Claude)

## Problem

Two BLE LED light brands in the household — Lotus Lantern (×2) and DayBetter (×1) — require switching between two separate vendor apps. Apple Shortcuts can't bridge them because neither vendor app exposes Intents. The pain is friction, not capability: every interaction means picking the right app first.

## Goal

A single web-based controller, accessible from both household phones (parent + child), that:
- Lists all three lights on one screen
- Toggles each on/off
- Sets color (any color) and brightness on each
- Requires no Apple Developer fee, no native build, no hub hardware

Out of scope for v1: scenes, effects, scheduling, music sync, sharing across households, multi-user accounts.

## Approach

A vanilla HTML/CSS/JS Progressive Web App hosted on GitHub Pages, accessed inside the **Bluefy** iOS browser (which exposes Web Bluetooth that Safari refuses to support). The app talks directly to the lights over BLE GATT using the ELK-BLEDOM protocol family, which both vendor apps' BLE strips speak.

### Why this works

- All three lights are *expected* to speak the same underlying protocol (ELK-BLEDOM, 9-byte `7E…EF` frames) — confirmed for Lotus Lantern via published reverse-engineering, hypothesized for DayBetter via the `homebridge-daybetter` plugin lineage. One driver covers both brands if validated. Confirmation is part of the validation gate (R3).
- Web Bluetooth in Bluefy gives a webpage native BLE access on iOS without any native app, App Store, or developer account.
- GitHub Pages provides free HTTPS hosting — Web Bluetooth requires HTTPS.
- No backend, no accounts, no cloud — each phone is independent and only talks to local lights.

### Why not alternatives

- **Native iOS app via TestFlight:** $99/yr, 90-day rebuilds, real overhead for a 3-device hobby project
- **Free signing in Xcode:** 7-day expiry per phone — terrible for a kid's phone
- **AltStore sideload:** EU-only marketplaces; classic AltStore needs weekly re-signing
- **Home Assistant + HomeKit bridge:** requires always-on hub hardware, more setup than the pain warrants
- **Apple Shortcuts:** neither vendor app exposes Intents, so it can't reach the lights at all

## Architecture

### Repo layout

```
light-hub/
├── index.html          # shell + DOM containers for both screens
├── src/
│   ├── app.js          # entry: router, screen rendering, top-level state
│   ├── router.js       # hash-based router (#/ ↔ #/light/<localId>)
│   ├── ble.js          # ELK-BLEDOM driver: scan, connect, send commands
│   ├── frames.js       # pure functions: build BLE byte arrays
│   ├── mock-driver.js  # in-memory fake driver for desktop dev without strips
│   ├── store.js        # localStorage wrapper for saved devices
│   ├── color.js        # HSL/RGB conversions, hue-wheel math
│   └── ui.js           # render helpers for tile, detail, color wheel
├── style.css
├── manifest.json       # icon + name for Bluefy bookmark
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
├── probe.html          # validation sandbox (single-page test rig)
├── test.html           # in-browser unit-test runner
├── README.md
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-04-12-light-hub-design.md   # this file
```

No build step, no npm. Native ES modules; `index.html` loads with `<script type="module" src="src/app.js">`. Each module imports peers via relative paths with `.js` extensions.

### Screens

Two screens in a single DOM, hash-routed:

- **List (`#/`)** — header "LIGHTS" + 3 dark tiles, each: glow-circle (color matches current state, dim if off) + name + brightness % + tiny status dot (see state machine below for color mapping)
- **Detail (`#/light/<localId>`)** — back button, light name, large glow preview, hue wheel, brightness slider, on/off toggle, white/warm-white swatches beside the wheel. When not connected: controls greyed out + "Disconnected — tap to retry" banner.

Visual style: dark ambient (deep navy/black background, glowing color circles, minimal chrome). Established in mockup brainstorm.

Back-button guard: if `history.length <= 1` (deep-link entry), the back button navigates to `#/` instead of exiting the app.

### Connection model

Three BLE devices, well under iOS's ~7-connection ceiling. Web Bluetooth connections die when the tab closes, so every fresh session has to re-establish them.

The model is **just-in-time per-tile**, which works regardless of whether `getDevices()` is supported:

1. App launches → tiles render in `unknown` state, controls inert
2. User taps a tile → driver calls `requestDevice` (or `getDevices` if available) → connects → tile becomes interactive
3. Connection persists for the rest of the tab session

This means the common task ("turn on the bedroom light") is always **3 taps**: open Bluefy bookmark → tap tile → tap power. That's parity with the vendor apps for one-light tasks, with the added benefit that all three lights live behind the same icon.

If `getDevices()` works in Bluefy (best case), step 2's picker is bypassed and tap-tile becomes a silent reconnect. Optimization, not requirement.

Power-user shortcut: a "Connect All" button on the list screen prompts the picker for each saved device sequentially — useful when you're settling in for the evening and want all 3 ready.

### BLE driver (`ble.js` + `frames.js`)

**Discovery filter** (combined service UUID + name prefix to maximize hit rate across ELK-family variants):

```js
navigator.bluetooth.requestDevice({
  filters: [
    { services: ['0000fff0-0000-1000-8000-00805f9b34fb'] },
    { services: ['0000ffe0-0000-1000-8000-00805f9b34fb'] },
    { namePrefix: 'ELK-' },
    { namePrefix: 'MELK' },
    { namePrefix: 'LEDBLE' },
    { namePrefix: 'LED-' },
    { namePrefix: 'DAY' },
    { namePrefix: 'DB-' },
  ],
  optionalServices: [
    '0000fff0-0000-1000-8000-00805f9b34fb',
    '0000ffe0-0000-1000-8000-00805f9b34fb',
  ],
})
```

**Service/characteristic resolution:** try `fff0`/`fff3` first, fall back to `ffe0`/`ffe1`. Cache the working pair per device so we don't re-probe next session.

**Write strategy:** at connect time, inspect `characteristic.properties.writeWithoutResponse`. Use `writeValueWithoutResponse` if available (faster, no ACK chatter), else fall back to `writeValue`.

**Command frames** (9 bytes, `7E…EF`) — reference values from `dave-code-ruiz/elkbledom` and `saharki/lotus-lantern-HACS`. Exact bytes are confirmed during the validation gate; if a strip needs variants (e.g., different reserved bytes, different brightness format), they go in `frames.js` as alternate builders.

| Action | Bytes |
|---|---|
| Power on | `7E 00 04 F0 00 01 FF 00 EF` |
| Power off | `7E 00 04 00 00 00 FF 00 EF` |
| Set color (RGB) | `7E 00 05 03 RR GG BB 00 EF` |
| Set brightness | `7E 00 01 BB 00 00 00 00 EF` (BB = 0x00–0x64) |

Built by pure functions in `frames.js` — testable without a browser BLE stack.

**Slider throttling:** color and brightness writes during drag are debounced to 100ms; final value always sent on pointer-up.

**Driver API:**

```js
class ELKBLEDOMDriver {
  async requestDevice()                       // shows system picker
  async getKnownDevices()                     // returns previously-paired (or [] if unsupported)
  async connect(device)                       // resolves service+char, opens GATT
  async setPower(device, on)
  async setColor(device, {r,g,b})
  async setBrightness(device, percent)        // 0-100
  disconnect(device)
  onDisconnect(device, callback)              // wraps gattserverdisconnected
}
```

`mock-driver.js` implements the same interface, used when `?mock=1` is in the URL.

### Data model (`store.js`)

Single localStorage key `light-hub:devices`. Schema versioned in case of future migrations.

```json
{
  "schemaVersion": 1,
  "devices": [
    {
      "localId": "8d4f1c2e-...",                              // crypto.randomUUID(), used in URLs
      "bleId": "<navigator.bluetooth device.id>",             // BLE pairing identifier
      "name": "Living Room",                                  // user-friendly
      "originalName": "ELK-BLEDOM-1234",                      // BLE-advertised, for re-binding
      "service": "0000fff0-0000-1000-8000-00805f9b34fb",
      "writeChar": "0000fff3-0000-1000-8000-00805f9b34fb",
      "lastColor": { "r": 255, "g": 107, "b": 53 },
      "lastBrightness": 80,
      "lastOn": true,
      "addedAt": "2026-04-12T18:00:00Z"
    }
  ]
}
```

**Why two IDs:** `localId` is our internal stable identifier for routing (`#/light/<localId>`) and array lookups. `bleId` is what `navigator.bluetooth` gives us, which may or may not be stable in Bluefy across reloads. Decoupling them means routing/UI never break even if BLE re-pairing changes the underlying `bleId`.

### Identity strategy

When pairing or reconnecting, resolution chain:

1. **Pair with a known device:** match newly-paired Web BT device against saved records by `bleId` first, then by `originalName`. If matched, update `bleId` to the new value.
2. **Confirm ambiguity:** if `originalName` matches but `bleId` differs, show one-time prompt: "Is this 'Living Room'?" (Y/N). Updates the record if confirmed.
3. **No match:** treat as a new device, prompt for a friendly name.

Worst case: one re-confirmation tap per light per id-change. Saved state is never wiped silently.

### Cached state

ELK-BLEDOM does not reliably expose readable state characteristics, so we can't query a strip's current color. The app shows last-known color/brightness from localStorage immediately on launch. If someone uses the vendor app in parallel, the cache is stale until the next user action — acceptable for a household using only this controller.

### Naming flow

After successful first pair, an inline modal prompts "Name this light:" with the BLE name pre-filled. User can rename later via long-press on a tile. Friendly names matter for a kid using the app.

## Connection state machine (per device)

States: `NEW` (paired but never connected), `CONNECTING`, `CONNECTED`, `DISCONNECTED`, `OFFLINE`

Transitions:

| From | Event | To |
|---|---|---|
| NEW / OFFLINE | user taps tile, or auto-connect on launch | CONNECTING |
| CONNECTING | `gatt.connect()` resolves | CONNECTED |
| CONNECTING | timeout (8s) or thrown error | OFFLINE |
| CONNECTED | `gattserverdisconnected` event fires | DISCONNECTED |
| CONNECTED | write fails | DISCONNECTED |
| DISCONNECTED | auto-retry attempt | CONNECTING |
| DISCONNECTED | retry fails | OFFLINE |
| OFFLINE | user taps "retry" | CONNECTING |

UI: status dot per tile (gray=NEW, yellow=CONNECTING/DISCONNECTED, green=CONNECTED, red=OFFLINE). Detail screen greys out controls when not `CONNECTED`.

## Color picker

- Hue wheel via CSS `conic-gradient` background + draggable pin
- Pointer Events API (`pointerdown`/`pointermove`/`pointerup`) handles touch + mouse uniformly
- Pin position computed from polar coordinates: `(angle from center) → hue (0-360)`, then `hue → RGB` via `color.js`
- Brightness slider, 0-100, sent as a separate ELK brightness packet (independent of color)
- Saturation locked at 100% — removes a UI dimension with negligible loss for ambient lighting
- White and warm-white swatches beside the wheel send RGB(255,255,255) and RGB(255,180,100) respectively

White via RGB on RGB-only strips will be cosmetically poor. RGBW W-channel support is a v2 candidate, gated on the validation step confirming strip type.

## Error handling

| Scenario | Behavior |
|---|---|
| `navigator.bluetooth` undefined | Full-screen page: "Open this in Bluefy on iOS or Chrome on desktop." App init halts. |
| No saved devices | Empty list with "Add a light" CTA |
| `requestDevice` rejected | Silent; user dismissed picker |
| Service not found after pair | Try fallback UUID; if both fail, offer to remove with explanation |
| `connect()` hangs | 8s timeout wrapper; mark offline on timeout |
| Write fails mid-session | One silent reconnect (500ms backoff) + one retry; if still failing, mark offline |
| `gattserverdisconnected` event | Mark offline; auto-retry once if user is in detail screen |
| localStorage parse fails | Fall back to empty list, one-time alert |
| `getDevices()` returns empty | Treat as fresh session; tiles render in "tap to connect" state |
| Two phones racing for same light | Second phone gets BLE connection rejection; UI shows "in use, retry" |

## Testing

**Pure-function unit tests** (no browser BLE needed):

- `frames.js`: byte-array assertions for each builder function
- `color.js`: HSL↔RGB and wheel-angle↔hue conversions
- `store.js`: add/rename/remove with a localStorage stub

**Test runner:** single `test.html` that imports modules and runs assertions, output to console. No build step, no npm. Open in desktop Chrome.

**Mock driver for UI dev:** `mock-driver.js` exposes the same interface as `ble.js` but stores per-device state in memory and resolves immediately. UI development uses it via a `?mock=1` query param so the entire app can be exercised without any LED strip in BLE range. Lets the visual layer be built on a flight, then real-device validated when back near the strips.

**Manual integration smoke checklist** (in README):

1. Open in Bluefy → pair light 1 → name it → power on/off → color change → brightness change
2. Same for lights 2 and 3
3. Reload page → verify devices reappear (or graceful re-pair flow)
4. Walk out of BLE range → verify offline state → walk back → verify reconnect
5. Two phones, one light, simultaneous → verify second-phone error message

## Validation gate (mandatory first step before full build)

Ship `probe.html` first — a single-page sandbox that:

1. Filters for known names + service UUIDs
2. Tap "Connect & blink" → user selects light from system picker
3. Sends power-on → 1s delay → sends power-off
4. Reports success/failure on screen + the discovered service & characteristic UUIDs
5. Calls `getDevices()` and reports what comes back

Run on Bluefy with each of the 3 strips. Document discovered values in a `probe-results.md`. Only then proceed to full build. **If R1/R2/R3 (below) fail badly, abort and reconsider the approach.**

## Risks

**Gating (validate before full build):**
- **R1:** Web Bluetooth `requestDevice` works correctly in Bluefy on iOS
- **R2:** `getDevices()` returns previously-paired devices in Bluefy across reloads
- **R3:** Actual DayBetter strip's advertised name + service UUID matches our filter

**High:**
- **R4:** Bluefy is one indie dev; abandonment risk. Mitigation: code runs unchanged in desktop Chrome, so app is degraded but not bricked.

**Medium:**
- **R5:** ELK-BLEDOM protocol variants — actual strips may need fff0/fff3 vs ffe0/ffe1 vs different brightness packet. Driver handles fallback; document any per-device quirks discovered during validation.
- **R6:** White quality on RGB-only strips. Cosmetic; v2 can add RGBW W-byte.
- **R7:** localStorage cleared by Bluefy → user re-pairs all lights. Acceptable cost; data is small.
- **R8:** Two phones controlling same light simultaneously → BLE rejects second; UI handles cleanly.

**Low:**
- **R9:** New iOS update breaks Bluefy
- **R10:** Manifest icon doesn't render right in Bluefy bookmarks

## Distribution & platforms

- One GitHub repo, public. The URL isn't sensitive — even if discovered, BLE is local-radio-only, so no remote control of lights is possible.
- Deployed to `<github-username>.github.io/light-hub` via GitHub Pages (HTTPS, free).
- **Primary platform — iOS via Bluefy:** install Bluefy (free, one-time), open the URL, bookmark inside Bluefy. **Do not** add to home screen — the icon would launch in Safari, where Web Bluetooth is unsupported.
- **Also works unchanged on:** Android Chrome, desktop Chrome/Edge, iPad via Bluefy. No Bluefy needed on non-iOS platforms — they have native Web Bluetooth. Useful for testing and as a backup control surface.

## Privacy

No backend, no analytics, no third-party fonts/CDNs. Everything ships from a single GitHub Pages origin. localStorage is per-origin, so only this URL can read saved devices. Zero data leaves the phone.

## README content (outline)

- What this is + screenshot
- Install Bluefy (App Store link)
- Open the URL, bookmark in Bluefy
- Add a light (per-light pair flow, naming)
- Manage lights (rename, remove)
- Known limitations (Web Bluetooth quirks, RGBW caveat, two-phone contention)
- Troubleshooting (light not in picker, "couldn't connect", how to fully reset)
- Dev notes: localhost dev with `python3 -m http.server 8000` (Web Bluetooth allowed on localhost without HTTPS); to test on phone, push to Pages and reload Bluefy
- Adding a new brand: where to add a new driver module

## Open question for plan stage

Whether to keep the project zero-tooling (`python3 -m http.server` + manual GitHub Pages deploy) or add a tiny `package.json` for `npx serve` and a GitHub Action that auto-deploys on push. Defer to plan; default = zero tooling.

## Non-goals (explicit)

- Scenes / scene editor
- Effects (rainbow, music sync, fade modes)
- Scheduling / automations
- Multi-household sharing
- Cross-phone sync of device state
- iOS native app
- Any backend
- Tuya/WiFi DayBetter device support (BLE-only for v1)
