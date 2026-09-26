"use strict";
/* Explore (My Portfolio), EXPLORE_SPEC.md §2–§6: EXPL screener · SWCH switch tracker · CMPR compare · LOOK look up,
   plus the drawer extras for a fund. Facts and arithmetic only: a table is sorted by the column the user picks and
   says so; nothing is labelled or suggested. Numbers come from /api/explore/* and /api/switch* (explore_api.py).
   Globals other files rely on: EX (EX.data.funds[].{isin, short_name}) and exploreData() (the light list). */

const EX = {
  data: null, scr: null, sw: null, hist: null, sel: [], picks: [], timer: null, keys: null, tick: 0,
  st: { f: null, sort: { key: "default", dir: 1 }, cols: null, rank: { cols: "sum", sort: { key: "net", dir: -1 } },
    hist: { mode: "delta", sort: null }, path: { mode: "delta", all: false }, cmpr: { range: "5y" }, recent: [], live: false },
};
const EX_KEY = "bussola.explore.v5";
const EX_TABS = [["screener", "Screener"], ["switch", "Switch tracker"], ["compare", "Compare"], ["lookup", "Look up"]];
const EX_F0 = { q: "", cat: "all", inc: "all", maxTer: 0.0065, minSize: 0, plan: false, lt: false, y5: false, hideHeld: false };
const EX_COLORS = CATS;                 // candidates and picks never take --s1, which is "you"

/* The light catalogue list: the command palette (main.js, same cache key) and Alerts read it. */
async function exploreData() {
  if (!EX.data) EX.data = await cached("compare", () => api("/api/explore/list"), 10 * 60_000);
  return EX.data;
}
exploreData().catch(() => { /* offline: the palette retries later */ });

/* ---------------------------------------------------------------- state kept in this browser only */
function exLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(EX_KEY) || "null");
    if (s && typeof s === "object") {
      EX.st.f = { ...EX_F0, ...(s.f || {}) };
      ["sort", "cols", "rank", "hist", "path", "cmpr", "recent", "live"].forEach((k) => { if (s[k] != null) EX.st[k] = s[k]; });
      if (Array.isArray(s.picks) && !EX.picks.length) EX.picks = s.picks.slice(0, 5);
    }
  } catch (_) { /* private window or blocked storage: defaults */ }
  EX.st.f = EX.st.f || { ...EX_F0 };
  if (!(EX.st.f.maxTer > 0 && EX.st.f.maxTer <= 0.0065)) EX.st.f.maxTer = EX_F0.maxTer;      // a fraction: 0.0065 = 0.65% a year
}
function exSave() {
  try { localStorage.setItem(EX_KEY, JSON.stringify({ ...EX.st, picks: EX.picks })); } catch (_) { /* not saved: fine */ }
}
exLoad();

/* ---------------------------------------------------------------- small formatters */
const exPhone = () => matchMedia("(max-width: 760px)").matches;
const exEur = (x) => unsigned(x, fmt.eur);
const exEurS = (x) => sign(x, fmt.eur);
const exPP = (x) => (x == null || !Number.isFinite(x) ? "—" : sign(x, fmt.n2));
const exBn = (m) => (m == null ? "—" : `€${fmt.n1.format(m / 1000)}bn`);
const exNa = (why, text = "n/a") => h("span", { class: "ex-na", "data-tip": why || "not available" }, text);
const exTone = (x, text) => h("span", { class: tone(x) }, text);
const exWhen = (iso) => (iso ? `${dayShort(iso)} ${iso.slice(11, 16)}` : "—");
const exTime = (epoch) => (epoch ? new Date(epoch * 1000).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }) : "");
const exSkel = () => h("span", { class: "skel ex-skel", "aria-label": "loading" });
const exKey = (c, style = "box") => h("i", { class: `key ${style}`, style: `--c:var(${c})` });
const exCode = (isin) => { const f = ((EX.data && EX.data.funds) || []).find((x) => x.isin === isin); return f ? f.code : isin; };
function exNum(x, f, { signed = false, cls = "" } = {}) {
  if (x == null || !Number.isFinite(x)) return "—";
  return h("span", { class: `${signed ? tone(x) : ""} ${cls}`.trim() || null }, signed ? sign(x, f) : unsigned(x, f));
}
/* a table from core.js table(), then: sticky leading columns, data-isin on rows, and a header that follows the page */
function exTable(opts, { sticky = 2, rows = [], isin = (r) => r.isin } = {}) {
  const box = table(opts);
  const tbl = box.querySelector("table");
  tbl.classList.add("ex-table");
  tbl.querySelectorAll("tr").forEach((tr) => [...tr.children].slice(0, sticky).forEach((c, i) => { c.classList.add("ex-sticky", `ex-s${i}`); }));
  [...tbl.tBodies[0].rows].forEach((tr, i) => { if (rows[i]) { tr.dataset.isin = isin(rows[i]) || ""; tr._row = rows[i]; } });
  exFloatHead(box);
  if (sticky > 1) {
    const place = (tries) => {
      const ths = tbl.tHead && tbl.tHead.rows[tbl.tHead.rows.length - 1] ? [...tbl.tHead.rows[tbl.tHead.rows.length - 1].cells].slice(0, sticky) : [];
      if (!tbl.isConnected || !ths.length || !ths[0].offsetWidth) { if (tries < 40) requestAnimationFrame(() => place(tries + 1)); return; }
      let left = 0;
      ths.forEach((th, i) => { tbl.style.setProperty(`--ex-l${i}`, `${left}px`); left += th.offsetWidth; });
    };
    requestAnimationFrame(() => place(0));
  }
  return box;
}
/* The column heads stay visible while the page scrolls past a long table (the table scrolls sideways in its panel,
   so CSS sticky cannot reach the page: the head is moved with a transform instead). */
function exFloatHead(box) {
  const run = () => {
    if (!box.isConnected) { removeEventListener("scroll", on); return; }
    const head = box.querySelector("thead");
    if (!head) return;
    const top = document.querySelector("header.top");
    const off = top && getComputedStyle(top).position === "sticky" ? Math.max(0, top.getBoundingClientRect().bottom) : 0;
    const r = box.getBoundingClientRect();
    const y = r.top < off && r.bottom - head.offsetHeight - 40 > off ? off - r.top : 0;
    head.style.transform = y ? `translateY(${y}px)` : "";
    head.classList.toggle("ex-float", !!y);
  };
  let raf = 0;
  const on = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; run(); }); };
  addEventListener("scroll", on, { passive: true });
}

/* ================================================================ page */
Pages.explore = {
  title: "Explore",
  async render(el, sub, params) {
    sub = EX_TABS.some(([id]) => id === sub) ? sub : "screener";
    Pages.explore.leave();
    const d = await exploreData().catch(() => ({ funds: [], categories: [] }));
    const tabs = EX_TABS.map(([id, label]) => [id, label, id === "screener" ? d.funds.length || null : id === "switch" && EX.sw && EX.sw.counts ? EX.sw.counts.tracked : id === "compare" && EX.picks.length ? EX.picks.length : null]);
    el.append(pageHead(["Explore", `${d.funds.length} funds · ${(d.categories || []).length} categories`],
      "Facts to compare funds: cost, contents, past prices and taxes. Nothing here is advice."),
    subtabs("explore", tabs, sub));
    /* the switch tracker's count shows on entry, not only after a visit (the tracker's own local answer, no L&S request) */
    const swCount = (v) => { const a = el.querySelector('.subtabs a[href="#/explore/switch"]'); if (a && v && v.counts && v.counts.tracked != null && !a.querySelector(".n")) a.append(h("span", { class: "n" }, v.counts.tracked)); };
    if (!EX.sw && sub !== "switch") cached("ex-switch-count", () => api("/api/switch"), 300_000).then(swCount).catch(() => {});
    const body = h("div", { class: "ex-page", "data-sub": sub });
    el.append(body);
    if (sub === "screener") return exScreener(body, params);
    if (sub === "switch") return exSwitch(body, params).then(() => swCount(EX.sw));
    if (sub === "compare") return exCompare(body, params);
    return exLookup(body);
  },
  onQuote(key, q, prev) {
    document.querySelectorAll(`#page tr[data-isin="${key}"], #page [data-live="${key}"]`).forEach((row) => {
      const lastEl = row.querySelector('[data-f="last"]');
      if (lastEl) setText(lastEl, fmt.eur.format(q.mid), Live.dir(q, prev));
      const dayEl = row.querySelector('[data-f="day"]');
      const pc = row._row ? row._row.prev_close : +row.dataset.prev;
      if (dayEl && pc) { const x = q.mid / pc - 1; dayEl.textContent = sign(x, fmt.p2); dayEl.className = tone(x); }
    });
  },
  leave() {
    clearTimeout(EX.timer);
    EX.timer = null;
    if (EX.keys) { removeEventListener("keydown", EX.keys, true); EX.keys = null; }
  },
};

/* ================================================================ EXPL: the screener (§2, §6.2) */
const SCR_COLS = [
  { key: "row", label: "#", sets: "OSRVA", title: "Position in the current sort, not a rank", fmt: (f) => h("span", { class: "rk" }, f.__pos) },
  { key: "code", label: "Code", sets: "OSRVA", get: (f) => f.code, text: true, fmt: (f) => h("span", { class: "tick" }, f.code) },
  { key: "name", label: "Name", sets: "OSRVA", get: (f) => f.name, text: true, fmt: (f) => h("span", { class: "ex-name", title: f.short_name },
    h("span", { class: "nm" }, f.name), f.owned ? badge("Held", "held") : null, f.wrapper === "ETC" ? badge("ETC") : null, f.income === "DIST" ? badge("Dist") : null) },
  { key: "cat", label: "Cat", sets: "OSA", get: (f) => f.__catIx, fmt: (f) => h("span", { class: "dim", title: f.category }, f.cat_short) },
  { key: "ter", label: "TER", num: true, sets: "OSA", get: (f) => f.ter, title: "Yearly fund cost (total expense ratio)",
    fmt: (f) => (f.ter == null ? "—" : h("span", { "data-tip": `${fmt.eur0.format(f.ter * 10000)} a year on €10,000` }, fmt.p2.format(f.ter))) },
  { key: "aum", label: "AUM", num: true, sets: "OSA", get: (f) => f.fund_size_eur_m, title: "Fund size, € billion",
    fmt: (f) => (f.fund_size_eur_m == null ? exNa("fund size not published") : h("span", { "data-tip": `As of ${day(f.fund_size_as_of)} · issuer's factsheet` }, exBn(f.fund_size_eur_m))) },
  { key: "hold", label: "Hldg", num: true, sets: "SA", get: (f) => f.holdings, title: "Number of holdings",
    fmt: (f) => (f.wrapper === "ETC" ? h("span", { class: "dim" }, "gold") : f.holdings == null ? exNa(f.holdings_na) :
      f.holdings_kind === "companies in the index" ? h("span", { "data-tip": "companies in the index (swap-based fund)" }, `idx ${fmt.n0.format(f.holdings)}`) :
        h("span", { "data-tip": f.holdings_kind || "" }, fmt.n0.format(f.holdings))) },
  { key: "inc", label: "Inc", sets: "SA", get: (f) => f.income, text: true, title: "ACC reinvests, DIST pays out, ETC has no income",
    fmt: (f) => h("span", { "data-tip": f.distribution }, f.income) },
  { key: "dom", label: "Dom", sets: "SA", get: (f) => f.dom, text: true, fmt: (f) => h("span", { "data-tip": f.domicile }, f.dom) },
  { key: "plan", label: "Plan", sets: "OSA", get: (f) => (f.savings_plan === "yes" ? 1 : 0), title: "Savings plan on Trade Republic",
    fmt: (f) => (f.savings_plan === "yes" ? h("span", { "data-tip": `Checked ${day(f.savings_plan_checked)}: ${f.savings_plan_how || ""}` }, "yes")
      : f.savings_plan === "no" ? h("span", { "data-tip": f.savings_plan_how || "" }, "no") : h("span", { class: "muted", "data-tip": f.savings_plan_how || "not verified" }, "not verified")) },
  { key: "tax", label: "Tax", sets: "SA", get: (f) => f.tax_label, text: true, fmt: (f) => h("span", { "data-tip": f.tax_tip || "Italian tax on the gain, withheld by Trade Republic" }, f.tax_label) },
  { key: "last", label: "Last", num: true, sets: "ORA", get: (f) => f.price,
    fmt: (f) => (f.pending ? exSkel() : f.price == null ? exNa("price source unreachable", "—") : h("span", { "data-f": "last", class: "flashable", "data-tip": f.price_time ? `L&S quote at ${exTime(f.price_time)} Rome` : null }, fmt.eur.format(Live.price(f.isin, f.price)))) },
  { key: "day", label: "Day", num: true, sets: "ORA", get: (f) => (f.prev_close ? Live.price(f.isin, f.price) / f.prev_close - 1 : null),
    fmt: (f) => { if (f.pending) return exSkel(); const x = f.prev_close && f.price ? Live.price(f.isin, f.price) / f.prev_close - 1 : null; return h("span", { "data-f": "day", class: tone(x) }, sign(x, fmt.p2)); } },
  { key: "r1", label: "1Y", num: true, sets: "ORA", get: (f) => (f.income === "DIST" ? null : f.metrics && f.metrics.return_1y), fmt: (f) => exRet(f, "return_1y") },
  { key: "r3", label: "3Y /yr", num: true, sets: "RA", get: (f) => (f.income === "DIST" ? null : f.metrics && f.metrics.return_3y_pa), fmt: (f) => exRet(f, "return_3y_pa") },
  { key: "r5", label: "5Y /yr", num: true, sets: "ORA", get: (f) => (f.income === "DIST" ? null : f.metrics && f.metrics.return_5y_pa), fmt: (f) => exRet(f, "return_5y_pa") },
  { key: "vol", label: "Vol", num: true, sets: "RA", get: (f) => f.metrics && f.metrics.volatility_3y, title: "3-year annualised volatility of daily moves",
    fmt: (f) => (f.pending ? exSkel() : f.metrics && f.metrics.volatility_3y != null ? fmt.p1.format(f.metrics.volatility_3y) : exNa("fewer than 60 daily moves in 3 years", "—")) },
  { key: "dd", label: "MaxDD", num: true, sets: "ORA", get: (f) => (f.category === "money" ? null : f.metrics && f.metrics.max_drawdown), title: "Worst drop since 19 Feb 2020",
    fmt: (f) => (f.pending ? exSkel() : f.category === "money" ? exNa("quotes for money-market funds were erratic in March 2020", "—") : !f.metrics || f.metrics.max_drawdown == null ? exNa("price source unreachable", "—")
      : h("span", { class: "down", "data-tip": `${day(f.metrics.drawdown_peak)} → ${day(f.metrics.drawdown_trough)}${f.metrics.short_history ? ` · data from ${month(f.metrics.from)}` : ""}` }, sign(f.metrics.max_drawdown, fmt.p1))) },
  { key: "ovl", label: "Ovl %", num: true, sets: "OVA", get: (f) => (f.vs && !f.vs.held_only ? f.vs.overlap_pct : null), title: "Overlap with your portfolio: the sum of the smaller weight of each shared holding", fmt: (f) => exOvl(f) },
  { key: "corr", label: "Corr", num: true, sets: "OVA", get: (f) => (f.vs && !f.vs.held_only ? f.vs.corr_1y : null), title: "1-year correlation of daily returns with your portfolio",
    fmt: (f) => (f.pending ? exSkel() : f.vs.held_only ? h("span", { class: "dim", "data-tip": "this is your only holding" }, "held") : f.vs.corr_1y == null ? exNa(f.vs.why_na.corr_1y) : h("span", { "data-tip": `${f.vs.corr_n} common daily returns` }, fmt.n2.format(f.vs.corr_1y))) },
  { key: "d1", label: "Δ1Y pp", num: true, sets: "OVA", get: (f) => (f.vs && !f.vs.held_only ? f.vs.d_1y : null), title: "Fund's 1-year return minus your portfolio's, in percentage points", fmt: (f) => exD(f, "d_1y") },
  { key: "d3", label: "Δ3Y pp/yr", num: true, sets: "VA", get: (f) => (f.vs && !f.vs.held_only ? f.vs.d_3y_pa : null), title: "Difference of 3-year yearly rates", fmt: (f) => exD(f, "d_3y_pa") },
  { key: "d5", label: "Δ5Y pp/yr", num: true, sets: "VA", get: (f) => (f.vs && !f.vs.held_only ? f.vs.d_5y_pa : null), title: "Difference of 5-year yearly rates", fmt: (f) => exD(f, "d_5y_pa") },
  { key: "sw", label: "Swch Δ€", num: true, sets: "VA", get: (f) => (f.switch && f.switch.status === "tracked" ? f.switch.delta : null), fmt: (f) => exSwCell(f) },
  { key: "spark", label: "1Y", sets: "OA", title: "The last year of closes (60 points)",
    fmt: (f) => (f.pending ? exSkel() : sparkSVG(f.spark, { w: 76, hgt: 20, color: f.owned ? "var(--s1)" : "var(--bench-1)" })) },
];
function exRet(f, k) {
  if (f.pending) return exSkel();
  if (f.income === "DIST") return exNa("price excludes distributions", "—");
  const m = f.metrics;
  if (!m) return exNa(f.error || "price source unreachable", "—");
  if (m[k] == null) return exNa(`data from ${m.from ? month(m.from) : "—"}`, "—");
  return exTone(m[k], sign(m[k], fmt.p1));
}
function exOvl(f) {
  const v = f.vs;
  if (v.held_only) return badge("Held", "held");
  if (v.overlap_pct == null) return exNa(v.why_na.overlap_pct);
  const cov = v.overlap_coverage != null && v.overlap_coverage < 0.999 ? ` (${fmt.p0.format(v.overlap_coverage)} cov.)` : "";
  return h("span", { class: v.overlap_partial ? "ex-partial" : null,
    "data-tip": `${fmt.n0.format(v.common_count)} shared holdings${v.overlap_partial ? " · a holding has only its factsheet's top 10: partial" : ""}${cov ? " · coverage: the share of your portfolio with a holdings file" : ""}` },
  `${fmt.n1.format(v.overlap_pct)}${cov}`);
}
function exD(f, k) {
  if (f.pending) return exSkel();
  if (f.vs.held_only) return h("span", { class: "dim", "data-tip": "this is your only holding" }, "held");
  const x = f.vs[k];
  return x == null ? exNa(f.vs.why_na[k], "—") : exTone(x, exPP(x * 100));
}
function exSwCell(f) {
  const s = f.switch;
  if (!s) return exNa("the switch tracker has not started", "—");
  if (s.status === "excluded") return exNa(s.reason, "—");
  if (s.delta == null) return exNa(s.na || "no close", "—");
  return h("a", { href: `#/explore/switch?isin=${f.isin}`, class: tone(s.delta), "data-tip": "after tax, against staying; opens the tracker" }, exEurS(s.delta));
}
const SCR_SETS = [["O", "Overview"], ["S", "Structure"], ["R", "Returns"], ["V", "vs Portfolio"], ["A", "All"]];
const SCR_NAMES = { row: "#", code: "code", name: "name", cat: "category", ter: "yearly cost", aum: "fund size", hold: "holdings", inc: "income", dom: "domicile",
  plan: "savings plan", tax: "tax", last: "last price", day: "today's move", r1: "1-year return", r3: "3-year return", r5: "5-year return", vol: "volatility",
  dd: "worst drop", ovl: "overlap", corr: "correlation", d1: "1-year difference", d3: "3-year difference", d5: "5-year difference", sw: "switch difference", default: "category, then code" };

async function exScreener(body, params) {
  body.append(kpis(stat("Your portfolio", skeleton(40), null, "", "hero"), stat("Universe", "…", null, "", "major"), stat("Holdings files", "…", null, "", "major"),
    stat("Savings plan", "…"), stat("Data", "…"), stat("Switch tracker", "…")));
  const grid = h("div", { class: "grid" });
  body.append(grid);
  grid.append(card({ n: 1, code: "FILT", title: "Filters", span: 12, body: skeleton(34) }), card({ n: 2, code: "SCRN", title: "Screener", span: 12, id: "ex-scrn", body: skeleton(420) }));
  let d;
  try { d = await api("/api/explore/screener"); }
  catch (e) { grid.replaceChildren(card({ n: 1, code: "SCRN", title: "Screener", span: 12, body: empty(`Not available: ${e.message}`) })); return; }
  EX.scr = d;
  exScreenerDraw(body, true);
  const t0 = Date.now();
  const poll = async () => {
    if (!body.isConnected || !EX.scr || !EX.scr.pending.length || Date.now() - t0 > 90_000) return;
    try {
      const n = await api("/api/explore/screener");
      if (!body.isConnected) return;
      EX.scr = n;
      exScreenerDraw(body, false);
    } catch (_) { /* keep the last table */ }
    EX.timer = setTimeout(poll, 2000);
  };
  if (d.pending.length) EX.timer = setTimeout(poll, 2000);
  EX.keys = (e) => {                                   // "/" focuses the filter box while you are working in the screener
    if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
    const a = document.activeElement;
    if (!a || !a.closest || !a.closest("#page .ex-page[data-sub=screener]") || a.matches("input, textarea, select")) return;
    const q = document.getElementById("ex-q");
    if (q) { e.preventDefault(); e.stopPropagation(); q.focus(); q.select(); }
  };
  addEventListener("keydown", EX.keys, true);
}

function exScreenerDraw(body, first) {
  const d = EX.scr;
  const cats = d.categories.map((c) => c.id);
  d.funds.forEach((f) => { f.__catIx = cats.indexOf(f.category); });
  if (EX.st.cols == null) EX.st.cols = "O";
  const P = d.portfolio;
  const heldCodes = (P.positions || []).map((p) => p.code).join(" · ");
  const sw = d.switch || {};
  const asOf = d.as_of ? dayShort(d.as_of) : "—";
  const loaded = d.funds.length - d.pending.length;
  statusSource(`Fund facts: issuers' factsheets · prices: L&S closes to ${asOf}, prices only`);
  body.querySelector(".stats.kpis").replaceWith(kpis(
    stat("Your portfolio", P.mode === "holdings" ? eurFig(P.value) : "—", P.mode === "holdings" ? [`${heldCodes} · `, h("span", { class: "muted" }, `as of ${asOf} close`)] : P.note, "", "hero"),
    stat("Universe", String(d.counts.funds), `${d.counts.etf} ETF + ${d.counts.etc} ETC · ${d.counts.categories} categories`, "", "major"),
    stat("Holdings files", h("span", {}, String(d.counts.lookthrough), h("span", { class: "of" }, ` of ${d.counts.funds}`)), "overlap available", "", "major"),
    stat("Savings plan", `${d.counts.plan_verified} of ${d.counts.funds}`, `verified · ${d.counts.funds - d.counts.plan_verified} not verified`),
    stat("Data", d.pending.length ? `${loaded} of ${d.funds.length}` : `to ${asOf}`, d.pending.length ? "L&S histories loading" : "L&S closes · prices only"),
    stat("Switch tracker", sw.status === "ok" ? `${sw.closes} close${sw.closes === 1 ? "" : "s"}` : sw.status === "none" ? "not started" : sw.status || "—",
      h("a", { href: "#/explore/switch" }, sw.status === "ok" ? `since ${day(sw.start)} →` : "open SWCH →"))));
  const grid = body.querySelector(".grid");
  if (first) grid.replaceChildren(exFilters(d), grid.children[1], exNotePanel(d));
  else grid.lastElementChild.replaceWith(exNotePanel(d));
  const focused = document.activeElement && document.activeElement.closest && document.activeElement.closest("#ex-scrn tr[data-isin]");
  const keep = focused ? focused.dataset.isin : null;
  const scrn = card({ n: 2, code: "SCRN", title: "Screener", span: 12, id: "ex-scrn",
    sub: d.pending.length ? `loading prices: ${loaded} of ${d.funds.length}` : `returns to ${asOf} close · prices only`,
    more: seg(SCR_SETS, EX.st.cols, (k) => { EX.st.cols = k; exSave(); exScrTable(); }, "Columns"),
    tools: d.pending.length ? [h("span", { class: "ex-load" }, progress(loaded / d.funds.length), h("span", { class: "note" },
      `Loading Lang & Schwarz histories one at a time, 0.4 s apart: ${loaded} of ${d.funds.length}. Rows fill in as they arrive.`))] : null,
    body: h("div", { id: "ex-scrn-box" }), flush: true,
    foot: [h("b", {}, "Keys: "), "↑ ↓ move · Enter opens the fund · c adds it to Compare · w opens it in the switch tracker · / filters. ",
      "The # column is the position in the current sort, not a rank. Past returns do not predict future ones."] });
  document.getElementById("ex-scrn").replaceWith(scrn);
  exScrTable();
  if (keep) { const tr = document.querySelector(`#ex-scrn tr[data-isin="${keep}"]`); if (tr) tr.focus({ preventScroll: true }); }
}

function exScrTable() {
  const d = EX.scr, box0 = document.getElementById("ex-scrn-box");
  if (!d || !box0) return;
  const all = exScreenRows(d);
  const slot = document.querySelector(".ex-count-slot");
  if (slot) slot.replaceChildren(h("span", { class: "ex-count" }, h("b", {}, String(all.length)), ` of ${d.funds.length} shown`));
  const set = EX.st.cols;
  const cols = SCR_COLS.filter((c) => c.sets.includes(set) && !(exPhone() && set === "O" && c.key === "spark"));
  const S = EX.st.sort;
  const sorted = (k) => (S.key === k ? (S.dir < 0 ? "descending" : "ascending") : true);
  const box = exTable({
    cols: cols.map((c) => ({ key: c.key, label: c.label, num: c.num, title: c.title, sort: c.key === "row" ? null : sorted(c.key), fmt: c.fmt })),
    rows: all, onsort: (k) => { exSortBy(k); exScrTable(); }, rowCls: (f) => (f.owned ? "you" : null),
    caption: `Sorted by ${SCR_NAMES[S.key] || S.key}, ${S.dir < 0 ? "descending" : "ascending"}. Sorting is not advice.`,
  }, { sticky: 2, rows: all });
  const tb = box.querySelector("tbody");
  [...tb.rows].forEach((tr) => {
    tr.tabIndex = 0;
    tr.addEventListener("click", (e) => { if (e.target.closest("a")) return; exOpenFund(tr._row.isin, tr._row.short_name); });
  });
  tb.addEventListener("keydown", (e) => exRowKeys(e, tb, {
    enter: (f) => exOpenFund(f.isin, f.short_name),
    c: (f) => { EX.picks = [...EX.picks.filter((x) => x !== f.isin), f.isin].slice(-5); exSave(); toast("CMPR", `${f.code} added to Compare (${EX.picks.length} of 5).`); },
    w: (f) => Router.go("explore", "switch", { isin: f.isin }),
  }));
  box0.replaceChildren(all.length ? box : h("div", { class: "ex-pad" }, empty("No fund matches these filters.", h("button", { class: "btn sm", type: "button",
    onclick: () => { EX.st.f = { ...EX_F0 }; exSave(); const g = document.querySelector(".ex-filt"); if (g) g.replaceWith(exFilters(d)); exScrTable(); } }, "Reset filters"))));
  Live.want("page", d.funds.map((f) => f.isin));
}

function exSortBy(k) {
  const c = SCR_COLS.find((x) => x.key === k);
  const S = EX.st.sort;
  if (S.key === k) S.dir = -S.dir;
  else { S.key = k; S.dir = c && c.text ? 1 : -1; }
  exSave();
}
function exScreenRows(d) {
  const F = EX.st.f, q = F.q.trim().toLowerCase();
  const rows = d.funds.filter((f) => (!q || [f.code, f.name, f.isin, f.index || "", f.short_name].some((x) => String(x).toLowerCase().includes(q)))
    && (F.cat === "all" || f.category === F.cat)
    && (F.inc === "all" || f.income === F.inc)
    && (f.ter == null || f.ter <= F.maxTer + 1e-9)
    && (!F.minSize || (f.fund_size_eur_m != null && f.fund_size_eur_m >= F.minSize * 1000))
    && (!F.plan || f.savings_plan === "yes")
    && (!F.lt || f.lookthrough)
    && (!F.y5 || (f.metrics && f.metrics.return_5y_pa != null))
    && (!F.hideHeld || !f.owned));
  const S = EX.st.sort;
  const col = SCR_COLS.find((c) => c.key === S.key && c.get);
  const byCode = (a, b) => a.code.localeCompare(b.code);
  if (!col) rows.sort((a, b) => a.__catIx - b.__catIx || byCode(a, b));
  else {
    rows.sort((a, b) => {
      const x = col.get(a), y = col.get(b);
      const nx = x == null || (typeof x === "number" && !Number.isFinite(x)), ny = y == null || (typeof y === "number" && !Number.isFinite(y));
      if (nx || ny) return nx && ny ? byCode(a, b) : nx ? 1 : -1;          // nulls last, both directions
      const c = typeof x === "string" ? x.localeCompare(y) : x - y;
      return c ? c * S.dir : byCode(a, b);
    });
  }
  rows.forEach((f, i) => { f.__pos = i + 1; });
  return rows;
}
function exRowKeys(e, tb, act) {
  const tr = e.target.closest && e.target.closest("tr");
  if (!tr || !tr._row || e.target.matches("input, select, textarea")) return;
  const rows = [...tb.rows].filter((r) => r._row && !r.classList.contains("ex-pin"));
  const i = rows.indexOf(tr);
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const n = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
    if (n) { n.focus(); n.scrollIntoView({ block: "nearest" }); }
  } else if (e.key === "Enter" && act.enter) { e.preventDefault(); act.enter(tr._row); }
  else if (e.key === " " && act.space) { e.preventDefault(); act.space(tr._row); }
  else if (!e.metaKey && !e.ctrlKey && !e.altKey && act[e.key.toLowerCase()] && e.key.length === 1) { e.preventDefault(); act[e.key.toLowerCase()](tr._row); }
}

function exFilters(d) {
  const redraw = exScrTable;
  const F = EX.st.f;
  const counts = {};
  d.funds.forEach((f) => { counts[f.category] = (counts[f.category] || 0) + 1; });
  const set = (k, v) => { F[k] = v; exSave(); redraw(); };
  const q = h("input", { type: "search", id: "ex-q", placeholder: "Code, name, ISIN or index", value: F.q, "aria-label": "Filter by code, name, ISIN or index (/)" });
  q.addEventListener("input", () => set("q", q.value));
  q.addEventListener("keydown", (e) => { if (e.key === "Escape" && q.value) { e.stopPropagation(); q.value = ""; set("q", ""); } });
  const chips = h("div", { class: "chips", role: "group", "aria-label": "Category" },
    [{ id: "all", short: "All", name: "All" }, ...d.categories].map((c) => {
      const b = chip(c.id === "all" ? "All" : c.name, c.id === "all" ? d.funds.length : counts[c.id] || 0, F.cat === c.id, () => {
        chips.querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        set("cat", c.id);
      });
      return b;
    }));
  const terVal = h("b", { class: "mono" }, fmt.p2.format(F.maxTer));
  const ter = h("input", { type: "range", min: "0.05", max: "0.65", step: "0.01", value: (F.maxTer * 100).toFixed(2), "aria-label": "Maximum yearly cost (TER), %" });
  ter.addEventListener("input", () => { const x = Math.round(ter.value * 100) / 10000; terVal.textContent = fmt.p2.format(x); set("maxTer", x); });
  const tog = (k, label) => { const b = chip(label, null, F[k], () => { b.setAttribute("aria-pressed", String(!F[k])); set(k, !F[k]); }); return b; };
  const reset = h("button", { class: "btn ghost sm", type: "button", onclick: () => { EX.st.f = { ...EX_F0 }; exSave(); const g = document.querySelector(".ex-filt"); if (g) g.replaceWith(exFilters(d)); exScrTable(); } }, "Reset");
  return card({ n: 1, code: "FILT", title: "Filters", span: 12, cls: "ex-filt",
    body: h("div", { class: "ex-filters" },
      h("label", { class: "search ex-search" }, icon("search", 14), q),
      chips,
      h("div", { class: "ex-fgroup" }, h("span", { class: "ex-flabel" }, "Income"), seg([["all", "All"], ["ACC", "Acc"], ["DIST", "Dist"], ["ETC", "ETC"]], F.inc, (v) => set("inc", v), "Income")),
      h("label", { class: "ex-fgroup ex-ter" }, h("span", { class: "ex-flabel" }, "Max TER"), ter, terVal),
      h("div", { class: "ex-fgroup" }, h("span", { class: "ex-flabel" }, "Min size"), seg([["0", "Any"], ["1", "€1bn"], ["5", "€5bn"], ["10", "€10bn"]], String(F.minSize), (v) => set("minSize", +v), "Minimum fund size")),
      h("div", { class: "chips ex-toggles", role: "group", "aria-label": "Only show" },
        tog("plan", "Savings plan verified only"), tog("lt", "Has holdings file"), tog("y5", "5-year history"), tog("hideHeld", "Hide held"))),
    more: [h("span", { class: "ex-count-slot" }), reset] });
}

function exNotePanel(d) {
  const defs = [
    ["Overlap", "The sum, over every company both hold, of the smaller of its two weights; your side combines your funds by value. Shown with its coverage when some of your funds have no holdings file."],
    ["Correlation", "Pearson correlation of simple daily returns over the last year, on the dates both have a close; at least 150 are needed."],
    ["Δ1Y, Δ3Y, Δ5Y", "The fund's price return (1 year) or yearly rate (3 and 5 years) minus your portfolio's, in percentage points. Distributing funds show —: their prices leave out the payouts."],
    ["Your portfolio", `Your holdings today, valued at past prices: today's units × each past close. It is not your real history, which needs the Trade Republic CSV.`],
  ];
  return card({ n: 3, code: "NOTE", title: "Sources and method", span: 12,
    body: h("div", { class: "ex-note" },
      h("div", { class: "ex-note-l" }, h("p", {}, prose(d.sources_note || "")), h("p", { class: "muted" }, d.method), h("p", {}, h("b", {}, "Past returns do not predict future ones."))),
      h("dl", { class: "ex-defs" }, defs.map(([k, v]) => h("div", {}, h("dt", {}, k), h("dd", {}, v))))),
    foot: `Catalogue updated ${day(d.catalog_updated)} · returns to ${d.as_of ? day(d.as_of) : "—"} · L&S session-end mids, prices only · charts: TradingView Lightweight Charts` });
}

/* ================================================================ drawer extras (§4) */
async function exOpenFund(isin, name, pre) {
  const inCat = ((EX.data && EX.data.funds) || []).some((f) => f.isin === isin);
  const extra = (pre || api(inCat ? `/api/explore/fund?isin=${isin}` : `/api/explore/vs?isin=${isin}${name ? `&name=${encodeURIComponent(name)}` : ""}`)).catch((e) => ({ error: e.message }));
  await openInstrument(isin, name);
  const x = await extra;
  const drawer = $("drawer"), bodyEl = $("drawer-body");
  const meta = bodyEl.querySelector(".inst-meta");
  if (drawer.hidden || !meta || !meta.textContent.includes(isin) || bodyEl.querySelector(".ex-dx")) return;   // closed or showing another instrument
  const nodes = exDrawerExtras(isin, x, inCat);
  const actions = bodyEl.querySelector(".actions");
  const wrap = h("div", { class: "ex-dx" }, nodes);
  if (actions) actions.before(wrap); else bodyEl.append(wrap);
}
function exDrawerExtras(isin, x, inCat) {
  if (x.error) return [h("div", { class: "section-l" }, "vs your portfolio"), h("p", { class: "note" }, `Not available: ${x.error}`)];
  const v = x.vs || {};
  const why = v.why_na || {};
  const cell = (label, val, reason, detail) => stat(label, val == null ? exNa(reason, "n/a") : val, val == null ? reason : detail);
  const held = v.held_only;
  const out = [h("div", { class: "section-l" }, h("span", { class: "card-code" }, "VSPF"), "vs your portfolio"),
    h("div", { class: "stats two" },
      cell("Overlap", held ? "held" : v.overlap_pct == null ? null : `${fmt.n1.format(v.overlap_pct)}%`, why.overlap_pct,
        v.overlap_coverage != null && v.overlap_coverage < 0.999 ? `${fmt.p0.format(v.overlap_coverage)} of your portfolio covered` : `${fmt.n0.format(v.common_count || 0)} shared holdings`),
      cell("Correlation 1Y", held ? "held" : v.corr_1y == null ? null : fmt.n2.format(v.corr_1y), why.corr_1y, `${v.corr_n || 0} common daily returns`),
      cell("Δ 1 year", held ? "held" : v.d_1y == null ? null : exTone(v.d_1y, `${exPP(v.d_1y * 100)} pp`), why.d_1y, "fund minus your portfolio"),
      cell("Δ 5 years, a year", held ? "held" : v.d_5y_pa == null ? null : exTone(v.d_5y_pa, `${exPP(v.d_5y_pa * 100)} pp`), why.d_5y_pa, "difference of yearly rates"))];
  if (x.shared && x.shared.length) {
    out.push(h("div", { class: "ex-shared" }, table({ cls: "compact", caption: "Largest shared holdings",
      cols: [{ key: "name", label: "Largest shared holdings", fmt: (r) => h("span", { class: "ex-trunc", title: r.name }, r.name) },
        { key: "fund", label: "In the fund", num: true, fmt: (r) => `${fmt.n2.format(r.fund ?? r.a)}%` },
        { key: "portfolio", label: "In yours", num: true, fmt: (r) => `${fmt.n2.format(r.portfolio ?? r.b)}%` }],
      rows: x.shared.slice(0, 8) })));
  }
  const t = x.tax || {};
  out.push(h("div", { class: "section-l" }, h("span", { class: "card-code" }, "TAXT"), "How a switch into it is taxed"),
    h("p", { class: "ex-dtext" }, h("b", {}, `${t.label || "26%"} · `), t.text || ""));
  if (x.savings_plan) {
    const sp = x.savings_plan;
    out.push(h("p", { class: "note" }, "Savings plan on Trade Republic: ", h("b", {}, sp.status === "yes" ? `yes, checked ${day(sp.checked)}` : sp.status === "no" ? `no, checked ${day(sp.checked)}` : "not verified"),
      sp.status === "not_verified" && sp.how ? ` · ${sp.how}` : ""));
  }
  if (inCat) {
    const s = x.switch || {};
    let swb;
    if (s.status === "not_started") swb = h("p", { class: "note" }, "Not started. ", h("a", { href: "#/explore/switch", onclick: closeDrawer }, "Open the switch tracker →"));
    else if (s.status === "excluded") swb = h("p", { class: "note" }, s.reason);
    else if (s.status === "tracked") {
      swb = [h("div", { class: "stats two" },
        stat("NET if switched", s.net == null ? "—" : exEur(s.net), `since ${day(s.start)} · ${s.closes} closes`),
        stat("Δ vs staying", s.delta == null ? "—" : exTone(s.delta, exEurS(s.delta)), "after tax and fees"),
        stat("Needed", s.needed == null ? "—" : sign(s.needed, fmt.p2), "price change to be level"),
        stat("Gap", s.gap_pp == null ? "—" : exTone(s.gap_pp, `${exPP(s.gap_pp)} pp`), "actual minus needed")),
      h("a", { class: "btn ghost sm", href: `#/explore/switch?isin=${isin}`, onclick: closeDrawer }, "Open in the switch tracker")];
    } else swb = h("p", { class: "note" }, "Not in the current run.");
    out.push(h("div", { class: "section-l" }, h("span", { class: "card-code" }, "SWCH"), "In the switch tracker"), swb);
  }
  const src = x.sources || {};
  out.push(h("div", { class: "section-l" }, h("span", { class: "card-code" }, "SRCS"), "Sources"),
    h("ul", { class: "ex-srcs" },
      src.catalog ? h("li", {}, "Fund facts: ", h("a", { href: src.catalog, target: "_blank", rel: "noopener" }, `${src.issuer || "issuer"} document`), src.catalog_date ? `, ${day(src.catalog_date)}` : "") : null,
      h("li", {}, "Holdings: ", src.lookthrough_as_of ? [`issuer's file as of ${day(src.lookthrough_as_of)}`, src.lookthrough_top_only ? " (top 10 only)" : ""] : "no holdings file"),
      h("li", {}, `Returns: L&S closes to ${src.returns_as_of || x.as_of ? day(src.returns_as_of || x.as_of) : "—"}, prices only.`)));
  return out;
}

/* ================================================================ SWCH: the switch tracker (§3, §6.3) */
async function exSwitch(body, params) {
  const want = (params.get("isin") || params.get("pick") || "").toUpperCase();
  body.append(kpis(stat("Start", skeleton(40), null, "", "hero"), stat("Stay · net", "…", null, "", "major"), stat("Cost of switching at equal returns", "…", null, "", "major"),
    stat("Ahead / behind stay", "…"), stat("Tax at start / stay's if sold", "…"), stat("Last close", "…")));
  const grid = h("div", { class: "grid" }, card({ n: 1, code: "SNAP", title: "Start snapshot", span: 4, body: skeleton(300) }), card({ n: 2, code: "DAY0", title: "Day-zero arithmetic", span: 8, body: skeleton(300) }));
  body.append(grid);
  let v;
  try { v = await api(`/api/switch${EX.st.live ? "?live=1" : ""}`); }
  catch (e) { grid.replaceChildren(card({ n: 1, code: "SWCH", title: "Switch tracker", span: 12, body: empty(`Not available: ${e.message}`) })); return; }
  EX.sw = v;
  if (v.status === "ok" && want && v.rows.some((r) => r.isin === want) && !EX.sel.includes(want)) EX.sel = [...EX.sel, want].slice(-5);
  if (v.status === "ok") EX.sel = EX.sel.filter((i) => v.rows.some((r) => r.isin === i));
  body.replaceChildren();
  statusSource(v.status === "ok" ? `Switch tracker since ${day(v.start.day)} · L&S session-end mids · rules as of ${day(v.rules.rules_as_of)}` : "Switch tracker · L&S prices");
  if (v.status === "ok") exSwitchOk(body, v, want);
  else exSwitchIdle(body, v);
  exHistSection(body);
}

function exSwitchIdle(body, v) {
  const err = v.status === "error";
  body.append(kpis(stat("Start", err ? "stopped" : "not started", err ? "the snapshot failed its check" : "no run yet", "", "hero"),
    stat("Stay · net", "—", "after a snapshot", "", "major"), stat("Cost of switching at equal returns", "—", "fees and spreads", "", "major"),
    stat("Ahead / behind stay", "—", "counts only"), stat("Tax at start", "—", "from the snapshot"), stat("Last close", "—", "23:20 Berlin, weekdays")));
  const how = [
    ["STAY", "keep the holdings exactly as they were at the start."],
    ["SWITCH → X", "sell every holding at the start and put all the proceeds into X: one path for each instrument in the fund list, except what you hold alone and distributing funds."],
    ["REBUY", "sell everything and buy the same holdings straight back: it isolates what paying the tax early costs, plus fees and spreads."],
    ["NET", "each path valued as the cash you would get after tax and fees if you sold at that close. This is the fair comparison."],
  ];
  const btn = err ? h("button", { class: "btn primary", type: "button", onclick: exRestartDialog }, "Restart")
    : v.can_start ? h("button", { class: "btn primary", type: "button", onclick: (e) => exStart(e.currentTarget) }, "Start") : null;
  body.append(h("div", { class: "grid" },
    card({ n: 1, code: "SNAP", title: "Start snapshot", span: 5, badges: err ? badge("Error", "bad") : badge("Not started", "na"),
      body: [h("p", { class: "lede" }, err ? v.error : v.why),
        !err && v.holdings && v.holdings.length ? [h("div", { class: "section-l" }, "What START would freeze"),
          table({ cls: "compact", caption: "Holdings START would freeze",
            cols: [{ key: "code", label: "Holding", fmt: (x) => h("span", { class: "tick" }, x.code) }, { key: "units", label: "Units", num: true, fmt: (x) => fmt.n4.format(x.units) },
              { key: "avg", label: "Avg price", num: true, fmt: (x) => fmt.eur.format(x.avg_price) }, { key: "cost", label: "Tax cost", num: true, fmt: (x) => exEur(x.cost) }],
            rows: v.holdings }),
          h("dl", { class: "kv ex-kv" }, h("dt", {}, "Cash (not moved)"), h("dd", {}, exEur(v.cash)),
            h("dt", {}, "Holdings from"), h("dd", {}, `${(v.portfolio_source || {}).source || "portfolio.json"}`),
            h("dt", {}, "Instruments to price"), h("dd", {}, `${v.holdings.length} held + ${v.candidates} candidates`))] : null,
        err ? null : h("p", { class: "note" },
        "START freezes today's holdings, their tax cost and one price per instrument (the live stream, else the last L&S 1-minute point, else the last close). It asks Lang & Schwarz for these prices one at a time, 0.4 s apart, so it takes 20 to 40 seconds."),
      h("div", { class: "actions" }, btn, !v.can_start && !err ? h("a", { class: "btn", href: "#/portfolio/update" }, "Add holdings") : null),
      h("p", { class: "note ex-status" })],
      foot: "Paper arithmetic: nothing is traded. The snapshot is written once, read-only, and checked on every read." }),
    card({ n: 2, code: "DAY0", title: "What the tracker answers", span: 7,
      body: [h("p", { class: "lede" }, "What your money would be worth if you had sold everything on the start day and put it all into one instrument, against keeping what you had. Each path is valued as the cash you would get after tax and fees if you sold at that close. Paper arithmetic: nothing is traded."),
        h("dl", { class: "ex-defs one" }, how.map(([k, t]) => h("div", {}, h("dt", {}, k), h("dd", {}, t)))),
        h("p", { class: "note" }, "Every weekday from 23:20 Berlin the day's close is added, once it is final. Nothing is sent anywhere: the only requests are Lang & Schwarz prices by ISIN.")],
      foot: "Rules as of 24 Sep 2026 · €1 per order · 0.05% half-spread (assumed) · no stamp duty · credit not counted unless the candidate is an ETC." })));
}

async function exStart(btn) {
  const st = btn.closest(".card").querySelector(".ex-status");
  btn.disabled = true;
  btn.textContent = "Taking today's snapshot…";
  if (st) st.textContent = "Asking Lang & Schwarz for one price per instrument, 0.4 s apart. This takes 20 to 40 seconds.";
  try {
    const r = await post("/api/switch/start", {});
    toast("SWCH", `Tracker started: ${r.tracked} instruments tracked, ${r.excluded} excluded.`);
    EX.sel = [];
    Router.go("explore", "switch");
  } catch (e) { btn.disabled = false; btn.textContent = "Start"; if (st) st.textContent = e.message; }
}
function exRestartDialog() {
  const inp = h("input", { type: "text", class: "inp", placeholder: "Type RESTART", "aria-label": "Type RESTART to confirm", autocomplete: "off" });
  const go = h("button", { class: "btn primary", type: "button", disabled: true }, "Restart the tracker");
  const msg = h("p", { class: "note" });
  inp.addEventListener("input", () => { go.disabled = inp.value !== "RESTART"; });
  go.addEventListener("click", async () => {
    go.disabled = true; go.textContent = "Taking today's snapshot…"; msg.textContent = "Asking Lang & Schwarz for one price per instrument, 0.4 s apart: 20 to 40 seconds.";
    try { await post("/api/switch/restart", { confirm: inp.value }); closeDrawer(); EX.sel = []; toast("SWCH", "A new run started. The old one is kept, read-only."); Router.go("explore", "switch"); }
    catch (e) { msg.textContent = e.message; go.textContent = "Restart the tracker"; go.disabled = inp.value !== "RESTART"; }
  });
  openDrawer({ n: "D", code: "SWCH", title: "Restart the switch tracker", body: [
    h("p", {}, "A restart takes a new snapshot of today's holdings and prices and starts a new run. The current run is kept, read-only, with every close it recorded."),
    h("p", { class: "note" }, "Type RESTART to confirm."), inp, h("div", { class: "actions" }, go), msg] });
  inp.focus();
}

function exSwitchOk(body, v, want) {
  const n = v.start.closes, t0 = v.t0;
  const live = v.as_of.kind === "live";
  body.append(kpis(
    stat("Cost of switching at equal returns", h("span", { class: tone(v.rebuy.timing) }, h("span", { class: "dir" }, arrow(v.rebuy.timing)), eurFig(v.rebuy.timing, { signed: true })),
      `tax paid early + fees + spreads · since ${day(v.start.day)} ${v.start.time}`, "", "hero"),
    stat("Stay · net", eurFig(v.stay.net), `MKT VAL ${exEur(v.stay.mv)}`, "", "major"),
    stat("Start", day(v.start.day), `${v.start.time} · ${n} close${n === 1 ? "" : "s"} recorded`, "", "major"),
    stat("Ahead / behind stay", `${v.counts.ahead} / ${v.counts.behind}`, `after tax · of ${v.counts.tracked} tracked`),
    stat("Tax at start / stay's if sold", `${exEur(t0.tax)} / ${exEur(v.stay.tax_if_sold)}`, "paid early, not extra"),
    stat("Last close", v.last_close ? day(v.last_close) : "none yet", `next ${exWhen(v.update.next_due)}`)));
  const r1 = h("div", { class: "grid" }, exSnapPanel(v), exDay0Panel(v));
  const r2 = h("div", { class: "grid" });
  const r3 = h("div", { class: "grid" });
  const r4 = h("div", { class: "grid" });
  const r5 = h("div", { class: "grid" });
  body.append(r1, r2, r3, r4, r5);
  const drawSel = () => {                              // a selection changes the marks in place, then PATH, TAXD and HURD
    exRankMarks(r2);
    const showPath = n >= 2;
    r3.replaceChildren(...(showPath ? [exPathPanel(v), exTaxdPanel(v, 4)] : [exTaxdPanel(v, 12)]));
    r4.replaceChildren(exHurdPanel(v));
  };
  const drawRank = () => { r2.replaceChildren(exRankPanel(v, { sort: drawRank, select: drawSel })); };
  drawRank();
  drawSel();
  r5.append(exLogPanel(v));
  if (want) {
    const tr = r2.querySelector(`tr[data-isin="${want}"]`);
    if (tr) setTimeout(() => { tr.scrollIntoView({ block: "center" }); tr.focus({ preventScroll: true }); }, 60);
  }
  Live.want("page", [...new Set([...v.holdings.map((x) => x.isin), ...v.rows.map((r) => r.isin)])]);
  if (live) toast("SWCH", `Live row: ${v.as_of.live} of ${v.as_of.of} prices streaming, the rest are last closes. Not recorded.`);
}

const exFoot = (v, extra) => [extra ? [extra, " · "] : null, v.rules_foot];
function exSnapPanel(v) {
  const h0 = v.holdings;
  const src = v.portfolio_source || {};
  const sha = (v.start.sha256 || "").slice(0, 12);
  const tbl = table({ cls: "compact", caption: "Frozen holdings",
    cols: [{ key: "code", label: "Holding", fmt: (x) => h("span", { class: "tick", title: x.name }, x.code || x.isin) },
      { key: "units", label: "Units", num: true, fmt: (x) => fmt.n4.format(x.units) },
      { key: "cost", label: "Tax cost", num: true, fmt: (x) => exEur(x.cost) },
      { key: "price0", label: "Start price", num: true, fmt: (x) => h("span", { "data-tip": `${x.price0_source || ""} · ${x.price0_time ? exWhen(x.price0_time) : ""}` }, x.price0 != null ? fmt.eur.format(x.price0) : "—") }],
    rows: h0 });
  const p0src = [...new Set(h0.map((x) => x.price0_source))].join(", ");
  return card({ n: 1, code: "SNAP", title: "Start snapshot", span: 4, badges: v.current ? badge("Read-only", "ok") : badge("Old run", "na"),
    body: [
      v.holdings_changed ? h("p", { class: "callout ex-warn" }, `Your holdings changed since the start. The tracker still follows the holdings of ${day(v.start.day)}. Restart to follow the new ones.`) : null,
      tbl,
      h("dl", { class: "kv ex-kv" },
        h("dt", {}, "Taken"), h("dd", {}, `${day(v.start.day)} ${v.start.time} Berlin`),
        h("dt", {}, "Run"), h("dd", { class: "mono" }, v.run_id),
        h("dt", {}, "Holdings from"), h("dd", { title: src.source || "" }, `${src.source || "portfolio.json"}${src.updated ? `, file of ${day(src.updated)}` : ""}`),
        h("dt", {}, "Taken by"), h("dd", {}, src.taken_by || "—"),
        h("dt", {}, "Start prices"), h("dd", {}, v.prices0_summary ? `${v.prices0_summary.count} instruments: ${Object.entries(v.prices0_summary.sources).map(([k, n]) => `${n} × ${k}`).join(", ")}, ${(v.prices0_summary.first || "").slice(11, 16)}–${(v.prices0_summary.last || "").slice(11, 16)}` : p0src),
        h("dt", {}, "Instruments"), h("dd", {}, `${v.counts.tracked} tracked · ${v.excluded.length} excluded (panel 3)`),
        h("dt", {}, "Cash not moved"), h("dd", {}, `${exEur(v.cash_not_moved)} (same on every path)`),
        h("dt", {}, "Rules"), h("dd", {}, `as of ${day(v.rules.rules_as_of)} · ${fmt.p0.format(v.rules.tax_rate)} · €${v.rules.fee} per order · ${fmt.p2.format(v.rules.half_spread)} half-spread`),
        h("dt", {}, "Assumptions"), h("dd", {}, (v.rules.assumptions || []).join("; ")),
        h("dt", {}, "sha256"), h("dd", { class: "mono", title: v.start.sha256 }, `${sha}… ✓ checked`)),
      h("div", { class: "actions" },
        h("button", { class: "btn sm", type: "button", onclick: () => exShowJson(v.run_id) }, "View JSON"),
        v.current ? h("button", { class: "btn sm ghost", type: "button", onclick: exRestartDialog }, "Restart…") : null)],
    foot: "Written once at the start, read-only (0444) and hash-checked on every read." });
}
async function exShowJson(run) {
  openDrawer({ n: "D", code: "SNAP", title: "Start snapshot (read-only)", body: skeleton(300) });
  try {
    const s = await api(`/api/switch/snapshot?run=${run}`);
    const txt = JSON.stringify(s.snapshot, null, 1);
    openDrawer({ n: "D", code: "SNAP", title: "Start snapshot (read-only)", body: [
      h("p", { class: "note" }, `sha256 ${s.sha256} · ${s.ok ? "matches the file ✓" : "does not match the file ✕"} · ${fmt.n0.format(txt.length)} characters`),
      h("pre", { class: "ex-json" }, txt.length > 60000 ? `${txt.slice(0, 60000)}\n…` : txt)] });
  } catch (e) { openDrawer({ n: "D", code: "SNAP", title: "Start snapshot", body: empty(e.message) }); }
}

function exDay0Panel(v) {
  const t = v.t0, hs = v.rules.half_spread;
  const ref = t.ref_code || "X";
  const rows = [
    { label: "Market value of your holdings", small: `at the start prices`, value: exEur(t.mv) },
    { op: "−", label: "Spread on the sale", small: `${fmt.p2.format(hs)}, assumed`, value: exEur(t.sell_spread) },
    { op: "−", label: t.loss ? "Tax withheld (a loss: none)" : "Tax withheld", small: t.loss ? "" : `${fmt.p0.format(v.rules.tax_rate)} of the gain`, value: exEur(t.tax) },
    { op: "−", label: "Sell order fee", small: `€${v.rules.fee} × ${v.holdings.length}`, value: exEur(t.sell_fee) },
    { op: "=", label: "Cash after the sale", value: exEur(t.cash_after_sale), cls: "total" },
    { op: "−", label: "Buy order fee", value: exEur(t.buy_fee) },
    { op: "=", label: "Invested in the new instrument", small: `at the ask: ${exEur(t.buy_spread)} of it is the spread`, value: exEur(t.invested), cls: "result" },
  ];
  if (t.loss) rows.push({ cls: "gap" }, { label: "Loss credit created", small: `usable against gains on shares, ETCs or bonds until ${day(t.credit_expires)}; not counted in NET`, value: exEur(t.credit) });
  const gapRows = t.right_gap == null ? [] : [
    { op: "", label: `Buy order fee for ${ref}`, value: exEur(v.rules.fee) },
    { op: "+", label: `Order fee when ${ref} is sold`, small: "staying pays one sale fee, as the switch did", value: exEur(v.rules.fee) },
    { op: "+", label: "Spread on the purchase", small: `${fmt.p2.format(hs)} at the ask`, value: exEur(t.buy_spread) },
    { op: "+", label: `Spread when ${ref} is sold`, small: `${fmt.p2.format(hs)} at the bid`, value: exEur(t.right_gap - 2 * v.rules.fee - t.buy_spread) },
    { op: "=", label: "Day-zero gap", small: "the cost of switching at equal returns", value: exEur(t.right_gap), cls: "total" }];
  const tiles = h("div", { class: "stats three" },
    stat("Stay · net", exEur(t.stay_net0), "tax still owed"),
    stat(`Switch → ${ref} · net`, exEur(t.switch_net0), "tax already paid"),
    stat("Gap", t.right_gap == null ? "—" : exTone(-t.right_gap, exEurS(-t.right_gap)), "fees and spreads"));
  return card({ n: 2, code: "DAY0", title: "Day-zero arithmetic", span: 8, sub: `start prices, ${day(v.start.day)} ${v.start.time}`,
    body: h("div", { class: "pair ex-day0" },
      h("div", { class: "ex-day0-l" }, ledger(rows), gapRows.length ? [h("div", { class: "section-l" }, "Why the gap is " + exEur(t.right_gap)), ledger(gapRows)] : null),
      h("div", { class: "ex-day0-r" },
        h("div", { class: "section-l" }, "Both sides cashed out at the start"), tiles,
        h("p", { class: "ex-copy" }, `Right now every switch is ${exEur(t.right_gap)} behind staying: two €1 orders and the assumed spread. The ${exEur(t.tax)} of tax is not a cost of switching. Staying owes the same tax the day it sells. Switching pays it now, so that money stops earning returns for you.`),
        h("p", { class: "callout ex-wrong" }, h("b", {}, "The wrong comparison. "), `Comparing today's market value (${exEur(t.mv)}) with the amount a switch would invest (${exEur(t.invested)}) would suggest a cost of ${exEur(t.wrong_gap)}. That ignores the tax that staying still owes.`),
        h("p", { class: "note" }, `Without the assumed spread the gap would be ${exEur(2 * v.rules.fee)}: the two orders alone.${t.credit > 0 && !t.loss ? ` The ${exEur(t.credit)} sell fee becomes a loss credit, usable against gains on shares, ETCs or bonds until ${day(t.credit_expires)}; it is not counted in NET.` : ""}`),
        h("p", { class: "note" }, `Spread footnote: at the start the new holding sits slightly below its cost (the spread), so its small loss becomes an uncounted credit. Once it is in gain, the gap narrows by up to 26% of the spread.`))),
    foot: exFoot(v) });
}

/* ---------------------------------------------------------------- RANK */
const RANK_SETS = [["sum", "Summary"], ["tax", "Tax"], ["all", "All"]];
const RANK_NAMES = { net: "NET €", delta: "Δ vs STAY €", dpct: "Δ %", px: "PX RET %", needed: "NEEDED %", gap: "GAP pp", code: "code", name: "name", tax: "tax",
  invested: "invested €", paid: "tax paid €", tis: "tax if sold €", credit: "credit €", perf: "PERF €", alt: "NET at 26%", mv: "MKT VAL €", units: "units" };
function exRankCols(v, set) {
  const pin = (r) => r.__pin;
  const col = (key, label, sets, get, fmtf, o = {}) => ({ key, label, sets, get, fmt: fmtf, num: o.num !== false, title: o.title, text: o.text, hideSm: o.hideSm });
  const sel = (r) => {
    if (pin(r)) return h("span", { class: "ex-pinmark", "aria-hidden": "true" }, "—");
    const k = EX.sel.indexOf(r.isin);
    return h("button", { class: "check ex-check", type: "button", "aria-pressed": String(k >= 0), "aria-label": `Select ${r.code}`, style: k >= 0 ? `--c:var(${EX_COLORS[k]})` : null, tabindex: "-1" }, k >= 0 ? "✓" : "");
  };
  const all = [
    col("row", "#", "sta", null, (r) => (pin(r) ? "" : h("span", { class: "rk" }, r.__pos)), { num: false, title: "Position in the current sort, not a rank" }),
    col("pick", "", "sta", null, sel, { num: false, title: "Selected for the chart, the tax table and the hurdles (up to 5)" }),
    col("code", "Code", "sta", (r) => r.code, (r) => h("span", { class: "tick" }, r.code), { num: false, text: true }),
    col("name", "Name", "sa", (r) => r.name, (r) => h("span", { class: "ex-name", title: r.name }, h("span", { class: "nm" }, r.name), r.kind === "rd" && !pin(r) ? badge("ETC") : null), { num: false, text: true, hideSm: true }),
    col("tax", "Tax", "ta", (r) => r.tax_label, (r) => (pin(r) ? r.tax_label || "" : h("span", { "data-tip": r.tax_tip || "26% on the gain" }, r.tax_label)), { num: false, text: true }),
    col("net", "NET €", "sta", (r) => r.net, (r) => (r.px == null && !pin(r) ? exNa(r.na, "—") : h("span", { class: r.stale ? "ex-stale" : null, "data-tip": r.stale ? "last close is older than this row's date" : null }, exEur(r.net)))),
    col("delta", "Δ vs STAY €", "sa", (r) => r.delta, (r) => (pin(r) ? (r.__pin === "stay" ? h("span", { class: "dim" }, "0.00") : exTone(r.timing, exEurS(r.timing))) : r.delta == null ? "—" : exTone(r.delta, exEurS(r.delta)))),
    col("dpct", "Δ %", "sa", (r) => r.delta_pct, (r) => (pin(r) ? "" : r.delta_pct == null ? "—" : exTone(r.delta_pct, sign(r.delta_pct, fmt.p2)))),
    col("px", "Px ret %", "sa", (r) => r.px_ret, (r) => (r.px_ret == null ? (pin(r) ? "" : "—") : exTone(r.px_ret, sign(r.px_ret, fmt.p2))), { title: "The instrument's price change since the start" }),
    col("needed", "Needed %", "sa", (r) => r.needed, (r) => (pin(r) || r.needed == null ? (pin(r) ? "" : "—") : sign(r.needed, fmt.p2)), { title: "Price change since the start at which the switch would be level with staying today" }),
    col("gap", "Gap pp", "sa", (r) => r.gap_pp, (r) => (pin(r) || r.gap_pp == null ? (pin(r) ? "" : "—") : exTone(r.gap_pp, exPP(r.gap_pp))), { title: "Price change minus needed, in percentage points" }),
    col("invested", "Invested €", "ta", (r) => r.invested, (r) => (pin(r) ? "" : exEur(r.invested))),
    col("paid", "Tax paid €", "ta", (r) => r.tax_paid, (r) => (r.tax_paid == null ? "" : exEur(r.tax_paid))),
    col("tis", "Tax if sold €", "ta", (r) => r.tax_if_sold, (r) => (r.tax_if_sold == null ? "—" : exEur(r.tax_if_sold))),
    col("credit", "Credit €", "ta", (r) => r.credit_left, (r) => (pin(r) || r.credit_left == null ? "" : h("span", { "data-tip": `loss credit left, usable against redditi diversi gains until ${day(r.credit_expires)}; not counted in NET unless the candidate is an ETC` }, `${exEur(r.credit_left)} · ${r.credit_expires.slice(0, 4)}`))),
    col("perf", "Perf €", "ta", (r) => r.perf, (r) => (pin(r) ? "" : r.perf == null ? "—" : exTone(r.perf, exEurS(r.perf))), { title: "NET minus REBUY's NET: the part due to the instrument's price path" }),
    col("alt", "NET@26%", "ta", (r) => r.net_alt, (r) => (r.net_alt == null ? "" : h("span", { "data-tip": "the same switch if the fund's gain were taxed at 26%" }, exEur(r.net_alt))), { title: "Only for the ≈12.5% bond funds" }),
    col("mv", "Mkt val €", "a", (r) => r.mv, (r) => (r.mv == null ? "—" : exEur(r.mv)), { title: "Units × mid. No tax, no fees: never used to compare paths" }),
    col("units", "Units", "a", (r) => r.units, (r) => (r.units == null ? "" : fmt.n4.format(r.units))),
    col("spark", "Δ since start", "s", null, (r) => (pin(r) ? "" : sparkSVG(r.spark.filter((x) => x != null), { w: 72, hgt: 18 })), { num: false }),
  ];
  const k = set === "sum" ? "s" : set === "tax" ? "t" : "a";
  return all.filter((c) => c.sets.includes(k) && !(k === "t" && c.key === "alt" && !v.rows.some((r) => r.net_alt != null)));
}
function exRankPanel(v, on) {
  const redraw = on.sort;
  const S = EX.st.rank;
  const set = exPhone() && !EX.st.rankTouched ? "sum" : S.cols;
  const cols = exRankCols(v, set);
  const n = v.start.closes;
  const rows = v.rows.map((r) => ({ ...r }));
  const col = cols.find((c) => c.key === S.sort.key && c.get) || cols.find((c) => c.key === "net");
  rows.sort((a, b) => {
    const x = col.get(a), y = col.get(b);
    if (x == null || y == null) return x == null && y == null ? a.code.localeCompare(b.code) : x == null ? 1 : -1;
    const c = typeof x === "string" ? x.localeCompare(y) : x - y;
    return c ? c * S.sort.dir : a.code.localeCompare(b.code);
  });
  rows.forEach((r, i) => { r.__pos = i + 1; });
  const pins = [
    { __pin: "stay", isin: "", code: "STAY", name: "Keep what you hold", net: v.stay.net, mv: v.stay.mv, tax_if_sold: v.stay.tax_if_sold, tax_paid: 0,
      px_ret: v.t0.mv ? v.stay.mv / v.t0.mv - 1 : null, tax_label: "" },
    { __pin: "rebuy", isin: "", code: "REBUY", name: "Sell and buy the same back", net: v.rebuy.net, timing: v.rebuy.timing, tax_paid: v.t0.tax, mv: v.rebuy.mv, tax_if_sold: v.rebuy.tax_if_sold, tax_label: "" },
  ];
  const all = [...pins, ...rows];
  const box = exTable({
    cols: cols.map((c) => ({ key: c.key, label: c.label, num: c.num, title: c.title, hideSm: c.hideSm, sort: c.get ? (S.sort.key === c.key ? (S.sort.dir < 0 ? "descending" : "ascending") : true) : null, fmt: c.fmt })),
    rows: all, rowCls: (r) => (r.__pin ? "ex-pin" : EX.sel.includes(r.isin) ? "ex-selrow" : null),
    onsort: (k) => { const c = cols.find((x) => x.key === k); if (S.sort.key === k) S.sort.dir = -S.sort.dir; else S.sort = { key: k, dir: c && c.text ? 1 : -1 }; exSave(); redraw(); },
    caption: `Sorted by ${RANK_NAMES[S.sort.key] || S.sort.key}. This is what happened since the start, not a forecast. No row is advice.`,
  }, { sticky: 3, rows: all });
  const tb = box.querySelector("tbody");
  [...tb.rows].forEach((tr) => {
    const r = tr._row;
    if (!r || r.__pin) return;
    tr.tabIndex = 0;
    tr.addEventListener("click", (e) => { if (e.detail > 1 || e.target.closest("a")) return; exSelect(r.isin); on.select(); });
    tr.addEventListener("dblclick", () => exOpenFund(r.isin, r.name));
  });
  tb.addEventListener("keydown", (e) => exRowKeys(e, tb, { enter: (r) => exOpenFund(r.isin, r.name), space: (r) => { exSelect(r.isin); on.select(); } }));
  const reminder = [`Sorted by ${RANK_NAMES[S.sort.key] || S.sort.key}, ${S.sort.dir < 0 ? "descending" : "ascending"}. This is what happened since ${day(v.start.day)} (${n} close${n === 1 ? "" : "s"}), not a forecast. No row is advice.`,
    n < 20 ? ` After ${n} close${n === 1 ? "" : "s"} the differences are mostly day-to-day noise.` : ""];
  const liveSeg = seg([["close", "Last close"], ["live", "Live"]], EX.st.live ? "live" : "close", (k) => { EX.st.live = k === "live"; exSave(); Router.go("explore", "switch"); }, "Values at");
  const asof = v.as_of.kind === "live" ? h("span", { class: "badge warn" }, "LIVE · not recorded") : v.as_of.kind === "snapshot" ? h("span", { class: "badge na" }, `start prices · ${v.start.time}`) : h("span", { class: "badge real" }, `close ${dayShort(v.as_of.day)}`);
  const excl = v.excluded.length ? h("div", { class: "ex-excl" }, h("span", { class: "ex-flabel" }, `Excluded (${v.excluded.length})`),
    v.excluded.map((x) => h("span", { class: "ex-exi" }, badge(x.code, "excluded"), " ", x.reason))) : null;
  const pathNote = n < 2 ? ` The chart starts after the second recorded close (next update ${exWhen(v.update.next_due)}).` : "";
  return card({ n: 3, code: "RANK", title: "Ranked against staying", span: 12, id: "ex-rank", badges: asof,
    more: seg(RANK_SETS, set, (k) => { S.cols = k; EX.st.rankTouched = true; exSave(); redraw(); }, "Columns"),
    tools: [liveSeg, h("p", { class: "ex-remind" }, reminder)],
    body: [box, excl], flush: true,
    foot: [`Click a row to select it for the chart, the tax table and the hurdles (up to 5; the sixth replaces the oldest). Double-click or Enter opens the fund.${pathNote} `, v.rules_foot] });
}
function exRankMarks(scope) {
  scope.querySelectorAll("#ex-rank tbody tr").forEach((tr) => {
    const r = tr._row;
    if (!r || r.__pin) return;
    const k = EX.sel.indexOf(r.isin);
    tr.classList.toggle("ex-selrow", k >= 0);
    tr.style.setProperty("--c", k >= 0 ? `var(${EX_COLORS[k]})` : "");
    const b = tr.querySelector(".ex-check");
    if (b) { b.setAttribute("aria-pressed", String(k >= 0)); b.textContent = k >= 0 ? "✓" : ""; b.style.setProperty("--c", k >= 0 ? `var(${EX_COLORS[k]})` : ""); }
  });
}
function exSelect(isin) {
  if (EX.sel.includes(isin)) EX.sel = EX.sel.filter((x) => x !== isin);
  else EX.sel = [...EX.sel, isin].slice(-5);
}
/* the candidate TAXD and HURD describe: the last selected, else ?isin=, else the first tracked in catalogue order */
function exFocusRow(v) {
  const i = EX.sel[EX.sel.length - 1];
  const cat = ((EX.data && EX.data.funds) || []).map((f) => f.isin);
  return v.rows.find((r) => r.isin === i) || [...v.rows].sort((a, b) => cat.indexOf(a.isin) - cat.indexOf(b.isin))[0];
}

/* ---------------------------------------------------------------- PATH */
const PATH_MODES = [["net", "NET €"], ["delta", "Δ vs STAY €"], ["mv", "MKT VAL €"], ["pct", "% since start"]];
function exPathPanel(v) {
  const box = h("div", { class: "chart fill ex-path" });
  const leg = h("div", { class: "ex-leg" });
  const P = EX.st.path;
  const allTog = chip("Show all", null, P.all, () => { P.all = !P.all; exSave(); allTog.setAttribute("aria-pressed", String(P.all)); draw(); });
  const draw = async () => {
    const ok = guard("ex-path");
    let s;
    try { s = await api(`/api/switch/series?mode=${P.mode}`); } catch (e) { box.replaceChildren(h("p", { class: "fallback" }, e.message)); return; }
    if (!ok()) return;
    const pct = P.mode === "pct";
    const c = makeChart(box, { euro: !pct, pct });
    if (!c) return;
    const val = (x) => (x == null ? null : pct ? x * 100 : x);
    const pts = (arr) => s.dates.map((d, i) => (arr[i] == null ? null : { time: d, value: val(arr[i]) })).filter(Boolean);
    const f = pct ? (x) => `${sign(x / 100, fmt.p2)}` : (x) => (P.mode === "delta" ? exEurS(x) : exEur(x));
    if (P.all) Object.entries(s.c).forEach(([i, arr]) => { if (!EX.sel.includes(i)) c.addLineSeries({ color: css("--line-2"), lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }).setData(pts(arr)); });
    const stay = c.addLineSeries({ ...SERIES.stay(), title: "Stay" });
    stay.setData(pts(s.stay));
    const rb = lineSeries(c, css("--paid"));
    rb.setData(pts(s.rebuy));
    const rows = [{ series: stay, label: "STAY", c: "var(--s1)", fmt: f }, { series: rb, label: "REBUY", c: "var(--paid)", fmt: f }];
    const legs = [{ c: "var(--s1)", label: "STAY", style: "line" }, { c: "var(--paid)", label: "REBUY", style: "dash" }];
    EX.sel.forEach((i, k) => {
      if (!s.c[i]) return;
      const ser = lineSeries(c, css(EX_COLORS[k]));
      ser.setData(pts(s.c[i]));
      const code = (v.rows.find((r) => r.isin === i) || {}).code || i;
      rows.push({ series: ser, label: code, c: `var(${EX_COLORS[k]})`, fmt: f });
      const last = s.c[i][s.c[i].length - 1];
      legs.push({ c: `var(${EX_COLORS[k]})`, label: code, value: last == null ? "—" : f(val(last)), style: "line" });
    });
    if (P.all) legs.push({ c: "var(--line-2)", label: "other tracked (faint)", style: "line" });
    c.timeScale().fitContent();
    crosshairTip(c, box, rows);
    leg.replaceChildren(legend(legs));
  };
  setTimeout(draw, 0);
  return card({ n: 4, code: "PATH", title: "Value since the start", span: 8,
    more: seg(PATH_MODES, P.mode, (k) => { P.mode = k; exSave(); draw(); }, "Show"),
    tools: [allTog, h("span", { class: "note" }, EX.sel.length ? "Selected rows are drawn in colour; STAY is you." : "Select rows in panel 3 to draw them.")],
    body: [box, leg], foot: exFoot(v, "Closes only; the start point is in panel 2") });
}

/* ---------------------------------------------------------------- TAXD */
/* The cost of paying the tax early, split with signs: the start's fees and spreads, and what changed since. The part
   since can be negative (the rebuy's first gain sits inside its spread and is not taxed), so never "of which". */
function exTimingWords(cost, cost0) {
  const since = Math.round((cost - cost0) * 100) / 100;
  const start = `${exEur(cost0)} of fees and spreads at the start`;
  if (cost < 0) return `Paying it early has left the rebuy ${exEur(-cost)} ahead so far: ${start}, more than offset by ${exEur(-since)} since.`;
  if (Math.abs(since) < 0.005) return `Paying it early has cost ${exEur(cost)} so far: the fees and spreads at the start.`;
  if (since > 0) return `Paying it early has cost ${exEur(cost)} so far: ${start}, and ${exEur(since)} since, on the tax paid early.`;
  return `Paying it early has cost ${exEur(cost)} so far: ${start}, less ${exEur(-since)} since (the rebuy's first gain, inside the spread, is not taxed).`;
}
function exTaxdPanel(v, span) {
  const x = exFocusRow(v);
  const n = v.holdings.length, fee = v.rules.fee;
  if (!x) return card({ n: 5, code: "TAXD", title: "Tax up front vs deferred", span, body: empty("No tracked instrument.") });
  const d = v.as_of.kind === "snapshot" ? `the start (${v.start.time})` : v.as_of.kind === "live" ? "now (live)" : `the ${dayShort(v.as_of.day)} close`;
  const cols = [
    { key: "k", label: "", fmt: (r) => h("span", { class: r.b ? "nm" : null }, r.k) },
    { key: "s", label: "Stay", num: true }, { key: "r", label: "Rebuy", num: true }, { key: "x", label: `Switch → ${x.code}`, num: true }];
  const tot = (a, b) => (a == null || b == null ? null : a + b);
  const rbTis = v.rebuy.tax_if_sold;
  const narrow = span < 12;                            // span 4: short labels so the four columns fit
  const rows = [
    { k: narrow ? "Paid at the start" : "Tax paid at the start", s: exEur(0), r: exEur(v.t0.tax), x: exEur(x.tax_paid) },
    { k: narrow ? "If sold then" : `Tax if sold at ${d}`, s: exEur(v.stay.tax_if_sold), r: rbTis == null ? "—" : exEur(rbTis), x: x.tax_if_sold == null ? "—" : exEur(x.tax_if_sold) },
    { k: narrow ? "Total tax" : "Total tax by then", b: true, s: exEur(v.stay.tax_if_sold), r: exEur(tot(v.t0.tax, rbTis)), x: exEur(tot(x.tax_paid, x.tax_if_sold)) },
    { k: narrow ? "Fees, start + exit" : "Fees paid (start + exit)", s: exEur(fee * n), r: exEur(fee * 3 * n), x: exEur(fee * (n + 2)) },
    { k: narrow ? "NET" : "Cash after tax if sold (NET)", b: true, s: exEur(v.stay.net), r: exEur(v.rebuy.net), x: x.net == null ? "—" : exEur(x.net) },
  ];
  if (narrow) cols[3].label = x.code;
  const tStay = v.stay.tax_if_sold, tX = tot(x.tax_paid, x.tax_if_sold);
  const mx = Math.max(tStay || 0, tX || 0) || 1;
  const bar = (label, val, c) => h("div", { class: "ex-bar" }, h("span", { class: "n" }, label), h("span", { class: "track" }, h("span", { class: "fill", style: `width:${Math.max(1, ((val || 0) / mx) * 100)}%;--c:${c}` })), h("span", { class: "v" }, exEur(val)));
  const loss = v.t0.loss;
  const copy = loss ? [h("p", {}, `No tax at the start. A loss credit of ${exEur(v.t0.credit)} was created. It is usable only against gains on shares, ETCs or bonds until ${day(v.t0.credit_expires)}, and it is not counted in these values.`),
    x.kind === "rd" ? h("p", {}, "An ETC's gain can use it: that is already inside this NET.") : null]
    : [h("p", {}, `The ${exEur(v.t0.tax)} withheld at the start is not lost to staying: staying owes ${exEur(v.stay.tax_if_sold)} the day it sells.`),
      h("p", {}, exTimingWords(-v.rebuy.timing, -v.t0.timing0))];
  const tbl = table({ cols, rows, cls: "compact", caption: "Tax paid up front against tax deferred" });
  const bars = h("div", { class: "ex-bars" }, h("div", { class: "section-l" }, "Total tax by then"), bar("Stay", tStay, "var(--s1)"), bar(`Switch → ${x.code}`, tX, `var(${EX_COLORS[Math.max(0, EX.sel.indexOf(x.isin))]})`));
  return card({ n: 5, code: "TAXD", title: "Tax up front vs deferred", span, sub: `${narrow ? `at ${d} · ` : ""}Switch → ${x.code}${EX.sel.length ? "" : " (first in catalogue order)"}`,
    body: span === 12 ? h("div", { class: "pair ex-taxd" }, h("div", {}, tbl), h("div", { class: "ex-taxd-r" }, bars, h("div", { class: "ex-copy" }, copy)))
      : [tbl, bars, h("div", { class: "ex-copy" }, copy)],
    foot: exFoot(v) });
}

/* ---------------------------------------------------------------- HURD */
function exHurdPanel(v) {
  const x = exFocusRow(v);
  const S = EX.st.hurd || (EX.st.hurd = { key: "cat", dir: 1, all: false });
  const cat = ((EX.data && EX.data.funds) || []).map((f) => f.isin);
  const rows = v.rows.filter((r) => r.px != null).map((r) => ({ ...r }));
  const get = { code: (r) => r.code, needed: (r) => r.needed, px: (r) => r.px_ret, gap: (r) => r.gap_pp, level: (r) => r.level_price, cat: (r) => cat.indexOf(r.isin) }[S.key];
  rows.sort((a, b) => { const p = get(a), q = get(b); const c = typeof p === "string" ? p.localeCompare(q) : p - q; return c * S.dir || a.code.localeCompare(b.code); });
  const shown = S.all ? rows : rows.slice(0, 12);
  const left = h("div", { class: "ex-hurd-l" });
  const drawLeft = () => {
    const tb = table({ cls: "compact", caption: "Since the start, per tracked instrument",
      cols: [{ key: "code", label: "Code", sort: S.key === "code" ? (S.dir < 0 ? "descending" : "ascending") : true, fmt: (r) => h("span", { class: "tick" }, r.code) },
        { key: "needed", label: "Needed %", num: true, sort: S.key === "needed" ? (S.dir < 0 ? "descending" : "ascending") : true, fmt: (r) => sign(r.needed, fmt.p2) },
        { key: "px", label: "Px ret %", num: true, sort: S.key === "px" ? (S.dir < 0 ? "descending" : "ascending") : true, fmt: (r) => exTone(r.px_ret, sign(r.px_ret, fmt.p2)) },
        { key: "gap", label: "Gap pp", num: true, sort: S.key === "gap" ? (S.dir < 0 ? "descending" : "ascending") : true, fmt: (r) => exTone(r.gap_pp, exPP(r.gap_pp)) },
        { key: "level", label: "Level price €", num: true, sort: S.key === "level" ? (S.dir < 0 ? "descending" : "ascending") : true, fmt: (r) => h("span", { "data-tip": `now ${fmt.eur.format(r.px)} · start ${fmt.eur.format(r.q0)}` }, fmt.eur.format(r.level_price)) }],
      rows: shown, rowCls: (r) => (x && r.isin === x.isin ? "sel" : null),
      onsort: (k) => { if (S.key === k) S.dir = -S.dir; else { S.key = k; S.dir = k === "code" ? 1 : -1; } exSave(); left.closest(".card").replaceWith(exHurdPanel(v)); } });
    left.replaceChildren(tb, rows.length > 12 ? h("button", { class: "btn ghost sm ex-more", type: "button", onclick: () => { S.all = !S.all; exSave(); left.closest(".card").replaceWith(exHurdPanel(v)); } }, S.all ? "Show the first 12" : `Show all ${rows.length}`) : null);
  };
  drawLeft();
  const right = h("div", { class: "ex-hurd-r" }, skeleton(160));
  if (x) {
    api(`/api/switch/hurdles?isin=${x.isin}`).then((hh) => {
      const grid = (tbl, label) => {
        const yrs = [...new Set(tbl.map((r) => r.years))], rs = [...new Set(tbl.map((r) => r.r_stay))];
        return table({ cls: "compact ex-fwd", caption: label,
          cols: [{ key: "r", label: label, fmt: (r) => `holdings ${fmt.p0.format(r.r)} a year` }, ...yrs.map((y) => ({ key: `y${y}`, label: `${y} year${y > 1 ? "s" : ""}`, num: true,
            fmt: (r) => { const c = tbl.find((z) => z.r_stay === r.r && z.years === y); return c ? h("span", { "data-tip": `stay ${exEur(c.stay_cash)} · switch at the same growth ${exEur(c.switch_cash_same_growth)}` }, `${fmt.p2.format(c.r_needed)} `, h("small", { class: "muted" }, `(${c.extra_bp >= 0 ? "+" : MINUS}${fmt.n1.format(Math.abs(c.extra_bp))} bp)`)) : "—"; } }))],
          rows: rs.map((r) => ({ r })) });
      };
      const since = hh.since_start;
      right.replaceChildren(...[
        h("div", { class: "section-l" }, `Switch → ${hh.code}: what it needs`),
        since ? h("p", { class: "ex-copy" }, `To be level with staying at ${v.as_of.kind === "snapshot" ? "the start" : dayShort(since.as_of)}, ${hh.code} would need to be at ${fmt.eur.format(since.level_price)} (${sign(since.needed, fmt.p2)} since the start). It is at ${sign(since.px_ret, fmt.p2)}: a gap of ${exPP(since.gap_pp)} pp.`) : null,
        h("p", { class: "note" }, h("b", {}, "Inputs for illustration, not forecasts. "), "If your holdings earned the yearly rate on the left, this is the yearly rate the switch would need to end level after tax (the extra in basis points). Computed once, at the start."),
        grid(hh.table, hh.table_alt ? `At ${hh.tax_label}` : "Your holdings earn"),
        hh.table_alt ? [grid(hh.table_alt, "At 26%"), h("p", { class: "note" }, "A needed rate below the holdings' rate reflects the lower tax only, and only if the issuer communicates its government-bond share.")] : null,
        h("p", { class: "note" }, "Level price: the price at which selling the new holding would leave exactly staying's NET, after its own tax, fee and spread. Gap: the price change so far minus the change needed.")].flat().filter(Boolean));
    }).catch((e) => right.replaceChildren(h("p", { class: "note" }, e.message)));
  } else right.replaceChildren(empty("No tracked instrument."));
  return card({ n: 6, code: "HURD", title: "Break-even hurdles", span: 12,
    body: h("div", { class: "pair ex-hurd" }, left, right), foot: exFoot(v, "Needed and gap use today's NET for staying; level price = start price × (1 + needed)") });
}

/* ---------------------------------------------------------------- LOG */
function exLogPanel(v) {
  const u = v.update;
  const S = EX.st.log || (EX.st.log = { all: false });
  const ev = u.events || [];
  const shown = S.all ? ev : ev.slice(0, 5);
  const words = { row: "close recorded", revision: "close revised (L&S cleaning)", dropped: "close dropped", no_final_close: "no final close yet", error: "error" };
  const evWord = (e) => (e.kind === "no_new_close" ? (e.why === "calendar" ? "L&S holiday" : e.why === "no_quote" ? "L&S closed: no quote that day" : "no close that day") : words[e.kind] || e.kind);
  const mins = u.can_update_in_min || 0;
  const btn = h("button", { class: "btn sm", type: "button", disabled: mins > 0 || !v.current ? true : null, onclick: async (e) => {
    const b = e.currentTarget; b.disabled = true; b.textContent = "Updating…";
    try {
      const r = await post("/api/switch/update", {});
      toast("SWCH", r.skipped || (r.events.length ? `${r.events.length} event${r.events.length > 1 ? "s" : ""}: ${r.events.map((x) => `${x.kind} ${x.d}`).join(", ")}` : "No new final close yet."));
      Router.go("explore", "switch");
    } catch (err) { toast("SWCH", err.message); b.disabled = false; b.textContent = "Update now"; }
  } }, mins > 0 ? `Update now (in ${mins} min)` : "Update now");
  const list = ev.length ? table({ cls: "compact", caption: "Tracker log",
    cols: [{ key: "d", label: "Close", fmt: (e) => h("span", { class: "mono" }, e.d ? day(e.d) : "—") },
      { key: "kind", label: "Event", fmt: (e) => h("span", { class: `ex-ev ${e.kind}` }, evWord(e), e.error ? h("small", { class: "muted" }, ` ${e.error}`) : null) },
      { key: "at", label: "At", num: true, fmt: (e) => exWhen(e.at) }],
    rows: shown }) : h("p", { class: "note ex-nolog" }, `No closes recorded yet. The first is due ${exWhen(u.next_due)}${v.start.closes === 0 ? "; a snapshot taken before 22:55 (13:55 on 30 Dec) counts that evening's close" : ""}.`);
  const rules = ev.length < 4 ? h("dl", { class: "ex-defs one ex-logrules" },
    h("div", {}, h("dt", {}, "Final close"), h("dd", {}, "A day's close counts after 23:05 Berlin, once the prices were fetched after the session end (23:00; 14:00 on 30 Dec) and the instrument has a quote that day; any earlier day is final.")),
    h("div", {}, h("dt", {}, "Update"), h("dd", {}, "From 23:20 on weekdays, retried at about 23:35 and 23:50; a Mac that was asleep catches up every missed close at the next update.")),
    h("div", {}, h("dt", {}, "Revisions"), h("dd", {}, "The last 5 rows are recomputed each time, because L&S cleaning can move a point once the next one arrives; older rows stay frozen."))) : null;
  return card({ n: 7, code: "LOG", title: "Updates", span: 12, cls: "ex-log",
    body: h("div", { class: "ex-logb" },
      h("div", { class: "ex-log-l" }, list, rules, ev.length > 5 ? h("button", { class: "btn ghost sm ex-more", type: "button", onclick: (e) => { S.all = !S.all; e.currentTarget.closest(".card").replaceWith(exLogPanel(v)); } }, S.all ? "Show 5" : `Show all ${ev.length}`) : null),
      h("div", { class: "ex-log-r" },
        h("div", { class: "stats four" },
          stat("Last attempt", u.last_attempt ? exWhen(u.last_attempt) : "none", u.last_error ? h("span", { class: "down" }, u.last_error) : "no error"),
          stat("Last OK", u.last_ok ? exWhen(u.last_ok) : "none", `${v.start.closes} closes recorded`),
          stat("Next due", exWhen(u.next_due), "23:20 Berlin, weekdays"),
          stat("Scheduler", v.scheduler === "on" ? "on" : "off", v.scheduler === "on" ? "retries 23:35, 23:50" : "test run: Update now only")),
        h("div", { class: "actions" }, btn, h("span", { class: "note" }, "One request per instrument, 1.5 s apart after a real fetch; refused within 10 minutes of the last attempt.")))),
    foot: exFoot(v, `Log: ${u.events_total || 0} events`) });
}

/* ---------------------------------------------------------------- HIST (§3.12), below its own separator */
const HIST_MODES = [["delta", "Δ € vs STAY"], ["net", "NET €"], ["dpct", "Δ %"], ["px", "PX %"]];
const WIN_LABEL = { "1m": "1M", "3m": "3M", "6m": "6M", "1y": "1Y", "3y": "3Y", "5y": "5Y" };
function exHistSection(body) {
  const holder = h("div", { class: "grid" }, card({ n: 8, code: "HIST", title: "If you had switched earlier", span: 12, cls: "ex-hist", body: skeleton(360) }));
  body.append(h("div", { class: "ex-sep-hist", role: "separator", "aria-label": "Historical, not the tracker" }, h("span", {}, "Historical · not the tracker")), holder);
  const t0 = Date.now();
  const load = async () => {
    let r;
    try { r = await api("/api/switch/history"); } catch (e) { holder.replaceChildren(card({ n: 8, code: "HIST", title: "If you had switched earlier", span: 12, cls: "ex-hist", body: empty(`Not available: ${e.message}`) })); return; }
    if (!holder.isConnected) return;
    EX.hist = r;
    holder.replaceChildren(exHistPanel(r));
    if ((r.status === "loading" || (r.pending && r.pending.length)) && Date.now() - t0 < 90_000) EX.timer = setTimeout(load, 2500);
  };
  load();
}
function exHistPanel(r) {
  const ttl = { n: 8, code: "HIST", title: "If you had switched earlier", span: 12, cls: "ex-hist" };
  if (r.status === "empty" || r.status === "unpriced") return card({ ...ttl, body: empty(r.note) });
  if (r.status === "loading") return card({ ...ttl, body: [h("p", { class: "note" }, `Loading Lang & Schwarz histories: ${r.pending.length} to go.`), skeleton(300)] });
  const S = EX.st.hist;
  const wins = Object.keys(r.windows);
  const mode = S.mode;
  const val = (w, isin) => {
    const x = (r.windows[w].rows || {})[isin];
    if (!x || x.na) return null;
    return mode === "delta" ? x.delta : mode === "net" ? x.net : mode === "dpct" ? x.delta / r.windows[w].stay_net : x.px_ret;
  };
  const fmtv = (x) => (mode === "delta" ? exTone(x, exEurS(x)) : mode === "net" ? exEur(x) : exTone(x, sign(x, fmt.p1)));
  const cat = r.candidates.map((c) => c.isin);
  let rows = r.candidates.map((c) => ({ ...c }));
  if (S.sort && S.sort.key !== "cat") {
    const k = S.sort.key;
    rows.sort((a, b) => {
      const x = k === "code" ? a.code : val(k, a.isin), y = k === "code" ? b.code : val(k, b.isin);
      if (x == null || y == null) return x == null && y == null ? cat.indexOf(a.isin) - cat.indexOf(b.isin) : x == null ? 1 : -1;
      const c = typeof x === "string" ? x.localeCompare(y) : x - y;
      return c * S.sort.dir || cat.indexOf(a.isin) - cat.indexOf(b.isin);
    });
  }
  const pins = [{ __pin: "stay", code: "STAY", name: "Keep what you hold" }, { __pin: "rebuy", code: "REBUY", name: "Sell and buy the same back" }];
  const cell = (w) => (row) => {
    const W = r.windows[w];
    if (!W.rows) return exNa(W.na, "n/a");
    if (row.__pin === "stay") return mode === "delta" || mode === "dpct" ? h("span", { class: "dim" }, "0") : mode === "net" ? exEur(W.stay_net) : exTone(W.stay_px_ret, sign(W.stay_px_ret, fmt.p1));
    if (row.__pin === "rebuy") return mode === "delta" ? exTone(W.timing, exEurS(W.timing)) : mode === "net" ? exEur(W.rebuy_net) : mode === "dpct" ? exTone(W.timing / W.stay_net, sign(W.timing / W.stay_net, fmt.p1)) : exTone(W.stay_px_ret, sign(W.stay_px_ret, fmt.p1));
    const x = (W.rows || {})[row.isin];
    if (!x) return "—";
    if (x.na) return exNa(x.na === "loading" ? "loading its L&S history" : x.na, x.na === "loading" ? "…" : "n/a");
    const v = val(w, row.isin);
    const tip = x.net_alt != null ? `at 26% instead of ≈12.5%: NET ${exEur(x.net_alt)} · Δ ${exEurS(x.delta_alt)}` : null;
    return h("span", { "data-tip": tip }, fmtv(v));
  };
  const cols = [
    { key: "code", label: "Code", sort: S.sort && S.sort.key === "code" ? (S.sort.dir < 0 ? "descending" : "ascending") : true, fmt: (x) => h("span", { class: "tick" }, x.code) },
    { key: "name", label: "Name", hideSm: true, fmt: (x) => h("span", { class: "ex-name", title: x.name }, h("span", { class: "nm" }, x.name), x.tax_label && x.tax_label !== "26%" ? h("span", { class: "muted", "data-tip": x.tax_tip }, ` ${x.tax_label}`) : null) },
    ...wins.map((w) => ({ key: w, num: true, title: r.windows[w].start_close ? `first close on or after ${day(r.windows[w].start)}` : r.windows[w].na,
      label: h("span", {}, WIN_LABEL[w], h("small", { class: "ex-from" }, ` · from ${r.windows[w].start_close ? day(r.windows[w].start_close) : "—"}`)),
      sort: S.sort && S.sort.key === w ? (S.sort.dir < 0 ? "descending" : "ascending") : true, fmt: cell(w) })),
  ];
  const all = [...pins, ...rows];
  const box = exTable({ cols, rows: all, rowCls: (x) => (x.__pin ? "ex-pin" : null), caption: "If you had switched earlier, after tax",
    onsort: (k) => { if (S.sort && S.sort.key === k) S.sort.dir = -S.sort.dir; else S.sort = { key: k, dir: k === "code" ? 1 : -1 }; exSave(); document.querySelector(".ex-hist").replaceWith(exHistPanel(r)); } }, { sticky: 1, rows: all });
  const summary = wins.map((w) => (r.windows[w].counts ? `${WIN_LABEL[w]} ${r.windows[w].counts.ahead}/${r.windows[w].counts.with_data}` : `${WIN_LABEL[w]} n/a`)).join(" · ");
  return card({ ...ttl, sub: `today's capital ${exEur(r.capital)} · end ${day(r.end)}`,
    more: seg(HIST_MODES, mode, (k) => { S.mode = k; exSave(); document.querySelector(".ex-hist").replaceWith(exHistPanel(r)); }, "Values"),
    tools: [h("p", { class: "ex-remind" }, `If you had switched on an earlier date. Uses your capital and your unrealised gain as they are today, placed on each start date, so every switch pays today's tax (${exEur(r.tax_at_switch)}). Past returns do not predict future ones.`)],
    body: [h("p", { class: "ex-sum" }, h("b", {}, "After tax, candidates ahead of staying: "), summary, S.sort && S.sort.key !== "cat" ? h("span", { class: "muted" }, ` · sorted by ${S.sort.key === "code" ? "code" : WIN_LABEL[S.sort.key]}, not a forecast`) : h("span", { class: "muted" }, " · catalogue order")),
      box,
      h("ol", { class: "ex-caveats" }, r.caveats.map((c) => h("li", {}, c))),
      r.excluded.length ? h("p", { class: "note" }, `Left out: ${r.excluded.map((x) => `${x.code} (${x.reason.split(":")[0].toLowerCase()})`).join(", ")}.`) : null],
    flush: false,
    foot: `Historical arithmetic on L&S closes to ${day(r.end)}, prices only · the same after-tax method as the tracker · a switch's loss credit lapses on 31 Dec of year(start) + 4 · Rules as of 24 Sep 2026 · €1 per order · 0.05% half-spread (assumed) · no stamp duty.` });
}

/* ================================================================ CMPR: compare (§6.4) */
async function exCompare(body, params) {
  const d = await exploreData();
  const add = (params.get("add") || "").toUpperCase();
  if (add && !EX.picks.includes(add)) EX.picks = [...EX.picks, add].slice(-5);
  if (!EX.picks.length) {
    const own = d.funds.filter((f) => f.owned).map((f) => f.isin);
    EX.picks = [...new Set(["IE00B4L5Y983", "IE00B5BMR087"].filter((x) => !own.includes(x)))].slice(0, 2);
  }
  EX.picks = EX.picks.filter((i) => d.funds.some((f) => f.isin === i)).slice(0, 5);
  exSave();
  statusSource("Compare: L&S closes, prices only · issuers' holdings files");
  const fund = (i) => d.funds.find((f) => f.isin === i) || { code: i, short_name: i };
  const col = (k) => `var(${EX_COLORS[k]})`;
  const rerender = () => Router.go("explore", "compare");
  const picker = h("select", { "aria-label": "Add a fund to compare", class: "ex-add" }, h("option", { value: "" }, "+ Add"),
    d.categories.map((c) => h("optgroup", { label: c.name }, d.funds.filter((f) => f.category === c.id && !EX.picks.includes(f.isin)).map((f) => h("option", { value: f.isin }, `${f.code} · ${f.short_name.replace(/ \([A-Z0-9]+\)$/, "")}`)))));
  picker.addEventListener("change", () => { if (picker.value) { EX.picks = [...EX.picks, picker.value].slice(-5); exSave(); rerender(); } });
  const chipsEl = h("div", { class: "chips ex-picks" },
    h("span", { class: "chip ex-pf", "data-tip": "today's holdings valued at past prices" }, exKey("--s1", "line"), "Your portfolio"),
    EX.picks.map((i, k) => h("span", { class: "chip ex-pick" }, exKey(EX_COLORS[k]), h("b", {}, fund(i).code), h("span", { class: "ex-pick-n" }, fund(i).short_name.replace(/ \([A-Z0-9]+\)$/, "")),
      h("button", { type: "button", class: "ex-x", "aria-label": `Remove ${fund(i).code}`, onclick: () => { EX.picks = EX.picks.filter((x) => x !== i); exSave(); rerender(); } }, "×"))),
    EX.picks.length < 5 ? picker : h("span", { class: "note" }, "5 of 5: remove one to add another"));
  const g1 = h("div", { class: "grid" }, card({ n: 1, code: "PICK", title: "Picks", span: 12, body: chipsEl, foot: "Up to five funds from the fund list. Add from here, with c on a screener row, or with CMPR on the command line." }));
  const chartBox = h("div", { class: "chart lg" });
  const legEl = h("div", {});
  const noteEl = h("p", { class: "note" });
  const g2 = h("div", { class: "grid" }, card({ n: 2, code: "GROW", title: "Growth of €100", span: 12,
    more: seg([["1y", "1Y"], ["3y", "3Y"], ["5y", "5Y"], ["max", "All"]], EX.st.cmpr.range, (r) => { EX.st.cmpr.range = r; exSave(); drawGrow(); }, "Period"),
    body: [chartBox, legEl, noteEl], foot: "L&S session-end mids, rebased to 100 on the latest date all lines share. Prices only: distributions are not included. Past returns do not predict future ones." }));
  const side = h("div", {}, skeleton(300));
  const g3 = h("div", { class: "grid" }, card({ n: 3, code: "SIDE", title: "Side by side", span: 12, body: side, flush: true, foot: "Facts: issuers' factsheets and KIDs with their dates. vs columns: your holdings today, valued at past prices." }));
  const ovl = h("div", {}, skeleton(180)), cor = h("div", {}, skeleton(180));
  const g4 = h("div", { class: "grid" },
    card({ n: 4, code: "OVLP", title: "Overlap matrix", span: 6, body: ovl, foot: "Sum of the smaller weight of each shared holding, from issuers' holdings files. Click a cell for the shared holdings." }),
    card({ n: 5, code: "CORR", title: "Correlation matrix (1 year)", span: 6, body: cor, foot: "Pearson correlation of daily returns over the last year; at least 150 common days. 1 moves together, 0 unrelated." }));
  body.append(g1, g2, g3, g4);
  if (!EX.picks.length) { [g2, g3, g4].forEach((g) => g.remove()); return; }
  Live.want("page", EX.picks);
  const ids = ["PF", ...EX.picks];
  async function drawGrow() {
    const ok = guard("ex-grow");
    let s;
    try { s = await api(`/api/explore/series?isins=${ids.join(",")}&range=${EX.st.cmpr.range}`); } catch (e) { chartBox.replaceChildren(h("p", { class: "fallback" }, e.message)); return; }
    if (!ok()) return;
    const c = makeChart(chartBox, { euro: false });
    if (!c || !s.dates.length) { if (c) chartBox.replaceChildren(h("p", { class: "fallback" }, "No common dates.")); return; }
    const rowsTip = [], legs = [];
    ids.forEach((i) => {
      if (!s.series[i]) return;
      const k = EX.picks.indexOf(i);
      const ser = i === "PF" ? c.addLineSeries(SERIES.youLine()) : lineSeries(c, css(EX_COLORS[k]));   // cyan is yours
      ser.setData(s.dates.map((dd, j) => ({ time: dd, value: s.series[i][j] })));
      const last = s.series[i][s.series[i].length - 1];
      const nm = i === "PF" ? "Your portfolio" : fund(i).code;
      rowsTip.push({ series: ser, label: nm, c: i === "PF" ? "var(--s1)" : col(k), fmt: (x) => fmt.n1.format(x) });
      legs.push({ c: i === "PF" ? "var(--s1)" : col(k), label: nm, value: `${fmt.n1.format(last)} (${sign(last / 100 - 1, fmt.p1)})`, style: "line" });
    });
    c.timeScale().fitContent();
    crosshairTip(c, chartBox, rowsTip);
    legEl.replaceChildren(legend(legs));
    const miss = Object.entries(s.why_na || {}).map(([i, w]) => `${i === "PF" ? "your portfolio" : fund(i).code}: ${w}`);
    noteEl.textContent = `From ${day(s.start)} to ${day(s.end)}.${s.distributing && s.distributing.length ? ` ${s.distributing.map((i) => fund(i).code).join(", ")} pay out distributions that these prices leave out.` : ""}${miss.length ? ` Not drawn: ${miss.join("; ")}.` : ""}`;
  }
  drawGrow();
  const [scr, mx] = await Promise.all([EX.scr ? Promise.resolve(EX.scr) : api("/api/explore/screener").catch(() => null), api(`/api/explore/matrix?isins=${ids.join(",")}`).catch((e) => ({ error: e.message }))]);
  if (scr) EX.scr = scr;
  const F = (i) => (scr ? scr.funds.find((f) => f.isin === i) : null) || { isin: i, code: fund(i).code, vs: { why_na: {} }, metrics: null };
  const facts = [
    ["TER", (f) => (f.ter == null ? "—" : `${fmt.p2.format(f.ter)} · ${fmt.eur0.format(f.ter * 10000)}/€10k`)],
    ["Fund size", (f) => exBn(f.fund_size_eur_m)],
    ["Holdings", (f) => (f.wrapper === "ETC" ? "gold" : f.holdings ? `${fmt.n0.format(f.holdings)} ${f.holdings_kind === "companies in the index" ? "in the index" : f.holdings_kind || ""}` : exNa(f.holdings_na))],
    ["Index", (f) => h("span", { class: "ex-trunc", title: f.index || "" }, f.index || "—")],
    ["Income", (f) => f.distribution || "—"], ["Domicile", (f) => f.domicile || "—"],
    ["Savings plan (TR)", (f) => (f.savings_plan === "yes" ? "yes" : f.savings_plan === "no" ? "no" : h("span", { class: "muted", "data-tip": f.savings_plan_how || "" }, "not verified"))],
    ["Tax", (f) => h("span", { "data-tip": f.tax_tip || "" }, f.tax_label || "—")],
    ["1Y", (f) => exRet(f, "return_1y")], ["5Y a year", (f) => exRet(f, "return_5y_pa")],
    ["Worst drop since 2020", (f) => (f.category === "money" ? exNa("erratic L&S quotes in March 2020", "—") : f.metrics && f.metrics.max_drawdown != null ? exTone(-1, sign(f.metrics.max_drawdown, fmt.p1)) : "—")],
    ["Volatility (3Y)", (f) => (f.metrics && f.metrics.volatility_3y != null ? fmt.p1.format(f.metrics.volatility_3y) : "—")],
    ["Overlap with yours", (f) => exOvl(f)], ["Correlation 1Y", (f) => (f.vs.held_only ? "held" : f.vs.corr_1y == null ? exNa(f.vs.why_na.corr_1y) : fmt.n2.format(f.vs.corr_1y))],
    ["Δ1Y vs yours", (f) => exD(f, "d_1y")], ["Δ5Y vs yours", (f) => exD(f, "d_5y_pa")],
    ["Switch Δ€", (f) => exSwCell(f)],
  ];
  const sideRows = facts.map(([k, fn]) => ({ k, fn }));
  side.replaceChildren(exTable({ caption: "Side by side",
    cols: [{ key: "k", label: "Fact", fmt: (r) => h("span", { class: "muted" }, r.k) }, ...EX.picks.map((i, k) => ({ key: i, num: true, label: h("span", {}, exKey(EX_COLORS[k]), " ", fund(i).code), fmt: (r) => r.fn(F(i)) }))],
    rows: sideRows }, { sticky: 1, rows: sideRows, isin: () => "" }));
  if (mx.error) { ovl.replaceChildren(empty(mx.error)); cor.replaceChildren(empty(mx.error)); return; }
  const shared = h("div", { class: "ex-sharedbox" }, h("p", { class: "note" }, "Click an overlap cell to list the holdings the two share."));
  const matrix = (M, kind) => {
    const n = mx.ids.length;
    const head = (i) => (mx.ids[i] === "PF" ? h("span", {}, exKey("--s1"), " PF") : h("span", {}, exKey(EX_COLORS[EX.picks.indexOf(mx.ids[i])]), " ", mx.names[mx.ids[i]]));
    return h("div", { class: "ex-matrix-wrap" }, h("table", { class: `table compact ex-matrix ${kind}` },
      h("thead", {}, h("tr", {}, h("th", {}, ""), mx.ids.map((_, j) => h("th", { class: "num" }, head(j))))),
      h("tbody", {}, mx.ids.map((a, i) => h("tr", {}, h("th", { scope: "row" }, head(i)), mx.ids.map((b, j) => {
        if (j < i) return h("td", { class: "ex-lower" }, "");
        if (i === j) return h("td", { class: "num dim" }, kind === "corr" ? "1" : "—");
        const val = M[i][j];
        if (val == null) {
          const why = kind === "ovl" ? (mx.why_na[a] || mx.why_na[b] || "no shared holdings file") : `fewer than 150 common days (${(mx.corr_n[i] || [])[j] ?? 0})`;
          return h("td", { class: "num" }, exNa(why));
        }
        if (kind === "corr") {
          const lvl = Math.max(1, Math.min(6, Math.ceil(Math.abs(val) * 6)));
          return h("td", { class: `num ex-heat${val < 0 ? " neg" : ""}`, style: `--h:var(--seq-${lvl})`, "data-tip": `${mx.names[a]} × ${mx.names[b]}: ${(mx.corr_n[i] || [])[j]} common daily returns` }, fmt.n2.format(val));
        }
        const td = h("td", { class: "num ex-ovcell", tabindex: "0", "data-tip": "click for the shared holdings" }, `${fmt.n1.format(val)}%`);
        const show = () => {
          const list = mx.shared[`${Math.min(i, j)},${Math.max(i, j)}`] || [];
          shared.replaceChildren(h("div", { class: "section-l" }, `${mx.names[a]} × ${mx.names[b]}: largest shared holdings`),
            list.length ? table({ cls: "compact", cols: [{ key: "name", label: "Holding", fmt: (x) => h("span", { class: "ex-trunc", title: x.name }, x.name) },
              { key: "a", label: mx.names[mx.ids[Math.min(i, j)]], num: true, fmt: (x) => `${fmt.n2.format(x.a)}%` }, { key: "b", label: mx.names[mx.ids[Math.max(i, j)]], num: true, fmt: (x) => `${fmt.n2.format(x.b)}%` }], rows: list }) : h("p", { class: "note" }, "No names listed."));
        };
        td.addEventListener("click", show);
        td.addEventListener("keydown", (e) => { if (e.key === "Enter") show(); });
        return td;
      }))))));
  };
  ovl.replaceChildren(matrix(mx.overlap, "ovl"), shared);
  cor.replaceChildren(matrix(mx.corr, "corr"), h("div", { class: "ex-scale" }, h("span", { class: "note" }, "Shade: |correlation|"), [1, 2, 3, 4, 5, 6].map((k) => h("i", { style: `--h:var(--seq-${k})` })), h("span", { class: "note" }, "0 → 1")),
    h("p", { class: "note" }, `Correlation to ${mx.as_of ? day(mx.as_of) : "—"}. It measures whether daily moves go together, not how large they are.`));
}

/* ================================================================ LOOK: look up anything (§6.5) */
function exLookup(body) {
  statusSource("Look up: anything Lang & Schwarz quotes");
  const result = h("div", { class: "ex-result" });
  const recentBox = h("div", { class: "ex-recbox" });
  const remember = (x, extra = {}) => {
    const old = (EX.st.recent || []).find((r) => r.isin === x.isin) || {};
    const rec = { price: old.price, prev: old.prev, isin: x.isin, name: x.name, type: x.type || old.type || "", at: new Date().toISOString(), ...extra };
    EX.st.recent = [rec, ...(EX.st.recent || []).filter((r) => r.isin !== x.isin)].slice(0, 10);
    exSave();
    drawRecent();
  };
  const pick = async (x) => {
    remember(x);
    const inCat = ((EX.data && EX.data.funds) || []).some((f) => f.isin === x.isin);
    const vsP = api(`/api/explore/vs?isin=${x.isin}&name=${encodeURIComponent(x.name || "")}&type=${encodeURIComponent(x.type || "")}`);
    exOpenFund(x.isin, x.name, inCat ? null : vsP);
    result.replaceChildren(h("div", { class: "section-l" }, `${x.name} · vs your portfolio`), skeleton(90));
    try { const v = await vsP; remember(x, { price: v.price, prev: v.prev_close }); result.replaceChildren(...exLookResult(x, v)); }
    catch (e) { result.replaceChildren(h("div", { class: "section-l" }, x.name), h("p", { class: "note" }, `Not available: ${e.message}`)); }
  };
  const examples = h("div", { class: "chips" }, ["Ferrari", "NVIDIA", "Rheinmetall", "IE00B4ND3602"].map((q) => chip(q, null, false, () => {
    const inp = body.querySelector(".ex-find input"); inp.value = q; inp.dispatchEvent(new Event("input")); inp.focus();
  })));
  result.replaceChildren(h("div", { class: "section-l" }, "Try"), examples,
    h("p", { class: "note" }, "Pick a result to open its card: price, chart and facts, and for anything you pick, how it relates to what you hold (correlation and return differences; overlap for funds with a holdings file)."));
  function drawRecent() {
    const list = EX.st.recent || [];
    Live.want("page", list.map((r) => r.isin));
    const row = (r) => {
      const p = Live.price(r.isin, r.price);
      const d = p != null && r.prev ? p / r.prev - 1 : null;
      return h("div", { class: "ex-rec", "data-live": r.isin, "data-prev": r.prev || "", tabindex: "0", role: "button",
        onclick: () => exOpenFund(r.isin, r.name), onkeydown: (e) => { if (e.key === "Enter") exOpenFund(r.isin, r.name); } },
      h("span", { class: "ex-rec-n" }, h("b", {}, r.name), h("small", {}, `${r.type ? `${r.type} · ` : ""}${r.isin}`)),
      h("span", { class: "ex-rec-p" }, h("b", { "data-f": "last", class: "flashable", "data-tip": Live.price(r.isin, null) != null ? "live" : `last L&S quote when picked, ${ago(r.at)}` }, p != null ? fmt.eur.format(p) : "—"),
        h("small", { "data-f": "day", class: tone(d) }, d != null ? sign(d, fmt.p2) : `picked ${ago(r.at)}`)));
    };
    recentBox.replaceChildren(h("div", { class: "ex-recent" }, list.map(row)),
      list.length < 10 ? h("div", { class: "ex-slots" }, list.length ? `${10 - list.length} more picks are kept here, in this browser only.` : "Nothing looked up yet in this browser. Up to 10 picks are kept here.") : null);
  }
  drawRecent();
  const listChips = h("div", { class: "ex-listchips" }, h("div", { class: "section-l" }, "Or open one from the fund list"),
    h("div", { class: "chips" }, ((EX.data && EX.data.funds) || []).map((f) => h("button", { class: "chip", type: "button", title: f.short_name, onclick: () => pick({ isin: f.isin, name: f.short_name, type: f.wrapper || "ETF" }) }, f.code))));
  body.append(h("div", { class: "grid" },
    card({ n: 1, code: "FIND", title: "Look up any share, ETF or ETC", span: 8, cls: "ex-find", body: [instrumentPicker({ placeholder: "Name, ticker, ISIN or WKN, e.g. Ferrari, NVIDIA, IE00B4ND3602", onPick: pick }), result, listChips],
      foot: "Search and prices: Lang & Schwarz, by name or ISIN only. Nothing about your holdings is sent." }),
    card({ n: 2, code: "LAST", title: "Recently looked up", span: 4, body: recentBox,
      foot: "The last 10, kept in this browser only. Prices update while Lang & Schwarz streams." })),
  h("div", { class: "grid" }, card({ n: 3, code: "NOTE", title: "What this covers", span: 12,
    body: h("p", { class: "lede" }, "Anything Lang & Schwarz quotes. Instruments outside the fund list have no fund facts: check the fee in the issuer's KID. A single share is one company."),
    foot: "Facts, not advice. Past returns do not predict future ones." })));
}
function exLookResult(x, v) {
  const s = v.vs || {}, why = s.why_na || {};
  const tile = (l, val, reason, det) => stat(l, val == null ? exNa(reason, "n/a") : val, val == null ? reason : det);
  return [h("div", { class: "section-l" }, `${x.name} · vs your portfolio`),
    h("div", { class: "stats four" },
      tile("Correlation 1Y", s.corr_1y == null ? null : fmt.n2.format(s.corr_1y), why.corr_1y, `${s.corr_n || 0} common days`),
      tile("Δ 1 year", s.d_1y == null ? null : exTone(s.d_1y, `${exPP(s.d_1y * 100)} pp`), why.d_1y, "it minus your portfolio"),
      tile("Δ 3 years, a year", s.d_3y_pa == null ? null : exTone(s.d_3y_pa, `${exPP(s.d_3y_pa * 100)} pp`), why.d_3y_pa, "difference of yearly rates"),
      tile("Overlap", s.overlap_pct == null ? null : `${fmt.n1.format(s.overlap_pct)}%`, why.overlap_pct, "with your holdings")),
    h("p", { class: "ex-dtext" }, h("b", {}, `Tax · ${v.tax.label}: `), v.tax.text),
    h("p", { class: "note" }, `Prices from ${v.data_from ? month(v.data_from) : "—"} to ${v.as_of ? day(v.as_of) : "—"}, L&S closes, prices only. ${v.in_catalogue ? "In the fund list: the card has its fund facts." : "Not in the fund list: no fund facts."}`)];
}
