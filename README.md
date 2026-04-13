# light-hub

A web-based controller for BLE LED light strips. Runs in [Bluefy](https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055) on iOS or Chrome on desktop / Android. No native app, no Apple Developer account, no hub hardware required.

**Live:** https://bestes206.github.io/light-hub/

Supports two protocol families out of the box:
- **ELK-BLEDOM** (Lotus Lantern, many generic Amazon LED strips — BLE name prefixes `ELK-`, `MELK`, `LEDBLE`, `LED-`)
- **QC Light Protocol** (DayBetter "Smart Light" strips — advertises as `Smart Light`)

## Install (iOS)

1. Install [Bluefy from the App Store](https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055) (free).
2. Open the live URL above in Bluefy.
3. Tap the share icon → Add Bookmark. Open the bookmark next time you want to use it.

**Do not** use "Add to Home Screen" — that opens the app in Safari, which doesn't support Web Bluetooth.

## Install (other platforms)

- **Android Chrome:** open the URL directly. Web Bluetooth is built in.
- **Desktop Chrome / Edge:** open the URL directly. Handy for testing.
- **iPad:** Bluefy works there too.

## Use

- Tap **+ Add a light** → pick your strip from the system Bluetooth picker → give it a friendly name.
- Tap a tile to open the detail screen: color wheel, brightness slider, white swatches, power toggle.
- **Long-press** a tile for Rename / Remove.
- **Connect all** prompts the picker for each saved device in sequence (useful first thing each session).

## Known limitations

- **Web Bluetooth quirks:** iOS Bluefy doesn't expose `getDevices()`, so each session you tap each tile to reconnect (one picker dialog per tile, first time per session).
- **White quality on RGB-only strips:** the W channel of RGBW strips isn't used yet. White via RGB(255,255,255) may look bluish-cool on pure-RGB strips.
- **Two phones, one strip:** BLE allows only one connection per device. The second phone gets "couldn't connect" — disconnect from the first phone first.
- **Local storage clearing:** if Bluefy clears site data, you re-pair all lights (names survive nothing).

## Troubleshooting

**My strip doesn't appear in the picker.**
- Confirm the strip is powered on and within ~10m with no walls
- Make sure no other app is connected (force-quit DayBetter / Lotus Lantern apps on every phone)
- Some strips use unusual BLE names — try `probe.html` with its "Scan ALL BLE devices" button to see what your strip advertises

**"Couldn't connect."** Restart the strip (unplug/replug). If still failing, the strip uses a protocol we don't yet support — run `probe.html` and check the log.

**Color wheel doesn't respond.** Status dot should be green (CONNECTED). If yellow, wait. If red, tap the offline banner to reconnect.

## Dev

```bash
# Local development server
python3 -m http.server 8000
# Visit http://localhost:8000/

# UI dev without strips (mock driver, 2 fake ELK + 1 fake QC device)
# Visit http://localhost:8000/?mock=1

# Run pure-function unit tests
# Visit http://localhost:8000/test.html

# Hardware protocol probe (for adding new brands)
# Visit http://localhost:8000/probe.html
```

**To test on your phone over local network:** find your Mac's IP (`ipconfig getifaddr en0`) and open `http://<mac-ip>:8000/`. Bluefy requires HTTPS for Web Bluetooth — if it refuses, push to GitHub Pages and test there.

## Adding support for a new strip brand

1. Use `probe.html` with the "Scan ALL BLE devices" button to find the strip. Note the BLE name and services. If any service appears writable, try the known families first.
2. If no known protocol works, decompile the vendor's Android APK (`jadx` on the `.apk` file from apkpure.com) and grep for the service UUID or `writeCharacteristic` calls.
3. Add the service UUID + write characteristic to `SERVICE_TABLE` in `src/ble.js`. Add a new protocol tag (e.g. `"tuya"`).
4. Add the frame builders to `src/frames.js` under a new namespace (e.g. `export const tuya = { ... }`) with hardware-confirmed test vectors in `test/frames.test.js`.
5. Update `ELKBLEDOMDriver.setPower / setColor / setBrightness` in `src/ble.js` to branch on the new protocol tag.
6. Open a PR.

## Architecture

See the full spec in `docs/superpowers/specs/2026-04-12-light-hub-design.md` and the implementation plan in `docs/superpowers/plans/2026-04-12-light-hub.md`. The protocol-level reverse-engineering findings are in `probe-results.md`.

## License

MIT (or unlicensed personal project — your call).
