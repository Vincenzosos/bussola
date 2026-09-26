"use strict";
/* Start-up and the shell: workspace switch, function keys, command line and palette, keyboard,
   market tape, exchange clocks, status bar, alert badge, panel numbers, router. */

/* ---------------------------------------------------------------- command-line codes
   SV Terminal's own short codes (FINAL_DESIGN.md §5.3); never another product's function codes.
   route: [page, sub] (sub null = the page's default); panel: focus that numbered panel after the page draws.
   Every route is a real sub-page (checked 24 Sep 2026): portfolio summary/hold/xray/perf/risk/cost/impt, explore
   screener/switch/compare/lookup, lab overview/desk/league/ready/rules/journal/costs/learn/practice/data, alerts inbox/rules/settings.
   Unknown subs fall back to the page's default sub-tab; unknown pages fall back to Overview (Router.parse). */
const CODES = [
  { code: "HOME", label: "Overview", hint: "your money today, markets, news", group: "My Portfolio", key: "F1", aliases: ["OV"], route: ["home", null] },
  { code: "PF", label: "Portfolio", hint: "value, holdings, what moved it", group: "My Portfolio", key: "F2", route: ["portfolio", "summary"] },
  { code: "HOLD", label: "Holdings", hint: "what you own, line by line", group: "My Portfolio", route: ["portfolio", "hold"] },
  { code: "LOOK", label: "Look-through", hint: "the companies inside your funds", group: "My Portfolio", aliases: ["XRAY"], route: ["portfolio", "xray"] },
  { code: "PERF", label: "Performance", hint: "you against the benchmarks", group: "My Portfolio", route: ["portfolio", "perf"] },
  { code: "RISK", label: "Risk", hint: "falls from the top, swings, a what-if", group: "My Portfolio", route: ["portfolio", "risk"] },
  { code: "TAX", label: "Costs & tax", hint: "what holding and selling cost", group: "My Portfolio", aliases: ["COST"], route: ["portfolio", "cost"] },
  { code: "MOVE", label: "Today's movers", hint: "what moved your money today", group: "My Portfolio", route: ["portfolio", "summary"], panel: 2 },
  { code: "UPDT", label: "Update holdings", hint: "import the Trade Republic CSV or edit by hand", group: "My Portfolio", route: ["portfolio", "impt"] },
  { code: "EXPL", label: "Explore", hint: "the fund screener", group: "My Portfolio", key: "F3", route: ["explore", "screener"] },
  { code: "SWCH", label: "Switch tracker", hint: "move everything to fund X, after tax", args: "[ticker]", group: "My Portfolio", route: ["explore", "switch"] },
  { code: "CMPR", label: "Compare two funds", hint: "side by side", args: "[a] [b]", group: "My Portfolio", route: ["explore", "compare"] },
  { code: "FIND", label: "Look up", hint: "any share, ETF or ETC by name or ISIN", group: "My Portfolio", route: ["explore", "lookup"] },
  { code: "LAB", label: "Trading Lab", hint: "paper money only: what the lab is, and where its record stands", group: "Trading Lab · paper", key: "F4", route: ["lab", "overview"] },
  { code: "DESK", label: "Desk", hint: "the main book after the last session end, and its next paper orders", group: "Trading Lab · paper", route: ["lab", "desk"] },
  { code: "BOOK", label: "Paper book", hint: "the main book's paper positions and next orders", group: "Trading Lab · paper", route: ["lab", "desk"], panel: 1 },
  { code: "LEAG", label: "League", hint: "every paper strategy, after costs and tax", group: "Trading Lab · paper", route: ["lab", "league"] },
  { code: "RDY", label: "Scorecard", hint: "ten criteria fixed in advance: met, fails, too early", group: "Trading Lab · paper", route: ["lab", "ready"] },
  { code: "READ", label: "Method", hint: "how the lab works: rules, costs and the research it rests on", group: "Trading Lab · paper", route: ["lab", "rules"] },
  { code: "SRCS", label: "Reading list", hint: "the evidence behind the lab's rules (Method, panel 9)", group: "Trading Lab · paper", route: ["lab", "rules"], panel: 9 },
  { code: "JRNL", label: "Journal", hint: "what happened, session by session", group: "Trading Lab · paper", route: ["lab", "journal"] },
  { code: "FEES", label: "Lab costs", hint: "fees, spreads and transaction tax on the paper trades", group: "Trading Lab · paper", route: ["lab", "costs"] },
  { code: "CURV", label: "Model", hint: "what the learners picked up, on forecasts made before the result", group: "Trading Lab · paper", route: ["lab", "learn"] },
  { code: "PRAC", label: "Robustness", hint: "drills, and how fragile the results are", group: "Trading Lab · paper", route: ["lab", "practice"] },
  { code: "DATA", label: "Data quality", hint: "recordings, closes, requests to L&S, flags", group: "Trading Lab · paper", route: ["lab", "data"] },
  { code: "ALRT", label: "Alerts", hint: "the daily briefing inbox", group: "Both workspaces", key: "F9", route: ["alerts", null] },
  { code: "RULE", label: "Alert rules", hint: "your rules and ready-made ones", group: "Both workspaces", route: ["alerts", "rules"] },
  { code: "NTFY", label: "Notification settings", hint: "the briefing's time, Mac and browser notifications", group: "Both workspaces", route: ["alerts", "settings"] },
  { code: "HELP", label: "Keys and codes", hint: "this list", group: "Both workspaces", key: "?" },
];
const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const findCode = (word) => { const w = word.toUpperCase(); return CODES.find((c) => c.code === w || (c.aliases || []).includes(w)); };
/* the code of what is on screen: an exact [page, sub] route first, then the page's own code */
function routeCode(page, sub) {
  const exact = CODES.find((c) => !c.panel && c.route && c.route[0] === page && c.route[1] === (sub || null));
  if (exact) return exact.code;
  const n = NAV.find((x) => x.id === page);
  return n ? n.code : "HOME";
}

/* ---------------------------------------------------------------- funds, for tickers typed on the command line */
let FUNDS = [];
const loadFunds = () => cached("compare", () => api("/api/explore/list"), 600_000).then((d) => { FUNDS = d.funds || []; return FUNDS; }).catch(() => FUNDS);
const fundByTicker = (w) => FUNDS.find((f) => (f.milan_ticker || "").toUpperCase() === w.toUpperCase());
async function isinOf(word) {
  if (!word) return null;
  const w = word.toUpperCase();
  if (ISIN_RE.test(w)) return w;
  if (!FUNDS.length) await loadFunds();
  const f = fundByTicker(w);
  return f ? f.isin : null;
}

/* ---------------------------------------------------------------- navigation: two workspaces, each with its function keys */
const lastIn = { invest: "home", trade: "lab" };
const lastHash = { invest: null, trade: null };     // the full route last seen in each workspace (sub-page and query too)
let navMode = null, pendingPanel = null;
function zoned(tz, d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", weekday: "short", day: "numeric", month: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { wd: p.weekday, hh: +p.hour, mm: +p.minute, hm: `${p.hour}:${p.minute}`, hms: `${p.hour}:${p.minute}:${p.second}`, date: `${p.weekday} ${p.day} ${MONTHS[+p.month - 1]} ${p.year}` };
}
function buildTabs(mode) {
  navMode = mode;
  const key = (n) => h("a", { href: `#/${n.id}`, "data-nav": n.id, title: `${n.label}: ${n.key} or Alt+${n.key.slice(1)} · code ${n.code}` }, h("kbd", {}, n.key), n.label);
  $("tabs").replaceChildren(...NAV.filter((n) => n.mode === mode).map(key), h("span", { class: "sep", "aria-hidden": "true" }), ...NAV.filter((n) => n.mode === null).map(key),
    h("span", { class: "tabs-meta" }, h("span", { id: "tabs-date" }, zoned("Europe/Rome").date.toUpperCase()),
      h("span", { class: "ws-note" }, mode === "trade" ? "PAPER · NO REAL ORDERS" : "READ-ONLY · FACTS, NOT ADVICE")));
  document.querySelectorAll("#mode button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
}
function syncNav(page) {
  const mode = modeOf(page);
  if (mode) { lastIn[mode] = page; lastHash[mode] = location.hash || `#/${page}`; }
  if (mode && mode !== navMode) buildTabs(mode);
  const ws = MODES[mode || navMode || "invest"].ws;
  document.body.dataset.ws = ws;
  /* Alerts belong to both workspaces (the briefing and the rules watch your real holdings; the lab line is paper):
     a neutral tag, not the one of the workspace you came from */
  const tag = $("sb-ws");
  tag.classList.toggle("both", !mode);
  tag.textContent = !mode ? "REAL + PAPER" : ws === "paper" ? "PAPER" : "REAL MONEY";
  tag.title = !mode ? "Alerts cover both workspaces: the briefing and your rules are about your real holdings; the Trading Lab line is paper"
    : ws === "paper" ? "Trading Lab: pretend money only, nothing reaches Trade Republic" : "My Portfolio: your real Trade Republic holdings (read-only)";
  document.querySelectorAll("[data-nav]").forEach((a) => a.setAttribute("aria-current", a.dataset.nav === page ? "page" : "false"));
  revealCurrent($("tabs"));
  CUR_CODE = routeCode(page, Router.parse().sub);
  $("cmd-prompt").textContent = `${CUR_CODE} ›`;
  $("palette-prompt").textContent = `${CUR_CODE} ›`;
  statusSource();
}
/* the workspace switch returns to the exact sub-page last seen there (Explore › Switch tracker, Lab › Costs…) */
function goWorkspace(mode) {
  const target = lastHash[mode];
  if (!target) { Router.go(lastIn[mode] || MODES[mode].home); return; }
  if (location.hash === target) Router.render(); else location.hash = target;
}
function buildNav() {
  $("bell").append(icon("bell", 16));
  $("drawer-close").append(icon("close", 16));
  document.querySelectorAll("#mode button").forEach((b) => b.addEventListener("click", () => goWorkspace(b.dataset.mode)));
  const skip = $("skip-link");                        // "Skip to content": the hash router owns #…, so focus the page by hand
  if (skip) skip.addEventListener("click", (e) => { e.preventDefault(); $("page").focus(); });
  buildTabs("invest");
}
function updateBadge(n) {
  const b = $("badge");
  if (b) { b.hidden = !n; b.textContent = n; }
  $("bell").setAttribute("aria-label", n ? `Alerts, ${n} new` : "Alerts and daily briefing");
}

/* ---------------------------------------------------------------- panel numbers (the reading order) and panel focus
   Panels a page numbers itself (card({n})) are left alone; otherwise every titled top-level panel gets 1, 2, 3… */
function numberPanels() {
  const cards = [...document.querySelectorAll("#page .card")].filter((c) => !c.parentElement.closest(".card"));
  if (!cards.some((c) => c.dataset.n && !c.dataset.auto)) {
    let i = 0;
    cards.forEach((c) => {
      const head = c.querySelector(":scope > .card-h");
      if (!head) return;
      i += 1;
      c.dataset.n = String(i);
      c.dataset.auto = "1";
      let nEl = head.querySelector(":scope > .card-n");
      if (!nEl) { nEl = h("span", { class: "card-n", "aria-hidden": "true" }); head.prepend(nEl); }
      if (nEl.textContent !== String(i)) nEl.textContent = String(i);
    });
  }
  if (pendingPanel && focusPanel(pendingPanel)) pendingPanel = null;
}
function focusPanel(n) {
  const p = document.querySelector(`#page .card[data-n="${n}"]`);
  if (!p) return false;
  document.querySelectorAll(".card.is-focus").forEach((x) => x.classList.remove("is-focus"));
  p.classList.add("is-focus");
  if (!p.hasAttribute("tabindex")) p.setAttribute("tabindex", "-1");
  p.focus({ preventScroll: true });
  p.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  return true;
}
/* runs in the observer's own microtask (not rAF, which a background tab never fires). A new sub-tab strip scrolls its
   current tab into view: on a phone the strip scrolls sideways and the active tab can start off-screen. */
new MutationObserver((muts) => {
  const added = muts.flatMap((m) => [...m.addedNodes]).filter((x) => x.nodeType === 1);
  if (added.some((x) => x.classList.contains("card") || x.querySelector(".card"))) numberPanels();
  const strip = added.map((x) => (x.classList.contains("subtabs") ? x : x.querySelector(".subtabs"))).find(Boolean)
    || muts.map((m) => m.target instanceof Element && m.target.closest(".subtabs")).find(Boolean);   // a count added to a tab later
  if (strip) setTimeout(() => revealCurrent(strip), 0);
}).observe($("page"), { childList: true, subtree: true });
const revealAll = () => { revealCurrent($("tabs")); revealCurrent(document.querySelector("#page .subtabs")); };
if (document.fonts) { document.fonts.ready.then(revealAll); document.fonts.addEventListener("loadingdone", revealAll); }

/* ---------------------------------------------------------------- running a code */
async function execCode(c, args = []) {
  if (c.code === "HELP") { openPalette(""); return; }
  const [page, sub] = c.route;
  let params = null;
  if (c.code === "SWCH" && args[0]) { const isin = await isinOf(args[0]); if (isin) params = { pick: isin }; else toast("SWCH", `No fund with the ticker or ISIN ${args[0].toUpperCase()}.`); }
  if (c.code === "CMPR" && args.length) {
    const isins = (await Promise.all(args.slice(0, 3).map(isinOf))).filter(Boolean);
    if (isins.length && typeof EX !== "undefined") EX.picks = [...new Set(isins)].slice(0, 3);
    else if (!isins.length) toast("CMPR", `No fund with the ticker or ISIN ${args.join(" ").toUpperCase()}.`);
  }
  pendingPanel = c.panel || null;
  Router.go(page, sub, params);
  if (pendingPanel) setTimeout(() => { if (pendingPanel && focusPanel(pendingPanel)) pendingPanel = null; }, 400);
}
/* The command line, in order: an exact code (with or without arguments) → go; a catalogue ticker (SWDA, CSPX…) or an
   ISIN → the instrument card; anything else → the palette, searching for it. */
async function runCommand(raw) {
  const text = (raw || "").trim();
  if (!text) { openPalette(""); return; }
  const parts = text.split(/\s+/), head = parts[0], args = parts.slice(1);
  const c = findCode(head);
  if (c) { execCode(c, args); return; }
  if (parts.length === 1) {
    if (!FUNDS.length) await loadFunds();
    const f = fundByTicker(head);
    if (f) { openInstrument(f.isin, f.short_name); return; }
    if (ISIN_RE.test(head.toUpperCase())) { openInstrument(head.toUpperCase()); return; }
  }
  openPalette(text);
}
/* what Enter will do, shown beside the command line while typing */
function resolveHint(raw) {
  const text = (raw || "").trim(), el = $("cmd-resolve");
  if (!text) { el.replaceChildren(); return; }
  const parts = text.split(/\s+/), c = findCode(parts[0]);
  if (c) { el.className = "resolve"; el.replaceChildren("⏎ ", h("b", {}, c.code), ` ${c.label}${parts[1] && c.args ? ` · ${parts.slice(1).join(" ").toUpperCase()}` : ""}`); return; }
  const f = parts.length === 1 && fundByTicker(parts[0]);
  if (f) { el.className = "resolve"; el.replaceChildren("⏎ ", h("b", {}, f.milan_ticker), " fund card"); return; }
  if (parts.length === 1 && ISIN_RE.test(parts[0].toUpperCase())) { el.className = "resolve"; el.replaceChildren("⏎ ", h("b", {}, "ISIN"), " instrument card"); return; }
  el.className = "resolve miss"; el.textContent = "⏎ search";
}

/* ---------------------------------------------------------------- palette (⌘K / Ctrl K, ?, HELP) */
/* Items with info: true ("Searching…", "Nothing found") are status lines: drawn, never selectable. */
const Palette = { items: [], sel: 0, timer: null };
function openPalette(query = "") {
  if ($("palette").hidden) modalOpen($("palette"));
  $("palette").hidden = false;
  $("palette-q").value = query;
  paletteResults(query.trim());
  $("palette-q").focus();
}
/* closePalette({restore: true}) when the reader dismisses it; plain closePalette() when a result is being opened */
function closePalette(opt) {
  if ($("palette").hidden) return;
  $("palette").hidden = true;
  modalClose($("palette"), !!(opt && opt.restore === true));
}
const palPick = (i) => i >= 0 && Palette.items[i] && !Palette.items[i].info;
function paletteStep(dir) {
  for (let i = Palette.sel + dir; i >= 0 && i < Palette.items.length; i += dir) if (palPick(i)) { Palette.sel = i; break; }
  paletteMark();
}
function paletteRender() {
  const list = $("palette-list");
  let group = null;
  list.replaceChildren(...Palette.items.flatMap((it, i) => {
    const out = [];
    if (it.group !== group) { group = it.group; out.push(h("div", { class: "palette-group", role: "presentation" }, group)); }
    if (it.info) out.push(h("div", { class: "palette-info", role: "status" }, h("span", { class: "code" }, it.code || ""), h("span", {}, it.label, it.hint ? h("small", {}, it.hint) : null)));
    else out.push(h("div", { role: "option", id: `pal-${i}`, "aria-selected": String(i === Palette.sel), onclick: () => { closePalette(); it.go(); }, onmousemove: () => { if (Palette.sel !== i) { Palette.sel = i; paletteMark(); } } },
      h("span", { class: "code" }, it.code || ""), h("span", {}, it.label, it.hint ? h("small", {}, it.hint) : null), it.key ? h("kbd", {}, it.key) : h("span")));
    return out;
  }));
  paletteMark();
}
/* the numbered panels of the page on screen: type 10 (or part of a title) in the palette to reach panels past 9 */
function panelItems(q) {
  const ql = q.toLowerCase(), num = /^#?\d{1,2}$/.test(q) ? q.replace("#", "") : null;
  if (!num && ql.length < 3) return [];
  return [...document.querySelectorAll("#page .card[data-n]")].filter((c) => !c.parentElement.closest(".card")).map((c) => {
    const t = c.querySelector(":scope > .card-h h2"), code = c.querySelector(":scope > .card-h .card-code");
    return { n: c.dataset.n, title: t ? t.textContent.trim() : "", code: code ? code.textContent.trim() : "" };
  }).filter((p) => p.title && (num ? p.n === num : p.title.toLowerCase().includes(ql) || p.code.toLowerCase() === ql))
    .map((p) => ({ group: "Panels on this page", code: p.n, label: p.title, hint: p.code ? `panel ${p.n} · ${p.code}` : `panel ${p.n}`, key: /^\d$/.test(p.n) ? p.n : null, go: () => focusPanel(p.n) }));
}
function paletteMark() {
  $("palette-list").querySelectorAll("[role=option]").forEach((r) => r.setAttribute("aria-selected", String(r.id === `pal-${Palette.sel}`)));
  const cur = $(`pal-${Palette.sel}`);
  $("palette-q").setAttribute("aria-activedescendant", cur ? cur.id : "");
  if (cur) cur.scrollIntoView({ block: "nearest" });
}
const codeItem = (c) => ({ group: c.group, code: c.code, label: c.args ? `${c.label} ${c.args}` : c.label, hint: c.hint, key: c.key, go: () => execCode(c), complete: c.code });
const fundItem = (f) => ({ group: "Funds", code: f.milan_ticker, label: f.short_name.replace(/ \([A-Z]+\)$/, ""), hint: `${f.isin}${f.owned ? " · yours" : ""}`, key: "⏎", go: () => openInstrument(f.isin, f.short_name), complete: f.milan_ticker });
async function paletteResults(q) {
  const ql = q.toLowerCase(), first = q.split(/\s+/)[0] || "";
  if (!FUNDS.length) await loadFunds();
  if ($("palette-q").value.trim() !== q) return;                      // typed on meanwhile
  const codes = !q ? CODES : CODES.filter((c) => c.code.startsWith(first.toUpperCase()) || (c.aliases || []).some((a) => a.startsWith(first.toUpperCase()))
    || c.label.toLowerCase().includes(ql) || (c.hint || "").toLowerCase().includes(ql));
  const funds = (!q ? FUNDS.slice(0, 6) : FUNDS.filter((f) => (f.milan_ticker || "").toLowerCase().startsWith(ql) || f.short_name.toLowerCase().includes(ql) || f.isin.toLowerCase().includes(ql)).slice(0, 8));
  const direct = q && ISIN_RE.test(q.toUpperCase()) && !funds.length ? [{ group: "ISIN", code: "ISIN", label: q.toUpperCase(), hint: "open its instrument card", key: "⏎", go: () => openInstrument(q.toUpperCase()) }] : [];
  Palette.items = [...panelItems(q), ...codes.map(codeItem).map((x) => (q ? { ...x, group: "Codes" } : x)), ...direct, ...funds.map(fundItem)];
  if (q && !Palette.items.length) Palette.items = [{ group: "Search", code: "…", label: `Searching Lang & Schwarz for “${q}”…`, hint: "", info: true }];
  Palette.sel = Palette.items.findIndex((x) => !x.info);
  paletteRender();
  clearTimeout(Palette.timer);
  if (q.length >= 2) Palette.timer = setTimeout(async () => {
    try {
      const r = await api(`/api/search?q=${encodeURIComponent(q)}`);
      if ($("palette-q").value.trim() !== q) return;
      const seen = new Set(FUNDS.map((f) => f.isin));
      const more = r.filter((x) => !seen.has(x.isin)).slice(0, 12).map((x) => ({ group: "Shares, ETFs and ETCs", code: (x.type || "").slice(0, 4).toUpperCase(), label: x.name, hint: x.isin, go: () => openInstrument(x.isin, x.name) }));
      Palette.items = [...Palette.items.filter((x) => x.group !== "Search"), ...more];
      if (!Palette.items.length) Palette.items = [{ group: "Search", code: "—", label: `Nothing found for “${q}”`, hint: "try a name, a ticker or an ISIN", info: true }];
      if (!palPick(Palette.sel)) Palette.sel = Palette.items.findIndex((x) => !x.info);
      paletteRender();
    } catch (e) {                                                        // offline, or L&S asked for a pause
      if ($("palette-q").value.trim() !== q || !Palette.items.some((x) => x.group === "Search")) return;
      Palette.items = [{ group: "Search", code: "—", label: "The share search is not available now", hint: e.message, info: true }];
      Palette.sel = -1;
      paletteRender();
    }
  }, 250);
}
$("palette-q").addEventListener("input", (e) => paletteResults(e.target.value.trim()));
$("palette-q").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); paletteStep(1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); paletteStep(-1); }
  else if (e.key === "Tab") {
    const it = palPick(Palette.sel) ? Palette.items[Palette.sel] : null;
    if (it && it.complete) { e.preventDefault(); $("palette-q").value = `${it.complete} `; paletteResults(it.complete); }
  } else if (e.key === "Enter") {
    e.preventDefault();
    const text = $("palette-q").value.trim(), it = palPick(Palette.sel) ? Palette.items[Palette.sel] : null;
    const c = text && findCode(text.split(/\s+/)[0]);
    if (c && text.includes(" ")) { closePalette(); execCode(c, text.split(/\s+/).slice(1)); }   // a code with arguments: run it as typed
    else if (it) { closePalette(); it.go(); }
    else if (!text) closePalette({ restore: true });
    /* only a status line ("Searching…", "Nothing found"): nothing to open, the palette stays */
  }
});
$("palette").addEventListener("click", (e) => { if (e.target === $("palette")) closePalette({ restore: true }); });

/* ---------------------------------------------------------------- command line */
const cmdIn = $("cmd-in");
$("cmd-k").textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K";
/* the public site answers only the lab's codes (the rest is locked): its hint names those */
const placeCmd = () => { cmdIn.placeholder = window.BussolaStatic ? (innerWidth < 760 ? "Lab code" : "Lab code — e.g. LEAG, RDY, JRNL") : innerWidth < 760 ? "Code or fund" : "Code, fund or ISIN — e.g. TAX, SWCH SWDA"; };
placeCmd();
addEventListener("resize", placeCmd);
cmdIn.addEventListener("input", () => resolveHint(cmdIn.value));
cmdIn.addEventListener("focus", () => { if (!FUNDS.length) loadFunds().then(() => resolveHint(cmdIn.value)); });
cmdIn.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); const v = cmdIn.value; cmdIn.value = ""; resolveHint(""); Modal.lastFocus = { el: cmdIn, at: Date.now() }; cmdIn.blur(); runCommand(v); }
  else if (e.key === "ArrowDown") { e.preventDefault(); const v = cmdIn.value; cmdIn.value = ""; resolveHint(""); openPalette(v); }
  else if (e.key === "Escape") { cmdIn.value = ""; resolveHint(""); cmdIn.blur(); }
  else if (e.key === "Tab" && cmdIn.value.trim() && !cmdIn.value.includes(" ")) {
    const w = cmdIn.value.trim().toUpperCase(), c = CODES.find((x) => x.code.startsWith(w));
    if (c) { e.preventDefault(); cmdIn.value = `${c.code} `; resolveHint(cmdIn.value); }
  }
});
$("cmd-go").addEventListener("click", (e) => { e.preventDefault(); const v = cmdIn.value; cmdIn.value = ""; resolveHint(""); Modal.lastFocus = { el: cmdIn, at: Date.now() }; runCommand(v); });

/* ---------------------------------------------------------------- keyboard
   / command line · ⌘K / Ctrl K palette · ? codes · F1–F4, F9 pages (Alt+1–4, Alt+9 always work; F5, F11, F12 are
   never taken) · 1–9 focus a panel, two digits in quick succession for 10 and up (1 then 0 = panel 10) · Esc closes
   the palette, the drawer and the tooltip, and gives focus back to what opened them */
const PanelKeys = { buf: "", at: 0 };
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); if ($("palette").hidden) openPalette(""); else closePalette({ restore: true }); return; }
  if (e.key === "Escape") {
    if (!$("palette").hidden) closePalette({ restore: true }); else closeDrawer({ restore: true });
    hideTip();
    document.querySelectorAll(".card.is-focus").forEach((x) => x.classList.remove("is-focus"));
    return;
  }
  const fk = (!e.metaKey && !e.ctrlKey && /^F([1-49])$/.exec(e.key)) || (e.altKey && !e.metaKey && !e.ctrlKey && /^Digit([1-49])$/.exec(e.code || ""));
  if (fk) { const n = NAV.find((x) => x.key === `F${fk[1]}`); if (n) { e.preventDefault(); closePalette(); Router.go(n.id); } return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
  if (!$("palette").hidden) return;
  if (e.key === "/") { e.preventDefault(); closeDrawer(); cmdIn.focus(); cmdIn.select(); return; }
  if (e.key === "?") { e.preventDefault(); openPalette(""); return; }
  if (/^[0-9]$/.test(e.key) && $("drawer").hidden) {
    const now = Date.now(), two = PanelKeys.buf && now - PanelKeys.at < 800 ? PanelKeys.buf + e.key : null;
    if (two && document.querySelector(`#page .card[data-n="${two}"]`)) { PanelKeys.buf = ""; focusPanel(two); return; }
    PanelKeys.buf = e.key; PanelKeys.at = now;
    if (e.key !== "0") focusPanel(e.key);
  }
});
$("drawer-close").addEventListener("click", () => closeDrawer({ restore: true }));
$("drawer").addEventListener("click", (e) => { if (e.target === $("drawer")) closeDrawer({ restore: true }); });

/* ---------------------------------------------------------------- theme */
function setTheme(t, remember = false) {
  document.documentElement.dataset.theme = t;
  if (remember) try { localStorage.setItem("bussola-theme", t); } catch (_) { /* private window */ }
  const b = $("theme-toggle");
  b.replaceChildren(icon(t === "dark" ? "sun" : "moon", 16));
  b.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme");
  b.title = b.getAttribute("aria-label");
  retheme();
}
$("theme-toggle").addEventListener("click", () => { setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true); Router.render(); });

/* ---------------------------------------------------------------- clocks: Rome in the top bar; MIL, LDN, NYC in the status bar
   Weekdays and session hours only: exchange holidays are not modelled (each clock's tooltip says so). */
const SESSIONS = { "Europe/Rome": [9 * 60, 17 * 60 + 30], "Europe/London": [8 * 60, 16 * 60 + 30], "America/New_York": [9 * 60 + 30, 16 * 60] };
function tickClocks() {
  const now = new Date();
  const rome = zoned("Europe/Rome", now);
  const ct = $("clock-t");                              // the public site shows the snapshot time there instead (lock.js)
  if (ct && !window.BussolaStatic) ct.textContent = rome.hms;
  document.querySelectorAll(".statusbar .mk").forEach((el) => {
    const z = zoned(el.dataset.tz, now), [o, c] = SESSIONS[el.dataset.tz], t = z.hh * 60 + z.mm;
    const open = z.wd !== "Sat" && z.wd !== "Sun" && t >= o && t < c;
    el.querySelector(".t").textContent = z.hm;
    const st = el.querySelector(".st");
    if (st.dataset.open !== String(open)) { st.dataset.open = String(open); st.className = `st ${open ? "open" : "closed"}`; st.textContent = open ? "● OPEN" : "○ CLOSED"; }
  });
  const d = $("tabs-date");
  if (d && now.getSeconds() === 0) d.textContent = rome.date.toUpperCase();
}

/* ---------------------------------------------------------------- market tape */
const Tape = { items: [] };
const TAPE_NAMES = { dax: "DAX", eurusd: "EUR/USD", gold: "Gold", silver: "Silver", brent: "Brent", wti: "WTI", btc: "Bitcoin", eth: "Ether" };
const tapeDigits = (m, p) => (m.key === "eurusd" ? 4 : p >= 1000 ? 0 : 2);
const tapePrice = (m, p) => `${m.unit === "$" ? "$" : m.unit === "€" ? "€" : ""}${new Intl.NumberFormat(LOCALE, { minimumFractionDigits: tapeDigits(m, p), maximumFractionDigits: tapeDigits(m, p) }).format(p)}`;
async function loadTape() {
  try { Tape.items = (await api("/api/markets")).filter((m) => m.group !== "index-proxy" && m.group !== "rates"); } catch (_) { return; }
  const cell = (m, copy) => {
    const price = Live.price(`m:${m.key}`, m.price), c = price && m.prev_close ? price / m.prev_close - 1 : null;
    return h("span", { "data-t": m.key, title: m.note || m.name, "aria-hidden": copy ? "true" : null },
      h("span", { class: "n" }, TAPE_NAMES[m.key] || m.name.replace(/ \(.*\)$/, "")), h("b", { class: "flashable" }, price ? tapePrice(m, price) : "—"),
      h("span", { class: tone(c) || "flat" }, c == null ? "—" : `${arrow(c)} ${sign(c, fmt.p2)}`));
  };
  $("tape").replaceChildren(...Tape.items.map((m) => cell(m, false)), ...Tape.items.map((m) => cell(m, true)));
}
Live.on((key, q, prev) => {
  if (!key.startsWith("m:")) return;
  const m = Tape.items.find((x) => `m:${x.key}` === key);
  if (!m) return;
  const c = m.prev_close ? q.mid / m.prev_close - 1 : null;
  document.querySelectorAll(`#tape [data-t="${key.slice(2)}"]`).forEach((el) => {
    setText(el.querySelector("b"), tapePrice(m, q.mid), Live.dir(q, prev));
    const s = el.lastChild; s.textContent = c == null ? "—" : `${arrow(c)} ${sign(c, fmt.p2)}`; s.className = tone(c) || "flat";
  });
});

/* ---------------------------------------------------------------- inbox badge + browser notifications */
let lastSeen = null;
async function pollInbox() {
  try {
    const box = await api("/api/inbox");
    updateBadge(box.filter((i) => !i.read).length);
    const newest = box[0] && box[0].id;
    if (lastSeen && newest && newest !== lastSeen && "Notification" in window && Notification.permission === "granted") new Notification(`SV Terminal · ${box[0].title}`, { body: box[0].body, icon: "icon.svg" });
    lastSeen = newest;
  } catch (_) { /* server restarting */ }
}

/* ---------------------------------------------------------------- start */
if (new URLSearchParams(location.search).has("snapshot")) document.body.classList.add("still");   // screenshots: tape held still
buildNav();
setTheme(document.documentElement.dataset.theme || "dark");
api("/api/glossary").then((g) => { GLOSSARY = g; }).catch(() => {});
Live.want("markets", []);
loadTape();
pollInbox();
tickClocks();
renderLive();
setInterval(tickClocks, 1000);
setInterval(pollInbox, 60_000);
setInterval(renderLive, 5_000);
setInterval(() => { if (!document.hidden) loadTape(); }, 5 * 60_000);
window.addEventListener("hashchange", () => Router.render());
Router.render();
setTimeout(loadFunds, 4000);                 // tickers for the command line (the screener's own cached list)
