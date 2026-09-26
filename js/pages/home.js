"use strict";
/* Overview (F1 · HOME), FINAL_DESIGN.md §8.1: your real money on one screen (value, today, what moved it), the
   markets, today's briefing and headlines, then two paper side-panels that are never added to your totals: the
   Trading Lab and the switch tracker. Every figure comes from the server (portfolio, lab and switch APIs); this
   file only lays it out. Panels in a row end together: list panels grow one item at a time until the row is level
   (hmBalance), so no panel ends with a blank band. */

const HM = { pos: [], k: null, chart: null, series: null, yline: null, range: "1d", markets: new Map(), timers: [], grids: [], onResize: null, els: {} };

/* ---------------------------------------------------------------- small helpers */
const hmWeekday = (s) => { if (!s) return "—"; const d = new Date(`${s.slice(0, 10)}T12:00:00Z`); return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()]} ${dayShort(s)}`; };
const hmHM = (iso) => new Date(iso).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
const hmToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
const hmWhen = (iso) => { const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date(iso)); return d === hmToday() ? hmHM(iso) : dayShort(d); };
/* a time of day with its date whenever it is not today (Rome): "23:22", "24 Sep 19:01" */
const hmAt = (iso) => { const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date(iso)); return d === hmToday() ? hmHM(iso) : `${dayShort(d)} ${hmHM(iso)}`; };
/* the headline search's state in reader terms (news.providers_status: paused_until only while a pause lasts, problem =
   the failure in plain words); the provider's raw answer stays in the tooltip */
function hmNewsState(g, cbShown) {
  if (!g || g.status !== "failing") return null;
  const why = g.problem || "the news source did not answer";
  const text = g.paused_until ? `Headline search paused until ${hmAt(g.paused_until)}: ${why}.` : `Headline search failed${g.last_problem ? ` at ${hmAt(g.last_problem)}` : ""}: ${why}; it retries on the next refresh.`;
  return { paused: !!g.paused_until, text: `${text}${cbShown ? " Central-bank news is shown meanwhile." : ""}`, tip: g.reason ? `GDELT's answer: ${g.reason}` : null };
}
const hmSigned = (x, f) => h("span", { class: tone(x) }, h("span", { class: "dir" }, arrow(x)), sign(x, f));
const hmMove = (eur, pct) => h("span", { class: `hm-move ${tone(pct != null ? pct : eur)}` }, `${arrow(pct != null ? pct : eur)} `, eur != null ? sign(eur, fmt.eur) : null, eur != null && pct != null ? " · " : null, pct != null ? sign(pct, fmt.p2) : null);
const hmNa = (why) => h("span", { class: "muted", "data-tip": why, tabindex: "0" }, "n/a");
const hmSlot = (px) => h("div", { class: "hm-slot" }, skeleton(px));
const hmFail = (el, what, e) => el.replaceChildren(empty(`${what} could not load: ${e.message}`));
function hmTimer(fn, ms) { const t = setInterval(fn, ms); HM.timers.push(t); return t; }
function hmKv(rows) { return h("dl", { class: "kv hm-kv" }, rows.filter(Boolean).map(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])); }

/* ---------------------------------------------------------------- row balance
   A list panel registers flex = {n0, min, max, render(n)}. hmBalance adds one item at a time to any panel that ends
   with a band over 30 px, and takes it back if that made the whole row taller; then, if a band is still left, the
   panel that sets the row's height gives items back (never below min) while that makes the largest band smaller.
   Phones stack panels: nothing to level. */
function hmFlex(cardEl, n0, max, render, min = 1) {
  const f = { n0: Math.min(n0, max), min: Math.min(min, n0, max), n: 0, max, done: false, render: (n) => { f.n = n; render(n); } };
  cardEl._flex = f;
  f.render(f.n0);
  return f;
}
function hmGap(cardEl) {
  const b = cardEl.querySelector(":scope > .card-b");
  if (!b) return 0;
  const last = [...b.children].filter((x) => x.offsetParent !== null).pop();
  if (!last) return 0;
  return b.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom - parseFloat(getComputedStyle(b).paddingBottom || "0");
}
function hmBalance(grid, reset = false) {
  if (!grid || !grid.isConnected) return;
  const cards = [...grid.children].filter((c) => c._flex);
  if (reset) cards.forEach((c) => { c._flex.done = false; c._flex.render(c._flex.n0); });
  if (innerWidth <= 760) return;
  for (let pass = 0; pass < 80; pass++) {
    let grew = false;
    for (const c of cards) {
      const f = c._flex;
      if (f.done || f.n >= f.max || hmGap(c) < 30) continue;
      const before = grid.getBoundingClientRect().height;
      f.render(f.n + 1);
      if (grid.getBoundingClientRect().height > before + 1) { f.render(f.n - 1); f.done = true; } else grew = true;
    }
    if (!grew) break;
  }
  const worst = () => Math.max(0, ...[...grid.children].map(hmGap));
  for (let pass = 0; pass < 40 && worst() >= 30; pass++) {
    let shrunk = false;
    for (const c of cards) {
      const f = c._flex, w0 = worst();
      if (f.n <= f.min || hmGap(c) > 1 || w0 < 30) continue;                 // only a panel that sets the row height
      f.render(f.n - 1);
      if (worst() < w0) shrunk = true; else f.render(f.n + 1);
    }
    if (!shrunk) break;
  }
}
/* level a row once every panel in it has drawn (and again when the web fonts land) */
function hmLevel(grid, promises) {
  HM.grids.push(grid);
  Promise.allSettled(promises).then(() => { hmBalance(grid, true); if (document.fonts) document.fonts.ready.then(() => hmBalance(grid, true)); });
}

/* ---------------------------------------------------------------- the page */
Pages.home = {
  title: "Overview",
  async render(el) {
    Pages.home.leave();
    const t = guard("home");
    const hero = { value: h("span", {}, "…"), sec: h("span", {}, "…"), today: h("span", {}, "…"), todayD: h("span", {}, "…"), gain: h("span", {}, "…"), gainD: h("span", {}, "…") };
    HM.els = hero;
    const small = h("span", {}, "Trade Republic");
    const kpiBox = h("div", {}, skeleton(118));
    el.append(pageHead(["Overview", small], "Your real money today, the markets and the day's news, then the two paper exercises. Facts and arithmetic, not advice.",
      h("a", { class: "btn", href: "#/portfolio/impt" }, icon("upload", 14), "Import TR CSV")), kpiBox);

    const row1 = h("div", { class: "grid" }), row2 = h("div", { class: "grid" }), row3 = h("div", { class: "grid" }), row4 = h("div", { class: "grid" });
    el.append(row1, row2, row3, row4);

    const P = {
      ov: api("/api/portfolio/overview"),
      ret: cached("pf-returns:", () => api("/api/portfolio/returns"), 300_000).catch(() => null),
      inbox: api("/api/inbox").catch(() => []),
      rules: api("/api/rules").catch(() => ({ rules: [] })),
      settings: api("/api/settings").catch(() => ({})),
      lab: api("/api/lab/summary").catch((e) => ({ error: e.message })),
    };

    /* KPI strip: hero value · today · gain since bought · if sold today · last 12 months · alerts */
    P.ov.then(async (o) => {
      if (!t()) return;
      if (!o.kpi || !(o.positions || []).length) {
        kpiBox.replaceChildren(empty("No holdings yet. Import your Trade Republic CSV or type your holdings in Portfolio → Import.", h("a", { class: "btn primary", href: "#/portfolio/impt" }, "Import or enter holdings")));
        return;
      }
      const k = HM.k = o.kpi;
      HM.pos = o.positions || [];
      const n = HM.pos.length;
      small.textContent = `Trade Republic · ${n} ${n === 1 ? "fund" : "holdings"} + cash`;
      Live.want("page", HM.pos.map((p) => p.isin));
      hero.value.replaceChildren(...[].concat(eurFig(k.total)));
      const ret = await P.ret, box = await P.inbox, rl = await P.rules;
      if (!t()) return;
      const you = ret && (ret.rows || []).find((r) => r.key === "you");
      const ref = ret && (ret.rows || []).find((r) => r.key === "IE00B6R52259");
      const y1 = you && you.values ? you.values["1Y"] : null;
      const unread = box.filter((i) => !i.read).length, active = (rl.rules || []).filter((r) => r.enabled !== false).length;
      hmSetMoney();
      kpiBox.replaceWith(kpis(
        stat("Portfolio value", hero.value, ["securities ", hero.sec, ` at mid · cash ${fmt.eur.format(k.cash)}`], "", "hero"),
        stat("Today", hero.today, [hero.todayD, h("span", { class: "muted" }, ` vs L&S close of ${hmWeekday(k.prev_session)}`)], "", "major"),
        stat("Gain since you bought", hero.gain, [hero.gainD, h("span", { class: "muted" }, ` on ${fmt.eur0.format(k.cost)} paid${k.hand_entered ? " (typed by hand)" : ""}`)], "", "major"),
        stat("Cash if sold today", fmt.eur.format(k.cash_if_sold), h("span", {}, `after ${fmt.eur.format(k.tax_if_sold)} tax and ${fmt.eur0.format(k.sale_fees)} fee, `,
          k.cash_if_sold_basis === "bid" ? "at bid" : h("span", { class: "hm-dotted", tabindex: "0", "data-tip": k.bid_basis || "at mid minus an assumed 0.05% half-spread" }, "at mid − 0.05%"))),
        stat("Last 12 months", y1 == null ? hmNa("Fewer than 12 months of L&S prices for what you hold") : h("span", { class: tone(y1) }, sign(y1, fmt.p1)),
          [ref && ref.values["1Y"] != null ? `${ref.ticker || ref.label} ${sign(ref.values["1Y"], fmt.p1)} · ` : "", h("span", { class: "muted", "data-tip": "Today's holdings valued at L&S prices a year ago and today; prices only, no dividends" }, "price only")]),
        stat("Alerts", String(box.length), [`${unread} new · ${active} ${active === 1 ? "rule" : "rules"}`])));
      statusSource(`Positions: ${o.positions_source || "not set"} · quotes L&S ${o.quotes && o.quotes.mode === "stream" ? "live" : o.quotes && o.quotes.last_quote ? `last ${o.quotes.last_quote.slice(11, 16)}` : ""}`);
    }).catch((e) => { if (t()) kpiBox.replaceChildren(empty(`Your holdings could not load: ${e.message}`)); });

    const r1 = [hmValue(row1, P.ov, t), hmMovers(row1, t)];
    hmLevel(row1, r1);
    hmLevel(row2, [hmMarkets(row2, t), hmBrief(row2, P, t)]);
    hmLevel(row3, [hmNews(row3, t), hmLab(row3, P.lab, t)]);
    hmLevel(row4, [hmSwitch(row4, t), hmWhere(row4, t)]);

    let rz = 0;
    HM.onResize = () => { clearTimeout(rz); rz = setTimeout(() => HM.grids.forEach((g) => hmBalance(g, true)), 250); };
    addEventListener("resize", HM.onResize);
  },
  onQuote(key, q, prev) {
    if (key.startsWith("m:")) { hmMarketQuote(key.slice(2), q, prev); return; }
    if (!HM.k || !HM.pos.some((p) => p.isin === key)) return;
    const dir = Live.dir(q, prev);
    const m = hmSetMoney(dir);
    if (HM.series && HM.range === "1d") HM.series.update({ time: exchangeTime(Math.floor(q.at / 60) * 60), value: m.total });
  },
  leave() {
    HM.timers.forEach(clearInterval);
    HM.timers = [];
    HM.grids = [];
    if (HM.onResize) removeEventListener("resize", HM.onResize);
    HM.onResize = null;
    if (HM.chart) dropChart(HM.chart);
    HM.chart = HM.series = HM.yline = null;
    HM.markets = new Map();
    HM.k = null;
  },
};

/* today's figures from the last known quotes (live when the stream runs) */
function hmSetMoney(dir) {
  const k = HM.k;
  let inv = 0, prev = 0;
  for (const p of HM.pos) { const px = Live.price(p.isin, p.mid); inv += px * p.shares; prev += (p.prev_close || p.mid) * p.shares; }
  const m = { total: inv + k.cash, day: inv - prev, dayPct: prev ? inv / prev - 1 : null, gain: inv - k.cost, gainPct: k.cost ? inv / k.cost - 1 : null };
  const e = HM.els;
  e.value.replaceChildren(...[].concat(eurFig(m.total)));
  if (dir) flash(e.value, dir);
  e.sec.textContent = fmt.eur.format(inv);
  e.today.replaceChildren(hmSigned(m.day, fmt.eur));
  e.todayD.textContent = sign(m.dayPct, fmt.p2);
  e.gain.replaceChildren(hmSigned(m.gain, fmt.eur));
  e.gainD.textContent = sign(m.gainPct, fmt.p2);                  // the same precision as Portfolio's KPI strip
  if (HM.els.valChange && HM.range === "1d") HM.els.valChange.replaceChildren("Today ", hmMove(m.day, m.dayPct));
  return m;
}

/* ================================================================ 1 VAL · Value today */
function hmValue(row, pOv, t) {
  const change = h("span", { class: "hm-change" });
  HM.els.valChange = change;
  const leg = h("div", { class: "hm-legend" });
  const box = h("div", { class: "chart fill hm-chart" });
  const foot = h("span", {}, "…");
  const tools = h("div", { class: "hm-tools" },
    seg([["1d", "1D"], ["1m", "1M"], ["6m", "6M"], ["ytd", "YTD"], ["1y", "1Y"], ["5y", "5Y"], ["max", "Max"]], "1d", (r) => draw(r), "Period"), change);
  row.append(card({ n: 1, code: "VAL", title: "Value today", span: 8, tools, body: [leg, box], foot, more: link("PF →", "#/portfolio/summary") }));

  async function draw(r) {
    const ok = guard("home-val");
    HM.range = r;
    let o;
    try { o = await pOv; } catch (e) { if (ok()) hmFail(box, "The value chart", e); return; }
    if (!o.kpi || !(o.positions || []).length) { if (ok()) box.replaceChildren(empty("No holdings yet: the chart starts with your first holding.")); return; }
    const k = o.kpi;
    let pts = null, base = null, intraday = false, note = "";
    try {
      if (r === "1d") {
        const d = await api("/api/portfolio/intraday");
        if (d.points.length > 1) { pts = d.points.map(([x, v]) => ({ time: x, value: Math.round((v + k.cash) * 100) / 100 })); base = d.prev_close + k.cash; intraday = true; }
        else note = "No quotes yet today: the last month is shown. ";
      }
      if (!pts) {
        const s = await cached(`hm-series:${r === "1d" ? "1m" : r}`, () => api(`/api/portfolio/series?range=${r === "1d" ? "1m" : r}`), 300_000);
        pts = s.dates.map((x, i) => ({ time: x, value: s.total[i] }));
        base = k.cost + k.cash;
        HM.els.seriesChange = s.change;
      }
    } catch (e) { if (ok()) hmFail(box, "The value chart", e); return; }
    if (!ok() || !pts.length) return;
    const c = makeChart(box, { time: intraday });
    if (!c) return;
    if (HM.chart && HM.chart !== c) dropChart(HM.chart);
    HM.chart = c;
    HM.series = c.addAreaSeries(SERIES.you());
    HM.series.setData(pts);
    HM.yline = c.addLineSeries(SERIES.bench(1));
    HM.yline.setData(pts.map((p) => ({ time: p.time, value: base })));
    c.timeScale().fitContent();
    const last = pts[pts.length - 1].value;
    const baseLabel = intraday ? "Yesterday's L&S close" : "What you paid, plus cash";
    crosshairTip(c, box, [{ series: HM.series, label: "Your holdings + cash", c: "var(--s1)", fmt: (v) => fmt.eur.format(v) }, { series: HM.yline, label: baseLabel, c: "var(--bench-1)", fmt: (v) => fmt.eur.format(v) }]);
    leg.replaceChildren(legend([{ c: "var(--s1)", label: "Your holdings + cash", value: fmt.eur.format(last), style: "area" }, { c: "var(--bench-1)", label: baseLabel, value: fmt.eur.format(base), style: "dash" }]));
    if (intraday) hmSetMoney();
    else {
      const ch = HM.els.seriesChange || {};
      change.replaceChildren(`${note ? "Last month" : r === "max" ? `Since ${day(pts[0].time)}` : { "1m": "1 month", "6m": "6 months", ytd: "Year to date", "1y": "1 year", "5y": "5 years" }[r]} `, hmMove(ch.eur, ch.pct));
    }
    foot.replaceChildren(intraday
      ? "Today, exchange time (Berlin): L&S mid quotes, one point a minute, plus cash. The dashed line is yesterday's L&S session end (≈23:00)."
      : `${note}Today's holdings valued at past L&S closes, plus today's cash: not your own history (that needs the Trade Republic CSV). The dashed line is what you paid, plus cash. Prices only, no dividends; past returns do not predict future ones.`);
  }
  return draw("1d");
}

/* ================================================================ 2 MOVE · What moved your money today */
function hmMovers(row, t) {
  const badgeEl = h("span");
  const body = h("div", { class: "hm-body" }, hmSlot(260));
  const foot = h("span", {}, "Company quotes: Lang & Schwarz. Weights: the issuer's holdings file.");
  const cardEl = card({ n: 2, code: "MOVE", title: "What moved your money today", span: 4, badges: badgeEl, body, foot, more: link("All →", "#/portfolio/hold") });
  row.append(cardEl);
  let first = true;
  const load = async () => {
    let d;
    try { d = await api("/api/portfolio/movers?limit=14"); } catch (e) { if (t()) hmFail(body, "Today's movers", e); return; }
    if (!t()) return;
    draw(d);
    if (!first) hmBalance(row, true);
    first = false;
  };
  function fundLine(d) {
    const f = d.total || {}, fund = (d.funds || [])[0] || {};
    return h("div", { class: "hm-fund" }, h("div", { class: "section-l" }, (d.funds || []).length > 1 ? "Your funds' own move today" : "The fund's own move today"),
      h("div", { class: "hm-fig" }, h("b", { class: tone(f.eur) }, h("span", { class: "dir" }, arrow(f.eur)), sign(f.eur, fmt.eur)), " ", h("span", { class: tone(f.pct) }, sign(f.pct, fmt.p2)),
        h("small", { class: "muted" }, ` vs L&S close of ${hmWeekday(fund.prev_session)}`)));
  }
  function draw(d) {
    const fund = (d.funds || []).find((f) => f.has_file) || (d.funds || [])[0] || {};
    const asof = fund.weights_as_of || d.largest_as_of;
    const live = d.status === "live" || d.status === "warming" || (d.status === "closed" && (d.rows || []).length);
    badgeEl.replaceChildren(d.coverage ? badge(`${fmt.n1.format(d.coverage.weight_pct)}% LIVE`, "live") : badge(d.status === "closed" ? "CLOSED" : "PAUSED", "na"));
    if (live) {
      const max = Math.max(...d.rows.map((r) => Math.abs(r.eur || 0)), 0.01);
      const head = [d.status_text ? h("p", { class: "callout" }, prose(d.status_text)) : null, fundLine(d)];
      const tbl = h("div");
      hmFlex(cardEl, 8, d.rows.length, (n) => tbl.replaceChildren(table({ cls: "compact hm-mini", rowCls: (r) => (r.__rest ? "ref" : r.eur == null ? "out" : ""),
        cols: [
          { key: "name", label: "Company", fmt: (r) => h("span", { class: "nm hm-trunc", title: r.name }, r.name.replace(/ (Inc|Corp|Co Ltd|Ltd|PLC|AG|NV|SA)$/i, "")) },
          { key: "ret_pct", label: "Today", num: true, fmt: (r) => (r.__rest ? "" : r.ret_pct == null ? hmNa("No L&S quote today") : h("span", { class: tone(r.ret_pct) }, sign(r.ret_pct, fmt.p2))) },
          { key: "eur", label: "€", num: true, fmt: (r) => (r.eur == null ? "" : h("span", { class: tone(r.eur) }, sign(r.eur, fmt.eur))) },
          { key: "bar", label: "", w: "56px", fmt: (r) => (r.eur == null || r.__rest ? "" : dbar(r.eur, max)) }],
        rows: [...d.rows.slice(0, n), { __rest: true, name: "Rest of the fund, not measured live", eur: d.rest ? d.rest.eur : null }] })), 4);
      body.replaceChildren(...head.filter(Boolean), tbl);
      const cov = d.coverage || {};
      foot.textContent = `Measured live: ${fmt.n1.format(cov.weight_pct || 0)}% of the fund. Weights from ${fund.weights_source || "the issuer"}'s file of ${day(asof)}. The rest is the fund's own L&S move minus the measured part.`;
    } else {
      const big = d.largest || [];
      const tbl = h("div");
      hmFlex(cardEl, 6, big.length, (n) => tbl.replaceChildren(table({ cls: "compact hm-mini", caption: "Largest companies in your fund, by your euros",
        cols: [
          { key: "name", label: "Largest companies", fmt: (r) => h("span", { class: "nm hm-trunc", title: r.name }, r.name.replace(/ (Inc|Corp|Co Ltd|Ltd|PLC|AG|NV|SA)$/i, ""), r.classes > 1 ? h("span", { class: "sub" }, `${r.classes} lines`) : null) },
          { key: "weight_pct", label: "Weight", num: true, fmt: (r) => `${fmt.n2.format(r.weight_pct)}%` },
          { key: "eur", label: "Your €", num: true, fmt: (r) => fmt.eur0.format(r.eur) },
          { key: "today", label: "Today", num: true, fmt: () => h("span", { class: "muted" }, d.status === "closed" ? "closed" : "paused") }],
        rows: big.slice(0, n) })), 4);
      body.replaceChildren(h("p", { class: "callout" }, prose(d.status_text || "Company quotes are not being measured now.")), fundLine(d), tbl);
      foot.textContent = `Weights from ${fund.weights_source || "the issuer"}'s holdings file of ${day(asof)}, share classes merged; your € = today's value × weight. The fund's move is its own L&S quote against the previous session end (≈23:00).`;
    }
  }
  const p = load();
  hmTimer(() => { if (document.visibilityState === "visible" && t()) load(); }, 20_000);   // renews the movers lease (PORTFOLIO_SPEC §12.2)
  return p;
}

/* ================================================================ 3 MKTS · Markets */
const HM_MKTS = [
  ["dax", "DAX", "L&S indication"], ["estx50_etf", "EURO STOXX 50", "ETF, €"], ["ftsemib_etf", "FTSE MIB", "ETF, €"], ["sp500_etf", "S&P 500", "ETF, €"],
  ["ndx_etf", "Nasdaq-100", "ETF, €"], ["eurusd", "EUR/USD", "$ per €"], ["gold", "Gold", "$ an ounce"], ["brent", "Brent crude", "$ a barrel"], ["btc", "Bitcoin", "$"],
  ["dow_etf", "Dow Jones", "ETF, €"], ["swda_etf", "MSCI World", "SWDA, €"], ["silver", "Silver", "$ an ounce"], ["wti", "WTI crude", "$ a barrel"], ["eth", "Ether", "$"],
];
const hmPrice = (m, p) => { const dp = m.key === "eurusd" ? 4 : p >= 1000 ? 0 : 2; return `${m.unit === "$" ? "$" : m.unit === "€" ? "€" : ""}${new Intl.NumberFormat(LOCALE, { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(p)}`; };
const hmDay = (m, p) => { const c = p && m.prev_close ? p / m.prev_close - 1 : null; return h("span", { class: tone(c) || "flat" }, c == null ? "—" : `${arrow(c)} ${sign(c, fmt.p2)}`); };
function hmMarkets(row, t) {
  const body = h("div", { class: "hm-body" }, hmSlot(250));
  const cardEl = card({ n: 3, code: "MKTS", title: "Markets", span: 6, sub: "day and one month", body, flush: true,
    foot: "Lang & Schwarz indications, live while the stream runs. Rows marked ETF are the euro price of an ETF on that index, not the index level. 1M: daily L&S closes. Crypto trades all week; its day is against L&S's previous-day reference." });
  row.append(cardEl);
  return cached("markets", () => api("/api/markets"), 60_000).then((all) => {
    if (!t()) return;
    const byKey = new Map(all.map((m) => [m.key, m]));
    const rows = HM_MKTS.filter(([k]) => byKey.has(k)).map(([k, name, sub]) => ({ ...byKey.get(k), label: name, what: sub }));
    const spark = new Map();
    const render = (n) => {
      HM.markets = new Map();
      body.replaceChildren(table({ cls: "compact hm-mkts", caption: "Markets",
        cols: [
          { key: "label", label: "Market", fmt: (m) => h("span", { title: m.note || "" }, h("span", { class: "nm" }, m.label), h("span", { class: "sub" }, m.what)) },
          { key: "price", label: "Price", num: true, fmt: (m) => { const p = Live.price(`m:${m.key}`, m.price); const b = h("b", { class: "flashable hm-p" }, p ? hmPrice(m, p) : "—"); HM.markets.set(m.key, { m, p: b }); return b; } },
          { key: "day", label: "Day", num: true, fmt: (m) => { const s = hmDay(m, Live.price(`m:${m.key}`, m.price)); HM.markets.get(m.key).d = s; return s; } },
          { key: "m1", label: "1M", num: true, w: "104px", fmt: (m) => { const s = h("span", { class: "hm-spark", "data-k": m.key }); hmSpark(s, spark.get(m.key)); return s; } }],
        rows: rows.slice(0, n) }));
    };
    hmFlex(cardEl, 9, rows.length, render, 6);
    /* one month of closes, once: the server keeps them 12 hours and spaces any L&S request */
    cached("markets-month", () => api(`/api/markets/month?keys=${rows.map((m) => m.key).join(",")}`), 30 * 60_000).then((mm) => {
      if (!t()) return;
      Object.entries(mm.items || {}).forEach(([k, v]) => spark.set(k, v));
      body.querySelectorAll(".hm-spark").forEach((s) => hmSpark(s, spark.get(s.dataset.k)));
    }).catch(() => body.querySelectorAll(".hm-spark").forEach((s) => s.replaceChildren(h("span", { class: "muted" }, "n/a"))));
  }).catch((e) => { if (t()) hmFail(body, "Markets", e); });
}
function hmSpark(el, v) {
  if (!v) { el.replaceChildren(h("span", { class: "muted" }, "…")); return; }
  const p = (v.prices || []).filter(Number.isFinite);
  if (p.length < 2) { el.replaceChildren(h("span", { class: "muted" }, "n/a")); return; }
  const c = p[p.length - 1] / p[0] - 1;
  el.setAttribute("data-tip", `1 month: ${sign(c, fmt.p1)} (${day(v.dates[0])} to ${day(v.dates[v.dates.length - 1])})`);
  el.replaceChildren(sparkSVG(p, { w: 64, hgt: 18 }), h("span", { class: `hm-sp ${tone(c)}` }, sign(c, fmt.p0)));
}
function hmMarketQuote(k, q, prev) {
  const r = HM.markets.get(k);
  if (!r) return;
  setText(r.p, hmPrice(r.m, q.mid), Live.dir(q, prev));
  if (r.d) { const n = hmDay(r.m, q.mid); r.d.className = n.className; r.d.textContent = n.textContent; }
}

/* ================================================================ 4 BRIEF · Today's briefing */
function hmBrief(row, P, t) {
  const body = h("div", { class: "hm-body" }, hmSlot(250));
  const foot = h("span", {}, "…");
  const cardEl = card({ n: 4, code: "BRIEF", title: "Today's briefing", span: 6, body, foot, more: link("ALRT →", "#/alerts/inbox") });
  row.append(cardEl);
  return Promise.all([api("/api/briefing"), P.settings, P.inbox, P.lab]).then(([b, s, box, lab]) => {
    if (!t()) return;
    const now = hmHM(b.generated);
    const L = (tm, ty, cls, ...tx) => h("div", { class: "log" }, h("span", { class: "tm" }, tm), h("span", { class: `ty ${cls || ""}` }, ty), h("span", { class: "tx" }, tx));
    const p = b.portfolio || {};
    const lines = [];
    lines.push(L(now, "PF", "sys", h("b", {}, fmt.eur.format(p.total)), " in the portfolio; today ", hmMove(p.day_change, p.day_change_pct), "; since you bought ", hmMove(p.gain, p.gain_pct), "."));
    const mk = (b.markets || []).filter((m) => m.price && m.prev_close && m.group !== "index-proxy" && m.group !== "rates")
      .map((m) => ({ m, c: m.price / m.prev_close - 1 })).sort((a, z) => Math.abs(z.c) - Math.abs(a.c)).slice(0, 3);
    if (mk.length) lines.push(L(now, "MKTS", "", "Largest moves on the board: ", mk.map(({ m, c }, i) => [i ? ", " : "", m.name.replace(/ \(.*\)$/, ""), " ", h("span", { class: tone(c) }, `${arrow(c)} ${sign(c, fmt.p2)}`)]), "."));
    const rulesN = (b.rules || []).length;
    if (rulesN) b.rules.forEach((r) => lines.push(L(now, "RULE", "", prose(`${r.description}: ${r.state.measured || "met"}.`))));
    else lines.push(L(now, "RULE", "", "None of your price rules was met today.", h("span", { class: "muted" }, " Rules live in Alerts.")));
    const labLine = b.model || (lab && lab.state === "not_started" ? "Trading Lab (paper): not started yet; it registers itself on its first run." : lab && lab.error ? `Trading Lab (paper): unavailable (${lab.error}).` : null);
    if (labLine) lines.push(L(now, "LAB", "", prose(labLine)));
    const ns = hmNewsState(((b.news_status || {}).gdelt) || {}, false);
    lines.push(L(now, "NEWS", "", (b.headlines || []).length ? `${b.headlines.length} headlines about what you hold (below, panel 5).`
      : ns ? h("span", { "data-tip": ns.tip }, ns.text) : "No headlines about what you hold in the last 36 hours."));
    const cbs = (b.central_banks || []).map((c) => L(hmWhen(c.published), (c.provider || "CB").toUpperCase().slice(0, 4), "", h("a", { href: c.url, target: "_blank", rel: "noopener" }, c.title)));
    const pos = (p.positions || []).length > 1 ? p.positions.map((x) => L(now, "FUND", "", `${x.name}: `, h("span", { class: tone(x.day_change_pct) }, sign(x.day_change_pct, fmt.p2)), " today.")) : [];
    const all = [...lines, ...pos, ...cbs];
    const log = h("div", { class: "journal hm-log" });
    hmFlex(cardEl, Math.min(all.length, lines.length + pos.length + 2), all.length, (n) => log.replaceChildren(h("div", { class: "day" }, `${hmWeekday(hmToday())} · composed ${now}`), ...all.slice(0, n)), lines.length);
    body.replaceChildren(log);
    const lastB = box.find((i) => i.kind === "briefing");
    foot.replaceChildren(`Composed now from live data, as the daily briefing is (${s.briefing_time || "18:00"}${s.briefing_weekdays_only ? ", weekdays" : ""}); nothing is sent. Last briefing: ${lastB ? `${day(lastB.at)} ${hmHM(lastB.at)}` : "none yet"}. Facts only.`);
  }).catch((e) => { if (t()) hmFail(body, "The briefing", e); });
}

/* ================================================================ 5 NEWS · Headlines for what you own */
function hmNews(row, t) {
  const body = h("div", { class: "hm-body" }, hmSlot(300));
  const cardEl = card({ n: 5, code: "NEWS", title: "Headlines for what you own", span: 8, body,
    foot: "Headlines: the GDELT Project (searched with the names of what you hold, never amounts) and the ECB, Fed and Bank of England feeds. SV Terminal does not interpret the news or suggest trades." });
  row.append(cardEl);
  return cached("news-mine", () => api("/api/news?scope=mine"), 15 * 60_000).then((n) => {
    if (!t()) return;
    const items = dedupeNews([...(n.items || []), ...(n.central_banks || []).map((x) => ({ ...x, cb: true }))]);
    const ns = hmNewsState(((n.status || {}).gdelt) || {}, !(n.items || []).length && (n.central_banks || []).length > 0);
    const head = ns ? h("p", { class: "hm-status", "data-tip": ns.tip }, statusDot("warn", ns.paused ? "SEARCH PAUSED" : "SEARCH FAILED"), " ", ns.text) : null;
    if (!items.length) { body.replaceChildren(...[head, empty(ns ? "No headlines to show until the search answers again." : "No headlines about what you hold in the last 48 hours, and no central-bank news in the last five days.")].filter(Boolean)); return; }
    const list = h("div", { class: "hm-news" });
    hmFlex(cardEl, 5, Math.min(items.length, 14), (k) => list.replaceChildren(...items.slice(0, k).map((x) => h("div", { class: "news-item" },
      x.cb ? [badge("Central bank", "ref"), " "] : null, h("a", { href: x.url, target: "_blank", rel: "noopener" }, x.title),
      h("small", {}, `${x.source} · ${ago(x.published)}${x.query ? ` · about “${x.query}”` : ""}`)))), 3);
    body.replaceChildren(...[head, list].filter(Boolean));
  }).catch((e) => { if (t()) hmFail(body, "Headlines", e); });
}

/* ================================================================ 6 LAB · Trading Lab (paper): never added to your totals */
function hmLab(row, pLab, t) {
  const body = h("div", { class: "hm-body" }, hmSlot(260));
  const foot = h("span", {}, "Paper money only: no orders, no credentials, no link to Trade Republic. Never added to your totals.");
  const cardEl = card({ n: 6, code: "LAB", title: "Trading Lab", span: 4, cls: "hm-lab", badges: badge("PAPER", "paper"), body, foot, more: link("F4 →", "#/lab/overview") });
  row.append(cardEl);
  return pLab.then((s) => {
    if (!t()) return;
    if (s.error) { body.replaceChildren(empty(`The lab's summary could not load: ${s.error}`)); return; }
    if (s.state === "not_started" || s.state === "building") {
      const m = s.migration || {}, kvNs = h("div");
      const facts = [["Paper book", "€10,000 per strategy, pretend money"], ["Universe", "108 shares: DAX 40, FTSE MIB, EURO STOXX 50"],
        ["It settles", "once per L&S session, after 23:00 Berlin"], ["Scorecard", "10 criteria fixed at registration"], ["Real orders", "none, ever"],
        ["Costs", "€1 an order, 0.05% half-spread, IT/FR/ES transaction tax"], ["Tape", "recorded at 23:10 Berlin, one request every 1.5 s"],
        ["L&S requests", "at most 400 a day for the lab"], ["It runs", "only while SV Terminal is open"]];
      body.replaceChildren(
        h("div", { class: "hm-fig" }, h("b", {}, s.state === "building" ? "Setting up" : "Not started"),
          h("small", { class: "muted" }, ` · step ${m.step || 0} of ${m.steps || 9}${m.label ? `: ${m.label}` : ""}`)),
        progress((m.step || 0) / (m.steps || 9), { kind: m.status === "failed" ? "bad" : "" }),
        h("p", { class: "lede" }, prose(s.reason || "The lab has not been registered yet.")),
        ...(m.error ? [h("p", { class: "error" }, prose(m.error))] : []), kvNs);
      hmFlex(cardEl, 5, facts.length, (n) => kvNs.replaceChildren(hmKv(facts.slice(0, n))), 3);
      return;
    }
    if (s.state === "protocol_mismatch") {
      body.replaceChildren(h("p", { class: "callout" }, "The lab's rules in the code no longer match the registered season, so it processes nothing until a new season is registered."),
        hmKv([["Season", s.season || "—"], ["Registered", day((s.registered_at || "").slice(0, 10))], ["Last session", s.as_of_session ? day(s.as_of_session) : "—"]]));
      return;
    }
    const main = s.main || {}, ch = s.champion || {}, sc = s.scorecard || {}, lg = s.league || {}, lr = s.last_run || {}, nx = s.next || {}, dt = s.data || {};
    /* before the first live session: every book holds its €10,000 of paper and decides at that session end */
    const ne = s.next_events || {}, firstEv = ne.first_live ? (ne.events || []).find((e) => e.kind === "decide") : null;
    const rows = [
      ["Last session", h("span", {}, s.as_of_session ? day(s.as_of_session) : "—", h("small", { class: "muted" }, lr.mode ? ` · ${({ prelive: "before live start", catchup: "catch-up" })[lr.mode] || lr.mode}${lr.ok === false ? ", with problems" : ""}` : ""))],
      ["Champion", ch.id ? h("span", {}, h("b", {}, ch.id), ` ${typeof LabUI !== "undefined" ? LabUI.nm(ch.id, ch.name) : ch.name || ""}`, h("small", { class: "muted" }, ch.since ? ` chosen ${dayShort(ch.since)}` : "")) : "cash (none qualifies)"],
      ["Live fills", h("span", {}, fmt.n0.format(lg.fills_live_total || 0), h("small", { class: "muted" }, ` · ${fmt.n0.format(lg.fills_session || 0)} last session`))],
      ["Live sessions", fmt.n0.format(s.live_sessions || 0)],
      ["Next", firstEv ? `first decision ${typeof LabUI !== "undefined" ? LabUI.relIn(firstEv.at) : hmHM(firstEv.at)}` : nx.job ? `${nx.job} ${nx.at ? hmHM(nx.at) : ""}` : "—"],
      ["Tape", dt.tape_last ? `${day(dt.tape_last)}${dt.sleepy_mode ? " · insurance pass on" : ""}` : "—"],
      ["L&S requests today", dt.requests_today != null ? `${fmt.n0.format(dt.requests_today)} of ${fmt.n0.format(dt.cap || 400)}` : "—"],
      ["Next review", ch.next_review ? day(ch.next_review) : "—"],
    ];
    const kv = h("div");
    const top = [
      s.demo ? h("p", { class: "hm-status" }, badge("DEMO", "mock"), " ", s.demo_note || "Synthetic data for building the page.") : null,
      h("div", { class: "hm-lab-fig" },
        h("div", {}, h("div", { class: "hm-lab-l" }, "Main book, paper, after tax"), h("div", { class: "hm-lab-v" }, eurFig((main.after_tax || {}).equity ?? main.equity ?? (firstEv ? 10000 : undefined)))),
        h("div", { class: "hm-lab-d" }, h("span", {}, "since live ", hmSigned(main.ret_since_live, fmt.p1)), h("span", {}, "Europe ETF ", hmSigned(main.etf_since_live, fmt.p1)))),
      h("div", { class: "hm-lab-sc" }, h("span", { class: "hm-lab-l" }, prose(sc.headline || `${sc.met} of ${sc.of} criteria met.`)), progress(sc.of ? sc.met / sc.of : null, { kind: sc.met === sc.of ? "ok" : "" })),
    ].filter(Boolean);
    body.replaceChildren(...top, kv);
    hmFlex(cardEl, 5, rows.length, (n) => kv.replaceChildren(hmKv(rows.slice(0, n))), 3);
    foot.replaceChildren(`${s.live_start ? `Live ${firstEv ? "from the session end of" : "since"} ${day(s.live_start)}. ` : ""}Paper money only; never added to your totals. Meeting the criteria would not show that results continue.`);
  });
}

/* ================================================================ 7 SWCH · Switch tracker (paper arithmetic) */
function hmSwitch(row, t) {
  const body = h("div", { class: "hm-body" }, hmSlot(260));
  const foot = h("span", {}, "Paper arithmetic, not advice.");
  const cardEl = card({ n: 7, code: "SWCH", title: "Switch tracker", span: 7, body, foot, more: link("SWCH →", "#/explore/switch") });
  row.append(cardEl);
  return api("/api/switch").then((v) => {
    if (!t()) return;
    if (v.status === "none") {
      body.replaceChildren(h("p", { class: "lede" }, "If you sold everything today and bought one other fund, would you be ahead after tax, fees and spreads? The tracker follows that question from the day you start it, on paper."),
        h("p", { class: "callout" }, prose(v.why || "No tracker yet.")),
        hmKv([["Your holdings", (v.holdings || []).map((x) => `${x.code} ${fmt.n2.format(x.units)} units`).join(" · ") || "none"],
          ["Tax cost of what you hold", fmt.eur.format((v.holdings || []).reduce((a, x) => a + (x.cost || 0), 0))],
          ["Funds it would follow", v.candidates != null ? String(v.candidates) : "—"],
          ["Starting it", "START in Explore → Switch tracker"]]));
      foot.textContent = "Nothing is started from here. Paper arithmetic, not advice.";
      return;
    }
    if (v.status !== "ok") { body.replaceChildren(empty(prose(v.error || "The switch tracker is not available."))); return; }
    /* sorted by past result only when there is a result to sort by (EXPLORE_SPEC §0.1: say so, not a forecast);
       with no close yet, or every gap equal, the catalogue order */
    const all = (v.rows || []).filter((r) => r.delta != null);
    const nc = v.start.closes || 0;
    const flat = !nc || all.every((r) => Math.abs(r.delta - all[0].delta) < 0.005);
    const rows = flat ? all : [...all].sort((a, z) => z.delta - a.delta);
    const closesTxt = `${nc} ${nc === 1 ? "close" : "closes"}`;
    const order = flat
      ? (nc ? `After ${closesTxt} every gap is still the same: catalogue order. No row is advice.` : "No close since the start yet: every gap is the cost of switching today. Catalogue order; no row is advice.")
      : `Sorted by net gap since ${day(v.start.day)} (${closesTxt}): what happened, not a forecast. No row is advice.${nc < 20 ? ` After ${closesTxt} the differences are mostly day-to-day noise.` : ""}`;
    const c = v.counts || {};
    const tiles = h("div", { class: "stats four" },
      stat("Tracking since", day(v.start.day), `${v.start.closes} ${v.start.closes === 1 ? "close" : "closes"} since`),
      stat("Stay, cashed out", fmt.eur.format(v.stay.net), `market value ${fmt.eur.format(v.stay.mv)}`),
      stat("Ahead of staying", `${c.ahead} of ${c.tracked}`, "after tax, fees and spreads"),
      stat("Cost at equal returns", h("span", { class: tone(v.rebuy.timing) }, sign(v.rebuy.timing, fmt.eur)), "tax paid early + fees + spreads"));
    const stay = { __stay: true, code: (v.holdings || []).map((x) => x.code).join("+") || "Stay", name: "Stay: keep what you hold", net: v.stay.net };
    const tbl = h("div");
    hmFlex(cardEl, 5, rows.length, (n) => tbl.replaceChildren(table({ cls: "compact hm-mini", caption: flat ? "Switch paths in catalogue order, with the net gap against staying" : "Switch paths, sorted by net gap against staying",
      rowCls: (r) => (r.__stay ? "you" : r.stale ? "out" : ""),
      cols: [
        { key: "code", label: "Fund", fmt: (r) => h("span", {}, h("span", { class: "tick" }, r.code), h("span", { class: "sub" }, r.__stay ? "stay" : (r.name || "").slice(0, 34))) },
        { key: "net", label: "Cashed out", num: true, fmt: (r) => fmt.eur.format(r.net) },
        { key: "delta", label: "Net gap", num: true, fmt: (r) => (r.__stay ? h("span", { class: "muted" }, "—") : h("span", { class: tone(r.delta) }, sign(r.delta, fmt.eur))) },
        { key: "gap", label: "Gap %", num: true, hideSm: true, fmt: (r) => (r.__stay ? "" : h("span", { class: tone(r.delta_pct) }, sign(r.delta_pct, fmt.p2))) }],
      rows: [stay, ...rows.slice(0, n)] })), 3);
    body.replaceChildren(tiles, h("p", { class: "note" }, `Net gap: switch minus stay, both cashed out after tax, fees and spreads. ${order}${v.holdings_changed ? " Your holdings changed since the start: the tracker still follows the start-day snapshot." : ""}`), tbl);
    foot.replaceChildren(prose(`${v.rules_foot || ""} Paper arithmetic, not advice.`));
  }).catch((e) => { if (t()) hmFail(body, "The switch tracker", e); });
}

/* ================================================================ 8 WHERE · Where the companies are (look-through) */
const HM_REGION = {
  "North America": ["US", "CA"],
  Europe: ["GB", "CH", "DE", "FR", "NL", "IT", "ES", "SE", "DK", "NO", "FI", "BE", "IE", "AT", "PT", "PL", "CZ", "HU", "GR", "IS", "LU", "RO"],
  Japan: ["JP"],
  "Pacific, developed": ["AU", "NZ", "HK", "SG"],
  "Emerging Asia": ["CN", "TW", "KR", "IN", "ID", "TH", "MY", "PH"],
  "Latin America": ["BR", "MX", "CL", "CO", "PE", "AR"],
  "Middle East & Africa": ["SA", "AE", "QA", "KW", "IL", "ZA", "EG", "TR"],
};
function hmWhere(row, t) {
  const body = h("div", { class: "hm-body" }, hmSlot(260));
  const foot = h("span", {}, "…");
  const cardEl = card({ n: 8, code: "LOOK", title: "Where the companies are", span: 5, body, foot, more: link("LOOK →", "#/portfolio/xray") });
  row.append(cardEl);
  return cached("pf-xray", () => api("/api/xray"), 300_000).then((x) => {
    if (!t()) return;
    if (!x || !(x.countries || []).length) { body.replaceChildren(empty("No look-through yet: none of your funds has a holdings file.")); return; }
    const reg = {};
    for (const c of x.countries) {
      const r = Object.keys(HM_REGION).find((k) => HM_REGION[k].includes(c.iso2)) || "Other";
      reg[r] = reg[r] || { name: r, weight: 0, eur: 0 };
      reg[r].weight += c.weight;
      reg[r].eur += c.eur || 0;
    }
    const regions = Object.values(reg).sort((a, z) => z.weight - a.weight).map((r) => (r.name === "Other" ? { ...r, other: true } : r));
    const ccy = (x.currencies || []).slice(0, 4);
    const rest = Math.max(0, 100 - ccy.reduce((a, c) => a + c.weight, 0));
    const parts = [...ccy.map((c, i) => ({ name: c.code, share: c.weight / 100, color: `var(${CATS[i]})` })), rest > 0.5 ? { name: "Other", share: rest / 100, color: "var(--other)" } : null].filter(Boolean);
    const est = x.currency_basis !== "issuer";
    const cn = x.concentration || {};
    const facts = [
      ["Companies", h("span", {}, fmt.n0.format(x.companies_count || cn.issuers || 0), h("small", { class: "muted" }, cn.lines ? ` · ${fmt.n0.format(cn.lines)} lines` : ""))],
      cn.top10_pct != null ? ["Ten largest together", `${fmt.n1.format(cn.top10_pct)}%`] : null,
      cn.largest_company ? ["Largest company", h("span", {}, `${cn.largest_company.name.replace(/ (Inc|Corp|Co Ltd|Ltd|PLC|AG|NV|SA)$/i, "")} `, h("b", {}, `${fmt.n1.format(cn.largest_company.weight)}%`))] : null,
      cn.largest_sector ? ["Largest sector", `${cn.largest_sector.name} ${fmt.n1.format(cn.largest_sector.weight)}%`] : null,
      cn.neff_issuers ? ["Effective number of companies", fmt.n0.format(cn.neff_issuers)] : null,
    ].filter(Boolean);
    const kv = h("div");
    body.replaceChildren(bars(regions, { max: Math.max(...regions.map((r) => r.weight)) }),
      h("div", { class: "section-l" }, est ? "Currencies, estimated from each company's country" : "Currencies of the companies"),
      h("div", { class: "hm-ccy" }, stackBar(parts, { w: "100%" }), legend(parts.map((p) => ({ c: p.color, label: p.name, value: `${fmt.n0.format(p.share * 100)}%`, style: "box" })))),
      kv);
    hmFlex(cardEl, 2, facts.length, (n) => kv.replaceChildren(hmKv(facts.slice(0, n))));
    const src = (x.sources || []).map((s) => `${s.issuer} file of ${day(s.as_of)}`).join("; ");
    foot.replaceChildren(`Look-through of ${fmt.n1.format(x.covered_pct ?? 100)}% of your securities: ${src || "issuer files"}. Countries are where the companies are listed.`);
  }).catch((e) => { if (t()) hmFail(body, "The look-through", e); });
}
