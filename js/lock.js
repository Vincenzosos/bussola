"use strict";
/* SV Terminal · public snapshot, part 2 of 2: the lock screen, the snapshot status, the public header and the public
   disclaimer. publish.py loads this file after the page files and before main.js on the published site only.
   - My Portfolio (Overview, Portfolio, Explore) and Alerts are the owner's real money and personal data. They render
     only after the 6-digit code opens data/locked.bin in this tab (static.js, BussolaCrypto). The derived key, never
     the code, is kept in sessionStorage, which the browser forgets when the tab closes.
   - The Trading Lab is public: paper money only.
   - There is no live stream: the top bar says when the snapshot was taken, the status bar SNAPSHOT. */
(() => {
  const S = window.BussolaStatic;
  if (!S) return;
  const C = window.BussolaCrypto;
  const LOCKED = ["home", "portfolio", "explore", "alerts"];
  const STORE = "bussola-snapshot-key";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------------------------------------------------------------- snapshot time and status */
  const ROME = { timeZone: "Europe/Rome", hourCycle: "h23" };
  S.when = (short = false) => {
    const iso = S.index && S.index.built;
    if (!iso) return "time unknown";
    const d = new Date(iso);
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { ...ROME, day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
    return short ? `${+p.day} ${MONTHS[+p.month - 1]} ${p.hour}:${p.minute}` : `${+p.day} ${MONTHS[+p.month - 1]} ${p.year} ${p.hour}:${p.minute} Rome`;
  };
  Live.connect = () => {};                          // no stream in a snapshot
  Live.status = { mode: "snapshot" };
  renderLive = function () {                        // core.js's renderLive, in snapshot words
    const el = $("live");
    if (!el) return;
    const t = S.when();
    el.classList.remove("on", "slow", "off");
    el.classList.add("snap");
    el.querySelector("span").textContent = "SNAPSHOT";
    el.title = `Public snapshot, updated ${t}. Prices are as of then; nothing here is live.`;
    const sb = $("sb-conn");
    if (sb) {                                       /* the long form on a desktop, the short one on a phone (static.css) */
      sb.className = "conn snap";
      sb.replaceChildren(h("span", { class: "lg" }, `◆ SNAPSHOT · updated ${t}`), h("span", { class: "sm" }, `◆ SNAPSHOT ${S.when(true)}`));
      sb.title = el.title;
    }
  };
  S.ready.then(() => renderLive());

  /* ---------------------------------------------------------------- the private bundle */
  let bundle = null;
  S.bundle = () => (bundle = bundle || fetch("data/locked.bin", { cache: "no-cache" }).then((r) => {
    if (!r.ok) throw Object.assign(new Error(r.status === 404 ? "This snapshot has no My Portfolio section." : `data/locked.bin: HTTP ${r.status}`), { missing: true });
    return r.arrayBuffer();
  }).catch((e) => { bundle = null; throw e; }));
  const remember = async (key, header) => {
    try { sessionStorage.setItem(STORE, JSON.stringify({ k: await C.exportKey(key), salt: C.b64(header.salt) })); } catch (_) { /* private window: ask again next load */ }
  };
  const forget = () => { try { sessionStorage.removeItem(STORE); } catch (_) { /* nothing stored */ } };
  S.unlock = async (code) => {
    const { data, key, header } = await C.open(await S.bundle(), code);
    S.setPrivate(data);
    await remember(key, header);
    afterUnlock();
  };
  /* a key kept by this tab opens the bundle without the code (same snapshot salt) */
  let tried = false;
  S.tryStored = async () => {
    if (S.unlocked) return true;
    if (tried) return false;
    tried = true;
    let st = null;
    try { st = JSON.parse(sessionStorage.getItem(STORE) || "null"); } catch (_) { st = null; }
    if (!st || !st.k) return false;
    try {
      const h = C.parseHeader(await S.bundle());
      if (C.b64(h.salt) !== st.salt) { forget(); return false; }
      S.setPrivate(await C.openWithKey(await C.importKey(st.k), h));
      afterUnlock(false);
      return true;
    } catch (_) { forget(); return false; }
  };
  /* locking again forgets the key and reloads the tab: the pages keep answers in their own memory (fund lists, the
     inbox badge, charts), and a reload is the one way to drop all of it */
  S.lock = () => {
    forget();
    S.priv = null; S.unlocked = false; tried = true;
    location.reload();
  };
  /* the market board (MKTS tape) is private: its strip stays hidden until the code opens the bundle */
  document.body.classList.add("pub-no-tape");
  function afterUnlock(rerender = true) {
    lockBtn.hidden = false;
    Object.keys(memo).forEach((k) => delete memo[k]);       // drop the "locked" answers cached before
    document.body.classList.remove("pub-no-tape");
    if (typeof pollInbox === "function") pollInbox();
    if (typeof loadFunds === "function") loadFunds();
    if (typeof loadTape === "function") loadTape();
    if (rerender) Router.render();
  }
  /* a "lock again" key in the top bar, shown while unlocked */
  const lockIcon = (size, sw = "1.8", cls = null) => h("svg", { class: cls, viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor", "stroke-width": sw, "stroke-linecap": "round", "aria-hidden": "true" },
    h("rect", { x: 5, y: 11, width: 14, height: 10, rx: 1 }), h("path", { d: "M8 11V8a4 4 0 0 1 8 0v3" }));
  const lockBtn = h("button", { class: "icon-btn pub-lock", type: "button", id: "pub-lock", hidden: true, title: "Lock My Portfolio again",
    "aria-label": "Lock My Portfolio again", onclick: () => S.lock() }, lockIcon(16));
  const right = document.querySelector(".top-right");
  if (right) right.insertBefore(lockBtn, $("theme-toggle"));

  /* ---------------------------------------------------------------- the public header
     body.pub (static.css): no sub-tab codes, no F-key row or command line on a phone. The switch says which side is
     private; the top bar shows when the snapshot was taken instead of a ticking clock; the status bar shows the lab's
     own clock (the L&S session end) instead of three exchange clocks. */
  document.body.classList.add("pub");
  const modeBtn = (m) => document.querySelector(`#mode button[data-mode="${m}"]`);
  const inv = modeBtn("invest"), trd = modeBtn("trade");
  if (inv) {
    inv.querySelector("b").append(lockIcon(11, "2.4", "pub-lk"));
    inv.querySelector("small").textContent = "private · owner's code";
    inv.setAttribute("aria-label", "My Portfolio: private, opens with the owner's code");
  }
  if (trd) trd.querySelector("small").textContent = "paper money · public";
  const clockEl = $("clock");
  if (clockEl) {
    clockEl.replaceChildren(h("span", { id: "pub-updated" }, "Updated"), h("small", {}, "Rome"));
    clockEl.title = "When this public snapshot was taken (Rome time). Nothing on this site is live.";
    S.ready.then(() => { const u = $("pub-updated"); if (u) u.textContent = `Updated ${S.when(true)}`; });
  }
  const sbar = $("statusbar");
  if (sbar) {
    sbar.querySelectorAll(".mk").forEach((x) => x.remove());
    const next = h("span", { class: "nx" });
    sbar.prepend(h("span", { class: "pub-sess", title: "The lab settles after the Lang & Schwarz session end, about 23:00 Berlin, on L&S trading days" },
      h("b", {}, "L&S"), h("span", {}, "session end ≈23:00 Berlin"), next));
    S.ready.then(() => fetch("/api/lab/summary")).then((r) => r.json()).then((s) => {
      const ev = (((s || {}).next_events || {}).events || []).find((e) => Date.parse(e.at) > Date.now());
      if (ev && typeof LabUI !== "undefined") next.textContent = `· next lab step ${LabUI.relIn(ev.at)}`;
    }).catch(() => {});
  }

  /* ---------------------------------------------------------------- the lock screen */
  const WHAT = {
    home: "Overview: the owner's real portfolio value today, the value chart, what moved it, the briefing and headlines.",
    portfolio: "Portfolio: holdings, look-through, performance, risk, costs and Italian tax.",
    explore: "Explore: the fund screener, the switch tracker and comparisons against the holdings.",
    alerts: "Alerts: the daily briefing inbox and personal price rules.",
  };
  function lockScreen(el, id) {
    const cells = h("div", { class: "pub-cells", "aria-hidden": "true" }, [0, 1, 2, 3, 4, 5].map(() => h("span", {})));
    const input = h("input", { id: "pub-code", class: "pub-code", type: "password", inputmode: "numeric", pattern: "[0-9]*", maxlength: "6",
      autocomplete: "off", autocapitalize: "off", spellcheck: "false", "aria-label": "Six-digit code", "aria-describedby": "pub-msg" });
    const btn = h("button", { class: "btn", type: "submit", id: "pub-go" }, "Unlock");
    const sizeEl = h("span", {}, "data/locked.bin");
    S.bundle().then((b) => { sizeEl.textContent = `locked.bin · ${fmt.n0.format(Math.ceil(b.byteLength / 1024))} KB`; })   // fetched now: the unlock is quicker
      .catch((e) => { sizeEl.textContent = e.missing ? "not in this snapshot" : "not loaded"; });
    const msg = h("p", { class: "pub-msg", id: "pub-msg", role: "status", "aria-live": "polite" }, "Six digits. Nothing is sent anywhere: the code opens the file here, in this tab.");
    const paint = () => {
      const v = input.value;
      [...cells.children].forEach((c, i) => { c.textContent = i < v.length ? "●" : ""; c.className = i < v.length ? "on" : i === v.length ? "cur" : ""; });
    };
    input.addEventListener("input", () => {
      const clean = input.value.replace(/\D/g, "").slice(0, 6);
      if (clean !== input.value) input.value = clean;
      paint();
      msg.className = "pub-msg";
    });
    const form = h("form", { class: "pub-form", autocomplete: "off", onsubmit: async (e) => {
      e.preventDefault();
      const code = input.value;
      if (!/^\d{6}$/.test(code)) { msg.className = "pub-msg bad"; msg.textContent = "The code has six digits."; input.focus(); return; }
      input.disabled = true; btn.disabled = true;
      msg.className = "pub-msg busy"; msg.textContent = "Checking the code (600,000 rounds of PBKDF2)…";
      try {
        await S.unlock(code);
      } catch (err) {
        await sleep(1200);                          // a short pause after every failed try
        input.disabled = false; btn.disabled = false;
        input.value = ""; paint();
        msg.className = "pub-msg bad";
        msg.textContent = err && err.missing ? err.message : "Wrong code";
        input.focus();
      }
    } },
    h("label", { class: "pub-field", for: "pub-code" }, h("span", { class: "prompt" }, "CODE ›"), h("span", { class: "pub-box" }, input, cells)), btn);
    /* the lock says "private by design" first and points to the public part; how the lock works is one click away */
    el.append(
      pageHead(id === "alerts" ? ["Alerts", "private"] : ["My Portfolio", "private"], id === "alerts"
        ? "The owner's briefing inbox and price rules. Private by design: published only encrypted, it opens with the owner's code."
        : "The owner's real portfolio. Private by design: it is published only encrypted and opens with the owner's code."),
      h("div", { class: "grid pub-lock-grid" },
        card({ n: 1, code: "LOCK", title: "Private section", span: 7, badges: badge("Encrypted", "ref"),
          body: [h("div", { class: "pub-actions pub-first" }, h("a", { class: "btn primary", href: "#/lab/overview" }, "Open the Trading Lab (public)"),
              h("span", { class: "note" }, "No code needed: paper money only.")),
            h("div", { class: "section-l" }, "The owner's code"),
            form, msg,
            h("details", { class: "pub-how" }, h("summary", {}, "How the lock works"), ledger([
              { op: "", label: "File", small: "My Portfolio and Alerts, one file", value: sizeEl },
              { op: "", label: "Cipher", small: "authenticated: a wrong code cannot open it", value: "AES-256-GCM" },
              { op: "", label: "Key", small: "derived from the code in your browser", value: "PBKDF2-SHA-256 · 600,000" },
              { op: "", label: "Salt · IV", small: "random; a new IV for every snapshot", value: "16 · 12 bytes" },
              { op: "", label: "Kept for", small: "the key only, in sessionStorage", value: "this tab" },
              { op: "=", label: "Sent to a server", small: "the code and the data never leave the page", value: "nothing", cls: "result" }]))],
          foot: ["Wrong codes wait a moment before the next try. The public part needs no code: ", link("Trading Lab (F4)", "#/lab/overview"), "."] }),
        card({ n: 2, code: "WHAT", title: "Behind the lock", span: 5,
          body: [h("ul", { class: "pub-what" }, LOCKED.map((p) => h("li", { class: p === id ? "cur" : null }, h("span", { class: "k" }, (NAV.find((n) => n.id === p) || {}).key || ""), WHAT[p]))),
            h("div", { class: "callout" }, h("b", {}, "Public, no code: "), "the Trading Lab. Paper money only, an educational exercise; nothing in it is advice.")],
          foot: `Snapshot of ${S.when()}.` })));
    paint();
    setTimeout(() => { if (input.isConnected && !matchMedia("(pointer: coarse)").matches) input.focus(); }, 60);
    statusSource("Encrypted section · public snapshot");
  }
  for (const id of LOCKED) {
    const p = Pages[id];
    if (!p) continue;
    const real = p.render;
    p.render = async function (el, sub, params) {
      await S.ready;
      if (S.unlocked || (await S.tryStored())) {
        if (!el.isConnected) return;
        return real.call(this, el, sub, params);
      }
      if (Router.current !== id) return;             // the reader moved on while the key was checked
      el.replaceChildren();
      lockScreen(el, id);
    };
  }
  /* ---------------------------------------------------------------- the disclaimer follows the workspace
     Trading Lab pages keep the public disclaimer exactly as index.html has it; My Portfolio and Alerts are the owner's
     real money, so "paper money only" would be wrong there: they say what they are, and that it is not advice. */
  const disc = $("pub-disclaimer");
  const PUBLIC_DISC = disc ? disc.innerHTML : "";
  const PRIVATE_DISC = '<b class="tag">Not advice<small>private section</small></b><p><strong>Not advice.</strong> My Portfolio is '
    + "the owner's own portfolio, published encrypted and opened only with the owner's code. Not a financial service, not investment advice, "
    + "not a recommendation or solicitation to buy or sell any security. The owner provides no investment services. Past returns do not predict "
    + 'future results.<span class="src">Public snapshot · the Trading Lab is public and paper money only · prices: Lang &amp; Schwarz '
    + "indications, for personal use.</span></p>";
  /* the status bar's legal line follows it too: "paper money only" is right on the lab's pages only */
  const grow = document.querySelector(".statusbar .grow");
  const PUBLIC_GROW = grow ? grow.textContent : "";
  const PRIVATE_GROW = "Not advice · the owner's own portfolio, published encrypted · past returns do not predict future results";
  const setDisclaimer = (page) => {
    if (!disc) return;
    const priv = modeOf(page) !== "trade";
    if (disc.dataset.kind === (priv ? "private" : "public")) return;
    disc.dataset.kind = priv ? "private" : "public";
    disc.innerHTML = priv ? PRIVATE_DISC : PUBLIC_DISC;
    if (grow) grow.textContent = priv ? PRIVATE_GROW : PUBLIC_GROW;
  };
  const route = Router.render.bind(Router);
  Router.render = function () { setDisclaimer(Router.parse().page); return route(); };

  /* the logo goes to the public front page */
  const logo = document.querySelector("a.logo");
  if (logo) { logo.setAttribute("href", "#/lab/overview"); logo.setAttribute("aria-label", "SV Terminal, Trading Lab"); }
})();
