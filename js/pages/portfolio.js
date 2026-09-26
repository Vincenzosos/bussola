"use strict";
/* Portfolio (My Portfolio: real money, read-only). Seven sub-pages, v5spec/PORTFOLIO_SPEC.md sections 2 and 4:
   Summary (PF) · Holdings (HOLD) · Look-through (LOOK) · Performance (PERF) · Risk (RISK) · Costs & tax (TAX) · Import (UPDT).
   Every number comes from /api/portfolio/* (portfolio_api.py, computed in portfolio_analytics.py); this file formats.
   The one exception is live re-pricing of what you hold (pfCashIfSold, the same formula as the server).
   Facts and arithmetic about what you hold, never advice. Colours come from tokens only. */

const PF_SUBS = [["summary", "PF", "Summary"], ["hold", "HOLD", "Holdings"], ["xray", "LOOK", "Look-through"], ["perf", "PERF", "Performance"],
  ["risk", "RISK", "Risk"], ["cost", "TAX", "Costs & tax"], ["impt", "UPDT", "Import"]];
/* old sub-tab ids and the spec's mnemonics keep working */
const PF_ALIAS = { port: "summary", overview: "summary", holdings: "hold", look: "xray", performance: "perf", costs: "cost", tax: "cost", update: "impt", updt: "impt" };
const PF_TXT = {
  PRICE_ONLY: "Prices only: Lang & Schwarz mid quotes in euros. Dividends are not added, so distributing funds look worse than they did.",
  WHAT_IF: "Today's holdings valued at past prices. This is not your own history; import your Trade Republic CSV for that.",
  REPLAY: "A past episode applied to what you hold today. Not a forecast: the next fall can be deeper or longer.",
  OTHER_THINGS_EQUAL: "Other things equal: a translation effect, not a forecast. Share prices and currencies tend to move together.",
  NOT_ADVICE: "Facts and arithmetic about what you hold. Not advice.",
};
const PF_FLAG = { clean_vs_raw: "NOISY QUOTES", mm_quotes: "NOT CREDIBLE", short_history: "SHORT HISTORY", proxy: "PROXY", stale_weights: "OLD FILE",
  estimated_ccy: "ESTIMATE", stamp_conflict: "CONFLICT", hand_entered_cost: "TYPED COST", bond_range: "12.5–26%", incomplete: "INCOMPLETE",
  unknown_kind: "NOT IN CATALOGUE", fx_unavailable: "NO EUR/USD" };
const PF_ISAC = "IE00B6R52259";
const PF_N3 = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const PF_REF_DEFAULT = ["IE00B6R52259", "IE00B4L5Y983", "IE00B5BMR087", "IE00B4K48X80", "LU0290358497"];
const PF_SRC = {
  TR841: "https://support.traderepublic.com/en-fi/841-Which-prices-do-I-see-in-the-app",
  TR856: "https://support.traderepublic.com/en-fi/856-Why-do-the-percentages-of-stocks-in-my-portfolio-differ-from-the-performance-of-my-overall-portfolio",
  TR1639: "https://support.traderepublic.com/en-de/1639-how-is-the-performance-of-my-portfolio-calculated",
  S6: "https://www.normattiva.it/do/atto/caricaAKN?dataGU=19721111&codiceRedaz=072U0642&dataVigenza=20260924",
  S7: "https://www.normattiva.it/do/atto/caricaAKN?dataGU=20111206&codiceRedaz=011G0247&dataVigenza=20260924",
  S18: "https://support.traderepublic.com/it-it/719-How-expensive-is-it-to-open-a-securities-account",
  S13: "https://def.finanze.it/DocTribFrontend/getContent.do?id=%7BA83F46BD-18D6-4A0A-B101-5BD7E309F3A3%7D",
  S16: "https://assets.traderepublic.com/assets/files/CA_IT-en-it.pdf",
  S15: "https://assets.traderepublic.com/assets/files/further_information_price_list_IT.pdf",
  PP: "https://help.portfolio-performance.info/en/reference/view/reports/performance/",
};

const PF = { sub: null, base: null, timers: [], charts: [], els: {}, off: [], sel: null, priceSeries: null, priceMode: null, priceDay: null,
  valueSeries: null, valueMode: null, valueDay: null };

/* ---------------------------------------------------------------- small helpers */
function pfPrefs() {
  try { return JSON.parse(localStorage.getItem("bussola-pf-prefs") || "{}") || {}; } catch (_) { return {}; }
}
function pfSave(patch) {
  const p = Object.assign(pfPrefs(), patch);
  try { localStorage.setItem("bussola-pf-prefs", JSON.stringify(p)); } catch (_) { /* private window: per-viewer convenience only */ }
  return p;
}
const pfP = (x, dp = 2) => (x == null || !Number.isFinite(x) ? "n/a" : sign(x, dp === 1 ? fmt.p1 : dp === 0 ? fmt.p0 : fmt.p2));
const pfE = (x) => sign(x, fmt.eur);
const pfE0 = (x) => sign(x, fmt.eur0);
const pfU = (x) => unsigned(x, fmt.eur);
const pfDay = (s) => (s ? day(s) : "n/a");
const pfMon = (s) => (s ? `${MONTHS[+s.slice(5, 7) - 1]} ${s.slice(2, 4)}` : "n/a");
const pfWeekday = (s) => (s ? `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${s}T12:00:00Z`).getUTCDay()]} ${dayShort(s)}` : "n/a");
function pfTone(x, text) { return h("span", { class: tone(x) }, text); }
function pfNa(reason) { return h("span", { class: "muted", "data-tip": reason, tabindex: "0" }, "n/a"); }
function pfLink(text, href, ext) { return h("a", ext ? { href, target: "_blank", rel: "noopener" } : { href }, text); }
/* a warning chip on the figure it affects: focusable, its text in the tooltip; the stamp-duty one links to Costs & tax */
function pfFlag(code, text) {
  const attrs = { class: "pf-flag", "data-tip": text, "aria-label": `${PF_FLAG[code] || code}: ${text}`, tabindex: "0",
    onfocus: (e) => { const r = e.currentTarget.getBoundingClientRect(); showTip(r.left, r.top, text); }, onblur: hideTip };
  if (code === "stamp_conflict") return h("a", Object.assign(attrs, { href: "#/portfolio/cost" }), PF_FLAG[code]);
  return h("span", attrs, PF_FLAG[code] || code);
}
function pfFlags(flags, applies) { return (flags || []).filter((f) => !applies || f.applies_to === applies).map((f) => pfFlag(f.code, f.text)); }
/* a numbered panel: "n CODE Title" (FINAL_DESIGN 6.2) */
function pfPanel(n, code, title, o = {}) { return card(Object.assign({ n, code, title }, o)); }
/* replaceChildren without the "null" text node an optional child would leave */
function pfSet(el, ...kids) { el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false && k !== "")); return el; }
function pfSlot(px = 160) { return h("div", { class: "pf-slot" }, skeleton(px)); }
function pfFail(el, e) { pfSet(el, empty(`Could not load: ${e.message}`)); }
function pfNote(...kids) { return h("p", { class: "note" }, ...kids); }
function pfMore(text, href) { return h("a", { href }, text); }
async function pfGet(path, key, ms = 300_000) { return key ? cached(key, () => api(path), ms) : api(path); }
function pfChart(el, opts) { const c = makeChart(el, opts); if (c) PF.charts.push(c); return c; }
function pfTimer(fn, ms) { const t = setInterval(fn, ms); PF.timers.push(t); return t; }
function pfKv(rows) { return h("dl", { class: "kv pf-kv" }, rows.filter(Boolean).map(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])); }
function pfSourceLine(text) { statusSource(text); }

/* pure:cashIfSold */
/* Cash if you sold everything now: per position, sale value at the bid (cents), minus the tax on the gain (fund: 26% or the
   bond rate on value - units x cost without fees; ETC or share: 26% on value - fee - units x cost), minus EUR 1; plus cash.
   The same formula as portfolio_analytics.sale_tax; a test runs this function with node against the server. */
function pfCashIfSold(rows, bids, cash) {
  const c2 = (x) => Math.round(x * 100) / 100;
  let out = cash || 0, tax = 0, fees = 0, value = 0;
  for (const r of rows) {
    const p = bids[r.isin];
    if (p == null) continue;
    const S = c2(r.shares * p), C = c2(r.shares * r.tax_unit_cost);
    const G = r.kind === "etc" || r.kind === "share" ? c2(S - r.sale_fee - C) : c2(S - C);
    const T = c2((r.kind === "etc" || r.kind === "share" ? 0.26 : r.rate) * Math.max(0, G));
    value += S; tax += T; fees += r.sale_fee; out += c2(S - T - r.sale_fee);
  }
  return { cash: c2(out), tax: c2(tax), fees, value: c2(value) };
}
/* end pure */

/* ---------------------------------------------------------------- the page */
Pages.portfolio = {
  title: "Portfolio",
  commands: PF_SUBS.map(([id, code, label]) => [code, `Portfolio · ${label}`, `#/portfolio/${id}`]),
  async render(el, sub, params) {
    if (PF_ALIAS[sub]) {                                    /* old ids keep working: move to the canonical URL, so the prompt shows the right code */
      const q = params && String(params) ? `?${params}` : "";
      location.replace(`#/portfolio/${PF_ALIAS[sub]}${q}`);
      return;
    }
    if (!PF_SUBS.some(([id]) => id === sub)) sub = "summary";
    PF.sub = sub;
    PF.els = {};
    const head = pageHead(["Portfolio", h("span", { id: "pf-small" }, "Trade Republic")], PF_TXT.NOT_ADVICE,
      sub !== "impt" ? h("a", { class: "btn", href: "#/portfolio/impt" }, icon("upload", 14), "Import TR CSV") : null);
    const tabs = subtabs("portfolio", PF_SUBS.map(([id, , label]) => [id, label]), sub);   // core.js puts each tab's code first
    const body = h("div", { class: "pf-page" }, skeleton(96), skeleton(320));
    el.append(head, tabs, body);
    let base;
    try { base = PF.base = await api("/api/portfolio/holdings"); }
    catch (e) { pfSet(body, pfPanel(1, "PF", "Portfolio", { span: 12, body: empty(`Could not load your holdings: ${e.message}`) })); return; }
    const n = base.positions.length;
    const small = $("pf-small");
    if (small) small.textContent = `Trade Republic · ${n} ${n === 1 ? "fund" : "holdings"} + cash`;
    const hold = tabs.querySelector('a[href="#/portfolio/hold"]');
    if (hold && n) hold.append(h("span", { class: "n" }, n));
    Live.want("page", base.positions.map((p) => p.isin));
    pfSet(body, );
    if (!n && sub !== "impt") {
      body.append(h("div", { class: "grid" }, pfPanel(1, "PF", "No holdings yet", { span: 12,
        body: empty("No holdings yet. Import your Trade Republic CSV or enter them by hand.", h("a", { class: "btn primary", href: "#/portfolio/impt" }, "Import or enter holdings")) })));
      return;
    }
    const fn = { summary: pfSummary, hold: pfHold, xray: pfXray, perf: pfPerf, risk: pfRisk, cost: pfCost, impt: pfImpt }[sub];
    await fn(body, base);
  },
  onQuote(key, q, prev) {
    const base = PF.base;
    if (!base) return;
    const p = base.positions.find((x) => x.isin === key);
    if (!p) return;
    const dir = Live.dir(q, prev);
    p.mid = q.mid;
    if (q.bid) { p.bid = q.bid; p.bid_live = true; } else p.bid = q.mid * (1 - 0.0005);
    const t = pfLiveTotals(base);
    if (PF.els.value) { pfSet(PF.els.value, ...[].concat(eurFig(PF.els.valueIsTotal === false ? t.inv : t.total))); flash(PF.els.value, dir); }
    if (PF.els.today) { pfSet(PF.els.today, h("span", { class: `dir` }, arrow(t.day)), pfE(t.day)); PF.els.today.className = tone(t.day); }
    if (PF.els.todayD) PF.els.todayD.textContent = pfP(t.dayPct);
    if (PF.els.since) { pfSet(PF.els.since, h("span", { class: "dir" }, arrow(t.gain)), pfE(t.gain)); PF.els.since.className = tone(t.gain); }
    if (PF.els.sinceD) PF.els.sinceD.textContent = pfP(t.gainPct);
    if (PF.els.cashIfSold) setText(PF.els.cashIfSold, fmt.eur.format(t.cif.cash), dir);
    if (PF.els.cifTax) PF.els.cifTax.textContent = fmt.eur.format(t.cif.tax);
    if (PF.els.cifBasis && q.bid) { PF.els.cifBasis.textContent = "at bid"; PF.els.cifBasis.className = ""; PF.els.cifBasis.removeAttribute("data-tip"); }
    if (PF.els.bidLine) PF.els.bidLine.textContent = pfValueLine(t.inv, base.cash, t.cif.value);
    const row = document.querySelector(`.pf-holdtable tr[data-isin="${key}"]`);
    if (row) {
      const set = (f, text, cls) => { const c = row.querySelector(`[data-f="${f}"]`); if (c) { setText(c, text, dir); if (cls != null) c.className = cls; } };
      const value = q.mid * p.shares, gain = value - p.cost, d = p.prev_close ? q.mid / p.prev_close - 1 : null;
      set("mid", fmt.n2.format(q.mid));
      if (q.bid) set("bid", fmt.n2.format(q.bid));
      set("value", fmt.eur.format(value));
      set("dayp", pfP(d), `pf-live ${tone(d)}`);
      set("daye", pfE(p.shares * (q.mid - p.prev_close)), `pf-live ${tone(d)}`);
      set("gaine", pfE(gain), `pf-live ${tone(gain)}`);
      set("gainp", pfP(gain / p.cost), `pf-live ${tone(gain)}`);
    }
    if (PF.valueSeries && PF.valueMode === "1d") PF.valueSeries.update({ time: exchangeTime(Math.floor((q.at || Date.now() / 1000) / 60) * 60), value: t.total });
    else if (PF.valueSeries && PF.valueDay) PF.valueSeries.update({ time: PF.valueDay, value: t.total });
    if (key === PF.sel && PF.priceSeries) {
      if (PF.priceMode === "intraday") PF.priceSeries.update({ time: exchangeTime(Math.floor((q.at || Date.now() / 1000) / 60) * 60), value: q.mid });
      else if (PF.priceDay) PF.priceSeries.update({ time: PF.priceDay, value: q.mid });
    }
  },
  leave() {
    PF.timers.forEach((t) => { clearInterval(t); clearTimeout(t); });
    PF.timers = [];
    PF.charts.forEach((c) => dropChart(c));
    PF.charts = [];
    PF.off.forEach((f) => { try { f(); } catch (_) { /* gone */ } });
    PF.off = [];
    PF.valueSeries = PF.priceSeries = null;
    hideTip();
  },
};

/* live totals of what you hold (value at mid, today, gain, cash if sold at the bid) */
function pfLiveTotals(base) {
  let inv = 0, prev = 0, cost = 0;
  const bids = {};
  for (const p of base.positions) {
    inv += p.mid * p.shares; prev += (p.prev_close || p.mid) * p.shares; cost += p.cost;
    bids[p.isin] = p.bid;
  }
  const cif = pfCashIfSold(base.positions.map((p) => ({ isin: p.isin, shares: p.shares, tax_unit_cost: p.tax_unit_cost, kind: p.kind, rate: p.tax_rate.high, sale_fee: p.sale_fee })), bids, base.cash);
  return { inv, total: inv + base.cash, day: inv - prev, dayPct: prev ? inv / prev - 1 : null, gain: inv - cost, gainPct: cost ? inv / cost - 1 : null, cif };
}

/* the Summary hero's detail: the parts of the mid total that add up to it, then the same at the bid */
const pfValueLine = (mid, cash, bid) => `securities ${fmt.eur.format(mid)} at mid + cash ${fmt.eur.format(cash)} · ${fmt.eur.format(bid + cash)} at bid`;

/* ================================================================ PF · Summary */
async function pfSummary(body, base) {
  const kpiBox = h("div", {}, skeleton(118));
  const valueBody = pfSlot(300), valueTools = h("div", { class: "pf-tools" }), valueFoot = h("span", {}, `${PF_TXT.WHAT_IF} ${PF_TXT.PRICE_ONLY}`);
  const moveBody = pfSlot(300), moveBadge = h("span"), moveFoot = h("span", {}, "Company quotes: Lang & Schwarz. Weights: the issuer's holdings file.");
  const retBody = pfSlot(120), riskBody = pfSlot(120), costBody = pfSlot(120), dataBody = pfSlot(150);
  body.append(kpiBox,
    h("div", { class: "grid" },
      pfPanel(1, "VALU", "Value", { span: 8, tools: valueTools, body: valueBody, foot: valueFoot }),
      pfPanel(2, "MOVE", "What moved your money today", { span: 4, badges: moveBadge, body: moveBody, foot: moveFoot, more: pfMore("All →", "#/portfolio/hold") })),
    h("div", { class: "grid" },
      pfPanel(3, "RETS", "Returns", { span: 4, body: retBody, flush: true, more: pfMore("Perf →", "#/portfolio/perf"), foot: "Price only, L&S session-end mids. Past returns do not predict future ones." }),
      pfPanel(4, "RISK", "Risk in euros", { span: 4, body: riskBody, more: pfMore("Risk →", "#/portfolio/risk"), foot: "Past episodes applied to today's holdings: not forecasts." }),
      pfPanel(5, "COST", "Costs in euros", { span: 4, body: costBody, more: pfMore("Tax →", "#/portfolio/cost"), foot: "TER from the fund's KID; tax rules in force today." })),
    h("div", { class: "grid" }, pfPanel(6, "DATA", "Data status", { span: 12, body: dataBody, flush: true })));

  api("/api/portfolio/overview").then((o) => {
    kpiBox.replaceWith(pfSummaryKpis(o, base));
    pfSet(dataBody, pfDataTable(o));
    pfSourceLine(`Positions: ${o.positions_source || "not set"} · quotes L&S ${o.quotes.mode === "stream" ? "live" : o.quotes.last_quote ? `last ${o.quotes.last_quote.slice(11, 16)}` : ""}`);
  }).catch((e) => { pfSet(kpiBox, empty(`Could not load the key numbers: ${e.message}`)); pfFail(dataBody, e); });

  pfValuePanel(valueBody, valueTools, valueFoot, base);
  pfMoversPanel(moveBody, moveBadge, moveFoot, { full: false, limit: 6 });

  pfGet("/api/portfolio/returns", "pf-returns:").then((r) => {
    const keep = ["you", PF_ISAC, "LU0290358497"];
    const rows = r.rows.filter((x) => keep.includes(x.key));
    const cols = [["1M", "1M"], ["3M", "3M"], ["YTD", "YTD"], ["1Y", "1Y"], ["3Y", "3Y/yr"], ["5Y", "5Y/yr"]];
    pfSet(retBody, table({ cls: "compact pf-mini", rowCls: (x) => (x.key === "you" ? "you" : "ref"),
      cols: [{ key: "label", label: "", fmt: (x) => h("span", { class: "nm" }, x.key === "you" ? "You" : x.label.replace(/ \(.*\)$/, "").replace("Euro overnight rate", "Cash rate")) },
        ...cols.map(([k, l], i) => ({ key: k, label: l, num: true, hideSm: i === 1 || i === 5, fmt: (x) => pfRetCell(x, k) }))],
      rows }), h("div", { class: "pf-pad" }, pfNote(`You: today's holdings at past prices, from ${pfDay((r.limited_by || {}).from)}. Cash rate: XEON, an overnight-rate fund.`)));
  }).catch((e) => pfFail(retBody, e));

  Promise.all([pfGet("/api/portfolio/drawdown", "pf-dd"), pfGet("/api/portfolio/replay?window=crash2020", "pf-replay:crash2020"), pfGet("/api/portfolio/replay?window=year2022", "pf-replay:year2022")])
    .then(([dd, c20, y22]) => {
      const s = dd.stats || {};
      pfSet(riskBody, pfKv([
        ["Below the last high", h("span", {}, pfTone(s.below_high, pfP(s.below_high)), h("small", { class: "muted" }, ` high ${pfDay(s.high_date)}`))],
        ["Worst drop since 19 Feb 2020", h("span", {}, pfTone(s.max_drawdown, pfP(s.max_drawdown, 1)), " · ", pfTone(s.max_drawdown_eur_today, pfE0(s.max_drawdown_eur_today)))],
        ["2020 crash again", pfTone(c20.total.eur, pfE0(c20.total.eur))],
        ["2022 again", pfTone(y22.total.eur, pfE0(y22.total.eur))],
      ]), ...pfFlags(dd.flags));
    }).catch((e) => pfFail(riskBody, e));

  Promise.all([api("/api/portfolio/costs"), api("/api/portfolio/tax")]).then(([c, t]) => {
    pfSet(costBody, pfKv([
      ["Fund fees a year", h("span", {}, fmt.eur.format(c.kpi.fund_fees_year), h("small", { class: "muted" }, ` TER ${fmt.p2.format(c.kpi.ter_weighted)}`))],
      ["Stamp duty a year", h("span", { class: "pf-inline" }, `€0 or ${fmt.eur.format(c.kpi.stamp_duty.per_law)}`, pfFlag("stamp_conflict", "Stamp duty: two sources disagree. The law says 0.2% a year; Trade Republic's help page says none is applied to the securities account."))],
      ["Tax if you sold today", fmt.eur.format(t.totals.tax)],
      ["Fund fees over 30 years", h("span", {}, fmt.p1.format(c.kpi.fee_drag_30y), h("small", { class: "muted" }, " of the final pot"))],
    ]));
  }).catch((e) => pfFail(costBody, e));
}

function pfRetCell(x, k) {
  const v = x.values ? x.values[k] : null;
  if (v == null) return pfNa((x.flags || {})[k] === "short_history" ? `L&S prices start on ${pfDay(x.from)}` : "not available");
  if ((x.flags || {})[k] === "mm_quotes") return h("span", { class: "pf-strike", "data-tip": "L&S quotes for this money-market fund swung too much in this window to be credible." }, pfP(v, 1));
  return pfTone(v, pfP(v, 1));
}

function pfSummaryKpis(o, base) {
  const k = o.kpi, one = base.positions.length === 1 ? base.positions[0] : null;
  PF.els.value = h("span", {}, eurFig(k.total));
  PF.els.bidLine = h("span", {}, pfValueLine(k.value_mid, k.cash, k.value_bid));
  PF.els.today = h("span", { class: tone(k.day_eur) }, h("span", { class: "dir" }, arrow(k.day_eur)), pfE(k.day_eur));
  PF.els.todayD = h("span", {}, pfP(k.day_pct));
  PF.els.since = h("span", { class: tone(k.gain_eur) }, h("span", { class: "dir" }, arrow(k.gain_eur)), pfE(k.gain_eur));
  PF.els.sinceD = h("span", {}, pfP(k.gain_pct));
  PF.els.cashIfSold = h("span", {}, fmt.eur.format(k.cash_if_sold));
  PF.els.cifTax = h("span", {}, fmt.eur.format(k.tax_if_sold));
  /* the value at the previous L&S session end, on the TODAY cell's own basis: the 1D chart measures "Today" from it too */
  PF.prevTotal = Number.isFinite(k.total) && Number.isFinite(k.day_eur) ? k.total - k.day_eur : null;
  return kpis(
    stat("Portfolio value", PF.els.value, [PF.els.bidLine, k.hand_entered ? [" ", pfFlag("hand_entered_cost", "Average cost typed from the Trade Republic app; whether it includes buy fees is not known.")] : null], "", "hero"),
    stat("Today", PF.els.today, [PF.els.todayD, h("span", { class: "muted" }, ` vs L&S close of ${pfWeekday(k.prev_session)}, ≈23:00`)], "", "major"),
    stat("Gain since you bought", PF.els.since, [PF.els.sinceD, h("span", { class: "muted" }, one ? ` vs your average cost ${fmt.eur.format(one.avg_cost)}` : ` vs your cost ${fmt.eur0.format(k.cost)}`)], "", "major"),
    stat("Cash if sold today", PF.els.cashIfSold, h("span", {}, "after ", PF.els.cifTax, ` tax and ${fmt.eur0.format(k.sale_fees)} in fees, `, PF.els.cifBasis = k.cash_if_sold_basis === "bid" ? h("span", {}, "at bid") : h("span", { "data-tip": "at mid minus an assumed 0.05% half-spread (TR's spread is not published)", tabindex: "0", class: "pf-dotted" }, "at mid − 0.05%"))),
    stat("Below high", k.below_high_pct != null && Math.abs(k.below_high_pct) < 0.00005 ? "at a high" : pfTone(k.below_high_pct, pfP(k.below_high_pct)), `high on ${pfDay(k.high_date)}`),
    stat("YTD", pfTone(k.ytd_pct, pfP(k.ytd_pct)), `${k.ytd_bench.label} ${pfP(k.ytd_bench.pct)}, price only`));
}

function pfDataTable(o) {
  return table({ cls: "compact pf-data", cols: [
    { key: "what", label: "What", w: "22%", fmt: (x) => h("span", { class: "nm" }, x.what) },
    { key: "value", label: "Status", fmt: (x) => h("span", { class: "pf-inline" }, prose(x.value), x.flag ? pfFlag(x.flag,
      x.flag === "stamp_conflict" ? "Stamp duty: two sources disagree. See Costs & tax."
        : x.flag === "hand_entered_cost" ? "Average cost typed from the Trade Republic app; whether it includes buy fees is not known." : "Some rows of the CSV are not counted.") : null) },
  ], rows: o.data });
}

/* VALU: your holdings' value, 1D intraday or a daily range, optional grey reference */
function pfValuePanel(el, tools, foot, base) {
  const prefs = pfPrefs();
  const berlin = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const g = Object.fromEntries(berlin.map((x) => [x.type, x.value]));
  const inHours = !["Sat", "Sun"].includes(g.weekday) && (+g.hour * 60 + +g.minute) >= 450 && (+g.hour * 60 + +g.minute) < 1380;
  let rng = prefs.valueRange || (inHours ? "1d" : "1m");
  let cmp = prefs.valueCompare !== false;
  const change = h("span", { class: "pf-change" });
  const cmpChip = chip("vs MSCI ACWI", null, cmp, () => { cmp = !cmp; cmpChip.setAttribute("aria-pressed", String(cmp)); pfSave({ valueCompare: cmp }); draw(); });
  cmpChip.title = "A grey reference line, rebased to your start value (daily ranges)";
  tools.append(seg([["1d", "1D"], ["1m", "1M"], ["3m", "3M"], ["ytd", "YTD"], ["1y", "1Y"], ["3y", "3Y"], ["5y", "5Y"], ["max", "Max"]], rng, (r) => { rng = r; pfSave({ valueRange: r }); draw(); }, "Period"),
    cmpChip, h("span", { class: "grow" }), change);
  const leg = h("div", { class: "legend" });
  const box = h("div", { class: "chart fill" });
  pfSet(el, leg, box);
  async function draw() {
    const ok = guard("pf-value");
    box.style.opacity = 0.5;
    let data = null, bench = null, mode = rng, prevTotal = null, first = null;
    try {
      if (rng === "1d") {
        const d = await api("/api/portfolio/intraday");
        if (d.points.length > 1) { data = d.points.map(([t, v]) => ({ time: t, value: +(v + base.cash).toFixed(2) })); prevTotal = Number.isFinite(PF.prevTotal) ? PF.prevTotal : d.prev_close + base.cash; }
        else mode = "1m";
      }
      if (!data) {
        const s = await api(`/api/portfolio/series?range=${mode}${cmp ? `&bench=${PF_ISAC}` : ""}`);
        data = s.dates.map((t, i) => ({ time: t, value: s.total[i] }));
        if (s.bench) bench = { label: s.bench.label, data: s.dates.map((t, i) => (s.bench.rebased[i] == null ? null : { time: t, value: s.bench.rebased[i] })).filter(Boolean), pct: s.bench.pct };
        first = s.total[0];
      }
    } catch (e) { if (ok()) { box.style.opacity = 1; pfSet(box, h("p", { class: "fallback" }, `Chart unavailable: ${e.message}`)); } return; }
    if (!ok()) return;
    box.style.opacity = 1;
    cmpChip.disabled = mode === "1d";
    const c = pfChart(box, { time: mode === "1d" });
    if (!c) return;
    const you = c.addAreaSeries(SERIES.you());
    you.setData(data);
    let b = null;
    if (bench && bench.data.length) { b = c.addLineSeries(SERIES.bench(1)); b.setData(bench.data); }
    if (prevTotal != null) you.createPriceLine({ price: prevTotal, color: css("--bench-1"), lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
    c.timeScale().fitContent();
    PF.valueSeries = you;
    PF.valueMode = mode;
    PF.valueDay = mode === "1d" ? null : data[data.length - 1].time;
    const last = data[data.length - 1].value, base0 = mode === "1d" ? prevTotal : first;
    pfSet(change, h("span", { class: "muted" }, mode === "1d" ? "Today " : `${mode.toUpperCase()} `), delta(last - base0, base0 ? last / base0 - 1 : null));
    pfSet(leg, legend([{ c: "var(--s1)", label: "Your holdings + cash", value: fmt.eur.format(last), style: "area" },
      mode === "1d" ? { c: "var(--bench-1)", label: "Yesterday's L&S close", value: fmt.eur.format(prevTotal), style: "dash" } : null,
      b ? { c: "var(--bench-1)", label: `${bench.label}, rebased`, value: pfP(bench.pct, 1), style: "dash" } : null].filter(Boolean)));
    crosshairTip(c, box, [{ series: you, label: "You", c: "var(--s1)", fmt: (v) => fmt.eur.format(v) }].concat(b ? [{ series: b, label: bench.label, c: "var(--bench-1)", fmt: (v) => fmt.eur.format(v) }] : []));
    foot.textContent = mode === "1d" ? `Today, exchange time (Berlin): L&S mid, one point a minute, plus cash. The dashed line is yesterday's L&S session end (≈23:00). ${PF_TXT.PRICE_ONLY}`
      : `${PF_TXT.WHAT_IF} ${PF_TXT.PRICE_ONLY}${b ? " The grey line is a reference fund rebased to the same start: for comparison, not a suggestion." : ""}`;
  }
  draw();
}

/* ================================================================ MOVE: what moved your money today (summary compact, holdings full) */
function pfMoversPanel(el, badgeEl, footEl, { full, limit }) {
  let showAll = false;
  async function load() {
    let d;
    try { d = await api(`/api/portfolio/movers?limit=${full ? 60 : limit}`); }
    catch (e) { pfFail(el, e); return; }
    render(d);
  }
  function fundLine(d) {
    const f = d.total || {};
    return h("div", { class: "pf-fundmove" }, h("span", { class: "section-l" }, "The fund's own move today"),
      h("div", { class: "pf-fig" }, h("b", { class: tone(f.eur) }, h("span", { class: "dir" }, arrow(f.eur)), pfE(f.eur)), " ", pfTone(f.pct, pfP(f.pct)),
        h("small", { class: "muted" }, ` vs L&S close of ${pfWeekday((d.funds[0] || {}).prev_session)}`)));
  }
  function render(d) {
    pfSet(badgeEl, d.coverage ? h("span", { class: "pf-coverage", tabindex: "0", "data-tip": `${fmt.n1.format(d.coverage.weight_pct)}% of the fund measured live: the companies with an L&S quote in today's session` }, full ? `${fmt.n1.format(d.coverage.weight_pct)}% of the fund measured live` : `${fmt.n1.format(d.coverage.weight_pct)}% live`)
      : badge(d.status === "closed" ? "CLOSED" : "PAUSED", "na"));
    const fund = d.funds.find((f) => f.has_file) || d.funds[0] || {};
    const asof = fund.weights_as_of || d.largest_as_of;
    if (d.status === "live" || d.status === "warming" || (d.status === "closed" && d.rows && d.rows.length)) renderLive(d, fund, asof);
    else renderOff(d, fund, asof);
  }
  function renderLive(d, fund, asof) {
    const max = Math.max(...d.rows.map((r) => Math.abs(r.eur || 0)), 0.01);
    const rows = full ? (showAll ? d.rows : d.rows.slice(0, 20)) : d.rows.slice(0, limit);
    const VIA = { "own ISIN": "own", "ADR (approximate)": "ADR ≈", "GDR (approximate)": "GDR ≈", "not found on L&S by ISIN": "not found", "not looked up yet": "pending" };
    const status = d.status_text ? h("p", { class: "callout" }, d.status_text) : null;
    const t = table({ cls: `compact pf-movers${full ? "" : " pf-mini"}`, stack: full, rowCls: (r) => (r.__rest ? "ref" : r.eur == null ? "out" : ""),
      cols: [
        { key: "name", label: "Company", lead: true, fmt: (r) => h("span", { class: "pf-inline" }, h("span", { class: "nm" }, r.name.replace(/ (Inc|Corp|Co Ltd|Ltd|PLC|AG|NV|SA)$/i, "")), r.merged ? badge(r.classes === 2 ? "A+C" : `${r.classes} lines`, "ref") : null) },
        full ? { key: "country", label: "Country", hideSm: true } : null,
        full ? { key: "sector", label: "Sector", hideSm: true } : null,
        full ? { key: "weight_pct", label: "Weight", num: true, fmt: (r) => (r.weight_pct == null ? "" : `${fmt.n2.format(r.weight_pct)}%`) } : null,
        { key: "ret_pct", label: "Today", num: true, fmt: (r) => (r.__rest ? "" : r.ret_pct == null ? pfNa("no L&S quote today") : pfTone(r.ret_pct, pfP(r.ret_pct))) },
        { key: "eur", label: "€", num: true, fmt: (r) => (r.eur == null ? "" : pfTone(r.eur, pfE(r.eur))) },
        { key: "bar", label: "", fmt: (r) => (r.eur == null || r.__rest ? "" : dbar(r.eur, max)), hideSm: true, w: full ? "90px" : "64px" },
        full ? { key: "quote_time", label: "Quote", num: true, hideSm: true, fmt: (r) => (r.__rest ? "" : r.quote_time || "stale") } : null,
        full ? { key: "via", label: "Via", hideSm: true, fmt: (r) => (r.__rest ? "" : h("span", { class: "sub", "data-tip": r.via, tabindex: "0" }, VIA[r.via] || r.via)) } : null,
      ].filter(Boolean),
      rows: [...rows, ...pfOthers(d, rows), { __rest: true, name: "Rest of the fund, not measured live", weight_pct: d.rest ? d.rest.weight_pct : null, eur: d.rest ? d.rest.eur : null, merged: false }],
      foot: full ? { name: "The fund's own move", eur: pfTone(d.total.eur, pfE(d.total.eur)), ret_pct: pfTone(d.total.pct, pfP(d.total.pct)) } : null });
    const byC = (d.by_country || []).slice(0, 4).map((x) => `${x.name} ${pfE0(x.eur)}`).join(" · ");
    if (!full) {
      pfSet(el, status || fundLine(d), t, byC ? pfNote(`By country (measured part): ${byC}`) : null,
        (d.rows_count || d.rows.length) > limit ? h("a", { class: "btn ghost sm", href: "#/portfolio/hold" }, `All ${d.rows_count || d.rows.length} companies →`) : null);
    } else {
      const groupT = (items, label) => { const m = Math.max(...items.map((x) => Math.abs(x.eur)), 0.01); return table({ cls: "compact pf-mini", cols: [
        { key: "name", label, fmt: (x) => h("span", { class: "nm" }, x.name) }, { key: "eur", label: "€", num: true, fmt: (x) => pfTone(x.eur, pfE(x.eur)) },
        { key: "bar", label: "", w: "70px", fmt: (x) => dbar(x.eur, m) }], rows: items }); };
      const side = h("div", { class: "pf-side" },
        fundLine(d),
        groupT((d.by_country || []).slice(0, 8), "By country, measured part"),
        groupT((d.by_sector || []).slice(0, 8), "By sector, measured part"));
      pfSet(el, status, h("div", { class: "pf-split" }, h("div", { class: "pf-main" }, t,
        d.rows.length > 20 && !showAll ? h("button", { class: "btn ghost sm", type: "button", onclick: () => { showAll = true; renderLive(d, fund, asof); } }, `Show all ${d.rows.length}`) : null), side));
    }
    const cov = d.coverage || {};
    footEl.textContent = `Measured live: ${fmt.n1.format(cov.weight_pct || 0)}% of the fund (${cov.lines_measured || 0} of its ${cov.lines_top || 50} largest lines; TSMC and Samsung through their US receipts). Weights from ${fund.weights_source || "the issuer"}'s file of ${pfDay(asof)}, ${fund.drift_adjusted ? "adjusted for price moves since then" : "not yet adjusted for price moves since then"}. Quotes for companies whose home market is closed are L&S indications. The rest of the fund is its own L&S move minus the measured part.`;
  }
  function renderOff(d, fund, asof) {
    const big = d.largest || [];
    const rows = full ? (showAll ? big : big.slice(0, 12)) : big.slice(0, limit);
    const t = table({ cls: `compact pf-movers${full ? "" : " pf-mini"}`, cols: [
      { key: "name", label: "Company", lead: true, fmt: (r) => h("span", { class: "pf-inline" }, h("span", { class: "nm" }, r.name.replace(/ (Inc|Corp|Co Ltd|Ltd|PLC|AG|NV|SA)$/i, "")), r.classes > 1 ? badge(r.classes === 2 ? "A+C" : `${r.classes} lines`, "ref") : null) },
      full ? { key: "country", label: "Country", hideSm: true } : null,
      { key: "weight_pct", label: "Weight", num: true, fmt: (r) => `${fmt.n2.format(r.weight_pct)}%` },
      { key: "eur", label: "Your €", num: true, fmt: (r) => fmt.eur0.format(r.eur) },
      { key: "today", label: "Today", num: true, hideSm: true, fmt: () => h("span", { class: "muted" }, "paused") },
    ].filter(Boolean), rows });
    const status = h("p", { class: "callout" }, d.status_text || "Company quotes paused.");
    const title = h("div", { class: "section-l" }, "Largest companies in your fund, by your euros");
    if (!full) {
      pfSet(el, status, fundLine(d), title, t);
    } else {
      const how = h("div", { class: "pf-side" }, fundLine(d),
        h("div", { class: "section-l" }, "How this panel measures it, when quotes stream"),
        ledger([
          { op: "", label: "Each large company", small: "weight in the fund × its L&S move today", value: "Σ" },
          { op: "+", label: "Rest of the fund", small: "not measured live", value: "rest" },
          { op: "=", label: "The fund's own L&S move", small: "reconciles to the cent", value: "total", cls: "total" }]),
        pfNote("Company quotes are subscribed only while this page is open and the live stream is on: polling about 50 companies would load L&S too much."));
      pfSet(el, status, h("div", { class: "pf-split" }, h("div", { class: "pf-main" }, title, t,
        big.length > 12 && !showAll ? h("button", { class: "btn ghost sm", type: "button", onclick: () => { showAll = true; renderOff(d, fund, asof); } }, `Show the top ${big.length}`) : null), how));
    }
    footEl.textContent = `Weights from ${fund.weights_source || "the issuer"}'s holdings file of ${pfDay(asof)}, share classes merged; your € = today's value × weight. ${d.status === "closed" ? "" : "The fund's move is its own L&S quote against the previous session end (≈23:00)."}`;
  }
  load();
  if (PF.sub === "summary" || PF.sub === "hold") {
    const tick = () => { if (document.visibilityState === "visible") load(); };
    pfTimer(tick, 20_000);
    const vis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", vis);
    PF.off.push(() => document.removeEventListener("visibilitychange", vis));
  }
}

/* the measured companies not listed, as one line, so the listed lines + this + the rest add up to the fund's move */
function pfOthers(d, shown) {
  const n = (d.rows_total || {}).count || 0;
  const listed = shown.filter((r) => r.eur != null);
  if (!d.rows_total || listed.length >= n) return [];
  const eur = d.rows_total.eur - listed.reduce((a, r) => a + r.eur, 0);
  return [{ __rest: true, name: `${n - listed.length} more measured companies`, weight_pct: null, eur: Math.round(eur * 100) / 100, merged: false }];
}

/* ================================================================ HOLD · Holdings */
async function pfHold(body, base) {
  const t = base.totals;
  PF.els.value = h("span", {}, eurFig(t.value_mid));
  PF.els.valueIsTotal = false;
  body.append(kpis(
    stat("Value, mid", PF.els.value, `securities only, ${t.positions} ${t.positions === 1 ? "position" : "positions"}; cash ${fmt.eur.format(base.cash)} not included`, "", "hero"),
    stat("At bid", fmt.eur.format(t.value_bid), `${pfE(t.value_bid - t.value_mid)} vs mid · ${base.tr_gap.bid_basis === "live bid" ? "live bid" : "mid − 0.05%"}`, "", "major"),
    stat("Gain", pfTone(t.gain_eur, [h("span", { class: "dir" }, arrow(t.gain_eur)), pfE(t.gain_eur)]), `${pfP(t.gain_pct)} on your cost`, "", "major"),
    stat("Cost basis", fmt.eur.format(t.cost), base.positions.some((p) => p.avg_cost_basis === "hand_entered") ? [h("span", {}, "typed from the TR app "), pfFlag("hand_entered_cost", "Average cost typed from the Trade Republic app; whether it includes buy fees is not known.")] : "from your CSV"),
    stat("Today", pfTone(t.day_eur, pfE(t.day_eur)), pfP(t.day_pct)),
    stat("Fund fees / yr", fmt.eur.format(t.fund_fees_year), t.fees_missing_for.length ? `TER unknown for ${t.fees_missing_for.join(", ")}` : "inside the fund prices")));

  const rows = base.positions.map((p) => Object.assign({}, p));
  let sortKey = "value_mid", sortDir = -1;
  const holdBox = h("div", { class: "pf-slot" });
  const priceTools = h("div", { class: "pf-tools" }), priceBody = h("div", { class: "pf-slot" }, skeleton(260)), priceTitle = h("span");
  const moveBody = pfSlot(260), moveBadge = h("span"), moveFoot = h("span");
  body.append(
    h("div", { class: "grid" }, pfPanel(1, "HOLD", "Holdings", { span: 12, body: holdBox, flush: true,
      foot: h("span", {}, `Mid and bid: Lang & Schwarz. Positions: ${base.source || "not set"}${base.updated ? `, saved ${pfDay(base.updated)}` : ""}. Click a row for its price chart; double-click for the fund card. Sorting is not ranking.`) })),
    h("div", { class: "grid" },
      pfPanel(2, "PRIC", "Price and your average", { span: 7, tools: priceTools, body: priceBody, badges: priceTitle, foot: "L&S mid per share. Dashed: your average cost. 1D is exchange time (Berlin)." }),
      pfPanel(3, "TRMD", "Why Trade Republic may show a different number", { span: 5, body: pfTrMd(base), foot: "Sources: Trade Republic support 841, 856 and 1639; Lang & Schwarz quotes." })),
    h("div", { class: "grid" }, pfPanel(4, "MOVE", "What moved your money today, in full", { span: 12, badges: moveBadge, body: moveBody, foot: moveFoot })));
  pfSourceLine(`Positions: ${base.source || "not set"} · quotes L&S`);

  function draw() {
    rows.sort((a, b) => sortDir * ((a[sortKey] ?? -Infinity) > (b[sortKey] ?? -Infinity) ? 1 : (a[sortKey] ?? -Infinity) < (b[sortKey] ?? -Infinity) ? -1 : 0));
    /* the cash row shows only its value and weight */
    const col = (key, label, f, o = {}) => Object.assign({ key, label, num: true, sort: sortKey === key ? (sortDir < 0 ? "descending" : "ascending") : true,
      fmt: (p) => (p.__cash ? (key === "value_mid" ? fmt.eur.format(p.value_mid) : key === "weight" ? fmt.p1.format(p.weight) : "") : f(p)) }, o);
    const tax = (p) => (p.tax_rate.range ? h("span", { "data-tip": p.tax_rate.basis, tabindex: "0" }, `${fmt.eur0.format(Math.max(0, p.gain_at_bid) * p.tax_rate.low)}–${fmt.eur0.format(p.tax_if_sold)}`) : fmt.eur.format(p.tax_if_sold));
    const cashRow = { __cash: true, isin: "cash", value_mid: base.cash, weight: base.totals.total_mid ? base.cash / base.totals.total_mid : null };
    const tbl = table({ cls: "pf-holdtable", stack: true, onsort: (k) => { if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = -1; } draw(); },
      onrow: (p) => { if (!p.__cash) select(p.isin); }, rowCls: (p) => (p.__cash ? "ref" : `you${p.isin === PF.sel ? " sel" : ""}`),
      cols: [
        { key: "name", label: "Holding", lead: true, sort: sortKey === "name" ? (sortDir < 0 ? "descending" : "ascending") : true,
          fmt: (p) => (p.__cash ? h("span", { class: "pf-inline" }, h("span", { class: "tick" }, "EUR"), h("span", { class: "nm" }, "Cash at Trade Republic"))
            : h("span", { class: "pf-inline" }, h("span", { class: "tick" }, p.ticker), h("span", { class: "nm pf-fundname" }, p.name.replace(/ \([A-Z0-9]+\)$/, "")), h("span", { class: "sub" }, p.isin), badge("Held", "held"))) },
        col("shares", "Shares", (p) => fmt.n4.format(p.shares), { hideSm: true }),
        col("avg_cost", "Avg cost", (p) => fmt.n2.format(p.avg_cost)),
        col("mid", "Mid", (p) => h("span", { "data-f": "mid" }, fmt.n2.format(p.mid))),
        col("bid", "Bid", (p) => h("span", { "data-f": "bid", "data-tip": p.bid_basis }, fmt.n2.format(p.bid)), { hideSm: true }),
        col("day_pct", "Today %", (p) => h("span", { "data-f": "dayp", class: `pf-live ${tone(p.day_pct)}` }, pfP(p.day_pct))),
        col("day_eur", "Today €", (p) => h("span", { "data-f": "daye", class: `pf-live ${tone(p.day_eur)}` }, pfE(p.day_eur)), { hideSm: true }),
        col("value_mid", "Value", (p) => h("span", { "data-f": "value" }, fmt.eur.format(p.value_mid))),
        col("weight", "Weight", (p) => fmt.p1.format(p.weight), { hideSm: true }),
        col("gain_eur", "Gain €", (p) => h("span", { "data-f": "gaine", class: `pf-live ${tone(p.gain_eur)}` }, pfE(p.gain_eur))),
        col("gain_pct", "Gain %", (p) => h("span", { "data-f": "gainp", class: `pf-live ${tone(p.gain_pct)}` }, pfP(p.gain_pct))),
        col("tax_if_sold", "Tax if sold", tax),
        col("ter", "TER", (p) => (p.ter == null ? pfNa("TER not in the catalogue") : fmt.p2.format(p.ter)), { hideSm: true }),
        col("fund_fee_year", "Fee €/yr", (p) => (p.fund_fee_year == null ? "n/a" : fmt.eur.format(p.fund_fee_year)), { hideSm: true }),
      ],
      rows: [...rows, cashRow],
      foot: { name: h("b", {}, "Total"), value_mid: fmt.eur.format(base.totals.total_mid), day_eur: pfTone(t.day_eur, pfE(t.day_eur)), day_pct: pfTone(t.day_pct, pfP(t.day_pct)),
        gain_eur: pfTone(t.gain_eur, pfE(t.gain_eur)), gain_pct: pfTone(t.gain_pct, pfP(t.gain_pct)), tax_if_sold: fmt.eur.format(t.tax_if_sold), fund_fee_year: fmt.eur.format(t.fund_fees_year), weight: fmt.p0.format(1) } });
    tbl.querySelectorAll("tbody tr").forEach((tr, i) => {
      const r = rows[i];
      if (r) { tr.dataset.isin = r.isin; tr.addEventListener("dblclick", () => openInstrument(r.isin, r.name)); }
      else tr.removeAttribute("tabindex");
    });
    pfSet(holdBox, tbl, ...(base.flags.length ? [h("div", { class: "pf-flagrow" }, pfFlags(base.flags))] : []));
  }
  function select(isin) { PF.sel = isin; draw(); pfPrice(priceBody, priceTools, priceTitle, rows.find((p) => p.isin === isin)); }
  PF.sel = PF.sel && rows.some((p) => p.isin === PF.sel) ? PF.sel : rows[0].isin;
  draw();
  pfPrice(priceBody, priceTools, priceTitle, rows.find((p) => p.isin === PF.sel));
  pfMoversPanel(moveBody, moveBadge, moveFoot, { full: true, limit: 60 });
}

function pfPrice(el, tools, titleEl, p) {
  if (!p) return;
  pfSet(titleEl, h("span", { class: "tick pf-tick" }, p.ticker));
  let rng = pfPrefs().priceRange || "1y";
  const note = h("span", { class: "pf-change" });
  pfSet(tools, seg([["1d", "1D"], ["1w", "1W"], ["1m", "1M"], ["1y", "1Y"], ["5y", "5Y"], ["max", "Max"]], rng, (r) => { rng = r; pfSave({ priceRange: r }); draw(); }, "Period"), h("span", { class: "grow" }), note);
  const box = h("div", { class: "chart fill" });
  const leg = h("div", { class: "legend" });
  pfSet(el, leg, box);
  async function draw() {
    const ok = guard("pf-price");
    box.style.opacity = 0.5;
    let data, mode = "daily";
    try {
      if (rng === "1d") {
        const d = await api(`/api/intraday?isin=${p.isin}`);
        if (d.points.length > 1) { data = d.points.map(([x, v]) => ({ time: x, value: v })); mode = "intraday"; }
      }
      if (!data) {
        const d = await api(`/api/history?isin=${p.isin}&range=${rng === "1d" ? "1w" : rng}`);
        data = d.dates.map((x, i) => ({ time: x, value: d.prices[i] }));
      }
    } catch (e) { if (ok()) { box.style.opacity = 1; pfSet(box, h("p", { class: "fallback" }, `Chart unavailable: ${e.message}`)); } return; }
    if (!ok()) return;
    box.style.opacity = 1;
    const c = pfChart(box, { time: mode === "intraday" });
    if (!c) return;
    const s = c.addAreaSeries(SERIES.you());
    s.setData(data);
    s.createPriceLine({ price: p.avg_cost, color: css("--bench-1"), lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "" });
    c.timeScale().fitContent();
    crosshairTip(c, box, [{ series: s, label: p.ticker, c: "var(--s1)", fmt: (v) => fmt.eur.format(v) }]);
    PF.priceSeries = s; PF.priceMode = mode; PF.priceDay = mode === "daily" ? data[data.length - 1].time : null;
    const now = p.mid, from = mode === "intraday" ? p.prev_close : data[0].value;
    pfSet(note, h("span", { class: "muted" }, mode === "intraday" ? "Today " : `Since ${day(data[0].time)} `), delta(null, now / from - 1));
    pfSet(leg, legend([{ c: "var(--s1)", label: `${p.ticker} per share`, value: fmt.eur.format(now), style: "area" },
      { c: "var(--bench-1)", label: "Your average cost", value: fmt.eur.format(p.avg_cost), style: "dash" },
      rng === "1d" && mode !== "intraday" ? { c: "var(--ink-3)", label: "No trades today yet: last week shown", style: "dot" } : null].filter(Boolean)));
  }
  draw();
}

function pfTrMd(base) {
  const g = base.tr_gap;
  return [
    h("ol", { class: "pf-facts" },
      h("li", {}, h("b", {}, "Value. "), "Trade Republic shows bid prices (", pfLink("TR support 841", PF_SRC.TR841, true), "). The gap now is Σ shares × (mid − bid) = ",
        h("b", {}, fmt.eur.format(g.value_gap_bid)), g.bid_basis === "live bid" ? "." : [" (", h("span", { class: "pf-dotted", "data-tip": g.bid_basis, tabindex: "0" }, "estimated"), ")."]),
      h("li", {}, h("b", {}, "Today. "), "SV Terminal compares with Lang & Schwarz's previous session end (about 23:00). Trade Republic's portfolio daily figure uses the opening price (", pfLink("TR support 856", PF_SRC.TR856, true), ")."),
      h("li", {}, h("b", {}, "Return. "), "Trade Republic divides the gain by an “average portfolio size” it does not define further (", pfLink("TR support 1639", PF_SRC.TR1639, true), "). SV Terminal shows time- and money-weighted returns instead (", pfLink("Performance", "#/portfolio/perf"), ").")),
    table({ cls: "compact pf-mini", stack: true, cols: [{ key: "k", label: "", lead: true, fmt: (x) => h("span", { class: "nm" }, x.k) }, { key: "b", label: "SV Terminal", sl: "SV Terminal", wide: true, fmt: (x) => x.b }, { key: "t", label: "Trade Republic's app", sl: "TR app", wide: true, fmt: (x) => x.t }], rows: [
      { k: "Value", b: `${fmt.eur.format(base.totals.value_mid)} at mid`, t: `bid: ${fmt.eur.format(base.totals.value_bid)}` },
      ...base.positions.slice(0, 3).map((p) => ({ k: `${p.ticker}, one share`, b: `mid ${fmt.eur.format(p.mid)}`, t: `bid ${fmt.eur.format(p.bid)}` })),
      { k: "Today", b: "vs previous session end", t: "vs today's opening price" },
      { k: "Return", b: `${pfP(base.totals.gain_pct)} on your cost`, t: "gain ÷ average portfolio size" }] }),
    pfNote("Summarised from Trade Republic support pages 841, 856 and 1639 (paraphrased, not quoted)."),
  ];
}

/* ================================================================ LOOK · Look-through */
async function pfXray(body, base) {
  const kpiBox = h("div", {}, skeleton(118));
  const mapBody = pfSlot(320), ccyBody = pfSlot(220), ccyTitle = h("span", {}, "Currencies"), sectBody = pfSlot(260), compBody = pfSlot(300);
  const concBody = pfSlot(300), ovBody = pfSlot(300), srcBody = pfSlot(80);
  const mapFoot = h("span"), ccyBadges = h("span");
  body.append(kpiBox,
    h("div", { class: "grid" }, pfPanel(1, "MAP", "Where the companies are", { span: 8, body: mapBody, foot: mapFoot }),
      card({ n: 2, code: "CCY", title: ccyTitle, badges: ccyBadges, span: 4, body: ccyBody, foot: PF_TXT.OTHER_THINGS_EQUAL })),
    h("div", { class: "grid" }, pfPanel(3, "SECT", "Sectors", { span: 4, body: sectBody, foot: "Fund-level sector rows from the issuer, weighted by your € in each fund." }),
      pfPanel(4, "COMP", "The companies you own most", { span: 8, body: compBody, flush: true, foot: "Share classes of one company are one company (Alphabet A + C). Your € = weight × today's value of each fund." })),
    h("div", { class: "grid" }, pfPanel(5, "CONC", "Concentration", { span: 6, body: concBody }), pfPanel(6, "OVLP", "Overlap between funds", { span: 6, body: ovBody })),
    h("div", { class: "grid" }, pfPanel(7, "SRC", "Sources", { span: 12, body: srcBody, flush: true })));
  let x;
  try { x = await pfGet("/api/portfolio/xray", "pf-xray", 300_000); }
  catch (e) { pfSet(kpiBox, empty(`Could not load the look-through: ${e.message}`)); [mapBody, ccyBody, sectBody, compBody, concBody, ovBody, srcBody].forEach((b) => pfFail(b, e)); return; }
  const c = x.concentration || {};
  const us = x.countries.find((r) => r.iso2 === "US");
  kpiBox.replaceWith(kpis(
    stat("Effective N", c.neff_issuers != null ? fmt.n0.format(c.neff_issuers) : "n/a", `equal holdings (${c.neff_lines != null ? fmt.n0.format(c.neff_lines) : "n/a"} counting each line)`, "", "hero"),
    stat("Companies", fmt.n0.format(x.companies_count), `${fmt.n0.format(c.lines || 0)} lines, share classes merged`, "", "major"),
    stat("Top 10", c.top10_pct != null ? `${fmt.n1.format(c.top10_pct)}%` : "n/a", "of the fund, by company", "", "major"),
    stat("Largest", c.largest_company ? `${fmt.n1.format(c.largest_company.weight)}%` : "n/a", c.largest_company ? c.largest_company.name : ""),
    stat("United States", us ? `${fmt.n1.format(us.weight)}%` : "0%", us ? fmt.eur0.format(us.eur) : ""),
    stat("Coverage", `${fmt.n0.format(x.covered_pct)}%`, x.missing.length ? `no file for ${x.missing.join(", ")}` : "of your money has look-through data")));
  const src = x.sources.map((s) => `${s.issuer} file of ${pfDay(s.as_of)}`).join(" · ");
  pfSourceLine(`Holdings: ${src} · quotes L&S`);

  /* MAP */
  const mapBox = h("div", { class: "map" }), mapLeg = h("div", { class: "map-legend" });
  const topC = x.countries.slice(0, 12);
  pfSet(mapBody, h("div", { class: "pf-maprow" }, h("div", { class: "pf-mapcol" }, mapBox, mapLeg),
    table({ cls: "compact pf-mini", cols: [{ key: "name", label: "Country", fmt: (r) => h("span", { class: "nm" }, r.name) },
      { key: "weight", label: "%", num: true, fmt: (r) => fmt.n1.format(r.weight) }, { key: "eur", label: "€", num: true, fmt: (r) => fmt.eur0.format(r.eur) }], rows: topC })));
  worldMap(mapBox, mapLeg, x.countries);
  mapFoot.textContent = `Country rows from ${src}. ${x.countries.length} countries.`;

  /* CCY: title per basis (the old subtitle claimed more than the data holds) */
  const est = x.currency_basis !== "issuer";
  ccyTitle.textContent = est ? "Home currency of each company (estimate)" : "Trading currency of each holding";
  pfSet(ccyBadges, ...pfFlags(x.flags.filter((f) => f.code === "estimated_ccy").slice(0, 1)));
  const folded = fold(x.currencies.map((r) => ({ name: r.code, weight: r.weight, eur: r.eur })), 7);
  pfSet(ccyBody, bars(folded));
  pfGet("/api/portfolio/fx", "pf-fx").then((fx) => {
    const u = fx.usd_part && fx.usd_part.ytd;
    ccyBody.append(h("div", { class: "section-l" }, "What the dollar did"), pfKv([
      u ? ["EUR/USD this year", h("span", {}, pfTone(u.eurusd_change, pfP(u.eurusd_change)), h("small", { class: "muted" }, ` ${fmt.n4.format(u.eurusd_from)} → ${fmt.n4.format(u.eurusd_to)}`))] : null,
      u ? ["Of your YTD, from the dollar", h("span", {}, `≈ ${sign(u.points * 100, fmt.n1)} pts of ${pfP(u.of, 1)}`)] : null,
      ["Euro 10% stronger vs the dollar", h("span", {}, pfTone(fx.translation.usd_plus_10, pfP(fx.translation.usd_plus_10, 1)), " · ", pfTone(fx.translation.usd_plus_10_eur, pfE0(fx.translation.usd_plus_10_eur)))],
    ]), h("p", { class: "note" }, "More in ", pfLink("Risk → currencies", "#/portfolio/risk"), "."));
  }).catch(() => { /* the bars stand alone */ });

  /* SECT */
  pfSet(sectBody, bars(x.sectors.map((s) => ({ name: s.name, weight: s.weight, eur: s.eur })), { max: Math.max(...x.sectors.map((s) => s.weight), 1) }),
    x.concentration && x.concentration.largest_sector ? pfNote(`Largest: ${x.concentration.largest_sector.name}, ${fmt.n1.format(x.concentration.largest_sector.weight)}% of your securities.`) : null);

  /* COMP */
  let all = false;
  const drawComp = () => {
    const rows = all ? x.companies : x.companies.slice(0, 12);
    pfSet(compBody, table({ cls: "compact", cols: [
      { key: "rk", label: "#", num: true, w: "36px", hideSm: true, fmt: (r) => h("span", { class: "rk" }, x.companies.indexOf(r) + 1) },
      { key: "name", label: "Company", fmt: (r) => h("span", { class: "pf-inline" }, h("span", { class: "nm pf-trunc" }, r.name), r.country ? h("span", { class: "sub" }, r.country) : null) },
      { key: "classes", label: "Classes merged", c: true, hideSm: true, fmt: (r) => (r.classes > 1 ? badge(r.classes === 2 ? "A+C" : `${r.classes} lines`, "ref") : "") },
      { key: "via", label: "Held through", hideSm: true, fmt: (r) => h("span", { class: "sub" }, [...new Set(r.via)].join(", ").replace(/ \(([A-Z0-9]+)\)/g, "")) },
      { key: "weight", label: "Weight", num: true, fmt: (r) => `${fmt.n2.format(r.weight)}%` },
      { key: "eur", label: "Your €", num: true, fmt: (r) => fmt.eur0.format(r.eur) }], rows }),
    !all && x.companies.length > 12 ? h("div", { class: "pf-showall" }, h("button", { class: "btn ghost sm", type: "button", onclick: () => { all = true; drawComp(); } }, `Show all ${x.companies.length}`)) : null);
  };
  drawComp();

  /* CONC */
  const pf = x.per_fund || [];
  pfSet(concBody, 
    h("p", { class: "lede" }, h("b", {}, `${fmt.n0.format(c.lines || 0)} lines`), " behave like ", h("b", {}, `${fmt.n0.format(c.neff_issuers || 0)} equal holdings`),
      ` once share classes are merged. The ten largest companies are ${fmt.n1.format(c.top10_pct || 0)}% of your securities.`),
    table({ cls: "compact", cols: [{ key: "fund", label: "Fund", fmt: (r) => h("span", { class: "nm" }, r.fund.replace(/ \(([A-Z0-9]+)\)$/, " ($1)")) },
      { key: "lines", label: "Lines", num: true, hideSm: true, fmt: (r) => fmt.n0.format(r.lines) }, { key: "issuers", label: "Companies", num: true, fmt: (r) => fmt.n0.format(r.issuers) },
      { key: "neff_lines", label: "Eff. N lines", num: true, hideSm: true, fmt: (r) => fmt.n1.format(r.neff_lines) },
      { key: "neff_issuers", label: "Eff. N companies", num: true, fmt: (r) => fmt.n1.format(r.neff_issuers) }, { key: "top10_pct", label: "Top 10", num: true, fmt: (r) => `${fmt.n1.format(r.top10_pct)}%` }],
      rows: pf.length > 1 ? [...pf, { fund: "Combined", lines: c.lines, issuers: x.companies_count, neff_lines: c.neff_lines, neff_issuers: c.neff_issuers, top10_pct: c.top10_pct }] : pf }),
    h("div", { class: "section-l" }, "Share classes merged, largest groups"),
    table({ cls: "compact", cols: [{ key: "name", label: "Company", fmt: (r) => h("span", { class: "nm" }, r.name) },
      { key: "isins", label: "Lines", num: true, fmt: (r) => r.isins.length }, { key: "weight", label: "Together", num: true, fmt: (r) => `${PF_N3.format(r.weight)}%` }],
      rows: (c.merges || []).slice(0, 8) }),
    pfNote(`Rule: ${c.rule || ""} "Holding" and "group" are kept, so Heineken NV and Heineken Holding NV stay two companies. Effective N = 1 ÷ Σ (weight share)².`));

  /* OVLP */
  pfOverlap(ovBody, x);

  /* SRC */
  pfSet(srcBody, table({ cls: "compact", stack: true, cols: [
    { key: "short", label: "Fund", lead: true, fmt: (s) => h("span", { class: "nm" }, s.short) },
    { key: "issuer", label: "Issuer" }, { key: "as_of", label: "File date", fmt: (s) => pfDay(s.as_of) },
    { key: "lines", label: "Lines", num: true, fmt: (s) => fmt.n0.format(s.lines) },
    { key: "weight_sum", label: "Sum of lines", num: true, fmt: (s) => h("span", { "data-tip": "The rest is cash and other lines that are not company shares", tabindex: "0" }, `${fmt.n2.format(s.weight_sum)}%`) },
    { key: "age_days", label: "Age", num: true, fmt: (s) => h("span", { class: "pf-inline" }, `${s.age_days} days`, s.stale ? pfFlag("stale_weights", `Holdings file dated ${pfDay(s.as_of)} (${s.age_days} days old).`) : null) },
    { key: "currency_basis", label: "Currencies", fmt: (s) => (s.currency_basis === "issuer" ? "issuer" : "estimate") },
    { key: "page_url", label: "Source", fmt: (s) => (s.page_url ? pfLink("issuer page ↗", s.page_url, true) : "n/a") }], rows: x.sources }));
}

function pfOverlap(el, x) {
  const ov = x.overlap || {};
  if (ov.pairs && ov.pairs.length) {
    pfSet(el, ...ov.pairs.map((p) => [h("p", { class: "lede" }, "Overlap ", h("b", {}, `${fmt.n1.format(p.overlap_pct)}%`), `: ${p.common_count} companies in both.`), pfTopCommon(p)]));
    return;
  }
  const choices = x.compare_choices || [];
  const pick = h("select", { "aria-label": "Compare with a fund in the catalogue" }, choices.map((c) => h("option", { value: c.isin }, c.label)));
  const out = h("div", { class: "pf-slot" }, skeleton(200));
  const start = pfPrefs().overlap || (choices.find((c) => c.isin === PF_ISAC) || choices[0] || {}).isin;
  if (start) pick.value = start;
  pick.addEventListener("change", () => { pfSave({ overlap: pick.value }); load(); });
  pfSet(el, h("label", { class: "field" }, h("span", {}, "Compare your look-through with a catalogue fund"), pick), out);
  async function load() {
    const ok = guard("pf-ovlp");
    pfSet(out, skeleton(200));
    try {
      const d = await pfGet(`/api/portfolio/xray?compare=${pick.value}`, `pf-xray:${pick.value}`);
      if (!ok()) return;
      const cmp = d.overlap && d.overlap.compare;
      if (!cmp || !cmp.available) { pfSet(out, empty((cmp && cmp.reason) || "No holdings file for this fund.")); return; }
      pfSet(out, h("p", { class: "lede" }, "Overlap with ", h("b", {}, cmp.label), ": ", h("b", {}, `${fmt.n1.format(cmp.overlap_pct)}%`),
        ` (Σ of the smaller weight of each company in both; ${fmt.n0.format(cmp.common_count)} companies in both). For comparison, not a suggestion.`), pfTopCommon(cmp, "You", cmp.label.replace(/.*\(([A-Z0-9]+)\)$/, "$1")),
        pfNote(`Its holdings file: ${pfDay(cmp.as_of)}, ${fmt.n0.format(cmp.lines)} lines.`));
    } catch (e) { if (ok()) pfFail(out, e); }
  }
  if (start) load(); else pfSet(out, empty("No other fund in the catalogue has a holdings file."));
}
function pfTopCommon(p, a = "A", b = "B") {
  return table({ cls: "compact", cols: [{ key: "name", label: "In both", fmt: (r) => h("span", { class: "nm pf-trunc" }, r.name) },
    { key: "a", label: a, num: true, fmt: (r) => `${fmt.n2.format(r.a)}%` }, { key: "b", label: b, num: true, fmt: (r) => `${fmt.n2.format(r.b)}%` }], rows: p.top_common.slice(0, 10) });
}

/* ================================================================ PERF · Performance */
async function pfPerf(body, base) {
  const kpiBox = h("div", {}, skeleton(118));
  const retBody = pfSlot(220), retTools = h("div", { class: "pf-tools" });
  const growBody = pfSlot(300), growTools = h("div", { class: "pf-tools" }), mineBody = pfSlot(260), calBody = pfSlot(180), monBody = pfSlot(200);
  body.append(kpiBox,
    h("div", { class: "grid" }, pfPanel(1, "RETS", "Returns next to reference funds", { span: 12, tools: retTools, body: retBody, flush: true, foot: `${PF_TXT.PRICE_ONLY} Reference funds are for comparison, not suggestions. Below each reference fund: the difference against yours, in points.` })),
    h("div", { class: "grid" }, pfPanel(2, "GROW", "Growth of 100", { span: 8, tools: growTools, body: growBody, foot: `${PF_TXT.WHAT_IF} ${PF_TXT.PRICE_ONLY}` }),
      pfPanel(3, "MINE", "Your own return", { span: 4, body: mineBody, foot: "The CSV comes from the Trade Republic app: profile, statements, transaction export. It stays on this computer." })),
    h("div", { class: "grid" }, pfPanel(4, "CALY", "Calendar years", { span: 12, body: calBody, flush: true, foot: "Price only. A year in grey is partial: its series starts during that year. The current year is to date." })),
    h("div", { class: "grid" }, pfPanel(5, "MNTH", "Month by month, your holdings", { span: 12, body: monBody, flush: true, foot: `${PF_TXT.WHAT_IF} Each cell is the month's change, with its sign; the tint only repeats it.` })),
    h("div", { class: "grid" }, pfPanel(6, "NOTE", "How these numbers are made", { span: 12, body: h("ul", { class: "pf-notes" },
      h("li", {}, "Prices only: Lang & Schwarz mid quotes in euros, session end (≈23:00 Berlin); today's point is the live mid. Dividends are not added."),
      h("li", {}, "Periods start at the last close on or before the start date; periods over a year are per year, by actual calendar days."),
      h("li", {}, "Without your CSV, the line is today's holdings at past prices, not your own history."),
      h("li", {}, "When a fund's L&S prices start after a period's first day (10 years, for example), that period is n/a. Past returns do not predict future ones.")) })));
  pfSourceLine("Prices: Lang & Schwarz mids, session end ≈23:00 · price only");
  const prefs = pfPrefs();
  let extra = (prefs.refs || []).slice(0, 3);
  const load = () => pfGet(`/api/portfolio/returns${extra.length ? `?bench=${[...PF_REF_DEFAULT, ...extra].join(",")}` : ""}`, `pf-returns:${extra.join(",")}`);
  let r, mine;
  try { [r, mine] = await Promise.all([load(), pfGet("/api/portfolio/mine", "pf-mine").catch(() => ({ available: false, reason: "not loaded" }))]); }
  catch (e) { pfSet(kpiBox, empty(`Could not load returns: ${e.message}`)); [retBody, growBody, calBody, monBody].forEach((b) => pfFail(b, e)); return; }
  const you = r.rows.find((x) => x.key === "you") || { values: {} };
  const v = you.values;
  /* without the CSV these two are not available: drawn as n/a (not as a link at KPI size) with the way to get them */
  const imp = () => h("span", { class: "pf-na-kpi" }, "n/a");
  const impD = (what) => [what, " · ", h("a", { href: "#/portfolio/impt" }, "Import")];
  kpiBox.replaceWith(kpis(
    stat("YTD", pfTone(v.YTD, pfP(v.YTD)), `since 31 Dec · ${r.rows[1] ? `${r.rows[1].label} ${pfP(r.rows[1].values.YTD)}` : ""}`, "", "hero"),
    stat("1 year", pfTone(v["1Y"], pfP(v["1Y"])), "price only", "", "major"),
    stat("3 years, per year", pfTone(v["3Y"], pfP(v["3Y"])), "annualised by actual days", "", "major"),
    stat("5 years, per year", pfTone(v["5Y"], pfP(v["5Y"])), v["5Y"] != null && you.anchors && you.anchors["5Y"] ? `since ${pfDay(you.anchors["5Y"])}, by actual days` : `data from ${pfDay(you.from)}`),
    stat("Time-weighted / yr", mine.available ? pfTone(mine.twr.per_year ?? mine.twr.cumulative, pfP(mine.twr.per_year ?? mine.twr.cumulative)) : imp(), mine.available ? (mine.twr.per_year == null ? "cumulative (under a year)" : "after fees, before tax") : impD("needs the Trade Republic CSV")),
    stat("Money-weighted / yr", mine.available ? pfTone(mine.xirr.before_tax_owed, pfP(mine.xirr.before_tax_owed)) : imp(), mine.available ? "XIRR, before the tax you still owe" : impD("needs the Trade Republic CSV"))));

  /* RETS table with "+ add" (catalogue funds, at most 3 extra, remembered in this browser) */
  const drawRets = (d) => {
    const cols = d.periods.map((k) => ({ key: k, label: d.annualised.includes(k) ? `${k}/yr` : k, num: true, hideSm: ["6M", "10Y", "3M"].includes(k),
      fmt: (x) => [pfRetCell(x, k), x.key !== "you" && x.values[k] != null && v[k] != null ? h("span", { class: "sub block pf-diff" }, `${sign((x.values[k] - v[k]) * 100, fmt.n1)} pts`) : null] }));
    pfSet(retBody, table({ cls: "pf-rets", stack: true, rowCls: (x) => (x.key === "you" ? "you" : "ref"), cols: [
      { key: "label", label: "Fund", lead: true, fmt: (x) => h("span", { class: "pf-inline" }, h("span", { class: "nm" }, x.key === "you" ? "Your holdings" : x.label),
        x.key !== "you" && extra.includes(x.key) ? h("button", { class: "x", type: "button", "aria-label": `Remove ${x.label}`, onclick: (e) => { e.stopPropagation(); extra = extra.filter((i) => i !== x.key); pfSave({ refs: extra }); reload(); } }, "×") : null) },
      { key: "from", label: "From", hideSm: true, fmt: (x) => h("span", { class: "sub" }, x.from ? month(x.from.slice(0, 7)) : "n/a") },
      ...cols], rows: d.rows }));
    const pick = h("select", { "aria-label": "Add a catalogue fund to compare" }, h("option", { value: "" }, extra.length >= 3 ? "3 added (the most)" : "+ add a catalogue fund"),
      (d.choices || []).filter((c) => !PF_REF_DEFAULT.includes(c.isin) && !extra.includes(c.isin)).map((c) => h("option", { value: c.isin }, `${c.label} · ${c.category}`)));
    pick.disabled = extra.length >= 3;
    pick.addEventListener("change", () => { if (pick.value) { extra = [...extra, pick.value].slice(0, 3); pfSave({ refs: extra }); reload(); } });
    pfSet(retTools, h("span", { class: "note" }, "Defaults: MSCI ACWI, MSCI World, S&P 500, MSCI Europe, euro overnight rate."), h("span", { class: "grow" }), pick);
  };
  const reload = async () => { try { r = await load(); drawRets(r); drawCal(r); } catch (e) { pfFail(retBody, e); } };
  drawRets(r);

  /* GROW: growth of 100, you vs up to three reference funds in grey */
  let grng = prefs.growRange || "5y";
  growTools.append(seg([["1y", "1Y"], ["3y", "3Y"], ["5y", "5Y"], ["max", "Max"]], grng, (x) => { grng = x; pfSave({ growRange: x }); drawGrow(); }, "Period"), h("span", { class: "grow" }), h("span", { class: "note" }, "Rebased to 100 at the start"));
  async function drawGrow() {
    const ok = guard("pf-grow");
    const refs = [PF_ISAC, "IE00B5BMR087", ...extra].slice(0, 3);
    let ss;
    try { ss = await Promise.all(refs.map((b) => pfGet(`/api/portfolio/series?range=${grng}&bench=${b}`, `pf-series:${grng}:${b}`, 600_000))); }
    catch (e) { if (ok()) pfFail(growBody, e); return; }
    if (!ok()) return;
    const box = h("div", { class: "chart fill" }), leg = h("div", { class: "legend" });
    pfSet(growBody, leg, box);
    const c = pfChart(box, { euro: false, digits: 0 });
    if (!c) return;
    const s0 = ss[0];
    const you = c.addLineSeries(SERIES.youLine());
    you.setData(s0.dates.map((t, i) => ({ time: t, value: (s0.value[i] / s0.value[0]) * 100 })));
    const rows = [{ series: you, label: "You", c: "var(--s1)", fmt: (x) => fmt.n1.format(x) }];
    const items = [{ c: "var(--s1)", label: "Your holdings", value: fmt.n1.format((s0.value[s0.value.length - 1] / s0.value[0]) * 100), style: "line" }];
    ss.forEach((s, i) => {
      if (!s.bench) return;
      const k = s.bench.rebased[0];
      const l = c.addLineSeries(SERIES.bench(i + 1));
      l.setData(s.dates.map((t, j) => (s.bench.rebased[j] == null ? null : { time: t, value: (s.bench.rebased[j] / k) * 100 })).filter(Boolean));
      rows.push({ series: l, label: s.bench.label, c: `var(--bench-${i + 1})`, fmt: (x) => fmt.n1.format(x) });
      items.push({ c: `var(--bench-${i + 1})`, label: s.bench.label, value: fmt.n1.format((s.bench.rebased[s.bench.rebased.length - 1] / k) * 100), style: i === 0 ? "dash" : i === 1 ? "dot" : "dash" });
    });
    c.timeScale().fitContent();
    crosshairTip(c, box, rows);
    pfSet(leg, legend(items));
  }
  drawGrow();

  /* MINE */
  pfMine(mineBody, mine);

  /* CALY */
  const drawCal = (d) => {
    const ys = d.calendar.years;
    const cell = (x, y) => {
      const val = x.values[String(y)];
      if (val == null) return "";
      if (typeof val === "object") {
        return h("span", { class: `pf-partial ${val.partial_from ? "pf-grey" : ""}`, "data-tip": val.partial_from ? `from ${pfDay(val.partial_from)}` : "to date", tabindex: "0" },
          pfTone(val.value, pfP(val.value, 1)), val.partial_from ? h("span", { class: "sub block" }, `from ${dayShort(val.partial_from)}`) : null);
      }
      return pfTone(val, pfP(val, 1));
    };
    pfSet(calBody, table({ cls: "compact pf-cal", rowCls: (x) => (x.key === "you" ? "you" : "ref"),
      cols: [{ key: "label", label: "", fmt: (x) => h("span", { class: "pf-inline" }, h("span", { class: "nm" }, x.key === "you" ? "Your holdings" : x.label), x.flag ? pfFlag("proxy", "The same fund's distributing class stands in for the year before your fund's L&S prices start; price only, so it leaves out the distributions paid.") : null) },
        ...ys.map((y, i) => ({ key: String(y), label: y === ys[ys.length - 1] ? `${y} YTD` : String(y), num: true, hideSm: i < ys.length - 3, fmt: (x) => cell(x, y) }))],
      rows: d.calendar.rows }));
  };
  drawCal(r);

  /* MNTH */
  const mcls = (x) => { if (x == null) return ""; const a = Math.abs(x); const s = a < 0.01 ? 1 : a < 0.03 ? 2 : a < 0.06 ? 3 : 4; return `pf-heat-${x >= 0 ? "p" : "n"}${s}`; };
  pfSet(monBody, table({ cls: "compact pf-heat",
    cols: [{ key: "year", label: "", fmt: (x) => h("span", { class: "nm" }, x.year) },
      ...MONTHS.map((m, i) => ({ key: `m${i}`, label: m, num: true, hideSm: i % 2 === 1, cls: (x) => { const v0 = x.months[i]; return mcls(v0 && typeof v0 === "object" ? v0.value : v0); },
        fmt: (x) => { const v0 = x.months[i]; if (v0 == null) return ""; const val = typeof v0 === "object" ? v0.value : v0; return h("span", typeof v0 === "object" ? { "data-tip": `from ${pfDay(v0.partial_from)}`, class: "pf-grey" } : {}, `${val > 0.00049 ? "+" : val < -0.00049 ? MINUS : ""}${fmt.n1.format(Math.abs(val) * 100)}`); } })),
      { key: "year_value", label: "Year", num: true, fmt: (x) => { const y = x.year_value; if (y == null) return ""; const val = typeof y === "object" ? y.value : y; return h("b", { class: tone(val) }, pfP(val, 1)); } }],
    rows: r.monthly.rows }), h("div", { class: "pf-pad" }, pfNote(`Monthly change in %, from the last close of the previous month; the current month is to date. Before ${pfDay((r.limited_by || {}).from)} there are no L&S prices for your holdings; a partial first month is grey.`)));
}

function pfMine(el, m) {
  if (!m || !m.available) {
    pfSet(el, 
      h("p", { class: "lede" }, "Your own return needs your Trade Republic CSV: the real dates and amounts of every purchase."),
      pfKv([
        ["Time-weighted", h("span", { class: "pf-wrap" }, "what your holdings did, whatever the timing of your deposits")],
        ["Money-weighted (XIRR)", h("span", { class: "pf-wrap" }, "the yearly rate your own euros earned, dates included")],
        ["Same euros, same days", h("span", { class: "pf-wrap" }, "what MSCI ACWI would show on your exact flows")],
        ["Also from the CSV", h("span", { class: "pf-wrap" }, "the tax you paid, your loss credits and the average cost without fees")],
      ]),
      h("a", { class: "btn primary", href: "#/portfolio/impt" }, icon("upload", 14), "Import CSV"),
      pfNote("Method: ", pfLink("Portfolio Performance manual", PF_SRC.PP, true), " (flows at the start of the day)."));
    return;
  }
  const inc = m.incomplete ? pfFlag("incomplete", `incomplete: ${m.uncounted} rows not counted`) : null;
  pfSet(el, 
    inc,
    pfKv([
      ["Time-weighted", h("span", {}, pfTone(m.twr.cumulative, pfP(m.twr.cumulative)), m.twr.per_year != null ? h("small", { class: "muted" }, ` · ${pfP(m.twr.per_year)}/yr`) : null)],
      ["Money-weighted, before tax owed", pfTone(m.xirr.before_tax_owed, `${pfP(m.xirr.before_tax_owed)}/yr`)],
      ["Money-weighted, after tax if sold", pfTone(m.xirr.after_tax_if_sold, `${pfP(m.xirr.after_tax_if_sold)}/yr`)],
      ["Money in (net)", fmt.eur.format(m.money_in)],
      ["Value now", fmt.eur.format(m.value)],
      ["Gain", pfTone(m.gain, pfE(m.gain))],
      m.shadow ? [`Same euros, same days in ${m.shadow.label}`, h("span", {}, fmt.eur.format(m.shadow.value), h("small", { class: "muted" }, ` (you ${fmt.eur0.format(m.value)}; gap ${pfE0(m.shadow.gap_eur)})`))] : null,
    ]),
    pfNote(`${m.twr.label}. Since ${pfDay(m.since)}. Price only.`),
    (m.priced_from_trades || []).length ? pfNote(`Before their L&S prices begin, ${m.priced_from_trades.map((x) => `${x.isin} (L&S from ${pfDay(x.until)})`).join(", ")} ${m.priced_from_trades.length === 1 ? "is" : "are"} valued at the last trade price in your CSV.`) : null);
}

/* ================================================================ RISK · Risk */
async function pfRisk(body, base) {
  const kpiBox = h("div", {}, skeleton(118));
  const uwBody = pfSlot(300), uwTools = h("div", { class: "pf-tools" }), uwFoot = h("span", {}, `${PF_TXT.WHAT_IF} ${PF_TXT.PRICE_ONLY} Daily points are L&S session ends (≈23:00).`), uwBadges = h("span");
  const epBody = pfSlot(260), rpBody = pfSlot(260), rpTools = h("div", { class: "pf-tools" }), fxBody = pfSlot(300), fmBody = pfSlot(300);
  body.append(kpiBox,
    h("div", { class: "grid" }, pfPanel(1, "UWTR", "How far below the last high", { span: 8, tools: uwTools, body: uwBody, foot: uwFoot, badges: uwBadges }),
      pfPanel(2, "EPIS", "The falls, one by one", { span: 4, body: epBody, flush: true, foot: "Falls deeper than 5%, deepest first. td = trading days." })),
    h("div", { class: "grid" }, pfPanel(3, "RPLY", "If it happened again to what you hold today", { span: 12, tools: rpTools, body: rpBody, foot: PF_TXT.REPLAY })),
    h("div", { class: "grid" }, pfPanel(4, "FXEX", "Currencies: the translation estimate", { span: 7, body: fxBody, foot: PF_TXT.OTHER_THINGS_EQUAL }),
      pfPanel(5, "FXMS", "Currencies: what history measured", { span: 5, body: fmBody, foot: "OLS of your holdings' euro return on the dollar's euro change (L&S EUR/USD), weekdays both have. Price only." })));
  pfSourceLine("Prices: Lang & Schwarz, session end ≈23:00 · EUR/USD L&S 70592");
  let dd, fx;
  try { [dd, fx] = await Promise.all([pfGet("/api/portfolio/drawdown", "pf-dd"), pfGet("/api/portfolio/fx", "pf-fx").catch((e) => ({ error: e.message }))]); }
  catch (e) { pfSet(kpiBox, empty(`Could not load: ${e.message}`)); [uwBody, epBody, rpBody].forEach((b) => pfFail(b, e)); return; }
  const s = dd.stats || {};
  const usd = fx && fx.exposure ? fx.exposure.rows.find((r) => r.code === "USD") : null;
  kpiBox.replaceWith(kpis(
    stat("Below high", Math.abs(s.below_high || 0) < 0.00005 ? "at a high" : pfTone(s.below_high, pfP(s.below_high)), `high on ${pfDay(s.high_date)}`, "", "hero"),
    stat("Worst since 2020", pfTone(s.max_drawdown, pfP(s.max_drawdown, 1)), [pfE0(s.max_drawdown_eur_today), h("span", { class: "muted" }, ` on today's value · ${s.max_peak ? `${dayShort(s.max_peak)} → ${day(s.max_trough)}` : ""}`)], "", "major"),
    stat("Longest under water", `${fmt.n0.format(s.longest_under_water || 0)} td`, s.longest_episode ? `${month(s.longest_episode.peak.slice(0, 7))} → ${s.longest_episode.recovered ? month(s.longest_episode.recovered.slice(0, 7)) : "not yet"}` : "", "", "major"),
    stat("Volatility 3Y", s.volatility_3y != null ? `±${fmt.p1.format(s.volatility_3y)}` : "n/a", "typical yearly swing, daily log returns"),
    stat("Worst calendar year", s.worst_year ? pfTone(s.worst_year.value, pfP(s.worst_year.value, 1)) : "n/a", s.worst_year ? String(s.worst_year.year) : ""),
    stat("USD share", usd ? `${fmt.n1.format(usd.weight * 100)}%` : "n/a", usd ? (fx.exposure.basis.some((b) => b.basis === "estimate") ? "estimated from company country" : "issuer's trading currencies") : "")));

  /* UWTR */
  let cmp = pfPrefs().uwCompare === true;
  const cchip = chip("vs MSCI ACWI", null, cmp, () => { cmp = !cmp; cchip.setAttribute("aria-pressed", String(cmp)); pfSave({ uwCompare: cmp }); drawUw(); });
  uwTools.append(h("span", { class: "note" }, `Your holdings' index since ${pfDay(dd.dates[0])}; 0% = at a high.`), h("span", { class: "grow" }), cchip);
  pfSet(uwBadges, ...pfFlags(dd.flags));
  async function drawUw() {
    const ok = guard("pf-uw");
    let d = dd;
    if (cmp) { try { d = await pfGet(`/api/portfolio/drawdown?bench=${PF_ISAC}`, "pf-dd:isac"); } catch (e) { d = dd; } }
    if (!ok()) return;
    const box = h("div", { class: "chart fill" }), leg = h("div", { class: "legend" });
    pfSet(uwBody, leg, box);
    const c = pfChart(box, { euro: false, pct: true, digits: 0 });
    if (!c) return;
    const ser = c.addAreaSeries(SERIES.loss());
    ser.setData(d.dates.map((t, i) => ({ time: t, value: d.underwater[i] * 100 })));
    const edge = d.dates[Math.floor(d.dates.length * 0.04)] || "";
    /* every trough keeps its label, the deepest included (23 Mar 2020 sits at the left edge: room is made below) */
    ser.setMarkers((d.troughs || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map((t) => ({ time: t.date, position: "belowBar", color: css("--down"), shape: "arrowUp",
      text: sign(t.depth, fmt.p1) })));
    const rows = [{ series: ser, label: "You", c: "var(--down)", fmt: (x) => `${sign(x / 100, fmt.p1)}` }];
    const items = [{ c: "var(--down)", label: "Your holdings, below their last high", value: pfP(s.below_high, 1), style: "area" },
      { c: "var(--down)", label: `Troughs: ${(d.troughs || []).map((t) => `${sign(t.depth, fmt.p1)} ${day(t.date)}`).join(" · ")}`, style: "dot" }];
    if (cmp && d.bench) {
      const b = c.addLineSeries(SERIES.bench(1));
      b.setData(d.dates.map((t, i) => (d.bench.underwater[i] == null ? null : { time: t, value: d.bench.underwater[i] * 100 })).filter(Boolean));
      rows.push({ series: b, label: d.bench.label, c: "var(--bench-1)", fmt: (x) => `${sign(x / 100, fmt.p1)}` });
      items.push({ c: "var(--bench-1)", label: d.bench.label, style: "dash" });
    }
    c.timeScale().fitContent();
    if ((d.troughs || []).some((t) => t.date < edge)) {   // a labelled trough near the start: a little space before it so its text is not cut off
      const n = d.dates.length;
      c.timeScale().applyOptions({ fixLeftEdge: false });
      c.timeScale().setVisibleLogicalRange({ from: -Math.ceil(n * 0.03), to: n - 1 });
    }
    crosshairTip(c, box, rows);
    pfSet(leg, legend(items));
  }
  drawUw();

  /* EPIS */
  pfSet(epBody, table({ cls: "compact pf-eps", cols: [
    { key: "peak", label: "Peak", fmt: (e) => h("span", { class: "nm" }, `${dayShort(e.peak)} ${e.peak.slice(2, 4)}`) },
    { key: "trough", label: "Trough", hideSm: true, fmt: (e) => `${dayShort(e.trough)} ${e.trough.slice(2, 4)}` },
    { key: "depth", label: "Depth", num: true, fmt: (e) => pfTone(e.depth, pfP(e.depth, 1)) },
    { key: "recovered", label: "Back", fmt: (e) => (e.recovered ? `${dayShort(e.recovered)} ${e.recovered.slice(2, 4)}` : h("b", {}, "not yet")) },
    { key: "days_to_trough", label: "Fall", num: true, hideSm: true, fmt: (e) => e.days_to_trough },
    { key: "days_under_water", label: "Under", num: true, fmt: (e) => e.days_under_water }], rows: dd.episodes }),
    h("div", { class: "pf-pad" }, pfKv([
      ["Now", h("span", {}, pfTone(s.below_high, pfP(s.below_high)), h("small", { class: "muted" }, ` below the high of ${pfDay(s.high_date)}`))],
      ["Longest under water", s.longest_episode ? h("span", {}, `${s.longest_episode.days_under_water} td`, h("small", { class: "muted" }, ` ${dayShort(s.longest_episode.peak)} ${s.longest_episode.peak.slice(2, 4)} → ${s.longest_episode.recovered ? `${dayShort(s.longest_episode.recovered)} ${s.longest_episode.recovered.slice(2, 4)}` : "not yet"}`)) : "n/a"],
      ["Falls deeper than 10%", h("span", {}, String(dd.episodes.filter((e) => e.depth <= -0.1).length), h("small", { class: "muted" }, ` since ${pfDay(dd.dates[0])}`))],
      ["Volatility, 3 years", s.volatility_3y != null ? `±${fmt.p1.format(s.volatility_3y)} a year` : "n/a"],
      ["Raw L&S quotes", dd.raw_check.differs ? h("span", { class: "pf-inline" }, pfP(dd.raw_check.max_drawdown_raw, 1), pfFlags(dd.flags)) : h("span", {}, "same worst drop")],
    ])));

  /* RPLY */
  pfReplay(rpBody, rpTools, dd);

  /* FXEX + FXMS */
  if (!fx || fx.error) { pfFail(fxBody, new Error(fx ? fx.error : "no data")); pfFail(fmBody, new Error(fx ? fx.error : "no data")); return; }
  pfFxEstimate(fxBody, fx);
  pfFxMeasured(fmBody, fx);
}

function pfReplay(el, tools, dd) {
  const prefs = pfPrefs().replay || {};
  let wid = prefs.window || "crash2020";
  const from = h("input", { type: "date", class: "inp", "aria-label": "From", min: dd.dates[0], max: new Date().toISOString().slice(0, 10), value: prefs.from || "2022-01-03" });
  const to = h("input", { type: "date", class: "inp", "aria-label": "To", min: dd.dates[0], max: new Date().toISOString().slice(0, 10), value: prefs.to || "2022-10-12" });
  const custom = h("span", { class: "pf-custom", hidden: wid !== "custom" }, from, "→", to, h("button", { class: "btn sm", type: "button", onclick: () => load() }, "Apply"));
  tools.append(seg([["crash2020", "2020 crash"], ["year2022", "2022 year"], ["p2t2022", "2022 peak→trough"], ["recent", "Largest, last 2 years"], ["custom", "Custom"]], wid,
    (w) => { wid = w; custom.hidden = w !== "custom"; pfSave({ replay: { window: w, from: from.value, to: to.value } }); if (w !== "custom") load(); }, "Window"), custom);
  async function load() {
    const ok = guard("pf-replay");
    pfSet(el, skeleton(220));
    let r;
    try {
      const q = wid === "custom" ? `window=custom&from=${from.value}&to=${to.value}` : `window=${wid}`;
      if (wid === "custom") pfSave({ replay: { window: wid, from: from.value, to: to.value } });
      r = await pfGet(`/api/portfolio/replay?${q}`, `pf-replay:${q}`);
    } catch (e) { if (ok()) pfFail(el, e); return; }
    if (!ok()) return;
    const w = r.window;
    const rows = [...r.rows.map((x) => Object.assign({ kind: "hold" }, x)), { kind: "cash", name: "Cash", value_now: r.cash.value_now, ret: 0, eur: 0, flags: [] }];
    const t = table({ cls: "pf-replay", stack: true, rowCls: (x) => (x.kind === "cash" ? "ref" : x.shown === "struck" ? "out" : "you"), cols: [
      { key: "name", label: "Holding", lead: true, fmt: (x) => h("span", { class: "pf-inline" }, h("span", { class: "nm" }, x.name), (x.flags || []).map((f) => pfFlag(f, (r.flags.find((g) => g.code === f && g.applies_to === x.isin) || {}).text || f))) },
      { key: "value_now", label: "Value today", num: true, fmt: (x) => fmt.eur.format(x.value_now) },
      { key: "ret", label: `${dayShort(w.from)} ${w.from.slice(0, 4)} → ${dayShort(w.to)} ${w.to.slice(0, 4)}`, sl: "Window", num: true,
        fmt: (x) => (x.kind === "cash" ? h("span", { class: "muted" }, "unchanged") : x.ret == null ? pfNa("no L&S prices in this window") : x.shown === "struck" ? h("span", { class: "pf-strike" }, pfP(x.ret)) : pfTone(x.ret, pfP(x.ret))) },
      { key: "eur", label: "€ on today's value", num: true, fmt: (x) => (x.kind === "cash" ? fmt.eur.format(0) : x.shown === "struck" ? h("span", { class: "muted", "data-tip": "assumed unchanged: an inference" }, "assumed 0") : x.eur == null ? "" : pfTone(x.eur, pfE(x.eur))) },
      { key: "after", label: "Value after", num: true, hideSm: true, fmt: (x) => (x.kind === "cash" ? fmt.eur.format(x.value_now) : x.eur == null ? "" : fmt.eur.format(x.value_now + x.eur)) }],
      rows, foot: { name: h("b", {}, "Total"), value_now: fmt.eur.format(r.rows.reduce((a, x) => a + x.value_now, 0) + r.cash.value_now),
        ret: pfTone(r.total.pct_securities, pfP(r.total.pct_securities)),
        eur: pfTone(r.total.eur, pfE(r.total.eur)), after: fmt.eur.format(r.total.value_after) } });
    const rec = r.recovery;
    const recLine = rec ? (rec.back_at_start
      ? h("p", { class: "lede" }, "Back at the ", h("b", {}, `${pfDay(rec.start_level_date)} level`), " by ", h("b", {}, pfDay(rec.back_at_start)), `: ${rec.trading_days_from_start} trading days after it (${rec.trading_days_from_low} after ${pfDay(w.to)}).`)
      : h("p", { class: "lede" }, `Not yet back at the ${pfDay(rec.start_level_date)} level (${rec.since_start} trading days so far).`))
      : h("p", { class: "lede" }, "Recovery: n/a (your holdings' prices do not cover the start of this window).");
    const ctxT = table({ cls: "compact pf-ctx", rowCls: () => "ref", cols: [
      { key: "label", label: "Same window, other funds (price only, no €)", fmt: (x) => h("span", { class: "pf-inline" }, h("span", { class: "nm" }, x.label), (x.flags || []).filter((f) => f !== "short_history").map((f) => pfFlag(f, f === "mm_quotes" ? "Not credible for a fund that tracks the overnight rate: L&S quotes for it swung by several percent in this window." : `L&S quotes in this window are noisy: ${pfP(x.ret_raw, 1)} on raw quotes, ${pfP(x.ret, 1)} after SV Terminal's spike filter.`))) },
      { key: "ret", label: "Window", num: true, fmt: (x) => (x.ret == null ? pfNa(x.starts ? `L&S prices start on ${pfDay(x.starts)}` : "no data") : x.shown === "struck" ? h("span", { class: "pf-strike" }, pfP(x.ret, 1)) : pfTone(x.ret, pfP(x.ret, 1))) },
      { key: "raw", label: "Raw quotes", num: true, hideSm: true, fmt: (x) => (x.ret_raw == null || Math.abs(x.ret_raw - x.ret) < 0.0005 ? h("span", { class: "muted" }, "same") : pfP(x.ret_raw, 1)) }], rows: r.context });
    const share = h("p", { class: "note" }, `${pfP(r.total.pct_securities)} of your securities is ${pfP(r.total.pct_all)} of everything, cash included (cash assumed unchanged).`,
      r.total.excludes.length ? ` Left out of the total: ${r.total.excludes.join(", ")}.` : "");
    pfSet(el, h("div", { class: "pf-split pf-split-even" }, h("div", { class: "pf-main" }, t, recLine, share), h("div", { class: "pf-side" }, ctxT)));
  }
  load();
}

function pfFxEstimate(el, fx) {
  const rows = fx.exposure.rows;
  const top = rows.slice(0, 14);
  const rest = rows.slice(14);
  const tRows = rest.length ? [...top, { code: "Other", weight: rest.reduce((a, x) => a + x.weight, 0), eur: rest.reduce((a, x) => a + x.eur, 0), basis: top[0] ? top[0].basis : "" }] : top;
  const g = fx.translation.grid;
  const usdIn = h("input", { type: "range", min: "-15", max: "15", step: "1", value: "10", "aria-label": "Euro against the dollar, %" });
  const othIn = h("input", { type: "range", min: "-15", max: "15", step: "1", value: "0", "aria-label": "Euro against all other currencies, %" });
  const usdV = h("b"), othV = h("b"), out = h("p", { class: "lede pf-fxout" });
  const V = fx.value;
  const upd = () => {
    const iu = g.x.indexOf(+usdIn.value), io = g.x.indexOf(+othIn.value);
    const r = g.usd[iu] + g.other[io];                  /* two server-computed parts, added (the formula is additive) */
    usdV.textContent = `${+usdIn.value > 0 ? "+" : +usdIn.value < 0 ? MINUS : ""}${Math.abs(+usdIn.value)}%`;
    othV.textContent = `${+othIn.value > 0 ? "+" : +othIn.value < 0 ? MINUS : ""}${Math.abs(+othIn.value)}%`;
    const what = [+usdIn.value ? `the euro ${+usdIn.value > 0 ? "rose" : "fell"} ${Math.abs(+usdIn.value)}% against the dollar` : null,
      +othIn.value ? `${Math.abs(+othIn.value)}% against all other currencies` : null].filter(Boolean).join(" and ");
    pfSet(out, what ? `If ${what}, other things equal: ` : "No change in the euro: ", pfTone(r, h("b", {}, pfP(r))), " (", pfTone(r, h("b", {}, pfE0(r * V))), ").");
  };
  usdIn.addEventListener("input", upd);
  othIn.addEventListener("input", upd);
  const u = fx.usd_part && fx.usd_part.ytd;
  pfSet(el, 
    h("div", { class: "pf-split pf-split-even" },
      h("div", { class: "pf-main" }, table({ cls: "compact", cols: [{ key: "code", label: "Currency", fmt: (x) => h("span", { class: "tick" }, x.code) },
        { key: "weight", label: "%", num: true, fmt: (x) => fmt.n1.format(x.weight * 100) }, { key: "eur", label: "€", num: true, fmt: (x) => fmt.eur0.format(x.eur) },
        { key: "basis", label: "Basis", fmt: (x) => h("span", { class: "sub" }, x.basis === "estimate" ? "estimate" : "issuer") }], rows: tRows }),
        h("div", { class: "pf-inline" }, pfFlags(fx.flags.filter((f) => f.code === "estimated_ccy")))),
      h("div", { class: "pf-side" },
        h("label", { class: "field" }, h("span", {}, "Euro vs dollar ", usdV), usdIn),
        h("label", { class: "field" }, h("span", {}, "Euro vs all other currencies ", othV), othIn),
        out,
        u ? h("p", { class: "note" }, `This year the dollar's move added about ${sign(u.points * 100, fmt.n1)} points of your ${pfP(u.of, 1)} (EUR/USD ${pfP(u.eurusd_change)} since ${pfDay(u.from)}; USD part only: other currencies are not in SV Terminal's data).`) : null,
        h("p", { class: "note" }, "Formula: ", h("span", { class: "mono" }, "ΔV/V = Σ w × (1/(1+x) − 1)"), ", with w each currency's share and x the euro's change against it."),
        h("p", { class: "note" }, `Shares: ${fmt.p1.format(g.usd_weight)} dollar, ${fmt.p1.format(g.other_weight)} other currencies, ${fmt.p1.format(g.eur_weight)} euro.`))));
  upd();
}

function pfFxMeasured(el, fx) {
  const m = fx.measured;
  if (!m) { pfSet(el, empty("EUR/USD history unavailable, so nothing was measured.")); return; }
  const says = m.exposure_says, rng = m.range || [0, 0];
  const byWin = {};
  m.rows.forEach((r) => { (byWin[r.window] = byWin[r.window] || { window: r.window })[r.freq] = r; });
  const cell = (r) => (r ? h("span", {}, h("b", {}, sign(r.beta, fmt.n2)), h("small", { class: "muted hide-sm" }, ` (${sign(r.corr, fmt.n2)}) n ${r.n}`)) : "n/a");
  const box = h("div", { class: "chart pf-rollchart" });
  const weekly3 = byWin["3Y"] && byWin["3Y"].weekly;
  pfSet(el, 
    h("p", { class: "callout" }, `The exposure says ${fmt.n2.format(says)}. History measured anything from ${sign(rng[0], fmt.n2)} to ${sign(rng[1], fmt.n2)}, depending on the window. Treat the estimate on the left as a translation effect only.`),
    table({ cls: "compact", cols: [{ key: "window", label: "Window", fmt: (r) => h("span", { class: "nm" }, r.window) },
      { key: "daily", label: "Daily: beta (corr)", num: true, fmt: (r) => cell(r.daily) }, { key: "weekly", label: "Weekly", num: true, fmt: (r) => cell(r.weekly) }], rows: Object.values(byWin) }),
    m.rolling_1y ? h("div", { class: "section-l" }, `Rolling 1-year daily beta, last 3 years: ${sign(m.rolling_1y.min, fmt.n2)} to ${sign(m.rolling_1y.max, fmt.n2)}`) : null,
    box,
    weekly3 && weekly3.phase_range ? pfNote(`Weekly figures change with the weekday sampled: 3Y from ${sign(weekly3.phase_range[0], fmt.n2)} to ${sign(weekly3.phase_range[1], fmt.n2)}.`) : null);
  if (m.rolling_1y) {
    const c = pfChart(box, { euro: false, digits: 2 });
    if (c) {
      const l = c.addLineSeries(SERIES.youLine());
      l.setData(m.rolling_1y.points.map(([t, v]) => ({ time: t, value: v })));
      l.createPriceLine({ price: says, color: css("--bench-1"), lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
      c.timeScale().fitContent();
      crosshairTip(c, box, [{ series: l, label: "Beta", c: "var(--s1)", fmt: (v) => sign(v, fmt.n2) }]);
    }
  }
}

/* ================================================================ TAX · Costs & tax */
async function pfCost(body, base) {
  const kpiBox = h("div", {}, skeleton(118));
  const taxBody = pfSlot(260), bollBody = pfSlot(260), dragBody = pfSlot(220), dragTools = h("div", { class: "pf-tools" }), swBody = pfSlot(300), zainBody = pfSlot(200), lawBody = pfSlot(300);
  const taxBadges = h("span");
  body.append(kpiBox,
    h("div", { class: "grid" }, pfPanel(1, "TAXS", "Tax if you sold today", { span: 7, body: taxBody, badges: taxBadges, foot: "At the bid (or mid minus an assumed 0.05% half-spread), €1 per sale (TR price list v07.2026). Tax arithmetic under the rules in force today." }),
      pfPanel(2, "BOLL", "Stamp duty: two sources disagree", { span: 5, body: bollBody, id: "pf-boll", foot: "Sources as read on 24 Sep 2026." })),
    h("div", { class: "grid" }, pfPanel(3, "DRAG", "What fees add up to", { span: 7, tools: dragTools, body: dragBody, foot: "The TER is already inside the fund's price; this is what it removes compared with the same index at zero cost." }),
      pfPanel(4, "SWCH", "The arithmetic of selling everything today", { span: 5, body: swBody, foot: "Illustrative returns are inputs, not forecasts. Tax arithmetic under the rules in force on 24 Sep 2026; from 1 Jan 2027 the same under D.Lgs. 117/2026." })),
    h("div", { class: "grid" }, pfPanel(5, "ZAIN", "Realised results and loss credits", { span: 12, body: zainBody })),
    h("div", { class: "grid" }, pfPanel(6, "LAWS", "The rules, with sources", { span: 12, body: lawBody, foot: "notes.json, each rule with its sources and the date it was checked; changes are logged in the same file." })));
  pfSourceLine("Tax: DL 66/2014, TUIR, Circ. 21/E/2014 · fees: TR price list v07.2026");
  let t, c;
  try { [t, c] = await Promise.all([api("/api/portfolio/tax"), api(`/api/portfolio/costs${pfDragQuery()}`)]); }
  catch (e) { pfSet(kpiBox, empty(`Could not load: ${e.message}`)); [taxBody, bollBody, dragBody, swBody, zainBody, lawBody].forEach((b) => pfFail(b, e)); return; }
  const tt = t.totals;
  const credits = t.credits ? t.credits.filter((x) => x.left > 0 && !x.expired) : null;
  const lapsed = t.credits ? t.credits.filter((x) => x.left > 0 && x.expired).reduce((a, x) => a + x.left, 0) : 0;
  const firstExpiry = credits && credits.length ? credits.map((x) => x.expires).sort()[0] : null;
  const creditNote = !credits ? "needs your CSV" : firstExpiry ? `usable until ${pfDay(firstExpiry)}${lapsed > 0 ? ` · plus ${fmt.eur.format(lapsed)} lapsed` : ""}`
    : lapsed > 0 ? `${fmt.eur.format(lapsed)} lapsed, no longer usable` : "none in your CSV";
  kpiBox.replaceWith(kpis(
    stat("Tax if sold", h("span", {}, eurFig(tt.tax)), [`26% on ${fmt.eur.format(tt.gain)} of gain`, tt.upper_bound ? " (upper bound)" : ""], "", "hero"),
    stat("Fund fees / yr", fmt.eur.format(c.kpi.fund_fees_year), `TER ${fmt.p2.format(c.kpi.ter_weighted)}, inside the price`, "", "major"),
    stat("Stamp duty / yr", h("span", {}, `€0 or ${fmt.eur.format(c.kpi.stamp_duty.per_law)}`), [pfFlag("stamp_conflict", "Stamp duty: two sources disagree (panel 2)."), " law vs TR help page"], "", "major"),
    stat("Cash if sold", fmt.eur.format(tt.cash_if_sold), `incl. ${fmt.eur.format(tt.cash_included)} cash`),
    stat("Fee drag 30Y", fmt.p1.format(c.kpi.fee_drag_30y), "of the final pot, TER only"),
    stat("Loss credits", credits ? fmt.eur.format(credits.reduce((a, x) => a + x.left, 0)) : h("span", { class: "muted", "data-tip": "Needs your Trade Republic CSV", tabindex: "0" }, "n/a"), creditNote)));

  /* TAXS */
  const rateTxt = (r) => (r.range ? `${fmt.n1.format(r.low * 100)}%–26%` : "26%");
  pfSet(taxBadges, ...pfFlags(t.flags).slice(0, 1));
  pfSet(taxBody, 
    table({ cls: "compact pf-tax", stack: true, cols: [
      { key: "name", label: "Holding", lead: true, fmt: (p) => h("span", { class: "pf-inline" }, h("span", { class: "tick" }, p.ticker), h("span", { class: "sub" }, p.cost_basis === "hand_entered" ? "cost typed by hand" : p.cost_basis === "csv_ex_fees" ? "cost from CSV, no fees" : "")) },
      { key: "sale_value", label: "Value", num: true, fmt: (p) => fmt.eur.format(p.sale_value) },
      { key: "cost", label: "Your cost", num: true, fmt: (p) => fmt.eur.format(p.cost) },
      { key: "gain", label: "Gain", num: true, fmt: (p) => pfTone(p.gain, pfE(p.gain)) },
      { key: "rate", label: "Rate", num: true, hideSm: true, fmt: (p) => h("span", { "data-tip": p.rate.basis, tabindex: "0" }, rateTxt(p.rate)) },
      { key: "tax", label: "Tax", num: true, fmt: (p) => fmt.eur.format(p.tax) },
      { key: "sale_fee", label: "Fee", num: true, hideSm: true, fmt: (p) => fmt.eur.format(p.sale_fee) },
      { key: "cash", label: h("span", {}, "Cash from", h("br"), "sale"), sl: "Cash from sale", wide: true, title: "What each sale leaves after its tax and fee (the account's cash is added below)", num: true, fmt: (p) => fmt.eur.format(p.cash) },
      { key: "loss_credit_created", label: "Credit", num: true, hideSm: true, fmt: (p) => h("span", { "data-tip": `A loss credit (fees${p.gain < 0 ? " and the loss" : ""}), usable until ${pfDay(tt.credit_expires)} only against gains on shares, ETCs, bonds or derivatives`, tabindex: "0" }, fmt.eur.format(p.loss_credit_created)) }],
    rows: t.positions, foot: { name: h("b", {}, "Total"), sale_value: fmt.eur.format(tt.sale_value), gain: pfTone(tt.gain, pfE(tt.gain)), tax: fmt.eur.format(tt.tax), sale_fee: fmt.eur.format(tt.fees),
      cash: fmt.eur.format(tt.cash_if_sold - tt.cash_included), loss_credit_created: fmt.eur.format(tt.loss_credit_created) } }),
    tt.per_100 ? h("div", { class: "pf-per100" }, h("span", { class: "section-l" }, "Each €100 of today's value, if sold: cash, tax and fees"),
      stackBar([{ name: "cash", share: tt.per_100.cash / 100, color: "var(--s1)" }, { name: "tax", share: tt.per_100.tax / 100, color: "var(--s2)" }, { name: "fees", share: Math.max(0.004, tt.per_100.fees / 100), color: "var(--s3)" }], { w: "100%", label: `cash €${fmt.n2.format(tt.per_100.cash)}, tax €${fmt.n2.format(tt.per_100.tax)}, fees €${fmt.n2.format(tt.per_100.fees)}` }),
      legend([{ c: "var(--s1)", label: "cash", value: `€${fmt.n2.format(tt.per_100.cash)}`, style: "box" }, { c: "var(--s2)", label: "tax", value: `€${fmt.n2.format(tt.per_100.tax)}`, style: "box" }, { c: "var(--s3)", label: "fees", value: `€${fmt.n2.format(tt.per_100.fees)}`, style: "box" }])) : null,
    ledger([
      { op: "", label: "Sale value at the bid", value: fmt.eur.format(tt.sale_value) },
      { op: "−", label: "Tax withheld by Trade Republic", small: tt.upper_bound ? "upper bound" : "26% of the gain", value: fmt.eur.format(tt.tax) },
      { op: "−", label: "Fees", small: `€1 × ${t.positions.length}`, value: fmt.eur.format(tt.fees) },
      { op: "+", label: "Cash already on the account", value: fmt.eur.format(tt.cash_included) },
      { op: "=", label: "Cash if you sold everything today", value: fmt.eur.format(tt.cash_if_sold), cls: "result" }]),
    h("ol", { class: "pf-rules" },
      h("li", {}, "An ETF gain is taxed at 26% with no deductions (DL 66/2014 art. 3; TUIR art. 45; ", pfLink("Circ. 21/E/2014", PF_SRC.S13, true), ")."),
      h("li", {}, "The €1 fee does not reduce an ETF gain; it becomes a €1 loss credit usable only against gains on shares, bonds, ETCs or derivatives within four years."),
      h("li", {}, "Trade Republic withholds the tax at the sale (", pfLink("CA 7/2026, Appendix 12", PF_SRC.S16, true), ").")));

  /* BOLL (section 7, exact content) */
  const law = c.kpi.stamp_duty.per_law;
  pfSet(bollBody, 
    h("div", { class: "pf-conflict" },
      h("div", {}, h("div", { class: "pf-big" }, "€0 a year"), h("small", {}, "Trade Republic's help page")),
      h("div", {}, h("div", { class: "pf-big" }, `${fmt.eur.format(law)} a year`), h("small", {}, `the law's 0.2% on ${fmt.eur.format(c.inputs.value)}`))),
    h("ul", { class: "pf-srcs" },
      h("li", {}, h("b", {}, "A · The law. "), pfLink("DPR 642/1972, Tariffa parte I, art. 13 c.2-ter and nota 3-ter", PF_SRC.S6, true), ": 0.2% a year (“2 per mille”) on the market value of financial products reported to the client; no cap for individuals. Read on Normattiva, as in force 24 Sep 2026."),
      h("li", {}, h("b", {}, "A′ · The law, products held abroad. "), pfLink("DL 201/2011 art. 19 c.18 and c.20 (IVAFE)", PF_SRC.S7, true), ": also 0.2% a year. Whether commi 18–21 were repealed by D.Lgs. 123/2025 is unresolved: two readings of Normattiva disagree."),
      h("li", {}, h("b", {}, "B · Trade Republic. "), pfLink("Support article 719 (it-it)", PF_SRC.S18, true), ": “Al conto titoli non vengono applicate imposte di bollo”. Undated; read as raw text on 24 Sep 2026.")),
    h("p", { class: "lede" }, `SV Terminal cannot tell which applies to your account. Until it is settled, SV Terminal shows both figures and leaves stamp duty out of ‘cash if sold’ (it is a yearly charge, not a sale cost). If it applies, it is the same 0.2% rate on both paths of a switch comparison. Staying, which keeps the unpaid tax invested, would pay about 0.2% of that tax a year more${tt.tax > 0 ? ` (≈${fmt.eur.format(0.002 * tt.tax)} today)` : ""}, a small change to a switch comparison.`),
    pfNote("What would settle it: whether a stamp-duty or IVAFE line appears in Trade Republic's documents for your account (not checked by SV Terminal)."));

  /* DRAG */
  pfDrag(dragBody, dragTools, c);

  /* SWCH */
  const sw = t.switch;
  if (sw) {
    const byR = {};
    sw.table.forEach((x) => { (byR[x.r] = byR[x.r] || { r: x.r })[x.years] = x.gap; });
    const perPos = sw.method === "per_position";
    const ws = sw.with_spread;
    pfSet(swBody, 
      ledger([
        { op: "", label: "Market value (M0)", small: "at the bid", value: fmt.eur.format(sw.M0) },
        { op: "−", label: "Tax on the gain (T0)", small: perPos ? "Σ per-position tax: a loss does not reduce another fund's tax" : `26% × ${fmt.eur.format(sw.G0)}`, value: fmt.eur.format(sw.T0) },
        { op: "−", label: "Fees", small: `€1 × ${sw.positions} sale + €1 purchase`, value: fmt.eur.format(sw.fees) },
        { op: "=", label: "A single new purchase would get (I0)", value: fmt.eur.format(sw.I0), cls: "total" },
        { cls: "gap" },
        { op: "", label: "The wrong comparison: M0 − I0", small: "not the cost: staying also owes the tax when it sells", value: fmt.eur.format(sw.wrong_gap) },
        { op: "", label: "The right comparison today", small: "cashed out, fees only", value: fmt.eur.format(sw.right_gap_today), cls: "result" },
        ws ? { op: "", label: `With the assumed ${fmt.p2.format(ws.half_spread)} spread`, small: "purchase and later sale, as Explore", value: fmt.eur.format(ws.gap) } : null].filter(Boolean)),
      perPos ? pfNote("One holding is at a loss: each position's gain is taxed on its own, and a fund's loss only becomes a credit that fund gains cannot use. No single-G0 formula applies, so the table is computed position by position.")
        : pfNote(`Deferral, same growth factor A on both paths, same 26%: ${sw.formula}; here τ(1−τ)·G0 = ${fmt.eur.format(sw.deferral_factor)}.`),
      table({ cls: "compact pf-stay", cols: [{ key: "r", label: "Stay − switch, before spreads", title: "Stay minus switch if both earn the same yearly rate: fees only, before the assumed spread", fmt: (x) => h("span", { class: "nm" }, `both earn ${fmt.p0.format(x.r)} a year`) },
        ...[1, 5, 10, 20].map((y) => ({ key: String(y), label: `${y} yr`, num: true, hideSm: y === 1, fmt: (x) => fmt.eur.format(x[y]) }))], rows: Object.values(byR) }),
      h("p", { class: "note" }, "What would the whole amount have done in another fund? ", pfLink("Explore →", sw.explore_link || "#/explore")));
  } else pfSet(swBody, empty("Nothing held."));

  /* ZAIN */
  pfZain(zainBody, t);

  /* LAWS */
  pfLaws(lawBody);
}

function pfDragQuery() {
  const p = pfPrefs().drag || {};
  const q = [];
  if (p.g) q.push(`g=${p.g}`);
  if (p.monthly) q.push(`monthly=${p.monthly}`);
  if (p.compare) q.push(`compare=${p.compare}`);
  return q.length ? `?${q.join("&")}` : "";
}
function pfDrag(el, tools, c) {
  const p = pfPrefs().drag || {};
  const monthly = h("input", { type: "number", class: "inp pf-num", min: "0", max: "100000", step: "50", value: p.monthly || 0, "aria-label": "Monthly saving, €" });
  const g = h("select", { "aria-label": "Yearly growth, an input" }, [-2, 0, 2, 4, 5, 6, 8].map((x) => h("option", { value: x / 100 }, `${x}%`)));
  g.value = String(p.g || 0);
  const cmp = h("select", { "aria-label": "Compare with a catalogue fund's TER" }, h("option", { value: "" }, "compare a TER…"), (c.choices || []).map((x) => h("option", { value: x.isin }, `${x.label} · ${fmt.p2.format(x.ter)}`)));
  cmp.value = p.compare || "";
  const go = async () => {
    pfSave({ drag: { g: +g.value || 0, monthly: Math.max(0, +monthly.value || 0), compare: cmp.value || null } });
    try { const d = await api(`/api/portfolio/costs${pfDragQuery()}`); draw(d); } catch (e) { pfFail(el, e); }
  };
  monthly.addEventListener("change", go); g.addEventListener("change", go); cmp.addEventListener("change", go);
  pfSet(tools, h("label", { class: "pf-field" }, "Monthly saving €", monthly), h("label", { class: "pf-field" }, "Growth a year", g), h("span", { class: "grow" }), cmp);
  const draw = (d) => {
    const flagCell = (x) => (x.flag ? pfFlag(x.flag, "Stamp duty: two sources disagree. The law says 0.2% a year; Trade Republic's help page says none is applied.") : null);
    const tbl = (rows, title, eurKey, shareKey) => [h("div", { class: "section-l" }, title), table({ cls: "compact", stack: true, cols: [
      { key: "row", label: "Yearly cost", lead: true, fmt: (x) => h("span", { class: "pf-inline" }, h("span", { class: "nm" }, x.row), flagCell(x)) },
      ...["10", "20", "30"].map((n) => ({ key: `s${n}`, label: `${n} yr`, num: true, fmt: (x) => fmt.p2.format(x[shareKey][n]) })),
      ...["10", "30"].map((n) => ({ key: `e${n}`, label: `€, ${n} yr`, num: true, hideSm: n === "10", fmt: (x) => fmt.eur0.format(x[eurKey][n]) }))], rows })];
    pfSet(el, 
      ...tbl(d.drag, `Lump sum: today's ${fmt.eur0.format(d.inputs.value)}, as a share of the final pot${d.inputs.g ? `, growing ${fmt.p0.format(d.inputs.g)} a year (an input, not a forecast)` : " (no growth assumed)"}`, "eur", "lump"),
      ...(d.monthly ? tbl(d.monthly, `Saving ${fmt.eur0.format(d.inputs.monthly)} a month`, "eur", "share") : []),
      h("div", { class: "section-l" }, "The 30-year fund-fee figure, line by line"),
      ledger([
        { op: "", label: "Today's value", small: d.inputs.g ? `grown ${fmt.p0.format(d.inputs.g)} a year for 30 years` : "no growth assumed", value: fmt.eur.format(d.drag[0].pot["30"]) },
        { op: "×", label: `(1 − ${fmt.p2.format(d.drag[0].ter)}) thirty times`, small: "what the TER leaves each year, compounded", value: PF_N3.format(d.drag[0].keep["30"]) },
        { op: "=", label: "After 30 years of fund fees", value: fmt.eur.format(d.drag[0].net["30"]), cls: "total" },
        { op: "", label: "Removed by the fees", small: `${fmt.p2.format(d.drag[0].lump["30"])} of the pot`, value: fmt.eur.format(d.drag[0].eur["30"]), cls: "result" },
        { op: "", label: "Removed by fees and stamp duty, if charged", small: `${fmt.p2.format(d.drag[2].lump["30"])} of the pot`, value: fmt.eur.format(d.drag[2].eur["30"]) }]),
      pfNote(`Fund fees this year: ${fmt.eur.format(d.kpi.fund_fees_year)} (TER ${fmt.p2.format(d.kpi.ter_weighted)} of today's value). "€" is what the cost removes by then, in euros of that year.`));
  };
  draw(c);
}

function pfZain(el, t) {
  if (!t.ledger.available) {
    pfSet(el, h("div", { class: "pf-split pf-split-even" },
      h("div", { class: "pf-main" }, empty("Realised gains, the tax withheld and your loss credits need your Trade Republic CSV: they come from its sale rows and its tax column.", h("a", { class: "btn sm", href: "#/portfolio/impt" }, "Import CSV"))),
      h("div", { class: "pf-side" }, h("div", { class: "section-l" }, "Loss credits, the rules"),
      table({ cls: "compact pf-wraptable", stack: true, cols: [{ key: "a", label: "A loss credit from", lead: true, fmt: (x) => h("span", { class: "nm" }, x.a) }, { key: "b", label: "can offset", wide: true }, { key: "c", label: "until", wide: true }], rows: [
        { a: "An ETF sold at a loss", b: "shares, ETCs, bonds, derivatives; never ETF gains", c: "31 Dec, year + 4" },
        { a: "Fees on an ETF sale", b: "the same", c: "31 Dec, year + 4" },
        { a: "A share or ETC at a loss", b: "the same", c: "31 Dec, year + 4" }] }),
      pfNote(`Selling everything today would create ${fmt.eur.format(t.totals.loss_credit_created)} of credit, usable until ${pfDay(t.totals.credit_expires)} (TUIR art. 68 c.5; D.Lgs. 461/97 art. 6 c.5).`))));
    return;
  }
  pfSet(el, 
    t.ledger.incomplete ? pfFlag("incomplete", "Some CSV rows are not counted: these totals are incomplete.") : null,
    !(t.realised || []).length ? pfNote("No sales in the file: nothing realised yet, so no tax was withheld on gains.") : table({ cls: "compact", stack: true, cols: [{ key: "year", label: "Year", lead: true, fmt: (x) => h("span", { class: "nm" }, x.year) },
      { key: "capital_income", label: "ETF gains", num: true, fmt: (x) => fmt.eur.format(x.capital_income) },
      { key: "tax_csv", label: "Tax per CSV", num: true, fmt: (x) => fmt.eur.format(x.tax_csv) },
      { key: "tax_bussola", label: "SV Terminal", num: true, fmt: (x) => fmt.eur.format(x.tax_bussola) },
      { key: "difference", label: "Difference", num: true, fmt: (x) => pfTone(x.difference, pfE(x.difference)) }], rows: t.realised || [] }),
    h("div", { class: "section-l" }, "Loss credits"),
    (t.credits || []).length ? table({ cls: "compact", rowCls: (x) => (x.expired ? "out" : null), cols: [{ key: "date", label: "From", fmt: (x) => pfDay(x.date) }, { key: "origin", label: "Origin" },
      { key: "amount", label: "Amount", num: true, fmt: (x) => fmt.eur.format(x.amount) }, { key: "left", label: "Left", num: true, fmt: (x) => (x.expired ? h("span", { class: "dim" }, fmt.eur.format(x.left)) : fmt.eur.format(x.left)) },
      { key: "expires", label: "Expires", fmt: (x) => (x.expired ? h("span", { class: "dim" }, `lapsed on ${pfDay(x.expires)}`) : pfDay(x.expires)) }], rows: t.credits }) : pfNote("No loss credits in the file."),
    pfNote("Credits can offset gains on shares, ETCs, bonds and derivatives; never ETF gains."));
}

async function pfLaws(el) {
  let n;
  try { n = await pfGet("/api/notes", "notes", 3600_000); } catch (e) { pfFail(el, e); return; }
  let all = false;
  const map = [["ETF gain = capital income", "TUIR art. 44 c.1 lett. g", "D.Lgs. 117/2026 art. 46 c.1 lett. h"], ["No deductions", "TUIR art. 45 c.1", "art. 47"],
    ["ETF loss = reddito diverso", "TUIR art. 67 c.1 lett. c-ter", "art. 76 c.1 lett. f"], ["ETC gain or loss", "TUIR art. 67 c.1 lett. c-quater", "art. 76 c.1 lett. g"],
    ["Offsetting, four years", "TUIR art. 68 c.5; D.Lgs. 461/97 art. 6 c.5", "art. 77 c.6; art. 306 c.6"], ["Weighted average cost", "D.Lgs. 461/97 art. 6 c.4", "art. 306 c.5"],
    ["Fund withholding, 26%", "L. 77/1983 art. 10-ter; DL 66/2014 art. 3 c.1", "D.Lgs. 33/2025 art. 59"], ["Government bonds at 48.08%", "DL 66/2014 art. 3; Circ. 19/E/2014", "arts. 304 c.1, 306 c.1; D.Lgs. 33/2025 art. 59 c.3"]];
  const draw = () => {
    const items = all ? n.tax : n.tax.slice(0, 4);
    pfSet(el, 
      h("div", { class: "pf-laws pf-laws-2" }, items.map((x) => h("div", { class: "pf-law" },
        h("div", { class: "pf-inline" }, h("b", {}, x.title), x.status === "conflict" ? pfFlag("stamp_conflict", "Two sources disagree: see panel 2.") : h("span", { class: `badge ${/^verified/.test(x.status || "") ? "ok" : "na"}` }, /^verified/.test(x.status || "") ? "verified" : x.status ? "not re-checked" : "source")),
        h("p", {}, prose(x.text)),
        h("div", { class: "pf-srclinks" }, (x.sources || [{ label: "Source", url: x.source }]).map((s) => pfLink(`${s.id ? `${s.id} ` : ""}${s.label}`, s.url, true)))))),
      !all ? h("button", { class: "btn ghost sm", type: "button", onclick: () => { all = true; draw(); } }, `Show all ${n.tax.length} rules`) : null,
      h("div", { class: "section-l" }, "From 1 Jan 2027: new article numbers, same arithmetic"),
      table({ cls: "compact pf-wraptable", stack: true, cols: [{ key: 0, label: "Rule", lead: true, fmt: (x) => h("span", { class: "nm" }, x[0]) }, { key: 1, label: "Sale before 1 Jan 2027", sl: "Before 2027", wide: true, fmt: (x) => x[1] }, { key: 2, label: "From 1 Jan 2027", sl: "From 2027", wide: true, fmt: (x) => x[2] }], rows: map }),
      pfNote("Normattiva shows D.Lgs. 117/2026 in force since 4 Jul 2026 and the TUIR articles as repealed, but its art. 377 makes the rules apply from 1 Jan 2027. Not found: a transition rule for losses realised in 2026 and used from 2027."));
  };
  draw();
}

/* ================================================================ UPDT · Import from Trade Republic */
async function pfImpt(body, base) {
  const led = base.ledger || { available: false };
  const kp = h("div");
  const dropBody = h("div", { class: "pf-slot" }), audBody = h("div", { class: "pf-slot" }), recBody = h("div", { class: "pf-slot" }), editBody = h("div", { class: "pf-slot" });
  body.append(kp,
    h("div", { class: "grid" }, pfPanel(1, "DROP", "Your CSV", { span: 5, body: dropBody, foot: "The file stays on this computer. SV Terminal never asks for your Trade Republic PIN." }),
      pfPanel(2, "AUDT", "Every row type in the file", { span: 7, body: audBody, flush: true, foot: "“Label assumed”: Trade Republic does not document these labels, so you confirm how they count." })),
    h("div", { class: "grid" }, pfPanel(3, "RECN", "Does it match the app?", { span: 12, body: recBody, flush: true })),
    h("div", { class: "grid" }, pfPanel(4, "EDIT", "Check and save", { span: 12, body: editBody })));
  pfSourceLine(led.available ? `Ledger: ${led.source} · ${led.rows} rows` : "No CSV imported yet");
  const drawKpis = (p) => pfSet(kp, kpis(
    stat("Last import", p ? "this file" : led.available ? pfDay((led.imported_at || "").slice(0, 10)) : "No CSV yet", p ? (p.filename || "") : led.available ? led.source : "holdings typed by hand until a CSV is imported", "", "hero"),
    stat("Rows", p ? fmt.n0.format(p.rows) : led.available ? fmt.n0.format(led.rows) : "—", "in the export", "", "major"),
    stat("Date range", p ? `${pfMon(p.from)} → ${pfMon(p.to)}` : led.available ? `${pfMon(led.from)} → ${pfMon(led.to)}` : "—", p ? `${pfDay(p.from)} to ${pfDay(p.to)}` : led.available ? `${pfDay(led.from)} to ${pfDay(led.to)}` : "first and last row", "", "major"),
    stat("Not counted", p ? fmt.n0.format(p.uncounted) : led.available ? fmt.n0.format(led.uncounted || 0) : "—", p ? (p.uncounted ? "unrecognised or unconfirmed rows" : "every row counted") : ""),
    stat("Positions match", p ? (p.reconcile.every((r) => r.match) ? "yes" : `${p.reconcile.filter((r) => !r.match).length} differ`) : "—", p ? "CSV vs saved now" : "after you drop a file"),
    stat("Cash", p ? fmt.eur.format(p.cash) : fmt.eur.format(base.cash), p ? `computed from the file; saved ${fmt.eur.format(p.cash_saved)}` : "saved now")));
  drawKpis(null);

  /* DROP */
  let notes = { trade_republic: { steps: [] } };
  try { notes = await pfGet("/api/notes", "notes", 3600_000); } catch (_) { /* steps are optional */ }
  const input = h("input", { type: "file", accept: ".csv,text/csv", "aria-label": "Choose your CSV export" });
  const drop = h("label", { class: "drop" }, input, icon("upload", 22), h("strong", {}, "Drop your Trade Republic CSV here"), h("span", {}, "or click to choose it."));
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) read(f); });
  input.addEventListener("change", () => { const f = input.files[0]; if (f) read(f); input.value = ""; });
  const msg = h("p", { class: "error" });
  pfSet(dropBody, h("p", { class: "lede" }, prose(notes.trade_republic.intro || "")), h("ol", { class: "steps" }, (notes.trade_republic.steps || []).map((s) => h("li", {}, s))), drop, msg,
    h("button", { class: "btn ghost sm", type: "button", onclick: () => editor(null) }, "Edit by hand, without a CSV"));

  /* before a file: what the audit will do, and what is saved now */
  pfSet(audBody, table({ cls: "compact", stack: true, cols: [{ key: "p", label: "Row pattern", lead: true, fmt: (x) => h("span", { class: "nm" }, x.p) }, { key: "k", label: "Treated as" }, { key: "s", label: "Rule source", fmt: (x) => h("span", { class: "sub" }, x.s) }], rows: [
    { p: "TRADING or CASH · BUY", k: "purchase", s: "seen in exports" }, { p: "TRADING or CASH · SELL", k: "sale", s: "seen in exports" },
    { p: "CORPORATE_ACTION · REDEMPTION and similar", k: "closed (as a sale)", s: "seen in exports" }, { p: "CORPORATE_ACTION · SPLIT", k: "split", s: "seen in exports" },
    { p: "SAVINGS_PLAN, SAVEBACK, ROUND_UP with shares", k: "purchase, needs your confirmation", s: "label assumed" },
    { p: "DIVIDEND or DISTRIBUTION on an ISIN", k: "dividend, needs your confirmation", s: "label assumed" },
    { p: "no ISIN, no shares (deposits, interest, card)", k: "cash only", s: "seen in exports" }, { p: "an account other than DEFAULT", k: "ignored (junior account)", s: "seen in exports" },
    { p: "anything else with shares", k: "not recognised: your return is marked incomplete", s: "—" }] }),
    h("div", { class: "pf-pad" }, pfKv([
      ["Two average costs", h("span", { class: "pf-wrap" }, "with buy fees (as the app may show it) and without (the ETF tax base, Circ. 21/E/2014)")],
      ["What is not in the file", h("span", { class: "pf-wrap" }, "transfers from another broker, and anything before the export's first date")],
      ["Nothing leaves this computer", h("span", { class: "pf-wrap" }, "the file is read here and saved in SV Terminal's data folder only when you press Save")],
    ])));
  pfSet(recBody, table({ cls: "compact", stack: true, cols: [{ key: "name", label: "Saved now", lead: true, fmt: (p) => h("span", { class: "pf-inline" }, h("span", { class: "tick" }, p.ticker), h("span", { class: "nm" }, p.name)) },
    { key: "shares", label: "Shares", num: true, fmt: (p) => fmt.n4.format(p.shares) }, { key: "avg_cost", label: "Average price", num: true, fmt: (p) => fmt.eur.format(p.avg_cost) },
    { key: "src", label: "Source", fmt: () => h("span", { class: "sub" }, base.source || "not set") }], rows: base.positions }),
    h("div", { class: "pf-pad" }, pfNote("After you drop a file, this table compares the CSV's shares and average cost (with fees, as the app may show it, and without fees, the ETF tax base) with what is saved now.")));
  editor(null, true);

  let csvText = null, fname = null, confirm = (led.confirmed_pairs || []).map((x) => x.join("|"));
  async function read(file) {
    msg.textContent = "";
    csvText = await file.text();
    fname = file.name;
    preview();
  }
  async function preview() {
    const ok = guard("pf-preview");                       /* a later click wins over an earlier, slower answer */
    let p;
    try { p = await post("/api/portfolio/ledger/preview", { csv: csvText, filename: fname, confirm_pairs: confirm.map((x) => x.split("|")) }); }
    catch (e) { if (ok()) msg.textContent = `Could not read the file: ${e.message}`; return; }
    if (!ok()) return;
    drawKpis(p);
    pfSet(audBody, table({ cls: "compact pf-audit", stack: true, rowCls: (x) => (x.status === "not_recognised" ? "out" : ""), cols: [
      { key: "type", label: "Category · type", lead: true, fmt: (x) => h("span", { class: "pf-inline" }, h("span", { class: "tick" }, x.category), h("span", { class: "nm" }, x.type)) },
      { key: "count", label: "Rows", num: true },
      { key: "first", label: "First → last", hideSm: true, fmt: (x) => `${dayShort(x.first)} ${x.first.slice(2, 4)} → ${dayShort(x.last)} ${x.last.slice(2, 4)}` },
      { key: "kind", label: "Treated as", fmt: (x) => (x.status === "not_recognised" ? h("b", { class: "down" }, `not recognised (rows ${x.rows.slice(0, 6).join(", ")})`)
        : x.status === "needs_confirmation" ? h("label", { class: "pf-inline" }, h("input", { type: "checkbox", checked: confirm.includes(`${x.category}|${x.type}`), onchange: (e) => {
          const k = `${x.category}|${x.type}`; confirm = e.target.checked ? [...confirm, k] : confirm.filter((c) => c !== k); preview(); } }), `count as ${x.kind === "buy" ? "purchases" : "dividends"}`)
          : ({ buy: "purchase", sell: "sale", close: "closed (sale)", split: "split", cash: "cash only", ignored: "ignored", dividend: "dividend" }[x.kind] || x.kind)) },
      { key: "rule", label: "Rule source", hideSm: true, fmt: (x) => h("span", { class: "sub" }, x.rule) }], rows: p.pairs }));
    pfSet(recBody, table({ cls: "compact", stack: true, cols: [
      { key: "name", label: "Holding", lead: true, fmt: (r) => h("span", { class: "pf-inline" }, h("span", { class: "nm" }, r.name), h("span", { class: "sub" }, r.isin)) },
      { key: "shares_csv", label: "Shares, CSV", num: true, fmt: (r) => fmt.n4.format(r.shares_csv) },
      { key: "shares_saved", label: "Saved now", num: true, fmt: (r) => (r.shares_saved == null ? "—" : fmt.n4.format(r.shares_saved)) },
      { key: "avg_with_fees", label: "Avg, with fees", num: true, fmt: (r) => (r.avg_with_fees == null ? "—" : fmt.n4.format(r.avg_with_fees)) },
      { key: "avg_ex_fees", label: "Avg, no fees (tax base)", num: true, fmt: (r) => (r.avg_ex_fees == null ? "—" : fmt.n4.format(r.avg_ex_fees)) },
      { key: "avg_saved", label: "Saved avg", num: true, fmt: (r) => (r.avg_saved == null ? "—" : fmt.n4.format(r.avg_saved)) },
      { key: "match", label: "", fmt: (r) => (r.match ? badge("match", "ok") : h("span", { class: "down" }, r.reason)) }], rows: p.reconcile }),
      h("div", { class: "pf-pad" }, pfNote(`Cash from the file: ${fmt.eur.format(p.cash)}; saved now: ${fmt.eur.format(p.cash_saved)}${p.cash_match ? " (match)" : ". Differences usually mean the export does not start at account opening."}`)));
    editor(p);
  }
  function editor(p, idle) {
    if (idle) { pfSet(editBody, pfNote("Drop a file above to fill this editor from it, or edit by hand."), h("button", { class: "btn sm", type: "button", onclick: () => editor(null) }, "Edit by hand")); return; }
    const src = p ? p.positions.map((x) => ({ isin: x.isin, name: x.name, shares: x.shares, avg_price: x.avg_cost_with_fees })) : base.positions.map((x) => ({ isin: x.isin, name: x.name, shares: x.shares, avg_price: x.avg_cost }));
    const tb = h("tbody");
    const add = (x = {}) => {
      const tr = h("tr", {},
        h("td", {}, h("input", { class: "inp", value: x.name || "", "aria-label": "Name", "data-k": "name" })),
        h("td", {}, h("input", { class: "inp", value: x.isin || "", "aria-label": "ISIN", "data-k": "isin", maxlength: "12" })),
        h("td", { class: "num" }, h("input", { class: "inp pf-num", type: "number", step: "any", min: "0", value: x.shares ?? "", "aria-label": "Shares", "data-k": "shares" })),
        h("td", { class: "num" }, h("input", { class: "inp pf-num", type: "number", step: "any", min: "0", value: x.avg_price ?? "", "aria-label": "Average price", "data-k": "avg_price" })),
        h("td", {}, h("button", { type: "button", class: "x", "aria-label": "Remove row", onclick: () => tr.remove() }, "×")));
      tb.append(tr);
    };
    src.forEach(add);
    const cash = h("input", { class: "inp pf-num", type: "number", step: "0.01", value: p ? p.cash : base.cash, "aria-label": "Cash" });
    const err = h("p", { class: "error" });
    const warn = p && p.incomplete ? h("p", { class: "callout pf-bad" }, `Your own return will be marked incomplete: ${p.uncounted} rows are not counted.`) : null;
    pfSet(editBody, 
      h("p", { class: "lede" }, p ? `From ${fname}: ${p.rows} rows, ${pfDay(p.from)} to ${pfDay(p.to)}. The average price below includes buy fees, as the Trade Republic app may show it; the tax view uses the average without fees from the file.` : "Edit shares and average price by hand. Check them against the Trade Republic app before saving."),
      h("div", { class: "table-wrap" }, h("table", { class: "table compact pf-edit" }, h("thead", {}, h("tr", {}, h("th", {}, "Name"), h("th", {}, "ISIN"), h("th", { class: "num" }, "Shares"), h("th", { class: "num" }, "Average price €"), h("th", {}))), tb)),
      h("div", { class: "pf-row" }, h("button", { type: "button", class: "btn ghost sm", onclick: () => add() }, "+ Add a holding"), h("label", { class: "pf-field" }, "Cash €", cash)),
      p && p.warnings.length ? h("ul", { class: "warnings" }, p.warnings.slice(0, 12).map((w) => h("li", {}, prose(w)))) : null,
      warn,
      h("div", { class: "pf-row" }, h("button", { class: "btn primary", type: "button", onclick: save }, "Save"), h("button", { class: "btn ghost", type: "button", onclick: () => editor(null, true) }, "Cancel")), err);
    async function save() {
      const positions = [];
      for (const tr of tb.rows) {
        const o = {};
        tr.querySelectorAll("input").forEach((i) => { o[i.dataset.k] = i.value.trim(); });
        if (!o.isin && !o.shares && !o.avg_price) continue;
        if (!o.shares || !o.avg_price) { err.textContent = `${o.name || o.isin || "A row"}: fill in shares and average price.`; return; }
        positions.push({ isin: o.isin.toUpperCase(), name: o.name, shares: +o.shares, avg_price: +o.avg_price });
      }
      try {
        if (p) await post("/api/portfolio/ledger/save", { csv: csvText, filename: fname, positions, cash: parseFloat(cash.value) || 0, confirm_pairs: confirm.map((x) => x.split("|")) });
        else await post("/api/portfolio", { positions, cash: parseFloat(cash.value) || 0, source: "entered by hand", warnings: [] });
        toast("UPDT", "Portfolio saved");
        invalidate("pf-isins", "pf-returns:", "pf-dd", "pf-fx", "pf-xray", "pf-mine");
        Router.go("portfolio", "hold");
      } catch (e) { err.textContent = `Not saved: ${e.message}`; }
    }
  }
}
