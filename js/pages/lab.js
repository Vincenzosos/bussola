"use strict";
/* Trading Lab · PAPER MONEY ONLY (LAB_SPEC §13).
   Pages.lab routes ten sub-pages at #/lab/<sub>. This file holds the shared helpers (LabUI), the page-level
   states (not started, building, rules changed, behind, demo) and four sub-pages: OVERVIEW, DESK, READY and JOURNAL.
   LEAGUE, LEARN and PRACTICE live in lab_analysis.js; COSTS, DATA and RULES in lab_ops.js. Each registers a
   view into window.LabViews. Every number comes from /api/lab/* (the engine's prepared files); the pages add
   arithmetic and words, never advice. The lab places no orders and has no link to Trade Republic. */

window.LabViews = window.LabViews || {};

const LabUI = (() => {
  const U = { charts: [], observers: [], timers: [], live: new Map() };

  /* ---------------------------------------------------------------- numbers, dates, words */
  const nf = (dp) => new Intl.NumberFormat(LOCALE, { minimumFractionDigits: dp, maximumFractionDigits: dp });
  U.NF = [fmt.n0, fmt.n1, fmt.n2, nf(3), nf(4)];
  U.PF = [fmt.p0, fmt.p1, fmt.p2];
  const ok = (x) => x != null && Number.isFinite(x);
  U.ok = ok;
  U.na = (why) => h("span", { class: "lab-na", "data-tip": why || "not available", tabindex: "0" }, "n/a");
  U.num = (x, dp = 2) => (ok(x) ? unsigned(x, U.NF[dp]) : "—");
  U.snum = (x, dp = 2) => (ok(x) ? signed(x, U.NF[dp]) : "—");                     // toned, signed
  U.int = (x) => (ok(x) ? unsigned(x, fmt.n0) : "—");
  U.eur = (x, dp = 2) => (ok(x) ? unsigned(x, dp ? fmt.eur : fmt.eur0) : "—");
  U.seur = (x, dp = 2) => (ok(x) ? signed(x, dp ? fmt.eur : fmt.eur0) : "—");
  U.pct = (x, dp = 1) => (ok(x) ? unsigned(x, U.PF[dp]) : "—");
  U.spct = (x, dp = 2, arrow = false) => (ok(x) ? signed(x, U.PF[dp], arrow) : "—");
  U.bps = (x, dp = 1) => (ok(x) ? `${unsigned(x, U.NF[dp])} bps` : "—");
  U.sbps = (x, dp = 1) => (ok(x) ? h("span", { class: tone(x) }, `${sign(x, U.NF[dp])} bps`) : "—");
  U.px = (x) => (ok(x) ? unsigned(x, Math.abs(x) < 10 ? U.NF[3] : U.NF[2]) : "—");   // a share price in €
  U.d = (s) => (s ? day(s) : "—");
  U.ds = (s) => (s ? dayShort(s) : "—");
  U.hm = (iso) => (iso && iso.length >= 16 ? iso.slice(11, 16) : "—");                  // Berlin wall clock as sent
  U.when = (iso) => (iso ? `${dayShort(iso)} ${U.hm(iso)}` : "—");
  U.sha8 = (s) => (s ? `#${String(s).slice(0, 8)}` : "—");
  U.plural = (n, one, many) => `${U.int(n)} ${n === 1 ? one : many || `${one}s`}`;
  U.cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");
  /* a label that explains itself: one plain sentence on hover or focus (dotted underline) */
  U.tl = (text, tip) => h("span", { class: "lab-tip", "data-tip": tip, tabindex: "0" }, text);
  /* Greek letters inside upper-case labels (CSS uppercase would turn μ into M and λ into Λ) */
  U.gk = (ch) => h("span", { class: "greek" }, ch);
  U.clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

  /* statuses are words (with a glyph from the badge CSS), never colour alone */
  U.status = (s) => { const m = { met: ["Met", "ok"], fails: ["Fails", "bad"], too_early: ["Too early", "na"] }[s] || [s || "n/a", "na"]; return badge(m[0], m[1]); };
  U.KIND = { eligible: ["Eligible", ""], main: ["Main book", "paper"], reference: ["Reference", "ref"], diagnostic: ["Diagnostic", "shadow"], probe: ["Probe", "shadow"] };
  U.kind = (k, champion) => (champion ? badge("Champion", "you") : badge(...(U.KIND[k] || [k || "—", ""])));
  U.mode = (m) => ({ live: badge("Live", "live"), catchup: badge("Catch-up", "warn"), history: badge("History", "ref"), prelive: badge("Before live start", "na") }[m] || badge(m || "—", "na"));
  /* registered wording keeps its reading-list references ("[d13]"): each becomes a link to the reading list, the text unchanged */
  U.cite = (text, evidence) => {
    const ev = Object.fromEntries((evidence || []).map((x) => [x.id, x]));
    return String(text || "").split(/(\[[a-z]\d+\])/).map((part) => {
      const m = /^\[([a-z]\d+)\]$/.exec(part);
      if (!m) return prose(part);
      const x = ev[m[1]];
      return h("a", { href: "#/lab/rules", class: "lab-cite", "data-tip": x ? `${m[1]}: ${x.title}` : `reading list entry ${m[1]}`,
        onclick: () => { if (typeof pendingPanel !== "undefined") pendingPanel = 9; } }, part);
    });
  };
  U.ftt = (g) => h("span", { class: `lab-ftt${g && g !== "FREE" ? " tax" : ""}`, "data-tip": g === "FREE" ? "No transaction tax on this name" : g ? `Transaction tax on paper purchases (${g})` : "" }, g || "—");
  U.check = (pass, text, muted) => h("span", { class: `lab-ck ${pass == null ? "na" : pass ? "ok" : "bad"}${muted ? " muted" : ""}` },
    h("b", { "aria-hidden": "true" }, pass == null ? "…" : pass ? "✓" : "✕"), h("span", { class: "sr-only" }, pass == null ? "not known: " : pass ? "passes: " : "does not pass: "), text);

  /* ---------------------------------------------------------------- data */
  U.get = (path, ms = 30_000) => cached(`lab:${path}`, () => api(path), ms);
  U.fresh = (path) => { invalidate(`lab:${path}`); return U.get(path); };
  U.dropCache = () => Object.keys(memo).filter((k) => k.startsWith("lab:")).forEach((k) => delete memo[k]);

  /* ---------------------------------------------------------------- page frame */
  /* in the order a visitor reads: what it is, today, the results, the tests, the method; then (under the hood) the detail.
     Route ids stay as they were (old links keep working); "|" is a thin separator (core.js subtabs). */
  U.SUBS = [["overview", "Overview"], ["desk", "Desk"], ["league", "League"], ["ready", "Scorecard"], ["rules", "Method"],
    ["|", "Under the hood"], ["journal", "Journal"], ["costs", "Costs"], ["learn", "Model"], ["practice", "Robustness"], ["data", "Data quality"]];
  U.subLabel = (sub) => (U.SUBS.find(([id]) => id === sub) || [null, "Trading Lab"])[1];
  U.LEDE = {
    overview: null,                                   // the Overview writes its own lede from the registered rules
    desk: "The main book on paper after the last session end, and what it will do at the next one. The main book follows one strategy, the champion, chosen by a rule fixed in advance.",
    league: "Every paper strategy, after costs and tax. Each row is one strategy trading its own €10,000; compare it with X1 (the Europe ETF held) and X4, X6, X7 (random picks at the same costs).",
    learn: "What the model has learned, measured only on forecasts it made before seeing the result.",
    practice: "How robust the results are: drills on resampled histories, placebos, higher costs and late fills.",
    ready: "Has the paper record passed the tests fixed in advance? Ten pass/fail tests written down before the first live session; most cannot be judged before a year of live data.",
    costs: "What fees, spreads and taxes do, and whether the paper trades could have been done by hand.",
    journal: "What happened, session by session, written from fixed templates.",
    data: "Is the data complete and sound?",
    rules: "Exactly how the lab works: the rules, the costs and the research it rests on, fixed at registration.",
  };
  U.BANNER = "Paper money only. No orders · no credentials · no Trade Republic access.";
  /* season 2: the clock of each family, the t hurdle printed without rounding up (3.205, never 3.21) */
  U.FAM = { daily: "Daily", weekly: "Weekly", monthly: "Long hold" };
  U.famWord = (f) => U.FAM[f] || (f ? U.cap(f) : "—");
  U.clockText = (f, nd) => (f === "weekly" ? `weekly decision on ${U.d((nd || {}).weekly_decision)}` : f === "monthly" ? `monthly decision on ${U.d((nd || {}).monthly_decision)}` : f === "daily" ? "decides after every session end" : "—");
  U.t3 = (x) => (ok(x) ? (Math.floor(x * 1000) / 1000).toFixed(3) : "—");
  U.BASIS = { pre: ["Before tax", "ref"], after: ["After tax", "paper"], both: ["Both lines", "warn"] };
  U.basis = (b) => (b ? badge(...(U.BASIS[b] || [b, "na"])) : null);
  /* the page head names the sub-page (h1 "League", "Scorecard"…; the Overview's h1 is "Trading Lab"). The public site
     carries the full disclaimer above every page, so it leaves the PAPER bar out; the app keeps it. */
  U.pub = !!window.BussolaStatic;
  /* who runs the lab, in a sentence: the app on the owner's Mac (the public site cannot run anything) */
  U.runs = (verb = "is open") => (U.pub ? `the owner's computer ${verb === "is open" ? "runs" : verb}` : `SV Terminal ${verb}`);
  U.head = (sub, ...actions) => [
    pageHead(sub === "overview" ? ["Trading Lab", "paper money only"] : [U.subLabel(sub), "Trading Lab · paper money"], U.LEDE[sub], ...actions),
    subtabs("lab", U.SUBS, sub), U.pub ? null : paperBanner(U.BANNER)].filter(Boolean);
  /* plain-English names for the books (the registered ids and names are hashed and never change: only their display) */
  U.NAME = {
    MAIN: "Main book", "MAIN-X": "Main book, filled by hand (shadow)", "MAIN-HIST": "Main book, history run", CASH: "Cash",
    R1: "5-day reversal, 1 name", R2: "5-day reversal, 2 names", R3: "5-day reversal, 2 names, stressed markets only", R4: "5-day reversal, 2 names, kept while in the top 10",
    L1: "Regression forecast, 60-session memory", L2: "Regression forecast, 250-session memory", L3: "Regression forecast, 1,000-session memory",
    L4: "Calibration-table forecast", L5: "Signal-ensemble forecast", L6: "Regression (250), kept while positive", L7: "Regression (250), all names, kept while positive",
    L8: "Regression (250), two fixed slots", M1: "Meta-learner forecast", M2: "Meta-learner, kept while positive", M3: "Meta-learner, twice the cost bar",
    W1: "Weekly 5-day reversal, 2 names", W2: "Weekly reversal against its sector, 2 names", W3: "Weekly regression forecast", W4: "Weekly regression, all names, kept while positive",
    H1: "12-month momentum, top 5", H2: "Near the 52-week high, top 5", H3: "200-day trend, top 5", H4: "12-month momentum, top 5, market filter", H5: "Three slow signals combined, top 5",
    X1: "Europe ETF held", X2: "Equal-weight market line", X3: "Cash", X4: "Random picks, 2 names (daily)", X5: "Textbook 5-day reversal, all names",
    X6: "Random picks, 5 names (monthly)", X7: "Random picks, 2 names (weekly)",
    DX1: "Same-session reversal (diagnostic)", DX2: "Same-session regression (diagnostic)",
    P1: "22:38 reversal (probe)", P2: "22:38 regression (probe)", P3: "Morning gap, same day (probe)", P4: "Yesterday's losers, same day (probe)", P5: "Late-day rise, Europe ETF (probe)",
  };
  U.nm = (id, fallback) => U.NAME[id] || fallback || id || "—";
  /* "200-day trend, top 5" with the registered id beside it in mono ("H3 · TREND200-ALL-5" on hover) */
  U.book = (id, name) => h("span", { class: "lab-book", "data-tip": name ? `${id} · ${name}` : null }, h("span", { class: "nm" }, U.nm(id, name)), " ", h("span", { class: "lab-bid" }, id));
  U.POLICY = { RULE_D1: "re-picks its names every session", RULE_BAND: "keeps a name while it stays in the rule's top 10, up to 10 sessions",
    D1B: "enters when the forecast beats the round-trip cost; sells what is not picked again", D1F: "a fixed number of names, each forecast above its cost",
    BANDL: "keeps a name while its forecast stays above zero, up to 10 sessions", RULE_W: "re-picks its names after the last session of each week",
    D1B_W: "weekly: enters when the 5-session forecast beats the cost", BANDL_W: "weekly: keeps a name while its forecast stays above zero, up to 4 weeks",
    BAND_M: "monthly: keeps a share while it ranks 15th or better; no exit date",
    BAND_M_POS: "monthly: keeps a share while it ranks 15th or better and stays above its 200-day average; no exit date",
    HOLD: "buys once and holds", INDEX: "a costless reference line", CASH: "holds cash" };
  U.policy = (p) => (p ? h("span", { "data-tip": `Policy ${p}` }, U.POLICY[p] || p) : "—");
  /* NEXT EVENTS (lab_api.next_events): Berlin times from the calendar, worded against the day of the viewer, so a
     published snapshot stays true ("Tonight" on the day, "Mon 28 Sep" before it) until the next step replaces it */
  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  U.wday = (s) => `${WD[new Date(`${s.slice(0, 10)}T12:00:00Z`).getUTCDay()]} ${dayShort(s)}`;
  const berlinDay = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  U.relWhen = (at, from = false) => {
    if (!at) return "—";
    const d = at.slice(0, 10), hm = at.slice(11, 16), eve = +at.slice(11, 13) >= 18, now = Date.now();
    const word = d === berlinDay(now) ? (eve ? "Tonight" : "Today") : d === berlinDay(now + 864e5) ? (eve ? "Tomorrow night" : "Tomorrow") : U.wday(d);
    return `${from ? `From ${word.replace(/^(Tonight|Today|Tomorrow)/, (w) => w.toLowerCase())}` : word} ≈${hm}`;
  };
  /* the same inside a sentence: "first decision tonight ≈23:13", "… Mon 28 Sep ≈23:00" */
  U.relIn = (at) => U.relWhen(at).replace(/^(Tonight|Today|Tomorrow)/, (w) => w.toLowerCase());
  U.EVT = { decide: "Decision", fill: "Paper fills", results: "Results", weekly: "Weekly", monthly: "Long hold" };
  U.nextStrip = (ne, opts = {}) => {
    const evs = ((ne || {}).events || []).slice(0, opts.max || 5);
    if (!evs.length) return null;
    const now = Date.now();
    return h("section", { class: "lab-strip lab-next", role: "status", "aria-label": "Next events" },
      h("div", { class: "lab-next-h" }, badge("Next events", "paper"), h("span", { class: "lab-next-n" }, ne.note || "")),
      h("ol", { class: "lab-ev" }, evs.map((e, i) => {
        const due = Date.parse(e.at) < now;
        return h("li", { class: `ev ev-${e.kind}${i === 0 ? " first" : ""}` },
          h("span", { class: "k" }, U.EVT[e.kind] || e.kind),
          h("b", { class: "when" }, U.relWhen(e.at, e.kind === "results"), due ? h("span", { class: "due" }, " · due") : null),
          h("span", { class: "what" }, U.cap(e.text)));
      })));
  };
  /* the strips above the KPI strip: demo data, behind, stale prices */
  U.strips = (sum, job, sub) => {
    const out = [];
    if (!sum) return out;
    if (sum.demo) out.push(h("div", { class: "lab-strip demo", role: "note" }, badge("Demo", "mock"), h("span", {}, sum.demo_note || "Synthetic data for building the page.")));
    const data = sum.data || {};
    const run = job && job.running;
    if (run && /CATCH/i.test(run.kind || "") && ok(run.total)) {
      out.push(h("div", { class: "lab-strip warn", role: "status" }, badge("Behind", "warn"), h("span", {}, `Catching up ${U.int(run.done || 0)} of ${U.int(run.total)} sessions.`)));
    } else if (sum.state === "behind" || data.behind > 0) {
      const n = data.behind > 0 ? `Behind by ${U.plural(data.behind, "session")}` : "Behind";
      out.push(h("div", { class: "lab-strip warn", role: "status" }, badge("Behind", "warn"),
        h("span", {}, `${n}: waiting for prices. The panels show the last committed session (${U.d(sum.as_of_session)}).`)));
    }
    if (data.stale_since) out.push(h("div", { class: "lab-strip warn", role: "status" }, badge("Stale", "warn"), h("span", {}, `Prices have been stale since ${U.d(data.stale_since)}.`)));
    const ne = sum.next_events;
    /* before the first live session: the Desk lists what happens and when; the other pages say it in one line */
    const firstDecide = ne && ne.first_live ? (ne.events || []).find((e) => e.kind === "decide") : null;
    if (ne && ne.first_live && sub && sub !== "desk") out.push(h("div", { class: "lab-strip", role: "note" }, badge("Starting", "paper"),
      h("span", {}, `The first live session ends ${firstDecide ? U.relIn(firstDecide.at) : U.d(sum.live_start)}; until then these pages show the registered rules and the history (in-sample). What happens next, and when: `, link("Desk", "#/lab/desk"), ".")));
    else if (ne && ne.first_live) out.push(U.nextStrip(ne));
    else if (sum.state === "history_only") out.push(h("div", { class: "lab-strip", role: "note" }, badge("History only", "na"),
      h("span", {}, `Registered ${U.d((sum.registered_at || "").slice(0, 10))}. No live session has settled yet: live figures start after the first session end (${U.d(sum.live_start)}).`)));
    /* one row of notices: the state strips and the page's own caveat (U.caveat) sit side by side, not stacked */
    return out.length ? [h("div", { class: "lab-strips" }, out)] : [];
  };
  /* a page caveat ("Read first", "Proxy"…) joins the row of state strips under the page head, or starts one */
  U.caveat = (el, node) => {
    const row = el.querySelector(":scope > .lab-strips");
    if (row) row.append(node); else el.append(h("div", { class: "lab-strips" }, node));
  };
  /* the KPI strip: exactly six cells, the first is the hero; demo data wears a DEMO badge on the strip */
  U.kpis = (sum, cells) => {
    if (sum && sum.demo && cells[0]) cells[0] = { ...cells[0], label: [cells[0].label, badge("Demo", "mock")] };
    return kpiStrip(cells);
  };
  U.loading = () => h("div", { class: "lab-loading" }, skeleton(96), h("div", { class: "grid" }, h("div", { class: "span-8" }, skeleton(260)), h("div", { class: "span-4" }, skeleton(260))));
  U.grid = (...cards) => h("div", { class: "grid" }, cards);
  U.pad = (...kids) => h("div", { class: "lab-pad" }, kids);
  /* replaceChildren without the "null" text a missing optional part would leave */
  U.fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((x) => x != null && x !== false));
  U.note = (...kids) => h("p", { class: "note" }, kids);
  U.errorCard = (msg) => U.grid(card({ n: 1, code: "ERR", title: "This part could not load", span: 12, body: empty(msg) }));
  U.foot = (...parts) => parts.flat().filter(Boolean).map((p, i) => (i ? [" · ", p] : p));
  U.src = (sum, extra) => statusSource(`Trading Lab${sum && sum.season ? ` ${sum.season}` : ""}${sum && sum.as_of_session ? ` · session ${day(sum.as_of_session)}` : ""}${extra ? ` · ${extra}` : ""} · paper only`);

  /* a long list shows its first 5 on a phone (then "Show all"), its usual first n on a wider screen */
  U.phoneN = (n) => (window.innerWidth < 760 ? Math.min(5, n) : n);
  /* "Show all": the first n, then a button (panels never scroll inside) */
  U.showAll = (items, n, draw, noun = "rows") => {
    const box = h("div", { class: "lab-more" });
    if (items.length <= n) { box.append(draw(items)); return [box]; }
    let all = false;
    const btn = h("button", { class: "btn sm ghost", type: "button" });
    const paint = () => { box.replaceChildren(draw(all ? items : items.slice(0, n))); btn.textContent = all ? `Show the first ${n}` : `Show all ${items.length} ${noun}`; };
    btn.addEventListener("click", () => { all = !all; paint(); });
    paint();
    return [box, h("div", { class: "lab-more-b" }, btn)];
  };

  /* ---------------------------------------------------------------- charts (Lightweight Charts, tokens only) */
  U.lwc = (el, opts) => { const c = makeChart(el, opts); if (c) U.charts.push(c); return c; };
  U.KEY = { you: ["var(--s1)", "line"], youdash: ["var(--s1)", "dash"], area: ["var(--s1)", "area"], pick: ["var(--s2)", "line"], b1: ["var(--bench-1)", "dash"], b2: ["var(--bench-2)", "dot"],
    b3: ["var(--bench-3)", "dash"], grey: ["var(--bench-3)", "line"], faint: ["var(--line-3)", "line"], s2: ["var(--s2)", "line"], s3: ["var(--s3)", "line"], s4: ["var(--s4)", "line"], s5: ["var(--s5)", "line"] };
  U.lineOpts = (k) => {
    if (k === "you") return SERIES.youLine();
    /* the same book before tax: the bright hue, dashed and thinner (season 2) */
    if (k === "youdash") return { color: css("--s1"), lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
    if (k === "pick") return SERIES.pick();
    if (k === "b1" || k === "b2" || k === "b3") return SERIES.bench(+k[1]);
    if (k === "grey") return { color: css("--bench-3"), lineWidth: 1, lineStyle: 0, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
    /* the crowd behind a comparison: 1 px at about 30% so the named lines (benchmarks, the main book) stand out */
    if (k === "faint") return { color: rgba(css("--bench-3"), 0.3), lineWidth: 1, lineStyle: 0, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
    return { color: css(`--${k}`), lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerRadius: 3, crosshairMarkerBorderColor: css("--card") };
  };
  /* points [[date, value]] → ascending, unique, finite (Lightweight Charts refuses anything else) */
  U.pts = (arr, scale = 1) => {
    const m = new Map();
    (arr || []).forEach((p) => { if (p && p[0] && ok(p[1])) m.set(p[0], p[1] * scale); });
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([time, value]) => ({ time, value }));
  };
  /* specs: [{label, points, style, fmt, tip}] drawn greys first, then benchmarks, then the picked line, then you */
  U.lines = (box, specs, { euro = false, pct = false, digits = 2, fmtv } = {}) => {
    const chart = U.lwc(box, { euro, pct, digits });
    if (!chart) return null;
    const rank = (s) => (s === "grey" || s === "faint" ? 0 : s[0] === "b" ? 1 : s === "pick" || /^s\d$/.test(s) ? 2 : 3);
    const made = specs.filter((s) => s.points && s.points.length).sort((a, b) => rank(a.style) - rank(b.style)).map((s) => {
      const series = s.style === "area" ? chart.addAreaSeries(SERIES.you()) : chart.addLineSeries({ ...U.lineOpts(s.style), ...(s.opts || {}) });
      series.setData(U.pts(s.points, s.scale || 1));
      return { ...s, series };
    });
    chart.timeScale().fitContent();
    crosshairTip(chart, box, made.filter((m) => m.style !== "grey" && m.style !== "faint" && m.tip !== false).reverse()
      .map((m) => ({ series: m.series, label: m.label, c: (U.KEY[m.style] || U.KEY.grey)[0], fmt: m.fmt || fmtv || ((v) => U.num(v)) })));
    return { chart, made };
  };
  U.legend = (specs) => legend(specs.map((s) => ({ c: (U.KEY[s.style] || U.KEY.grey)[0], style: (U.KEY[s.style] || U.KEY.grey)[1], label: s.label, value: s.value })));
  /* shade the live span of a time chart (an overlay placed from the time scale) */
  U.shadeFrom = (res, box, date, label = "Live") => {
    if (!res || !date) return;
    const all = res.made.flatMap((m) => U.pts(m.points).map((p) => p.time)).sort();
    const at = all.find((t) => t >= date);
    if (!at) return;
    const sh = h("div", { class: "lab-shade", "aria-hidden": "true" }, h("span", {}, label));
    box.append(sh);
    const ts = res.chart.timeScale();
    const place = () => { const x = ts.timeToCoordinate(at); if (x == null) { sh.hidden = true; return; } sh.hidden = false; sh.style.left = `${Math.round(x)}px`; sh.style.width = `${Math.max(0, ts.width() - x)}px`; };
    ts.subscribeVisibleLogicalRangeChange(place);
    ts.subscribeSizeChange(place);
    setTimeout(place, 30);
  };

  /* ---------------------------------------------------------------- SVG charts drawn at their real pixel width */
  /* hgt: a number (fixed px), "auto" (the drawing sets its own height) or null (fills the box CSS sizes: .lab-fill) */
  U.svgBox = (hgt, draw, cls = "") => {
    const fixed = typeof hgt === "number", auto = hgt === "auto";
    const box = h("div", { class: `lab-svg ${cls}`.trim(), style: fixed ? `height:${hgt}px` : null });
    let w0 = 0, h0 = 0;
    const paint = () => {
      const w = Math.floor(box.clientWidth), hh = fixed ? hgt : auto ? 1 : Math.floor(box.clientHeight);
      if (!w || !hh || (w === w0 && hh === h0)) return;
      w0 = w; h0 = hh;
      try { box.replaceChildren(draw(w, hh)); } catch (e) { console.error(e); box.replaceChildren(h("p", { class: "note" }, "Chart unavailable.")); }
    };
    if (window.ResizeObserver) { const ro = new ResizeObserver(paint); ro.observe(box); U.observers.push(ro); }
    setTimeout(paint, 0);
    return box;
  };
  U.lin = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / ((d1 - d0) || 1)) * (r1 - r0);
  U.ticks = (lo, hi, n = 5) => {
    const span = hi - lo || 1, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || mag * 10;
    const out = [];
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(Math.abs(v) < step / 1e6 ? 0 : +v.toPrecision(10));
    return out;
  };
  U.svg = (w, hh, label, ...kids) => h("svg", { viewBox: `0 0 ${w} ${hh}`, width: w, height: hh, role: "img", "aria-label": label }, kids);
  U.t = (x, y, text, attrs = {}) => h("text", { x, y, ...attrs }, text);
  /* one row per item on a shared horizontal scale: band (shaded), whisker, box, mid tick, dot, grey marks */
  U.rowPlot = ({ rows, lo, hi, band, fmtx = (v) => U.num(v), label, axis, rowH = 22, labelW = 58, valW = 92 }) => U.svgBox(rows.length * rowH + 30 + (axis ? 14 : 0), (w, H0) => {
    const H = H0 - (axis ? 14 : 0);
    const x = U.lin(lo, hi, labelW + 6, w - valW - 6), top = 4, y = (i) => top + i * rowH + rowH / 2;
    const tk = U.ticks(lo, hi, w < 480 ? 4 : 6);
    const g = [];
    if (band) g.push(h("rect", { x: x(band[0]), y: top, width: Math.max(1, x(band[1]) - x(band[0])), height: rows.length * rowH, class: "band", "data-tip": band[2] || "" }));
    tk.forEach((v) => g.push(h("line", { x1: x(v), x2: x(v), y1: top, y2: top + rows.length * rowH, class: v === 0 ? "zero" : "grid" }), U.t(x(v), H - 6, fmtx(v), { class: "ax", "text-anchor": "middle" })));
    rows.forEach((r, i) => {
      const cy = y(i);
      g.push(h("g", { class: `row ${r.cls || ""}`, "data-tip": r.tip || null },
        h("rect", { x: 0, y: cy - rowH / 2, width: w, height: rowH, class: "hit" }),
        U.t(0, cy + 4, r.label, { class: "lbl" }),
        r.grey ? h("line", { x1: x(r.grey[0]), x2: x(r.grey[1]), y1: cy + 5, y2: cy + 5, class: "greyl" }) : null,
        r.greyDot != null ? h("circle", { cx: x(r.greyDot), cy: cy + 5, r: 2.6, class: "greyd" }) : null,
        r.whisker ? h("line", { x1: x(r.whisker[0]), x2: x(r.whisker[1]), y1: cy, y2: cy, class: "wh" }) : null,
        r.box ? h("rect", { x: x(r.box[0]), y: cy - 5, width: Math.max(2, x(r.box[1]) - x(r.box[0])), height: 10, class: "bx" }) : null,
        r.mid != null ? h("line", { x1: x(r.mid), x2: x(r.mid), y1: cy - 7, y2: cy + 7, class: "md" }) : null,
        r.dot != null ? h("circle", { cx: x(U.clamp(r.dot, lo, hi)), cy, r: 4.2, class: "dot" }) : null,
        U.t(w, cy + 4, r.value || "", { class: "val", "text-anchor": "end" })));
    });
    if (axis) g.push(U.t((labelW + 6 + w - valW - 6) / 2, H0 - 3, axis, { class: "ax axcap", "text-anchor": "middle" }));
    return U.svg(w, H0, label, g);
  }, "lab-rows");

  /* diverging rows: label · bar around zero · value (feature contributions, coefficients, differences) */
  U.divRows = (items, { max, fmtv = (v) => `${sign(v, U.NF[1])}`, unit = "" } = {}) => {
    const m = max || Math.max(1e-9, ...items.map((x) => Math.abs(x.v || 0)));
    return h("div", { class: "lab-div" }, items.map((x) => h("div", { class: `r ${x.cls || ""}`, "data-tip": x.tip || null },
      h("span", { class: "n", title: x.label }, x.label), dbar(x.v || 0, m), h("span", { class: `v ${tone(x.v)}` }, ok(x.v) ? `${fmtv(x.v)}${unit}` : "—"))));
  };

  /* ---------------------------------------------------------------- live marks on the desk (paper book names only) */
  U.onQuote = (key, q) => {
    const cell = U.live.get(key);
    if (!cell || !ok(q.mid)) return;
    setText(cell.mark, U.px(q.mid), Math.sign(q.mid - (cell.last || q.mid)));
    cell.last = q.mid;
    cell.tag.hidden = false;
    const pnl = (q.mid - cell.p.entry_fill) * cell.p.shares;
    cell.pnl.replaceChildren(signed(pnl, fmt.n2));
  };

  U.cleanup = () => {
    U.charts.forEach(dropChart); U.charts = [];
    U.observers.forEach((o) => o.disconnect()); U.observers = [];
    U.timers.forEach((t) => clearInterval(t)); U.timers = [];
    U.live.clear();
    hideTip();
  };
  return U;
})();

/* ================================================================ page-level states: not started, building, rules changed */
const LAB_STEPS = [
  "Check that nothing still imports the retired model desk",
  "Archive the model desk's state (kept, never deleted)",
  "Check the verified inputs: dividends and the L&S calendar",
  "Write the trial ledger: every configuration tried so far",
  "Build the closes store: fresh cache first, else up to 111 requests, 1.5 s apart",
  "Register season S1: rules and scorecard fixed before any live result",
  "Walk forward from 2009 and evaluate every book",
  "Queue the practice drills",
  "Go live from the first session end after registration",
];
function labGate(el, sub, sum) {
  const U = LabUI;
  if (sum.state === "migrating") { labSeason2Gate(el, sub, sum); return; }
  const m = sum.migration || { steps: 9, step: 0, status: "waiting" };
  const building = sum.state === "building" || m.running;
  const steps = m.steps || 9, step = m.step || 0;
  const stopped = (st) => st === "failed" || st === "interrupted";
  const meter = h("div", { class: "lab-setup" });
  const paintMeter = (mm, job) => {
    const run = job && job.running;
    const count = run && ok(run.total) ? (run.step === "downloads" ? ` · price history ${U.int(run.done)} of ${U.int(run.total)}` : ` · session ${U.int(run.done)} of ${U.int(run.total)}`) : "";
    const now = mm.status === "interrupted" ? `Stopped at step ${mm.step}: ${mm.label || ""}.` : mm.label ? `Now: ${mm.label}${count}.` : "Registration starts by itself on the first start after the build, outside 22:30–23:30 Berlin.";
    U.fill(meter,
      h("div", { class: "section-l" }, mm.step ? `Setting up: step ${mm.step} of ${mm.steps || 9}` : "Not started"),
      progress(mm.step ? mm.step / (mm.steps || 9) : 0, { kind: mm.status === "failed" ? "bad" : mm.status === "interrupted" ? "warn" : "" }),
      h("p", { class: "note" }, now),
      building && !stopped(mm.status) ? h("p", { class: "note" }, h("b", {}, "Keep SV Terminal open until this finishes. "), "If it is closed now, the set-up starts again at the next start.") : null,
      mm.error ? h("p", { class: "callout lab-err" }, h("b", {}, mm.status === "interrupted" ? "The last attempt was cut short: " : "The last attempt stopped: "), prose(mm.error)) : null);
  };
  const ok = (x) => x != null && Number.isFinite(x);
  paintMeter(m, null);
  const startBtn = sum.start_allowed ? h("button", { class: "btn primary", type: "button", onclick: async (e) => {
    const b = e.currentTarget;
    b.disabled = true; b.textContent = "Starting…";
    try { await post("/api/lab/start", { confirm: true }); U.dropCache(); toast("LAB", "Set-up started: about 3 minutes of downloads, then about a minute of replay."); Router.render(); }
    catch (x) { toast("LAB", x.message); b.disabled = false; b.textContent = "Start the lab"; }
  } }, "Start the lab") : null;
  el.append(...U.head(sub));
  if (sum.demo) el.append(...U.strips(sum));
  el.append(U.grid(
    card({ n: 0, code: "START", title: building ? "The lab is setting up" : "Start the lab", span: 7, badges: [badge("Paper", "paper")],
      body: [h("p", { class: "lede" }, "Starting the lab downloads up to 111 price histories from Lang & Schwarz (about 3 minutes, one request every 1.5 s), fixes the rules and the scorecard before any live result, trains the learners on 2009–2015, replays 2016 to today once (about a minute) and then trades on paper from the next session end."),
        meter,
        startBtn ? h("div", { class: "actions" }, startBtn, h("span", { class: "note" }, m.status === "interrupted"
          ? "SV Terminal was closed before the set-up finished. This starts it again (it also restarts by itself at the next start); the registration time stays the same."
          : "The first attempt did not finish. This retries it; finished downloads are reused and the registration time stays the same.")) : null,
        h("dl", { class: "kv" }, h("div", {}, h("dt", {}, "Requests to L&S"), h("dd", {}, "≤ 111, 1.5 s apart")), h("div", {}, h("dt", {}, "Real orders"), h("dd", {}, "none, ever")),
          h("div", {}, h("dt", {}, "Starting book"), h("dd", {}, "€10,000 of paper")), h("div", {}, h("dt", {}, "Runs"), h("dd", {}, "only while SV Terminal is open"))),
        h("div", { class: "section-l" }, "What each page shows once the lab runs"),
        h("dl", { class: "kv lab-pages" },
          h("dt", {}, link("Desk", "#/lab/desk")), h("dd", {}, "the main book on paper and its orders for the next session end"),
          h("dt", {}, link("Scorecard", "#/lab/ready")), h("dd", {}, "the ten criteria fixed before any live result"),
          h("dt", {}, link("League", "#/lab/league")), h("dd", {}, "every paper strategy after costs, live and in history"),
          h("dt", {}, link("Method", "#/lab/rules")), h("dd", {}, "the full protocol: readable now, before the start"))],
      foot: "Nothing here trades real money; the lab has no link to Trade Republic and asks for no credentials." }),
    card({ n: 1, code: "STEP", title: "What the start does, in order", span: 5,
      body: h("ol", { class: "lab-steps" }, LAB_STEPS.map((t, i) => {
        const k = i + 1, st = k < step || (k === step && m.status === "done") ? "done" : k === step ? (stopped(m.status) ? "failed" : "now") : "wait";
        return h("li", { class: st }, h("span", { class: "ix" }, k), h("span", { class: "t" }, t),
          st === "done" ? badge("Done", "ok") : st === "now" ? badge("Running", "warn") : st === "failed" ? badge("Stopped", "bad") : badge("Waiting", "na"));
      })),
      foot: ["Steps are recorded as they finish. A retry repeats only quick checks, reuses the downloads and keeps the registration time. ", link("Method › trial ledger", "#/lab/rules"), " lists every trial counted."] })));
  if (building) {
    U.timers.push(setInterval(async () => {
      if (Router.current !== "lab") return;
      try {
        const [s, job] = await Promise.all([api("/api/lab/summary"), api("/api/lab/job").catch(() => null)]);
        if (s.state !== "building" && s.state !== "not_started") { U.dropCache(); Router.render(); return; }
        paintMeter(s.migration || m, job);
      } catch (_) { /* server restarting */ }
    }, 5000));
  }
  U.src(null, building ? "setting up" : "not started");
}
/* season 2 is being set up on a lab registered for season 1 (SEASON2_SPEC §5.4): nothing is processed meanwhile */
function labSeason2Gate(el, sub, sum) {
  const U = LabUI;
  const m = sum.migration || { steps: 9, step: 0, status: "waiting", step_labels: [] };
  const labels = m.step_labels || [];
  const done = new Set(m.done || []);
  const stopped = ["failed", "interrupted", "engine_drift"].includes(m.status);
  const startBtn = sum.start_allowed ? h("button", { class: "btn primary", type: "button", onclick: async (e) => {
    const b = e.currentTarget;
    b.disabled = true; b.textContent = "Starting…";
    try { await post("/api/lab/start", { confirm: true, season: "S2" }); U.dropCache(); toast("LAB", "Season 2 set-up started: about two minutes."); Router.render(); }
    catch (x) { toast("LAB", x.message); b.disabled = false; b.textContent = "Set up season 2"; }
  } }, m.status === "waiting" ? "Set up season 2" : "Retry the set-up") : null;
  el.append(...U.head(sub));
  if (sum.demo) el.append(...U.strips(sum));
  el.append(U.grid(
    card({ n: 0, code: "S2", title: `Setting up season 2: step ${m.step || 0} of ${m.steps || 9}`, span: 7, badges: [badge("Paper", "paper"), stopped ? badge("Stopped", "bad") : badge("Season 2", "warn")],
      body: [h("p", { class: "lede" }, prose(sum.reason || "")),
        progress((m.step || 0) / (m.steps || 9), { kind: stopped ? "bad" : "" }),
        m.label ? h("p", { class: "note" }, `${stopped ? "Stopped at" : "Now"}: ${m.label}.`) : h("p", { class: "note" }, "The set-up starts by itself on the next scheduler tick, outside 22:30–23:30 Berlin."),
        m.error ? h("p", { class: "callout lab-err" }, h("b", {}, m.status === "engine_drift" ? "The reproduction check failed: " : "The last attempt stopped: "), prose(m.error)) : null,
        startBtn ? h("div", { class: "actions" }, startBtn) : null,
        h("dl", { class: "kv" }, h("div", {}, h("dt", {}, "Season 1"), h("dd", {}, "archived; its live record is closed and kept")),
          h("div", {}, h("dt", {}, "Every book"), h("dd", {}, "restarts at €10,000 of paper")),
          h("div", {}, h("dt", {}, "New"), h("dd", {}, "weekly and long-hold strategies, the Italian tax ledger")),
          h("div", {}, h("dt", {}, "Real orders"), h("dd", {}, "none, ever"))),
        h("div", { class: "section-l" }, "What season 2 changes"),
        h("ul", { class: "lab-list" }, [
          "Daily: the 15 season-1 strategies, their rules unchanged.",
          "Weekly: 4 strategies that decide after the last session of each week and hold in between.",
          "Long hold: 5 strategies that decide on the first session of each month and keep a share while it still ranks well, with no exit date.",
          "Tax: 26% of each realised gain is withheld at the paper sale; a loss becomes a credit for the same year and the next four; every book shows a pre-tax and an after-tax line.",
          "The champion is chosen on after-tax results and must also beat random picks made on its own clock.",
          "Trials counted rise from 27 to 53, and the live significance hurdle from t 3.000 to 3.205."].map((t) => h("li", {}, t)))],
      foot: "While the set-up runs the lab processes no session; sessions that end meanwhile are replayed afterwards." }),
    card({ n: 1, code: "STEP", title: "What the set-up does, in order", span: 5,
      body: h("ol", { class: "lab-steps" }, labels.map((t, i) => {
        const k = i + 1, st = done.has(k) ? "done" : k === m.step ? (stopped ? "failed" : "now") : "wait";
        return h("li", { class: st }, h("span", { class: "ix" }, k), h("span", { class: "t" }, t),
          st === "done" ? badge("Done", "ok") : st === "now" ? badge("Running", "warn") : st === "failed" ? badge("Stopped", "bad") : badge("Waiting", "na"));
      })),
      foot: "Every step is recorded with its fingerprints in migration_s2.json; a retry resumes from the step that stopped." })));
  if (m.running || m.status === "running") U.timers.push(setInterval(async () => {
    if (Router.current !== "lab") return;
    try { const s = await api("/api/lab/summary"); if (s.state !== "migrating") { U.dropCache(); Router.render(); } } catch (_) { /* restarting */ }
  }, 5000));
  U.src(null, "season 2 set-up");
}
function labMismatch(el, sub, sum) {
  const U = LabUI;
  el.append(...U.head(sub), ...U.strips(sum), U.grid(card({ n: 0, code: "HASH", title: "The lab's rules changed", span: 12, badges: [badge("Stopped", "bad")],
    body: [h("p", { class: "lede" }, "The lab's rules changed in the code without a new season. Nothing is processed until that is fixed."),
      h("dl", { class: "kv" }, h("div", {}, h("dt", {}, "Season"), h("dd", {}, sum.season || "—")), h("div", {}, h("dt", {}, "Last committed session"), h("dd", {}, U.d(sum.as_of_session))),
        h("div", {}, h("dt", {}, "Registered"), h("dd", {}, U.d((sum.registered_at || "").slice(0, 10))))),
      h("p", { class: "note" }, "Committed sessions are never recomputed. A deliberate change is a new season with its own ledger line; the registered rules are on ", link("Method", "#/lab/rules"), ".")] })));
  U.src(sum, "rules changed");
}

/* ================================================================ Pages.lab */
Pages.lab = {
  title: "Trading Lab",
  async render(el, sub, params) {
    const U = LabUI;
    U.cleanup();
    if (sub === "|" || !U.SUBS.some(([id]) => id === sub)) sub = "overview";
    const t = guard("lab-page"), hash = location.hash;
    const alive = () => t() && Router.current === "lab" && location.hash === hash;
    const wait = U.loading();
    el.append(wait);
    let sum;
    try { sum = await U.get("/api/lab/summary", 20_000); }
    catch (e) { if (!alive()) return; wait.remove(); el.append(...U.head(sub), U.errorCard(`The lab's summary could not load: ${e.message}`)); return; }
    if (!alive()) return;
    wait.remove();
    const view = window.LabViews[sub];
    const gated = sum.state === "not_started" || sum.state === "building" || sum.state === "migrating";
    if (gated && sub !== "rules") { labGate(el, sub, sum); return; }
    if (sum.state === "protocol_mismatch" && sub !== "rules") { labMismatch(el, sub, sum); return; }
    let job = null;
    if (sum.state === "behind") job = await api("/api/lab/job").catch(() => null);
    if (!alive()) return;
    const ctx = { sum, sub, params, alive, job, head: (...actions) => [...U.head(sub, ...actions), ...U.strips(sum, job, sub)] };
    const w2 = h("div", { class: "lab-loading" }, skeleton(96));
    try {
      await view(el, ctx, w2);
    } catch (e) {
      console.error(e);
      if (!alive()) return;
      w2.remove();
      el.append(U.errorCard(`This page could not be drawn: ${e.message}`));
    }
    if (alive()) U.src(sum, sub === "desk" ? "L&S session-end mids" : null);
  },
  onQuote(key, q) { LabUI.onQuote(key, q); },
  leave() { LabUI.cleanup(); },
};
/* the retired model desk's route, for one release: old links land on the lab */
Pages.model = {
  title: "Trading Lab",
  render() {
    const sub = Router.parse().sub;
    const map = { variants: "league", learning: "learn", journal: "journal", reading: "rules" };
    location.replace(`#/lab/${map[sub] || "desk"}`);
  },
};

/* ================================================================ OVERVIEW
   The front page of the public site: what the lab is, in one screen. Registered facts, the live record only (no history
   figure in the tiles), and no named stock or paper order on this page (lab_protocol NOT_BUILT). */
LabViews.overview = async (el, ctx, wait) => {
  const U = LabUI, { sum } = ctx;
  el.append(wait);
  const n = sum.live_sessions || 0;
  const [rules, ready, bk] = await Promise.all([U.get("/api/lab/rules", 600_000).catch(() => null), U.get("/api/lab/ready").catch(() => null),
    n >= 2 ? U.get("/api/lab/book?id=MAIN&window=live").catch(() => null) : null]);
  if (!ctx.alive()) return;
  wait.remove();
  const league = ((rules || {}).league || []).filter((r) => r.kind === "eligible");
  const fams = ["daily", "weekly", "monthly"].map((f) => [f, league.filter((r) => r.family === f).length]).filter(([, k]) => k);
  const names = Math.max(0, ...league.map((r) => +((/all (\d+) names/.exec(r.text || "") || [])[1] || 0)));
  const reg = ((rules || {}).registered_at || sum.registered_at || "").slice(0, 10);
  const fee = (((rules || {}).costs || {}).fee_eur);
  const rate = ((((rules || {}).tax || {}).params || {}).rate);
  U.LEDE.overview = `A public paper-money experiment. ${league.length ? `${league.length} trading strategies, ` : "Trading strategies "}fixed in advance${reg ? ` on ${U.d(reg)}` : ""}, `
    + `each trade €10,000 of pretend money in ${names ? `${names} ` : ""}large European shares (DAX 40, FTSE MIB, EURO STOXX 50) at real Lang & Schwarz prices, `
    + `paying what a retail investor pays: ${ok2(fee) ? `€${U.num(fee, 0)}` : "a fee"} per order, the spread, transaction taxes and ${ok2(rate) ? U.pct(rate, 0) : "the"} Italian tax on gains. `
    + "A main book follows the best strategy under a rule set in advance. Nothing here is a real trade or advice.";
  /* the status line below says where the live record stands: the next-events and history-only strips are left out here */
  el.append(...U.head("overview"), ...U.strips({ ...sum, next_events: null, state: sum.state === "history_only" ? "live" : sum.state }, ctx.job));

  /* the status line: where the live record stands, and when a verdict becomes possible */
  const crit = (ready || {}).criteria || [];
  const nSt = (st) => crit.filter((c) => c.status === st).length;
  const verdictOn = ((ready || {}).time_to_evidence || {}).earliest_a1 || (crit.find((c) => c.id === "A1") || {}).earliest;
  const ne = sum.next_events || {};
  const firstEv = (ne.events || []).find((e) => e.kind === "decide");
  const fillEv = (ne.events || []).find((e) => e.kind === "fill");
  const updated = U.pub && window.BussolaStatic.when ? `updated ${window.BussolaStatic.when()}` : `last session ${U.d(sum.as_of_session)}`;
  el.append(h("div", { class: "lab-status", role: "status" },
    badge(n ? "Live" : "Starting", n ? "live" : "paper"),
    h("span", {}, h("b", {}, `Live record: ${U.int(n)} of 250 sessions`), n ? "" : firstEv ? ` · first decision ${U.relIn(firstEv.at)}` : ""),
    reg ? h("span", {}, `registered ${U.d(reg)}`) : null,
    verdictOn ? h("span", {}, `first verdict possible ${U.d(verdictOn)}`) : null,
    h("span", { class: "dim" }, updated)));

  /* four tiles: the main book (the one hero), the Europe ETF over the same live period, the scorecard in words, the league */
  const sm = sum.main || {}, at = sm.after_tax || {};
  const champ = sum.champion || {};
  const pre = n === 0;
  const status = !crit.length ? "—" : nSt("too_early") ? "Too early" : nSt("fails") ? "Not passed" : "All met";
  el.append(h("section", { class: "stats kpis kpis-4", "aria-label": "Key numbers" },
    stat("Main book · after tax", eurFig(at.equity ?? 10000),
      pre ? h("span", { class: "muted" }, `€10,000 of paper cash until its first fill${fillEv ? ` (${U.wday(fillEv.session)})` : ""}`)
        : [delta(null, at.ret_since_live), h("span", { class: "muted" }, ` since ${U.d(sum.live_start)} · live, out of sample`)], "", "hero"),
    stat("Europe ETF held (X1) · after tax", pre || !ok2(sm.etf_since_live) ? eurFig(10000) : signed(sm.etf_since_live, fmt.p2, true),
      h("span", { class: "muted" }, pre || !ok2(sm.etf_since_live) ? "the benchmark: €10,000 of paper, bought at the first fill and held" : "the benchmark, same live period"), "", "major"),
    stat("Scorecard", status, h("span", { class: "muted" }, crit.length ? `${U.int(nSt("met"))} met · ${U.int(nSt("fails"))} fail · ${U.int(nSt("too_early"))} too early` : "ten tests fixed in advance"), "", "major"),
    stat("Strategies", U.int(league.length || null),
      [h("span", { class: "muted" }, fams.map(([f, k]) => `${k} ${U.famWord(f).toLowerCase()}`).join(" · ")),
        champ.id ? h("span", { class: "lab-champ" }, `champion ${champ.id}: ${U.nm(champ.id).toLowerCase()}`) : null])));

  /* the expectation registered with the scorecard, verbatim, and how to read the rest of the site */
  const W = (ready || {}).wording || ((rules || {}).scorecard || {}).wording || {};
  const cs = (rules || {}).costs || {};
  const costLine = [ok2(cs.fee_eur) ? `€${U.num(cs.fee_eur, 0)} an order` : null, ok2(cs.half_spread_bps) ? `${U.pct(cs.half_spread_bps / 1e4, 2)} half-spread each way` : null,
    Object.keys(cs.ftt || {}).length ? `transaction tax ${Object.entries(cs.ftt).map(([g, r]) => `${g} ${U.pct(r, 1)}`).join(", ")}` : null,
    ok2(rate) ? `${U.pct(rate, 0)} tax on gains` : null].filter(Boolean).join(" · ") || "as registered (Method)";
  const READ = [
    ["desk", "Desk", "today's paper book of the main strategy and what it will do at the next session end"],
    ["league", "League", "every strategy after costs and tax, next to the Europe ETF and random picks"],
    ["ready", "Scorecard", "ten pass/fail tests fixed before any live result"],
    ["rules", "Method", "the rules, the costs and the research, as registered"]];
  el.append(U.grid(
    card({ n: 1, code: "EXPT", title: "What the lab expects, as registered", span: 7, badges: [badge("Registered wording", "ref")],
      body: [W.expectation ? h("blockquote", { class: "lab-quote" }, U.cite(W.expectation, (rules || {}).evidence)) : empty("The registered wording is not available."),
        h("dl", { class: "kv lab-pages" },
          h("dt", {}, "Money"), h("dd", {}, "pretend only: no orders, no credentials, no link to any broker"),
          h("dt", {}, "Costs"), h("dd", {}, costLine),
          h("dt", {}, "Out of sample"), h("dd", {}, `only the live record${sum.live_start ? ` since ${U.d(sum.live_start)}` : ""}; the history uses today's index members`),
          h("dt", {}, "Rule changes"), h("dd", {}, "a hash of the rules stops silent changes; a change is a new season that restarts the record"))],
      foot: "Shown exactly as registered with the scorecard. Past and simulated results do not predict future results." }),
    card({ n: 2, code: "READ", title: "How to read this site", span: 5,
      body: [h("div", { class: "lab-read" }, READ.map(([id, label, what]) => h("a", { class: "lab-read-r", href: `#/lab/${id}` },
        h("span", { class: "k" }, subCode("lab", id, false) || ""), h("b", {}, label), h("span", {}, what), h("span", { class: "go", "aria-hidden": "true" }, "›")))),
        h("p", { class: "note" }, "Under the hood: the journal of every session, the costs, what the model learned, robustness drills and data quality.")],
      foot: "Every number comes from the lab's own files and arithmetic on them." })));

  /* from the second settled session: the main book against the Europe ETF since the live start (live only) */
  if (bk && (bk.equity_series || []).length > 1) {
    const box = h("div", { class: "chart" });
    el.append(U.grid(card({ n: 3, code: "LIVE", title: "Main book against the Europe ETF, since the live start", span: 12,
      body: [h("div", { class: "chart-head" }, h("span", { class: "section-l grow" }, "€, after costs and tax"),
        U.legend([{ label: "Main book after tax", style: "area", value: U.eur(at.equity, 0) }, { label: "X1 Europe ETF after tax", style: "b1" }])), box],
      foot: U.foot(`Live: ${U.plural(n, "session")} since ${U.d(sum.live_start)}`, "paper money", "past results do not predict future ones") })));
    U.lines(box, [
      { label: "X1 Europe ETF", points: (bk.bench_series || {}).X1, style: "b1", fmt: (v) => U.eur(v, 0) },
      { label: "Main book after tax", points: bk.after_series || bk.equity_series, style: "area", fmt: (v) => U.eur(v, 0) }], { euro: true, digits: 0 });
  }
};

/* ================================================================ DESK */
LabViews.desk = async (el, ctx, wait) => {
  const U = LabUI, { sum, params } = ctx;
  const session = params.get("session");
  el.append(...ctx.head(session ? h("a", { class: "btn", href: "#/lab/desk" }, "Back to the last session") : null), wait);
  let d, rules, bk;
  try {
    [d, rules, bk] = await Promise.all([U.get(`/api/lab/desk${session ? `?session=${encodeURIComponent(session)}` : ""}`), U.get("/api/lab/rules", 600_000).catch(() => null),
      U.get("/api/lab/book?id=MAIN&window=live").catch(() => null)]);
  } catch (e) {
    if (!ctx.alive()) return;
    wait.remove();
    el.append(U.errorCard(/404/.test(e.message) || /unknown|no session/i.test(e.message) ? `No committed session on ${U.d(session)}.` : `The desk could not load: ${e.message}`));
    return;
  }
  if (!ctx.alive()) return;
  wait.remove();
  if (d.state === "not_started") { el.replaceChildren(); labGate(el, "desk", d); return; }
  const main = d.main || {}, pend = d.pending || {}, ch = d.champion || {}, sc = sum.scorecard || {};
  const champ = sum.champion || {};
  const isCash = !ch.id || ch.id === "CASH";
  const FL = Object.fromEntries(((rules && rules.features) || []).map((f) => [f.key, f.label]));
  const flabel = (k) => FL[k] || k;
  const orders = pend.orders || [];
  const past = session && session !== sum.as_of_session;
  const ne = d.next_events || sum.next_events || {};
  const firstEv = (ne.events || []).find((e) => e.kind === "decide") || null;
  const pre = (d.not_live_yet || !!ne.first_live) && !past;     // registered, first live session not settled yet
  const cap0 = pre ? 10000 : undefined;                         // every book starts with €10,000 of paper
  const fillSession = pend.fill_session || (pre ? ne.fill_session : null);
  const firstWhen = firstEv ? (/^(Tonight|Today)/.test(U.relWhen(firstEv.at)) ? `${U.wday(firstEv.session)} (${U.relWhen(firstEv.at).toLowerCase()})` : `${U.wday(firstEv.session)} (≈${firstEv.at.slice(11, 16)})`)
    : U.d(d.live_start || sum.live_start);

  /* ---------------- KPI strip (§13.2) */
  const lr = sum.last_run || {};
  const sm = sum.main || {};
  const at = main.after_tax || (pre ? {} : sm.after_tax) || {}, pt = main.pre_tax || (pre ? {} : sm.pre_tax) || {};
  const RUN = { prelive: "before live start", catchup: "catch-up", live: "live", history: "history" };
  el.append(U.kpis(sum, [
    { label: past ? `Main book after tax · ${U.ds(d.as_of_session)}` : "Main book · after tax", tier: "hero", value: eurFig(at.equity ?? main.equity ?? cap0),
      detail: pre ? h("span", { class: "muted" }, `starting paper cash · first decision after the ${firstWhen} session end`)
        : [delta(null, at.ret_since_live ?? main.ret_since_live), h("span", { class: "muted" }, ` since ${U.d(sum.live_start)} · last session `),
        signed(at.ret_session ?? main.ret_session, fmt.p2), h("span", { class: "muted" }, " · Europe ETF "), signed(main.etf_since_live, fmt.p2)] },
    { label: "Before tax", tier: "major", value: ok2(pt.equity) ? U.eur(pt.equity) : pre ? U.eur(cap0) : "—",
      detail: pre ? h("span", { class: "muted" }, "every book and the main book start with €10,000 of paper") : [signed(pt.ret_since_live, fmt.p2), h("span", { class: "muted" }, " since the live start · the withheld tax added back")] },
    { label: "Tax withheld", tier: "major", value: U.eur(main.tax_withheld ?? sm.tax_withheld ?? 0),
      detail: h("span", { class: "muted" }, `26% of realised gains · credits ${U.eur(main.credits ?? (sm.credits || {}).eur ?? 0)}${main.earliest_expiry ? `, oldest usable to ${U.d(main.earliest_expiry)}` : ""}`) },
    { label: "Champion", value: isCash ? "CASH" : `${ch.id} · ${U.famWord(ch.family)}`,
      detail: h("span", { class: "muted" }, isCash ? "no strategy meets the bar" : pre ? `${U.nm(ch.id, ch.name)} · first decision ${firstEv ? U.relIn(firstEv.at) : U.ds(d.live_start || sum.live_start)}, then its own clock` : `${U.nm(ch.id, ch.name)} · ${U.clockText(ch.family, d.next_decisions)}`) },
    { label: "Criteria met", value: [String(sc.met ?? "—"), h("span", { class: "of" }, ` / ${sc.of || 10}`)],
      detail: h("span", { class: "muted" }, (sc.changed_today || []).length ? sc.changed_today.map((c) => `${c.id} ${c.from.replace("_", " ")} → ${c.to.replace("_", " ")}`).join(" · ") : "pre-registered; none changed today") },
    { label: "Live sessions", value: [U.int(sum.live_sessions), h("span", { class: "of" }, " / 250")],
      detail: h("span", { class: "muted" }, `last run ${U.ds(lr.session)} · ${RUN[lr.mode] || lr.mode || "—"}${lr.ok === false ? " · failed" : ""}`) },
  ]));
  if (!past && ne.events && !ne.first_live) el.append(U.nextStrip(ne));
  if (past) el.append(h("div", { class: "lab-strip", role: "note" }, badge("Earlier session", "na"), h("span", {}, `This is the desk as committed after the ${U.d(d.as_of_session)} session end (${(d.mode || "").replace("catchup", "catch-up")}). KPI cells other than the main book show the latest session.`)));

  /* ---------------- 1 BOOK · 2 NEXT */
  const pos = main.positions || [];
  const costsPaid = (p) => (p.costs_paid && typeof p.costs_paid === "object" ? (p.costs_paid.fee || 0) + (p.costs_paid.spread || 0) + (p.costs_paid.ftt || 0) : p.costs_paid);
  const liveOK = !sum.demo && !past;
  const markCell = (p) => {
    const mk = h("span", { class: "flashable" }, U.px(p.mark));
    const tag = h("span", { class: "lab-intraday", hidden: true, "data-tip": "Live mid from the stream while this page is open: intraday, not settled." }, "intraday");
    const pnl = h("span", {}, signed(p.pnl, fmt.n2));
    if (liveOK) U.live.set(p.isin, { mark: mk, tag, pnl, p });
    p._pnl = pnl;
    return [tag, " ", mk];
  };
  const cs = main.costs_session || {};
  const NAMES = Object.fromEntries([...((bk && bk.fills) || []), ...(main.positions || []), ...(d.ladder || []), ...((d.pending || {}).orders || [])].filter((x) => x.name).map((x) => [x.isin, x.name]));
  const fills = (main.fills || []).map((f) => ({ ...f, name: f.name || NAMES[f.isin] }));
  const bookTable = table({ caption: "Main book positions", cls: "compact", stack: true, cols: [
    { key: "name", label: "Name", lead: true, fmt: (p) => [h("span", { class: "nm" }, p.name), h("span", { class: "sub" }, p.isin)] },
    { key: "ftt", label: "FTT", title: "transaction-tax group", fmt: (p) => U.ftt(p.ftt_group) },
    { key: "entered", label: "Entered", fmt: (p) => U.ds(p.entered) },
    { key: "held", label: "Held", num: true, title: "sessions held", fmt: (p) => U.int(p.held) },
    { key: "shares", label: "Shares", num: true, fmt: (p) => U.int(p.shares) },
    { key: "entry", label: "Entry €", title: "entry fill", num: true, fmt: (p) => U.px(p.entry_fill) },
    { key: "mark", label: "Mark €", num: true, fmt: markCell },
    { key: "pnl", label: "P&L €", num: true, fmt: (p) => p._pnl },
    { key: "pnlp", label: "P&L %", num: true, fmt: (p) => signed(p.pnl_pct, fmt.p2) },
    { key: "fc", label: "Fcst", title: "forecast at entry, bps", sl: "Forecast", num: true, fmt: (p) => U.sbps(p.forecast_bps_at_entry) },
    { key: "cp", label: "Costs €", title: "costs paid on this position", num: true, fmt: (p) => U.num(costsPaid(p)) },
  ], rows: pos });
  const lad0 = (d.ladder || [])[0];
  /* 2 NEXT: what the main book holds once the paper orders of tonight fill, and when each family decides next */
  const nd = d.next_decisions || {};
  const heldAfter = (() => {
    const m = new Map(pos.map((p) => [p.isin, { name: p.name, shares: p.shares }]));
    orders.forEach((o) => { if (o.side === "exit") m.delete(o.isin); else if (o.side === "enter") m.set(o.isin, { name: o.name, shares: o.shares }); });
    return [...m.values()];
  })();
  const fillWhen = fillSession ? `the ${U.d(fillSession)} session end` : "the next session end";
  const bookEmpty = pre && !isCash
    ? `€10,000 of paper cash until the first live session. After the ${firstWhen} session end the main book takes its first decision with the policy of the champion, ${U.nm(ch.id, ch.name)} (${ch.id}), whatever the clock of that policy; its paper orders fill at ${fillWhen}.`
    : !pos.length && orders.some((o) => o.side === "enter")
    ? `Cash until the paper orders fill at ${fillWhen}: ${U.plural(orders.filter((o) => o.side === "enter").length, "paper entry", "paper entries")} waiting (panel 2).`
    : isCash
    ? "Cash. No strategy has beaten, after costs and tax, both its family's random picks and what the best of 53 random strategies would show, so the main book waits while the league keeps practising (see the Champion panel)."
    : `Cash tonight. The champion's highest forecast was ${lad0 ? `${U.num(lad0.yhat_bps, 1)} bps against a cost hurdle of ${U.num(lad0.hurdle_bps, 1)} bps` : "below its cost hurdle"}.`;
  const sessCost = (cs.fee || 0) + (cs.spread || 0) + (cs.ftt || 0);
  const bookChart = h("div", { class: "chart fill" });
  const row1 = U.grid(
    card({ n: 1, code: "BOOK", title: "Main book", span: 8, flush: true, badges: [badge("Paper", "paper")],
      sub: `${U.plural(pos.length, "position")} · cash ${U.eur(main.cash)} · invested ${U.pct(main.invested, 0)}`,
      body: [pos.length ? bookTable : U.pad(empty(bookEmpty)),
        U.pad(
          h("div", { class: "stats four" },
            stat("After tax", U.eur(at.equity ?? main.equity ?? cap0), ["since live ", h("span", { class: tone(at.ret_since_live) }, sign(at.ret_since_live, fmt.p2))]),
            stat("Before tax", U.eur(pt.equity ?? main.equity ?? cap0), ["since live ", h("span", { class: tone(pt.ret_since_live) }, sign(pt.ret_since_live, fmt.p2))]),
            stat(U.tl("Tax if sold tonight", "The tax a full sale at tonight's marks would withhold, using the credits: after tax = the book less this."), U.eur(main.deferred_tax ?? 0), `withheld so far ${U.eur(main.tax_withheld ?? 0)}`),
            stat("Cash · invested", U.eur(main.cash ?? cap0), `${U.pct(main.invested, 0)} in shares · cash earns 0%`)),
          h("div", { class: "two-col lab-two" },
            h("div", {}, h("div", { class: "section-l" }, "This session's costs"),
              ledger([
                { op: "", label: "Order fees", small: `${U.plural(fills.length, "paper fill")} × €1`, value: U.eur(cs.fee) },
                { op: "+", label: "Spread", small: "0.05% a side, assumed", value: U.eur(cs.spread) },
                { op: "+", label: "Transaction tax", small: "net purchases of taxed names", value: U.eur(cs.ftt) },
                { op: "=", label: "Costs this session", value: U.eur(sessCost), cls: "total" },
                { op: "", label: "Tax withheld", small: "26% of this session's realised gains, after credits", value: U.eur(main.tax_session ?? 0) }])),
            h("div", {}, h("div", { class: "section-l" }, "Paper fills this session"),
              fills.length ? h("div", { class: "lab-fills" }, fills.map((f) => h("div", { class: "f" },
                badge(f.side === "buy" ? "Entry" : "Exit", f.side === "buy" ? "paper" : ""),
                h("span", { class: "nm" }, f.name || f.isin),
                h("span", { class: "num" }, `${U.int(f.shares)} × ${U.px(f.fill)}`),
                h("span", { class: "why" }, `mid ${U.px(f.mid)} ${f.side === "buy" ? "+" : "−"} 0.05% · ${f.source || "assumed"}${f.reason ? ` · ${prose(f.reason)}` : ""}`))))
                : h("p", { class: "note" }, "No paper fill this session.")))),
        bk && (bk.equity_series || []).length > 1 ? h("div", { class: "lab-pad lab-grow" }, h("div", { class: "chart-head" }, h("span", { class: "section-l grow" }, "Since the live start, €"),
          U.legend([{ label: "Main book after tax", style: "area", value: U.eur(at.equity ?? main.equity, 0) }, { label: "Before tax", style: "youdash" }, { label: "X1 Europe ETF after tax", style: "b1" }, { label: "Gross, before costs and tax", style: "b3" }])), bookChart)
          : h("div", { class: "lab-pad lab-grow" }, empty("The since-live chart starts after the second live session end."))],
      foot: U.foot(`Marks: L&S session-end mid of ${U.d(d.as_of_session)}${liveOK ? "; while this page is open a live mid replaces it, tagged intraday, not settled" : ""}`, "fills at the mid ± 0.05% (assumed)", "the cost table of 24 Sep 2026", "paper, no real orders") }),
    card({ n: 2, code: "NEXT", title: "Paper orders for the next session end", span: 4,
      body: [h("p", { class: "callout" }, `What the main book will do on paper at ${fillWhen}. Not advice; the lab places no real orders.`),
        orders.length ? h("div", { class: "lab-orders" }, orders.map((o) => h("div", { class: `o ${o.side}` },
          h("div", { class: "o-top" }, badge(o.side === "enter" ? "Paper entry" : "Paper exit", o.side === "enter" ? "paper" : ""), h("span", { class: "nm" }, o.name),
            h("span", { class: "num" }, o.shares != null ? `${U.int(o.shares)} shares` : `ticket ${U.eur(o.ticket_eur)}`)),
          o.side === "enter" && ok2(o.forecast_bps) ? ledger([
            { op: "", label: "Forecast", small: ch.family === "weekly" ? "next 5 sessions, market-adjusted" : "next session, market-adjusted", value: `${sign(o.forecast_bps, U.NF[1])} bps` },
            { op: "−", label: "Cost hurdle", small: "full round trip", value: `${U.num(o.hurdle_bps, 1)} bps` },
            { op: "=", label: "Net of costs", value: h("span", { class: tone(o.net_bps) }, `${sign(o.net_bps, U.NF[1])} bps`), cls: "total" }]) : null,
          o.side === "enter" && ok2(o.forecast_bps) ? h("p", { class: "note" }, "A model forecast, not an expected profit.") : null,
          h("p", { class: "note" }, U.cap(prose(o.reason || ""))))))
          : empty(pre ? `No paper orders yet: the main book takes its first decision after the ${firstWhen} session end${isCash ? "" : `, with the policy of ${ch.id} whatever its clock`}. They appear here and fill at ${fillWhen}.`
            : !isCash && ch.family && ch.family !== "daily" ? `No paper orders tonight: the champion decides on its ${ch.family === "weekly" ? "weekly" : "monthly"} clock (next: ${U.d(ch.family === "weekly" ? (d.next_decisions || {}).weekly_decision : (d.next_decisions || {}).monthly_decision)}); between decisions only a blocked stock is sold.`
            : pos.length ? "No paper orders: the main book keeps its positions." : "No paper orders: the main book stays in cash."),
        h("dl", { class: "kv" }, fillSession ? [h("dt", {}, "Fill session"), h("dd", {}, U.d(fillSession))] : null, h("dt", {}, "Fill"), h("dd", {}, pend.fill_at || "L&S session end"),
          h("dt", {}, "Follows"), h("dd", {}, isCash ? "cash" : U.book(ch.id, ch.name)),
          h("dt", {}, "Clock"), h("dd", {}, isCash ? "—" : pre ? `first decision ${firstEv ? U.relIn(firstEv.at) : U.d(d.live_start || sum.live_start)}; then ${U.famWord(ch.family).toLowerCase()}: ${U.clockText(ch.family, d.next_decisions)}` : `${U.famWord(ch.family)}: ${U.clockText(ch.family, d.next_decisions)}`),
          h("dt", {}, "Policy"), h("dd", { class: "lab-dd" }, isCash ? "—" : [U.policy(ch.policy), ch.k != null ? ` · k ${U.num(ch.k, 1)}` : ""]),
          h("dt", {}, "Names chosen tonight"), h("dd", {}, ch.chosen_n != null ? U.int(ch.chosen_n) : "—")),
        h("div", { class: "section-l" }, "Held after these paper orders"),
        heldAfter.length ? h("dl", { class: "kv" }, heldAfter.map((x) => [h("dt", {}, x.name), h("dd", {}, x.shares != null ? `${U.int(x.shares)} shares` : "—")]))
          : h("p", { class: "note" }, "Cash only: no position after the fill."),
        h("div", { class: "section-l" }, "Decision clocks"),
        h("dl", { class: "kv" }, pre ? [h("dt", {}, "First decision, every book"), h("dd", {}, firstWhen)] : null,
          h("dt", {}, "Daily books"), h("dd", {}, "after every session end"),
          h("dt", {}, "Weekly books"), h("dd", {}, U.d(nd.weekly_decision)),
          h("dt", {}, "Long-hold books"), h("dd", {}, U.d(nd.monthly_decision)),
          h("dt", {}, "Champion review"), h("dd", {}, U.d(nd.review || (d.review || {}).next)))],
      foot: ["Paper orders, not instructions. ", link("Costs › hand-execution check", "#/lab/costs"), " measures after the fact how fills at quoted prices would have differed from these paper fills."] }));
  el.append(row1);
  /* live marks for the 0–3 names of the main book only (the server already streams them); never on demo data */
  if (liveOK && pos.length) Live.want("page", pos.map((p) => p.isin));
  if (bk && (bk.equity_series || []).length > 1) U.lines(bookChart, [
    { label: "Gross", points: bk.gross_series, style: "b3", fmt: (v) => U.eur(v, 0) },
    { label: "X1 Europe ETF", points: (bk.bench_series || {}).X1, style: "b1", fmt: (v) => U.eur(v, 0) },
    { label: "Before tax", points: bk.pre_series, style: "youdash", fmt: (v) => U.eur(v, 0) },
    { label: "Main book after tax", points: bk.after_series || bk.equity_series, style: "area", fmt: (v) => U.eur(v, 0) }], { euro: true, digits: 0 });

  /* ---------------- 3 LADR · 4 WHY */
  const ladder = d.ladder || [];
  let selIsin = ladder.length ? ladder[0].isin : null;
  const ladBox = h("div"), whyBox = h("div", { class: "lab-why" });
  const whyTitle = h("span");
  const drawLadder = () => {
    const clear = ladder.filter((r) => (r.net_bps ?? -1) >= 0), below = ladder.filter((r) => !((r.net_bps ?? -1) >= 0));
    const rows = [];
    if (clear.length) rows.push({ __group: "Forecast clears the cost hurdle", __n: clear.length }, ...clear);
    if (below.length) rows.push({ __group: "Below the cost hurdle", __n: below.length }, ...below);
    ladBox.replaceChildren(table({ caption: "Decision ladder", cls: "compact", rows,
      rowCls: (r) => (r.isin === selIsin ? "sel" : ""),
      onrow: (r) => { selIsin = r.isin; drawLadder(); drawWhy(); },
      cols: [
        { key: "rk", label: "#", hideSm: true, fmt: (r) => h("span", { class: "rk" }, ladder.indexOf(r) + 1) },
        { key: "name", label: "Name", lead: true, fmt: (r) => [h("span", { class: "nm" }, r.name), h("span", { class: "sub hide-sm" }, r.isin)] },
        { key: "ftt", label: "FTT", hideSm: true, fmt: (r) => U.ftt(r.ftt_group) },
        { key: "y", label: "Forecast", num: true, fmt: (r) => U.sbps(r.yhat_bps) },
        { key: "hd", label: "Hurdle", num: true, hideSm: true, fmt: (r) => U.bps(r.hurdle_bps) },
        { key: "net", label: "Net", num: true, sort: "descending", fmt: (r) => U.sbps(r.net_bps) },
        { key: "fl", label: "Flags", hideSm: true, fmt: (r) => ((r.flags || []).length ? r.flags.map((f) => badge(f, "warn")) : h("span", { class: "dim" }, "—")) },
        { key: "act", label: "Action", fmt: (r) => (r.action && r.action !== "none" ? badge({ enter: "Paper entry", exit: "Paper exit", hold: "Keep" }[r.action] || r.action, "paper") : h("span", { class: "dim" }, "none")) },
      ] }));
  };
  const drawWhy = () => {
    const r = ladder.find((x) => x.isin === selIsin);
    const w = r && (d.why || {})[r.isin];
    whyTitle.textContent = r ? `Forecast anatomy · ${r.name}` : "Forecast anatomy";
    if (!r) { whyBox.replaceChildren(empty(ladder.length ? "Select a row of the decision ladder." : "No forecast to break down yet: the ladder is empty.")); return; }
    if (!w || !w.contrib_bps) { whyBox.replaceChildren(empty(`No breakdown is stored for ${r.name}. Select another row of the decision ladder.`)); return; }
    const keys = Object.keys(w.contrib_bps);
    const order = ((rules && rules.features) || []).map((f) => f.key).filter((k) => keys.includes(k));
    const ks = order.length ? order.concat(keys.filter((k) => !order.includes(k))) : keys;
    const total = ks.reduce((a, k) => a + (w.contrib_bps[k] || 0), 0);
    const trust = w.trust && typeof w.trust === "object" ? Object.entries(w.trust).filter(([, v]) => ok2(v)).sort((a, b) => b[1] - a[1]) : [];
    const tcol = (k, i) => (k === "zero" ? "var(--other)" : i < 5 ? `var(${CATS[i]})` : "var(--other)");
    U.fill(whyBox,
      h("div", { class: "section-l" }, "Contributions to the forecast, bps"),
      U.divRows(ks.map((k) => ({ label: flabel(k), v: w.contrib_bps[k], tip: `${flabel(k)} (${k}): ${sign(w.contrib_bps[k], U.NF[2])} bps` })), { unit: "" }),
      ledger([
        { op: "", label: "Forecast", small: `the sum of the ${ks.length} contributions, ${sign(total, U.NF[1])}`, value: `${sign(r.yhat_bps, U.NF[1])} bps` },
        { op: "−", label: "Cost hurdle", small: "full round trip", value: `${U.num(r.hurdle_bps, 1)} bps` },
        { op: "=", label: "Net of costs", value: h("span", { class: tone(r.net_bps) }, `${sign(r.net_bps, U.NF[1])} bps`), cls: "result" }]),
      trust.length ? [h("div", { class: "section-l" }, "Whom the meta-learner trusted"),
        stackBar(trust.map(([k, v], i) => ({ name: k, share: v, color: tcol(k, i) })), { w: "100%" }),
        legend(trust.map(([k, v], i) => ({ c: tcol(k, i), style: "box", label: k, value: fmt.p0.format(v) })))] : null,
      w.cell ? [h("div", { class: "section-l" }, "Calibration-table cell used"),
        h("dl", { class: "kv" }, Object.entries(w.cell).map(([k, v]) => [h("dt", {}, k), h("dd", {}, typeof v === "number" ? U.num(v, 2) : String(v))]))] : null);
  };
  drawLadder(); drawWhy();
  const heading = d.ladder_heading === "champion" ? "Decision ladder: the champion's top forecasts" : "Not the main book: highest score, below the bar";
  /* panels are numbered in the order they are drawn: before the first live decision the ladder, its breakdown and the
     session league have nothing to show, so one line says when they start instead of three empty boxes */
  let pn = 3;
  const lg = [...(d.league_session || [])].sort((a, b) => (b.net ?? -9) - (a.net ?? -9));
  const lo = d.league_orders || [];
  const showLadder = ladder.length > 0, showLeague = lg.length > 0 || lo.length > 0;
  /* before the first live decision: one line says what starts then, and the journal, the market and the champion
     fill the page in reading order (journal and market stacked beside the champion, so no panel ends in a blank band) */
  const preLayout = !showLadder && !showLeague;
  const pb = showLadder ? 5 : 3;                               // after LADR (3) and WHY (4) when they show
  const nLOG = preLayout ? pb : pb + 2, nMKT = preLayout ? pb + 1 : pb, nLGUE = pb + 1, nCHMP = preLayout ? pb + 2 : pb + 3;
  const startsWhen = firstEv ? `${U.wday(firstEv.session)} ≈${firstEv.at.slice(11, 16)}` : `${U.d(sum.live_start)}, about 23:13`;
  if (showLadder) {
    el.append(U.grid(
      card({ n: pn++, code: "LADR", title: heading, span: 6, flush: true, sub: `source ${ch.source || "—"} · ${ladder.length} rows`,
        tools: [h("span", { class: "note" }, prose(d.ladder_note || "Sorted by net forecast; not a ranking of stocks to buy.")), h("span", { class: "grow" }), h("span", { class: "note" }, "Select a row to see its forecast breakdown")],
        body: ladBox,
        foot: "Forecast: market-adjusted return expected over the session a paper position would carry. Hurdle: the full round-trip cost of that trade (fee, spread and any tax)." }),
      card({ n: pn++, code: "WHY", title: whyTitle, span: 6, body: whyBox,
        foot: ["Contribution = the learner's coefficient × the stock's feature score (robust z). Features and their evidence: ", link("Method › features", "#/lab/rules"), "."] })));
  }

  /* ---------------- MKT · LGUE */
  const mk = d.market || {};
  const stressBox = h("div", { class: "chart s" });
  const lmax = Math.max(1e-6, ...lg.map((r) => Math.abs(r.net || 0)));
  const KS = { eligible: "strategy", main: "main book", reference: "reference", diagnostic: "diagnostic", probe: "probe" };
  const lrow = (r) => h("div", { class: `r ${r.id === "MAIN" ? "you" : r.kind === "reference" || r.kind === "diagnostic" ? "ref" : r.kind}`, "data-tip": `${r.id} · ${U.nm(r.id)} · ${KS[r.kind] || r.kind}: ${r.observed === false ? "not observed this session (no recorded tape)" : `${sign(r.net, fmt.p2)} net this session`}` },
    h("span", { class: "n" }, h("b", {}, r.id), h("small", {}, KS[r.kind] || r.kind)), dbar(r.observed === false ? 0 : r.net || 0, lmax),
    h("span", { class: `v ${tone(r.net)}` }, r.observed === false ? "n/o" : sign(r.net, fmt.p2)));
  const half = Math.ceil(lg.length / 2);
  /* the paper orders of the league for the next session end (names and sides only; no forecast numbers) */
  const FAMS = { daily: "Daily", weekly: "Weekly", monthly: "Long hold" };
  const loRow = (r) => h("div", { class: `lab-lo ${r.kind}`, "data-tip": `${r.id} · ${U.nm(r.id)}` },
    h("span", { class: "id tick" }, r.id), h("span", { class: "fam" }, FAMS[r.family] || r.family),
    h("span", { class: "tx" }, r.enter.length ? [badge("Paper entry", "paper"), " ", r.enter.join(", ")] : null,
      r.enter.length && r.exit.length ? " · " : null, r.exit.length ? [badge("Paper exit", ""), " ", r.exit.join(", ")] : null));
  const loWhen = fillSession || ne.fill_session;
  const loWhenTxt = loWhen ? "the " + U.d(loWhen) + " session end" : "the next session end";
  const loBlock = lo.length ? [h("div", { class: "section-l lab-sl" }, `League paper orders for ${loWhenTxt} · ${U.plural(lo.length, "book")}`),
    ...U.showAll(lo, 8, (xs) => h("div", { class: "lab-los" }, xs.map(loRow)), "books")] : [];
  const cMKT = card({ n: nMKT, code: "MKT", title: "Market at the session end", span: preLayout ? null : 4,
    body: d.market ? [h("div", { class: preLayout ? "stats four" : "stats two" },
      stat("Equal-weight market", h("span", { class: tone(mk.m) }, `${arrow(mk.m)} ${sign(mk.m, fmt.p2)}`), "the average stock, this session"),
      stat("Stress", [U.num(mk.stress, 2), " ", h("small", { class: "lab-sw" }, mk.stress_word || "")], "20-session volatility ÷ its 1-year median"),
      stat("Stocks that rose", U.pct(mk.breadth, 0), "breadth"),
      stat("Tradable", U.int(mk.tradable), `${(mk.frozen || []).length} frozen · ${(mk.missing || []).length} missing · ${(mk.stale || []).length} stale`)),
      h("div", { class: "section-l" }, "Stress over the last year · 1.0 = its median"), stressBox,
      h("dl", { class: "kv" }, h("dt", {}, "Frozen (moves over 15% against the market)"), h("dd", {}, (mk.frozen || []).length ? mk.frozen.join(", ") : "none"),
        h("dt", {}, "Missing or stale closes"), h("dd", {}, [...(mk.missing || []), ...(mk.stale || [])].join(", ") || "none"),
        h("dt", {}, "Known ex-dates in the next 2 sessions"), h("dd", {}, (mk.exdiv_next2 || []).length ? mk.exdiv_next2.map((x) => (typeof x === "string" ? x : x.name || x.isin)).join(", ") : "none"))]
      : empty("Waiting for the first settled session."),
    foot: prose(mk.stress_note || "A realised-volatility proxy, not VIX.") });
  const notYet = !showLadder ? h("p", { class: "callout lab-notyet" }, `The decision ladder and the forecast breakdown start with the first live session (${startsWhen}). `,
    "Until then the ", link("League", "#/lab/league?window=validation"), " shows how the same rules behaved in the past (in-sample).") : null;
  const cLGUE = showLeague ? card({ n: nLGUE, code: "LGUE", title: "League this session", span: 8, more: h("a", { class: "btn sm ghost", href: "#/lab/league" }, "Open the league"),
      tools: [h("span", { class: "note" }, "Every book's return this session, after costs and tax. Sorted by that number: a sort, not a ranking of merit.")],
      body: [notYet, lg.length ? h("div", { class: "two-col lab-lg" }, h("div", { class: "lab-div" }, lg.slice(0, half).map(lrow)), h("div", { class: "lab-div" }, lg.slice(half).map(lrow)))
        : h("p", { class: "note lab-pad" }, "No book has settled a live session yet: the first paper fills are at the next session end."),
        ...loBlock],
      foot: U.foot(`${sum.league ? `${U.int(sum.league.books_settled)} books settled, ${U.int(sum.league.books_traded)} traded, ${U.int(sum.league.fills_session)} paper fills` : ""}`, "main book in cyan; references and diagnostics grey; n/o = a probe not observed (no recorded tape)") }) : null;
  if (preLayout) el.append(h("div", { class: "lab-strip note", role: "note" }, badge("First live session", "paper"),
    h("span", {}, `The decision ladder, the forecast breakdown and the session league start after the first live session end (${startsWhen}). Until then the `,
      link("League", "#/lab/league?window=validation"), " shows how the same rules behaved in the past (in-sample).")));
  else el.append(U.grid(cMKT, cLGUE));
  if (d.market && (mk.stress_1y || []).length > 1) {
    const s1 = mk.stress_1y;
    const res = U.lines(stressBox, [
      { label: "Stress", points: s1, style: "you", fmt: (v) => U.num(v, 2) },
      { label: "Median = 1.0", points: [[s1[0][0], 1], [s1[s1.length - 1][0], 1]], style: "b1", tip: false }], { euro: false, digits: 2 });
    if (!res) stressBox.replaceChildren(h("p", { class: "fallback" }, "Chart unavailable offline."));
  } else stressBox.replaceChildren(h("p", { class: "note" }, "Needs a year of sessions."));

  /* ---------------- LOG · CHMP */
  const TY = { DECIDE: "reg", CHAMP: "reg", LEARN: "sys", LESSON: "sys", CORRECTION: "warn", FILL: "", BOOK: "", DATA: "", STATE: "", LEAGUE: "", CHECK: "", TAPE: "" };
  const lessons = d.lessons || [];
  /* a lesson that fired is listed once, under "Lessons that fired" with its ID, not also as a LESSON journal line */
  const lessonText = new Set(lessons.map((l) => l.text));
  const jl = (d.journal || []).filter((l) => !(l.tag === "LESSON" && lessonText.has(l.text)));
  const rv = d.review || {}, gr = rv.grade || {}, th = gr.thresholds || {};
  const hist = (rv.history || []).slice(0, 5);
  const raised = Object.entries(d.stop_flags || {}).filter(([, v]) => v).map(([k]) => k);
  const probeIds = Object.keys(d.probes || {});
  const chosen = ch.since || champ.since, follows = d.live_start || sum.live_start;
  const cLOG = card({ n: nLOG, code: "LOG", title: "This session's journal", span: preLayout ? null : 8, sub: `${U.d(d.as_of_session)} · settled ${U.hm(d.settled_at)}`,
      body: jl.length ? [h("div", { class: "journal lab-log" }, jl.map((l) => h("div", { class: "log" }, h("span", { class: `ty ${TY[l.tag] ?? ""}` }, l.tag), h("span", { class: "tx" }, prose(l.text))))),
        h("div", { class: "section-l" }, "Lessons that fired"),
        lessons.length ? h("div", { class: "journal lab-log" }, lessons.map((l) => h("div", { class: "log" }, h("span", { class: "ty sys" }, l.id), h("span", { class: "tx" }, prose(l.text)))))
          : h("p", { class: "note" }, "No lesson fired this session. The full catalogue is on ", link("Model", "#/lab/learn"), "."),
        h("div", { class: "section-l" }, "Checks this session"),
        h("div", { class: "lab-grade" },
          U.check(!raised.length, raised.length ? `stop flag raised on ${raised.join(", ")}` : `no stop flag raised (${U.int(Object.keys(d.stop_flags || {}).length)} books checked)`),
          probeIds.length ? U.check(probeIds.every((k) => d.probes[k].observed), `probes observed ${U.int(probeIds.filter((k) => d.probes[k].observed).length)} of ${probeIds.length}: ${probeIds.map((k) => `${k} ${d.probes[k].observed ? sign(d.probes[k].net, fmt.p2) : "not observed"}`).join(" · ")}`) : null)]
        : empty(`The journal starts with the first settled session (${startsWhen}).`),
      foot: ["Written from fixed templates after the step: facts with signs and units, no generated prose. Every session: ", link("Journal", "#/lab/journal"), "."] });
  const cCHMP = card({ n: nCHMP, code: "CHMP", title: "Champion", span: 4,
      body: [h("div", { class: "score" }, h("div", { class: "big" }, isCash ? "CASH" : ch.id),
        h("div", {}, h("div", { class: "t" }, isCash ? "No strategy meets the bar" : U.nm(ch.id, ch.name)),
          isCash ? null : h("div", { class: "note" }, `${ch.name} · chosen ${U.d(chosen)}${follows && follows !== chosen ? ` · followed from the ${U.d(follows)} session` : ""}`),
          h("div", { class: "note" }, prose(champ.reason || (hist[0] || {}).reason || "")))),
        h("div", { class: "stats two" },
          stat("Score (DSR)", U.num(champ.score_dsr, 2), "deflated Sharpe after tax, last 750 sessions"),
          stat("Runner-up", champ.runner_up ? `${champ.runner_up.id} · ${U.num(champ.runner_up.score_dsr, 2)}` : "—", champ.runner_up ? `${U.nm(champ.runner_up.id)}; needs to lead at two reviews` : "needs to lead at two reviews")),
        h("div", { class: "section-l" }, `Grade checks${gr.id ? ` · ${gr.id}` : ""}`),
        h("div", { class: "lab-grade" },
          U.check(gr.mean_gt_0, `mean return after tax > ${U.num(th.mean_gt ?? 0, 0)}`),
          U.check(gr.beats_monkey, `above its family's random picks (${gr.monkey ? `${gr.monkey}, ${U.nm(gr.monkey).toLowerCase()}` : "—"}) after tax`),
          U.check(gr.dsr_ge, `DSR ${U.num(gr.dsr, 2)} ≥ ${U.num(th.dsr_min ?? 0.5, 2)}`),
          U.check(gr.pbo_le, `PBO ${U.num(gr.pbo, 2)} ≤ ${U.num(th.pbo_max ?? 0.5, 2)}`)),
        h("dl", { class: "kv" }, h("dt", {}, "Next review"), h("dd", {}, U.d(rv.next || champ.next_review)), h("dt", {}, "Last review"), h("dd", {}, U.d(rv.last || champ.last_review))),
        h("div", { class: "section-l" }, "Last reviews"),
        hist.length ? null : h("p", { class: "note" }, "No review yet: the first runs on the first session of the month."),
        h("div", { class: "lab-reviews" }, hist.map((r) => h("div", { class: "rv" },
          h("span", { class: "dt" }, U.ds(r.session)), h("b", {}, r.champion || "CASH"), h("span", { class: "num" }, r.score_dsr != null ? `DSR ${U.num(r.score_dsr, 2)}` : r.top ? `top ${r.top} ${U.num(r.top_dsr, 2)}` : ""),
          h("span", { class: "why" }, prose(r.reason || ""))))),
        h("p", { class: "lede lab-rule" }, prose(rv.rule_text || ""))],
      foot: ["The rule and its thresholds were registered with the season: ", link("Method › champion rule", "#/lab/rules"), "."] });
  el.append(preLayout ? U.grid(h("div", { class: "span-8 lab-stack" }, cLOG, cMKT), cCHMP) : U.grid(cLOG, cCHMP));
};
function ok2(x) { return x != null && Number.isFinite(x); }

/* ================================================================ READY */
LabViews.ready = async (el, ctx, wait) => {
  const U = LabUI, { sum } = ctx;
  el.append(...ctx.head(), wait);
  const [r, rules, practice] = await Promise.all([U.get("/api/lab/ready"), U.get("/api/lab/rules", 600_000).catch(() => null), U.get("/api/lab/practice", 120_000).catch(() => null)]);
  if (!ctx.alive()) return;
  wait.remove();
  if (r.state === "not_started") { el.replaceChildren(); labGate(el, "ready", r); return; }
  const C = Object.fromEntries((r.criteria || []).map((c) => [c.id, c]));
  const a1 = C.A1 || {}, b1 = C.B1 || {}, sc = r.scorecard || {}, tte = r.time_to_evidence || {};
  const tH = r.t_hurdle ?? (b1.threshold || {}).t ?? 3;

  const nSt = (s) => (r.criteria || []).filter((c) => c.status === s).length;
  const SHORT = { A1: "evidence", A2: "operations", B1: "significance", B2: "baselines", B3: "deflation", B4: "overfitting", B5: "drills", C1: "stop rule", C2: "measured costs", C3: "risk" };
  const failing = (r.criteria || []).filter((c) => c.status === "fails").map((c) => `${c.id} ${SHORT[c.id] || c.title.toLowerCase()}`);
  const verdictOn = a1.earliest || tte.earliest_a1;
  /* the status in words: "0 of 10" read as a failing grade while most criteria cannot be judged yet */
  const status = nSt("too_early") ? "Too early" : nSt("fails") ? "Not passed" : "All met";
  el.append(U.kpis(sum, [
    { label: "Pre-registered scorecard", tier: "hero", value: status,
      detail: [h("span", { class: "muted" }, nSt("too_early") && verdictOn ? `first verdict possible ${U.d(verdictOn)} · ` : ""),
        h("span", { class: "muted" }, `${U.int(r.met ?? 0)} met · ${U.int(nSt("fails"))} fail${failing.length ? ` (${sum.live_sessions ? "" : "history: "}${failing.join(", ")})` : ""} · ${U.int(nSt("too_early"))} too early`)] },
    { label: "Live sessions", tier: "major", value: [U.int((a1.value || {}).sessions ?? tte.live_sessions), h("span", { class: "of" }, " / 250")],
      detail: h("span", { class: "muted" }, `${U.int((a1.value || {}).trades)} of ${U.int((a1.threshold || {}).trades ?? 100)} closed trades (${U.famWord((a1.value || {}).family || "daily").toLowerCase()} family)`) },
    { label: U.tl("Live alpha t, before tax", `How far the live result after costs and before tax, beyond the market, is from zero, in standard errors. The bar this season is ${U.t3(tH)}.`), tier: "major",
      value: [h("span", {}, U.num((b1.value || {}).t, 2)), h("span", { class: "of" }, ` / ${U.t3(tH)}`)],
      detail: [progress(ok2((b1.value || {}).t) ? U.clamp(b1.value.t / (tH || 3)) : null, { kind: b1.status === "met" ? "ok" : "warn", target: 1 }),
        h("span", { class: "muted" }, `${b1.status === "met" ? "met" : b1.status === "fails" ? "fails" : "too early"} · min of iid and Newey-West t`)] },
    { label: "Earliest A1 can pass", value: U.d(a1.earliest || tte.earliest_a1), detail: h("span", { class: "muted" }, "250 live sessions") },
    { label: "Registered", value: U.d(sc.registered_on), detail: h("span", { class: "muted" }, `season ${sc.season || "—"} · ${U.int(sc.changes)} changes`) },
    { label: "Scorecard hash", value: h("span", { class: "mono" }, U.sha8(sc.sha256)), detail: h("span", { class: "muted" }, "SHA-256 of the registered file") },
  ]));

  /* ---------------- 1 SCOR · 2 WORD */
  const v = (c) => c.value || {}, t = (c) => c.threshold || {};
  const early = (c) => c.status === "too_early";
  const CRIT = {
    A1: (c) => ({ meter: progress(c.progress ?? U.clamp((v(c).sessions || 0) / (t(c).sessions || 250)), { kind: c.status === "met" ? "ok" : "warn", target: 1 }),
      val: `${U.int(v(c).sessions)} / ${U.int(t(c).sessions)} sessions · ${U.int(v(c).trades)} / ${U.int(t(c).trades)} trades` }),
    A2: (c) => ({ checks: [
      [v(c).live_mode_share >= t(c).live_mode_share, `committed live ${U.pct(v(c).live_mode_share, 0)} (≥ ${U.pct(t(c).live_mode_share, 0)})`],
      [v(c).sentinel_match >= t(c).sentinel_match, `sentinel match ${U.pct(v(c).sentinel_match, 1)} (≥ ${U.pct(t(c).sentinel_match, 0)}; ${U.int(v(c).sentinel_checks)} checks)`],
      [v(c).open_incidents <= (t(c).open_incidents ?? 0), `${U.int(v(c).open_incidents)} open data incidents`]] }),
    B1: (c) => { const tv = v(c).t; return { meter: progress(ok2(tv) ? U.clamp(tv / (t(c).t * 4 / 3)) : null, { kind: c.status === "met" ? "ok" : c.status === "fails" ? "bad" : "warn", target: 0.75 }), val: `t ${ok2(tv) ? sign(tv, U.NF[2]) : "n/a"} of ${U.t3(t(c).t)}` }; },
    B2: (c) => ({ checks: [
      [v(c).net > (t(c).net_gt ?? 0), `live after tax ${sign(v(c).net, fmt.p1)} > 0`],
      [ok2(v(c).sharpe) && ok2(v(c).sharpe_x1) ? v(c).sharpe > v(c).sharpe_x1 : null,
        ok2(v(c).sharpe) ? `Sharpe ${U.num(v(c).sharpe, 2)} > Europe ETF held (X1) ${U.num(v(c).sharpe_x1, 2)}` : "live Sharpe against the Europe ETF held (X1): n/a yet"],
      [ok2(v(c).sharpe) && ok2(v(c).sharpe_monkey) ? v(c).sharpe > v(c).sharpe_monkey : null,
        ok2(v(c).sharpe) ? `> random picks ${v(c).monkey || ""} ${U.num(v(c).sharpe_monkey, 2)}` : `against random picks ${v(c).monkey || ""}: n/a yet`]] }),
    B3: (c) => ({ meter: progress(ok2(v(c).dsr) ? v(c).dsr : null, { kind: c.status === "met" ? "ok" : "bad", target: t(c).dsr }), val: `DSR ${U.num(v(c).dsr, 2)} of ${U.num(t(c).dsr, 2)}${v(c).sessions ? ` · ${U.int(v(c).sessions)} sessions` : ""}` }),
    B4: (c) => ({ meter: progress(ok2(v(c).pbo) ? v(c).pbo : null, { kind: c.status === "met" ? "ok" : "bad", target: t(c).pbo }), val: `PBO ${U.num(v(c).pbo, 2)}, needs ≤ ${U.num(t(c).pbo, 2)}` }),
    B5: (c) => ({ checks: v(c).champion == null && !ok2(v(c).placebo_percentile) ? [[null, "n/a: no champion (counts as not met)"]] : [
      [v(c).placebo_percentile >= t(c).placebo_percentile, `placebo percentile ${U.pct(v(c).placebo_percentile, 0)} (≥ ${U.pct(t(c).placebo_percentile, 0)})`],
      [v(c).hs10_net > (t(c).hs10_net_gt ?? 0), `net at 10 bps ${sign(v(c).hs10_net, fmt.p1)} > 0`],
      [v(c).lag_net >= (t(c).lag_net_ge ?? 0), `one session late ${sign(v(c).lag_net, fmt.p1)} ≥ 0`],
      [v(c).halves_share_positive >= t(c).halves_share_positive, `halves positive ${U.pct(v(c).halves_share_positive, 0)} (≥ ${U.pct(t(c).halves_share_positive, 0)})`]] }),
    C1: (c) => ({ checks: [[(v(c).raised ?? 0) <= (t(c).raised_max ?? 0), `stop flag raised ${U.plural(v(c).raised ?? 0, "time")} in the last 120 sessions`]] }),
    C2: (c) => ({ checks: [
      [v(c).repriced_net > (t(c).repriced_gt ?? 0), `re-priced at measured spreads ${sign(v(c).repriced_net, fmt.p1)} > 0`],
      [v(c).main_x_net > (t(c).main_x_gt ?? 0), `hand-execution shadow ${sign(v(c).main_x_net, fmt.p1)} > 0`],
      [null, `${U.int(v(c).quote_sessions)} sessions with 22:50 quotes (needs 60)`]] }),
    C3: (c) => ({ checks: [
      [v(c).max_dd >= t(c).max_dd && (v(c).max_dd_pre ?? 0) >= t(c).max_dd, `max drawdown ${sign(v(c).max_dd, fmt.p1)} after tax, ${sign(v(c).max_dd_pre, fmt.p1)} before (≥ ${sign(t(c).max_dd, fmt.p0)})`],
      [v(c).worst >= t(c).worst && (v(c).worst_pre ?? 0) >= t(c).worst, `worst session ${sign(v(c).worst, fmt.p1)} after tax, ${sign(v(c).worst_pre, fmt.p1)} before (≥ ${sign(t(c).worst, fmt.p0)})`]] }),
  };
  const GROUPS = [["A", "Enough evidence, soundly recorded"], ["B", "Statistical tests"], ["C", "Stop rule, costs and risk"]];
  const critRow = (c) => {
    const f = (CRIT[c.id] || (() => ({})))(c);
    const since = c.status === "too_early" ? (c.earliest ? `earliest ${U.d(c.earliest)}` : "") : c.since ? `${c.status === "met" ? "met" : "failing"} since ${U.d(c.since)}` : "";
    return h("div", { class: `rule lab-crit ${c.status === "met" ? "met" : ""}` },
      h("span", { class: "ix" }, c.id), h("span", { class: "t" }, c.title, h("small", {}, c.code), " ", U.basis(c.basis)), U.status(c.status),
      f.meter ? h("div", { class: "row" }, f.meter, h("span", { class: "val" }, f.val)) : null,
      f.checks ? h("div", { class: "row lab-checks" }, f.checks.map(([p, txt]) => U.check(p, txt, early(c)))) : null,
      h("div", { class: "why" }, `${c.rule}${since ? ` · ${since}` : ""}`));
  };
  const W = r.wording || {};
  const word = (label, text) => (text ? h("div", { class: "w" }, h("div", { class: "section-l" }, label), h("p", {}, U.cite(text, (rules || {}).evidence))) : null);
  const cSCOR = card({ n: 1, code: "SCOR", title: "Criteria", span: 7, sub: `applies to ${sc.applies_to || "the main book"}`,
      body: [h("div", { class: "score lab-score" },
        h("div", {}, h("div", { class: "t" }, r.headline || ""), h("div", { class: "note" }, "Statuses: met, fails, too early. The scorecard never says more than this. Money criteria are after tax; B1 is before tax; C3 must pass on both lines."),
          h("div", { class: "pips lab-pips", "aria-hidden": "true" }, (r.criteria || []).map((c) => h("i", { class: c.status === "met" ? "on" : c.status === "fails" ? "off" : "" }))))),
        GROUPS.map(([g, label]) => [h("div", { class: "section-l" }, `${g} · ${label}`), h("div", {}, (r.criteria || []).filter((c) => c.id[0] === g).map(critRow))])],
      foot: "Criteria were fixed at registration; they may be made stricter (logged), never looser without a new season. Values show throughout, also while a status is too early." });
  const cWORD = card({ n: 2, code: "WORD", title: "What this means", badges: [badge("Fixed wording", "ref")],
      body: h("div", { class: "lab-word" },
        word("Headline", W.headline || r.headline),
        word("Too early", W.too_early),
        word("History", W.history),
        word("All met", W.all_met),
        word("Always shown", W.always),
        word("The expectation, stated at registration", W.expectation),
        !r.champion || !r.champion.id ? h("p", { class: "callout" }, "The champion is CASH, so the main book earns 0 and B1 and B2 cannot be met.") : null),
      foot: "These sentences are part of the registered scorecard and are shown exactly as registered." });

  /* ---------------- 3 TIME · 4 BAND */
  const tBox = h("div", { class: "chart fill" });
  const tp = r.t_path || [];
  const tb = tte.table || [], tb2 = Object.fromEntries((tte.table_t2 || []).map(([s, y]) => [s, y]));
  const yrs = (x) => (ok2(x) ? `${U.num(x, 1)} years` : "never at the current rate");
  const band = r.band || {};
  const cTIME = card({ n: 3, code: "TIME", title: "How long the evidence takes",
      body: [h("div", { class: "pair" },
        table({ caption: "Years to a t-statistic", cls: "compact", cols: [
          { key: "s", label: "Sharpe a year", num: true, fmt: (x) => U.num(x[0], 1) },
          { key: "y", label: "Years, t = 3", num: true, fmt: (x) => U.num(x[1], x[1] < 3 ? 2 : 0) },
          { key: "y2", label: "t = 2", num: true, title: "for reference only",  fmt: (x) => (tb2[x[0]] != null ? U.num(tb2[x[0]], tb2[x[0]] < 3 ? 2 : 0) : "—") }], rows: tb }),
        h("div", { class: "lab-lines" },
          ledger([
            { op: "", label: "History", small: `MAIN-HIST, alpha Sharpe ${U.num(tte.sharpe_hist_alpha, 2)}`, value: yrs(tte.years_to_t3_hist) },
            { op: "", label: "Live", small: tte.sharpe_live_alpha != null ? `alpha Sharpe ${U.num(tte.sharpe_live_alpha, 2)}, ${U.int(tte.live_sessions)} sessions` : "needs 60 live sessions", value: tte.sharpe_live_alpha != null ? yrs(tte.years_to_t3_live) : "—" },
            { op: "", label: "A1 earliest", small: "250 live sessions", value: U.d(tte.earliest_a1 || a1.earliest), cls: "total" }]),
          h("p", { class: "note" }, "For daily returns, t ≈ annual Sharpe × √years. More books do not shorten this: the scorecard judges one procedure, the main book."))),
        h("div", { class: "section-l" }, "Live alpha t of the main book, against sessions"),
        tp.length ? tBox : empty("Starts after 20 live sessions.")],
      foot: `The dashed line is this season's t = ${U.t3(tH)} hurdle (before tax); the dotted line projects today's t by √n at the current rate (arithmetic, not a forecast).` });
  const cBAND = card({ n: 4, code: "BAND", title: "Live against the backtest", span: 5,
      body: (band.live_mean || []).length ? [h("p", { class: "lede" }, "The main book's mean daily net return after n live sessions, inside the range its history implied (1–99% and 5–95% of a block bootstrap)."),
        U.svgBox(null, (w, H) => labFan(w, H, band), "lab-fill"),
        legend([{ c: "var(--s1)", style: "line", label: "Main book, live mean" }, { c: "var(--bench-1)", style: "box", label: "5–95%" }, { c: "var(--bench-3)", style: "box", label: "1–99%" }])]
        : empty("Starts after 20 live sessions."),
      foot: "Stop rule: after 60 live sessions, a live mean below the 5% line raises the stop flag (C1); below 1% the journal writes re-examine." });
  el.append(U.grid(cSCOR, h("div", { class: "span-5 lab-stack" }, cWORD, cTIME)));
  if (tp.length) {
    const last = tp[tp.length - 1], n0 = tte.live_sessions || tp.length;
    const proj = [];
    if (last[1] > 0 && n0 > 0) {
      const dt = new Date(`${last[0]}T12:00:00Z`);
      for (let k = 1, n = n0; k <= 520 && n < 1000; k++) {
        dt.setUTCDate(dt.getUTCDate() + 1);
        if (dt.getUTCDay() % 6 === 0) continue;
        n += 1;
        const tv = last[1] * Math.sqrt(n / n0);
        if (n % 5 === 0) proj.push([dt.toISOString().slice(0, 10), tv]);
        if (tv >= tH * 1.05) break;
      }
    }
    const first = tp[0][0], end = proj.length ? proj[proj.length - 1][0] : last[0];
    const res = U.lines(tBox, [
      { label: "Live alpha t", points: tp, style: "you", fmt: (x) => U.num(x, 2) },
      { label: `t = ${U.t3(tH)}`, points: [[first, tH], [end, tH]], style: "b1", tip: false },
      { label: "√n projection", points: proj.length ? [last, ...proj] : [], style: "b2", fmt: (x) => U.num(x, 2) }], { digits: 1 });
    if (res) tBox.after(U.legend([{ label: "Live alpha t", style: "you", value: U.num(last[1], 2) }, { label: `t = ${U.t3(tH)} hurdle`, style: "b1" }, { label: "√n projection at the current rate", style: "b2" }]));
  }

  /* ---------------- 5 DSR · 6 PBO */
  const ds = r.dsr || {}, pb = r.pbo || {}, rc = r.rc || {};
  const dsrRows = ds.rows || [];
  const cDSR = card({ n: 5, code: "DSR", title: "Deflated Sharpe", span: 7, flush: true,
      body: [U.pad(h("div", { class: "stats four" },
        stat(U.tl("Trials counted, N", "Every configuration ever tried on this price history. The more were tried, the higher the best one's result must be to count."), U.int(ds.n_trials), "from the trial ledger"),
        stat(U.tl("Effective trials", "Strategies that move together count as fewer independent tries."), U.num(ds.n_eff, 1), "correlated trials counted once"),
        stat(U.tl("Variance of Sharpes", "How much the strategies' results differ from one another; a wide spread makes a lucky best result likelier."), U.num(ds.v_daily, 4), "daily, across trials"),
        stat(U.tl("Noise bar, SR0", "The yearly Sharpe ratio the best of N strategies with no skill at all would be expected to show."), U.num(ds.sr0_ann, 2), "annual Sharpe the best noise trial would show")),
        ds.main ? h("p", { class: "lede" }, h("b", {}, "B3: "), `history and live joined (${U.int(ds.main.sessions)} sessions), DSR ${U.num(ds.main.dsr, 2)} against 0.95 needed.`) : null),
        ...U.showAll(dsrRows, U.phoneN(12), (list) => table({ caption: "Deflated Sharpe by book", cls: "compact", rowCls: (x) => (x.id === "MAIN-HIST" ? "you" : ""), cols: [
          { key: "id", label: "Book", fmt: (x) => h("span", { class: "tick" }, x.id) },
          { key: "s", label: "Sharpe, annual", num: true, fmt: (x) => (x.sharpe_ann == null ? U.na("no trades in the window") : U.snum(x.sharpe_ann, 2)) },
          { key: "T", label: "Sessions", num: true, fmt: (x) => U.int(x.T) },
          { key: "sk", label: U.tl("Skew", "Negative: losses come in rarer, larger lumps than gains. It lowers the deflated Sharpe."), sl: "Skew", num: true, hideSm: true, fmt: (x) => U.num(x.skew, 2) },
          { key: "ku", label: U.tl("Kurtosis", "How often extreme sessions happen; 3 is the normal curve. Fat tails lower the deflated Sharpe."), sl: "Kurtosis", num: true, hideSm: true, fmt: (x) => U.num(x.kurt, 1) },
          { key: "sr0", label: U.tl("SR0", "The noise bar for this book: the yearly Sharpe the best of N skill-free strategies would show."), sl: "SR0", num: true, hideSm: true, fmt: (x) => U.num(x.sr0_ann, 2) },
          { key: "dsr", label: U.tl("DSR", "Deflated Sharpe: the probability that the true Sharpe is above the noise bar SR0."), sl: "DSR", num: true, fmt: (x) => (x.dsr == null ? U.na("no trades in the window") : U.num(x.dsr, 2)) }], rows: list }), "books")],
      foot: "Validation window; sorted by book ID. DSR is the probability that the true Sharpe exceeds SR0, the bar a best-of-N noise strategy would clear. Today's index members (survivorship)." });
  const cPBO = card({ n: 6, code: "PBO", title: "Overfitting (PBO)", span: 7,
      body: [h("div", { class: "stats three" },
        stat(U.tl("PBO", "Probability of backtest overfitting: how often the strategy that led in one half of the history fell to the bottom half in the other."), U.num(pb.value, 2), `${pb.window || "validation"}`),
        stat("With live", U.num(pb.value_validation_live, 2), "B4 needs ≤ 0.05"),
        stat(U.tl("Splits", "Every way of cutting the history into 16 blocks and sharing them half and half between a learning and a testing side."), U.int(pb.splits), "ways to split the history in half")),
        h("div", { class: "section-l" }, U.gk("λ"), ": where the in-sample leader ranked out of sample"),
        (pb.logit_hist || []).length ? U.svgBox(null, (w, H) => labHist(w, H, pb.logit_hist), "lab-fill lab-hist") : empty("No splits yet."),
        h("dl", { class: "kv" }, h("dt", {}, "Slope, out-of-sample on in-sample"), h("dd", {}, U.snum(pb.slope, 2), ` · R² ${U.num(pb.r2, 2)}`),
          h("dt", {}, "Share of leaders negative out of sample"), h("dd", {}, U.pct(pb.p_oos_negative, 1))),
        pb.caveat ? h("p", { class: "note" }, prose(pb.caveat)) : null],
      foot: "PBO = the share of splits where the in-sample leader landed in the bottom half out of sample (λ ≤ 0). Never used alone." });
  el.append(U.grid(cBAND, cDSR));

  /* ---------------- 7 RC · 8 CALC */
  const ch = (r.champion || {}).id;
  const capRow = practice && (practice.capital || []).find((x) => x.id === ch);
  const eb = r.edge_bps || {};
  const calcBox = h("div");
  const amounts = [...new Set((r.costcalc || []).map((x) => x.amount))].sort((a, b) => a - b);
  const byKey = Object.fromEntries((r.costcalc || []).map((x) => [`${x.amount}|${x.n}`, x]));
  let grp = "FREE";
  const drawCalc = () => {
    const cell = (a, n, what) => { const x = byKey[`${a}|${n}`]; if (!x) return "—"; const txt = what === "rt" ? U.num(x.rt_bps[grp], 0) : U.pct(x.drag_pa_free, 0);
      return h("span", { class: x.below_min_ticket ? "lab-below" : "", "data-tip": `€${U.int(a)} in ${n} name${n > 1 ? "s" : ""}: ticket ${U.eur(x.ticket, 0)}${x.below_min_ticket ? " (below the €1,000 minimum ticket)" : ""}` }, txt, x.below_min_ticket ? "†" : ""); };
    calcBox.replaceChildren(table({ caption: "Round-trip cost and yearly drag by amount", cls: "compact",
      groups: [{ span: 1 }, { span: 3, label: `Round trip, bps · ${grp === "IT_FR" ? "IT and FR" : grp}` }, { span: 3, label: "Yearly drag, one round trip a session · FREE" }],
      cols: [{ key: "a", label: "Amount", num: true, fmt: (a) => U.eur(a, 0) },
        ...[1, 2, 3].map((n) => ({ key: `r${n}`, label: `${n} name${n > 1 ? "s" : ""}`, num: true, fmt: (a) => cell(a, n, "rt") })),
        ...[1, 2, 3].map((n) => ({ key: `d${n}`, label: `${n} name${n > 1 ? "s" : ""}`, num: true, fmt: (a) => cell(a, n, "drag") }))],
      rows: amounts }));
  };
  drawCalc();
  const cRC = card({ n: 7, code: "RC", title: "Reality Check", span: 5, badges: [badge("Information only", "ref")],
      body: [h("div", { class: "stats two" },
        stat("p-value", U.num(rc.p, 3), "share of resamples at least as good"),
        stat("Highest in the league", rc.best || "—", "the strategy tested"),
        stat("Resamples, B", U.int(rc.B), "bootstrap of validation returns"),
        stat("Statistic, V", U.num(rc.V, 3), "largest √T × mean net return")),
        h("div", { class: "section-l" }, "How p is found"),
        ledger([
          { op: "1", label: "V: the largest √T × mean return after tax", small: "among the 24 strategies, validation", value: U.num(rc.V, 3) },
          { op: "2", label: "Resample the sessions in blocks", small: "stationary bootstrap, mean block 10", value: `${U.int(rc.B)} times` },
          { op: "3", label: "Each time: the largest √T × (resampled − real mean)", small: "what luck alone produces", value: "V*" },
          { op: "=", label: "p: the share of V* at or above V", value: U.num(rc.p, 3), cls: "total" }]),
        h("p", { class: "lede" }, "The question: could the highest strategy in the league have done this well by luck, given how many were tried? A small p says luck is an unlikely explanation for the history. It is not a criterion: the deflated Sharpe (5 DSR) already counts every trial."),
        rc.note ? h("p", { class: "note" }, prose(rc.note)) : null],
      foot: ["Validation window. The test was implemented from its description in the literature; see ", link("Method › reading list", "#/lab/rules"), "."] });
  const cCALC = card({ n: 8, code: "CALC", title: "What a smaller amount would cost", span: 12,
      tools: [seg([["FREE", "No-tax names"], ["ES", "Spain"], ["IT_FR", "Italy, France"]], grp, (g) => { grp = g; drawCalc(); }, "Tax group"), h("span", { class: "grow" }), h("span", { class: "note" }, "† below the €1,000 minimum ticket")],
      body: [calcBox,
        h("div", { class: "two-col lab-two" },
          h("div", {}, h("div", { class: "section-l" }, `Edge per trade, champion's source (${eb.source || ch || "—"})`),
            ledger([
              { op: "", label: "Validation, before costs", value: U.bps(eb.validation) },
              { op: "−", label: "Validation, costs", value: U.bps(eb.validation_cost) },
              { op: "=", label: "Validation, net", value: ok2(eb.validation) && ok2(eb.validation_cost) ? h("span", { class: tone(eb.validation - eb.validation_cost) }, `${sign(eb.validation - eb.validation_cost, U.NF[1])} bps`) : "—", cls: "total" },
              { op: "", label: "Live, before costs", value: eb.live != null ? U.bps(eb.live) : "needs live trades" }]),
            capRow ? h("p", { class: "note" }, capRow.breakeven_eur != null ? `Capital drill (DR-CAP): break-even book for ${ch} ${U.eur(capRow.breakeven_eur, 0)}.` : `Capital drill (DR-CAP): no break-even inside the tested books (€1,000 to €25,000) for ${ch}.`) : null),
          h("div", {}, h("div", { class: "section-l" }, "The main book's tax ledger, by year"),
            ((r.tax || {}).by_year || []).length ? table({ caption: "Tax withheld by year", cls: "compact", cols: [
              { key: "y", label: "Year", fmt: (x) => String(x.year) },
              { key: "g", label: "Gains €", num: true, fmt: (x) => U.num(x.gains, 2) },
              { key: "l", label: "Losses €", num: true, fmt: (x) => U.snum(x.losses, 2) },
              { key: "u", label: "Credits used €", num: true, fmt: (x) => U.num(x.credits_used, 2) },
              { key: "t", label: "Withheld €", num: true, fmt: (x) => U.num(x.withheld, 2) }], rows: r.tax.by_year }) : h("p", { class: "note" }, "No paper sale yet."),
            h("p", { class: "note" }, "26% withheld at each paper sale; losses become credits for the same year and the next four; nothing is refunded.")))],
      foot: "Arithmetic on the fee schedule, not a suggestion of any amount. Round trip = 2 × €1 ÷ ticket + 2 × 0.05% + any tax; drag = round trip × 252 sessions." });
  el.append(U.grid(cPBO, cRC), U.grid(cCALC));

  /* ---------------- 9 PREG */
  const rc2 = Object.fromEntries((((rules || {}).scorecard || {}).criteria || []).map((c) => [c.id, c]));
  el.append(U.grid(card({ n: 9, code: "PREG", title: "What was registered", span: 12, flush: true,
    body: [U.pad(h("dl", { class: "kv lab-preg" },
      h("div", {}, h("dt", {}, "Season"), h("dd", {}, sc.season || "—")), h("div", {}, h("dt", {}, "Registered on"), h("dd", {}, U.d(sc.registered_on))),
      h("div", {}, h("dt", {}, "Changes since"), h("dd", {}, U.int(sc.changes))), h("div", {}, h("dt", {}, "Applies to"), h("dd", {}, sc.applies_to || "—")),
      h("div", { class: "wide" }, h("dt", {}, "SHA-256 of scorecard.json"), h("dd", { class: "lab-hash" }, sc.sha256 || "—")))),
      table({ caption: "Registered criteria", cls: "compact", stack: true, cols: [
        { key: "id", label: "ID", fmt: (c) => h("span", { class: "tick" }, c.id) },
        { key: "code", label: "Code", fmt: (c) => h("span", { class: "mono" }, c.code) },
        { key: "title", label: "Criterion", lead: true, fmt: (c) => h("span", { class: "nm" }, c.title) },
        { key: "rule", label: "Threshold", wide: true, fmt: (c) => h("span", { class: "lab-wrap" }, c.rule) },
        { key: "te", label: "Too early while", wide: true, fmt: (c) => { const x = rc2[c.id] || {}; return c.id === "A1" ? "below either" : c.id === "B1" ? "A1 not met" : c.id === "B5" ? "drills not finished" : c.id === "C2" ? `< ${x.min_quote_sessions || 60} quote sessions` : x.too_early_below ? `< ${x.too_early_below} live sessions` : "never"; } },
        { key: "st", label: "Status now", fmt: (c) => U.status(c.status) }], rows: r.criteria || [] })],
    foot: "The hash covers the registered file; any loosening would be a new season that restarts the live clock and raises B1's bar (3.000 in season 1, 3.205 in season 2, then 3.32 and 3.40)." })));
};

/* the fan of BAND: horizon n on x, mean daily net return on y (%), bands grey, live mean cyan */
function labFan(w, H, b) {
  const U = LabUI, pad = { l: 52, r: 10, t: 10, b: 24 };
  const n = (b.horizon || []).length, live = b.live_mean || [];
  const lastN = Math.max(live.length, 20);
  const N = Math.min(n, Math.max(lastN + 10, 30));
  const idx = [...Array(N).keys()];
  const vals = ["p01", "p05", "p95", "p99"].flatMap((k) => (b[k] || []).slice(0, N)).concat(live).filter(Number.isFinite);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const x = U.lin(1, N, pad.l, w - pad.r), y = U.lin(lo, hi, H - pad.b, pad.t);
  const area = (a, bb) => `M${idx.map((i) => `${x(i + 1).toFixed(1)},${y(b[a][i]).toFixed(1)}`).join("L")}L${idx.slice().reverse().map((i) => `${x(i + 1).toFixed(1)},${y(b[bb][i]).toFixed(1)}`).join("L")}Z`;
  const tk = U.ticks(lo, hi, 4), xt = U.ticks(1, N, w < 420 ? 4 : 6).filter((v) => v >= 1);
  return U.svg(w, H, `Band of the main book's mean daily net return over ${N} sessions; live mean after ${live.length} sessions ${sign(live[live.length - 1], fmt.p2)}`,
    tk.map((v) => [h("line", { x1: pad.l, x2: w - pad.r, y1: y(v), y2: y(v), class: v === 0 ? "zero" : "grid" }), U.t(pad.l - 6, y(v) + 4, sign(v, fmt.p1), { class: "ax", "text-anchor": "end" })]),
    xt.map((v) => U.t(x(v), H - 6, String(v), { class: "ax", "text-anchor": "middle" })),
    U.t(w - pad.r, H - 6, "sessions", { class: "ax", "text-anchor": "end", dy: "-12" }),
    h("path", { d: area("p01", "p99"), class: "fan1" }), h("path", { d: area("p05", "p95"), class: "fan2" }),
    h("polyline", { points: live.slice(0, N).map((v, i) => `${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join(" "), class: "youl" }),
    live.length ? h("circle", { cx: x(Math.min(live.length, N)), cy: y(live[Math.min(live.length, N) - 1]), r: 3.5, class: "youdot", "data-tip": `After ${live.length} sessions: ${sign(live[live.length - 1], fmt.p2)} a session` }) : null);
}
/* the λ histogram of PBO: bars at or below zero count toward PBO */
function labHist(w, H, hist) {
  const U = LabUI, pad = { l: 40, r: 8, t: 8, b: 24 };
  const xs = hist.map((x) => x[0]), step = xs.length > 1 ? Math.min(...xs.slice(1).map((v, i) => v - xs[i])) : 1;
  const lo = Math.min(...xs) - step / 2, hi = Math.max(...xs) + step / 2, top = Math.max(...hist.map((x) => x[1]), 1);
  const x = U.lin(lo, hi, pad.l, w - pad.r), y = U.lin(0, top, H - pad.b, pad.t);
  const bw = Math.max(2, x(lo + step) - x(lo) - 2);
  return U.svg(w, H, "Histogram of λ across CSCV splits",
    U.ticks(0, top, 3).map((v) => [h("line", { x1: pad.l, x2: w - pad.r, y1: y(v), y2: y(v), class: "grid" }), U.t(pad.l - 6, y(v) + 4, U.int(v), { class: "ax", "text-anchor": "end" })]),
    hist.map(([c, n]) => h("rect", { x: x(c) - bw / 2, y: y(n), width: bw, height: Math.max(0, y(0) - y(n)), class: c <= 0 ? "neg" : "pos", "data-tip": `λ ${sign(c, U.NF[1])}: ${U.int(n)} splits${c <= 0 ? " (count toward PBO)" : ""}` })),
    h("line", { x1: x(0) + (hist.some((q) => q[0] === 0) ? bw / 2 + 1 : 0), x2: x(0) + (hist.some((q) => q[0] === 0) ? bw / 2 + 1 : 0), y1: pad.t, y2: H - pad.b, class: "zero" }),
    xs.filter((v, i) => i % Math.ceil(xs.length / 7) === 0).map((v) => U.t(x(v), H - 6, sign(v, U.NF[1]), { class: "ax", "text-anchor": "middle" })));
}

/* ================================================================ JOURNAL */
LabViews.journal = async (el, ctx, wait) => {
  const U = LabUI, { sum, params } = ctx;
  el.append(...ctx.head(), wait);
  const state = { month: params.get("month") || "", tag: params.get("tag") || "", book: params.get("book") || "" };
  const jurl = () => `/api/lab/journal?${new URLSearchParams(Object.entries(state).filter(([, v]) => v))}`;
  let j, rules, fb;
  try { [j, rules, fb] = await Promise.all([U.get(jurl()), U.get("/api/lab/rules", 600_000).catch(() => null), U.get("/api/lab/book?id=MAIN&window=live").catch(() => null)]); }
  catch (e) { if (!ctx.alive()) return; wait.remove(); el.append(U.errorCard(`The journal could not load: ${e.message}`)); return; }
  if (!ctx.alive()) return;
  wait.remove();
  if (j.state === "not_started") { el.replaceChildren(); labGate(el, "journal", j); return; }
  const k = j.kpi || {};
  state.month = j.month || state.month;
  el.append(U.kpis(sum, [
    { label: "Sessions journaled", tier: "hero", value: U.int(k.sessions_journaled), detail: h("span", { class: "muted" }, "live and catch-up, plus one entry per history month") },
    { label: "Catch-up share", tier: "major", value: U.pct(k.catchup_share, 1), detail: h("span", { class: "muted" }, "sessions committed after 22:30 the next day") },
    { label: "Corrections", tier: "major", value: U.int(k.corrections), detail: h("span", { class: "muted" }, "appended, never rewritten") },
    { label: "Last entry", value: U.d(k.last_entry), detail: h("span", { class: "muted" }, (j.entries || [])[0] ? `settled ${U.hm(j.entries[0].at)}` : "") },
    { label: "Months on file", value: U.int((j.months || []).length), detail: h("span", { class: "muted" }, (j.months || []).length ? `${month(j.months[j.months.length - 1])} → ${month(j.months[0])}` : "") },
    { label: "Runs logged", value: U.int((j.runs || []).length), detail: h("span", { class: "muted" }, `${U.int((j.runs || []).filter((x) => x.ok === false).length)} failed`) },
  ]));

  /* ---------------- 1 LOG · 2 CAL */
  const TY = { DECIDE: "reg", CHAMP: "reg", LEARN: "sys", LESSON: "sys", CORRECTION: "warn" };
  const logBody = h("div", { class: "lab-jlog" });
  const monthSel = h("select", { "aria-label": "Month" }, (j.months || []).map((m) => h("option", { value: m, selected: m === state.month ? true : null }, month(m))));
  const chipsBox = h("div", { class: "chips" });
  const drawChips = () => chipsBox.replaceChildren(chip("All tags", null, !state.tag, () => { state.tag = ""; refresh(); }),
    ...(j.tags || []).map((t) => chip(t, null, state.tag === t, () => { state.tag = state.tag === t ? "" : t; refresh(); })));
  const bookSeg = seg([["", "All books"], ["MAIN", "Main book"]], state.book, (b) => { state.book = b; refresh(); }, "Book");
  const drawEntries = (jj) => {
    const es = jj.entries || [];
    if (!es.length) { logBody.replaceChildren(empty(state.tag || state.book ? "No journal line matches these filters in this month." : "The journal starts with the first settled session.")); return; }
    /* a history month appears once per season (season 1's archived run, season 2's): each says which */
    const seasonOf = (e) => (e.lines || []).map((l) => l.season).find(Boolean) || (e.mode === "history" ? sum.previous_season : null);
    const SEASON = (s) => (s === sum.season ? `Season ${String(s).slice(1)}` : `Season ${String(s).slice(1)} archive`);
    const one = (e) => h("details", { class: "lab-sess", open: es.indexOf(e) === 0 ? true : null },
      h("summary", {}, h("span", { class: "dt" }, e.window && e.mode === "history" ? month(e.session.slice(0, 7)) : U.d(e.session)), U.mode(e.mode),
        e.mode === "history" && seasonOf(e) ? badge(SEASON(seasonOf(e)), seasonOf(e) === sum.season ? "ref" : "na") : null, e.partial ? badge("Partial", "warn") : null,
        h("span", { class: "grow" }), h("span", { class: "note" }, U.plural((e.lines || []).length, "line")),
        h("span", { class: "num" }, e.net_main != null ? ["main book ", signed(e.net_main, fmt.p2)] : "")),
      h("div", { class: "journal lab-log" }, (e.lines || []).map((l) => h("div", { class: "log" }, h("span", { class: `ty ${TY[l.tag] || ""}` }, l.tag),
        h("span", { class: "tx" }, prose(l.text), l.book && l.book !== "MAIN" ? h("span", { class: "sub" }, ` · ${l.book}`) : null)))),
      e.mode !== "history" ? h("div", { class: "lab-sess-f" }, link(`Open the desk as of ${U.ds(e.session)}`, `#/lab/desk?session=${e.session}`)) : null);
    logBody.replaceChildren(...U.showAll(es, 5, (list) => h("div", { class: "lab-sessions" }, list.map(one)), "sessions"));
  };
  const refresh = async () => {
    drawChips();
    logBody.replaceChildren(skeleton(200));
    try { const jj = await U.get(jurl()); if (!el.isConnected) return; drawEntries(jj); }
    catch (e) { logBody.replaceChildren(empty(`Could not load: ${e.message}`)); }
  };
  monthSel.addEventListener("change", () => { state.month = monthSel.value; refresh(); });
  drawChips(); drawEntries(j);
  const cal = j.calendar || [];
  el.append(U.grid(
    card({ n: 1, code: "LOG", title: "Session journal", span: 8,
      tools: [h("label", { class: "field lab-inline" }, h("span", {}, "Month"), monthSel), bookSeg, chipsBox],
      body: logBody,
      foot: "One tag per line, written from fixed templates after each step. History months carry one fact-only entry; per-session history stays in the backtest." }),
    card({ n: 2, code: "CAL", title: "Session calendar", span: 4,
      body: cal.length ? labCalendar(cal) : empty("No live session yet."),
      foot: "Main book's net return by live session, in percent after costs. Hatched: catch-up or partial sessions. Select a day to open its desk as it was that night." })));

  /* ---------------- 3 FILL */
  const ids = ["MAIN", "MAIN-X", ...(((rules || {}).league) || []).map((x) => x.id)];
  let bookId = "MAIN";
  const fillBody = h("div");
  const drawFills = (bk) => {
    const fl = [...((bk && bk.fills) || [])].reverse();
    if (!fl.length) { fillBody.replaceChildren(U.pad(empty("No fills yet."))); return; }
    fillBody.replaceChildren(...U.showAll(fl, 15, (list) => table({ caption: "Fill blotter", cls: "compact", stack: true, rows: list, cols: [
      { key: "s", label: "Session", fmt: (f) => U.ds(f.session) },
      { key: "b", label: "Book", hideSm: true, fmt: (f) => h("span", { class: "tick" }, f.book || bookId) },
      { key: "side", label: "Side", fmt: (f) => badge(f.side === "buy" ? "Entry" : "Exit", f.side === "buy" ? "paper" : "") },
      { key: "n", label: "Name", lead: true, fmt: (f) => [h("span", { class: "nm" }, f.name || f.isin), h("span", { class: "sub" }, f.isin)] },
      { key: "sh", label: "Shares", num: true, fmt: (f) => U.int(f.shares) },
      { key: "mid", label: "Mid €", num: true, fmt: (f) => U.px(f.mid) },
      { key: "fill", label: "Fill €", num: true, fmt: (f) => U.px(f.fill) },
      { key: "fee", label: "Fee €", num: true, fmt: (f) => U.num(f.fee) },
      { key: "sp", label: "Spread €", num: true, fmt: (f) => U.num(f.spread) },
      { key: "ftt", label: "FTT €", num: true, fmt: (f) => U.num(f.ftt) },
      { key: "src", label: "Fill source", fmt: (f) => h("span", { class: "dim" }, f.source || "—") },
      { key: "r", label: "Reason", hideSm: true, fmt: (f) => h("span", { class: "dim" }, prose(f.reason || "")) }] }), "fills"));
  };
  drawFills(fb);
  const bookPick = h("select", { "aria-label": "Book" }, [...new Set(ids)].map((id) => h("option", { value: id }, U.NAME[id] ? `${id} · ${U.NAME[id]}` : id)));
  bookPick.addEventListener("change", async () => {
    bookId = bookPick.value;
    fillBody.replaceChildren(U.pad(skeleton(160)));
    try { drawFills(await U.get(`/api/lab/book?id=${encodeURIComponent(bookId)}&window=live`)); } catch (e) { fillBody.replaceChildren(U.pad(empty(/404/.test(e.message) ? `No book with ID ${bookId}.` : `Could not load: ${e.message}`))); }
  });
  el.append(U.grid(card({ n: 3, code: "FILL", title: "Fill blotter", span: 12, flush: true,
    tools: [h("label", { class: "field lab-inline" }, h("span", {}, "Book"), bookPick), h("span", { class: "grow" }), h("span", { class: "note" }, "Every live paper fill of the chosen book, newest first (last 500)")],
    body: fillBody,
    foot: "Fill = session-end mid ± 0.05% (assumed) for every book; the hand-execution shadow MAIN-X uses the 22:50 bid or ask when recorded (source: measured), else modelled." })));

  /* ---------------- 4 RUNS */
  const runs = j.runs || [];
  el.append(U.grid(card({ n: 4, code: "RUNS", title: "Run log", span: 12, flush: true,
    body: runs.length ? U.showAll(runs, 12, (list) => table({ caption: "Run log", cls: "compact", stack: true, rows: list, cols: [
      { key: "st", label: "Started", lead: true, fmt: (x) => U.when(x.started) },
      { key: "en", label: "Ended", fmt: (x) => U.when(x.ended) },
      { key: "k", label: "Kind", fmt: (x) => h("span", { class: "mono" }, x.kind || "—") },
      { key: "s", label: "Sessions", fmt: (x) => (x.sessions || []).map(U.ds).join(", ") || "—" },
      { key: "rq", label: "Requests", num: true, fmt: (x) => U.int(x.requests) },
      { key: "sec", label: "Seconds", num: true, fmt: (x) => U.num(x.secs, 1) },
      { key: "ok", label: "Result", fmt: (x) => (x.ok === false ? badge("Error", "bad") : badge("OK", "ok")) },
      { key: "er", label: "Error or reason", hideSm: true, fmt: (x) => h("span", { class: "dim" }, prose(x.error || x.reason || "")) }] }), "runs") : U.pad(empty("No runs yet.")),
    foot: "Requests to Lang & Schwarz go through the lab's governor: at least 1.5 s apart, at most 400 a day. Details on Data quality, the request budget." })));
};

/* the session calendar: weeks as columns, Monday–Friday as rows; colour steps by the size of the move, sign in the tooltip */
function labCalendar(cal) {
  const U = LabUI;
  const byDate = new Map(cal.map((c) => [c.session, c]));
  const dates = cal.map((c) => c.session).sort();
  const start = new Date(`${dates[0]}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const end = new Date(`${dates[dates.length - 1]}T12:00:00Z`);
  const weeks = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 7)) weeks.push(new Date(d));
  const step = (x) => { const a = Math.abs(x || 0); return a < 0.0025 ? 1 : a < 0.01 ? 2 : a < 0.025 ? 3 : 4; };
  const up = cal.filter((c) => (c.net_main || 0) > 0.00005).length, dn = cal.filter((c) => (c.net_main || 0) < -0.00005).length;
  const nets = cal.map((c) => c.net_main).filter(Number.isFinite);
  const best = cal.reduce((a, c) => (c.net_main > (a ? a.net_main : -Infinity) ? c : a), null), worst = cal.reduce((a, c) => (c.net_main < (a ? a.net_main : Infinity) ? c : a), null);
  const mm = new Map();
  cal.forEach((c) => { const k = c.session.slice(0, 7); const x = mm.get(k) || { m: k, n: 0, up: 0, dn: 0, cu: 0, g: 1 }; x.n += 1; x.up += (c.net_main || 0) > 0.00005 ? 1 : 0; x.dn += (c.net_main || 0) < -0.00005 ? 1 : 0; x.cu += c.mode === "catchup" || c.partial ? 1 : 0; x.g *= 1 + (c.net_main || 0); mm.set(k, x); });
  const byMonth = [...mm.values()].map((x) => ({ ...x, r: x.g - 1 })).reverse();
  const shown = weeks.slice(-26);
  const cell = (w, di) => {
    const d = new Date(w); d.setUTCDate(d.getUTCDate() + di);
    const ds = d.toISOString().slice(0, 10), c = byDate.get(ds);
    if (!c) return h("span", { class: "x" });
    const cls = `${c.net_main > 0.00005 ? "u" : c.net_main < -0.00005 ? "d" : "f"}${step(c.net_main)}${c.mode === "catchup" || c.partial ? " hatch" : ""}`;
    return h("a", { class: `c ${cls}`, href: `#/lab/desk?session=${ds}`, "data-tip": `${day(ds)} · main book ${sign(c.net_main, fmt.p2)}${c.mode === "catchup" ? " · catch-up" : ""}${c.partial ? " · partial" : ""}`, "aria-label": `${day(ds)}: ${sign(c.net_main, fmt.p2)}` },
      Math.abs(c.net_main || 0) < 0.00005 ? "0.0" : sign(c.net_main, U.PF[1]).replace("%", ""));
  };
  return [h("div", { class: "lab-cal", role: "grid", "aria-label": "Main book net return by session, in percent" },
    h("span", { class: "c0" }, "Week of"), ["Mon", "Tue", "Wed", "Thu", "Fri"].map((x) => h("span", { class: "dn" }, x)),
    shown.map((w) => [h("span", { class: "wk" }, dayShort(w.toISOString())), [0, 1, 2, 3, 4].map((di) => cell(w, di))])),
    weeks.length > shown.length ? h("p", { class: "note" }, `The last 26 weeks; earlier sessions are in the month table below.`) : null,
    h("div", { class: "lab-cal-key" }, h("span", {}, "Down"), [4, 3, 2, 1].map((s) => h("i", { class: `d${s}` })), h("i", { class: "f1" }), [1, 2, 3, 4].map((s) => h("i", { class: `u${s}` })), h("span", {}, "Up"), h("span", { class: "grow" }), h("span", {}, "% a session · steps 0.25, 1, 2.5")),
    h("div", { class: "stats two" },
      stat("Sessions", U.int(cal.length), `${U.int(up)} up · ${U.int(dn)} down · ${U.int(cal.length - up - dn)} flat`),
      stat("Median session", nets.length ? signed([...nets].sort((a, b) => a - b)[Math.floor(nets.length / 2)], fmt.p2) : "—", "main book, net"),
      stat("Highest", best ? signed(best.net_main, fmt.p2) : "—", best ? U.d(best.session) : ""),
      stat("Lowest", worst ? signed(worst.net_main, fmt.p2) : "—", worst ? U.d(worst.session) : "")),
    h("div", { class: "section-l" }, "By month, main book"),
    table({ caption: "Main book by month", cls: "compact", rows: byMonth, cols: [
      { key: "m", label: "Month", fmt: (x) => month(x.m) },
      { key: "n", label: "Sessions", num: true, fmt: (x) => U.int(x.n) },
      { key: "u", label: "Up · down", num: true, fmt: (x) => `${U.int(x.up)} · ${U.int(x.dn)}` },
      { key: "c", label: "Catch-up", num: true, fmt: (x) => U.int(x.cu) },
      { key: "r", label: "Net, compounded", num: true, fmt: (x) => signed(x.r, fmt.p2) }] })];
}
