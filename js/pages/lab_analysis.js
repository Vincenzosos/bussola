"use strict";
/* Trading Lab · analysis sub-pages: LEAGUE (with the 7 VARI strategy drawer), LEARN (Model) and PRACTICE (Robustness) (LAB_SPEC §13.3–13.5).
   Registered into window.LabViews; the helpers are LabUI (lab.js). Paper money only: tables sort, they never rank
   stocks or strategies for action, and every history figure carries its window and the survivorship caveat. */

window.LabViews = window.LabViews || {};

/* ================================================================ LEAGUE */
LabViews.league = async (el, ctx, wait) => {
  const U = LabUI, { sum, params } = ctx;
  let win = (params.get("window") || "live").toLowerCase();
  if (!["live", "validation", "design"].includes(win)) win = "live";
  const winSeg = seg([["live", "Live"], ["validation", "Validation"], ["design", "Design"]], win, (w) => Router.go("lab", "league", { window: w }), "Window");
  el.append(...ctx.head(h("span", { class: "lab-actl" }, "Window"), winSeg), wait);
  let L, rules;
  try { [L, rules] = await Promise.all([U.get(`/api/lab/league?window=${win}`), U.get("/api/lab/rules", 600_000).catch(() => null)]); }
  catch (e) { if (!ctx.alive()) return; wait.remove(); el.append(U.errorCard(`The league could not load: ${e.message}`)); return; }
  if (!ctx.alive()) return;
  wait.remove();
  if (L.state === "not_started") { el.replaceChildren(); labGate(el, "league", L); return; }
  const groups = L.groups || [];
  const allRows = groups.flatMap((g) => g.rows || []);
  const FAMS = ["daily", "weekly", "monthly"];
  const eligible = groups.filter((g) => FAMS.includes(g.id) || g.id === "eligible").flatMap((g) => g.rows || []);
  /* season 2: family chips and a basis segment (after tax by default; before tax adds the withheld tax back) */
  let fam = ["all", "daily", "weekly", "monthly", "ref"].includes(params.get("family")) ? params.get("family") : "all";
  let basis = params.get("basis") === "pre" ? "pre" : "after";
  const famOf = (g) => (FAMS.includes(g.id) ? g.id : g.id === "reference" ? "ref" : "other");
  const champ = (sum.champion || {}).id;
  const mainId = win === "live" ? "MAIN" : "MAIN-HIST";
  let sel = params.get("id") && allRows.some((r) => r.id === params.get("id")) ? params.get("id") : champ && allRows.some((r) => r.id === champ) ? champ : (eligible[0] || {}).id;
  /* a family chip hides the rows of the other families: the selection (2 CURV, 4 SPLT) follows to a row on screen, the first
     with the 20 trades 4 SPLT needs (long-hold books trade rarely), else the first */
  const visibleIds = () => groups.filter((g) => fam === "all" || famOf(g) === fam).flatMap((g) => (g.rows || []).map((r) => r.id));
  const firstVisible = () => { const v = visibleIds(); return v.find((id) => ((allRows.find((r) => r.id === id) || {}).trades || 0) >= 20) || v[0]; };
  if (fam !== "all" && visibleIds().length && !visibleIds().includes(sel)) sel = firstVisible();
  const lg = sum.league || {}, c = L.counters || {};
  /* the registered league (the same 24 in every window; the live window has rows only once books settle) */
  const registered = ((rules || {}).league || []).filter((r) => r.kind === "eligible");
  const liveShort = win === "live" && (L.sessions || 0) < 20;
  const leadStrat = win !== "live" || liveShort;              // the live fill count leads only once the live record has 20 sessions
  const WN = { live: "live", validation: "validation", design: "design" }[win];

  /* before the live record has 20 sessions the league leads with what is registered, not with a count of zero fills */
  const cFills = { label: "Paper fills to date", value: U.int(c.fills_live ?? lg.fills_live_total), detail: h("span", { class: "muted" }, `live, all books, since ${U.d(sum.live_start)}`) };
  const cStrat = { label: "Strategies", value: U.int(registered.length || eligible.length),
    detail: h("span", { class: "muted" }, `${FAMS.map((f) => `${U.int((registered.length ? registered : eligible).filter((r) => r.family === f).length)} ${U.famWord(f).toLowerCase()}`).join(" · ")}${win === "live" ? ` · ${U.int(eligible.filter((r) => (r.sessions || 0) > 0).length)} settled live` : " · eligible to be champion"}`) };
  el.append(U.kpis(sum, [
    { ...(leadStrat ? cStrat : cFills), tier: "hero" },
    { label: "Books settled this session", tier: "major", value: U.int(lg.books_settled), detail: h("span", { class: "muted" }, `${U.int(lg.books_traded)} traded · ${U.int(lg.fills_session)} fills`) },
    { ...(leadStrat ? cFills : cStrat), tier: "major" },
    { label: U.tl("Trials counted", "Every configuration ever tried on this price history (N). The deflated Sharpe raises the bar for the best one as N grows."), value: U.int(L.trials_n), detail: h("span", { class: "muted" }, "N in the deflated Sharpe") },
    { label: U.tl("PBO", "Probability of backtest overfitting: how often the strategy that led in one half of the history fell to the bottom half in the other. Lower is better; 0.5 is what luck gives."), value: U.num(L.pbo, 2), detail: h("span", { class: "muted" }, L.pbo_window || "validation") },
    { label: `Window · ${WN}`, value: U.plural(L.sessions, "session"), detail: h("span", { class: "muted" }, `${U.ds(L.from)} ${(L.from || "").slice(0, 4)} → ${U.ds(L.to)} ${(L.to || "").slice(0, 4)}`) },
  ]));

  /* ---------------- 1 TABL */
  const NOTE = (r) => r.stats_note || "n/a: fewer than 20 sessions";
  const st = (r, k, f) => (r[k] == null ? U.na(NOTE(r)) : f(r[k]));
  const short = (L.sessions || 0) < 250;              // CAGR annualises; under a year of sessions it says so
  const cagrTip = short ? `Compound yearly growth, annualised from ${U.plural(L.sessions || 0, "session")}: a short window makes it swing widely.` : "Compound yearly growth over the window.";
  const POLICY = { RULE_W: "RULE_W: after the last session of each week, the top-ranked names by the rule's score; nothing traded in between.",
    D1B_W: "D1B_W: after the last session of each week, 1 to 3 names whose 5-session forecast clears the full round-trip cost.",
    BANDL_W: "BANDL_W: weekly; keeps a name while its 5-session forecast stays above zero, for up to 4 weeks.",
    BAND_M: "BAND_M: on the first session of each month, the top names by the signal; keeps a name while it ranks 15th or better; no exit date.",
    BAND_M_POS: "BAND_M_POS: BAND_M, but only names above their 200-session average enter or stay.",
    D1B: "D1B: each night, 1 to 3 names whose forecast clears the full round-trip cost; fewer names when fees would eat the edge.",
    D1F: "D1F: a fixed number of names, each forecast above its cost.", BANDL: "BANDL: keeps a name while its forecast stays above zero, for up to 10 sessions.",
    RULE_D1: "RULE_D1: the top-ranked names by the rule's score, re-picked every night.", RULE_BAND: "RULE_BAND: keeps a name while it stays in the rule's top 10, for up to 10 sessions.",
    HOLD: "HOLD: buys once and holds (the ETF reference).", INDEX: "INDEX: an equal-weight line with no costs (a reference).", CASH: "CASH: holds cash." };
  const T = (text, tip) => U.tl(text, tip);
  const COL = {
    id: { key: "id", label: "ID", fmt: (r) => h("span", { class: "tick" }, r.id) },
    name: { key: "name", label: "Strategy", fmt: (r) => h("span", { class: "nm", "data-tip": `${r.id} · ${r.name}` }, U.nm(r.id, r.name)) },
    source: { key: "source", label: T("Source", "The forecaster or rule the book trades on."), sl: "Source", fmt: (r) => h("span", { class: "mono dim" }, r.source || "—") },
    universe: { key: "universe", label: T("Universe", "FREE: names with no transaction tax; ALL: every name; SMEA: the Europe ETF."), sl: "Universe", fmt: (r) => r.universe || "—" },
    policy: { key: "policy", label: T("Policy", "How the book turns forecasts into paper orders. Hover a code for its rule."), sl: "Policy",
      fmt: (r) => (r.policy ? h("span", { class: "mono", "data-tip": `${POLICY[r.policy] || r.policy}${U.POLICY[r.policy] ? ` (${U.POLICY[r.policy]})` : ""}` }, r.policy) : "—") },
    slots: { key: "slots", label: T("Slots", "The most names the book holds at once."), sl: "Slots", num: true, fmt: (r) => (r.slots == null ? "—" : String(r.slots)) },
    k: { key: "k", label: T("k", "Cost multiple: a forecast must exceed k times the round-trip cost before the book enters."), sl: "k", num: true, fmt: (r) => (r.k == null ? "—" : U.num(r.k, 1)) },
    gate: { key: "gate", label: T("Gate", "STRESS: the book trades only in turbulent sessions (stress above 1). MKT_TREND: it holds cash while the equal-weight market is at or below its 200-session average."), sl: "Gate", fmt: (r) => r.gate || "—" },
    family: { key: "family", label: T("Family", "Daily: decides every session. Weekly: after the last session of each week. Long hold: on the first session of each month, no exit date."), sl: "Family", fmt: (r) => U.famWord(r.family) },
    keep: { key: "keep", label: T("Keep / max", "Long hold: kept while ranked this or better. Weekly and daily bands: the longest hold, in weeks or sessions."), sl: "Keep / max", fmt: (r) => (r.keep != null ? `top ${r.keep}` : r.max_hold != null ? `≤ ${r.max_hold}` : "—") },
    tax_withheld: { key: "tax_withheld", label: T("Tax withheld", "26% of realised gains, withheld at each paper sale over the window, after credits."), sl: "Tax withheld", num: true, sort: true, fmt: (r) => (r.tax_withheld == null ? h("span", { class: "dim" }, "—") : U.eur(r.tax_withheld, 0)) },
    status: { key: "status", label: "Status", hideSm: true, fmt: (r) => U.kind(r.kind, r.status === "champion" || (r.id === champ && r.kind === "eligible")) },
    sessions: { key: "sessions", label: "Sessions", num: true, sort: true, fmt: (r) => U.int(r.sessions) },
    trades: { key: "trades", label: T("Trades", "Closed round trips (an entry and its exit)."), sl: "Trades", num: true, sort: true, fmt: (r) => U.int(r.trades) },
    invested: { key: "invested", label: T("Invested", "Average share of the book held in stocks rather than cash."), sl: "Invested", num: true, sort: true, fmt: (r) => st(r, "invested", (x) => U.pct(x, 0)) },
    cagr_net: { key: "cagr_net", label: T(short ? "CAGR after tax*" : "CAGR after tax", `${cagrTip} After fees, spread, transaction tax and the 26% tax on gains (and the tax a full sale would still withhold).`), sl: "CAGR after tax", num: true, sort: true, fmt: (r) => st(r, "cagr_net", (x) => signed(x, fmt.p1)) },
    cagr_pre: { key: "cagr_pre", label: T(short ? "CAGR before tax*" : "CAGR before tax", `${cagrTip} After fees, spread and transaction tax; the 26% tax withheld is added back.`), sl: "CAGR before tax", num: true, sort: true, fmt: (r) => st(r, "cagr_pre", (x) => signed(x, fmt.p1)) },
    sharpe_pre: { key: "sharpe_pre", label: T("Sharpe before tax", "The Sharpe ratio of the pre-tax line."), sl: "Sharpe before tax", num: true, sort: true, fmt: (r) => st(r, "sharpe_pre", (x) => U.snum(x, 2)) },
    max_dd_pre: { key: "max_dd_pre", label: T("Max DD before tax", "Largest fall of the pre-tax line."), sl: "Max DD before tax", num: true, sort: true, fmt: (r) => st(r, "max_dd_pre", (x) => signed(x, fmt.p1)) },
    cagr_gross: { key: "cagr_gross", label: T(short ? "CAGR gross*" : "CAGR gross", `${cagrTip} Before costs and tax: the same trades with fees, spread and both taxes added back.`), sl: "CAGR gross", num: true, sort: true, fmt: (r) => st(r, "cagr_gross", (x) => signed(x, fmt.p1)) },
    sharpe_net: { key: "sharpe_net", label: T("Sharpe after tax", "Mean daily return after costs and tax divided by its volatility, scaled to a year. Broad stock indices have run at roughly 0.3–0.5 over long periods; above 1 over a short window is often luck."), sl: "Sharpe net", num: true, sort: true, fmt: (r) => st(r, "sharpe_net", (x) => U.snum(x, 2)) },
    t_nw: { key: "t_nw", label: T("t (NW)", "How many standard errors the mean net return is from zero (Newey-West). About 2 is the usual bar for a single test; the scorecard asks 3.205 of the live alpha before tax this season."), sl: "t (NW)", num: true, sort: true, hideSm: true, fmt: (r) => st(r, "t_nw", (x) => U.snum(x, 2)) },
    alpha_t_nw: { key: "alpha_t_nw", label: T("Alpha t", "The same t for the result beyond the market, before tax: return minus the equal-weight index at the book's exposure (B1's basis)."), sl: "Alpha t", num: true, sort: true, hideSm: true, fmt: (r) => st(r, "alpha_t_nw", (x) => U.snum(x, 2)) },
    dsr: { key: "dsr", label: T("DSR", "Deflated Sharpe after tax: the probability that the true Sharpe beats what the best of all trials counted would show by luck."), sl: "DSR", num: true, sort: true, fmt: (r) => st(r, "dsr", (x) => U.num(x, 2)) },
    max_dd: { key: "max_dd", label: T("Max DD", "Largest fall from a peak of the book's after-tax value."), sl: "Max DD", num: true, sort: true, fmt: (r) => st(r, "max_dd", (x) => signed(x, fmt.p1)) },
    turnover: { key: "turnover", label: T("Turnover", "Value traded in a year as a multiple of the book."), sl: "Turnover", num: true, sort: true, fmt: (r) => st(r, "turnover", (x) => `${U.num(x, 0)}×`) },
    edge_bps: { key: "edge_bps", label: T("Edge/trade", "Gross result per trade before costs, in basis points (1 bp = 0.01%)."), sl: "Edge/trade", num: true, sort: true, fmt: (r) => (r.edge_bps == null ? h("span", { class: "dim" }, "—") : U.sbps(r.edge_bps)) },
    cost_bps: { key: "cost_bps", label: T("Cost/trade", "Fees, spread and tax per round trip, in basis points of the amount traded."), sl: "Cost/trade", num: true, sort: true, fmt: (r) => (r.cost_bps == null ? h("span", { class: "dim" }, "—") : U.bps(r.cost_bps)) },
    score_dsr: { key: "score_dsr", label: T("Champion score", "Deflated Sharpe over the trailing 750 sessions, the figure the monthly champion review compares (eligible strategies only)."), sl: "Champion score", num: true, sort: true, fmt: (r) => (r.score_dsr == null ? h("span", { class: "dim" }, "—") : U.num(r.score_dsr, 2)) },
    stop_flag: { key: "stop_flag", label: T("Stop flag", "Raised when a book's live mean falls below the 5% line its history implies, after 60 live sessions."), sl: "Stop flag", fmt: (r) => (r.stop_flag ? badge("Raised", "bad") : h("span", { class: "dim" }, "—")) },
  };
  /* three column sets, as the screener has, so no column that decides the champion hides off-screen */
  const SETS = {
    result: ["id", "name", "status", "sessions", "cagr_net", "sharpe_net", "t_nw", "alpha_t_nw", "dsr", "max_dd", "score_dsr", "stop_flag"],
    design: ["id", "name", "status", "family", "source", "universe", "policy", "slots", "keep", "k", "gate"],
    costs: ["id", "name", "trades", "invested", "turnover", "edge_bps", "cost_bps", "tax_withheld", "cagr_gross", "cagr_net"],
  };
  const PRE = { cagr_net: "cagr_pre", sharpe_net: "sharpe_pre", max_dd: "max_dd_pre" };
  let colSet = ["result", "design", "costs"].includes(params.get("cols")) ? params.get("cols") : "result";
  const colsOf = () => SETS[colSet].map((k) => COL[basis === "pre" && PRE[k] ? PRE[k] : k]);
  const sort = { key: "id", dir: "ascending" };
  const tblBox = h("div", { class: "lab-league-box" }), sortNote = h("span", { class: "note" });
  const drawTable = () => {
    if (L.sealed) { tblBox.replaceChildren(U.pad(empty("Sealed until the lab is registered."))); return; }
    const cmp = (a, b) => { const x = a[sort.key], y = b[sort.key]; if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return sort.dir === "descending" ? y - x : x - y; };
    const rows = [];
    groups.forEach((g) => {
      if (!(g.rows || []).length && g.id !== "probe") return;
      if (fam !== "all" && famOf(g) !== fam) return;
      rows.push({ __group: g.label, __n: (g.rows || []).length });
      rows.push(...(sort.key === "id" ? g.rows : [...g.rows].sort(cmp)));
    });
    const lab = ((COL[sort.key] || {}).sl || (COL[sort.key] || {}).label) || "ID";
    sortNote.textContent = sort.key === "id" ? "Sorted by ID within each group." : `Sorted by ${lab}, ${sort.dir === "descending" ? "high to low" : "low to high"}, within each group: a sort, not a ranking.`;
    if (!SETS[colSet].includes(sort.key)) { sort.key = "id"; sort.dir = "ascending"; }
    tblBox.replaceChildren(table({ caption: `League table, ${WN} window`, cls: "compact lab-sticky lab-league", rows,
      cols: colsOf().map((x) => ({ ...x, sort: x.key === sort.key ? sort.dir : x.sort || x.key === "id" })),
      rowCls: (r) => [r.id === sel ? "sel" : r.id === mainId || r.kind === "main" ? "you" : r.kind === "reference" || r.kind === "diagnostic" ? "ref" : ""].join(" "),
      onrow: (r) => { select(r.id); openVari(r.id, win); },
      onsort: (k) => { if (sort.key === k) sort.dir = sort.dir === "descending" ? "ascending" : "descending"; else { sort.key = k; sort.dir = k === "id" ? "ascending" : "descending"; } drawTable(); } }));
  };
  const hasProbes = groups.some((g) => g.id === "probe" && (g.rows || []).length);
  /* the notes of the API come first-hand; the page adds only what they do not already say */
  const notes = (L.notes || []).map(prose);
  const says = (re) => notes.some((t) => re.test(t));
  const footLead = win === "live"
    ? [says(/below 20 sessions/i) ? (hasProbes ? "Probe statistics use observed sessions only" : null)
      : `Live statistics show n/a below 20 sessions${hasProbes ? "; probe statistics use observed sessions only" : ""}`]
    : [says(/survivorship/i) ? null : "History uses today's index members (survivorship bias)"];
  const setSeg = seg([["result", "Result"], ["design", "Design"], ["costs", "Costs"]], colSet, (k) => { colSet = k; drawTable(); }, "Columns");
  const chipBox = h("div", { class: "chips lab-fam" });
  const drawChips = () => chipBox.replaceChildren(...[["all", "All"], ["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Long hold"], ["ref", "References"]].map(([k, lab]) =>
    chip(lab, k === "all" ? allRows.length : k === "ref" ? allRows.filter((r) => r.kind === "reference").length : eligible.filter((r) => r.family === k).length, fam === k,
      () => { fam = k; drawChips(); const v = visibleIds(); if (v.length && !v.includes(sel)) select(firstVisible()); else drawTable(); })));
  drawChips();
  const basisBox = h("span");
  const drawBasis = () => basisBox.replaceChildren(seg([["after", "After tax"], ["pre", "Before tax"]], basis, (b) => { basis = b; drawBasis(); drawTable(); if (!liveShort) drawCurves(); }, "Basis"));
  drawBasis();
  /* the history windows: the caveat sits directly above the table it qualifies */
  if (L.banner && win !== "live") el.append(h("div", { class: "lab-strip note", role: "note" }, badge("Read first", "ref"), h("span", {}, prose(L.banner))));
  const settledRows = allRows.filter((r) => (r.sessions || 0) > 0).length;
  const histCard = (n) => U.grid(card({ n, code: "HIST", title: "The live record is just starting", span: 12,
    body: [h("p", { class: "callout lab-notyet" }, `The live record starts ${U.d(sum.live_start)} and has ${U.plural(L.sessions || 0, "session")} so far. Until it has 20 sessions, the history window shows how the same ${U.int(registered.length || eligible.length)} strategies behaved in the past (in-sample: today's index members, designed after reading the research).`),
      h("div", { class: "actions" }, h("a", { class: "btn primary", href: "#/lab/league?window=validation" }, "Open the history (validation) window"),
        h("span", { class: "note" }, "Live statistics show from 20 sessions; paired questions and the luck band from 60."))],
    foot: "Only the live record is out of sample. The history windows are in-sample and flattered by today's index members." }));
  if (liveShort && !settledRows) el.append(histCard(1));
  if (!(liveShort && !settledRows)) el.append(U.grid(card({ n: 1, code: "TABL", title: "League table", span: 12, flush: true, sub: `${WN} · ${U.ds(L.from)} ${(L.from || "").slice(0, 4)} → ${U.ds(L.to)} ${(L.to || "").slice(0, 4)}`,
    tools: [chipBox, h("span", { class: "grow" }), h("span", { class: "note" }, "Basis"), basisBox, h("span", { class: "note" }, "Columns"), setSeg, sortNote, h("span", { class: "note" }, liveShort ? "Select a row to open its details." : "Select a row: the equity chart draws it, the breakdown below explains it, and its details open.")],
    body: tblBox,
    foot: U.foot(...footLead, notes, "CAGR and Sharpe after costs and the 26% tax unless marked before tax or gross", short ? `* annualised from ${U.plural(L.sessions || 0, "session")}` : null,
      "main book in cyan, references and diagnostics grey", "hover a column head for what it measures") })));
  drawTable();

  /* ---------------- 2 CURV · 3 PAIR */
  const curves = L.curves || [];
  const curvBox = h("div", { class: "chart fill" }), curvLeg = h("div", { class: "chart-head" });
  let curvRes = null;
  const drawCurves = () => {
    if (curvRes) { dropChart(curvRes.chart); U.charts = U.charts.filter((x) => x !== curvRes.chart); curvRes = null; }
    if (!curves.length || curves.every((x) => (x.points || []).length < 2)) { curvBox.replaceChildren(empty("Live curves start after the second settled session.")); curvLeg.replaceChildren(); return; }
    const styleOf = (id) => (id === sel && id !== mainId ? "pick" : id === mainId ? "area" : id === "X1" ? "b1" : id === "X2" ? "b2" : "faint");
    const specs = curves.map((x) => ({ label: x.id, points: basis === "pre" && x.points_pre ? x.points_pre : x.points, style: styleOf(x.id), fmt: (v) => U.eur(v, 0),
      opts: x.id === "X1" || x.id === "X2" ? { lineWidth: 2 } : undefined, tip: styleOf(x.id) === "faint" ? false : undefined }));
    curvRes = U.lines(curvBox, specs, { euro: true, digits: 0 });
    const lastOf = (id) => { const x = curves.find((q) => q.id === id); return x && x.points.length ? x.points[x.points.length - 1][1] : null; };
    const items = [];
    if (curves.some((x) => x.id === mainId)) items.push({ label: mainId === "MAIN" ? "Main book" : "Main book, historical run", style: "area", value: U.eur(lastOf(mainId), 0) });
    if (sel && sel !== mainId && curves.some((x) => x.id === sel)) items.push({ label: `${sel} (selected)`, style: "pick", value: U.eur(lastOf(sel), 0) });
    if (curves.some((x) => x.id === "X1")) items.push({ label: "X1 Europe ETF", style: "b1", value: U.eur(lastOf("X1"), 0) });
    if (curves.some((x) => x.id === "X2")) items.push({ label: "X2 equal weight", style: "b2", value: U.eur(lastOf("X2"), 0) });
    items.push({ label: "every other book", style: "faint" });
    curvLeg.replaceChildren(U.legend(items));
  };
  const pairs = L.pairs || [];
  const pmax = Math.max(1e-6, ...pairs.map((p) => Math.abs(p.diff_bps_session || 0)));
  const pairRow = (p) => h("div", { class: "lab-pair" },
    h("div", { class: "q" }, prose(p.question)),
    h("div", { class: "r" }, h("span", { class: "ab mono" }, `${p.a} − ${p.b}`), dbar(p.diff_bps_session || 0, pmax), h("span", { class: `v ${tone(p.diff_bps_session)}` }, `${sign(p.diff_bps_session, U.NF[1])} bps`)),
    h("div", { class: "m" }, `t ${ok2(p.t_nw) ? sign(p.t_nw, U.NF[2]) : "n/a"} · ${U.plural(p.sessions, "session")} · ${p.basis === "pre" ? "before tax" : p.basis === "both" ? "before minus after tax" : "after tax"} · also differs: ${prose(p.also_differs || "—")}`),
    ok2(p.max_dd_a) && ok2(p.max_dd_b) && /gate|drawdown/i.test(p.question) ? h("div", { class: "m" }, `max drawdown ${sign(p.max_dd_a, fmt.p1)} against ${sign(p.max_dd_b, fmt.p1)}`) : null);
  const rowCurv = U.grid(
    card({ n: 2, code: "CURV", title: "Equity after costs and tax", span: 8, sub: win === "live" ? "each book from €10,000 at the live start; the basis switch above the league table shows the pre-tax lines" : "rebased to €10,000 at the window start, every 5th session",
      body: [curvLeg, curvBox],
      foot: U.foot(win === "live" ? "Live: out of sample" : `${WN}: history, today's index members (survivorship bias)`, "X1 = the Europe ETF held; X2 = all names, equal weight, no costs", "Past returns do not predict future ones") }),
    card({ n: 3, code: "PAIR", title: "Paired questions", span: 4, sub: "difference a − b, bps a session",
      body: L.sessions < 60 || !pairs.length ? empty("Needs 60 sessions in this window.") : U.showAll(pairs, 6, (list) => h("div", { class: "lab-pairs" }, list.map(pairRow)), "questions"),
      foot: "Each pair differs in one design choice (and says what else differs). t: Newey-West, over the window's sessions." }));

  /* ---------------- 4 SPLT · 5 LUCK */
  const spltBox = h("div"), spltTitle = h("span", {}, "Where the result came from");
  const drawSplit = async () => {
    spltTitle.textContent = sel ? `Where the result came from · ${sel}` : "Where the result came from";
    if (!sel) { spltBox.replaceChildren(empty("Select a row. Needs 20 trades in the window.")); return; }
    spltBox.replaceChildren(skeleton(240));
    let v;
    try { v = await U.get(`/api/lab/variant?id=${encodeURIComponent(sel)}&window=${win}`); }
    catch (e) { if (el.isConnected) spltBox.replaceChildren(empty(/404/.test(e.message) ? `No ${WN} record for ${sel}.` : `Could not load: ${e.message}`)); return; }
    if (!el.isConnected) return;
    U.fill(spltBox, labSplit(v, win));
  };
  const luck = L.luck || {};
  const band = luck.band_sharpe || [];
  const dots = (luck.dots || []).filter((x) => eligible.some((r) => r.id === x.id));
  const inside = dots.filter((x) => ok2(x.sharpe_net) && x.sharpe_net >= band[0] && x.sharpe_net <= band[1]).length;
  const vals = dots.map((x) => x.sharpe_net).filter(ok2).concat(band);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), padv = (hi - lo) * 0.06 || 0.5;
  const rowSplit = U.grid(
    card({ n: 4, code: "SPLT", title: spltTitle, span: 6, body: spltBox,
      foot: U.foot(`${WN} window`, "net = after fees, spread and tax", "cost ÷ gross = the share of the gross result that costs took") }),
    card({ n: 5, code: "LUCK", title: "Luck band", span: 6, sub: `random book ${luck.source || "X4"}, 5–95% of its net Sharpe`,
      body: L.sessions < 60 || band.length < 2 ? empty("Needs 60 sessions.") : [
        h("p", { class: "lede" }, `${U.int(inside)} of ${U.int(dots.filter((x) => ok2(x.sharpe_net)).length)} strategies have a net Sharpe inside the band that a random book trading the same names at the same costs showed. Inside the band, a result is hard to tell from luck.`),
        U.rowPlot({ rows: dots.map((x) => ({ label: x.id, dot: x.sharpe_net, cls: x.id === sel ? "pick" : x.id === champ ? "you" : "", value: ok2(x.sharpe_net) ? sign(x.sharpe_net, U.NF[2]) : "n/a",
          tip: `${x.id}: net Sharpe ${ok2(x.sharpe_net) ? sign(x.sharpe_net, U.NF[2]) : "n/a"}${ok2(x.sharpe_net) ? (x.sharpe_net >= band[0] && x.sharpe_net <= band[1] ? " · inside the band" : " · outside the band") : ""}` })),
          lo: lo - padv, hi: hi + padv, band: [band[0], band[1], `${luck.source || "X4"} 5–95%: ${sign(band[0], U.NF[2])} to ${sign(band[1], U.NF[2])}`], fmtx: (x) => sign(x, U.NF[1]), label: "Net Sharpe of each strategy against the random book's band",
          axis: "net Sharpe ratio, a year" }),
        legend([{ c: "var(--bench-3)", style: "box", label: `${luck.source || "X4"} band, 5–95%` }, ...(champ && champ !== sel ? [{ c: "var(--s1)", style: "pt", label: "champion" }] : []),
          { c: "var(--s2)", style: "pt", label: champ && champ === sel ? "selected (the champion)" : "selected" }, { c: "var(--ink-2)", style: "pt", label: "other strategies" }])],
      foot: `Bootstrap of the random book's ${WN} returns. The band is wide when the window is short.` }));
  /* the live window before 20 sessions: one callout and the way to the history, instead of four empty panels */
  if (liveShort) { if (settledRows) el.append(histCard(2)); } else { el.append(rowCurv, rowSplit); drawCurves(); drawSplit(); }

  /* ---------------- 6 PROB */
  const diag = (groups.find((g) => g.id === "diagnostic") || { rows: [] }).rows;
  const byId = Object.fromEntries(allRows.map((r) => [r.id, r]));
  const twin = { DX1: "R1", DX2: "L2" };
  const probes = L.probes || [];
  const ppairs = pairs.filter((p) => /^(P\d|DX\d)$/.test(p.a));
  el.append(U.grid(card({ n: liveShort ? (settledRows ? 3 : 2) : 6, code: "PROB", title: "Probes and diagnostics", span: 12, flush: true,
    body: [h("div", { class: "lab-prob" },
      h("div", {}, h("div", { class: "section-l lab-sl" }, "Probes: decisions from the recorded tape (live only)"),
        win !== "live" ? U.pad(h("p", { class: "note" }, "Probes run on live recorded sessions only; switch the window to Live."))
          : probes.length ? table({ caption: "Probes", cls: "compact", stack: true, rows: probes, cols: [
            { key: "id", label: "ID", fmt: (p) => h("span", { class: "tick" }, p.id) },
            { key: "name", label: "Name", lead: true, fmt: (p) => [h("span", { class: "nm" }, U.nm(p.id, p.name)), " ", h("span", { class: "lab-bid" }, p.name)] },
            { key: "obs", label: "Observed", num: true, fmt: (p) => `${U.int(p.observed_sessions)} / ${U.int(p.sessions)}` },
            { key: "tr", label: "Trades", num: true, fmt: (p) => U.int(p.trades) },
            { key: "e", label: "Edge", num: true, title: "gross per trade", fmt: (p) => U.sbps(p.edge_bps) },
            { key: "c", label: "Cost", num: true, title: "per trade", fmt: (p) => U.bps(p.cost_bps) },
            { key: "nt", label: "Net/trade", num: true, fmt: (p) => U.sbps(p.net_bps_trade) },
            { key: "ns", label: "Net/session", num: true, fmt: (p) => U.sbps(p.net_bps_session) }] })
            : U.pad(empty(`Probes need a recorded session (${U.runs("running")} at 23:10 or before 06:55 the next morning). None yet.`))),
      h("div", {}, h("div", { class: "section-l lab-sl" }, "Diagnostics against their executable twins"),
        diag.length ? table({ caption: "Diagnostics and twins", cls: "compact", stack: true, rows: diag, cols: [
          { key: "id", label: "Diagnostic", lead: true, fmt: (r) => [h("span", { class: "tick" }, r.id), h("span", { class: "sub" }, U.nm(r.id, r.name))] },
          { key: "tw", label: "Twin", fmt: (r) => h("span", { class: "tick" }, twin[r.id] || "—") },
          { key: "cn", label: "CAGR net", num: true, fmt: (r) => st(r, "cagr_net", (x) => signed(x, fmt.p1)) },
          { key: "ct", label: "Twin CAGR", num: true, fmt: (r) => { const t = byId[twin[r.id]]; return t ? st(t, "cagr_net", (x) => signed(x, fmt.p1)) : "—"; } },
          { key: "e", label: "Edge", num: true, fmt: (r) => U.sbps(r.edge_bps) },
          { key: "et", label: "Twin edge", num: true, fmt: (r) => { const t = byId[twin[r.id]]; return t ? U.sbps(t.edge_bps) : "—"; } }] })
          : U.pad(h("p", { class: "note" }, "No diagnostic book in this window.")),
        ppairs.length ? h("div", { class: "lab-pad" }, h("div", { class: "lab-pairs" }, ppairs.map(pairRow))) : null))],
    foot: ["Diagnostics (DX) fill at the same close the signal used: not executable by hand, never champion. Probes decide at 22:38 or trade within the day from the recorded tape; never eligible. The morning, day and evening split is a lesson on ", link("Model › lessons", "#/lab/learn"), "."] })));

  /* selection and the 7 VARI drawer */
  function select(id) {
    sel = id;
    drawTable(); if (!liveShort) { drawCurves(); drawSplit(); }
    const lk = document.querySelectorAll(".lab-rows .row");
    lk.forEach((g) => g.classList.toggle("pick", g.querySelector(".lbl") && g.querySelector(".lbl").textContent === id));
  }
};
/* 4 SPLT body for one strategy and window */
function labSplit(v, win, { tiles = true } = {}) {
  const U = LabUI, s = v.stats || {};
  if ((s.trades || 0) < 20) return [empty(`${v.id} has ${U.plural(s.trades || 0, "trade")} in this window; the breakdown needs 20. Select another row.`)];
  const costs = s.costs || {}, cb = s.costs_split_bps || {};
  const cost = (costs.fee || 0) + (costs.spread || 0) + (costs.ftt || 0);
  const share = ok2(s.edge_bps) && s.edge_bps > 0 && ok2(s.cost_bps) ? s.cost_bps / s.edge_bps : null;
  const bs = v.by_stress || s.by_stress || [];
  const cn = v.chosen_n || s.chosen_n;
  const by = v.by_year || s.by_year || [];
  return [
    !tiles ? null : h("div", { class: "stats four" },
      stat("Trades", U.int(s.trades), `${U.num(s.trades_pa, 0)} a year`),
      stat("Hit rate", U.pct(s.hit_trades, 0), "trades with a net gain"),
      stat("Edge − cost", `${U.num(s.edge_bps, 1)} − ${U.num(s.cost_bps, 1)}`, "bps a trade"),
      stat("Net a trade", ok2(s.net_bps_trade) ? h("span", { class: tone(s.net_bps_trade) }, `${sign(s.net_bps_trade, U.NF[1])} bps`) : "—",
        (s.sessions || 0) < 250 && ok2(s.total_net) ? `${sign(s.total_net, fmt.p1)} over ${U.plural(s.sessions, "session")}`
          : (s.sessions || 0) < 250 ? `CAGR ${sign(s.cagr_net, fmt.p1)}, annualised from ${U.plural(s.sessions || 0, "session")}` : `CAGR ${sign(s.cagr_net, fmt.p1)}`)),
    h("div", { class: "two-col lab-two" },
      h("div", {}, h("div", { class: "section-l" }, "By stress tercile, net bps a session"),
        U.divRows(bs.map((b) => ({ label: `${U.cap(b.tercile)}${b.sessions != null ? ` (${U.int(b.sessions)})` : ""}`, v: b.net_bps_session, tip: `${b.tercile}: ${sign(b.net_bps_session, U.NF[1])} bps a session over ${U.int(b.sessions)} sessions` }))),
        h("div", { class: "section-l" }, "By tax group, per trade"),
        h("div", { class: "lab-div" }, (v.by_ftt_group || s.by_ftt_group || []).map((g) => h("div", { class: "r" }, h("span", { class: "n" }, `${g.group} (${U.int(g.trades)})`), h("span", { class: "note" }, `tax ${U.num(g.ftt_bps_trade, 1)} bps`), h("span", { class: `v ${tone(g.net_bps_trade)}` }, `${sign(g.net_bps_trade, U.NF[1])} bps`))))),
      h("div", {}, h("div", { class: "section-l" }, "Costs over the window"),
        ledger([
          { op: "", label: "Fees", small: `${U.num(cb.fee, 1)} bps/trade`, value: U.eur(costs.fee, 0) },
          { op: "+", label: "Spread", small: `${U.num(cb.spread, 1)} bps/trade`, value: U.eur(costs.spread, 0) },
          { op: "+", label: "Transaction tax", small: `${U.num(cb.ftt, 1)} bps/trade`, value: U.eur(costs.ftt, 0) },
          { op: "=", label: "Costs", value: U.eur(cost, 0), cls: "total" },
          { op: "÷", label: "Gross result per trade", small: `${U.bps(s.edge_bps)} edge, ${U.bps(s.cost_bps)} cost`, value: share != null ? `${U.pct(share, 0)} taken by costs` : "costs exceed a gross loss" }]),
        cn ? [h("div", { class: "section-l" }, "Names chosen per session"),
          stackBar(["0", "1", "2", "3"].filter((k) => cn[k] != null).map((k, i) => ({ name: `${k} names`, share: cn[k], color: k === "0" ? "var(--other)" : `var(${CATS[i - 1] || "--s2"})` })), { w: "100%" }),
          legend(["0", "1", "2", "3"].filter((k) => cn[k] != null).map((k, i) => ({ c: k === "0" ? "var(--other)" : `var(${CATS[i - 1] || "--s2"})`, style: "box", label: k === "0" ? "cash" : `${k} name${k === "1" ? "" : "s"}`, value: U.pct(cn[k], 0) })))] : null)),
    h("div", { class: "section-l" }, "By year"),
    table({ caption: "Result by year", cls: "compact", rows: by, cols: [
      { key: "year", label: "Year", fmt: (x) => String(x.year) },
      { key: "net", label: "Net", num: true, fmt: (x) => signed(x.net, fmt.p1) },
      { key: "gross", label: "Gross", num: true, fmt: (x) => signed(x.gross, fmt.p1) },
      { key: "tr", label: "Trades", num: true, fmt: (x) => U.int(x.trades) },
      { key: "e", label: "Edge/trade", num: true, fmt: (x) => U.sbps(x.edge_bps) },
      { key: "c", label: "Cost/trade", num: true, fmt: (x) => U.bps(x.cost_bps) }] }),
  ];
}

/* 7 VARI: the strategy drawer */
async function openVari(id, win, page = 1) {
  const U = LabUI;
  openDrawer({ n: 7, code: "VARI", title: id, body: [skeleton(60), skeleton(220), skeleton(160)] });
  let v;
  try { v = await U.get(`/api/lab/variant?id=${encodeURIComponent(id)}&window=${win}&page=${page}`); }
  catch (e) { openDrawer({ n: 7, code: "VARI", title: id, body: empty(/404/.test(e.message) || /unknown/i.test(e.message) ? `No book with ID ${id}.` : `Not available: ${e.message}`) }); return; }
  if ($("drawer").hidden) return;
  const s = v.stats || {}, df = v.definition || {};
  const wins = v.windows_available || [win];
  const chartBox = h("div", { class: "chart s" });
  const cb = s.costs || {};
  const coef = v.coef_bps_per_sd;
  const sens = (v.sensitivity || {}).half_spread_bps || {};
  const tile = (l, val, d) => stat(l, val, d);
  openDrawer({ n: 7, code: "VARI", title: `${v.id} · ${v.name || df.name || ""}`, body: [
    h("div", { class: "lab-vhead" }, U.kind(v.kind), badge(`${v.window} window`, "ref"), h("span", { class: "grow" }),
      wins.length > 1 ? seg(wins.map((w) => [w, U.cap(w)]), v.window, (w) => openVari(id, w), "Window") : null),
    (v.rules_text || []).length ? h("div", { class: "callout" }, v.rules_text.map((t) => h("p", {}, prose(t)))) : null,
    h("dl", { class: "kv" }, [["Family", U.famWord(v.family || df.family)], ["Source", df.source], ["Universe", df.universe], ["Policy", df.policy], ["Slots", df.n_max != null ? `1–${df.n_max}` : df.slots],
      ["Keep", df.keep != null ? `while ranked ${df.keep} or better` : null], ["Longest hold", df.max_hold != null ? `${df.max_hold} ${df.family === "weekly" ? "weeks" : "sessions"}` : null], ["k", df.k], ["Gate", df.gate || "none"],
      ["Clock", df.clock], ["Capital", df.capital != null ? U.eur(df.capital, 0) : null], ["Minimum ticket", df.min_ticket != null ? U.eur(df.min_ticket, 0) : null]].filter(([, x]) => x != null && x !== "")
      .map(([k, x]) => h("div", {}, h("dt", {}, k), h("dd", {}, String(x))))),
    h("div", { class: "section-l" }, "Equity from €10,000: after tax, before tax, and gross of costs"),
    chartBox,
    legend([{ c: "var(--s2)", style: "line", label: "After tax" }, { c: "var(--s2)", style: "dash", label: "Before tax" }, { c: "var(--bench-1)", style: "dash", label: "Gross (before costs and tax)" }]),
    v.stats_note ? h("p", { class: "note" }, prose(v.stats_note)) : null,
    h("div", { class: "stats three" },
      tile("CAGR after tax", signed(s.cagr_net, fmt.p1), `before tax ${sign((s.pre || {}).cagr, fmt.p1)} · gross ${sign(s.cagr_gross, fmt.p1)}`),
      tile("Sharpe after tax", U.snum(s.sharpe_net, 2), `before tax ${U.num((s.pre || {}).sharpe, 2)} · gross ${U.num(s.sharpe_gross, 2)}`),
      tile("Tax withheld", U.eur(s.tax_withheld, 0), `credits at the end ${U.eur(s.credits_end, 0)}`),
      tile("t, iid · NW", `${U.num(s.t_iid, 2)} · ${U.num(s.t_nw, 2)}`, "mean net return"),
      tile("Alpha t", U.snum(s.alpha_t_min ?? s.alpha_t_nw, 2), `alpha Sharpe ${U.num(s.alpha_sharpe, 2)}`),
      tile("PSR · DSR", `${U.num(s.psr0, 2)} · ${s.dsr == null ? "n/a" : U.num(s.dsr, 2)}`, "probability Sharpe > 0 / > noise bar"),
      tile("Max drawdown", signed(s.max_dd, fmt.p1), `${U.int(s.dd_sessions)} sessions · worst day ${sign(s.worst, fmt.p1)}`),
      tile("Trades", U.int(s.trades), `${U.num(s.trades_pa, 0)} a year · hit ${U.pct(s.hit_trades, 0)}`),
      tile("Edge − cost", `${U.num(s.edge_bps, 1)} − ${U.num(s.cost_bps, 1)}`, `= ${sign(s.net_bps_trade, U.NF[1])} bps a trade`),
      tile("Costs paid", U.eur((cb.fee || 0) + (cb.spread || 0) + (cb.ftt || 0), 0), `fees ${U.eur(cb.fee, 0)} · spread ${U.eur(cb.spread, 0)} · transaction tax ${U.eur(cb.ftt, 0)}`)),
    ...labSplit(v, v.window, { tiles: false }),
    Object.keys(sens).length ? [h("div", { class: "section-l" }, "Half-spread sensitivity: CAGR net, same trades re-priced"),
      table({ caption: "Sensitivity", cls: "compact", cols: Object.keys(sens).sort((a, b) => a - b).map((k) => ({ key: k, label: `${k} bps`, num: true, fmt: () => signed(sens[k], fmt.p1) })), rows: [{}] }),
      h("p", { class: "note" }, prose((v.sensitivity || {}).note || ""))] : null,
    coef ? [h("div", { class: "section-l" }, `What it believed, bps per SD${v.coef_as_of ? ` · as of ${U.d(v.coef_as_of)}` : ""}`),
      U.divRows(Object.entries(coef).map(([k, x]) => ({ label: k, v: x })))] : null,
    h("div", { class: "section-l" }, `Trades · page ${v.page || 1} of ${v.pages || 1} · ${U.int(v.trades_total)} in all`),
    (v.trades || []).length ? table({ caption: "Trades", cls: "compact", rows: v.trades, cols: [
      { key: "e", label: "In → out", fmt: (t) => `${U.ds(t.entered)} → ${U.ds(t.exited)}` },
      { key: "n", label: "Name", fmt: (t) => h("span", { class: "nm" }, t.name) },
      { key: "f", label: "Fcst", num: true, fmt: (t) => U.num(t.forecast_bps, 1) },
      { key: "g", label: "Gross", num: true, fmt: (t) => U.snum(t.gross_bps, 1) },
      { key: "c", label: "Cost", num: true, fmt: (t) => U.num(t.cost_bps, 1) },
      { key: "nt", label: "Net bps", num: true, fmt: (t) => U.snum(t.net_bps, 1) }] }) : h("p", { class: "note" }, "No trades in this window."),
    (v.pages || 1) > 1 ? h("div", { class: "actions" },
      h("button", { class: "btn sm", type: "button", disabled: (v.page || 1) <= 1 ? true : null, onclick: () => openVari(id, v.window, (v.page || 1) - 1) }, "Newer"),
      h("button", { class: "btn sm", type: "button", disabled: (v.page || 1) >= v.pages ? true : null, onclick: () => openVari(id, v.window, (v.page || 1) + 1) }, "Older")) : null,
    h("p", { class: "note" }, prose(v.caveat || ""), v.league_sha256 ? ` League hash ${U.sha8(v.league_sha256)}.` : ""),
  ] });
  const curve = v.curve || [];
  if (curve.length > 1) {
    setTimeout(() => U.lines(chartBox, [
      { label: "Gross", points: curve.map((p) => [p[0], p[2]]), style: "b1", fmt: (x) => U.eur(x, 0) },
      { label: "Before tax", points: curve.map((p) => [p[0], p.length > 3 ? p[3] : p[1]]), style: "pick", opts: { lineStyle: 2, lineWidth: 1 }, fmt: (x) => U.eur(x, 0) },
      { label: "After tax", points: curve.map((p) => [p[0], p[1]]), style: "pick", fmt: (x) => U.eur(x, 0) }], { euro: true, digits: 0 }), 30);
  } else chartBox.replaceChildren(empty("No curve in this window yet."));
}

/* ================================================================ LEARN */
LabViews.learn = async (el, ctx, wait) => {
  const U = LabUI, { sum } = ctx;
  el.append(...ctx.head(), wait);
  let roll = 250;
  let [Ln, rules] = await Promise.all([U.get("/api/lab/learning?roll=250", 300_000), U.get("/api/lab/rules", 600_000).catch(() => null)]);
  if (!ctx.alive()) return;
  wait.remove();
  if (Ln.state === "not_started") { el.replaceChildren(); labGate(el, "learn", Ln); return; }
  const champ = (sum.champion || {}).id;
  const champSrc = (((rules || {}).league || []).find((x) => x.id === champ) || {}).source || "ridge250";
  const last = (arr) => (arr && arr.length ? arr[arr.length - 1][1] : null);
  const trustLast = (Ln.trust || [])[Ln.trust.length - 1] || {};
  const experts = Object.keys(trustLast).filter((k) => k !== "d");
  const top = experts.filter((k) => k !== "zero").sort((a, b) => trustLast[b] - trustLast[a])[0];
  const lessons = Ln.lessons || [];
  const est = lessons.filter((l) => l.status === "established").length;
  const skip = Ln.skip || {};
  const skipCost = ok2(last(skip.ridge250_h1)) && ok2(last(skip.ridge250)) ? last(skip.ridge250_h1) - last(skip.ridge250) : null;
  const sl = Ln.sessions_learned || {};
  const SRC = { ridge60: "ridge-60 regression", ridge250: "ridge-250 regression", ridge1000: "ridge-1000 regression", cal5: "calibration table", icens: "signal ensemble", rev5cal: "5-day reversal, calibrated", meta: "meta-learner", zero: "zero (abstain)", ridge250_h1: "ridge-250, lag 1" };
  const sname = (k) => SRC[k] || k;

  el.append(U.kpis(sum, [
    { label: "Sessions learned", tier: "hero", value: U.int(sl.sessions), detail: h("span", { class: "muted" }, `since ${U.d(sl.first)} · to ${U.d(sl.as_of)}`) },
    { label: U.tl(`250-session IC · ${sname(champSrc)}`, "Information coefficient: the rank correlation between each night's forecasts and the next session's results, averaged over 250 sessions. 0 means no skill; above 0, the ranking pointed the right way more often than not."), tier: "major", value: h("span", { class: tone(last((Ln.ic || {})[champSrc])) }, ok2(last((Ln.ic || {})[champSrc])) ? sign(last(Ln.ic[champSrc]), U.NF[3]) : "n/a"),
      detail: h("span", { class: "muted" }, `the champion's source (${champ || "CASH"}) · rank correlation`) },
    { label: U.tl("Most trusted expert", "The meta-learner weighs each forecaster by its recent scored record; this is the one with the largest weight."), tier: "major", cls: "txt", value: top ? `${sname(top)}` : "—", detail: h("span", { class: "muted" }, top ? `${U.pct(trustLast[top], 0)} of the meta-learner's weight · zero ${U.pct(trustLast.zero, 0)}` : "") },
    { label: "Lessons established", value: [String(est), h("span", { class: "of" }, ` / ${lessons.length}`)], detail: h("span", { class: "muted" }, `${lessons.filter((l) => l.status === "forming").length} still forming`) },
    { label: U.tl("Skip cost", "What waiting one more session costs: the IC of the forecast used at once minus the same forecast used a session later."), value: ok2(skipCost) ? U.snum(skipCost, 3) : "n/a", detail: h("span", { class: "muted" }, "IC lag-1 − IC lag-2, ridge-250") },
    { label: "Forecast sources", value: U.int(Object.keys(Ln.ic || {}).length), detail: h("span", { class: "muted" }, "each scored before its result") },
  ]));

  /* ---------------- 1 LSSN */
  const LST = { established: ["Established", "ok"], forming: ["Forming", "na"], changed: ["Changed", "warn"], expired: ["Expired", "ref"] };
  const lesson = (l) => h("div", { class: `lab-lesson ${l.status}` },
    h("div", { class: "hd" }, h("span", { class: "ix" }, l.id), h("span", { class: "t" }, l.title), badge(...(LST[l.status] || [l.status, "na"]))),
    h("p", { class: "fact" }, l.status === "forming" && /^forming/.test(l.fact || "") ? h("span", { class: "muted" }, prose(l.fact)) : prose(l.fact || "")),
    h("div", { class: "meta" }, [l.n != null ? `n = ${U.int(l.n)}` : null, l.window, l.first_seen ? `first seen ${U.ds(l.first_seen)}` : null, l.updated ? `updated ${U.ds(l.updated)}` : null].filter(Boolean).join(" · ")),
    l.caveat ? h("p", { class: "note" }, prose(l.caveat)) : null);
  el.append(U.grid(card({ n: 1, code: "LSSN", title: "Lessons", span: 12, sub: `${est} established · ${lessons.length} in the catalogue`,
    body: lessons.length ? h("div", { class: "lab-lessons" }, lessons.map(lesson)) : empty("No lesson yet."),
    foot: "A fixed catalogue of templated facts, re-checked at every commit. Lessons describe; they never change a parameter." })));

  /* ---------------- 2 IC · 3 SKIP */
  let hi = champSrc;
  const icBox = h("div", { class: "chart fill" }), icLeg = h("div", { class: "chart-head" }), icChips = h("div", { class: "chips" });
  let icRes = null;
  const drawIC = () => {
    if (icRes) { dropChart(icRes.chart); U.charts = U.charts.filter((x) => x !== icRes.chart); icRes = null; }
    const ic = Ln.ic || {};
    const keys = Object.keys(ic);
    if (!keys.length) { icBox.replaceChildren(empty("No forecasts scored yet.")); return; }
    const dates = keys.flatMap((k) => ic[k].map((p) => p[0])).sort();
    const specs = keys.map((k) => ({ label: sname(k), points: ic[k], style: k === hi ? "you" : "grey", fmt: (x) => sign(x, U.NF[3]) }));
    specs.push({ label: "zero", points: [[dates[0], 0], [dates[dates.length - 1], 0]], style: "b1", tip: false });
    icRes = U.lines(icBox, specs, { digits: 2 });
    U.shadeFrom(icRes, icBox, Ln.live_start);
    icLeg.replaceChildren(U.legend([{ label: sname(hi), style: "you", value: ok2(last(ic[hi])) ? sign(last(ic[hi]), U.NF[3]) : "—" }, { label: "other sources", style: "grey" }, { label: "zero: no skill", style: "b1" }]));
    icChips.replaceChildren(...keys.map((k) => chip(sname(k), null, k === hi, () => { hi = k; drawIC(); })));
  };
  const rollSeg = seg([["60", "60 sessions"], ["250", "250 sessions"]], String(roll), async (r) => {
    roll = +r;
    try { const x = await U.get(`/api/lab/learning?roll=${roll}`, 300_000); if (!el.isConnected) return; Ln = { ...Ln, ic: x.ic, skip: x.skip }; drawIC(); drawSkip(); } catch (e) { toast("LAB", e.message); }
  }, "Rolling window");
  const skBox = h("div", { class: "chart fill" }), skTiles = h("div");
  let skRes = null;
  const ls04 = lessons.find((l) => l.id === "LS04");
  const drawSkip = () => {
    if (skRes) { dropChart(skRes.chart); U.charts = U.charts.filter((x) => x !== skRes.chart); skRes = null; }
    const sk = Ln.skip || {};
    skRes = (sk.ridge250 || []).length ? U.lines(skBox, [
      { label: "Lag 1: same close (not executable)", points: sk.ridge250_h1, style: "pick", fmt: (x) => sign(x, U.NF[3]) },
      { label: "Lag 2: next close (what the books use)", points: sk.ridge250, style: "you", fmt: (x) => sign(x, U.NF[3]) }], { digits: 2 }) : null;
    if (!skRes) skBox.replaceChildren(empty("No forecasts scored yet."));
    const a = last(sk.ridge250_h1), b = last(sk.ridge250);
    skTiles.replaceChildren(h("div", { class: "stats three" }, stat("Lag 1", ok2(a) ? sign(a, U.NF[3]) : "—", "same close"), stat("Lag 2", ok2(b) ? sign(b, U.NF[3]) : "—", "next close"),
      stat("Given up", ok2(a) && ok2(b) ? sign(a - b, U.NF[3]) : "—", "by waiting")));
  };
  el.append(U.grid(
    card({ n: 2, code: "IC", title: "Predictive skill over time", span: 8, sub: "rolling rank IC of each source's forecasts",
      tools: [rollSeg, icChips], body: [icLeg, icBox],
      foot: "Prequential: each forecast was scored against a return it had not seen. Shaded: the live span since registration. Rank IC above zero means the forecasts ordered stocks the right way on average." }),
    card({ n: 3, code: "SKIP", title: "What waiting one session costs", span: 4,
      body: [skTiles, h("div", { class: "legend" }, h("span", {}, h("i", { class: "key", style: "--c:var(--s1)" }), "lag 2, next close"), h("span", {}, h("i", { class: "key", style: "--c:var(--s2)" }), "lag 1, same close")), skBox,
        ls04 ? h("p", { class: "lede" }, h("b", {}, "LS04 · "), prose(ls04.fact)) : null],
      foot: "Rolling IC of ridge-250 against the same learner scored one session earlier. The books wait one session so that an order is known before its fill." })));
  drawIC(); drawSkip();

  /* ---------------- 4 TRST · 5 BELF */
  const trust = Ln.trust || [];
  const tdates = trust.map((x) => x.d);
  const yearsIdx = [...new Set(tdates.map((d) => d.slice(0, 4)))].map((y) => ({ y, i: tdates.findIndex((d) => d.slice(0, 4) === y) })).filter((x) => x.i > 0);
  /* the axis labels every second year (every fourth on a phone), always the last: 16 labels do not fit 400 px */
  const yStep = yearsIdx.length > 8 ? (window.innerWidth < 760 ? 4 : 2) : 1;
  const yearTicks = yearsIdx.filter((x, k, a) => (a.length - 1 - k) % yStep === 0);
  const WW = 400, HH = 36;
  const xAt = (i) => (i / Math.max(1, trust.length - 1)) * WW, yAt = (v) => HH - 2 - U.clamp(v) * (HH - 4);
  const mult = experts.map((k) => {
    const pts = trust.map((r, i) => `${xAt(i).toFixed(1)},${yAt(r[k] || 0).toFixed(1)}`).join(" ");
    const col = k === "zero" ? "var(--other)" : "var(--s1)";
    const svg = h("svg", { viewBox: `0 0 ${WW} ${HH}`, preserveAspectRatio: "none", role: "img", "aria-label": `${sname(k)}: trust weight over time; now ${U.pct(trustLast[k], 0)}` },
      yearsIdx.map(({ i }) => h("line", { x1: xAt(i), x2: xAt(i), y1: 0, y2: HH, style: "stroke:var(--line);stroke-width:1", "vector-effect": "non-scaling-stroke" })),
      h("polygon", { points: `0,${HH - 2} ${pts} ${WW},${HH - 2}`, style: `fill:${col};opacity:.16` }),
      h("polyline", { points: pts, style: `fill:none;stroke:${col};stroke-width:1.5`, "vector-effect": "non-scaling-stroke" }));
    svg.addEventListener("pointermove", (e) => {
      const r = svg.getBoundingClientRect(), i = Math.max(0, Math.min(trust.length - 1, Math.round(((e.clientX - r.left) / r.width) * (trust.length - 1))));
      showTip(e.clientX, e.clientY, [h("div", { class: "tip-h" }, day(trust[i].d)), h("div", { class: "row" }, h("span", {}, sname(k)), h("span", { class: "num" }, U.pct(trust[i][k], 0)))]);
    });
    svg.addEventListener("pointerleave", hideTip);
    return h("div", { class: "mult" }, h("div", { class: "n" }, h("i", { class: "key box", style: `--c:${col}` }), h("div", { style: "min-width:0" }, h("span", {}, sname(k)), h("small", {}, k === "zero" ? "never trades" : "expert"))),
      svg, h("div", { class: "v" }, U.pct(trustLast[k], 0), h("small", {}, "now")));
  });
  const B = Ln.beliefs || {};
  const btab = B.table || [];
  let fsel = (btab[0] || {}).f;
  const belBox = h("div"), pathBox = h("div", { class: "chart s" });
  let pathRes = null;
  const drawBel = () => {
    belBox.replaceChildren(table({ caption: "What the core learner believes", cls: "compact", rows: btab, rowCls: (r) => (r.f === fsel ? "sel" : ""),
      onrow: (r) => { fsel = r.f; drawBel(); drawPath(); },
      cols: [
        { key: "f", label: "Feature", fmt: (r) => [h("span", { class: "nm" }, r.label || r.f), h("span", { class: "sub" }, r.f)] },
        { key: "now", label: "Now", num: true, fmt: (r) => U.snum(r.now, 1) },
        { key: "m1", label: "1 month", num: true, fmt: (r) => U.snum(r.m1, 1) },
        { key: "y1", label: "1 year", num: true, hideSm: true, fmt: (r) => U.snum(r.y1, 1) },
        { key: "al", label: "At live start", num: true, hideSm: true, fmt: (r) => U.snum(r.at_live, 1) },
        { key: "t", label: "t", num: true, hideSm: true, fmt: (r) => (r.t == null ? h("span", { class: "dim" }, "—") : U.snum(r.t, 1)) }] }));
  };
  const drawPath = () => {
    if (pathRes) { dropChart(pathRes.chart); U.charts = U.charts.filter((x) => x !== pathRes.chart); pathRes = null; }
    const i = (B.features || []).indexOf(fsel);
    if (i < 0 || !(B.path || []).length) { pathBox.replaceChildren(empty("No coefficient path yet.")); return; }
    const pts = B.path.map(([d, a]) => [d, a[i]]);
    pathRes = U.lines(pathBox, [{ label: (btab.find((r) => r.f === fsel) || {}).label || fsel, points: pts, style: "you", fmt: (x) => `${sign(x, U.NF[1])} bps` },
      { label: "zero", points: [[pts[0][0], 0], [pts[pts.length - 1][0], 0]], style: "b1", tip: false }], { digits: 1 });
    U.shadeFrom(pathRes, pathBox, Ln.live_start);
  };
  el.append(U.grid(
    card({ n: 4, code: "TRST", title: "Whom the meta-learner trusts", span: 6, sub: "weights, shared 0–100% scale",
      body: trust.length ? [h("div", { class: "multiples" }, mult, h("div", { class: "mult-axis" }, h("span", {}, "0–100%"), h("span", { class: "ticks" }, yearTicks.map(({ y, i }) => h("span", { style: `left:${(i / Math.max(1, trust.length - 1)) * 100}%` }, y))), h("span"))),
        h("p", { class: "lede" }, "The meta-learner moves weight toward the experts whose recent forecasts scored best, and can give it to the zero expert, which never trades. A high zero weight is the model choosing to abstain.")]
        : empty("The meta-learner has not started yet."),
      foot: "LC3 as small multiples (one row per expert, same scale), not a stacked area. Weekly points." }),
    card({ n: 5, code: "BELF", title: "What the core learner believes", span: 6, sub: "ridge-250 coefficients, bps per SD",
      body: btab.length ? [belBox, h("div", { class: "section-l" }, "Path of the selected feature"), pathBox] : empty("No coefficients yet."),
      foot: "bps of next-session market-adjusted return per standard deviation of the feature. Negative on reversal features means recent losers were expected to rebound. Select a row for its path; shaded: live span." })));
  drawBel(); drawPath();

  /* ---------------- 6 CAL5 · 7 CALB */
  const C5 = Ln.cal5 || {};
  const cm = Object.fromEntries((C5.calm || []).map((x) => [x[0], x])), tm = Object.fromEntries((C5.turbulent || []).map((x) => [x[0], x]));
  const deciles = [...new Set([...Object.keys(cm), ...Object.keys(tm)].map(Number))].sort((a, b) => a - b);
  const allMu = [...(C5.calm || []), ...(C5.turbulent || [])].map((x) => Math.abs(x[1] || 0));
  const mMax = Math.max(1e-9, ...allMu);
  const heat = (x) => { if (!ok2(x)) return ""; const s = U.clamp(Math.abs(x) / mMax); return `lab-h ${x >= 0 ? "u" : "d"}${s < 0.25 ? 1 : s < 0.5 ? 2 : s < 0.75 ? 3 : 4}`; };
  const c5Box = h("div", { class: "chart s" });
  let relSrc = Object.keys(Ln.reliability || {}).includes(champSrc) ? champSrc : Object.keys(Ln.reliability || {})[0];
  const relBox = h("div", { class: "lab-flexcol" }), relPick = h("select", { "aria-label": "Forecast source" }, Object.keys(Ln.reliability || {}).map((k) => h("option", { value: k, selected: k === relSrc ? true : null }, sname(k))));
  const drawRel = () => {
    const R = (Ln.reliability || {})[relSrc] || {};
    const sets = [["design", "var(--bench-2)", "Design"], ["validation", "var(--s2)", "Validation"], ["live", "var(--s1)", "Live"]].filter(([k]) => (R[k] || []).length);
    const pts = sets.flatMap(([k]) => R[k]);
    if (!pts.length) { relBox.replaceChildren(empty("No calibration data for this source yet.")); return; }
    const vals = pts.flatMap((p) => [p[1], p[2]]).filter(ok2);
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), pd = (hi - lo) * 0.08 || 1;
    U.fill(relBox, U.svgBox(null, (w, H) => {
      const pad = { l: 46, r: 10, t: 10, b: 30 }, x = U.lin(lo - pd, hi + pd, pad.l, w - pad.r), y = U.lin(lo - pd, hi + pd, H - pad.b, pad.t);
      const tk = U.ticks(lo - pd, hi + pd, 5);
      return U.svg(w, H, `Reliability of ${sname(relSrc)}: mean realised against mean forecast by decile`,
        tk.map((v) => [h("line", { x1: pad.l, x2: w - pad.r, y1: y(v), y2: y(v), class: v === 0 ? "zero" : "grid" }), U.t(pad.l - 6, y(v) + 4, sign(v, U.NF[0]), { class: "ax", "text-anchor": "end" }),
          U.t(x(v), H - 16, sign(v, U.NF[0]), { class: "ax", "text-anchor": "middle" })]),
        U.t(w - pad.r, H - 3, "mean forecast, bps →", { class: "ax", "text-anchor": "end" }), U.t(pad.l + 2, pad.t + 10, "↑ realised, bps", { class: "ax" }),
        h("line", { x1: x(lo - pd), y1: y(lo - pd), x2: x(hi + pd), y2: y(hi + pd), class: "diag" }),
        sets.map(([k, c, lab]) => [h("polyline", { points: R[k].map((p) => `${x(p[1]).toFixed(1)},${y(p[2]).toFixed(1)}`).join(" "), style: `fill:none;stroke:${c};stroke-width:1.2;opacity:.6` }),
          R[k].map((p) => h("circle", { cx: x(p[1]), cy: y(p[2]), r: k === "live" ? 4 : 3.4, style: `fill:${c}`, "data-tip": `${lab}, decile ${p[0]}: forecast ${sign(p[1], U.NF[1])}, realised ${sign(p[2], U.NF[1])} bps${p[3] != null ? ` (n = ${U.int(p[3])})` : ""}` }))]));
    }, "lab-fill"), legend([...sets.map(([k, c, lab]) => ({ c, style: "dot", label: lab })), { c: "var(--line-3)", style: "dash", label: "perfect calibration" }]),
    (R.live || []).length ? null : h("p", { class: "note" }, "Live: needs 500 live forecasts."));
  };
  relPick.addEventListener("change", () => { relSrc = relPick.value; drawRel(); });
  el.append(U.grid(
    card({ n: 6, code: "CAL5", title: "The calibration table", span: 6, flush: true, sub: "decile of the 5-session reversal × market state",
      body: [deciles.length ? table({ caption: "CAL5 cells", cls: "compact", rows: deciles,
        groups: [{ span: 1 }, { span: 2, label: "Calm sessions" }, { span: 2, label: "Turbulent sessions" }],
        cols: [{ key: "d", label: "Decile", fmt: (d) => h("span", { class: "rk" }, d === 1 ? "1 · losers" : d === 10 ? "10 · winners" : String(d)) },
          { key: "cm", label: ["mean (", U.gk("μ"), "), bps"], sl: "Calm mean, bps", num: true, cls: (d) => heat((cm[d] || [])[1]), fmt: (d) => U.snum((cm[d] || [])[1], 1) },
          { key: "cw", label: "Weight", num: true, fmt: (d) => U.int((cm[d] || [])[2]) },
          { key: "tm", label: ["mean (", U.gk("μ"), "), bps"], sl: "Turbulent mean, bps", num: true, cls: (d) => heat((tm[d] || [])[1]), fmt: (d) => U.snum((tm[d] || [])[1], 1) },
          { key: "tw", label: "Weight", num: true, fmt: (d) => U.int((tm[d] || [])[2]) }] }) : U.pad(empty("The table has no cells yet.")),
        U.pad(h("div", { class: "section-l" }, "Decile 10 over time, bps"), legend([{ c: "var(--s2)", style: "line", label: "calm" }, { c: "var(--s3)", style: "line", label: "turbulent" }]), c5Box)],
      foot: "Which decile a stock's 5-session move falls in, and whether the market is calm or turbulent (stress above 1), picks the cell; μ is the cell's weighted mean next-session excess return, shrunk toward 0." }),
    card({ n: 7, code: "CALB", title: "Are the forecasts calibrated?", span: 6,
      tools: [h("label", { class: "field lab-inline" }, h("span", {}, "Source"), relPick)],
      body: relBox,
      foot: "Forecast decile against the mean realised result: points on the dashed line mean the forecasts meant what they said. Validation and live side by side; design in grey." })));
  drawRel();
  const p10 = C5.path_d10 || {};
  if ((p10.calm || []).length || (p10.turbulent || []).length) {
    const res = U.lines(c5Box, [{ label: "Calm", points: p10.calm, style: "s2", fmt: (x) => `${sign(x, U.NF[1])} bps` }, { label: "Turbulent", points: p10.turbulent, style: "s3", fmt: (x) => `${sign(x, U.NF[1])} bps` }], { digits: 1 });
    U.shadeFrom(res, c5Box, Ln.live_start);
  } else c5Box.replaceChildren(empty("No path yet."));

  /* ---------------- 8 EDGE · 9 DECY */
  const ev = Ln.edge_vs_cost || [];
  const evBox = h("div", { class: "chart fill" });
  const evLast = ev[ev.length - 1] || {};
  const years = Ln.ic_by_year || [];
  const fam = ["reversal", "sector", "slow", "risk", "stress"];
  const FAM = { reversal: "Reversal", sector: "Sector", slow: "Slow (momentum)", risk: "Risk (volatility)", stress: "Stress interactions" };
  const yMax = Math.max(1e-9, ...years.flatMap((y) => fam.map((f) => Math.abs(y[f] || 0))));
  const heatY = (x) => { if (!ok2(x)) return ""; const s = U.clamp(Math.abs(x) / yMax); return `lab-h ${x >= 0 ? "u" : "d"}${s < 0.25 ? 1 : s < 0.5 ? 2 : s < 0.75 ? 3 : 4}`; };
  el.append(U.grid(
    card({ n: 8, code: "EDGE", title: "Edge against cost per trade", span: 6, sub: `${Ln.edge_vs_cost_source || champSrc}, rolling 60 trades`,
      body: ev.length ? [h("div", { class: "stats three" },
        stat("Edge", U.sbps(evLast.edge_bps), "gross, per trade"), stat("Cost", U.bps(evLast.cost_bps), "fee, spread, tax"),
        stat("Net", ok2(evLast.edge_bps) && ok2(evLast.cost_bps) ? U.sbps(evLast.edge_bps - evLast.cost_bps) : "—", `trade ${U.int(evLast.trade_no)}`)),
        U.legend([{ label: "Edge (gross result)", style: "you" }, { label: "Cost", style: "b1" }]), evBox] : empty("Needs 60 trades."),
      foot: "A strategy pays only while the solid line stays above the dashed one. Rolling means over the last 60 trades, dated by the trade's session." }),
    card({ n: 9, code: "DECY", title: "Skill by year", span: 6, flush: true, sub: "mean daily rank IC by feature family",
      body: years.length ? [table({ caption: "IC by year and feature family", cls: "compact", rows: years,
        foot: { year: "Mean", ...Object.fromEntries(fam.map((f) => { const v = years.map((y) => y[f]).filter(ok2); return [f, v.length ? U.snum(v.reduce((a, b) => a + b, 0) / v.length, 3) : "—"]; })) },
        cols: [{ key: "year", label: "Year", fmt: (y) => String(y.year) }, ...fam.map((f) => ({ key: f, label: FAM[f], num: true, cls: (y) => heatY(y[f]), fmt: (y) => U.snum(y[f], 3) }))] }),
        U.pad(h("dl", { class: "kv" }, [["Reversal", "one-day reversal and the rest of the week (F1–F4)"], ["Sector", "sector-adjusted 5-day move (F6)"], ["Slow (momentum)", "rest of the month and 12–1 momentum (F5, F7)"],
          ["Risk (volatility)", "idiosyncratic volatility (F8)"], ["Stress interactions", "reversal × market stress (F9, F10)"]].map(([k, v]) => [h("dt", {}, k), h("dd", { class: "lab-dd" }, v)])))]
        : U.pad(empty("No year complete yet.")),
      foot: "Signed numbers; shading only repeats the sign and size. A family whose IC shrinks toward zero year after year has decayed." })));
  if (ev.length) {
    const seen = new Map(); ev.forEach((x) => seen.set(x.session, x));
    const E = [...seen.values()];
    U.lines(evBox, [{ label: "Edge", points: E.map((x) => [x.session, x.edge_bps]), style: "you", fmt: (x) => `${sign(x, U.NF[1])} bps` },
      { label: "Cost", points: E.map((x) => [x.session, x.cost_bps]), style: "b1", fmt: (x) => `${U.num(x, 1)} bps` }], { digits: 0 });
  }
};

/* ================================================================ PRACTICE */
LabViews.practice = async (el, ctx, wait) => {
  const U = LabUI, { sum } = ctx;
  el.append(...ctx.head(), wait);
  const [P, L] = await Promise.all([U.get("/api/lab/practice", 60_000), U.get("/api/lab/league?window=validation", 300_000).catch(() => null)]);
  if (!ctx.alive()) return;
  wait.remove();
  if (P.state === "not_started") { el.replaceChildren(); labGate(el, "practice", P); return; }
  const c = P.counters || {};
  const q = P.queue || [];
  const lastRun = q.map((x) => x.last).filter(Boolean).sort().pop();
  const champ = (sum.champion || {}).id;
  const notRun = `Not run yet: queued (${U.int(P.remaining_runs || 0)} runs ahead).`;
  U.caveat(el, h("div", { class: "lab-strip note", role: "note" }, badge("Fragility, not edge", "warn"), h("span", {}, "Drills re-use the same history. They show how fragile a result is, not whether an edge is real.")));
  el.append(U.kpis(sum, [
    { label: "Walk-forward book-sessions", tier: "hero", value: U.int(c.book_sessions_walkforward), detail: h("span", { class: "muted" }, "every book replayed once over the history: practice, not new evidence") },
    { label: "Live paper fills to date", tier: "major", value: U.int(c.fills_live), detail: h("span", { class: "muted" }, `the only new evidence${ok2(c.fills_per_week_live) ? ` · ${U.num(c.fills_per_week_live, 0)} a week` : ""}`) },
    { label: "Drill book-sessions", tier: "major", value: U.int(c.book_sessions_drills), detail: h("span", { class: "muted" }, "resampled and altered history") },
    { label: "Drill runs / target", value: [U.int(P.done), h("span", { class: "of" }, ` / ${U.int(P.target)}`)], detail: h("span", { class: "muted" }, P.finished ? "programme finished" : `${U.int(P.remaining_runs)} runs to go`) },
    { label: "Last batch", value: lastRun ? U.ds(lastRun) : "—", detail: h("span", { class: "muted" }, lastRun ? U.hm(lastRun) : "none yet") },
    { label: "Learner-sessions in drills", value: U.int(c.learner_sessions_drills), detail: h("span", { class: "muted" }, `${U.int(c.histories)} histories`) },
  ]));

  /* ---------------- 1 CNTR · 2 QUEU */
  const DR = { "DR-BOOT": "Resampled histories: learners start cold, every book rides along", "DR-PLACEBO": "As DR-BOOT with shuffled learning labels: the null of the whole procedure",
    "DR-HALF": "The universe split in two halves, each run on the real path", "DR-COST": "Half-spread 3, 10, 20 bps; €2 fee; Italian tax 0.2%", "DR-CAP": "Book capital €1,000 to €25,000",
    "DR-LAG": "Fills one session later than the rule", "DR-START": "Validation books started on each quarter's first session" };
  const qBtn = h("button", { class: "btn", type: "button", disabled: P.finished || !(P.remaining_runs > 0) ? true : null, onclick: async (e) => {
    const b = e.currentTarget; b.disabled = true; b.textContent = "Queued…";
    try { const r = await post("/api/lab/drills", { minutes: 10 }); invalidate("lab:/api/lab/practice"); toast("LAB", `Drills batch queued; ${U.int(r.remaining_runs)} runs left before it.`); }
    catch (x) { toast("LAB", x.message); b.disabled = false; b.textContent = "Run a 10-minute batch now"; }
  } }, P.finished ? "Programme finished" : "Run a 10-minute batch now");
  el.append(U.grid(
    card({ n: 1, code: "CNTR", title: "Practice counters", span: 5,
      body: [h("div", { class: "lab-counters" },
        h("div", { class: "c you" }, h("div", { class: "l" }, "Live book-sessions"), h("div", { class: "v" }, U.int(c.book_sessions_live)), h("p", {}, `Each book trading on paper through a live session since ${U.d(sum.live_start)}. The only new evidence.`)),
        h("div", { class: "c" }, h("div", { class: "l" }, "Walk-forward book-sessions"), h("div", { class: "v" }, U.int(c.book_sessions_walkforward)), h("p", {}, "The same books replayed once over history. Not new evidence.")),
        h("div", { class: "c" }, h("div", { class: "l" }, "Drill book-sessions"), h("div", { class: "v" }, U.int(c.book_sessions_drills)), h("p", {}, "Resampled or altered histories. Measures fragility only."))),
        h("p", { class: "note" }, `Live paper fills: ${U.int(c.fills_live)}, about ${U.num(c.fills_per_week_live, 0)} a week. The three counters are never added together: more books do not make any single book's evidence arrive faster.`)],
      foot: "Counters, never evidence." }),
    card({ n: 2, code: "QUEU", title: "Drill programme", span: 7, flush: true,
      tools: U.pub ? [h("span", { class: "note" }, "Batches run on the owner's computer in a low-priority background process; they send nothing to Lang & Schwarz.")]
        : [qBtn, h("span", { class: "note" }, "Runs in a low-priority background process for up to 10 minutes; it sends nothing to Lang & Schwarz.")],
      body: [q.length ? table({ caption: "Drill queue", stack: true, rows: q, cols: [
        { key: "d", label: "Drill", fmt: (x) => h("span", { class: "tick" }, x.drill) },
        { key: "w", label: "What it runs", lead: true, fmt: (x) => h("span", { class: "lab-wrap" }, DR[x.drill] || "") },
        { key: "p", label: "Done", wide: true, fmt: (x) => h("span", { class: "lab-qp" }, progress(x.target ? x.done / x.target : 0, { kind: x.done >= x.target ? "ok" : "" }), h("span", { class: "num" }, `${U.int(x.done)} / ${U.int(x.target)}`)) },
        { key: "l", label: "Last run", fmt: (x) => (x.last ? U.when(x.last) : "—") },
        { key: "n", label: "Next", fmt: (x) => (x.done >= x.target ? badge("Done", "ok") : badge("Queued", "na")) }] }) : U.pad(empty("Queued after registration.")),
        U.pad(h("p", { class: "callout" }, h("b", {}, "What reads them: "), "scorecard criterion B5 uses four drills for the champion: the placebo (at or above its 95th percentile), cost at 10 bps (net above zero), one session late (net at or above zero) and the stock halves (above zero in 70% of splits)."))],
      foot: U.foot(`${U.int(P.done)} of ${U.int(P.target)} runs`, P.finished ? "programme finished" : `batches run after the nightly step and at weekends while ${U.runs("is open")}`, "seeded: re-running gives the same numbers") })));

  /* ---------------- 3 BOOT · 4 PLCB */
  const boot = P.boot || {}, plc = P.placebo || {};
  const bIds = Object.keys(boot);
  const bVals = bIds.flatMap((k) => Object.values(boot[k].sharpe_net || {})).concat(bIds.map((k) => (plc[k] || {}).sharpe_net_p50)).filter(ok2);
  const bLo = Math.min(0, ...bVals), bHi = Math.max(0, ...bVals), bp = (bHi - bLo) * 0.05 || 0.3;
  const pIds = Object.keys(plc);
  const pVals = pIds.flatMap((k) => [plc[k].sharpe_net_p50, plc[k].sharpe_net_p95, plc[k].real_sharpe]).filter(ok2);
  const pLo = Math.min(0, ...pVals), pHi = Math.max(0, ...pVals), pp = (pHi - pLo) * 0.05 || 0.3;
  el.append(U.grid(
    card({ n: 3, code: "BOOT", title: "Resampled histories", span: 6, sub: "net Sharpe across resampled histories",
      body: bIds.length ? [U.rowPlot({ rows: bIds.map((k) => { const s = boot[k].sharpe_net || {}; return { label: k, cls: k === champ ? "you" : "", whisker: [s.p05, s.p95], box: [s.p25, s.p75], mid: s.p50,
          greyDot: (plc[k] || {}).sharpe_net_p50, value: `${U.pct(boot[k].share_positive, 0)} > 0`,
          tip: `${k}: median ${sign(s.p50, U.NF[2])}, 5–95% ${sign(s.p05, U.NF[2])} to ${sign(s.p95, U.NF[2])}; positive in ${U.pct(boot[k].share_positive, 0)} of ${U.int(boot[k].n)} histories` }; }),
          lo: bLo - bp, hi: bHi + bp, fmtx: (x) => sign(x, U.NF[1]), label: "Distribution of net Sharpe across resampled histories" }),
        legend([{ c: "var(--ink-2)", style: "box", label: "25–75%" }, { c: "var(--ink-3)", style: "line", label: "5–95%" }, { c: "var(--s1)", style: "box", label: "champion" }, { c: "var(--bench-2)", style: "dot", label: "placebo median" }])]
        : empty(notRun),
      foot: "Right column: the share of histories with a net Sharpe above zero. Learners start cold in every history." }),
    card({ n: 4, code: "PLCB", title: "Placebo", span: 6, sub: "validation Sharpe against shuffled-label runs",
      body: pIds.length ? [U.rowPlot({ rows: pIds.map((k) => ({ label: k, cls: k === champ ? "you" : "", grey: [plc[k].sharpe_net_p50, plc[k].sharpe_net_p95], dot: plc[k].real_sharpe,
          value: `${U.pct(plc[k].real_percentile, 0)} pct`, tip: `${k}: real ${sign(plc[k].real_sharpe, U.NF[2])}; placebo median ${sign(plc[k].sharpe_net_p50, U.NF[2])}, 95th ${sign(plc[k].sharpe_net_p95, U.NF[2])} (n = ${U.int(plc[k].n)})` })),
          lo: pLo - pp, hi: pHi + pp, fmtx: (x) => sign(x, U.NF[1]), label: "Real validation Sharpe against the placebo distribution" }),
        legend([{ c: "var(--ink-2)", style: "dot", label: "real validation Sharpe" }, { c: "var(--bench-2)", style: "line", label: "placebo median to 95th percentile" }])]
        : empty(notRun),
      foot: "A placebo run learns from labels shuffled across stocks, so it can only find noise; B5 asks the champion to sit at or above the placebo's 95th percentile." })));

  /* ---------------- 5 STRS · 6 CAPT */
  const cost = P.cost || [], cap = P.capital || [];
  const hv = (x) => { if (!ok2(x)) return ""; const s = U.clamp(Math.abs(x) / 0.5); return `lab-h ${x >= 0 ? "u" : "d"}${s < 0.1 ? 1 : s < 0.3 ? 2 : s < 0.6 ? 3 : 4}`; };
  const cc = (k, lab, extra = {}) => ({ key: k, label: lab, num: true, cls: (r) => hv(r[k]), fmt: (r) => (r[k] == null ? h("span", { class: "dim" }, "—") : signed(r[k], fmt.p1)), ...extra });
  el.append(U.grid(
    card({ n: 5, code: "STRS", title: "Cost stress", span: 6, flush: true, sub: "net CAGR, validation",
      body: cost.length ? table({ caption: "Cost stress", cls: "compact lab-sticky", rows: cost, rowCls: (r) => (r.id === champ ? "you" : ""),
        groups: [{ span: 1 }, { span: 4, label: "Half-spread a side" }, { span: 2, label: "Other costs" }, { span: 1 }],
        cols: [{ key: "id", label: "ID", fmt: (r) => h("span", { class: "tick" }, r.id) }, cc("hs3", "3 bps"), cc("hs5", "5 (base)"), cc("hs10", "10 bps"), cc("hs20", "20 bps"), cc("fee2", "€2 fee"), cc("it02", "IT tax 0.2%"),
          { key: "be", label: "Break-even", num: true, title: "half-spread at which net CAGR reaches zero", fmt: (r) => (r.breakeven_hs_bps == null ? U.na("net is below zero even at 3 bps, or above zero at 20 bps") : `${U.num(r.breakeven_hs_bps, 1)} bps`) }] }) : U.pad(empty(notRun)),
      foot: "Books re-decide on the stored forecasts at each cost level. 5 bps is the base every book uses." }),
    card({ n: 6, code: "CAPT", title: "Ticket size", span: 6, flush: true, sub: "net CAGR by book capital, validation",
      body: cap.length ? table({ caption: "Book capital", cls: "compact lab-sticky", rows: cap, rowCls: (r) => (r.id === champ ? "you" : ""),
        cols: [{ key: "id", label: "ID", fmt: (r) => h("span", { class: "tick" }, r.id) }, cc("c1000", "€1k"), cc("c2500", "€2.5k"), cc("c5000", "€5k"), cc("c10000", "€10k (base)"), cc("c25000", "€25k"),
          { key: "be", label: "Break-even", num: true, title: "the book size where net CAGR crosses zero", fmt: (r) => (r.breakeven_eur == null ? U.na("no break-even inside the tested books, €1,000 to €25,000") : U.eur(r.breakeven_eur, 0)) }] }) : U.pad(empty(notRun)),
      foot: "Arithmetic on paper trades, not a suggested amount. The €1 fee weighs more on a small book; below €1,000 a ticket no trade is placed." })));

  /* ---------------- 7 HALF · 8 LAG · 9 STRT */
  const halves = P.halves || [], lag = P.lag || [], start = P.start || [];
  const med = (a) => { const s = a.filter(ok2).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  el.append(U.grid(
    card({ n: 7, code: "HALF", title: "Stock halves", span: 4, flush: true,
      body: halves.length ? table({ caption: "Stock halves", cls: "compact", rows: halves, rowCls: (r) => (r.id === champ ? "you" : ""), cols: [
        { key: "id", label: "ID", fmt: (r) => h("span", { class: "tick" }, r.id) },
        { key: "s", label: "Both halves > 0", num: true, fmt: (r) => U.pct(r.share_positive, 0) },
        { key: "a", label: "Median A · B", num: true, fmt: (r) => [signed(med((r.pairs || []).map((p) => p[0])), fmt.p1), " · ", signed(med((r.pairs || []).map((p) => p[1])), fmt.p1)] },
        { key: "n", label: "Splits", num: true, fmt: (r) => U.int((r.pairs || []).length) }] }) : U.pad(empty(notRun)),
      foot: "The universe split into two random halves; net CAGR on each. B5 needs > 0 in 70% of splits." }),
    card({ n: 8, code: "LAG", title: "One session late", span: 4, flush: true,
      body: lag.length ? table({ caption: "One session late", cls: "compact", rows: lag, rowCls: (r) => (r.id === champ ? "you" : ""), cols: [
        { key: "id", label: "ID", fmt: (r) => h("span", { class: "tick" }, r.id) },
        { key: "a", label: "Next close", num: true, fmt: (r) => signed(r.next_close, fmt.p1) },
        { key: "b", label: "One later", num: true, fmt: (r) => signed(r.one_later, fmt.p1) },
        { key: "d", label: "Cost of waiting", num: true, fmt: (r) => (ok2(r.next_close) && ok2(r.one_later) ? signed(r.one_later - r.next_close, fmt.p1) : "—") }] }) : U.pad(empty(notRun)),
      foot: "Net CAGR when every fill comes one session later than the rule. B5 needs ≥ 0." }),
    card({ n: 9, code: "STRT", title: "Start dates", span: 4, flush: true,
      body: start.length ? table({ caption: "Start dates", cls: "compact", rows: start, rowCls: (r) => (r.id === champ ? "you" : ""), cols: [
        { key: "id", label: "ID", fmt: (r) => h("span", { class: "tick" }, r.id) },
        { key: "n", label: "Starts", num: true, fmt: (r) => U.int((r.cagr_net_by_start || []).length) },
        { key: "lo", label: "Lowest", num: true, fmt: (r) => signed(Math.min(...(r.cagr_net_by_start || []).filter(ok2)), fmt.p1) },
        { key: "md", label: "Median", num: true, fmt: (r) => signed(med(r.cagr_net_by_start || []), fmt.p1) },
        { key: "hi", label: "Highest", num: true, fmt: (r) => signed(Math.max(...(r.cagr_net_by_start || []).filter(ok2)), fmt.p1) }] }) : U.pad(empty(notRun)),
      foot: U.foot("Net CAGR by the quarter a book started", start[0] && (start[0].starts || []).length ? `starts ${start[0].starts[0]} → ${start[0].starts[start[0].starts.length - 1]}` : "") })));

  /* ---------------- 10 SKLL */
  const S = P.skill_vs_practice || {};
  const srcs = Object.keys(S).filter((k) => S[k] && S[k].p50);
  const champSrc = (((L || {}).groups || []).flatMap((g) => g.rows || []).find((r) => r.id === champ) || {}).source;
  let sk = srcs.includes(champSrc) ? champSrc : srcs.includes("ridge250") ? "ridge250" : srcs[0];
  const skBox = h("div"), skChips = h("div", { class: "chips" });
  const drawSk = () => {
    skChips.replaceChildren(...srcs.map((k) => chip(k, null, k === sk, () => { sk = k; drawSk(); })));
    const K = S.k || [], D = S[sk] || {}, lp = S.live_point;
    const idx = K.map((k, i) => i).filter((i) => ok2((D.p50 || [])[i]));
    if (!idx.length) { skBox.replaceChildren(empty(`Drills running: ${U.int(P.done)}/${U.int(P.target)} histories.`)); return; }
    skBox.replaceChildren(U.svgBox(260, (w, H) => {
      const pad = { l: 50, r: 16, t: 12, b: 30 };
      const ks = idx.map((i) => K[i]).concat(lp ? [lp[0]] : []);
      const vals = idx.flatMap((i) => [D.p05[i], D.p95[i], D.p50[i]]).concat(lp ? [lp[1]] : []).filter(ok2);
      const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), pd = (hi - lo) * 0.08;
      const lx = (k) => Math.log10(k);
      const x = U.lin(lx(Math.min(...ks) * 0.85), lx(Math.max(...ks) * 1.15), pad.l, w - pad.r), y = U.lin(lo - pd, hi + pd, H - pad.b, pad.t);
      const area = `M${idx.map((i) => `${x(lx(K[i])).toFixed(1)},${y(D.p95[i]).toFixed(1)}`).join("L")}L${idx.slice().reverse().map((i) => `${x(lx(K[i])).toFixed(1)},${y(D.p05[i]).toFixed(1)}`).join("L")}Z`;
      return U.svg(w, H, `Skill against practice for ${sk}: median and 5–95% of prequential IC after k sessions across ${S.histories} histories`,
        U.ticks(lo - pd, hi + pd, 4).map((v) => [h("line", { x1: pad.l, x2: w - pad.r, y1: y(v), y2: y(v), class: v === 0 ? "zero" : "grid" }), U.t(pad.l - 6, y(v) + 4, sign(v, U.NF[2]), { class: "ax", "text-anchor": "end" })]),
        idx.map((i) => U.t(x(lx(K[i])), H - 12, U.int(K[i]), { class: "ax", "text-anchor": "middle" })), U.t(w - pad.r, H - 1, "sessions of practice (log scale) →", { class: "ax", "text-anchor": "end" }),
        h("path", { d: area, class: "fan2" }),
        h("polyline", { points: idx.map((i) => `${x(lx(K[i])).toFixed(1)},${y(D.p50[i]).toFixed(1)}`).join(" "), class: "med" }),
        idx.map((i) => h("circle", { cx: x(lx(K[i])), cy: y(D.p50[i]), r: 3, class: "medd", "data-tip": `after ${U.int(K[i])} sessions: median IC ${sign(D.p50[i], U.NF[3])}, 5–95% ${sign(D.p05[i], U.NF[3])} to ${sign(D.p95[i], U.NF[3])}` })),
        lp ? h("circle", { cx: x(lx(lp[0])), cy: y(lp[1]), r: 5, class: "youdot", "data-tip": `Live: ${U.int(lp[0])} sessions, IC ${sign(lp[1], U.NF[3])}` }) : null);
    }), legend([{ c: "var(--bench-2)", style: "box", label: `drills, 5–95% (${U.int(S.histories)} histories)` }, { c: "var(--bench-1)", style: "line", label: "drills, median" }, { c: "var(--s1)", style: "dot", label: "live" }]));
  };
  drawSk();
  el.append(U.grid(card({ n: 10, code: "SKLL", title: "Skill against practice", span: 12, sub: "how much a learner's forecasts improve with sessions of practice",
    tools: [skChips], body: skBox,
    foot: "Prequential rank IC after k sessions for learners started cold on resampled histories. The live point is the champion source's IC at today's live length. More practice sharpens a learner only up to the skill the data holds." })));
};
