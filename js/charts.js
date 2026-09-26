"use strict";
/* Charts (TradingView Lightweight Charts 4.2.3), world map (d3), and the shared instrument drawer.
   Every colour and font is read from the app.css tokens at call time through css(): never a hex in JS,
   so the light theme, the paper workspace and retheme() all just work (FINAL_DESIGN.md §7). */

/* tokens resolve on <body> so the workspace swap (body[data-ws="paper"]) is seen too */
const css = (name) => getComputedStyle(document.body || document.documentElement).getPropertyValue(name).trim();
const CHARTS = new Set();
function rgba(color, a) {
  const c = (color || "").trim();
  if (!c.startsWith("#")) return c;
  const n = c.length === 4 ? c.slice(1).split("").map((x) => x + x).join("") : c.slice(1);
  return `rgba(${parseInt(n.slice(0, 2), 16)},${parseInt(n.slice(2, 4), 16)},${parseInt(n.slice(4, 6), 16)},${a})`;
}
const TICK_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/* The theme part of the options (also what retheme() re-applies). */
function chartTheme() {
  return {
    layout: { background: { type: "solid", color: css("--card") }, textColor: css("--axis"), fontFamily: "IBM Plex Mono, ui-monospace, monospace", fontSize: 11, attributionLogo: false },
    grid: { vertLines: { visible: false }, horzLines: { color: css("--grid"), style: 0 } },
    timeScale: { borderColor: css("--line-2") },
    crosshair: {
      vertLine: { color: css("--crosshair"), width: 1, style: 2, labelBackgroundColor: css("--raised-2") },
      horzLine: { color: css("--crosshair"), width: 1, style: 2, labelBackgroundColor: css("--raised-2") },
    },
  };
}
/* The options object every chart starts from. The TradingView credit is text in the page footer (logo off). */
function chartOptions({ euro = true, pct = false, time = false, digits = 2 } = {}) {
  const nf = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const th = chartTheme();
  return {
    autoSize: true,
    layout: th.layout,
    grid: th.grid,
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.08 }, entireTextOnly: true, minimumWidth: 64 },
    leftPriceScale: { visible: false },
    timeScale: {
      borderVisible: true, borderColor: th.timeScale.borderColor, timeVisible: time, secondsVisible: false,
      lockVisibleTimeRangeOnResize: true, fixLeftEdge: true, fixRightEdge: true, rightOffset: 0, minBarSpacing: 0.2,
      /* years as years, months as words, days as "3 Sep", intraday as HH:MM (exchange clock): never a bare day number */
      tickMarkFormatter: (t, type) => {
        if (typeof t === "number") { const d = new Date(t * 1000); return type >= 3 ? d.toISOString().slice(11, 16) : `${d.getUTCDate()} ${TICK_MONTHS[d.getUTCMonth()]}`; }
        const [y, m, dd] = typeof t === "string" ? t.split("-").map(Number) : [t.year, t.month, t.day];
        return type === 0 ? String(y) : type === 1 ? TICK_MONTHS[m - 1] : `${dd} ${TICK_MONTHS[m - 1]}`;
      },
    },
    crosshair: { mode: 1, ...th.crosshair },
    localization: {
      locale: LOCALE,
      priceFormatter: pct ? (p) => `${p > 0 ? "+" : p < 0 ? MINUS : ""}${nf.format(Math.abs(p))}%`
        : euro ? (p) => `${p < 0 ? MINUS : ""}€${nf.format(Math.abs(p))}` : (p) => `${p < 0 ? MINUS : ""}${nf.format(Math.abs(p))}`,
    },
    handleScroll: false,
    handleScale: false,
  };
}
/* Lang & Schwarz intraday timestamps are Frankfurt wall-clock time written as if UTC; the chart labels in UTC,
   so they read as exchange time as they are. A live tick carries a real epoch: move it onto the same clock. */
const BERLIN = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
function exchangeTime(epoch) {
  const g = Object.fromEntries(BERLIN.formatToParts(new Date(epoch * 1000)).map((x) => [x.type, x.value]));
  return Date.UTC(+g.year, +g.month - 1, +g.day, +g.hour, +g.minute, +g.second) / 1000;
}
function makeChart(el, { euro = true, time = false, pct = false, digits = 2 } = {}) {
  if (!window.LightweightCharts) { el.replaceChildren(h("p", { class: "fallback" }, "Charts need an internet connection (TradingView Lightweight Charts).")); return null; }
  if (el._chart) { CHARTS.delete(el._chart); try { el._chart.remove(); } catch (_) { /* already gone */ } }
  el.replaceChildren();
  const chart = LightweightCharts.createChart(el, chartOptions({ euro, pct, time, digits }));
  el._chart = chart;
  CHARTS.add(chart);
  return chart;
}
function dropChart(c) { if (c) { CHARTS.delete(c); try { c.remove(); } catch (_) { /* gone */ } } }

/* Series presets, the emphasis form: "you" is s1 with a soft fill and a price flag; the one comparison you picked
   is s2; benchmarks are greys told apart by dash style and named in the legend (no flag). Added onto core.js SERIES,
   which stays the array of categorical tokens: SERIES[0] === "--s1", SERIES.you() → series options. */
Object.assign(SERIES, {
  you: () => ({ lineColor: css("--s1"), topColor: css("--you-area-top"), bottomColor: css("--you-area-bot"), lineWidth: 2,
    priceLineVisible: false, lastValueVisible: true, crosshairMarkerRadius: 4, crosshairMarkerBorderColor: css("--card") }),
  youLine: () => ({ color: css("--s1"), lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerRadius: 4, crosshairMarkerBorderColor: css("--card") }),
  pick: () => ({ color: css("--s2"), lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerRadius: 4, crosshairMarkerBorderColor: css("--card") }),
  bench: (i = 1) => ({ color: css(`--bench-${i}`), lineWidth: 1, lineStyle: i === 1 ? 2 : i === 2 ? 1 : 3, priceLineVisible: false, lastValueVisible: false, crosshairMarkerRadius: 3 }),
  stay: () => ({ color: css("--s1"), lineWidth: 2, lineStyle: 0, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false }),
  zero: () => ({ color: css("--line-3"), lineWidth: 1, lineStyle: 0, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }),
  loss: () => ({ lineColor: css("--down"), topColor: rgba(css("--down"), 0.04), bottomColor: css("--loss-area"), lineWidth: 1,
    priceLineVisible: false, lastValueVisible: true, crosshairMarkerRadius: 3, invertFilledArea: true }),
});
const sameColor = (a, ...names) => { const x = (a || "").trim().toLowerCase(); return names.some((n) => css(n).toLowerCase() === x); };
/* area: in "you" colours (s1 or --accent) the you() preset; any other colour a soft fill of that colour */
function areaSeries(chart, color) {
  if (sameColor(color, "--s1", "--accent", "--you")) return chart.addAreaSeries(SERIES.you());
  return chart.addAreaSeries({ lineColor: color, lineWidth: 2, topColor: rgba(color, 0.22), bottomColor: rgba(color, 0),
    priceLineVisible: false, lastValueVisible: true, crosshairMarkerRadius: 4, crosshairMarkerBorderColor: css("--card") });
}
/* line: benchmark greys (--paid, --bench-1/2/3) get the dashed bench() preset with no flag; other colours a 2px line */
function lineSeries(chart, color, opts = {}) {
  for (const i of [1, 2, 3]) if (sameColor(color, `--bench-${i}`) || (i === 1 && sameColor(color, "--paid"))) return chart.addLineSeries({ ...SERIES.bench(i), ...opts });
  return chart.addLineSeries({ color, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerRadius: 4, crosshairMarkerBorderColor: css("--card"), ...opts });
}
function retheme() { CHARTS.forEach((c) => { try { c.applyOptions(chartTheme()); } catch (_) { CHARTS.delete(c); } }); }

/* One crosshair tooltip for a line/area chart: the date, then one row per series with its swatch.
   rows: [{series, label, c: "var(--s1)", fmt: (v) => text}] */
function crosshairTip(chart, el, rows) {
  chart.subscribeCrosshairMove((p) => {
    if (!p || !p.time || !p.point || p.point.x < 0 || p.point.y < 0) return hideTip();
    const r = el.getBoundingClientRect();
    const items = rows.map((row) => { const d = p.seriesData.get(row.series); return d ? h("div", { class: "row" }, h("span", {}, h("i", { class: "sw", style: `--c:${row.c}` }), row.label), h("span", { class: "num" }, row.fmt(d.value ?? d.close))) : null; }).filter(Boolean);
    if (!items.length) return hideTip();
    const t = p.time;
    const when = typeof t === "number" ? `${new Date(t * 1000).toISOString().slice(11, 16)} Rome` : typeof t === "string" ? day(t) : day(`${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`);
    showTip(r.left + p.point.x, r.top + p.point.y, [h("div", { class: "tip-h" }, when), ...items]);
  });
  el.addEventListener("mouseleave", hideTip);
}

/* ---------------------------------------------------------------- world map: one-hue ramp, --seq-1 (small) → --seq-6 (large) */
const MAP_STEPS = [{ min: 20, label: "20%+" }, { min: 5, label: "5–20%" }, { min: 2, label: "2–5%" }, { min: 1, label: "1–2%" }, { min: 0.3, label: "0.3–1%" }, { min: 0, label: "<0.3%" }];
const MAP_COLORS = ["var(--seq-6)", "var(--seq-5)", "var(--seq-4)", "var(--seq-3)", "var(--seq-2)", "var(--seq-1)"];
const ISO_NUM = { AE: "784", AT: "040", AU: "036", BE: "056", BR: "076", CA: "124", CH: "756", CL: "152", CN: "156", CO: "170", CZ: "203", DE: "276", DK: "208",
  EG: "818", ES: "724", FI: "246", FR: "250", GB: "826", GR: "300", HK: "344", HU: "348", ID: "360", IE: "372", IL: "376", IN: "356", IS: "352", IT: "380",
  JP: "392", KR: "410", KW: "414", MX: "484", MY: "458", NL: "528", NO: "578", NZ: "554", PH: "608", PL: "616", PT: "620", QA: "634", RO: "642", SA: "682",
  SE: "752", SG: "702", TH: "764", TR: "792", TW: "158", US: "840", ZA: "710", LU: "442", PE: "604", AR: "032", KY: "136", BM: "060", JE: "832" };
let WORLD = null;
async function worldMap(el, legendEl, countries) {
  if (legendEl) legendEl.replaceChildren(...MAP_STEPS.map((s, i) => h("span", {}, h("i", { style: `--c:${MAP_COLORS[i]}` }), s.label)),
    h("span", {}, h("i", { class: "none" }), "not held"));
  if (!window.d3 || !window.topojson) { el.replaceChildren(h("p", { class: "fallback" }, "The map needs an internet connection; the bars beside it carry the same numbers.")); return; }
  try { WORLD = WORLD || await (await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json",
    { integrity: "sha384-yOCJ+8ShBm8UDqtAVtAvxTDDf4gXo5edxl/YG0FmVC5OTmqVLl7utuVGBDEeZWHf" })).json(); }
  catch (e) { el.replaceChildren(h("p", { class: "fallback" }, "Map unavailable offline; the bars beside it carry the same numbers.")); return; }
  const byId = new Map(countries.filter((c) => ISO_NUM[c.iso2]).map((c) => [ISO_NUM[c.iso2], c]));
  const features = topojson.feature(WORLD, WORLD.objects.countries).features.filter((f) => f.id !== "010");
  const w = 800, hgt = 360;
  const path = d3.geoPath(d3.geoNaturalEarth1().fitExtent([[0, 2], [w, hgt - 2]], { type: "FeatureCollection", features }));
  const color = (x) => MAP_COLORS[MAP_STEPS.findIndex((s) => x >= s.min)];
  const top = [...countries].sort((a, b) => b.weight - a.weight);
  const svg = d3.create("svg").attr("viewBox", `0 0 ${w} ${hgt}`).attr("role", "img")
    .attr("aria-label", `Where the companies are listed: ${top.slice(0, 5).map((c) => `${c.name} ${fmt.n1.format(c.weight)}%`).join(", ")}${top.length > 5 ? `, and ${top.length - 5} more` : ""}`);
  svg.selectAll("path").data(features).join("path").attr("d", path)
    .attr("class", (f) => (byId.has(f.id) ? "held" : null))
    .attr("style", (f) => (byId.has(f.id) ? `--c:${color(byId.get(f.id).weight)}` : null))
    .on("pointermove", (ev, f) => {
      const c = byId.get(f.id);
      if (!c) return hideTip();
      showTip(ev.clientX, ev.clientY, [h("div", { class: "tip-h" }, c.name), h("div", { class: "row" }, h("span", {}, "Share · your €"), h("span", { class: "num" }, `${fmt.n2.format(c.weight)}% · ${fmt.eur0.format(c.eur || 0)}`))]);
    })
    .on("pointerleave", hideTip);
  el.replaceChildren(svg.node());
}

/* ---------------------------------------------------------------- instrument drawer */
async function openInstrument(isin, fallbackName) {
  openDrawer({ n: "D", code: "INST", title: fallbackName || isin, body: [skeleton(40), skeleton(260), skeleton(120)] });
  let t;
  try { t = await api(`/api/instrument?isin=${isin}`); }
  catch (e) { openDrawer({ n: "D", code: "INST", title: fallbackName || isin, body: empty(`Not available: ${e.message}`) }); return; }
  const owned = await cached("pf-isins", () => api("/api/portfolio").then((p) => p.positions.map((x) => x.isin)), 60_000).catch(() => []);
  const mine = owned.includes(isin);
  const f = t.fund, m = t.metrics || {};
  const dist = f && f.distribution === "Distributing";
  const isMoney = f && f.category === "money";
  const priceEl = h("span", { class: "big flashable" }, fmt.eur.format(Live.price(isin, t.price)));
  const dayEl = h("span", { class: "delta" });
  const updDay = (p) => { const d = t.prev_close ? p / t.prev_close - 1 : null; dayEl.textContent = `${arrow(d)} ${sign(d, fmt.p2)} today`; dayEl.className = `delta ${tone(d)}`; };
  updDay(Live.price(isin, t.price));
  const chartBox = h("div", { class: "chart md" });
  const noteEl = h("span", { class: "muted small" });
  let series = null, intraday = false;
  async function draw(r) {
    const ok = guard("drawer-chart");
    let data;
    intraday = false;
    try {
      if (r === "1d") {
        const d = await api(`/api/intraday?isin=${isin}`);
        if (d.points.length > 1) { data = d.points.map(([x, v]) => ({ time: x, value: v })); intraday = true; }
      }
      if (!data) {
        const d = await api(`/api/history?isin=${isin}&range=${r === "1d" ? "1m" : r}`);
        data = d.dates.map((x, i) => ({ time: x, value: d.prices[i] }));
      }
    } catch (e) { if (ok()) chartBox.replaceChildren(h("p", { class: "fallback" }, `Chart unavailable: ${e.message}`)); return; }
    if (!ok()) return;
    const c = makeChart(chartBox, { time: intraday });
    if (!c) return;
    series = mine ? c.addAreaSeries(SERIES.you()) : c.addLineSeries(SERIES.pick());
    series.setData(data);
    c.timeScale().fitContent();
    crosshairTip(c, chartBox, [{ series, label: f ? f.milan_ticker || t.name : t.name, c: mine ? "var(--s1)" : "var(--s2)", fmt: (v) => fmt.eur.format(v) }]);
    const first = data[0].value, last = data[data.length - 1].value;
    noteEl.replaceChildren(r === "1d" && !intraday ? "No trades today yet: last month shown · " : "", intraday ? "Today, Rome time · " : `Since ${day(data[0].time)} · `, signed(last / first - 1, fmt.p1, true));
  }
  const facts = f ? [
    ["Yearly cost", h("span", {}, `${fmt.p2.format(f.ter)} `, h("span", { class: "muted" }, `(${fmt.eur0.format(f.ter * 10000)} a year on €10,000)`))],
    ["Holdings", f.holdings ? `${fmt.n0.format(f.holdings)} ${f.holdings_kind}` : `n/a (${f.holdings_na})`],
    ["Fund size", f.fund_size_eur_m ? `${fundSize(f.fund_size_eur_m)} (${day(f.fund_size_as_of)})` : "n/a"],
    ["Index", f.index], ["Issuer", f.issuer], ["Replication", f.replication || "n/a"],
    ["Income", f.distribution], ["Domicile", f.domicile],
    /* tri-state: true → "Yes, checked {day}", false → "No, checked {day}", unknown (null) → "Not verified" (EXPLORE_SPEC X1) */
    ["Savings plan on Trade Republic", !f.savings_plan_tr || f.savings_plan_tr.available == null ? h("span", { "data-tip": (f.savings_plan_tr && f.savings_plan_tr.how) || "not checked" }, "Not verified")
      : `${f.savings_plan_tr.available ? "Yes" : "No"}, checked ${day(f.savings_plan_tr.checked)}`], ["Milan ticker", f.milan_ticker || "n/a"],
  ] : [];
  openDrawer({ n: "D", code: f ? f.milan_ticker || "ETF" : "INST", title: t.name, body: [
    h("div", { class: "inst-meta" }, f ? h("span", { class: "tick" }, f.milan_ticker || "ETF") : null, h("span", {}, f ? f.wrapper || "ETF" : "Instrument"), h("span", {}, "·"), h("span", {}, isin),
      mine ? badge("Yours", "you") : null, f && f.distribution ? h("span", {}, `· ${f.distribution}`) : null),
    h("div", { class: "inst-price" }, priceEl, dayEl, h("span", { class: "muted small" }, "Lang & Schwarz, indicative")),
    f && f.note ? h("p", { class: "callout" }, prose(f.note)) : null,
    h("div", { class: "chart-head" }, h("span", { class: "section-l grow" }, "Price"),
      seg([["1d", "1D"], ["1m", "1M"], ["1y", "1Y"], ["5y", "5Y"], ["max", "All"]], "1y", draw, "Period")),
    chartBox, noteEl,
    h("div", { class: "stats two" },
      stat("1-year return", dist ? "—" : sign(m.return_1y, fmt.p1), dist ? "prices exclude dividends" : "price only", dist ? "" : tone(m.return_1y)),
      stat("5 years, per year", dist ? "—" : sign(m.return_5y_pa, fmt.p1), m.from ? `data from ${month(m.from)}` : "", dist ? "" : tone(m.return_5y_pa)),
      stat(term("Worst drop"), isMoney ? "—" : sign(m.max_drawdown, fmt.p1), !isMoney && m.drawdown_trough ? `${dayShort(m.drawdown_peak)} ${m.drawdown_peak.slice(0, 4)} → ${dayShort(m.drawdown_trough)} ${m.drawdown_trough.slice(0, 4)}` : isMoney ? "quotes too erratic in 2020" : "", isMoney ? "" : "down"),
      stat(term("Volatility"), m.volatility_3y != null ? `±${fmt.p1.format(m.volatility_3y)}` : "—", "typical yearly swing, last 3 years")),
    f ? [h("div", { class: "section-l" }, "Facts"), h("dl", { class: "kv" }, facts.map(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])),
      h("p", { class: "note" }, "Source: ", h("a", { href: f.source, target: "_blank", rel: "noopener" }, `${f.issuer} document`), f.source_date ? `, ${day(f.source_date)}` : "", ". Past returns do not predict future ones.")]
      : h("p", { class: "note" }, "Not in the fund list: check its yearly cost in the KID on the issuer's website. A single share is one company: if it does badly, everything you put in it does too."),
    h("div", { class: "actions" },
      h("button", { class: "btn", type: "button", onclick: () => { closeDrawer(); Router.go("alerts", "rules", { isin, name: t.name }); } }, "Set an alert"),
      f ? h("button", { class: "btn ghost", type: "button", onclick: () => { closeDrawer(); Router.go("explore", "compare", { add: isin }); } }, "Compare") : null),
  ] });
  const off = Live.on((key, q, prev) => {
    if (key !== isin || $("drawer").hidden) return;
    setText(priceEl, fmt.eur.format(q.mid), Live.dir(q, prev));
    updDay(q.mid);
    if (series && intraday) series.update({ time: exchangeTime(Math.floor(q.at / 60) * 60), value: q.mid });
  });
  Live.want("drawer", [isin]);
  const obs = new MutationObserver(() => { if ($("drawer").hidden) { off(); Live.want("drawer", []); obs.disconnect(); hideTip(); } });
  obs.observe($("drawer"), { attributes: true, attributeFilter: ["hidden"] });
  draw("1y");
}
