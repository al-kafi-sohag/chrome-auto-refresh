const $ = (id) => document.getElementById(id);
const set = (id, text) => { $(id).textContent = text; };

const DEFAULTS = {
  min: 30,
  max: 60,
  durationMin: 0,
  maxRefreshes: 0,
  watchMode: "none",
  watchText: "",
  showBadge: true,
  bypassCache: false,
  smartPause: true,
  notify: true,
};

const PILL_BASE = "badge";
const PILL = {
  stopped: "border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  running: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  paused: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  finished: "border-zinc-300 bg-zinc-900 text-zinc-50 dark:border-zinc-300 dark:bg-zinc-100 dark:text-zinc-900",
};
const PILL_TEXT = { stopped: "Stopped", running: "Running", paused: "Paused", finished: "Finished" };

const RESULT_BASE = "mx-4 mt-2.5 rounded-md border px-3 py-2 text-[12px] font-medium";
const RESULT = {
  match: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
  done: "border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
};

let tabId = null;
let state = null;

/* ---------- helpers ---------- */
function fmt(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

function readForm() {
  return {
    min: parseFloat($("min").value),
    max: parseFloat($("max").value),
    durationMin: parseFloat($("duration").value) || 0,
    maxRefreshes: parseInt($("maxRefreshes").value, 10) || 0,
    watchMode: $("watchMode").value,
    watchText: $("watchText").value.trim(),
    showBadge: $("showBadge").checked,
    bypassCache: $("bypassCache").checked,
    smartPause: $("smartPause").checked,
    notify: $("notify").checked,
  };
}

function writeForm(c) {
  $("min").value = c.min;
  $("max").value = c.max;
  $("duration").value = c.durationMin;
  $("maxRefreshes").value = c.maxRefreshes;
  $("watchMode").value = c.watchMode;
  $("watchText").value = c.watchText;
  $("showBadge").checked = !!c.showBadge;
  $("bypassCache").checked = !!c.bypassCache;
  $("smartPause").checked = !!c.smartPause;
  $("notify").checked = !!c.notify;
  updateWatchUi();
}

function cfgFromState(s) {
  return {
    min: s.min,
    max: s.max,
    durationMin: s.durationMin,
    maxRefreshes: s.maxRefreshes,
    watchMode: s.watch.mode,
    watchText: s.watch.text,
    showBadge: s.showBadge,
    bypassCache: s.bypassCache,
    smartPause: s.smartPause,
    notify: s.notify,
  };
}

function updateWatchUi() {
  const mode = $("watchMode").value;
  $("watchText").classList.toggle("hidden", mode === "none");
  $("watchText").placeholder =
    mode === "changes" ? "CSS selector (optional), e.g. #price" : "Text to look for";
}

function validate(c) {
  if (!(c.min > 0) || !(c.max > 0)) return "Enter valid interval times.";
  if ((c.watchMode === "appears" || c.watchMode === "disappears") && !c.watchText) {
    return "Enter the text you want to watch for.";
  }

  return "";
}

function showError(msg) {
  $("error").textContent = msg;
  $("error").classList.toggle("hidden", !msg);
}

/* ---------- rendering ---------- */
function render() {
  const s = state;
  const running = !!s?.running;
  const paused = running && s.paused;
  const finished = !running && s?.finished;

  $("form").disabled = running;
  $("form").classList.toggle("opacity-60", running);

  const key = paused ? "paused" : running ? "running" : finished ? "finished" : "stopped";
  $("pill").className = PILL_BASE + " " + PILL[key];
  $("pill").textContent = PILL_TEXT[key];

  $("toggle").textContent = running ? "Stop" : finished ? "Start again" : "Start";
  $("toggle").className = "flex-1 btn " + (running ? "btn-danger" : "btn-primary");
  $("pause").classList.toggle("hidden", !running);
  $("pause").textContent = paused ? "Resume" : "Pause";

  if (finished) {
    const f = s.finished;
    const n = s.refreshCount;
    $("result").textContent =
      f.reason === "match"
        ? `Match found after ${n} refresh${n === 1 ? "" : "es"}.`
        : f.reason === "count"
        ? `Reached the limit of ${s.maxRefreshes} refreshes.`
        : "Time limit reached.";
    $("result").className = RESULT_BASE + " " + RESULT[f.reason === "match" ? "match" : "done"];
  } else {
    $("result").className = "hidden";
  }

  showError("");
  tick();
}

function tick() {
  const s = state;
  const now = Date.now();

  if (!s) {
    set("statCount", "0");
    set("statNext", "–");
    set("statTime", "–");
    set("statTimeLabel", "Elapsed");
    $("bar").style.width = "0%";
    return;
  }

  set("statCount", s.maxRefreshes > 0 ? `${s.refreshCount}/${s.maxRefreshes}` : String(s.refreshCount));

  const live = s.running && !s.paused && s.nextAt;
  set(
    "statNext",
    s.running && s.paused ? "Paused" : live ? (Math.max(0, s.nextAt - now) / 1000).toFixed(1) + "s" : "–"
  );

  let pct = 0;
  if (live && s.scheduledAt && s.nextAt > s.scheduledAt) {
    pct = Math.min(1, Math.max(0, (now - s.scheduledAt) / (s.nextAt - s.scheduledAt)));
  }

  $("bar").style.width = (pct * 100).toFixed(1) + "%";

  if (s.running && s.endTime) {
    set("statTimeLabel", "Time left");
    set("statTime", fmt(s.endTime - now));
  } else {
    set("statTimeLabel", "Elapsed");
    set("statTime", fmt((s.finished?.at ?? now) - s.startedAt));
  }
}

/* ---------- is the content script alive on this tab? ---------- */
async function checkContent() {
  if (tabId == null) return;
  let ok = true;
  try {
    await chrome.tabs.sendMessage(tabId, { type: "ping" });
  } catch (e) {
    ok = false;
  }

  $("notice").classList.toggle("hidden", ok);
  if (!ok) {
    $("notice").textContent =
      "This tab isn't ready. Reload the page once (it was opened before the extension was installed or updated). chrome:// pages and the Web Store can't be refreshed.";
  }
}

/* ---------- events ---------- */
$("watchMode").addEventListener("change", updateWatchUi);

document.querySelectorAll("[data-min]").forEach((btn) => {
  btn.addEventListener("click", () => {
    $("min").value = btn.dataset.min;
    $("max").value = btn.dataset.max;
  });
});

$("toggle").addEventListener("click", async () => {
  if (tabId == null) return;

  if (state?.running) {
    state = await chrome.runtime.sendMessage({ type: "stop", tabId });
    render();
    return;
  }

  const cfg = readForm();
  const err = validate(cfg);
  if (err) return showError(err);
  if (cfg.max < cfg.min) [cfg.min, cfg.max] = [cfg.max, cfg.min];

  await chrome.storage.local.set({ defaults: cfg });
  state = await chrome.runtime.sendMessage({ type: "start", tabId, cfg });
  render();
  setTimeout(checkContent, 400);
});

$("pause").addEventListener("click", async () => {
  state = await chrome.runtime.sendMessage({ type: "togglePause", tabId });
  render();
});

$("changeShortcut").addEventListener("click", () => {
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

// Live updates from the page's content script and the background
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "session" || !changes.tabs) return;
  state = changes.tabs.newValue?.[tabId] ?? null;
  render();
});

/* ---------- init ---------- */
async function load() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id ?? null;

  const { defaults } = await chrome.storage.local.get("defaults");
  writeForm({ ...DEFAULTS, ...defaults });

  if (tabId != null) {
    state = await chrome.runtime.sendMessage({ type: "getState", tabId });
    if (state) writeForm(cfgFromState(state));
  } else {
    $("toggle").disabled = true;
  }

  try {
    const cmds = await chrome.commands.getAll();
    set("shortcut", cmds.find((c) => c.name === "toggle-refresh")?.shortcut || "not set");
  } catch (e) {}

  render();
  checkContent();
  setInterval(tick, 250);
}

load();