"use strict";
/* Trading Lab · operations sub-pages: COSTS, DATA (Data quality) and RULES (Method) (LAB_SPEC §13.7, §13.9, §13.10).
   Registered into window.LabViews; helpers from LabUI (lab.js). Every spread figure carries the proxy note:
   Lang & Schwarz quotes stand in for Trade Republic's unpublished Best Price spread. */

window.LabViews = window.LabViews || {};

const LAB_WINDOWS = { "0935": "09:35", "1725": "17:25", "1735": "17:35", "2250": "22:50" };
const LAB_WORDER = ["0935", "1725", "1735", "2250"];       /* numeric-looking keys would otherwise sort first */
/* the next quote window, Berlin time (weekdays), for the empty states */
function labNextWindow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hourCycle: "h23", weekday: "short", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  const now = +p.hour * 60 + +p.minute, wk = p.weekday !== "Sat" && p.weekday !== "Sun";
  const w = LAB_WORDER.map((k) => [k, LAB_WINDOWS[k]]).find(([k]) => wk && +k.slice(0, 2) * 60 + +k.slice(2) > now);
  return w ? `${w[1]} Berlin today` : "09:35 Berlin on the next session";
}

/* ================================================================ COSTS */
LabViews.costs = async (el, ctx, wait) => {
  const U = LabUI, { sum, params } = ctx;
  let days = +(params.get("days") || 60);
  if (!(days >= 1 && days <= 400)) days = 60;
  const daySeg = seg([["20", "20 d"], ["60", "60 d"], ["120", "120 d"], ["250", "250 d"]], String(days), (d) => Router.go("lab", "costs", { days: d }), "Days of quotes");
  el.append(...ctx.head(h("span", { class: "lab-actl" }, "Quotes from the last"), daySeg), wait);
  const [C, bm, bx] = await Promise.all([U.get(`/api/lab/costs?days=${days}`), U.get("/api/lab/book?id=MAIN&window=live").catch(() => null), U.get("/api/lab/book?id=MAIN-X&window=live").catch(() => null)]);
  if (!ctx.alive()) return;
  wait.remove();
  if (C.state === "not_started") { el.replaceChildren(); labGate(el, "costs", C); return; }
  const k = C.kpi || {};
  const rt10 = (C.round_trip || []).find((r) => r.ticket === 10000);
  U.caveat(el, h("div", { class: "lab-strip note", role: "note" }, badge("Proxy", "ref"), h("span", {}, prose(C.proxy_note || "L&S quotes stand in for Trade Republic's unpublished Best Price spread."))));
  /* the page leads with the figure that exists from day one (the round trip at €10,000); the measured 22:50 half-spread
     takes the lead once 20 sessions of quotes stand behind it */
  const measured = ok2(k.median_hs_bps_2250) && (k.quote_sessions || 0) >= 20;
  const cHS = { label: "Half-spread at 22:50, median", value: ok2(k.median_hs_bps_2250) ? [U.num(k.median_hs_bps_2250, 1), h("span", { class: "of" }, " bps")] : U.na("needs quotes recorded at 22:50"),
    detail: h("span", { class: "muted" }, `measured over ${U.plural(k.quote_sessions || 0, "session")} · against ${U.num(k.assumed_hs_bps ?? 5, 1)} assumed in every book`) };
  const cRT = { label: "Round trip at €10,000", value: rt10 ? [U.num(rt10.FREE, 0), h("span", { class: "of" }, " bps")] : "—",
    detail: h("span", { class: "muted" }, rt10 ? `no-tax names · Spain ${U.num(rt10.ES, 0)} · Italy and France ${U.num(rt10.IT_FR, 0)} bps` : "") };
  el.append(U.kpis(sum, [
    { ...(measured ? cHS : cRT), tier: "hero" },
    { ...(measured ? cRT : cHS), tier: "major" },
    { label: "Hand-execution shadow vs main", tier: "major", value: h("span", { class: tone(k.main_x_vs_main) }, ok2(k.main_x_vs_main) ? sign(k.main_x_vs_main, fmt.eur) : "n/a"),
      detail: h("span", { class: "muted" }, `the main book filled by hand minus the main book, € since ${U.ds(sum.live_start)}`) },
    { label: "Sessions with 22:50 quotes", value: U.int(k.quote_sessions), detail: h("span", { class: "muted" }, "criterion C2 needs 60") },
    { label: "Transaction tax paid, live", value: U.eur(k.ftt_live_eur), detail: h("span", { class: "muted" }, "all books, since live start") },
    { label: "Fee drag · €10,000, 2 slots", value: U.pct(k.fee_drag_pa_10k_2slots, 1), detail: h("span", { class: "muted" }, "a year, one round trip a session each") },
  ]));

  /* ---------------- 1 SPRD · 2 SPST */
  const bw = C.by_window || [];
  const noQuotes = `No spread measured yet. The sampler needs the live stream in stream mode during a window; the next one is ${labNextWindow()}.`;
  const w1725 = bw.find((x) => x.w === "1725"), w2250 = bw.find((x) => x.w === "2250");
  const sv = bw.flatMap((x) => [x.median_bps, x.p90_bps]).filter(ok2);
  const groups = [...new Set(bw.flatMap((x) => Object.keys(x.by_group || {})))];
  const order = ["FREE", "IT", "FR", "ES"].filter((g) => groups.includes(g)).concat(groups.filter((g) => !["FREE", "IT", "FR", "ES"].includes(g)));
  const bs = C.by_stock || [];
  const sortS = { key: "name", dir: "ascending" };
  const stBox = h("div");
  const drawStocks = () => {
    const rows = [...bs].sort((a, b) => {
      if (sortS.key === "name") return String(a.name).localeCompare(String(b.name));
      const x = sortS.key === "n" ? a.n : (a.hs_bps || {})[sortS.key], y = sortS.key === "n" ? b.n : (b.hs_bps || {})[sortS.key];
      if (x == null) return 1; if (y == null) return -1; return sortS.dir === "descending" ? y - x : x - y;
    });
    const cols = [
      { key: "name", label: "Name", sort: sortS.key === "name" ? "ascending" : true, lead: true, fmt: (r) => [h("span", { class: "nm" }, r.name), h("span", { class: "sub" }, r.isin)] },
      { key: "g", label: "FTT", fmt: (r) => U.ftt(r.ftt_group || r.group) },
      ...LAB_WORDER.map((w) => ({ key: w, label: LAB_WINDOWS[w], num: true, sort: sortS.key === w ? sortS.dir : true, fmt: (r) => ((r.hs_bps || {})[w] == null ? h("span", { class: "dim" }, "—") : U.num(r.hs_bps[w], 1)) })),
      { key: "n", label: "n", num: true, sort: sortS.key === "n" ? sortS.dir : true, fmt: (r) => U.int(r.n) }];
    stBox.replaceChildren(...U.showAll(rows, 12, (list) => table({ caption: "Half-spread by stock", cls: "compact", stack: true, rows: list, cols,
      onsort: (key) => { if (sortS.key === key) sortS.dir = sortS.dir === "descending" ? "ascending" : "descending"; else { sortS.key = key; sortS.dir = key === "name" ? "ascending" : "descending"; } drawStocks(); } }), "stocks"));
  };
  drawStocks();
  el.append(U.grid(
    card({ n: 1, code: "SPRD", title: "Spreads by time of day", span: 6, sub: "measured half-spread, bps",
      body: bw.length ? [
        U.rowPlot({ rows: bw.map((x) => ({ label: LAB_WINDOWS[x.w] || x.w, whisker: [x.median_bps, x.p90_bps], dot: x.median_bps, cls: x.w === "2250" ? "you" : "",
          value: `${U.num(x.median_bps, 1)} · p90 ${U.num(x.p90_bps, 1)}`, tip: `${LAB_WINDOWS[x.w] || x.w}: median ${U.num(x.median_bps, 1)} bps, 90th percentile ${U.num(x.p90_bps, 1)} bps, ${U.int(x.n)} quotes` })),
          lo: 0, hi: Math.max(6, ...sv) * 1.08, band: [5, 5, "5 bps: the half-spread every book assumes"], fmtx: (x) => U.num(x, Number.isInteger(x) ? 0 : 1), label: "Median and 90th percentile half-spread by quote window", rowH: 26, labelW: 46, valW: 108,
          axis: "half-spread, bps" }),
        legend([{ c: "var(--ink-2)", style: "pt", label: "median" }, { c: "var(--ink-3)", style: "line", label: "median to 90th percentile" }, { c: "var(--line-3)", style: "line", label: "5 bps assumed" }]),
        table({ caption: "Median half-spread by window and tax group", cls: "compact", rows: bw, cols: [
          { key: "w", label: "Window", fmt: (x) => LAB_WINDOWS[x.w] || x.w },
          ...order.map((g) => ({ key: g, label: g, num: true, fmt: (x) => ((x.by_group || {})[g] == null ? "—" : U.num(x.by_group[g], 1)) })),
          { key: "n", label: "Quotes", num: true, fmt: (x) => U.int(x.n) }] }),
        w1725 && w2250 && w1725.median_bps > 0 ? h("p", { class: "lede" }, h("b", {}, "Evening premium: "), `the 22:50 median is ${U.num(w2250.median_bps / w1725.median_bps, 1)}× the 17:25 median (${U.num(w2250.median_bps, 1)} against ${U.num(w1725.median_bps, 1)} bps).`) : null]
        : empty(noQuotes),
      foot: U.foot(prose(C.proxy_note || ""), `last ${days} days`, "half-spread = (ask − bid) ÷ 2 ÷ mid") }),
    card({ n: 2, code: "SPST", title: "Spreads by stock", span: 6, flush: true, sub: "median half-spread by window, bps",
      body: bs.length ? stBox : U.pad(empty(noQuotes)),
      foot: "Sorted by name; select a column head to sort by it. n = sessions with a quote. The same proxy note applies." })));

  /* ---------------- 3 RECN */
  const fams = C.recon_families || [];
  const fwins = [...new Set(fams.map((f) => f.window))].sort((a, b) => a - b);
  let fw = fwins.includes(60) ? 60 : fwins[fwins.length - 1];
  const famBox = h("div");
  const drawFam = () => famBox.replaceChildren(table({ caption: "Reconciliation by family", cls: "compact lab-sticky", stack: true, rows: fams.filter((f) => f.window === fw),
    rowCls: (r) => ((r.books || []).includes("MAIN") ? "you" : ""),
    cols: [
      { key: "f", label: "Family", lead: true, fmt: (r) => [h("span", { class: "nm" }, r.family), h("span", { class: "sub" }, (r.books || []).join(", "))] },
      { key: "rows", label: "Sessions", num: true, fmt: (r) => U.int(r.rows) },
      { key: "net", label: "Net", num: true, title: "bps a session, as booked", fmt: (r) => U.sbps(r.net_bps_session) },
      { key: "rp", label: "Re-priced", num: true, title: "bps a session at measured spreads", fmt: (r) => U.sbps(r.repriced_bps_session) },
      { key: "se", label: "Spread error €", num: true, fmt: (r) => U.snum(r.spread_err_eur, 2) },
      { key: "he", label: "Hand error", num: true, title: "bps, MAIN-X only", fmt: (r) => (r.hand_err_bps == null ? h("span", { class: "dim" }, "—") : U.sbps(r.hand_err_bps)) },
      { key: "fe", label: "Tax error €, max", num: true, fmt: (r) => U.num(r.ftt_err_eur_max, 2) },
      { key: "ro", label: "Rounding €", num: true, fmt: (r) => U.num(r.rounding_eur, 2) },
      { key: "dm", label: "Decisions matched", num: true, fmt: (r) => U.pct(r.decision_match_share, 0) },
      { key: "fm", label: "Fills measured", num: true, fmt: (r) => U.pct(r.fills_measured_share, 0) }] }));
  const recon = [...(C.recon || [])].sort((a, b) => (a.session < b.session ? 1 : a.session > b.session ? -1 : a.book < b.book ? -1 : 1));
  el.append(U.grid(card({ n: 3, code: "RECN", title: "Live against backtest", span: 12, flush: true,
    tools: fwins.length ? [h("span", { class: "note" }, "Window"), seg(fwins.map((x) => [String(x), `last ${x} sessions`]), String(fw), (x) => { fw = +x; drawFam(); }, "Window"), h("span", { class: "grow" }),
      h("span", { class: "note" }, "Re-priced: the same fills at the spreads measured at 22:50 instead of the assumed 0.05%.")] : null,
    body: fams.length || recon.length ? [fams.length ? famBox : null,
      recon.length ? [h("div", { class: "section-l lab-sl" }, "Main book and its shadow, session by session"),
        ...U.showAll(recon, 10, (list) => table({ caption: "Reconciliation by session", cls: "compact", stack: true, rows: list, rowCls: (r) => (r.book === "MAIN" ? "you" : ""), cols: [
          { key: "s", label: "Session", lead: true, fmt: (r) => [U.ds(r.session), h("span", { class: "sub" }, r.book)] },
          { key: "n", label: "Net", num: true, fmt: (r) => signed(r.net, fmt.p2) },
          { key: "rp", label: "Re-priced", num: true, fmt: (r) => signed(r.repriced_net, fmt.p2) },
          { key: "se", label: "Spread error €", num: true, fmt: (r) => U.snum(r.spread_err, 2) },
          { key: "he", label: "Hand error", num: true, fmt: (r) => (r.hand_err == null ? h("span", { class: "dim" }, "—") : signed(r.hand_err, fmt.p2)) },
          { key: "fe", label: "Tax error €", num: true, fmt: (r) => U.num(r.ftt_err, 2) },
          { key: "ro", label: "Rounding €", num: true, fmt: (r) => U.num(r.rounding_err, 2) },
          { key: "fm", label: "Fills measured", num: true, fmt: (r) => `${U.int(r.fills_measured)} / ${U.int(r.fills)}` },
          { key: "dm", label: "Decision match", fmt: (r) => (r.decision_match ? badge("Yes", "ok") : badge("No", "bad")) },
          { key: "co", label: "Corrections €", num: true, hideSm: true, fmt: (r) => U.num(r.corrections, 2) }] }), "sessions")] : null]
      : U.pad(empty("Reconciliation starts with the first live session.")),
    foot: "Decision match: the main book's decision re-run from its saved state gives the same orders. Hand error: the shadow's fills at quoted bid and ask against the main book's assumed fills." })));
  drawFam();

  /* ---------------- 4 HAND · 5 FTT */
  const mx = C.main_x || {};
  const hBox = h("div", { class: "chart s" });
  const mfills = [...(mx.fills || [])].reverse();
  const ft = C.ftt || {};
  const led = [...(ft.ledger || [])].reverse();
  el.append(U.grid(
    card({ n: 4, code: "HAND", title: "Could it be done by hand?", span: 6,
      body: [h("div", { class: "stats three" },
        stat("Shadow equity", U.eur(mx.equity), "MAIN-X, same orders"),
        stat("Against the main book", h("span", { class: tone(mx.vs_main_eur) }, ok2(mx.vs_main_eur) ? sign(mx.vs_main_eur, fmt.eur) : "—"), "€ since live start"),
        stat("Fills at measured quotes", U.pct(mx.fills_measured, 0), "the rest modelled")),
        bm && bx && (bm.equity_series || []).length > 1 ? [U.legend([{ label: "Main book (assumed fills)", style: "you" }, { label: "Shadow (22:50 bid and ask)", style: "pick" }]), hBox] : null,
        mfills.length ? [h("div", { class: "section-l" }, "Shadow fills: quote against the mid"),
          ...U.showAll(mfills, 6, (list) => table({ caption: "Shadow fills", cls: "compact", stack: true, rows: list, cols: [
            { key: "s", label: "Session", fmt: (f) => U.ds(f.session) },
            { key: "n", label: "Name", lead: true, fmt: (f) => [badge(f.side === "buy" ? "Entry" : "Exit", f.side === "buy" ? "paper" : ""), " ", h("span", { class: "nm" }, f.name)] },
            { key: "q", label: "Quote €", num: true, fmt: (f) => U.px(f.quote) },
            { key: "m", label: "Mid €", num: true, fmt: (f) => U.px(f.mid) },
            { key: "d", label: "Cost", num: true, title: "bps paid against the mid", fmt: (f) => U.bps(f.diff_bps) },
            { key: "src", label: "Source", fmt: (f) => [h("span", { class: "dim" }, f.source), f.size_flag ? [" ", badge("Size", "warn")] : null] }] }), "fills")]
          : empty("No quotes yet: the shadow fills at modelled prices until the sampler has run at 22:50.")],
      foot: "The shadow takes the main book's own orders and fills them at the 22:50 ask (entries) or bid (exits) of the fill session; size flag: the order was larger than the quoted size." }),
    card({ n: 5, code: "FTT", title: "Transaction tax", span: 6,
      body: [h("div", { class: "stats three" },
        stat("Taxed names", U.int(ft.in_scope), "Italy, France, Spain"),
        stat("No-tax names", U.int(ft.free), "the FREE universe"),
        stat("Same-day round trips", U.int(ft.same_day_zero), "paid 0: net purchase flat")),
        h("dl", { class: "kv" }, Object.entries(ft.rates || {}).map(([g, r]) => [h("dt", {}, `${{ IT: "Italy", FR: "France", ES: "Spain" }[g] || g}, on net purchases`), h("dd", {}, U.pct(r, 1))]),
          h("dt", {}, "Not checked, treated as 0"), h("dd", {}, (ft.unchecked || []).join(", ") || "—")),
        led.length ? [h("div", { class: "section-l" }, "Tax charged, newest first"),
          ...U.showAll(led, 9, (list) => table({ caption: "Transaction tax ledger", cls: "compact", stack: true, rows: list, cols: [
            { key: "s", label: "Session", fmt: (x) => U.ds(x.session) },
            { key: "b", label: "Book", fmt: (x) => h("span", { class: "tick" }, x.book) },
            { key: "n", label: "Name", lead: true, fmt: (x) => h("span", { class: "nm" }, x.name || x.isin) },
            { key: "q", label: "Net shares", num: true, fmt: (x) => U.int(x.q_net) },
            { key: "ba", label: "Base €", num: true, fmt: (x) => U.num(x.base, 2) },
            { key: "r", label: "Rate", num: true, fmt: (x) => U.pct(x.rate, 1) },
            { key: "t", label: "Tax €", num: true, fmt: (x) => U.num(x.ftt, 2) }] }), "rows")]
          : empty("No FTT charged yet.")],
      foot: "Per book, stock and session: the buyer pays on the net quantity bought; a flat same-day round trip pays none (cost table item it_ftt_intraday_net). Italian 0.4% is the off-exchange rate; 0.2% is tested on Robustness, cost stress." })));
  if (bm && bx && (bm.equity_series || []).length > 1) {
    U.lines(hBox, [{ label: "Main book", points: bm.equity_series, style: "you", fmt: (x) => U.eur(x) }, { label: "Shadow", points: bx.equity_series, style: "pick", fmt: (x) => U.eur(x) }], { euro: true, digits: 0 });
  }

  /* ---------------- 6 SIZE · 7 RTRP */
  const cp = C.capital || {};
  const crow = cp.rows || [];
  const pols = [...new Set(crow.map((r) => r.policy))];
  const sizeRows = pols.flatMap((p) => [{ __group: `${p}${p === cp.policy ? " · champion" : ""}`, __n: null }, ...crow.filter((r) => r.policy === p)]);
  const rts = C.round_trip || [];
  const ex = rts.find((r) => r.ticket === 10000) || rts[0];
  el.append(U.grid(
    card({ n: 6, code: "SIZE", title: "Fee against book size", span: 6, flush: true, sub: "per year, validation",
      body: crow.length ? [table({ caption: "Fee against book size", cls: "compact", rows: sizeRows, cols: [
        { key: "b", label: "Book", num: true, fmt: (r) => U.eur(r.book, 0) },
        { key: "t", label: "Trades", num: true, fmt: (r) => U.num(r.trades_pa, 0) },
        { key: "f", label: "Fees", num: true, fmt: (r) => signed(r.fee_pa, fmt.p1) },
        { key: "s", label: "Spread", num: true, fmt: (r) => signed(r.spread_pa, fmt.p1) },
        { key: "x", label: "Tax", num: true, fmt: (r) => signed(r.ftt_pa, fmt.p1) },
        { key: "n", label: "Net", num: true, fmt: (r) => signed(r.net_pa, fmt.p1) },
        { key: "a", label: "After tax", num: true, title: "total over the window after the 26% tax on gains, approximate", fmt: (r) => signed(r.after_tax, fmt.p1) }] }),
        U.pad(h("p", { class: "note" }, "Fees, spread and tax: what each cost took from the book a year. Net: the yearly net return (CAGR). After tax: the whole window after the 26% tax on gains, approximate."),
          h("p", { class: "lede lab-formula" }, "N daily round trips cost 2 × N × €1 × 252 ÷ book a year. At €10,000 with 2 names: 2 × 2 × €1 × 252 ÷ €10,000 = ", h("b", {}, "10.1% a year"), " in fees alone."))]
        : U.pad(empty("Computed at registration.")),
      foot: "Arithmetic on paper trades from the capital drill (DR-CAP), not a suggested amount. A book below €1,000 per ticket places no trade." }),
    card({ n: 7, code: "RTRP", title: "Round-trip arithmetic", span: 6, flush: true,
      body: rts.length ? [table({ caption: "Round-trip cost by ticket", cls: "compact", rows: rts, cols: [
        { key: "t", label: "Ticket", num: true, fmt: (r) => U.eur(r.ticket, 0) },
        { key: "f", label: "No tax, bps", num: true, fmt: (r) => U.num(r.FREE, 0) },
        { key: "e", label: "Spain, bps", num: true, fmt: (r) => U.num(r.ES, 0) },
        { key: "i", label: "Italy, France, bps", num: true, fmt: (r) => U.num(r.IT_FR, 0) },
        { key: "d", label: "Drag a year", num: true, title: "no-tax names, one round trip every session", fmt: (r) => U.pct(r.drag_pa_free, 1) }] }),
        ex ? U.pad(h("div", { class: "section-l" }, `How ${U.eur(ex.ticket, 0)} works out`),
          ledger([
            { op: "", label: "Two orders at €1", small: `2 × €1 ÷ ${U.eur(ex.ticket, 0)}`, value: `${U.num(20000 / ex.ticket, 1)} bps` },
            { op: "+", label: "Spread both ways", small: "2 × 0.05%", value: "10.0 bps" },
            { op: "=", label: "No-tax names", value: `${U.num(ex.FREE, 0)} bps`, cls: "total" },
            { op: "+", label: "Spanish tax on the purchase", small: "0.2%", value: `${U.num(ex.ES - ex.FREE, 0)} bps` },
            { op: "", label: "or Italian and French tax", small: "0.4%", value: `${U.num(ex.IT_FR - ex.FREE, 0)} bps` },
            { op: "×", label: "Every session for a year", small: "252 sessions", value: `${U.pct(ex.drag_pa_free, 1)} drag`, cls: "result" }])) : null]
        : U.pad(empty("No schedule.")),
      foot: "Round trip c(T) = 2 × €1 ÷ T + 2 × half-spread + tax. Learner books enter only when the forecast is at least k × c(T). The cost table of 24 Sep 2026." })));

  /* ---------------- 8 TAX (season 2): the Italian tax ledger of every book */
  const taxBox = h("div", { class: "lab-tax" });
  const bookSel = h("select", { "aria-label": "Book" });
  const drawTax = async (bid) => {
    taxBox.replaceChildren(skeleton(200));
    let X;
    try { X = await U.get(`/api/lab/tax?book=${encodeURIComponent(bid)}`, 60_000); }
    catch (e) { if (el.isConnected) taxBox.replaceChildren(empty(/404/.test(e.message) ? `No live tax ledger for ${bid} yet.` : `Not available: ${e.message}`)); return; }
    if (!el.isConnected || X.state === "not_started") return;
    if (!bookSel.options.length) bookSel.replaceChildren(...(X.all_books || []).map((b) => h("option", { value: b.book, selected: b.book === bid ? true : null }, b.book === "MAIN" ? "MAIN · main book" : b.book)));
    const yrs = X.by_year || [], cr = X.credits || [], sales = X.sales || [];
    U.fill(taxBox,
      h("div", { class: "stats four" },
        stat("Tax withheld", U.eur(X.withheld_total_eur), "26% of realised gains, after credits"),
        stat("Credits outstanding", U.eur(X.credits_total_eur), X.earliest_expiry ? `oldest usable to ${U.d(X.earliest_expiry)}` : "none"),
        stat(U.tl("Tax if sold tonight", "What a full sale at tonight's marks would withhold, using the credits. After tax = the book less this; exit fees and spread are not deducted."), U.eur(X.deferred_tax_eur), `credits lapsed so far ${U.eur(X.expired_total_eur)}`),
        stat(U.tl("Not credited", "Gross dividends of known ex-dates while the book held the stock (6 of 108 issuers known); none is ever credited. Whole-share residual: cash left by whole-share sizing."), U.eur(X.div_not_credited_eur), `dividends · whole-share residual ${U.eur(X.whole_share_residual_eur)}`)),
      h("div", { class: "two-col lab-two" },
        h("div", {}, h("div", { class: "section-l" }, "Withheld by year"),
          yrs.length ? table({ caption: "Tax by year", cls: "compact", rows: yrs, cols: [
            { key: "y", label: "Year", fmt: (x) => String(x.year) },
            { key: "g", label: "Gains €", num: true, fmt: (x) => U.num(x.gains, 2) },
            { key: "l", label: "Losses €", num: true, fmt: (x) => U.snum(x.losses, 2) },
            { key: "u", label: "Credits used €", num: true, fmt: (x) => U.num(x.credits_used, 2) },
            { key: "t", label: "Taxable €", num: true, fmt: (x) => U.num(x.taxable, 2) },
            { key: "w", label: "Withheld €", num: true, fmt: (x) => U.num(x.withheld, 2) },
            { key: "e", label: "Lapsed €", num: true, fmt: (x) => U.num(x.expired, 2) }] }) : h("p", { class: "note" }, "No paper sale yet."),
          h("div", { class: "section-l" }, "Credits by expiry"),
          cr.length ? table({ caption: "Credits by expiry", cls: "compact", rows: cr, cols: [
            { key: "f", label: "From", fmt: (x) => String(x.from_year) },
            { key: "e", label: "Usable until", fmt: (x) => U.d(x.expires) },
            { key: "v", label: "€", num: true, fmt: (x) => U.num(x.eur, 2) }] }) : h("p", { class: "note" }, "No credit outstanding.")),
        h("div", {}, h("div", { class: "section-l" }, "Paper sales, newest first"),
          sales.length ? U.showAll(sales, 10, (list) => table({ caption: "Paper sales and their tax", cls: "compact", rows: list, cols: [
            { key: "d", label: "Sold", fmt: (x) => U.ds(x.exited) },
            { key: "n", label: "Name", fmt: (x) => h("span", { class: "nm" }, x.name) },
            { key: "g", label: "Gain €", num: true, fmt: (x) => U.snum(x.gain_eur, 2) },
            { key: "u", label: "Credits used €", num: true, fmt: (x) => U.num(x.credit_used_eur, 2) },
            { key: "t", label: "Tax €", num: true, fmt: (x) => U.num(x.tax_eur, 2) },
            { key: "a", label: "After tax €", num: true, fmt: (x) => U.snum(x.after_tax_eur, 2) }] }), "sales") : h("p", { class: "note" }, "No paper sale yet."))),
      h("div", { class: "section-l" }, "Every live book"),
      ...U.showAll(X.all_books || [], 12, (list) => table({ caption: "Tax by book", cls: "compact", rows: list, rowCls: (b) => (b.book === bid ? "sel" : b.book === "MAIN" ? "you" : ""), onrow: (b) => { bookSel.value = b.book; drawTax(b.book); }, cols: [
        { key: "b", label: "Book", fmt: (b) => h("span", { class: "tick" }, b.book) },
        { key: "w", label: "Withheld €", num: true, fmt: (b) => U.num(b.withheld_total_eur, 2) },
        { key: "c", label: "Credits €", num: true, fmt: (b) => U.num(b.credits_total_eur, 2) },
        { key: "e", label: "Oldest usable to", fmt: (b) => (b.earliest_expiry ? U.d(b.earliest_expiry) : "—") },
        { key: "d", label: "If sold tonight €", num: true, fmt: (b) => U.num(b.deferred_tax_eur, 2) },
        { key: "v", label: "Dividends not credited €", num: true, fmt: (b) => U.num(b.div_not_credited_eur, 2) }] }), "books"),
      h("ul", { class: "lab-list lab-small" }, (X.rules || []).map((t) => h("li", {}, prose(t)))));
  };
  bookSel.addEventListener("change", () => drawTax(bookSel.value));
  el.append(U.grid(card({ n: 8, code: "TAX", title: "Tax ledger", span: 12, badges: [badge("Paper", "paper")],
    tools: [h("label", { class: "field lab-inline" }, h("span", {}, "Book"), bookSel)], body: taxBox,
    foot: "D.Lgs. 461/97 art. 6 (regime amministrato), TUIR art. 68, L. 228/2012; the ETF (X1) follows the fund rule. Today's rules are applied to all of history. Not modelled: stamp duty or IVAFE (unresolved)." })));
  drawTax("MAIN");
};

/* ================================================================ DATA */
LabViews.data = async (el, ctx, wait) => {
  const U = LabUI, { sum } = ctx;
  el.append(...ctx.head(), wait);
  const [D, C] = await Promise.all([U.get("/api/lab/data"), U.get("/api/lab/costs?days=60").catch(() => null)]);
  if (!ctx.alive()) return;
  wait.remove();
  if (D.state === "not_started") { el.replaceChildren(); labGate(el, "data", D); return; }
  const T = D.tape || {}, Q = D.quotes || {}, CL = D.closes || {}, R = D.requests || {}, DV = D.dividends || {}, F = D.flags || {};
  const man = T.manifest || [];
  const m0 = man[0] || {};
  el.append(U.kpis(sum, [
    { label: "Closes verified", tier: "hero", value: U.pct(CL.verified_share, 0), detail: h("span", { class: "muted" }, `stored closes re-read and compared · sentinel ${U.int((CL.sentinel || {}).equal)} of ${U.int((CL.sentinel || {}).checks)} equal`) },
    { label: "Last tape", tier: "major", value: m0.date ? U.ds(m0.date) : "—", detail: h("span", { class: "muted" }, m0.status ? `${m0.status} · ${U.int(m0.n_ok)} items ok` : "none yet") },
    { label: "Recorded sessions", tier: "major", value: [U.int(T.sessions_recorded), h("span", { class: "of" }, ` of ${U.int(T.live_sessions)}`)], detail: h("span", { class: "muted" }, "live sessions with an intraday tape") },
    { label: "Requests today", value: [U.int(R.today), h("span", { class: "of" }, ` / ${U.int(R.cap)}`)], detail: h("span", { class: "muted" }, `${U.int(R.errors_today)} errors · gap ≥ ${U.num(R.spacing_s ?? 1.5, 1)} s`) },
    { label: "Dividend coverage", value: [U.int(DV.issuers_covered), h("span", { class: "of" }, ` / ${U.int(DV.issuers_total)}`)], detail: h("span", { class: "muted" }, `${U.int(DV.issuers_verified)} issuer-verified`) },
    { label: "Disk", value: `${U.num(D.disk_mb_total, 1)} MB`, detail: h("span", { class: "muted" }, `tape ${U.num(T.disk_mb, 1)} · quotes ${U.num(Q.disk_mb, 1)} MB`) },
  ]));

  /* ---------------- 1 RECD · 2 COVR */
  const cov = T.coverage || [];
  el.append(U.grid(
    card({ n: 1, code: "RECD", title: "Recorder manifest", span: 7, flush: true, sub: "last 30 sessions, newest first",
      body: man.length ? U.showAll(man, 12, (list) => table({ caption: "Recorder manifest", cls: "compact", stack: true, rows: list, cols: [
        { key: "d", label: "Session", lead: true, fmt: (x) => [U.ds(x.date), x.sleepy ? h("span", { class: "sub" }, "sleepy") : null] },
        { key: "s", label: "Status", fmt: (x) => badge(x.status || "—", x.status === "complete" ? "ok" : x.status === "partial" ? "warn" : x.status === "missed" || x.status === "lost" ? "bad" : "na") },
        { key: "ok", label: "Items ok", num: true, fmt: (x) => `${U.int(x.n_ok)} / ${U.int(((x.previous_day_check || {}).items) || x.n_ok + (x.n_failed || 0) + (x.n_incomplete || 0))}` },
        { key: "f", label: "Failed", num: true, fmt: (x) => U.int(x.n_failed) },
        { key: "i", label: "Incomplete", num: true, hideSm: true, fmt: (x) => U.int(x.n_incomplete) },
        { key: "lm", label: "Last minute", num: true, fmt: (x) => x.median_last_minute || "—" },
        { key: "pd", label: "previousDay", num: true, title: "first point equals previousDay · previousDay equals the stored close", fmt: (x) => { const p = x.previous_day_check || {}; return p.items ? `${U.int(p.first_equals_previous_day)} · ${U.int(p.previous_day_equals_stored)}` : "—"; } },
        { key: "rq", label: "Requests", num: true, hideSm: true, fmt: (x) => U.int(x.requests) },
        { key: "rt", label: "Retries", num: true, hideSm: true, fmt: (x) => U.int(x.retries) },
        { key: "b", label: "KB", num: true, hideSm: true, fmt: (x) => U.int((x.bytes || 0) / 1000) }] }), "sessions")
        : U.pad(empty(`The first recording runs at 23:10 on the next session while ${U.runs("is open")}. Sessions missed until 06:55 the next morning cannot be recorded later: L&S keeps only today's intraday data.`)),
      foot: "One request per item, 1.5 s apart, after the session end. previousDay checks run Tuesday to Friday (Monday's previousDay is the Sunday session)." }),
    card({ n: 2, code: "COVR", title: "Coverage", span: 5,
      body: [cov.length ? labCoverage(cov) : empty("No live session yet."),
        h("dl", { class: "kv" }, h("dt", {}, "Insurance pass at 17:45"), h("dd", {}, T.sleepy_mode ? "on (after missed evening passes)" : "off"),
          h("dt", {}, "Quotes now"), h("dd", {}, Q.mode_now === "stream" ? "stream: windows are sampled" : `${Q.mode_now || "—"}: windows are skipped`),
          h("dt", {}, "Windows today"), h("dd", {}, (Q.windows_today || []).length ? Q.windows_today.map((w) => `${LAB_WINDOWS[w.w] || w.w} ${w.status} (${U.int(w.n)})`).join(" · ") : "none yet")),
        h("p", { class: "callout" }, U.pub ? "Recordings need the owner's computer running at 23:10 (or before 06:55 the next morning)." : prose(D.wake_note || ""))],
      foot: "The insurance pass at 17:45 switches on when 2 of the last 5 evening passes were missed." })));

  /* ---------------- 3 DAY · 4 CLOS */
  const items = ((C && C.by_stock) || []).map((x) => ({ isin: x.isin, name: x.name }));
  const dayBody = h("div", { class: "lab-day" });
  const isinSel = h("select", { "aria-label": "Stock" }, items.map((x) => h("option", { value: x.isin }, `${x.name} · ${x.isin}`)));
  const dateSel = h("select", { "aria-label": "Session" });
  const dayChartBox = h("div", { class: "chart fill" });
  let dayChart = null;
  const loadDay = async (isin, date) => {
    if (!isin || !date) { dayBody.replaceChildren(empty("Pick a recorded session.")); return; }
    dayBody.replaceChildren(skeleton(260));
    let t;
    try { t = await U.get(`/api/lab/tape?isin=${encodeURIComponent(isin)}&date=${date}`, 600_000); }
    catch (e) { dayBody.replaceChildren(empty(/404/.test(e.message) ? `No recording of this stock on ${U.d(date)}.` : `Not available: ${e.message}`)); return; }
    if (!el.isConnected) return;
    /* on the public snapshot (static.js) only the days it holds are offered: the last day of every stock, the last 60 of
       the first stock; the full tape of every stock on every day would outgrow the site */
    const snapIdx = window.BussolaStatic && window.BussolaNorm && window.BussolaStatic.index ? window.BussolaStatic.index.public || {} : null;
    const inSnap = (d) => !snapIdx || d === date || Object.prototype.hasOwnProperty.call(snapIdx, window.BussolaNorm(`/api/lab/tape?isin=${encodeURIComponent(isin)}&date=${d}`));
    if ((t.recorded_dates || []).length && !dateSel.options.length) dateSel.replaceChildren(...[...t.recorded_dates].reverse().filter(inSnap).map((d) => h("option", { value: d, selected: d === date ? true : null }, day(d))));
    if (dayChart) { dropChart(dayChart); U.charts = U.charts.filter((x) => x !== dayChart); dayChart = null; }
    const epoch = (hm) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), +hm.slice(0, 2), +hm.slice(3, 5)) / 1000;
    const pts = [...new Map((t.points || []).map(([hm, v]) => [epoch(hm), v])).entries()].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value }));
    const mk = t.marks || {}, qs = t.quotes || [];
    const MK = [["0935", "09:35"], ["1700", "17:00"], ["1725", "17:25"], ["1730", "17:30"], ["1735", "17:35"], ["2238", "22:38"], ["2250", "22:50"]];
    dayBody.replaceChildren(
      h("div", { class: "stats four" },
        stat("Previous close", U.px(t.prev_day), "previousDay"),
        stat("Close used", U.px(t.close_used), `last point ≤ 22:59 · ${t.status || ""}`),
        stat("Day", signed(t.prev_day ? t.close_used / t.prev_day - 1 : null, fmt.p2), "session end against previous"),
        stat("Updates", U.int((t.bars || {}).n_upd ?? pts.length), `${(t.bars || {}).quiet_close ? "quiet close" : `last change ${(t.bars || {}).last_change || "—"}`}`)),
      dayChartBox,
      h("div", { class: "two-col lab-two" },
        h("div", {}, h("div", { class: "section-l" }, "Marks the lab reads"),
          h("dl", { class: "kv lab-marks" }, MK.map(([key, lab]) => [h("dt", {}, lab), h("dd", {}, mk[key] != null ? U.px(mk[key]) : "—")]), h("dt", {}, "Close"), h("dd", {}, U.px(mk.last ?? t.close_used)))),
        h("div", {}, h("div", { class: "section-l" }, "Bid and ask in the quote windows"),
          qs.length ? table({ caption: "Quotes", cls: "compact", rows: qs, cols: [
            { key: "w", label: "Window", fmt: (x) => LAB_WINDOWS[x.w] || x.w },
            { key: "b", label: "Bid", num: true, fmt: (x) => U.px(x.bid) },
            { key: "a", label: "Ask", num: true, fmt: (x) => U.px(x.ask) },
            { key: "h", label: "Half-spread", num: true, fmt: (x) => U.bps(x.hs_bps) },
            { key: "g", label: "Age", num: true, fmt: (x) => `${U.num(x.age_s, 0)} s` }] }) : h("p", { class: "note" }, "No quote window was sampled for this stock on this day."))));
    if (pts.length > 1) {
      dayChart = U.lwc(dayChartBox, { euro: true, time: true, digits: 2 });
      if (dayChart) {
        const s = dayChart.addLineSeries(SERIES.youLine());
        /* whitespace points on every :00 and :30 give the time axis round places for its ticks (09:00, not 09:01) */
        const have = new Set(pts.map((p) => p.time)), ws = [];
        for (let e = Math.ceil(pts[0].time / 1800) * 1800; e < pts[pts.length - 1].time; e += 1800) if (!have.has(e)) ws.push({ time: e });
        s.setData([...pts, ...ws].sort((a, b) => a.time - b.time));
        dayChart.timeScale().applyOptions({ rightOffset: 3 });
        if (ok2(t.prev_day)) { const p = dayChart.addLineSeries({ ...SERIES.bench(1) }); p.setData([{ time: pts[0].time, value: t.prev_day }, { time: pts[pts.length - 1].time, value: t.prev_day }]); }
        const times = new Set(pts.map((p) => p.time));
        const near = (hm) => { const e = epoch(hm); let best = null; pts.forEach((p) => { if (p.time <= e) best = p.time; }); return best; };
        let lastT = -1e12;
        const marks = [...MK.map(([, lab]) => ({ time: near(lab), position: "aboveBar", color: css("--ink-3"), shape: "arrowDown", text: lab })), { time: pts[pts.length - 1].time, position: "aboveBar", color: css("--s1"), shape: "circle", text: "close" }]
          .filter((m) => m.time != null && times.has(m.time)).sort((a, b) => a.time - b.time).filter((m, i, a) => !i || m.time !== a[i - 1].time)
          .map((m) => { if (m.text !== "close" && m.time - lastT < 45 * 60) return { ...m, text: "" }; if (m.text !== "close") lastT = m.time; return m; })
          .map((m) => (m.text === "close" ? { ...m, text: "" } : m));                 // named in the foot: text at the edge clips
        s.setMarkers(marks);
        dayChart.timeScale().fitContent();
        crosshairTip(dayChart, dayChartBox, [{ series: s, label: t.name || t.isin, c: "var(--s1)", fmt: (v) => U.px(v) }]);
      }
    } else dayChartBox.replaceChildren(empty("No intraday points in this recording."));
  };
  isinSel.addEventListener("change", () => { dateSel.replaceChildren(); loadDay(isinSel.value, m0.date); });
  dateSel.addEventListener("change", () => loadDay(isinSel.value, dateSel.value));
  const sen = CL.sentinel || {};
  el.append(U.grid(
    card({ n: 3, code: "DAY", title: "One stock, one session", span: 8,
      tools: items.length ? [h("label", { class: "field lab-inline" }, h("span", {}, "Stock"), isinSel), h("label", { class: "field lab-inline" }, h("span", {}, "Session"), dateSel)] : null,
      body: dayBody,
      foot: "1-minute mids as recorded, Berlin wall-clock time; arrows at the times the lab and its probes read; the dot at the end is the close used (the last point at or before 22:59); dashed: the previous close. Recordings exist only for sessions the app was running for." }),
    card({ n: 4, code: "CLOS", title: "Close checks", span: 4,
      body: (sen.rows || []).length || sen.checks ? [h("div", { class: "stats two" },
        stat("Sentinel checks", `${U.int(sen.equal)} / ${U.int(sen.checks)}`, `equal within 0.02% · ${U.int(sen.sessions)} sessions`),
        stat("Closing minute", sen.verified_badge ? badge("Verified", "ok") : badge("Not yet", "na"), "after 20 equal days")),
        h("dl", { class: "kv" }, h("dt", {}, "Fallback to finalised history"), h("dd", {}, CL.fallback_active ? "active" : "off"),
          h("dt", {}, "Revisions recorded"), h("dd", {}, U.int((CL.revisions || []).length))),
        h("div", { class: "section-l" }, "Morning checks"),
        ...U.showAll(sen.rows || [], 12, (list) => h("div", { class: "lab-checkrows" }, list.map((r) => h("div", { class: "r" }, h("span", {}, U.ds(r.session)), h("span", { class: "dim" }, `checked ${U.when(r.at)}`),
          U.check(r.equal === r.checks, `${U.int(r.equal)} / ${U.int(r.checks)}`)))), "checks"),
        (CL.revisions || []).length ? h("p", { class: "note" }, `Latest revision: ${prose(JSON.stringify(CL.revisions[0]))}`)
          : h("p", { class: "note" }, "No revision so far: every stored close matched its finalised history point."),
        h("div", { class: "section-l" }, "Checks on every recorded item"),
        h("ul", { class: "lab-list lab-small" }, ["The first point equals L&S's previousDay.", "previousDay equals the stored close of the session before (Tuesday to Friday).",
          "No zero or negative value; every point dated the session day.", "Fetched after the session end; a last point more than 60 minutes early is flagged quiet close."].map((t) => h("li", {}, t)))]
        : empty("The first check runs the morning after the first recorded session."),
      foot: "Each morning the finalised history of Allianz, SAP and Eni is compared with the stored close. Stored closes are never rewritten; revisions are appended." })));
  if (items.length && m0.date) loadDay(items[0].isin, m0.date); else dayBody.replaceChildren(empty("Pick a recorded session."));

  /* ---------------- 5 BUDG · 6 DIVS */
  const l30 = R.last_30 || [];
  const kinds = [...new Set(l30.flatMap((x) => Object.keys(x[2] || {})))];
  const kcol = (k) => { const i = kinds.indexOf(k); return i < 5 ? `var(${CATS[i]})` : "var(--other)"; };
  const nx = DV.next_known || [];
  el.append(U.grid(
    card({ n: 5, code: "BUDG", title: "Requests to L&S", span: 6,
      body: [h("div", { class: "stats three" },
        stat("Today", `${U.int(R.today)} / ${U.int(R.cap)}`, Object.entries(R.by_kind || {}).map(([k, v]) => `${k} ${v}`).join(" · ") || "daily cap"), stat("Smallest gap", `${U.num(R.min_gap_s, 2)} s`, `rule ≥ ${U.num(R.spacing_s ?? 1.5, 1)} s`),
        stat("Errors today", U.int(R.errors_today), "no stale fallback")),
        l30.length ? [U.svgBox(170, (w, H) => {
          const pad = { l: 34, r: 6, t: 8, b: 20 }, cap = R.cap || 400, top = Math.max(cap, ...l30.map((x) => x[1] || 0)) * 1.05;
          const bwid = (w - pad.l - pad.r) / l30.length, y = U.lin(0, top, H - pad.b, pad.t);
          return U.svg(w, H, `Requests a day, last ${l30.length} days, against the cap of ${cap}`,
            U.ticks(0, top, 3).map((v) => [h("line", { x1: pad.l, x2: w - pad.r, y1: y(v), y2: y(v), class: "grid" }), U.t(pad.l - 4, y(v) + 4, U.int(v), { class: "ax", "text-anchor": "end" })]),
            l30.map(([d, tot, bk], i) => { let acc = 0; return h("g", { "data-tip": `${day(d)}: ${U.int(tot)} requests${Object.entries(bk || {}).map(([k, v]) => ` · ${k} ${v}`).join("")}` },
              Object.entries(bk || {}).map(([k, v]) => { const y0 = y(acc), y1 = y(acc + v); acc += v; return h("rect", { x: pad.l + i * bwid + 1, y: y1, width: Math.max(1, bwid - 2), height: Math.max(0, y0 - y1), style: `fill:${kcol(k)}` }); }),
              h("rect", { x: pad.l + i * bwid, y: pad.t, width: bwid, height: H - pad.b - pad.t, class: "hitr" })); }),
            h("line", { x1: pad.l, x2: w - pad.r, y1: y(cap), y2: y(cap), class: "cap" }), U.t(w - pad.r, y(cap) - 4, `cap ${cap}`, { class: "ax", "text-anchor": "end" }),
            [0, l30.length - 1].map((i) => U.t(pad.l + i * bwid + bwid / 2, H - 4, dayShort(l30[i][0]), { class: "ax", "text-anchor": i ? "end" : "start" })));
        }), legend(kinds.map((k) => ({ c: kcol(k), style: "box", label: k })))] : empty("No request logged yet.")],
      foot: "Every request goes through the lab's governor: one at a time, at least 1.5 s apart, at most 400 a day; an error never falls back to a stale file." }),
    card({ n: 6, code: "DIVS", title: "Dividends", span: 6,
      body: [h("div", { class: "stats three" },
        stat("Issuers covered", `${U.int(DV.issuers_covered)} / ${U.int(DV.issuers_total)}`, "with known ex-dates"),
        stat("Issuer-verified", U.int(DV.issuers_verified), "from the issuer's own page"),
        stat("Events on file", U.int(DV.events), "ex-dates since 2016")),
        h("div", { class: "section-l" }, "Next known ex-dates · daily books exit before them; weekly books do not enter into them; long-hold books hold through them"),
        nx.length ? table({ caption: "Next known ex-dates", cls: "compact", rows: nx, cols: [
          { key: "n", label: "Name", fmt: (x) => [h("span", { class: "nm" }, x.name), h("span", { class: "sub" }, x.isin)] },
          { key: "d", label: "Ex-date", fmt: (x) => U.d(x.ex_date) }] }) : empty("No known ex-date in the next 10 sessions."),
        h("p", { class: "note" }, prose(DV.note || ""))],
      foot: ["Ex-dates come from the issuers' own pages. ", link("Costs › tax ledger", "#/lab/costs"), " shows, per book, how much the uncredited dividends left out."] })));

  /* ---------------- 7 QUAL */
  const flagList = (label, arr, fmt1 = (x) => (typeof x === "string" ? x : x.name || x.isin || JSON.stringify(x))) =>
    h("div", { class: "lab-flag" }, h("div", { class: "section-l" }, label), (arr || []).length ? h("ul", {}, arr.map((x) => h("li", {}, prose(fmt1(x))))) : h("p", { class: "note" }, "none"));
  const anyFlag = ["frozen_today", "stale", "missing", "blocked", "possible_corporate_actions", "adjustments", "detected_closures"].some((k) => (F[k] || []).length) || (D.catchup || []).length || (D.calendar || {}).note;
  el.append(U.grid(card({ n: 7, code: "QUAL", title: "Flags", span: 12,
    body: anyFlag || F.frozen_30d ? [h("div", { class: "lab-flags" },
      flagList(`Frozen today · ${U.int(F.frozen_30d)} in 30 days`, F.frozen_today),
      flagList("Stale closes", F.stale, (x) => (typeof x === "string" ? x : `${x.name || x.isin} since ${U.d(x.since)}`)),
      flagList("Missing closes", F.missing),
      flagList("Blocked (takeovers, pinned prices)", F.blocked),
      flagList("Adjustments applied", F.adjustments),
      flagList("Possible corporate actions", F.possible_corporate_actions),
      flagList("Detected closures", F.detected_closures)),
      (D.calendar || {}).note ? h("p", { class: "callout" }, prose(D.calendar.note)) : null,
      h("div", { class: "section-l" }, "Catch-up log"),
      (D.catchup || []).length ? U.showAll([...D.catchup].reverse(), 8, (list) => table({ caption: "Catch-up log", cls: "compact", stack: true, rows: list, cols: [
        { key: "a", label: "Run at", lead: true, fmt: (x) => U.when(x.at) },
        { key: "s", label: "Sessions", fmt: (x) => (x.sessions || []).map(U.ds).join(", ") },
        { key: "r", label: "Reason", wide: true, fmt: (x) => prose(x.reason || "") },
        { key: "t", label: "Seconds", num: true, fmt: (x) => U.num(x.secs, 1) }] }), "catch-ups") : h("p", { class: "note" }, "No catch-up so far: every session was processed on its own evening.")]
      : empty("No open flags."),
    foot: "Frozen: a move over 15% against the market is held out of decisions until it is confirmed. Catch-up replays missed sessions in date order, each with the data files as the lab had seen them by that session's end; edits seen later apply from the next session." })));

  /* ---------------- 8 PUBL: the public site. publish.py is the one publisher of SV Terminal: it snapshots the whole app to
     GitHub Pages, this lab in clear and My Portfolio encrypted. On the public site the panel says only what a visitor needs. The season-2 exporter (lab_public.py) stays in
     the tree but is retired: it never pushes, and this panel no longer offers its switches. */
  const pubBox = h("div", { class: "lab-publ" });
  const drawPub = async () => {
    const snap = window.BussolaStatic || null;               // this page is itself the published snapshot
    let P = null, X = null;
    if (!snap) { try { P = await api("/api/publish/status"); } catch (_) { P = null; } }
    try { X = await U.fresh("/api/lab/public"); } catch (_) { X = null; }
    if (!el.isConnected) return;
    const site = (P && P.site_url) || (snap && snap.index && snap.index.site) || "https://vincenzosos.github.io/sv-terminal/";
    const runs = (P && P.runs) || [];
    const last = snap ? { t: (snap.index || {}).built, ok: true } : (P && P.last) || null;
    const runWord = (r) => (!r ? "" : r.ok ? (r.pushed ? "built and pushed" : r.skipped ? "built · push skipped, unchanged" : "built") : "failed");
    if (snap) {
      const cn = (snap.index || {}).counts || {};
      U.fill(pubBox, h("div", { class: "stats four" },
        stat("Site", "Updated", last && last.t ? `${U.when(last.t)} Berlin · this page's data` : "time unknown"),
        stat("Snapshots", "Every 30 min", "07:30–23:00 Berlin on weekdays, and after each nightly step"),
        stat("Answers", `${U.int(cn.public)} · ${U.int(cn.private)}`, "in clear (the Trading Lab) · encrypted (My Portfolio)"),
        stat("Access", "Read-only", "nothing can be changed or sent from here")));
      return;
    }
    U.fill(pubBox,
      h("div", { class: "stats four" },
        stat("Publisher", "publish.py", "the one publisher: plain Python on the Mac"),
        stat("Site", "GitHub Pages", h("a", { class: "lab-url", href: site, rel: "noopener" }, site.replace(/^https?:\/\//, "").replace(/\/$/, ""))),
        stat("Last snapshot", last && last.t ? U.when(last.t) : "—", snap ? "the time of this page's data" : last ? runWord(last) : P && !P.enabled ? "not switched on (data/publish/config.json)" : "none yet"),
        stat("Season-2 exporter", X && X.retired === false ? badge("Active", "warn") : badge("Retired", "na"), "lab_public.py never pushes")),
      h("div", { class: "two-col lab-two" },
        h("div", {}, h("div", { class: "section-l" }, "What the site shows"),
          h("ul", { class: "lab-list" },
            h("li", {}, "Every Trading Lab page, as this app shows it, with the full disclaimer above each page."),
            h("li", {}, "My Portfolio and Alerts: one encrypted file, opened in the visitor's browser only with the owner's code."),
            h("li", {}, "The market board stays private: it is inside the encrypted file."),
            h("li", {}, "A snapshot follows each settled lab session and runs every 30 minutes 07:30–23:00 Berlin on weekdays; an unchanged snapshot is not pushed.")),
          h("p", { class: "note" }, "Every pushed version replaces the last one; old versions can stay reachable on GitHub for a while.")),
        h("div", {}, h("div", { class: "section-l" }, snap ? "This snapshot" : "Recent runs"),
          snap ? h("dl", { class: "kv" }, h("dt", {}, "Answers in clear"), h("dd", {}, U.int(((snap.index || {}).counts || {}).public)),
              h("dt", {}, "Answers encrypted"), h("dd", {}, U.int(((snap.index || {}).counts || {}).private)),
              h("dt", {}, "Read-only"), h("dd", {}, "nothing can be changed or sent from here"))
            : runs.length ? table({ caption: "Recent publish runs", cls: "compact", rows: runs.slice(0, 6), cols: [
              { key: "t", label: "Time", lead: true, fmt: (r) => U.when(r.t) },
              { key: "g", label: "Trigger", fmt: (r) => r.trigger || "—" },
              { key: "o", label: "Result", fmt: (r) => badge(runWord(r), r.ok ? "ok" : "bad") },
              { key: "f", label: "Files", num: true, fmt: (r) => U.int(r.files) },
              { key: "s", label: "Seconds", num: true, fmt: (r) => U.num(r.secs, 0) }] })
            : h("p", { class: "note" }, P && !P.enabled ? "No run yet: the publisher starts once data/publish/config.json says {\"enabled\": true}." : "No run yet."))));
  };
  el.append(U.grid(card({ n: 8, code: "PUBL", title: "Public site", span: 12, badges: [badge("Paper", "paper")], body: pubBox,
    foot: "The lab's pages are published in clear; My Portfolio and Alerts only encrypted. Every page carries the full disclaimer: paper money only, not a financial service, not advice." })));
  drawPub();
};

/* coverage: sessions as columns; tape, quotes and sentinel as three rows of cells */
function labCoverage(cov) {
  const U = LabUI;
  const rows = [["tape", "Tape"], ["quotes", "Quotes"], ["sentinel", "Sentinel"]];
  const st = (k, x) => { const v = x[k]; if (k === "tape") return v === "complete" ? "ok" : v === "partial" ? "warn" : v ? "bad" : "no"; return v ? "ok" : "no"; };
  const counts = rows.map(([k]) => cov.filter((x) => st(k, x) === "ok").length);
  return [h("div", { class: "lab-cov", style: `--n:${cov.length}` },
    rows.map(([k, lab], i) => [h("span", { class: "lb" }, lab), h("span", { class: "cells" }, cov.map((x) => h("i", { class: st(k, x), "data-tip": `${day(x.session)} · ${lab}: ${k === "tape" ? x.tape || "none" : x[k] ? "yes" : "no"}` }))),
      h("span", { class: "ct" }, `${U.int(counts[i])}/${U.int(cov.length)}`)])),
  h("div", { class: "lab-cov-axis" }, h("span", {}, U.ds(cov[0].session)), h("span", {}, U.ds(cov[cov.length - 1].session))),
  legend([{ c: "var(--ok)", style: "box", label: "recorded" }, { c: "var(--warn)", style: "box", label: "partial" }, { c: "var(--bad)", style: "box", label: "missed" }, { c: "var(--raised-2)", style: "box", label: "none" }])];
}

/* ================================================================ RULES */
LabViews.rules = async (el, ctx, wait) => {
  const U = LabUI, { sum } = ctx;
  el.append(...ctx.head(), wait);
  let R;
  try { R = await U.get("/api/lab/rules", 600_000); }
  catch (e) { if (!ctx.alive()) return; wait.remove(); el.append(U.errorCard(`The rules could not load: ${e.message}`)); return; }
  if (!ctx.alive()) return;
  wait.remove();
  const before = R.state === "not_started" || R.state === "building" || !R.registered_at;
  if (before) el.append(h("div", { class: "lab-strip", role: "note" }, badge("Not started", "na"), h("span", {}, "The lab has not been registered yet. These are the rules it will fix at the start; the scorecard and league hashes are computed now from the code.")));
  if (R.state === "protocol_mismatch") el.append(h("div", { class: "lab-strip warn", role: "status" }, badge("Rules changed", "bad"), h("span", {}, "The code's rules differ from the registered season. Nothing is processed until that is fixed.")));
  const lg = R.league || [];
  const cnt = (k) => lg.filter((x) => x.kind === k).length;
  const fams = R.families || [];
  el.append(U.kpis(before ? null : sum, [
    { label: "Strategies", tier: "hero", value: U.int(cnt("eligible")),
      detail: h("span", { class: "muted" }, `${fams.map((f) => `${f.ids.length} ${f.label.toLowerCase()}`).join(" · ")}${R.registered_at ? ` · registered ${U.d(R.registered_at.slice(0, 10))}` : " · not registered yet"}`) },
    { label: "Decision clocks", tier: "major", value: U.int(fams.length), detail: h("span", { class: "muted" }, "after every session end · after the last session of each week · on the first session of each month") },
    { label: "Trials counted", tier: "major", value: U.int(R.trials_n), detail: h("span", { class: "muted" }, "every configuration tried on this history") },
    { label: "Season", value: R.season || "S2", detail: h("span", { class: "muted" }, R.registered_at ? `registered ${U.d(R.registered_at.slice(0, 10))} ${U.hm(R.registered_at)}` : "not registered yet") },
    { label: "Books in the league", value: U.int(lg.length), detail: h("span", { class: "muted" }, `${cnt("reference")} references · ${cnt("diagnostic")} diagnostics · ${cnt("probe")} probes beside the strategies`) },
    { label: "Significance bar", value: U.t3(R.t_hurdle), detail: h("span", { class: "muted" }, "live alpha t this season, before tax") },
  ]));

  /* ---------------- 1 CLCK */
  const tt = R.timetable || [];
  el.append(U.grid(card({ n: 1, code: "CLCK", title: "Clocks", span: 12,
    body: [U.svgBox("auto", (w, H) => labTimeline(w, H, tt, [7 * 60, 24 * 60], "The lab's day, Berlin time"), "lab-tl"),
      legend([{ c: "var(--raised)", style: "box", label: "L&S trading 07:30–23:00" }, { c: "var(--raised-2)", style: "box", label: "exchanges 09:00–17:30" },
        { c: "var(--ws)", style: "pt", label: "a lab job (hover for what it does)" }]),
      h("div", { class: "two-col lab-two" },
        h("div", {}, U.svgBox("auto", (w, H) => labTimeline(w, H, tt, [22 * 60 + 40, 23 * 60 + 50], "The evening, zoomed"), "lab-tl sm"),
        table({ caption: "Clocks", cls: "compact", stack: true, rows: R.clocks || [], cols: [
          { key: "id", label: "Clock", fmt: (c) => h("span", { class: "tick" }, c.id) },
          { key: "t", label: "What it may read and when it fills", lead: true, fmt: (c) => h("span", { class: "lab-wrap" }, prose(c.text)) },
          { key: "e", label: "Champion", fmt: (c) => (c.eligible ? badge("Eligible", "ok") : badge("Never", "na")) }] })),
        table({ caption: "Timetable", cls: "compact", stack: true, rows: tt, cols: [
          { key: "a", label: "When", wide: true, fmt: (x) => h("span", { class: "mono" }, x.at) },
          { key: "j", label: "Job", fmt: (x) => h("span", { class: "tick" }, x.job) },
          { key: "t", label: "What", lead: true, fmt: (x) => h("span", { class: "lab-wrap" }, prose(x.text)) },
          { key: "r", label: "Requests", fmt: (x) => h("span", { class: "dim" }, x.requests) }] }))],
    foot: `Berlin time, L&S sessions only; the jobs run from the app's 30-second tick while ${U.runs("is open")}. The 06:55 limit and the Saturday reconcile are in the table.` })));

  /* ---------------- 2 FEAT · 3 LRNR */
  el.append(U.grid(
    card({ n: 2, code: "FEAT", title: "Features", span: 5, flush: true, sub: "pre-registered; nothing else is computed for trading",
      body: table({ caption: "Features", cls: "compact lab-feat", stack: true, rows: R.features || [], cols: [
        { key: "n", label: "#", fmt: (f) => h("span", { class: "rk" }, f.n) },
        { key: "l", label: "Feature", lead: true, fmt: (f) => [h("span", { class: "nm" }, f.label), h("span", { class: "sub" }, f.key)] },
        { key: "d", label: "Definition · why", wide: true, fmt: (f) => h("span", { class: "lab-wrap" }, h("span", { class: "def" }, prose(f.definition)), h("span", { class: "why" }, prose(f.reason))) },
        { key: "e", label: "Evidence", fmt: (f) => h("span", { class: "lab-wrap mono dim" }, (f.evidence || []).join(" ")) }] }),
      foot: "Robust z-scores across the stocks of each session. Evidence ids refer to the reading list (panel 9)." }),
    card({ n: 3, code: "LRNR", title: "Learners", span: 7,
      body: h("div", { class: "lab-learners" }, (R.learners || []).map((l) => h("div", { class: "l" },
        h("div", { class: "hd" }, h("span", { class: "tick" }, l.id), h("span", { class: "sub" }, `${l.type} · head ${l.head}`)),
        h("p", {}, prose(l.text), l.params ? h("span", { class: "p" }, Object.entries(l.params).map(([k, v]) => h("span", {}, `${k} `, h("b", {}, Array.isArray(v) ? v.join(", ") : String(v))))) : null)))),
      foot: "Pure Python, updated once a session from labels already known; nothing is refitted or tuned by hand. Head H2 labels the session a next-close position carries; H1 is diagnostic." })));

  /* the three hashes that stop silent rule changes, in one row */
  el.append(h("div", { class: "lab-status lab-integrity", role: "note" }, badge("Integrity", "ref"),
    h("span", {}, "protocol ", h("b", { class: "mono", "data-tip": R.protocol_hash || "" }, U.sha8(R.protocol_hash)), " · rules, league, scorecard, engine"),
    h("span", {}, "league ", h("b", { class: "mono", "data-tip": R.league_sha256 || "" }, U.sha8(R.league_sha256))),
    h("span", {}, "scorecard ", h("b", { class: "mono", "data-tip": R.scorecard_sha256 || "" }, U.sha8(R.scorecard_sha256))),
    h("span", { class: "dim" }, "a change to any of them is a new season")));

  /* ---------------- 4 VARS */
  el.append(U.grid(card({ n: 4, code: "VARS", title: "Strategies", span: 12, flush: true, sub: `every book and its parameters · league ${U.sha8(R.league_sha256)}`,
    body: U.showAll(lg, U.phoneN(lg.length), (list) => table({ caption: "League definition", cls: "compact lab-sticky", stack: true, rows: list, rowCls: (r) => (r.kind === "reference" || r.kind === "diagnostic" ? "ref" : ""), cols: [
      { key: "id", label: "ID", fmt: (r) => h("span", { class: "tick" }, r.id) },
      { key: "n", label: "Name", fmt: (r) => [h("span", { class: "nm" }, U.nm(r.id, r.name)), h("span", { class: "sub mono" }, r.name)] },
      { key: "k", label: "Kind", fmt: (r) => U.kind(r.kind) },
      { key: "fm", label: "Family", fmt: (r) => (r.family && U.FAM[r.family] ? U.famWord(r.family) : "—") },
      { key: "s", label: "Source", fmt: (r) => h("span", { class: "mono" }, r.source || "—") },
      { key: "u", label: "Universe", fmt: (r) => r.universe || "—" },
      { key: "p", label: "Policy", fmt: (r) => h("span", { class: "mono" }, r.policy || "—") },
      { key: "sl", label: "Slots", num: true, fmt: (r) => (r.slots == null ? "—" : String(r.slots)) },
      { key: "kk", label: "k", num: true, fmt: (r) => (r.k == null ? "—" : U.num(r.k, 1)) },
      { key: "g", label: "Gate", fmt: (r) => r.gate || "—" },
      { key: "kp", label: "Keep / max", fmt: (r) => (r.keep != null ? `top ${r.keep}` : r.max_hold != null ? `≤ ${r.max_hold}` : "—") },
      { key: "c", label: "Clock", fmt: (r) => h("span", { class: "mono" }, r.clock || "—") },
      { key: "t", label: "In plain words", wide: true, fmt: (r) => h("span", { class: "lab-wrap" }, prose(r.text)) }] }), "books"),
    foot: `SHA-256 of the league: ${R.league_sha256 || "—"}. A change to any parameter is a new season with its own ledger line.` })));

  /* ---------------- 5 COST · 6 EVAL */
  const cs = R.costs || {}, cr = R.champion_rule || {}, cp = cr.params || {};
  el.append(U.grid(
    card({ n: 5, code: "COST", title: "Cost model", span: 6,
      body: [h("div", { class: "stats four" },
        stat("Order fee", U.eur(cs.fee_eur), "per paper order"), stat("Half-spread", `${U.num(cs.half_spread_bps, 1)} bps`, "assumed, each way"),
        stat("Minimum ticket", U.eur(cs.min_ticket_eur, 0), "fee ≤ 10 bps a side"),
        stat("Transaction tax", h("span", { class: "lab-wrapv" }, Object.entries(cs.ftt || {}).map(([g, r]) => `${g} ${U.pct(r, 1)}`).join(" · ") || "—"), "net purchases")),
        h("ul", { class: "lab-list" }, (cs.text || []).map((t) => h("li", {}, prose(t)))),
        cs.fee_eur != null && cs.half_spread_bps != null ? [h("div", { class: "section-l" }, "Round trip c(T) in bps, from these parameters"),
          table({ caption: "Round-trip arithmetic", cls: "compact", rows: [1000, 2500, 5000, 10000], cols: [
            { key: "t", label: "Ticket T", num: true, fmt: (T) => U.eur(T, 0) },
            { key: "f", label: "2 × fee ÷ T", num: true, fmt: (T) => U.num(2 * cs.fee_eur / T * 1e4, 1) },
            { key: "s", label: "+ 2 × spread", num: true, fmt: () => U.num(2 * cs.half_spread_bps, 1) },
            { key: "n", label: "No tax", num: true, fmt: (T) => U.num(2 * cs.fee_eur / T * 1e4 + 2 * cs.half_spread_bps, 1) },
            ...Object.entries(cs.ftt || {}).map(([g, r]) => ({ key: g, label: `+ ${g} tax`, num: true, fmt: (T) => U.num(2 * cs.fee_eur / T * 1e4 + 2 * cs.half_spread_bps + r * 1e4, 1) }))] })] : null],
      foot: "From the cost table (verified 24 Sep 2026); item ids in brackets." }),
    card({ n: 6, code: "EVAL", title: "Windows, statistics and the champion rule", span: 6,
      body: [table({ caption: "Windows", cls: "compact", rows: R.windows || [], cols: [
        { key: "id", label: "Window", fmt: (w) => h("span", { class: "tick" }, w.id) },
        { key: "s", label: "Span", fmt: (w) => h("span", { class: "lab-wrap" }, w.span) },
        { key: "u", label: "Use", fmt: (w) => h("span", { class: "lab-wrap dim" }, w.use) }] }),
        h("div", { class: "section-l" }, "The champion rule"),
        h("p", { class: "lede" }, prose(cr.text || "")),
        h("dl", { class: "kv" }, [["Review", cp.review], ["Score", cp.score && `${String(cp.score).toUpperCase()} over ${cp.window} sessions`], ["Minimum history", cp.min_sessions && `${cp.min_sessions} sessions, ${cp.min_trades} trades`],
          ["Minimum trades by family", cp.min_trades_by_family && Object.entries(cp.min_trades_by_family).map(([f, n]) => `${U.famWord(f).toLowerCase()} ${n}`).join(", ")],
          ["Basis", cp.score_basis && "after tax (the 26% withheld at each sale, and the tax a full sale would still withhold)"],
          ["Grade", cp.grade && `mean > ${cp.grade.mean_gt}, above the family's random picks (${Object.values(cp.beat_family_monkey || {}).join(", ")}), DSR ≥ ${cp.grade.dsr_min}, PBO ≤ ${cp.grade.pbo_max}`], ["Replacing the champion", cp.margin != null && `leads by ${cp.margin} at ${cp.consecutive} reviews in a row`], ["When nothing qualifies", cp.none]]
          .filter(([, v]) => v).map(([k, v]) => h("div", {}, h("dt", {}, k), h("dd", {}, String(v).replace(/_/g, " ")))))],
      foot: "Statistics: Newey-West t, the deflated Sharpe with every trial counted, PBO by combinatorial cross-validation, White's Reality Check as information." })));

  /* ---------------- 7 LEDG */
  const ledg = R.ledger || [];
  el.append(U.grid(card({ n: 7, code: "LEDG", title: "Trial ledger", span: 12, flush: true, sub: `${U.int(ledg.filter((x) => x.counts_in_N).length)} rows count in N`,
    body: ledg.length ? U.showAll(ledg, U.phoneN(12), (list) => table({ caption: "Trial ledger", cls: "compact", stack: true, rows: list, rowCls: (r) => (r.kind === "prior" ? "ref" : ""), cols: [
      { key: "id", label: "ID", fmt: (r) => h("span", { class: "tick" }, r.id) },
      { key: "w", label: "What was tried", lead: true, fmt: (r) => h("span", { class: "lab-wrap" }, prose(r.what)) },
      { key: "k", label: "Kind", fmt: (r) => (r.kind === "prior" ? badge("Prior", "ref") : badge(r.kind || "—", "")) },
      { key: "se", label: "Season", fmt: (r) => h("span", { class: "mono" }, r.season || "—") },
      { key: "c", label: "In N", fmt: (r) => (r.counts_in_N ? badge("Counts", "ok") : badge("No", "na")) },
      { key: "r", label: "Why", hideSm: true, fmt: (r) => h("span", { class: "dim" }, prose(r.reason || "")) },
      { key: "cr", label: "Added", fmt: (r) => U.ds(r.created) },
      { key: "h", label: "Config", hideSm: true, fmt: (r) => h("span", { class: "mono dim" }, (r.config_sha256 || "").slice(0, 8)) }] }), "trials") : U.pad(empty("The ledger is written at the start.")),
    foot: U.foot("Append-only", "prior rows are tests that looked at this price history before the lab existed; they count, which raises the bar", (R.changelog || []).map((c) => `${c.season} ${c.kind} ${U.d((c.registered_at || "").slice(0, 10))} ${c.hash ? `#${c.hash.slice(0, 8)}` : ""}`).join(", ")) })));

  /* ---------------- 8 PREV · 9 SRCS */
  const pm = R.previous_model || {};
  const ps = pm.pretrain_stats || {};
  const ev = R.evidence || [];
  el.append(U.grid(
    card({ n: 8, code: "PREV", title: "The retired model desk", span: 6,
      body: pm.retired_on || pm.live_since ? [h("dl", { class: "kv" },
        h("div", {}, h("dt", {}, "Live since"), h("dd", {}, U.d(pm.live_since))), h("div", {}, h("dt", {}, "Last run"), h("dd", {}, U.d(pm.last_run))),
        h("div", {}, h("dt", {}, "Runs"), h("dd", {}, U.int(pm.runs))), h("div", {}, h("dt", {}, "Retired"), h("dd", {}, U.d(pm.retired_on))),
        h("div", {}, h("dt", {}, "Final paper value"), h("dd", {}, pm.value_at_marks != null ? `${U.eur(pm.value_at_marks)} (${U.d(pm.marks_session)})` : "not valued")),
        h("div", {}, h("dt", {}, "Positions"), h("dd", {}, `${U.int((pm.positions || []).length)}, not carried over`))),
        h("p", { class: "callout" }, prose(pm.why_retired || "")),
        h("div", { class: "section-l" }, `Its design tests, ${(pm.pretrain_window || [])[0] || ""} → ${(pm.pretrain_window || [])[1] || ""}`),
        table({ caption: "Design tests of the retired desk", cls: "compact", rows: pm.design_tests || [], rowCls: (t) => (t.chosen ? "you" : ""), cols: [
          { key: "l", label: "Test", fmt: (t) => [h("span", { class: "nm" }, t.label), t.chosen ? [" ", badge("Chosen", "ref")] : null] },
          { key: "c", label: "CAGR", num: true, fmt: (t) => signed(t.cagr, fmt.p1) },
          { key: "d", label: "Max DD", num: true, fmt: (t) => signed(t.max_drawdown, fmt.p1) },
          { key: "t", label: "Trades", num: true, fmt: (t) => U.int(t.trades) }] }),
        (pm.positions || []).length ? [h("div", { class: "section-l" }, "Its positions when it was retired (not carried over)"),
          table({ caption: "Retired desk positions", cls: "compact", rows: pm.positions, cols: [
            { key: "i", label: "ISIN", fmt: (x) => h("span", { class: "mono" }, x.isin) },
            { key: "o", label: "Opened", fmt: (x) => U.ds(x.opened) },
            { key: "c", label: "Cost €", num: true, fmt: (x) => U.num(x.cost, 2) },
            { key: "s", label: "Shares", num: true, fmt: (x) => U.num(x.shares, 2) }] })] : null,
        ps.cagr != null ? h("p", { class: "note" }, `Pre-training of the chosen test: ${sign(ps.cagr, fmt.p1)} a year after costs, against ${sign(ps.bench_cagr, fmt.p1)} for the Europe ETF; worst fall ${sign(ps.max_drawdown, fmt.p1)}. Seen while designing it, so counted as prior trials.`) : null]
        : empty("No retired desk on file."),
      foot: "Its state was archived, never deleted; none of its positions or rules carry into the lab." }),
    card({ n: 9, code: "SRCS", title: "Evidence", span: 6, sub: `${ev.length} sources`,
      body: ev.length ? U.showAll(ev, U.phoneN(7), (list) => h("div", { class: "studies" }, list.map((e) => {
        const [t, who] = String(e.title || "").split(" · ");
        return h("div", { class: "study", id: `lab-${e.id}` }, h("span", { class: "ix" }, e.id), h("div", { class: "t" }, t, who ? h("small", {}, who) : null),
          h("div", { class: "claim", title: e.claim }, prose(e.claim)),
          h("div", { class: "meta" }, e.url && /^https?:/.test(e.url) ? h("a", { href: e.url, target: "_blank", rel: "noopener" }, "source") : h("span", { class: "dim" }, "no link")));
      })), "sources") : empty("No sources."),
      foot: "What the research read for the lab says, one line each; claims are the sources' own findings, not the lab's." })));

  /* ---------------- 10 LIMS · 11 NOTB */
  const lims = R.limits || [];
  el.append(U.grid(
    card({ n: 10, code: "LIMS", title: "Limits", span: 6, flush: true,
      body: U.showAll(lims, U.phoneN(8), (list) => table({ caption: "Limits and unverified inputs", cls: "compact", stack: true, rows: list, cols: [
        { key: "i", label: "Item", lead: true, fmt: (x) => h("span", { class: "nm lab-wrap" }, prose(x.item)) },
        { key: "s", label: "State", wide: true, fmt: (x) => h("span", { class: "lab-wrap dim" }, prose(x.state)) },
        { key: "h", label: "How the lab handles it", wide: true, fmt: (x) => h("span", { class: "lab-wrap" }, prose(x.handling)) }] }), "limits"),
      foot: "Shown here and on the panels they affect." }),
    card({ n: 11, code: "NOTB", title: "What the lab does not do", span: 6,
      body: h("ul", { class: "lab-list lab-not" }, (R.not_built || []).map((t) => h("li", {}, prose(t)))),
      foot: "Deliberate. Any change here would be a code change, a new season and a ledger line." })));

  /* ---------------- SEAS · TAXR (season 2) */
  const seasons = R.seasons || [];
  const s1 = R.s1_archive || null;
  el.append(U.grid(
    card({ n: 12, code: "SEAS", title: "Seasons", span: 6, flush: true,
      body: seasons.length ? [table({ caption: "Seasons", cls: "compact", rows: seasons, cols: [
        { key: "id", label: "Season", fmt: (x) => h("span", { class: "tick" }, x.id) },
        { key: "r", label: "Registered", fmt: (x) => U.ds((x.registered_at || "").slice(0, 10)) },
        { key: "e", label: "Engine", fmt: (x) => h("span", { class: "mono" }, x.engine_version || "—") },
        { key: "n", label: "N", num: true, fmt: (x) => (x.trials_n != null ? U.int(x.trials_n) : "27") },
        { key: "t", label: "t hurdle", num: true, fmt: (x) => U.t3(x.t_hurdle ?? 3.0) },
        { key: "h", label: "Hash", fmt: (x) => h("span", { class: "mono dim" }, (x.protocol_hash || "").slice(0, 8)) }] }),
        s1 ? U.pad(h("p", { class: "note" }, `Season 1 (closed): live from ${U.d(s1.live_start)} to ${U.d(s1.ended)}, ${U.plural(s1.live_sessions || 0, "session")}; main book ${U.eur(s1.main_equity_end)} (${sign(s1.main_ret_live, fmt.p2)}), ${U.plural(s1.main_trades || 0, "trade")}. ${prose(s1.note || "")}`)) : null,
        U.pad(h("div", { class: "section-l" }, "Trials counted in N, by where they come from"),
          ledger([...["T0", "S1", "S2"].map((se) => { const rows = (R.ledger || []).filter((x) => x.season === se && x.counts_in_N);
            return { op: se === "T0" ? "" : "+", label: { T0: "Prior tests on this history", S1: "Season 1: 15 daily strategies and its main-book procedure", S2: "Season 2: 24 strategies and its main-book procedure" }[se], small: se, value: U.int(rows.length) }; }),
            { op: "=", label: "N, the number every statistic is deflated for", value: U.int(R.trials_n), cls: "total" }]),
          h("p", { class: "note" }, "The significance hurdle splits t = 3 across seasons: 3.000 in season 1, 3.205 in season 2, then 3.32 and 3.40. Season 1's live sessions before season 2's registration count as season 2's history (seen), never as its live record."))]
        : U.pad(empty("No season registered yet.")),
      foot: "Every change that would alter a decision starts a new season: the live record restarts and the bar rises (N grows, t* 3.205 → 3.32)." }),
    card({ n: 13, code: "TAXR", title: "Tax rules", span: 6,
      body: h("ul", { class: "lab-list" }, ((R.tax || {}).text || []).map((t) => h("li", {}, prose(t)))),
      foot: "Sources: D.Lgs. 461/97 art. 6; TUIR arts. 45, 67, 68; L. 77/83 art. 10-ter; DL 66/2014 art. 3; L. 228/2012." })));

};

/* the day timeline of CLCK: jobs as ticks with labels placed in lanes so none overlap. Every leader line is drawn
   first and every label afterwards on a card-coloured box, so no line runs through a label; the axis times sit on
   their own row, and the shaded bands are named in the panel's legend instead of inside the band. */
function labTimeline(w, H0, tt, [m0, m1], title) {
  const U = LabUI;
  const pad = { l: 8, r: 8 };
  const x = U.lin(m0, m1, pad.l, w - pad.r);
  const ev = [];
  tt.forEach((t) => {
    if (/until|Sat|after/i.test(t.at)) return;
    (String(t.at).match(/\d{2}:\d{2}/g) || []).forEach((hm) => { const m = +hm.slice(0, 2) * 60 + +hm.slice(3); if (m >= m0 && m <= m1) ev.push({ m, hm, job: t.job, text: t.text }); });
  });
  ev.sort((a, b) => a.m - b.m);
  const cw = 6.6, lanes = [];
  ev.forEach((e) => {
    const label = `${e.hm} ${e.job}`, wd = label.length * cw + 8, x0 = Math.max(pad.l, Math.min(x(e.m) - 3, w - pad.r - wd));
    let lane = lanes.findIndex((end) => end < x0 - 4);
    if (lane < 0) { lanes.push(0); lane = lanes.length - 1; }
    lanes[lane] = x0 + wd;
    Object.assign(e, { label, x0, wd, lane });
  });
  const laneH = 18, top = 22, axisY = top + 16, lab0 = axisY + 30, H = lab0 + lanes.length * laneH + 4;
  const hrs = [];
  const stepM = (m1 - m0) > 300 ? (w < 700 ? 240 : 120) : (w < 700 ? 20 : 10);
  for (let m = Math.ceil(m0 / stepM) * stepM; m <= m1; m += stepM) hrs.push(m);
  const hm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const band = (a, b, cls) => { const xa = x(Math.max(a, m0)), xb = x(Math.min(b, m1)); return xb > xa ? h("rect", { x: xa, y: top, width: xb - xa, height: 16, class: cls }) : null; };
  const yOf = (e) => lab0 + e.lane * laneH;
  const svg = U.svg(w, H, `${title}: ${ev.map((e) => e.label).join(", ")}`,
    U.t(pad.l, 13, title, { class: "ttl" }),
    band(7 * 60 + 30, 23 * 60, "ls"), band(9 * 60, 17 * 60 + 30, "xch"),
    h("line", { x1: pad.l, x2: w - pad.r, y1: axisY, y2: axisY, class: "axis" }),
    hrs.map((m) => [h("line", { x1: x(m), x2: x(m), y1: axisY, y2: axisY + 4, class: "axis" }), U.t(x(m), axisY + 15, hm(m), { class: "ax", "text-anchor": "middle" })]),
    ev.map((e) => h("line", { x1: x(e.m), x2: x(e.m), y1: top, y2: axisY, class: "tick" })),
    ev.map((e) => h("line", { x1: x(e.m), x2: x(e.m), y1: axisY + 20, y2: yOf(e) - 7, class: "lead" })),
    ev.map((e) => h("circle", { cx: x(e.m), cy: axisY, r: 3, class: "dot" })),
    ev.map((e) => { const y = yOf(e); return h("g", { class: "ev", "data-tip": `${e.hm} ${e.job}: ${e.text}` },
      h("rect", { x: e.x0 - 2, y: y - 8, width: e.wd, height: 15, rx: 2, class: "lbox" }),
      U.t(e.x0 + 2, y + 4, e.hm, { class: "hm" }), U.t(e.x0 + 2 + e.hm.length * cw + 4, y + 4, e.job, { class: "job" })); }));
  return svg;
}
