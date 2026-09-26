# SV Terminal · public snapshot

**Paper money only. An educational training exercise run by an AI-designed model. Not a financial service, not investment advice, not a recommendation or solicitation to buy or sell any security. The owner provides no investment services. Simulated results do not predict future results.**

Site: https://vincenzosos.github.io/sv-terminal/

## What this is

SV Terminal is a personal app that runs on its owner's computer. This repository holds a static, read-only snapshot of it,
published on GitHub Pages. Nothing here runs a server, takes orders or connects to a broker.

- **Trading Lab (public).** A paper-money exercise: an AI-designed model trades a pretend €10,000 book of
  European shares on real prices, with a broker's €1 order fee, the bid-ask spread and the 2026 financial transaction
  taxes applied as costs. It shows everything it does, including open paper positions and the next paper orders, so the
  record can be checked. It places no real orders, holds no credentials and has no link to any broker account.
- **My Portfolio and Alerts (locked).** The owner's real savings and personal data. They are published only inside one
  encrypted file (`data/locked.bin`) that opens in the browser with a code. Nothing from that section is stored here in
  clear.

## Not advice

This is an educational training exercise, run by an AI-designed model. It is not a financial service, not investment
advice, and not a recommendation or solicitation to buy or sell any security. The owner provides no investment
services. Simulated (paper) results do not predict future results. Backtests use today's index members (survivorship
bias) and were designed after reading the research; only the live paper record since the lab's registration date is
out of sample.

## Data

- **Prices:** Lang & Schwarz Exchange indicative quotes (ls-tc.de), fetched by the owner's app for personal use; they
  are indications, not trades, and can differ from any broker's prices.
- **Costs and taxes:** the €1 order fee and the Italian, French and Spanish financial transaction taxes as published
  for 2026; the lab's rules page lists each source.
- Every number on the lab pages comes from those files or from arithmetic on them.

## When it updates

The owner's app rebuilds the snapshot and pushes it here:

- about every 30 minutes between 07:30 and 23:00 Berlin time on weekdays, while the owner's computer runs the app;
- after the lab's nightly step (after the 23:00 session end) and after the evening update at 23:20;
- by hand.

The status bar of the site shows `SNAPSHOT · updated <time>`. When the owner's computer is off, the snapshot simply
stays as it was. Each push replaces the previous one (a single commit on `gh-pages`).

## How the locked part works

`data/locked.bin` = a small header (format, PBKDF2 rounds, 16-byte salt, 12-byte IV) followed by AES-256-GCM
ciphertext of a gzip-compressed JSON map. The key is PBKDF2-HMAC-SHA256 of the code, 600,000 rounds. The page derives
it with WebCrypto and decrypts in the browser; the code and the data are never sent anywhere. The derived key is kept in
`sessionStorage` for the tab and is forgotten when the tab closes.

## Files

- `index.html`, `app.css`, `css/`, `js/`: the app's own pages, plus `js/static.js` (serves the snapshot instead of a
  server) and `js/lock.js` (lock screen, snapshot status, disclaimer).
- `data/index.json`: the public answers and when the snapshot was taken; `data/p/*.json`: one file per answer (page 2,
  3… of a paged answer, or a filtered one, may hold only what differs from the unfiltered answer; `js/static.js` puts
  it back together).
- `data/locked.bin`: the encrypted My Portfolio section and Alerts.

Every page carries `<meta name="robots" content="noindex, nofollow">`, which asks search engines not to index it.
(Crawlers read `robots.txt` only at the root of a domain, so the copy in this folder is a courtesy, not the control.)
