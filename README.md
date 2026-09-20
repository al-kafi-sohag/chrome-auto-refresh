# Chrome Auto Refresh

A lightweight Chrome extension (Manifest V3) that automatically reloads a tab at a fixed or random interval, with an optional total duration after which it stops on its own.

Built for personal use and loaded as an unpacked extension. It is not published on the Chrome Web Store.

## Features

- Fixed interval (set Min and Max to the same value)
- Random interval: a new random delay between Min and Max on every refresh
- Optional stop timer (stop after N minutes, or run until stopped)
- Per-tab settings that survive page reloads
- Optional on-page countdown badge
- Works with intervals as short as a few seconds
- No data collection and no network requests

## Installation

1. Clone or download this repository:

```bash
   git clone https://github.com/al-kafi-sohag/chrome-auto-refresh
```

2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the project folder.
5. Pin the extension from the puzzle-piece menu.

## Usage

1. Open the tab you want to refresh.
2. Click the extension icon.
3. Set **Min** and **Max** seconds. For example, 20 and 45 gives a random wait between 20 and 45 seconds on each refresh.
4. Optionally set **Stop after (minutes)**. Use 0 to run until you stop it.
5. Click **Start**. Click **Stop** to end it.

## How it works

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension configuration and permissions |
| `popup.html` / `popup.js` | Settings UI |
| `background.js` | Service worker that stores per-tab state |
| `content.js` | Runs in the page, picks the random delay, and reloads the page |

The timer runs in a content script rather than `chrome.alarms`, because alarms cannot fire more often than every 30 seconds.

## Permissions

- `storage`: saves your settings and per-tab state
- `tabs`: identifies the active tab
- `<all_urls>`: lets the content script run on the pages you want to refresh

## Limitations

- Does not work on `chrome://` pages, the Chrome Web Store, or the built-in PDF viewer.
- Chrome's Memory Saver can discard inactive tabs, which stops refreshing. Exempt the tab in Chrome's performance settings.
- Background tabs may have timers delayed by about a second.

## Roadmap

- [ ] Refresh counter
- [ ] Stop or notify when page text changes
- [ ] Saved profiles / presets

## License

MIT. See [LICENSE](LICENSE).