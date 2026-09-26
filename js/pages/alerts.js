"use strict";
/* Alerts: the daily briefing inbox, your rules (with ready-made templates), notification settings. */

const AL_TABS = [["inbox", "Briefing"], ["rules", "Rules"], ["settings", "Settings"]];

Pages.alerts = {
  title: "Alerts",
  async render(el, sub, params) {
    sub = AL_TABS.some(([id]) => id === sub) ? sub : "inbox";
    el.append(pageHead("Alerts", "Once a day SV Terminal sums up what moved, where you stand and what the news says about what you hold. Your rules watch the market for you. Nothing here tells you what to buy or sell."),
      subtabs("alerts", AL_TABS, sub));
    const t = guard("alerts");
    const kpiBox = h("div", {}, skeleton(96)), body = h("div", {}, skeleton(260)), inner = h("div");
    el.append(kpiBox, body);
    alKpis().then((k) => { if (t()) kpiBox.replaceWith(k); }).catch(() => kpiBox.remove());
    await ({ inbox: alInbox, rules: alRules, settings: alSettings })[sub](inner, params);
    body.replaceChildren(inner);
  },
};

/* the KPI strip every page carries (FINAL_DESIGN §8): the inbox, your rules, the briefing, notifications */
async function alKpis() {
  const [box, rl, s] = await Promise.all([api("/api/inbox").catch(() => []), api("/api/rules").catch(() => ({ rules: [] })), api("/api/settings").catch(() => ({}))]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
  const unread = box.filter((i) => !i.read).length, rules = rl.rules || [];
  const active = rules.filter((r) => r.enabled !== false).length, fired = rules.filter((r) => r.state && r.state.last_fired === today).length;
  const lastB = box.find((i) => i.kind === "briefing");
  const perm = "Notification" in window ? Notification.permission : "unsupported";
  const hm = (iso) => new Date(iso).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
  return kpis(
    stat("Inbox", String(box.length), `${unread} new`, "", "hero"),
    stat("Your rules", String(active), "checked every 5 min while L&S quotes", "", "major"),
    stat("Met today", String(fired), fired ? "each notifies once a day" : "no rule met today", "", "major"),
    stat("Daily briefing", s.briefing_time || "18:00", s.briefing_weekdays_only ? "weekdays, Rome time" : "every day, Rome time"),
    stat("Last briefing", lastB ? day(lastB.at) : "none yet", lastB ? `at ${hm(lastB.at)}` : "sent at the set time"),
    stat("Mac notifications", s.mac_notifications ? "On" : "Off", `this browser: ${perm === "granted" ? "on" : perm === "denied" ? "blocked" : perm === "unsupported" ? "n/a" : "off"}`));
}

async function alInbox(body) {
  const inbox = await api("/api/inbox");
  const send = h("button", { class: "btn", onclick: async () => { send.disabled = true; send.textContent = "Preparing…"; try { await post("/api/briefing/send", {}); Router.go("alerts", "inbox"); } catch (e) { toast(e.message); send.disabled = false; send.textContent = "Send a briefing now"; } } }, "Send a briefing now");
  body.append(card({ code: "INBX", title: "Inbox", sub: `${inbox.length} item${inbox.length === 1 ? "" : "s"}`, more: send, body: inbox.length ? inbox.slice(0, 50).map((i, k) =>
    h("article", { class: `inbox-item${i.read ? "" : " unread"}` }, h("header", {}, h("b", {}, i.title), h("time", { datetime: i.at }, ago(i.at))), h("p", {}, prose(i.body)),
      i.briefing ? h("details", { open: k === 0 ? true : null }, h("summary", {}, "Read the briefing"), briefingView(i.briefing)) : null)) : empty("Nothing yet. The first briefing arrives at the time set in Settings, or send one now.") }));
  if (inbox.some((i) => !i.read)) post("/api/inbox/read", {}).then(() => updateBadge(0));
}

function briefingView(b) {
  const p = b.portfolio;
  return h("div", { class: "brief" },
    h("h4", {}, "Your portfolio"),
    h("ul", {}, h("li", {}, `Total ${fmt.eur.format(p.total)}; today `, money(p.day_change), ` (${sign(p.day_change_pct, fmt.p2)}); since you bought `, money(p.gain, fmt.eur0), ` (${sign(p.gain_pct, fmt.p1)}).`),
      p.positions.map((x) => h("li", {}, `${x.name}: `, pctEl(x.day_change_pct, fmt.p2), " today"))),
    b.markets && b.markets.length ? [h("h4", {}, "Markets"), h("ul", {}, b.markets.filter((m) => m.price && m.prev_close && m.group !== "index-proxy").map((m) =>
      h("li", {}, `${m.name}: ${fmt.n2.format(m.price)} `, pctEl(m.price / m.prev_close - 1, fmt.p2))))] : null,
    b.model ? [h("h4", {}, "Trading Lab (paper)"), h("p", {}, prose(b.model), " ", h("a", { href: "#/lab/overview" }, "Open the Trading Lab"))] : null,
    b.rules.length ? [h("h4", {}, "Rules met today"), h("ul", {}, b.rules.map((r) => h("li", {}, `${r.description} (${r.state.measured})`)))] : null,
    b.headlines.length ? [h("h4", {}, "In the news about what you hold and follow"), h("ul", {}, b.headlines.map((n) => h("li", {}, h("a", { href: n.url, target: "_blank", rel: "noopener" }, n.title),
      h("span", { class: "muted small" }, ` — ${n.source}, ${ago(n.published)}`))))] : null,
    b.central_banks.length ? [h("h4", {}, "Central banks"), h("ul", {}, b.central_banks.map((n) => h("li", {}, h("a", { href: n.url, target: "_blank", rel: "noopener" }, n.title), h("span", { class: "muted small" }, ` — ${n.source}`))))] : null,
    h("p", { class: "note" }, "Facts only: SV Terminal does not interpret the news or suggest trades."));
}

async function alRules(body, params) {
  const [{ rules, types }, pf, cmp] = await Promise.all([api("/api/rules"), api("/api/portfolio"), exploreData().catch(() => ({ funds: [] }))]);
  const insts = new Map();
  if (params.get("isin")) insts.set(params.get("isin"), params.get("name") || params.get("isin"));
  pf.positions.forEach((p) => insts.set(p.isin, p.name));
  cmp.funds.forEach((f) => insts.set(f.isin, f.short_name));
  const typeSel = h("select", { name: "type" }, Object.entries(types).map(([k, v]) => h("option", { value: k }, v)));
  const isinSel = h("select", { name: "isin" }, [...insts].map(([k, v]) => h("option", { value: k }, v)));
  const value = h("input", { name: "value", type: "number", step: "any" });
  const valueLabel = h("span", {}, "Level (€)");
  const W = { isin: h("label", { class: "field" }, "Instrument", isinSel), value: h("label", { class: "field" }, valueLabel, value) };
  const fields = () => { valueLabel.textContent = typeSel.value.startsWith("price_") ? "Level (€)" : "Percentage (%)"; };
  typeSel.addEventListener("change", fields);
  const err = h("p", { class: "error" });
  const form = h("form", { autocomplete: "off" }, h("div", { class: "form-grid" }, h("label", { class: "field" }, "When", typeSel), ...Object.values(W)), err, h("div", { class: "actions" }, h("button", { class: "btn" }, "Add rule")));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form).entries());
    try { await post("/api/rules", f); await post("/api/rules/check", {}); toast("Rule added"); Router.go("alerts", "rules"); } catch (x) { err.textContent = x.message; }
  });
  if (params.get("isin")) { typeSel.value = "drop_from_high"; isinSel.value = params.get("isin"); }
  fields();
  const main = pf.positions[0];
  const templates = [
    main && { label: `Tell me if ${main.name.split(" (")[0]} falls 10% from its 12-month high`, body: { type: "drop_from_high", isin: main.isin, value: 10 } },
    main && { label: `Tell me if ${main.name.split(" (")[0]} moves 3% in a day`, body: { type: "day_move", isin: main.isin, value: 3 } },
  ].filter(Boolean);
  body.append(h("div", { class: "grid" },
    card({ span: 7, code: "RULE", title: "Your rules", sub: "Checked every few minutes while the market is open; each notifies you once when it becomes true", body: rules.length ? rules.map((r) =>
      h("div", { class: `rule${r.state.active ? " met" : ""}` }, h("div", {}, h("b", {}, r.description),
        h("small", {}, r.state.error ? `Could not check: ${r.state.error}` : r.state.measured ? `Now: ${r.state.measured}${r.state.active ? " — met" : ""}` : "Not checked yet", r.state.last_fired ? ` · last alert ${day(r.state.last_fired)}` : "")),
        h("button", { class: "x", "aria-label": `Delete: ${r.description}`, onclick: async () => { await post(`/api/rules/${r.id}/delete`, {}); Router.go("alerts", "rules"); } }, "×"))) : empty("No rules yet. Start from a ready-made one or build your own.") }),
    card({ span: 5, code: "TMPL", title: "Ready-made rules", sub: "One click to add; you can delete them any time", body: [templates.length ? h("div", { class: "list" }, templates.map((t) =>
      h("div", { class: "list-row" }, h("div", { class: "grow" }, h("b", { style: "white-space:normal" }, t.label)), h("button", { class: "btn ghost sm", onclick: async () => { try { await post("/api/rules", t.body); await post("/api/rules/check", {}); toast("Rule added"); Router.go("alerts", "rules"); } catch (e) { toast(e.message); } } }, "Add")))) : empty("Add a holding first."),
      h("p", { class: "note" }, "Rules are checked every 5 minutes while Lang & Schwarz quotes (Mon–Fri, 07:30–23:00 Berlin), on its mid prices. Each rule notifies once when it becomes true, at most once a day.")] })));
  body.append(card({ code: "ADD", title: "Build your own rule", body: form }));
}

async function alSettings(body) {
  const s = await api("/api/settings");
  const time = h("input", { type: "time", value: s.briefing_time });
  const wk = h("input", { type: "checkbox", checked: s.briefing_weekdays_only ? true : null });
  const mac = h("input", { type: "checkbox", checked: s.mac_notifications ? true : null });
  const save = () => post("/api/settings", { briefing_time: time.value, briefing_weekdays_only: wk.checked, mac_notifications: mac.checked }).then(() => toast("Saved")).catch((e) => toast(e.message));
  [time, wk, mac].forEach((x) => x.addEventListener("change", save));
  const browserBtn = h("button", { class: "btn", type: "button", disabled: !("Notification" in window) || Notification.permission !== "default" ? true : null,
    onclick: async () => { await Notification.requestPermission(); Router.go("alerts", "settings"); } }, "Notification" in window && Notification.permission === "granted" ? "Browser notifications are on" : "Also notify in this browser");
  body.append(card({ code: "NTFY", title: "Notifications", body: [
    h("div", { class: "form-grid" }, h("label", { class: "field" }, "Daily briefing at", time),
      h("label", { class: "field", style: "flex-direction:row;align-items:center;gap:8px" }, wk, "Weekdays only"),
      h("label", { class: "field", style: "flex-direction:row;align-items:center;gap:8px" }, mac, "Mac notifications")),
    h("div", { class: "actions" }, browserBtn),
    h("p", { class: "note" }, "Notifications, rule checks, the switch tracker's evening update and the Trading Lab's nightly step happen while SV Terminal runs, which is always: a LaunchAgent starts it at login and restarts it if it stops. Only if that agent is removed do they depend on a Terminal window left open.")] }));
}
