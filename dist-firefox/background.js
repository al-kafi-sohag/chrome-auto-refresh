const KEY = "tabs"; // { [tabId]: state }

const DEFAULTS = {
  min: 30,
  max: 60,
  durationMin: 0,
  maxRefreshes: 0,
  watchMode: "none", // none | appears | disappears | changes
  watchText: "",
  showBadge: true,
  bypassCache: false,
  smartPause: true,
  notify: true,
};

/* ---------- serialized state access (avoids read/modify/write races) ---------- */
let queue = Promise.resolve();
function withState(fn, write = true) {
  const run = queue.then(async () => {
    const data = (await chrome.storage.session.get(KEY))[KEY] || {};
    const out = await fn(data);
    if (write) await chrome.storage.session.set({ [KEY]: data });
    return out;
  });
  queue = run.catch(() => {});
  return run;
}

const syncTab = (tabId) =>
  chrome.tabs.sendMessage(tabId, { type: "sync" }).catch(() => {});

/* ---------- toolbar icon (drawn at runtime, no image files needed) ---------- */
function drawIcon(size) {
  const c = new OffscreenCanvas(size, size);
  const g = c.getContext("2d");
  g.fillStyle = "#4f46e5";
  g.beginPath();
  g.roundRect(0, 0, size, size, size * 0.24);
  g.fill();

  const cx = size / 2, cy = size / 2, R = size * 0.27;
  const a1 = Math.PI * 1.65;
  g.strokeStyle = "#ffffff";
  g.lineWidth = size * 0.11;
  g.lineCap = "round";
  g.beginPath();
  g.arc(cx, cy, R, Math.PI * 0.15, a1);
  g.stroke();

  const px = cx + R * Math.cos(a1), py = cy + R * Math.sin(a1);
  const tx = -Math.sin(a1), ty = Math.cos(a1);
  const nx = Math.cos(a1), ny = Math.sin(a1);
  const h = size * 0.2, w = size * 0.17;
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.moveTo(px + tx * h, py + ty * h);
  g.lineTo(px + nx * w, py + ny * w);
  g.lineTo(px - nx * w, py - ny * w);
  g.closePath();
  g.fill();
  return c;
}

async function setupIcon() {
  try {
    const imageData = {};
    for (const s of [16, 32, 48, 128]) {
      imageData[s] = drawIcon(s).getContext("2d").getImageData(0, 0, s, s);
    }

    await chrome.action.setIcon({ imageData });
  } catch (e) {
    console.warn("Icon setup failed", e);
  }
}

async function iconDataUrl(size = 128) {
  const blob = await drawIcon(size).convertToBlob({ type: "image/png" });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return "data:image/png;base64," + btoa(bin);
}

setupIcon();

/* ---------- toolbar badge (shows refresh count per tab) ---------- */
const shortNum = (n) =>
  n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n);

async function applyBadge(tabId, st) {
  try {
    if (!st) {
      await chrome.action.setBadgeText({ tabId, text: "" });
      return;
    }

    let text, color;
    if (st.running) {
      text = shortNum(st.refreshCount);
      color = st.paused ? "#d97706" : "#16a34a";
    } else if (st.finished?.reason === "match") {
      text = "!";
      color = "#e11d48";
    } else {
      text = "✓";
      color = "#4f46e5";
    }

    await chrome.action.setBadgeText({ tabId, text });
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
    if (chrome.action.setBadgeTextColor) {
      await chrome.action.setBadgeTextColor({ tabId, color: "#ffffff" });
    }
  } catch (e) {
    /* tab may be gone */
  }
}

/* ---------- start / stop ---------- */
async function startTab(tabId, cfg = {}) {
  const c = { ...DEFAULTS, ...cfg };
  let min = Math.max(1, Number(c.min) || DEFAULTS.min);
  let max = Math.max(1, Number(c.max) || min);
  if (max < min) [min, max] = [max, min];
  const durationMin = Math.max(0, Number(c.durationMin) || 0);
  const now = Date.now();

  const st = {
    running: true,
    paused: false,
    finished: null,
    min,
    max,
    durationMin,
    maxRefreshes: Math.max(0, parseInt(c.maxRefreshes, 10) || 0),
    endTime: durationMin > 0 ? now + durationMin * 60000 : null,
    startedAt: now,
    refreshCount: 0,
    scheduledAt: null,
    nextAt: null,
    willReload: true,
    showBadge: !!c.showBadge,
    bypassCache: !!c.bypassCache,
    smartPause: !!c.smartPause,
    notify: !!c.notify,
    watch: { mode: c.watchMode || "none", text: c.watchText || "", baseline: null },
  };

  await withState((d) => {
    d[tabId] = st;
  });
  applyBadge(tabId, st);
  syncTab(tabId);
  return st;
}

async function stopTab(tabId) {
  await withState((d) => {
    delete d[tabId];
  });
  applyBadge(tabId, null);
  syncTab(tabId);
  return null;
}

/* ---------- notifications ---------- */
async function notifyMatch(tabId, st) {
  try {
    const w = st.watch;
    const what =
      w.mode === "appears" ? `"${w.text}" appeared`
      : w.mode === "disappears" ? `"${w.text}" disappeared`
      : "the watched content changed";
    const n = st.refreshCount;
    chrome.notifications.create(`ar-${tabId}-${Date.now()}`, {
      type: "basic",
      iconUrl: await iconDataUrl(128),
      title: "Auto Refresh: match found",
      message: `${what} after ${n} refresh${n === 1 ? "" : "es"}. Click to jump to the tab.`,
      priority: 2,
    });
  } catch (e) {
    console.warn("Notification failed", e);
  }
}

chrome.notifications.onClicked.addListener(async (id) => {
  const m = /^ar-(\d+)-/.exec(id);
  if (!m) return;
  try {
    const tab = await chrome.tabs.update(Number(m[1]), { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch (e) {}
  chrome.notifications.clear(id);
});

/* ---------- message router ---------- */
async function handle(msg, tabId) {
  if (tabId == null) return null;

  switch (msg.type) {
    case "getState": {
      const st = await withState((d) => d[tabId] || null, false);
      applyBadge(tabId, st);
      return st;
    }

    case "start":
      return startTab(tabId, msg.cfg);

    case "stop":
      return stopTab(tabId);

    case "togglePause": {
      const st = await withState((d) => {
        const s = d[tabId];
        if (s?.running) s.paused = !s.paused;
        return s || null;
      });
      applyBadge(tabId, st);
      syncTab(tabId);
      return st;
    }

    case "schedule":
      await withState((d) => {
        const s = d[tabId];
        if (s?.running) {
          s.scheduledAt = msg.startAt;
          s.nextAt = msg.nextAt;
          s.willReload = msg.willReload;
        }
      });
      return true;

    case "setBaseline":
      await withState((d) => {
        const s = d[tabId];
        if (s?.running) s.watch.baseline = msg.hash;
      });
      return true;

    case "reload": {
      const st = await withState((d) => {
        const s = d[tabId];
        if (s?.running && !s.paused) {
          s.refreshCount += 1;
          s.nextAt = null;
          return s;
        }

        return null;
      });
      if (!st) return false;
      applyBadge(tabId, st);
      await chrome.tabs.reload(tabId, { bypassCache: !!st.bypassCache });
      return true;
    }

    case "finish": {
      const st = await withState((d) => {
        const s = d[tabId];
        if (!s?.running) return null;
        s.running = false;
        s.paused = false;
        s.nextAt = null;
        s.finished = { reason: msg.reason, at: Date.now() };
        return s;
      });
      if (!st) return false;
      applyBadge(tabId, st);
      if (msg.reason === "match" && st.notify) notifyMatch(tabId, st);
      syncTab(tabId);
      return true;
    }
  }

  return null;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = msg.tabId ?? sender.tab?.id;
  handle(msg, tabId).then(sendResponse, (err) => {
    console.error(err);
    sendResponse(null);
  });
  return true; // async response
});

/* ---------- housekeeping ---------- */
chrome.tabs.onRemoved.addListener((tabId) => {
  withState((d) => {
    delete d[tabId];
  });
});

// Chrome can reset the per-tab badge on navigation, so re-apply it
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status !== "complete") return;
  withState((d) => d[tabId] || null, false).then((st) => st && applyBadge(tabId, st));
});

/* ---------- keyboard shortcut ---------- */
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-refresh") return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) return;
  const st = await withState((d) => d[tab.id] || null, false);
  if (st?.running) return stopTab(tab.id);
  const { defaults } = await chrome.storage.local.get("defaults");
  return startTab(tab.id, defaults);
});