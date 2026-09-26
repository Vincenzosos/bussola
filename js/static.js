"use strict";
/* SV Terminal · public snapshot, part 1 of 2: the data layer. publish.py loads this file BEFORE core.js on the published
   site only; the app on the Mac never loads it.
   - BussolaCrypto: opens data/locked.bin (PBKDF2-HMAC-SHA256 → AES-256-GCM → gzip). Node runs the same code in the
     round-trip test (tests/test_publish.py), so it uses nothing but WebCrypto, Blob and DecompressionStream.
   - A fetch shim for "/api/…" GETs: public answers come from data/p/<sha1(url)>.json (listed in data/index.json; a
     paged answer may be stored as its differences from page one, BussolaDelta puts it back together),
     private ones from memory once the code has opened the bundle; anything else is "Not in this snapshot". POSTs are
     refused politely: the snapshot is read-only.
   - The default route is the Trading Lab's Overview. There is no live stream. js/lock.js does the rest. */

/* ================================================================ crypto (browser and Node) */
(function (root) {
  const MAGIC = [0x42, 0x53, 0x4c, 0x4b];            // "BSLK"
  const HEADER = 37;                                  // magic 4 · version 1 · iterations 4 (BE) · salt 16 · iv 12
  function parseHeader(buf) {
    const b = new Uint8Array(buf);
    if (b.length < HEADER + 16 || MAGIC.some((x, i) => b[i] !== x)) throw new Error("Not an SV Terminal bundle");
    if (b[4] !== 1) throw new Error(`Unknown bundle version ${b[4]}`);
    const iterations = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(5, false);
    return { version: b[4], iterations, salt: b.slice(9, 25), iv: b.slice(25, 37), header: b.slice(0, HEADER), body: b.slice(HEADER) };
  }
  async function deriveKey(code, salt, iterations, extractable = true) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(code)), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, extractable, ["decrypt"]);
  }
  async function gunzip(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  /* throws when the key is wrong (AES-GCM checks its tag over the header and the ciphertext) */
  async function openWithKey(key, h) {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: h.iv, additionalData: h.header, tagLength: 128 }, key, h.body);
    return JSON.parse(new TextDecoder().decode(await gunzip(new Uint8Array(plain))));
  }
  async function open(buf, code) {
    const h = parseHeader(buf);
    const key = await deriveKey(code, h.salt, h.iterations, true);
    return { data: await openWithKey(key, h), key, header: h };
  }
  const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function exportKey(key) { return b64(new Uint8Array(await crypto.subtle.exportKey("raw", key))); }
  async function importKey(s) { return crypto.subtle.importKey("raw", unb64(s), { name: "AES-GCM" }, false, ["decrypt"]); }
  root.BussolaCrypto = { parseHeader, deriveKey, gunzip, openWithKey, open, exportKey, importKey, b64, unb64 };
})(typeof window !== "undefined" ? window : globalThis);

/* ================================================================ URL keys (the same rule as publish.norm_url) */
(function (root) {
  /* path + query with the parameters sorted by name, decoded and re-encoded one way; an empty query is dropped */
  function normUrl(u) {
    let s = String(u);
    const api = s.indexOf("/api/");
    if (api > 0 && /^[a-z]+:\/\//i.test(s)) s = s.slice(api);
    const hash = s.indexOf("#");
    if (hash >= 0) s = s.slice(0, hash);
    const qi = s.indexOf("?");
    const path = qi >= 0 ? s.slice(0, qi) : s;
    const query = qi >= 0 ? s.slice(qi + 1) : "";
    const dec = (x) => { try { return decodeURIComponent(x.replace(/\+/g, " ")); } catch (_) { return x; } };
    const pairs = query.split("&").filter(Boolean).map((p) => { const i = p.indexOf("="); return i < 0 ? [dec(p), ""] : [dec(p.slice(0, i)), dec(p.slice(i + 1))]; });
    pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const q = pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    return q ? `${path}?${q}` : path;
  }
  root.BussolaNorm = normUrl;
  /* publish.delta_pack stores page 2, 3… of a paged answer as {"$delta":1,"$base":<file>,"set":{…},"drop":[…]}: the
     fields that differ from the same URL without the page (or filter) parameter. This puts the answer back together. */
  root.BussolaDelta = {
    is: (text) => typeof text === "string" && text.startsWith('{"$delta":'),
    base: (text) => JSON.parse(text).$base,
    merge(baseText, deltaText) {
      const d = JSON.parse(deltaText), out = JSON.parse(baseText);
      for (const k of d.drop || []) delete out[k];
      return JSON.stringify(Object.assign(out, d.set || {}));
    },
  };
})(typeof window !== "undefined" ? window : globalThis);

/* ================================================================ the shim (browser only) */
(function () {
  if (typeof window === "undefined" || !window.document) return;
  const ORIG = window.fetch.bind(window);
  /* the parts of the API that are public (publish.py PUBLIC_PREFIXES): everything else, the market board included, is
     the locked section */
  const PUBLIC = [/^\/api\/lab\//, /^\/api\/glossary$/, /^\/api\/status$/];
  const S = window.BussolaStatic = {
    index: null, indexError: null, priv: null, unlocked: false, misses: [], locked: [], refused: [],
    isPublic: (key) => PUBLIC.some((re) => re.test(key.split("?")[0])),
  };
  /* the Trading Lab's Overview is the front page (#/ and #/lab land there) */
  if (!location.hash || location.hash === "#" || location.hash === "#/") history.replaceState(null, "", `${location.pathname}${location.search}#/lab/overview`);
  S.ready = ORIG("data/index.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(`data/index.json: HTTP ${r.status}`); return r.json(); })
    .then((d) => { S.index = d; return d; })
    .catch((e) => { S.indexError = e.message; S.index = { public: {} }; return S.index; });
  S.setPrivate = (data) => { S.priv = (data && data.urls) || {}; S.privMeta = data || {}; S.unlocked = true; };
  const note = (list, key) => { list.push(key); if (list.length > 200) list.splice(0, list.length - 200); };
  const json = (obj, status) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
  const cache = new Map();                            // public files already fetched in this tab
  const D = window.BussolaDelta;
  async function publicFile(h, depth = 0) {
    let body = cache.get(h);
    if (body != null) return body;
    /* ?v= the snapshot's time: one browser-cache entry per snapshot (GitHub Pages ignores the query) */
    const r = await ORIG(`data/p/${h}.json?v=${encodeURIComponent(S.index.built || "")}`);
    if (!r.ok) throw new Error(`Snapshot file missing (HTTP ${r.status})`);
    body = await r.text();
    if (D.is(body)) {
      if (depth > 2) throw new Error("Snapshot file damaged");
      body = D.merge(await publicFile(D.base(body), depth + 1), body);
    }
    cache.set(h, body);
    return body;
  }
  window.fetch = async function (input, opts) {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : null;
    if (raw == null || !(raw.startsWith("/api/") || raw.startsWith(`${location.origin}/api/`))) return ORIG(input, opts);
    const method = String((opts && opts.method) || "GET").toUpperCase();
    const key = window.BussolaNorm(raw);
    if (method !== "GET") {
      note(S.refused, `${method} ${key}`);
      return json({ error: "This is a read-only public snapshot: nothing can be changed or sent from here." }, 405);
    }
    if (key.startsWith("/api/stream")) return json({ error: "No live stream in the public snapshot" }, 404);
    await S.ready;
    if (S.priv && Object.prototype.hasOwnProperty.call(S.priv, key)) {
      const e = S.priv[key];
      return new Response(e.t === "text" ? e.b : JSON.stringify(e.b), { status: e.s || 200, headers: { "Content-Type": "application/json; charset=utf-8" } });
    }
    const pub = (S.index.public || {})[key];
    if (pub) {
      let body;
      try { body = await publicFile(pub[0]); } catch (e) { return json({ error: e.message }, 502); }
      return new Response(body, { status: pub[1] || 200, headers: { "Content-Type": "application/json; charset=utf-8" } });
    }
    if (!S.unlocked && !S.isPublic(key)) {
      note(S.locked, key);
      return json({ error: "Locked: this is the owner's private portfolio. Enter the code on the My Portfolio page." }, 403);
    }
    note(S.misses, key);
    return json({ error: "Not in this snapshot" }, 404);
  };
  /* no live stream in a snapshot (lock.js also turns Live.connect off) */
  window.EventSource = class SnapshotNoStream { constructor() { this.readyState = 2; } close() {} addEventListener() {} };
})();
