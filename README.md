# Auto Refresh

A Manifest V3 browser extension (Chrome and Firefox) that reloads a tab at a fixed or random interval, with a live on-page counter, refresh limits, and page watching that alerts you when something changes.

## Features

- **Fixed or random intervals**: set Min and Max to the same value for fixed, or different values for a new random wait on every refresh
- **Live on-page badge**: a draggable pill with the refresh count, countdown, progress bar, and pause/stop buttons (rendered in a Shadow DOM, so it never clashes with the page)
- **Toolbar counter**: the extension icon shows the refresh count for the current tab
- **Limits**: stop after N minutes, after N refreshes, or both
- **Page watching**: stop and notify when text appears, when text disappears, or when the page (or a CSS selector) changes
- **Smart pause**: skips a refresh while you are typing in a form field
- **Hard reload**: optional cache bypass
- **Pause / resume**, quick presets, and a keyboard shortcut (`Alt+Shift+R`, changeable in your browser's shortcut settings)
- **Desktop notification** and tab-title flash when a watch matches
- Per-tab settings, dark mode, no data collection, no network requests

## Installation

### Chrome

1. Clone this repository:
```bash
   git clone https://github.com/al-kafi-sohag/chrome-auto-refresh
```
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the project folder.
5. Pin the extension from the puzzle-piece menu.

The compiled `popup.css` is committed, so no build step is needed just to use it.

### Firefox

Firefox uses a separate manifest (`manifest.firefox.json`) staged into `dist-firefox/` at build time. See [Firefox build](#firefox-build) below.

## Development

The popup is styled with [Tailwind CSS](https://tailwindcss.com). Manifest V3 blocks remote scripts, so Tailwind is compiled to a local stylesheet instead of using the CDN.

```bash
npm install
npm run build:css    # one-off build -> popup.css
npm run watch:css    # rebuild on change
```

After editing any file, click the reload icon on the extension card at `chrome://extensions`, then reload the tab you are testing.

### Firefox build

Uses Mozilla's official [`web-ext`](https://github.com/mozilla/web-ext) CLI, installed as a dev dependency.

```bash
npm install
npm install -D web-ext   # one-time

npm run run:firefox      # build CSS, stage dist-firefox/, launch Firefox with the extension loaded
npm run lint:firefox     # run AMO's validation checks locally
npm run build:firefox    # produce the upload-ready zip in web-ext-artifacts/
```

`dist-firefox/` only ever contains the runtime files the extension needs (`manifest.json` copied from `manifest.firefox.json`, `background.js`, `content.js`, `popup.html`, `popup.js`, `popup.css`, `LICENSE`) — never `node_modules`, `.git`, or build tooling. This avoids validation noise on the AMO uploader.

## Usage

1. Open the tab you want to refresh.
2. Click the extension icon (or press `Alt+Shift+R` to start with your last settings).
3. Pick a preset or set **Min** and **Max** seconds.
4. Optionally set **Stop after**, **Max refreshes**, or a **Watch** rule.
5. Click **Start** — it refreshes immediately, then continues at your chosen interval. Use the badge on the page or the popup to pause or stop.

### Watch modes

| Mode | Stops when | Input |
| --- | --- | --- |
| Text appears | the text is visible on the page (case-insensitive) | text |
| Text disappears | the text is no longer on the page | text |
| Content changes | the watched content differs from the first load | optional CSS selector |

Tips:

- For "changes", use a CSS selector such as `#price` so ads and timestamps don't trigger it.
- "Disappears" stops immediately if the text isn't on the page when you start.

## How it works

| File | Purpose |
| --- | --- |
| `manifest.json` | Chrome (MV3) manifest |
| `manifest.firefox.json` | Firefox manifest — adds `background.scripts` fallback and `browser_specific_settings.gecko` |
| `popup.html` / `popup.js` | Settings UI and live stats (Tailwind) |
| `background.js` | Service worker: per-tab state, toolbar badge, notifications, shortcut |
| `content.js` | Runs in the page: timer, page watching, on-page badge |
| `src/input.css`, `tailwind.config.js` | Tailwind source and config; build output is `popup.css` |
| `scripts/prep-firefox.js` | Stages a clean `dist-firefox/` folder for `web-ext` |

The timer runs in the content script rather than `chrome.alarms`, because alarms cannot fire more often than every 30 seconds.

## Permissions

- `storage`: saves your settings and per-tab state
- `notifications`: alerts you when a watch matches
- Content script on all sites: lets the timer and badge run on the pages you choose. Nothing runs until you press Start.

## Limitations

- Does not work on `chrome://`/`about:` pages, extension stores, or the built-in PDF viewer.
- Tabs opened before the extension was installed or updated need one manual reload.
- Chrome's Memory Saver can discard inactive tabs, which stops refreshing. Exempt the tab in Chrome's performance settings.
- Background tabs may have timers delayed by about a second.
- Watching checks the page about one second after load, so content that renders later may be missed.
- Firefox build requires Firefox 140+ (desktop) due to `data_collection_permissions` support.

## Roadmap

- [x] Refresh counter
- [x] Stop or notify when page text changes
- [x] Firefox build
- [ ] Saved profiles / presets
- [ ] Sound alert on match
- [ ] Per-site rules

## License

MIT. See [LICENSE](LICENSE).