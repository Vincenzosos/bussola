"use strict";
/* Core: formatting, DOM, API, live stream, router, shared components. Every page module uses these.
   Design system v5 ("terminal grid"): the markup each component emits matches web/app.css. Every
   function keeps its old signature; new arguments are optional. New components are listed in
   v4data/CODEBASE.md under "Design system v5 components". */

/* ================================================================ formatting */
const LOCALE = "en-IE";
const fmt = {
  eur: new Intl.NumberFormat(LOCALE, { style: "currency", currency: "EUR" }),
  eur0: new Intl.NumberFormat(LOCALE, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }),
  n0: new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }),
  n1: new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  n2: new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  n4: new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 4 }),
  p0: new Intl.NumberFormat(LOCALE, { style: "percent", maximumFractionDigits: 0 }),
  p1: new Intl.NumberFormat(LOCALE, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  p2: new Intl.NumberFormat(LOCALE, { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};
const MINUS = "−";                                           // U+2212, a true minus everywhere
function sign(x, f) {
  if (x == null || !Number.isFinite(x)) return "—";
  const s = f.format(Math.abs(x));
  if (/^[^1-9]*$/.test(s)) return s;                       // rounds to zero: no sign
  return (x > 0 ? "+" : MINUS) + s;
}
const unsigned = (x, f) => (x == null || !Number.isFinite(x) ? "—" : (x < 0 && /[1-9]/.test(f.format(Math.abs(x))) ? MINUS : "") + f.format(Math.abs(x)));
const tone = (x) => (x > 0.00005 ? "up" : x < -0.00005 ? "down" : "");
const arrow = (x) => (x > 0.00005 ? "▲" : x < -0.00005 ? "▼" : "■");
/* Backend prose arrives with a hyphen-minus before numbers ("-0.4%"): show a true minus. */
const prose = (t) => String(t == null ? "" : t).replace(/(^|[\s(])-(?=[\d€$])/g, `$1${MINUS}`);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (s) => { if (!s) return ""; const [y, m, d] = s.slice(0, 10).split("-"); return `${+d} ${MONTHS[+m - 1]} ${y}`; };
const dayShort = (s) => { const [, m, d] = s.slice(0, 10).split("-"); return `${+d} ${MONTHS[+m - 1]}`; };
const month = (s) => { const [y, m] = s.split("-"); return `${MONTHS[+m - 1]} ${y}`; };
const clock = (epoch) => new Date(epoch * 1000).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
function ago(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)} d ago`;
  return day(iso);
}
const fundSize = (m) => (m >= 1000 ? `€${fmt.n1.format(m / 1000)} bn` : `€${fmt.n0.format(m)} m`);

/* ================================================================ DOM */
const $ = (id) => document.getElementById(id);
/* SVG tags are created in the SVG namespace, so h("svg", …, h("path", …)) draws. */
const SVG_TAGS = new Set(["svg", "path", "g", "line", "rect", "circle", "text", "tspan", "polyline", "polygon", "defs", "clipPath", "linearGradient", "stop"]);
function h(tag, attrs, ...kids) {
  const svg = SVG_TAGS.has(tag);
  const n = svg ? document.createElementNS("http://www.w3.org/2000/svg", tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") { if (svg) n.setAttribute("class", v); else n.className = v; }
    else if (k === "style") n.style.cssText = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}
function flash(el, dir) {
  if (!el || !dir) return;
  el.classList.remove("flash-up", "flash-down");
  void el.offsetWidth;
  el.classList.add(dir > 0 ? "flash-up" : "flash-down");
  clearTimeout(el._f);
  el._f = setTimeout(() => el.classList.remove("flash-up", "flash-down"), 700);
}
function setText(el, text, dir) { if (el && el.textContent !== text) { el.textContent = text; flash(el, dir); } }

/* ================================================================ icons (inline SVG, 24px grid, stroke) */
const ICONS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  pie: "M12 3v9h9A9 9 0 1 1 12 3zM15 3.5A9 9 0 0 1 20.5 9H15z",
  compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21h4",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  menu: "M4 6h16M4 12h16M4 18h16",
  plus: "M12 5v14M5 12h14",
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
  download: "M12 4v12M7 11l5 5 5-5M4 20h16",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  bot: "M12 3v3M7 8h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3zM9 13h.01M15 13h.01M9 17h6",
  max: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01",
  close: "M6 6l12 12M18 6L6 18",
  inbox: "M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5",
};
function icon(name, size = 18) {
  return h("svg", { viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor", "stroke-width": "1.8",
    "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" }, h("path", { d: ICONS[name] || "" }));
}
/* the SV Terminal mark: an "SV" monogram in a square, drawn as paths (no font, no third-party asset); it takes the
   workspace colour. index.html, icon.svg and weekly_card.py LOGO draw the same shape. */
const logoMark = (size = 20) => h("svg", { viewBox: "0 0 24 24", width: size, height: size, fill: "none", "aria-hidden": "true" },
  h("rect", { x: 2.5, y: 2.5, width: 19, height: 19, rx: 1.5, stroke: "currentColor", "stroke-width": 1.8 }),
  h("path", { d: "M10.6 9.2V7.2H6.4v4.8h4.2v4.8H6.4v-2", stroke: "currentColor", "stroke-width": 1.8 }),
  h("path", { d: "M12.8 7.2l2.7 9.6 2.7-9.6", stroke: "currentColor", "stroke-width": 1.8, "stroke-linejoin": "bevel" }));

/* ================================================================ API */
async function api(path, opts) {
  const r = await fetch(path, opts);
  let d = null;
  try { d = await r.json(); } catch (_) { /* empty body */ }
  if (!r.ok || (d && d.error)) throw new Error((d && d.error) || `HTTP ${r.status}`);
  return d;
}
const post = (path, body, type = "application/json") =>
  api(path, { method: "POST", headers: { "Content-Type": type }, body: type === "application/json" ? JSON.stringify(body || {}) : body });
const tokens = {};
function guard(name) { const t = (tokens[name] = (tokens[name] || 0) + 1); return () => tokens[name] === t; }
const memo = {};
function cached(key, fn, ms = 60_000) {
  const m = memo[key];
  if (m && Date.now() - m.at < ms) return m.p;
  const p = fn().catch((e) => { delete memo[key]; throw e; });
  memo[key] = { at: Date.now(), p };
  return p;
}
const invalidate = (...keys) => keys.forEach((k) => delete memo[k]);

/* ================================================================ live stream */
const Live = {
  quotes: {}, wants: {}, listeners: new Set(), status: { mode: "connecting" }, es: null, _t: null, _keys: null, lastTick: null,
  want(owner, isins) {
    this.wants[owner] = new Set((isins || []).filter(Boolean));
    clearTimeout(this._t);
    this._t = setTimeout(() => this.connect(), 200);
  },
  keys() { const s = new Set(); Object.values(this.wants).forEach((w) => w.forEach((k) => s.add(k))); return [...s].sort(); },
  connect() {
    if (new URLSearchParams(location.search).has("snapshot")) return;       // static render for screenshots: no stream
    const keys = this.keys().join(",");
    if (this.es && this._keys === keys && this.es.readyState !== 2) return;
    this._keys = keys;
    if (this.es) this.es.close();
    this.es = new EventSource(`/api/stream?markets=1&isins=${encodeURIComponent(keys)}`);
    this.es.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.type === "status") { this.status = d; renderLive(); return; }
      if (d.type !== "quote") return;
      const prev = this.quotes[d.key];
      this.quotes[d.key] = d;
      this.lastTick = d.at;
      renderLive();
      this.listeners.forEach((fn) => { try { fn(d.key, d, prev); } catch (err) { console.error(err); } });
    };
    this.es.onerror = () => { this.status = { mode: "down" }; renderLive(); };
  },
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  price(key, fallback) { return this.quotes[key] ? this.quotes[key].mid : fallback; },
  dir(q, prev) { return prev ? Math.sign(q.mid - prev.mid) : 0; },
};
/* Connection state, in the top bar (#live) and the status bar (#sb-conn): a glyph and a word, never colour alone. */
function renderLive() {
  const el = $("live");
  if (!el) return;
  const s = Live.status || {}, label = el.querySelector("span");
  const st = s.mode === "stream" ? "on" : s.mode === "poll" ? "slow" : s.mode === "down" ? "off" : "";
  const tick = Live.lastTick ? clock(Live.lastTick) : "";
  el.classList.remove("on", "slow", "off");
  if (st) el.classList.add(st);
  label.textContent = s.mode === "stream" ? "LIVE" : s.mode === "poll" ? "EVERY MINUTE" : s.mode === "down" ? "OFFLINE" : "CONNECTING";
  el.title = (s.mode === "stream" ? "Streaming quotes from Lang & Schwarz" : s.mode === "poll" ? "Streaming unavailable: refreshing every minute" : (s.error || "Connecting to Lang & Schwarz"))
    + (tick ? `. Last quote ${tick}` : "");
  const sb = $("sb-conn");
  if (sb) {
    sb.className = `conn hide-sm ${st || "idle"}`;
    sb.textContent = s.mode === "stream" ? `● LIVE${tick ? ` ${tick}` : ""}` : s.mode === "poll" ? `◐ EVERY MINUTE${tick ? ` ${tick}` : ""}` : s.mode === "down" ? "○ OFFLINE" : "○ CONNECTING";
    sb.title = el.title;
  }
}

/* ================================================================ router */
const Pages = {};           // id -> {title, render(el, sub, params), onQuote?(key, q, prev), leave?()}
const APP_NAME = "SV Terminal";
const MODES = {
  invest: { label: "My Portfolio", sub: "real money · buy and hold", kicker: "My Portfolio", home: "home", ws: "real" },
  trade: { label: "Trading Lab", sub: "paper money only", kicker: "Trading Lab · paper", home: "lab", ws: "paper" },
};
/* key = the function key (F1–F4, F9; Alt+digit also works), code = the command-line code (main.js CODES has the rest) */
const NAV = [
  { id: "home", label: "Overview", icon: "home", mode: "invest", key: "F1", code: "HOME" },
  { id: "portfolio", label: "Portfolio", icon: "pie", mode: "invest", key: "F2", code: "PF" },
  { id: "explore", label: "Explore", icon: "compass", mode: "invest", key: "F3", code: "EXPL" },
  { id: "lab", label: "Trading Lab", icon: "bot", mode: "trade", key: "F4", code: "LAB" },
  { id: "alerts", label: "Alerts", icon: "bell", mode: null, key: "F9", code: "ALRT" },
];
const modeOf = (page) => (NAV.find((n) => n.id === page) || {}).mode || null;
let CUR_CODE = "HOME";     // the code of the page on screen (main.js keeps it current): the prompt, toasts
const Router = {
  current: null,
  parse() {
    const raw = location.hash.replace(/^#\/?/, "");
    const [path, query] = raw.split("?");
    const [page, sub] = (path || "home").split("/");
    return { page: Pages[page] ? page : "home", sub: sub || null, params: new URLSearchParams(query || "") };
  },
  go(page, sub, params) {
    const q = params ? `?${new URLSearchParams(params)}` : "";
    const target = `#/${page}${sub ? `/${sub}` : ""}${q}`;
    if (location.hash === target) this.render(); else location.hash = target;
  },
  async render() {
    const { page, sub, params } = this.parse();
    if (this.current && Pages[this.current] && Pages[this.current].leave) Pages[this.current].leave();
    Live.want("page", []);
    this.current = page;
    if (typeof syncNav === "function") syncNav(page);
    const el = $("page");
    el.replaceChildren();
    document.title = `${Pages[page].title} · ${APP_NAME}`;
    closeDrawer();                                      // leaving the page: focus has nowhere to go back to
    window.scrollTo(0, 0);
    try { await Pages[page].render(el, sub, params); }
    catch (e) { console.error(e); el.append(card({ title: "This page could not load", body: h("p", { class: "error" }, e.message) })); }
  },
};
Live.on((key, q, prev) => { const p = Pages[Router.current]; if (p && p.onQuote) p.onQuote(key, q, prev); });

/* ---------------------------------------------------------------- page head, sub-tabs, paper banner */
let lastKicker = null;     // subtabs() adds the active sub-tab to the kicker the page head just made
function pageHead(title, lede, ...actions) {
  const nav = NAV.find((n) => n.id === Router.current) || {};
  const mode = modeOf(Router.current);
  const [t, small] = Array.isArray(title) ? title : [title, null];
  /* the page crumb is left out when it repeats the workspace ("Trading Lab · paper ▸ League", not "… ▸ Trading Lab ▸ League") */
  const crumb = nav.label && !(mode && MODES[mode].label === nav.label) ? nav.label : null;
  lastKicker = h("div", { class: "kicker" }, h("span", { class: "ws" }, mode ? MODES[mode].kicker : "Both workspaces"),
    crumb ? [h("span", { class: "sep", "aria-hidden": "true" }, "▸"), h("span", {}, crumb)] : null);
  const acts = actions.flat(Infinity).filter(Boolean);
  return h("div", { class: "page-head" },
    h("div", {}, lastKicker, h("h1", {}, t, small ? h("small", {}, small) : null), lede ? h("p", {}, lede) : null),
    acts.length ? h("div", { class: "actions" }, acts) : null);
}
function paperBanner(text) {
  return h("div", { class: "paper-bar", role: "note" }, h("b", {}, "PAPER"),
    h("span", {}, text || "Pretend money only. Real Lang & Schwarz prices, Trade Republic's €1 fee and the 2026 transaction taxes; nothing here touches your real account."),
    h("span", { class: "end" }, "NO ORDERS · NO CREDENTIALS · NO LINK TO TRADE REPUBLIC"));
}
/* the command-line code of a sub-page (main.js CODES; the first item is the page's default sub): every page's sub-tabs
   lead with it, so the tabs teach the codes (EXPLORE_SPEC §6.1 "EXPL Screener · SWCH Switch…") */
function subCode(page, id, first) {
  if (typeof CODES === "undefined") return null;
  const c = CODES.find((x) => !x.panel && x.route && x.route[0] === page && (x.route[1] === id || (first && x.route[1] == null)));
  return c ? c.code : null;
}
/* items: [id, label] or [id, label, count]; ["|", "tooltip"] draws a thin separator between two groups.
   The active sub-tab also names the browser tab: "League · Trading Lab · SV Terminal". */
function subtabs(page, items, active) {
  const cur = items.find(([id]) => id === active);
  if (cur && lastKicker && !lastKicker.dataset.sub) {
    lastKicker.dataset.sub = active;
    lastKicker.append(h("span", { class: "sep", "aria-hidden": "true" }, "▸"), h("span", {}, cur[1]));
  }
  if (cur && Pages[page]) document.title = `${cur[1]} · ${Pages[page].title} · ${APP_NAME}`;
  return h("nav", { class: "subtabs", "aria-label": "Sections" }, items.map(([id, label, n], i) => {
    if (id === "|") return h("span", { class: "subtab-sep", role: "separator", title: label || null, "aria-label": label || null });
    const code = subCode(page, id, i === 0);
    return h("a", { href: `#/${page}/${id}`, "aria-current": id === active ? "page" : null, title: code ? `${label}: code ${code}` : null },
      code ? h("span", { class: "tabcode", "aria-hidden": "true" }, code) : null, label, n != null ? h("span", { class: "n" }, n) : null);
  }));
}
/* a strip that scrolls sideways (function keys, sub-tabs on a phone): bring its current item into view, centred, and
   fade the edge where more items are hidden (can-l / can-r, app.css) */
function edgeCue(strip) {
  if (!strip) return;
  const cue = () => { strip.classList.toggle("can-l", strip.scrollLeft > 2); strip.classList.toggle("can-r", strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 2); };
  if (!strip._cue) { strip._cue = cue; strip.addEventListener("scroll", cue, { passive: true }); if (window.ResizeObserver) new ResizeObserver(cue).observe(strip); }
  cue();
}
function revealCurrent(strip) {
  if (!strip) return;
  const a = strip.querySelector('a[aria-current="page"]');
  if (a && strip.scrollWidth > strip.clientWidth + 1) {
    const r = a.getBoundingClientRect(), b = strip.getBoundingClientRect();
    strip.scrollLeft += (r.left + r.width / 2) - (b.left + b.width / 2);
  }
  edgeCue(strip);
}

/* ================================================================ components */
/* Panel. n = reading-order number (main.js numbers panels without one), code = short panel code (VAL, HOLD…),
   title = plain English, sub = short context on the title bar (a long sub becomes a lede line under it),
   badges, more (actions at the right of the title bar), tools (a controls row), body, foot (source line),
   span (3–12 inside .grid), flush (no body padding: tables; automatic when the body is one table), cls, id. */
function card({ n, code, title, sub, badges, more, tools, body = [], foot, span, flush, cls = "", id } = {}) {
  /* a bare <table> is wrapped so it scrolls sideways inside the panel instead of being clipped */
  const kids = [].concat(body).flat(Infinity).filter((x) => x != null && x !== false)
    .map((x) => (x instanceof Element && x.tagName === "TABLE" ? h("div", { class: "table-wrap" }, x) : x));
  if (flush == null) flush = kids.length === 1 && kids[0] instanceof Element && /(^|\s)table-(wrap|scroll)(\s|$)/.test(kids[0].className);
  const room = (!span || span >= 12 ? 200 : span >= 8 ? 136 : span >= 7 ? 118 : span >= 6 ? 100 : span >= 5 ? 82 : span >= 4 ? 64 : 48)
    - 10 - (n != null ? 5 : 0) - (typeof title === "string" ? title.length : 16) - (more ? 16 : 0);
  const longSub = typeof sub === "string" && sub.length > room;
  const head = title != null || more || n != null || code ? h("header", { class: "card-h" },
    n != null ? h("span", { class: "card-n", "aria-hidden": "true" }, n) : null,
    code ? h("span", { class: "card-code" }, code) : null,
    title != null ? h("h2", {}, title) : null,
    badges || null,
    sub != null && sub !== "" && !longSub ? h("p", { class: "sub", title: typeof sub === "string" ? sub : null }, sub) : null,
    more ? h("span", { class: "more" }, more) : null) : null;
  return h("section", { class: `card${span ? ` span-${span}` : ""}${cls ? ` ${cls}` : ""}`, id: id || null, "data-n": n != null ? String(n) : null,
    "aria-label": typeof title === "string" ? title : null },
    head,
    longSub ? h("div", { class: "card-tools card-lede" }, h("p", {}, sub)) : null,
    tools ? h("div", { class: "card-tools" }, tools) : null,
    h("div", { class: `card-b${flush ? " flush" : ""}` }, kids),
    foot ? h("footer", { class: "card-f" }, foot) : null);
}
/* the same panel, with the argument names some builders expect */
function panel({ num, n, code, title, actions, more, body, ...rest } = {}) { return card({ n: num ?? n, code, title, more: actions ?? more, body, ...rest }); }
/* tier: "hero" (48px, exactly one per page, top left of the KPI strip), "major" (26px, at most two), "" (18px) */
function stat(label, value, detail, cls = "", tier = "") {
  return h("div", { class: `stat${tier ? ` ${tier}` : ""}` }, h("div", { class: "l" }, label), h("div", { class: `v ${cls}` }, value), detail ? h("div", { class: "d" }, detail) : null);
}
/* the KPI strip under the page head: kpis(stat(..., "hero"), stat(..., "major"), stat(...), ...) */
const kpis = (...cells) => h("section", { class: "stats kpis", "aria-label": "Key numbers" }, cells);
/* items: stat nodes or {label, value, detail, cls, tier} */
const kpiStrip = (items) => kpis(...items.map((x) => (x instanceof Node ? x : stat(x.label, x.value, x.detail, x.cls, x.tier))));
/* a money figure for a KPI value: small € mark; signed when asked */
function eurFig(x, { signed: sg = false, dp = 2 } = {}) {
  if (x == null || !Number.isFinite(x)) return "—";
  const nf = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return [sg ? (x > 0 ? "+" : x < 0 ? MINUS : "") : x < 0 ? MINUS : "", h("span", { class: "cur" }, "€"), nf.format(Math.abs(x))];
}
/* a change line: arrow + signed values, never colour alone. delta(-41.43, -0.0028) → "▼ −€41.43 · −0.28%" */
function delta(eur, pct, { f = fmt.eur, pf = fmt.p2 } = {}) {
  const x = pct != null ? pct : eur;
  return h("span", { class: tone(x) }, `${arrow(x)} `, eur != null ? sign(eur, f) : null, eur != null && pct != null ? " · " : null, pct != null ? sign(pct, pf) : null);
}
const signed = (x, f = fmt.p1, withArrow = false) => h("span", { class: tone(x) }, withArrow ? `${arrow(x)} ` : "", sign(x, f));

/* horizontal bars: items {name, weight (%), eur?, color?, other?}; max = the weight that fills the track */
function bars(items, { max = 100, color = "var(--accent)", eur = true } = {}) {
  return h("div", { class: `bars${eur ? "" : " no-eur"}` }, items.map((x) => h("div", { class: `bar${x.other ? " other" : ""}`,
    "data-tip": `${x.name}: ${fmt.n2.format(x.weight)}%${x.eur != null ? ` · ${fmt.eur.format(x.eur)}` : ""}` },
    h("span", { class: "n", title: x.name }, x.name),
    h("span", { class: "track" }, h("span", { class: "fill", style: `width:${Math.max(0.8, Math.min(100, (x.weight / max) * 100))}%;${x.other ? "" : `--c:${x.color || color}`}` })),
    h("span", { class: "v" }, `${fmt.n1.format(x.weight)}%`),
    eur ? h("span", { class: "e" }, x.eur != null ? fmt.eur0.format(x.eur) : "") : null)));
}
/* diverging bar around zero (up right, down left) */
function dbar(x, max) {
  const w = max ? Math.min(50, (Math.abs(x) / max) * 50) : 0;
  return h("span", { class: "dbar", "aria-hidden": "true" }, h("i", { class: x >= 0 ? "up" : "down", style: `width:calc(${w}% - 1px)` }));
}
/* one stacked bar: parts {name, share (0–1), color} */
function stackBar(parts, { w = 96, label } = {}) {
  const txt = label || parts.map((p) => `${p.name} ${fmt.p0.format(p.share)}`).join(", ");
  return h("span", { class: "stack", style: `width:${typeof w === "number" ? `${w}px` : w}`, role: "img", "aria-label": txt, "data-tip": txt },
    parts.map((p) => h("i", { style: `flex:${p.share};background:${p.color}` })));
}
/* meter: frac 0–1 (null = n/a, hatched), kind "ok" | "warn" | "bad" | "na", optional target / zero ticks (0–1) */
function progress(frac, { kind = "", target, zero } = {}) {
  return h("div", { class: `progress ${frac == null && !kind ? "na" : kind}`, role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100",
    "aria-valuenow": frac != null ? String(Math.round(frac * 100)) : null },
    frac != null ? h("span", { style: `width:${Math.max(1.5, Math.min(100, frac * 100))}%` }) : null,
    target != null ? h("i", { class: "target", style: `left:calc(${target * 100}% - 1px)` }) : null,
    zero != null ? h("i", { class: "zero", style: `left:${zero * 100}%` }) : null);
}
/* legend items {c: "var(--s1)", label, value?, style: "line" | "dash" | "dot" | "box" | "area"} */
function legend(items) {
  return h("div", { class: "legend" }, items.map((x) => h("span", {}, h("i", { class: `key ${x.style || ""}`, style: `--c:${x.c}` }), x.label, x.value != null ? h("b", {}, x.value) : null)));
}
/* segmented control: items [[id, label]]; the pressed button gets the workspace underline */
function seg(items, active, onpick, label = "View") {
  const el = h("div", { class: "seg", role: "group", "aria-label": label });
  items.forEach(([id, text]) => el.append(h("button", { type: "button", "aria-pressed": String(id === active), onclick: (e) => {
    el.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget)));
    if (onpick) onpick(id);
  } }, text)));
  return el;
}
/* filter chip (wrap several in h("div", {class: "chips"})) */
const chip = (label, count, on, onclick) => h("button", { class: "chip", type: "button", "aria-pressed": String(!!on), onclick }, label, count != null ? h("b", {}, count) : null);
/* arithmetic line by line: rows {op: "−" | "+" | "×" | "=", label, small, value, vcls, cls: "total" | "result" | "gap"} */
function ledger(rows) {
  return h("div", { class: "ledger", role: "table" }, rows.map((r) => (r.cls === "gap" ? h("div", { class: "row gap", "aria-hidden": "true" })
    : h("div", { class: `row ${r.cls || ""}`, role: "row" }, h("span", { class: "op", "aria-hidden": "true" }, r.op || ""),
      h("span", { class: "lb", role: "cell" }, r.label, r.small ? h("small", {}, r.small) : null), h("span", { class: `v ${r.vcls || ""}`, role: "cell" }, r.value)))));
}
/* data table → .table-scroll > .table-wrap > table.table
   cols: {key, label, num, c (centre), sort: "descending" | "ascending" | true, fmt(row), cls(row), lead (phone title cell),
          hideSm, wide, sl (short phone label), w (width), title}
   rows: objects; {__group: "Label", __n: count} makes a category row. rowCls(row, i) → "you" | "sel" | "ref" | "out" …
   onrow(row) makes rows clickable (Enter too); onsort(key) makes sortable heads clickable; stack: true = one card per row on the phone */
function table({ cols, rows, foot, groups, cls = "", rowCls, onrow, onsort, caption, stack = false }) {
  const th = (c) => h("th", { class: `${c.num ? "num" : ""} ${c.c ? "c" : ""} ${c.sort ? "sortable" : ""} ${c.hideSm ? "hide-sm" : ""}`.trim() || null, scope: "col",
    "aria-sort": c.sort === "descending" || c.sort === "ascending" ? c.sort : null, style: c.w ? `width:${c.w}` : null, title: c.title || null,
    onclick: c.sort && onsort ? () => onsort(c.key) : null }, c.label);
  const td = (c, r) => {
    const v = c.fmt ? c.fmt(r) : r[c.key];
    return h("td", { class: `${c.num ? "num" : ""} ${c.c ? "c" : ""} ${c.lead ? "lead" : ""} ${c.wide ? "wide" : ""} ${c.hideSm ? "hide-sm" : ""} ${c.cls ? c.cls(r) || "" : ""} ${v === "" || v == null ? "blank" : ""}`.replace(/\s+/g, " ").trim() || null,
      "data-label": c.sl || (typeof c.label === "string" ? c.label : null) }, v);
  };
  const tbl = h("table", { class: `table${stack ? " stack-sm" : ""}${cls ? ` ${cls}` : ""}` },
    caption ? h("caption", { class: "sr-only" }, caption) : null,
    h("thead", {}, groups ? h("tr", { class: "grp" }, groups.map((g) => h("th", { colspan: g.span, class: `${g.label ? "g" : ""} ${g.cls || ""}`.trim() || null }, g.label || ""))) : null,
      h("tr", {}, cols.map(th))),
    h("tbody", {}, rows.map((r, i) => (r.__group
      ? h("tr", { class: "group" }, h("td", { colspan: cols.length }, r.__group, r.__n != null ? h("span", { class: "n" }, r.__n) : null))
      : h("tr", { class: rowCls ? rowCls(r, i) || null : null, tabindex: onrow ? "0" : null, onclick: onrow ? () => onrow(r) : null,
          onkeydown: onrow ? (e) => { if (e.key === "Enter") onrow(r); } : null }, cols.map((c) => td(c, r)))))),
    foot ? h("tfoot", {}, h("tr", {}, cols.map((c) => { const v = foot[c.key]; return h("td", { class: `${c.num ? "num" : ""} ${c.lead ? "lead" : ""} ${c.hideSm ? "hide-sm" : ""} ${v == null || v === "" ? "blank" : ""}`.replace(/\s+/g, " ").trim() || null, "data-label": c.sl || (typeof c.label === "string" ? c.label : null) }, v ?? ""); }))) : null);
  const wrap = h("div", { class: "table-wrap" }, tbl);
  const box = h("div", { class: "table-scroll" }, wrap, h("span", { class: "shade l", "aria-hidden": "true" }), h("span", { class: "shade r", "aria-hidden": "true" }));
  const cue = () => { box.classList.toggle("can-l", wrap.scrollLeft > 2); box.classList.toggle("can-r", wrap.scrollLeft + wrap.clientWidth < wrap.scrollWidth - 2); };
  wrap.addEventListener("scroll", cue, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(cue).observe(wrap);
  return box;
}
const dataTable = ({ columns, cols, ...rest }) => table({ cols: columns || cols, ...rest });
/* status dot: state "on" | "slow" | "off" | "ok" | "warn" | "bad" | "" with its word */
const statusDot = (state, label) => h("span", { class: `status-dot ${state || ""}`.trim() }, h("i", { "aria-hidden": "true" }), label);

function empty(msg, cta) { return h("div", { class: "empty" }, icon("inbox", 20), h("p", {}, msg), cta || null); }
/* Headlines can arrive twice (a news search and a central bank's own feed): keep the first of each title. */
function dedupeNews(items) {
  const seen = new Set();
  return items.filter((x) => { const k = String(x.title || "").toLowerCase().replace(/\s+/g, " ").trim(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
}
function skeleton(hgt = 120) { return h("div", { class: "skeleton", style: `height:${hgt}px` }); }
/* cls: up, down, accent / you / owned, held, live, paper, mock (= example), real, shadow, bench / ref, excluded, ok, warn, bad, na */
function badge(text, cls = "") { return h("span", { class: `badge${cls ? ` ${cls}` : ""}` }, text); }
function money(x, f = fmt.eur) { return h("span", { class: tone(x) }, sign(x, f)); }
function pctEl(x, f = fmt.p1) { return h("span", { class: tone(x) }, sign(x, f)); }
function link(text, href) { return h("a", { href }, text); }

/* categorical chart colours, fixed order, never cycled past five. s1 is "you"; categories that are not "you"
   start at s2 (CATS). charts.js adds the Lightweight Charts presets to SERIES (SERIES.you(), SERIES.bench(1) …). */
const SERIES = ["--s1", "--s2", "--s3", "--s4", "--s5"];
const CATS = ["--s2", "--s3", "--s4", "--s5", "--s6"];
function donut(segments, { label, sub } = {}) {
  const col = (s, i) => s.color || `var(${CATS[i % CATS.length]})`;
  const anyEur = segments.some((s) => s.eur != null);
  const total = segments.reduce((a, s) => a + s.weight, 0) || 1;
  const R = 46, r = 32, gap = segments.length > 1 ? 0.035 : 0;
  let a0 = -Math.PI / 2;
  const P = (rad, ang) => `${(50 + rad * Math.cos(ang)).toFixed(3)},${(50 + rad * Math.sin(ang)).toFixed(3)}`;
  const arcs = segments.map((s, i) => {
    const frac = s.weight / total;
    const tip = `${s.name}: ${fmt.n1.format(s.weight)}%${s.eur != null ? ` · ${fmt.eur0.format(s.eur)}` : ""}`;
    if (frac > 0.9999) return h("path", { d: "M50,4 A46,46 0 1,1 49.99,4 Z M50,18 A32,32 0 1,0 50.01,18 Z", "fill-rule": "evenodd", style: `fill:${col(s, i)}`, "data-tip": tip });
    const a1 = a0 + frac * Math.PI * 2;
    const s0 = a0 + gap / 2, s1 = Math.max(s0 + 0.002, a1 - gap / 2), large = s1 - s0 > Math.PI ? 1 : 0;
    a0 = a1;
    return h("path", { d: `M${P(R, s0)} A${R},${R} 0 ${large},1 ${P(R, s1)} L${P(r, s1)} A${r},${r} 0 ${large},0 ${P(r, s0)} Z`, style: `fill:${col(s, i)}`, "data-tip": tip });
  });
  return h("div", { class: "donut-wrap" },
    h("svg", { viewBox: "0 0 100 100", role: "img", "aria-label": segments.map((s) => `${s.name} ${fmt.n1.format(s.weight)}%`).join(", ") }, arcs,
      label ? h("text", { x: 50, y: sub ? 51 : 55, "text-anchor": "middle", class: "ctr-v" }, label) : null,
      sub ? h("text", { x: 50, y: 63, "text-anchor": "middle", class: "ctr-l" }, sub) : null),
    h("div", { class: "donut-legend" }, segments.map((s, i) => h("div", {}, h("i", { class: "key box", style: `--c:${col(s, i)}` }), h("span", { class: "n" }, s.name),
      h("span", { class: "v" }, `${fmt.n1.format(s.weight)}%`), anyEur ? h("span", { class: "e" }, s.eur != null ? fmt.eur0.format(s.eur) : "") : null))));
}
function fold(items, n = 5, otherName = "Other") {
  const sorted = [...items].sort((a, b) => b.weight - a.weight);
  if (sorted.length <= n) return sorted;
  const rest = sorted.slice(n - 1);
  const eur = rest.some((x) => x.eur != null) ? rest.reduce((a, x) => a + (x.eur || 0), 0) : undefined;   // no € shown when none was given
  return [...sorted.slice(0, n - 1), { name: otherName, weight: rest.reduce((a, x) => a + x.weight, 0), eur, color: "var(--other)", other: true }];
}
/* sparkline with an end dot. colour: you var(--s1), the picked one var(--s2), others var(--bench-1); default by direction */
function sparkSVG(values, { w = 96, hgt = 30, color } = {}) {
  const svg = h("svg", { viewBox: `0 0 ${w} ${hgt}`, class: "spark", "aria-hidden": "true", width: w, height: hgt });
  const v = (values || []).filter(Number.isFinite);
  if (v.length < 2) return svg;
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const pts = v.map((y, i) => `${((i / (v.length - 1)) * (w - 4) + 1).toFixed(1)},${(hgt - 2 - ((y - lo) / span) * (hgt - 4)).toFixed(1)}`);
  const c = color || (v[v.length - 1] >= v[0] ? "var(--up)" : "var(--down)");
  const [lx, ly] = pts[pts.length - 1].split(",");
  svg.append(h("polyline", { points: pts.join(" "), fill: "none", style: `stroke:${c};stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round` }),
    h("circle", { cx: lx, cy: ly, r: 1.8, style: `fill:${c}` }));
  return svg;
}
function rangeBar(value, lo, hi, loLabel, hiLabel) {
  lo = Math.min(lo, value, -0.05); hi = Math.max(hi, value, 0.05);
  const P = (x) => Math.max(0, Math.min(100, ((x - lo) / (hi - lo)) * 100));
  const z = P(0), v = P(value);
  return [h("div", { class: "range-bar", role: "img", "aria-label": `${sign(value, fmt.p1)} on a scale from ${loLabel} to ${hiLabel}` },
    h("div", { class: "fill", style: `left:${Math.min(z, v)}%;width:${Math.abs(v - z)}%;background:${value >= 0 ? "var(--up)" : "var(--down)"}` }),
    h("div", { class: "zero", style: `left:${z}%` })), h("div", { class: "range-labels" }, h("span", {}, loLabel), h("span", {}, hiLabel))];
}

/* ---------------------------------------------------------------- glossary terms, data-tip */
let GLOSSARY = {};
function term(word, key) { return h("span", { class: "term", tabindex: "0", "data-term": key || word }, word); }
function termTip(t, x, y) { if (GLOSSARY[t.dataset.term]) showTip(x, y, [h("div", { class: "tip-h" }, t.dataset.term), h("div", {}, GLOSSARY[t.dataset.term])]); }
document.addEventListener("pointerover", (e) => {
  if (!e.target.closest) return;
  const t = e.target.closest(".term");
  if (t) { termTip(t, e.clientX, e.clientY); return; }
  const d = e.target.closest("[data-tip]");                 // any element with data-tip="…" shows it on hover
  if (d && d.dataset.tip) showTip(e.clientX, e.clientY, d.dataset.tip);
});
document.addEventListener("pointerout", (e) => { if (e.target.closest && e.target.closest(".term, [data-tip]")) hideTip(); });
document.addEventListener("focusin", (e) => { const t = e.target.closest && e.target.closest(".term"); if (t) { const r = t.getBoundingClientRect(); termTip(t, r.left, r.top); } });
document.addEventListener("focusout", (e) => { if (e.target.closest && e.target.closest(".term")) hideTip(); });

/* ---------------------------------------------------------------- tooltip, toast, drawer, status bar */
function showTip(x, y, nodes) {
  const t = $("tip");
  t.replaceChildren(...[].concat(nodes));
  t.hidden = false;
  const w = t.offsetWidth, hh = t.offsetHeight;
  t.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, x + 14))}px`;
  t.style.top = `${y - hh - 12 < 8 ? y + 18 : y - hh - 12}px`;
}
const hideTip = () => { const t = $("tip"); if (t) t.hidden = true; };
/* toast(msg) or toast(code, msg): the code (default: this page's) leads in the workspace colour */
function toast(code, msg) {
  if (msg === undefined) { msg = code; code = CUR_CODE; }
  const t = $("toast");
  t.replaceChildren(h("b", {}, code), h("span", {}, msg));
  t.hidden = false;
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.hidden = true; }, 3600);
}
/* ---------------------------------------------------------------- modal layers (drawer, palette)
   While one is open, everything behind it is inert (no Tab stop, no click), Tab cycles inside it, and closing it
   gives focus back to what had it before (the command line, a table row…). The top of the stack is the live one. */
const Modal = { stack: [], lastFocus: null };
const modalBackground = () => [document.querySelector("header.top"), $("page"), document.querySelector("footer.foot"), $("statusbar")];
/* Modal.lastFocus = {el, at}: set by the command line just before it blurs itself to run a code, so a drawer the code
   opens (SWDA, an ISIN) gives focus back to the command line; used only within 3 s */
function modalSync() {
  const top = Modal.stack.length ? Modal.stack[Modal.stack.length - 1].el : null;
  modalBackground().forEach((n) => { if (n) n.inert = !!top; });
  [$("drawer"), $("palette")].forEach((n) => { if (n) n.inert = !!top && n !== top; });
}
function modalOpen(el) {
  if (!Modal.stack.some((m) => m.el === el)) {
    const a = document.activeElement, lf = Modal.lastFocus;  // what had focus; a control in a layer just hidden does not count
    const back = a && a !== document.body && a.isConnected && !a.closest("[hidden]") ? a : lf && Date.now() - lf.at < 3000 ? lf.el : null;
    Modal.stack.push({ el, back });
  }
  modalSync();
}
function modalClose(el, restore = true) {
  const i = Modal.stack.findIndex((m) => m.el === el);
  if (i < 0) return;
  const [m] = Modal.stack.splice(i, 1);
  modalSync();
  const back = m.back;
  if (restore && back && back.isConnected && !back.closest("[inert], [hidden]") && back.getClientRects().length && typeof back.focus === "function") back.focus({ preventScroll: true });
}
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
document.addEventListener("keydown", (e) => {
  if (e.key !== "Tab" || e.defaultPrevented || !Modal.stack.length) return;
  const top = Modal.stack[Modal.stack.length - 1].el;
  const f = [...top.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null || x.getClientRects().length);
  if (!f.length) { e.preventDefault(); return; }
  const a = document.activeElement, first = f[0], last = f[f.length - 1];
  if (!top.contains(a)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
  else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
});

/* openDrawer(nodes) or openDrawer({n, code, title, body}). With nodes, a leading <h2> becomes the title. */
function openDrawer(arg) {
  let o = arg;
  if (Array.isArray(arg) || arg instanceof Node || typeof arg === "string") {
    const nodes = [].concat(arg).flat(Infinity).filter((x) => x != null && x !== false);
    let title = null;
    if (nodes[0] instanceof Element && nodes[0].tagName === "H2") title = nodes.shift().textContent;
    o = { title, body: nodes };
  }
  const { n = "D", code = "", title, body = [] } = o || {};
  $("drawer-n").textContent = n;
  $("drawer-code").textContent = code;
  $("drawer-code").hidden = !code;
  $("drawer-title").textContent = title || "Details";
  $("drawer-body").replaceChildren(...[].concat(body).flat(Infinity).filter((x) => x != null && x !== false));
  modalOpen($("drawer"));
  $("drawer").hidden = false;
  document.body.style.overflow = "hidden";
  $("drawer-close").focus();
}
/* closeDrawer({restore: true}) when the reader dismisses it (Esc, ×, the scrim): focus goes back to what opened it.
   Plain closeDrawer() (a page closing it before it navigates, or an event handler) leaves focus alone. */
function closeDrawer(opt) {
  if ($("drawer").hidden) return;
  $("drawer").hidden = true;
  document.body.style.overflow = "";
  modalClose($("drawer"), !!(opt && opt.restore === true));
}
/* the page's source line in the status bar ("Holdings file 31 Aug 2026 · quotes L&S"); reset on every route */
const SOURCE_DEFAULT = "Quotes: Lang & Schwarz, indicative";
function statusSource(text) { const el = $("sb-src"); if (el) { el.textContent = text || SOURCE_DEFAULT; el.title = text || SOURCE_DEFAULT; } }

/* ---------------------------------------------------------------- instrument search box (used by many pages) */
function instrumentPicker({ placeholder = "Search by name or ISIN, e.g. Rheinmetall", onPick }) {
  const input = h("input", { type: "search", placeholder, "aria-label": placeholder, style: "width:100%" });
  const list = h("ul", { class: "results" });
  let timer;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { list.replaceChildren(); return; }
    timer = setTimeout(async () => {
      try {
        const r = await api(`/api/search?q=${encodeURIComponent(q)}`);
        list.replaceChildren(...(r.length ? r.map((x) => h("li", {}, h("button", { type: "button", onclick: () => { list.replaceChildren(); input.value = ""; onPick(x); } },
          h("span", {}, x.name), h("small", {}, `${x.type} · ${x.isin}`)))) : [h("li", { class: "muted small" }, "Nothing found.")]));
      } catch (e) { list.replaceChildren(h("li", { class: "error" }, e.message)); }
    }, 280);
  });
  return h("div", {}, input, list);
}
