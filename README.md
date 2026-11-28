# SoExpens - Society Expenses Tracker

Simple apartment expense tracker. Add the month's expenses, see savings carry forward automatically,
export the month as an image and send it to the WhatsApp group.

Static PWA. No server, no build step, no login (v1, single user). Your data stays on your device.

## Deploy on GitHub Pages
1. Create a repo (for example `soexpens`). Upload ALL files from this zip to the repo root (index.html must be at the root).
2. Repo -> Settings -> Pages -> Source: "Deploy from a branch" -> Branch: `main`, folder `/ (root)` -> Save.
3. Open `https://<username>.github.io/soexpens/` on your phone -> browser menu -> "Add to Home screen" / "Install app".
4. Settings -> Restore backup -> pick your `soexpens_data.json`.

**Keep the repo public only if you keep your data OUT of it.** Never commit `soexpens_data.json` or any backup
(the `.gitignore` blocks common names). The repo holds code only; the numbers live in your phone.

## Every month
1. Dashboard -> add expenses (tick "Repeat every month" for recurring items).
2. Export image -> Share -> WhatsApp group.
3. Close month. Next month: Months -> Add. Settle last month's late bills by unlocking it, editing, closing, sharing the new image. Later months update by themselves.
4. Settings -> Export backup, and keep the file (Drive / WhatsApp to yourself). Use it to open the data on another device.

## Backups: reminders and the month-close rule
- A reminder bar appears after every 5 changes that are not in a backup. "Later" snoozes it for 5 more changes.
- Closing a month REQUIRES a backup: a dialog opens that cannot be dismissed until the file is shared, downloaded or copied.
  If you reload before saving, the bar "A month was closed. Save a backup now." stays until you do.
- On phones the backup can be sent with the share sheet (Drive, WhatsApp to yourself, Files). Otherwise it downloads.
- The counters only reset once you have actually saved the file, never just because the file was made.
- If the browser's site data is cleared the app opens empty with a "Restore a backup" button on the first screen.

## Where is my data? (important)
Every change saves automatically into this browser's own storage (IndexedDB) on this device. There is no Save button, no cloud and no server.
Storage belongs to ONE browser on ONE device at ONE web address. A different browser, an incognito window, a different address,
another phone, or (on iPhone) the Home Screen app versus the Safari tab each see their own, empty copy.
Use Settings -> Export backup to move data between them or to keep a safe copy. The header shows how many changes are not in a backup yet.

## Setting up for any apartment
Settings -> Society name -> Add many (for example 12 flats named "Flat 1..12" at one amount) or Add one by one.
Each flat has its own monthly amount. "Set amount for all" or tick some flats and "Set for selected" changes many at once.
The monthly collection is always the total of the flats list. Changing flats or amounts never alters months that already exist;
use Month details -> Recalculate on an open month if you want that month to follow the flats.

## Special collections (one-time money for a repair or new item)
Dashboard -> Special collections -> New. Name it (for example "Civil work"), set the amount per flat, tick the flats that pay
(untick any flat that is exempt). Open it and tick each flat as it pays. Only PAID flats add to that month's savings.
Enter the real cost as a normal Expense in the same month. Whatever is left over stays in savings automatically.
Change one flat's amount by tapping it. "Add a flat" brings in a flat that was left out. The image shows the collected total
and how many are still pending. Closed months are read-only until unlocked.

## About, logo and sharing
Settings -> last card = About: share the app link (native share sheet on phones; on desktop a dialog with WhatsApp, Telegram,
Facebook, X, LinkedIn, Email, SMS and Copy link), plus the builder's website, LinkedIn and email.
The link shared is the address the app is running from. It never includes any society data.
App icon, favicon and header use the falcon logo (`img/`). For rich link previews in WhatsApp/Facebook,
change `og:image` in `index.html` to the full address of the icon after you deploy, for example
`https://<user>.github.io/<repo>/img/icon-512.png`.

## Rules
- Closing savings = savings brought forward + collection + extra income - spent. Spent above collection reduces savings.
- Opening/closing savings are never stored, always calculated, so edits to an old month fix every later month.
- Each month keeps its own copy of the collection (amounts and wording). Changing flats or amounts affects only months added afterwards.
- Amount left empty = "Pending" (counts as 0, shows Pending on the image).
- Amounts are whole rupees (0 to 99,99,999).

## Structure
```
core/  boot, router, dom helpers, i18n loader, dialogs
ui/    dashboard, months, settings, export (screens only; call bal/ only)
bal/   rules and maths (pure, no DOM): month-calc, month-rules, validate, report-model, service
dal/   storage (IndexedDB), backup text, schema migration (the only place that knows where data lives)
i18n/  en.json  (add hi.json / te.json later; all text goes through t('key'))
```

## Updating the app (every deploy)
1. Bump the version in BOTH `core/version.js` (APP_VERSION) and `sw.js` (CACHE_VERSION). They must match (a test checks it).
2. Upload the changed files to GitHub. Wait about a minute for Pages to publish.
3. Phones notice by themselves when the app is opened, or when you tap Settings -> Check for updates. A bar says
   "A new version is ready" with a Refresh button. Your data is untouched.

## Theme
Settings -> App -> Appearance: Match phone, Light or Dark. The choice is remembered on that device.

## Tests
`npm test` (Node 20+). Real-data checks: `SOEXPENS_DATA=/path/to/soexpens_data.json npm test`.
