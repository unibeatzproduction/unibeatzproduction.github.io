# UniBeatz Production — Site Damage Report

**Repo audited:** `github.com/unibeatzproduction/unibeatzproduction.github.io` (public), cloned at `~/workspace/unibeatz_site`
**Main branch:** 791 commits, 2026-02-07 (`397bda4` "Initial commit") → 2026-08-06 (`92541ed`)
**Branches:** `main`, `add-packs`, `codex/build-audio-submission-and-review-system`, `codex/build-audio-submission-and-review-system-e3y1tp`, `codex/build-audio-submission-and-review-system-yeg6u7`
**Audit date:** 2026-10-23

## TL;DR — the three things actually killing the site

1. **`CNAME` is a picture, not a domain.** On 2026-06-22 (commit `d7a5982`, "Add files via upload") the `CNAME` file was overwritten with a 512×512 PNG image (14,015 bytes). GitHub Pages reads `CNAME` to know the custom domain — with binary garbage in it, the custom-domain configuration is corrupt. Original content (commit `14cf11b`, 2026-02-12) was the single line `www.unibeatzproduction.com`.
2. **Checkout is dead by construction, not by a lost key.** There is no Stripe publishable key anywhere in the current code and the site never calls Stripe.js. Payment is supposed to happen via per-item Stripe Payment Links. The membership buttons in `index.html` pass **no link at all**, and beat links are read from Firestore documents that evidently don't have them filled in — so the checkout modal literally renders the static text *"Stripe Payment Link required."* (`index.html:583`) and the payment handler falls back to a *"Stripe link not set yet"* toast (`index.html:809`).
3. **Everything LiveKit depends on lives outside this repo.** LiveKit tokens are minted by Firebase Cloud Functions (`getLiveKitToken`) that have **never been in this repository** (no `functions/` directory in any commit on any branch). If those functions are deleted, undeployed, or lost their LiveKit API secret in Google Cloud, every live feature (DJ broadcast, battles, cypher, talk studio) dies — and nothing in this repo can fix it.

**Good news:** the Firebase config Eugene thought was lost is **not lost** — it is present, real, and identical in 16 places on `main` (details in §2). Several "lost" values (Stripe publishable key, FCM VAPID key, ~20 old Stripe Payment Links) are **recoverable from git history** in this repo.

---

## 1. SITE MAP

All pages are static HTML at repo root (no build step). Firebase SDK is loaded from the gstatic CDN inside the pages themselves.

| Page | Feature it serves | Local JS it loads |
|---|---|---|
| `index.html` | **Main hub "The Empire"** — Beat Store, Battle Highlights, Platforms directory, Membership plans (Starter $29 / Pro $79 / Elite $149, `index.html:442-486`), Studio Booking form, passcode Admin area. Inline Firebase module (`index.html:263-287`) loads beats from Firestore collection `marketplace_beats`. | None external — all JS is inline. CSS: `index.css` |
| `legal.html` | Legal / privacy / terms. No JS. (Note: it states hosting is Vercel — see §5, the repo evidence says GitHub Pages.) | — |
| `radio.html` | **UniBeatz Radio station** — Live365 stream player, track submission form (writes Firestore `radio_submissions` + Storage uploads), approved-track rotation, "Live DJ" banner that connects listeners to the DJ's LiveKit room (`radio.html:400-430`), premium upsell popup, PWA install. Loads `radio-manifest.json`, registers `radio-sw.js`. | `unibeatz-auth.js`, `radio.js`, `radio-player.js`, `radio-premium-popup.js` (a stub — see §3), `radio-pwa-register.js`. CSS: `radio.css` |
| `admin-radio.html` | **Radio admin** — submission moderation queue (approve/reject/feature, requires Firebase Auth + `admin:true` custom claim per README), station controls (title/message/current DJ → `radio_broadcast` doc). | `admin-radio.js`, `admin-radio-panels.js`, `unibeatz-notifications.js` |
| `radio-dj-apply.html` | DJ application form → Firestore. | `radio-dj-apply.js` |
| `radio-dj-deck.html` | **DJ Deck** — dual-deck DJ interface with MIDI controller support; "go live" broadcasts mic + deck mix to LiveKit using a token from the `getLiveKitToken` Cloud Function (`radio-dj-deck.js:18,230-360`). | `unibeatz-midi-engine.js`, `radio-dj-deck.js` (+ inline Firebase config at `radio-dj-deck.html:966-971`) |
| `radio-dj-program.html` | DJ Program info/recruiting page. No local JS. | — |
| `radio-advertise.html` | **Advertise on UniBeatz Radio** — ad packages; the one place with working, hard-coded Stripe Payment Links (see §2). Inline Firebase config at `radio-advertise.html:248-253`. | Inline only |
| `radio-premium.html` | "UniBeatz Radio Premium" placeholder page (573 bytes). **Not linked from any page or script** — orphan page. | — |
| `radio-talk-studio.html` | **Talk Studio** — podcast/talk-show studio, up to 3 hosts over LiveKit, session chat + recording via Firestore. | `radio-talk-studio.js` (imports `./radio-talk-firebase.js`, `./radio-talk-audio.js`, `./radio-talk-recording.js`). CSS: `radio-talk-studio.css` |
| `radio-talk-host.html` | Talk Studio host/join page (title is also "Talk Studio"). Hard-codes the LiveKit URL (`radio-talk-host.html:56`). | Inline module only. CSS: `radio-talk-host.css` |
| `unifreestyle.html` | **UniFreestyle Battle App** — live rap battles (LiveKit cam/mic), cypher rooms, profiles, superchat, battle recorder. PWA via `unifreestyle-manifest.json` + `unifreestyle-sw.js`. Inline Firebase config at `unifreestyle.html:66-72`. | `unibeatz-notifications.js`, `unifreestyle-core.js`, `unifreestyle-profile.js`, `unifreestyle-battle.js`, `unifreestyle-cypher.js`, `unifreestyle-ui.js`, `/js/dj-midi-controller.js`, `/unibeatz-dj-os-v3.js`, `unifreestyle-recorder.js`, `unifreestyle-superchat.js`, `unifreestyle-pwa.js`, `/unibeatz-auth.js`. CSS: `unifreestyle.css` |
| `unipack.html` | **UniPack Pack Studio** — turn a beat into a sample pack: producer profiles, piano roll, swing, zoom, Google sign-in. Inline Firebase config at `unipack.html:52-58`. PWA via `unipack-manifest.json` + `unipack-sw.js`. | `/unibeatz-notifications.js`, `/unipack-producer-profiles.js`, `/unipack-swing.js`, `/unipack-piano-roll.js`, `/unipack-zoom.js`, `/unipack-google-signin.js`, `/unipack-pwa.js`, `/unibeatz-auth.js`. CSS: `unipack.css` |
| `unibeatzworld.html` | **UniBeatz World** — marketplace (beats · sound packs · merch); product cards read `stripeBasic` / `stripePremium` / `stripeExclusive` payment-link fields from Firestore docs. Inline Firebase config at `unibeatzworld.html:722-731`. | Inline only. CSS: `unibeatzworld.css` |

**Shared modules:** `unibeatz-auth.js` (shared Firebase auth, own config copy at `unibeatz-auth.js:30-36`), `unibeatz-notifications.js` (in-app notification center backed by Firestore), `firebase-messaging-sw.js` (FCM background-push service worker, repo root), `firebase-firestore.rules` / `firebase-storage.rules` (security rules, pasted into Firebase Console manually per README — there is no `firebase.json`, so they are **not** auto-deployed).

---

## 2. CONFIG INVENTORY

### 2.1 Firebase — ✅ PRESENT, REAL, CONSISTENT (not lost)

Every copy of the Firebase web config on `main` is identical and real. Project ID (a public identifier): **`unibeatzproduction-7ae31`**. apiKey in every copy: `AIzaSy…` — 39 chars, real format. `authDomain: unibeatzproduction-7ae31.firebaseapp.com`, `storageBucket: unibeatzproduction-7ae31.firebasestorage.app`, `messagingSenderId: 70667820609`, `appId: 1:70667820609:web:57762df5510e6b4000b0c0`. Two variants exist: with and without `measurementId: G-QR5J3KW8T1`.

| File | Line | Variant |
|---|---|---|
| `index.html` | 264–271 | base |
| `radio.html` | 263–268 **and again** 403 (duplicate init in the Live DJ listener block; harmless due to `getApps()` guard, but duplicated) | base |
| `radio.js` | 6–13 | base |
| `admin-radio.js` | 9–16 | base |
| `radio-dj-deck.js` | 5–12 | base |
| `radio-dj-deck.html` | 966–971 | base |
| `radio-dj-apply.js` | 4 | base (one-liner) |
| `radio-advertise.html` | 248–253 | base |
| `radio-talk-studio.html` | 198–203 | base |
| `unibeatz-auth.js` | 30–36 | base |
| `unibeatz-notifications.js` | 19–26 | base |
| `firebase-messaging-sw.js` | 8–15 | base |
| `unibeatzworld.html` | 722–731 | + `measurementId` |
| `unifreestyle.html` | 66–72 | + `measurementId` |
| `unipack.html` | 52–58 | + `measurementId` |

Git-history check: across **all 791 commits and all branches**, the only `projectId` that ever appears is `unibeatzproduction-7ae31` (178 diff occurrences, one value). The Firebase config was never replaced by a placeholder and never belonged to a different project. **Nothing to regenerate here.**

### 2.2 FCM VAPID key (web push) — ⚠️ REMOVED FROM CODE 2026-05-31, recoverable from history

- A real VAPID public key (87 chars, prefix `BBFJmA…`) was set in `unibeatz-notifications.js` by commits `7778d0f` and `dbe2481` ("Update VAPID key…", 2026-05-23), replacing a `PASTE_YOUR_VAPID_KEY_HERE` placeholder.
- Commit **`57a1aa6`** (2026-05-31, "Load Cypher audio URL override") rewrote `unibeatz-notifications.js` and the VAPID key — and all FCM token registration (`getToken`) — disappeared. The current file is a Firestore-backed in-app notification center (`listenForNotifications`, `sendAdminNotification`) with **no push-token code at all**, and no file in the current tree calls `getToken`/`getMessaging`.
- Net effect: `firebase-messaging-sw.js` still sits at repo root, but nothing ever registers a device token, so **background web push cannot work** as the code stands. The key value itself is recoverable from commit `dbe2481` if the push flow is restored.

### 2.3 LiveKit — URL present and real; API key/secret never in this repo (by design)

- **Server URL (real, present):** `wss://uni-freestyle-battle-i951nakn.livekit.cloud`
  - `radio-talk-host.html:56` — `const LIVEKIT_URL = 'wss://…'`
  - `radio-talk-studio.js:9` — same constant
  - This is the **only** `*.livekit.cloud` host that appears anywhere in the full git history (8 occurrences).
- **No LiveKit API key or secret exists in the code or in any historical commit** (history searched for `LIVEKIT_API`, `AccessToken`, `livekit-server-sdk` — zero hits). Tokens are minted server-side and fetched by the client:
  - `https://us-central1-unibeatzproduction-7ae31.cloudfunctions.net/getLiveKitToken` — used by `radio-dj-deck.js:18`, `radio-talk-firebase.js:10` (+ `getLiveKitToken()` at :63), `radio-talk-host.html:57`, `unifreestyle-cypher.js:12`, and `radio.html:405` (constant `UB_LK_TOKEN`, 79 chars — it is this URL, not a JWT).
  - `https://getlivekittoken-vikmcq7yva-uc.a.run.app` — a second, Cloud Run-style endpoint used **only** by the battle app, `unifreestyle-battle.js:8` (introduced by commit `e746ebc` "Update LiveKit token URL"). The listener/deck flow destructures `{token, url}` from the response (`radio.html:424`), so the LiveKit URL also comes from the function at runtime there.
  - The LiveKit JS SDK itself is loaded from jsDelivr CDN (`livekit-client@2.5.7`) — fine.
- ⚠️ **The token functions themselves are not in this repo and never were** — no `functions/` folder, no `firebase.json`, in any commit. They live (or lived) in the Firebase project `unibeatzproduction-7ae31` on Google Cloud. Whether they are still deployed cannot be determined from this repo; if they are gone, **all** LiveKit features are dead regardless of what this code does.

### 2.4 Stripe — publishable key deleted with `config.js` in 2026; checkout actually runs on Payment Links stored in Firestore

- **Publishable key:** none in the current tree (no `pk_live`/`pk_test` anywhere on `main`). History: exactly one key ever existed — a real `pk_live…` key, 107 chars — and only inside **`config.js`**, added in commit **`01ee417`** (2026-04-07, "Add Firebase and Stripe configuration in config.js", alongside a duplicate of the Firebase config) and deleted with the file in commit **`44616ef`** (2026-05-03, "Delete config.js"). `git log -S 'config.js'` shows **no page ever referenced `config.js`** — the key was never wired into the site even while it existed. It is recoverable verbatim from commit `01ee417`. (A publishable key is a public identifier, not a secret — but note the current code has **no Stripe.js integration at all**, so there is currently nowhere that consumes a publishable key.)
- **Secret keys:** no `sk_live`/`sk_test` string has ever appeared in any commit. Good.
- **Payment Links (the mechanism the site actually uses):**
  - ✅ **Real and present:** `radio-advertise.html:362-365` hard-codes three live links — basic `buy.stripe.com/4gM6oAajo…`, standard `buy.stripe.com/cNi8wIajo…`, premium `buy.stripe.com/6oU4gs2QW…`.
  - ❌ **Beat Store (index.html):** beats are loaded from Firestore `marketplace_beats` (`index.html:282`), and each beat's link comes from that document's `stripeBasic`/`stripe` field (`index.html:707`). If those fields are empty in Firestore, BUY opens a modal whose body is the hard-coded text *"Stripe Payment Link required."* (`index.html:583`) — which is exactly what the live homepage shows today. **The missing links are missing data (Firestore / Stripe dashboard), not missing code.**
  - ❌ **Memberships (index.html):** the plan buttons call `openModal('Starter Membership','$29/month')` with **no stripe argument at all** (`index.html:459`, `:473`, `:486`), so `_stripe` is always `''` and `processPayment()` (`index.html:809`) can only toast *"Stripe link not set yet."* Membership checkout **cannot** work until links are created and wired in.
  - ❌ **Studio Booking (index.html):** `bookSession()` (`index.html:815`) only shows a *"Processing deposit via Stripe…"* toast — there is no payment integration behind it at all.
  - 🕘 **History:** 20+ distinct `buy.stripe.com` links appear in earlier commits (older `index.html` versions hard-coded the beat catalog). Examples: `buy.stripe.com/00w3co4Z4…`, `buy.stripe.com/14AdR2ezE…`, `buy.stripe.com/3cI7sE9fk…`. If those links are still active in Stripe, they can be harvested from git history instead of recreated.
- **Stripe Connect (creator payouts):** `unibeatz-stripe-connect.js` is a complete Stripe Connect layer (onboarding/status/dashboard via Cloud Functions `createStripeConnectOnboarding`, `stripeConnectStatus`, `createStripeExpressDashboardLink` on `https://us-central1-unibeatzproduction-7ae31.cloudfunctions.net`, `unibeatz-stripe-connect.js:27,116,136,151`) — **but no page loads it** (see §3). UniPack/UniFreestyle payout UI therefore never appears.

---

## 3. BROKEN REFERENCES

Every `<script src>`, `<link href>`, ES-module import, `fetch()` target and service-worker registration in every HTML/JS file was extracted and checked against the tree. **Result: the file moves did surprisingly little damage here** — all script/link references resolve, with these exceptions:

### Missing files (404-in-waiting)
| Reference | Referenced from | Status |
|---|---|---|
| `icons/radio-192.png` | `radio.html` (apple-touch-icon `<link>`), and `radio-manifest.json` icons array (`/icons/radio-192.png`) | **Missing — and has never existed in any commit** (`git log --all -- icons/radio*` is empty). `icons/` contains only `unifreestyle-192.png`, `unifreestyle-512.png`, `.keep`. |
| `icons/radio-512.png` | `radio-manifest.json` icons array (`/icons/radio-512.png`) | **Missing — never existed.** Effect: the Radio PWA has no valid PNG icons → installability/icon broken. |

### Files that exist but are the wrong content
| File | Problem |
|---|---|
| `CNAME` | Contains a 512×512 PNG image instead of the domain text (see §5). |
| `radio-512.png` (repo root, 83 bytes) | **Not an image** — it's a text file whose contents are JavaScript: the first lines of `unibeatz-notifications.js` (`// unibeatz-notifications.js — Radio Station version` + `import "/unibeatz-auth.js";`). Created in the same bad upload commit `d7a5982` (2026-06-22). Nothing references it, but anything that ever points at it expecting an icon gets JS text. |
| `logo.png` | Real PNG but 1024×1024, while `unipack-manifest.json` declares it as both `192x192` and `512x512`. Browsers tolerate this; sizes are simply mislabeled. |

### Manifests checked
- `radio-manifest.json` — icons: `/unibeatz-radio-cover-v2.svg` ✅ exists; `/icons/radio-192.png` ❌; `/icons/radio-512.png` ❌. Shortcuts point at `/`, `/#submit`, `/radio-dj-apply.html` ✅.
- `unifreestyle-manifest.json` — icons `/icons/unifreestyle-192.png`, `/icons/unifreestyle-512.png` ✅ both exist.
- `unipack-manifest.json` — icons `/logo.png` ✅ exists (size labels wrong, above).

### Service workers checked
- `radio-sw.js` precache SHELL: `/radio.css` ✅, `/radio.js` ✅, `/radio-premium-popup.js` ✅, `/unibeatz-radio-cover-v2.svg` ✅ (+ one Google Fonts URL). No stale entries. (It also uses `Promise.allSettled`, so even a bad entry wouldn't break install.)
- `unifreestyle-sw.js` STATIC_ASSETS: all 9 entries ✅ exist (`unifreestyle.css`, `-core`, `-profile`, `-battle`, `-cypher`, `-ui`, `-superchat`, `unifreestyle-manifest.json`, `logo.png`). Push handler icon `/icons/unifreestyle-192.png` ✅.
- `unipack-sw.js` STATIC_ASSETS: all 9 entries ✅ exist.
- `firebase-messaging-sw.js` — initializes Firebase with the correct config (§2.1); notification icon `/logo.png` ✅. Dead in practice only because nothing registers tokens anymore (§2.2).
- Registrations: `radio-pwa-register.js` → `/radio-sw.js` ✅; `unifreestyle-pwa.js` → `/unifreestyle-sw.js` ✅; `unipack-pwa.js` → `/unipack-sw.js` ✅.

### Disconnected / orphaned code (exists, but no page loads it)
| File | Situation |
|---|---|
| `unibeatz-stripe-connect.js` | Complete Stripe Connect payout layer; **referenced by zero pages** — UniPack and UniFreestyle (its stated targets, file header lines 1–5) never load it. |
| `unipack-stems.js` | UniPack stem-separation feature; **not loaded by `unipack.html`** or anything else. |
| `unipack-mobile-upload-fix.js` | Referenced only by the also-orphaned `unipack-stems.js` — the mobile upload fix is not active on `unipack.html`. |
| `unibeatz-radio-v5-patch.js` | A 13 KB "v5 patch"; referenced by nothing. |
| `unibeatz-search.js` | Stub (`// stub for radio` + `export default {}`). |
| `radio-premium-popup.js` | Stub (`export default {}`) — yet it **is** loaded by `radio.html` and precached by `radio-sw.js`, so the "premium popup" feature is an empty module. |
| `dj-midi-controller.js` (repo root) | Diverged duplicate of `js/dj-midi-controller.js` (different MD5s). Pages load the `js/` copy (`unifreestyle.html`); the root copy is dead weight and a confusion trap — two different versions of the same-named file. |
| `radio-premium.html` | Page not linked from anywhere (see §1). |
| `radio-script-tags.txt` | A 3-line text note duplicating the `radio-premium-popup.js` stub content; inert. |

No HTML page links to a non-existent HTML page (all inter-page links resolve), and no page besides `radio.html`'s icon link references a missing local asset.

---

## 4. GIT HISTORY HUNT

### Did a Firebase config ever exist / disappear?
It existed from early on and **never disappeared**. One project (`unibeatzproduction-7ae31`) across all history (§2.1). A second copy lived briefly in the standalone `config.js` (`01ee417`, 2026-04-07 → deleted `44616ef`, 2026-05-03) — that deletion is the only "config file" loss event in the repo, and what actually died with it was the **Stripe publishable key** (§2.4), since the Firebase values survived inline everywhere else.

### Did a LiveKit URL / API key ever exist?
- The `wss://uni-freestyle-battle-i951nakn.livekit.cloud` URL appears in history only in its current two files and is still present. It was never replaced by a placeholder.
- A LiveKit **API key/secret has never existed in this repo** — token signing was always delegated to the Cloud Functions (§2.3), whose code is not versioned here. The battle app's token endpoint changed once (`e746ebc` "Update LiveKit token URL" → the `run.app` URL), showing the functions were redeployed as 2nd-gen/Cloud Run at some point.
- Also lost in a rewrite: the **FCM VAPID key**, removed from `unibeatz-notifications.js` in `57a1aa6` (2026-05-31) — see §2.2. Value recoverable from `dbe2481`.

### The `d7a5982` incident (2026-06-22, "Add files via upload")
One web-upload commit did outsized damage: `CNAME` 26 bytes → 14,015-byte PNG; `radio-512.png` created containing JS text; plus large rewrites of `index.html`, `admin-radio.js`, `radio-dj-deck.*`, `radio-player.js`, `radio-premium-popup.js` (reduced to the stub it still is). This is the "files got moved around" event — but per §3, page→file references survived it almost intact; its real casualties were `CNAME`, `radio-512.png`, and the premium popup.

### Branch comparison vs `main`
| Branch | Ahead of main | Verdict |
|---|---|---|
| `codex/build-audio-submission-and-review-system` | **0 commits** (666 behind) | Fully merged. This is the branch that built the radio audio-submission + review system (`radio.html`, `admin-radio.html`, rules files) — it all lives on `main` now. Nothing unique to rescue. |
| `codex/build-audio-submission-and-review-system-e3y1tp` | **0 commits** (666 behind) | Fully merged (notification copy updates). Nothing unique. |
| `codex/build-audio-submission-and-review-system-yeg6u7` | **2 commits** | **Unmerged radio redesign:** `e8e608a` "Redesign Uni Radio to player-first layout with modal submission" and `a1cde7a` "Restyle Uni Radio with gritty 90s Bronx atmosphere". A different `radio.html` direction that never reached `main`. |
| `add-packs` | **2 commits** | **Unmerged sample-pack files, exist nowhere else:** `2c8db77` adds `packs/UniBeatz_Percussion_Loops_Vol1.zip`, `0f2cb66` adds `packs/pack_cover.png` — both commit messages say "(placeholder - to be replaced)". `main` has no `packs/` directory at all. |

---

## 5. DEPLOYMENT

- **Platform: GitHub Pages.** The repo is a Pages user-site repo (`unibeatzproduction.github.io`), all content is static files at root, and there is **no `vercel.json`, no `firebase.json`, and no `.github/workflows/` in any commit on any branch**. (If a Vercel project exists, it was connected outside this repo and leaves no trace here; `legal.html:214` claiming "Vercel (hosting)" contradicts the repo evidence.)
- **Custom domain: broken.** `CNAME` was created in `14cf11b` (2026-02-12) containing `www.unibeatzproduction.com`, and was overwritten with PNG binary in `d7a5982` (2026-06-22). Until `CNAME` contains a plain-text domain again, GitHub Pages cannot apply the custom domain from this repo.
- **Subdomain `radio.unibeatzproduction.com`:** pages hard-link to it as the radio's canonical home (`index.html:308,330`; `admin-radio.html:13`; `radio-advertise.html:108,125`; `radio-dj-deck.html:492,495-496`). GitHub Pages serves **one** custom domain per repo (the `CNAME`), so this subdomain **cannot be served by this repo alone** — it requires separate DNS/deployment outside this repo (a second Pages repo, a redirect, or another host). Nothing in the repo configures it.
- **Backend hosting:** Firebase (Auth/Firestore/Storage/FCM) + Cloud Functions/Cloud Run for `getLiveKitToken` and the Stripe Connect functions — all in Google Cloud project `unibeatzproduction-7ae31`, none of it defined in this repo (no `firebase.json`; the Firestore/Storage rules files in root must be pasted into the Firebase Console manually, per the README's own step-by-step).
- **Radio stream itself** is Live365 (the service worker pass-through list names `streaming.live365.com`, `radio-sw.js:18-19`) — external, unaffected by this repo.

---

## 6. WHAT EUGENE NEEDS TO REGENERATE

Ordered by impact. "Recoverable" items need **no** regeneration — they're in this repo's git history.

| # | Item | Status | Where it's regenerated / recovered | Goes back into |
|---|---|---|---|---|
| 1 | **`CNAME` domain text** | Corrupted (PNG since `d7a5982`, 2026-06-22) | Not a secret — just restore the text `www.unibeatzproduction.com` (recoverable from commit `14cf11b`) | `CNAME` (repo root) — then confirm the domain in GitHub repo Settings → Pages |
| 2 | **Stripe Payment Links for beats** | Missing as *data* — live modal says "Stripe Payment Link required" | Stripe Dashboard → Payment Links (create one per beat/price tier) — or first check whether the 20+ historical links found in old `index.html` commits are still active in Stripe and reuse them | **Firestore** — each `marketplace_beats` document's `stripeBasic` / `stripe` field (read at `index.html:707`). Not a code file |
| 3 | **Stripe Payment Links for memberships** ($29/$79/$149) | Never wired — buttons pass no link (`index.html:459,473,486`) | Stripe Dashboard → Payment Links (3 recurring-price links) | `index.html` — the three membership buttons must be edited to pass the link to `openModal(...)` (or the links stored in Firestore and loaded like the beats) |
| 4 | **LiveKit token functions** (`getLiveKitToken` ×2 endpoints + Stripe Connect functions) | Not in repo; deployment status unknown — **verify first** in Google Cloud Console (project `unibeatzproduction-7ae31`, Cloud Functions / Cloud Run: `getLiveKitToken`, `getlivekittoken-vikmcq7yva-uc`, `createStripeConnectOnboarding`, `stripeConnectStatus`, `createStripeExpressDashboardLink`) | If a function is gone and must be redeployed, its **LiveKit API Key + Secret** come from LiveKit Cloud dashboard → project **uni-freestyle-battle** → Settings → API keys (create a new key pair); the **Stripe secret key** for the Connect functions comes from Stripe Dashboard → Developers → API keys. Both are set as the function's environment/secret config **in Google Cloud — never in this repo** | Google Cloud function configuration only. Client files (`radio-dj-deck.js:18`, `unifreestyle-battle.js:8`, etc.) already point at the right URLs |
| 5 | **FCM VAPID key** (web push) | Removed from code in `57a1aa6` (2026-05-31); push registration code removed with it | **Recoverable** from git history (commit `dbe2481`, in `unibeatz-notifications.js`) — or regenerate the pair in Firebase Console → Project settings → Cloud Messaging → Web Push certificates | `unibeatz-notifications.js` — but only alongside restoring the `getToken({ vapidKey })` registration flow; the current file has no FCM code to receive it |
| 6 | **Stripe publishable key** (`pk_live…`, 107 chars) | Deleted with `config.js` in `44616ef` (2026-05-03); never used by any page | **Recoverable** verbatim from commit `01ee417` (`config.js`) — or copy it any time from Stripe Dashboard → Developers → API keys | Nowhere, currently — no page loads Stripe.js. Only needed if a future checkout is built on Stripe.js/Elements instead of Payment Links |
| 7 | **Radio PWA icons** (`icons/radio-192.png`, `icons/radio-512.png`) | Never existed | Design assets — export from the radio cover art / `logo.png` at 192×192 and 512×512 | `icons/radio-192.png`, `icons/radio-512.png` (referenced by `radio-manifest.json` and `radio.html`). Also replace or delete the bogus text-filled root `radio-512.png` |
| 8 | **Firebase web config** | ✅ **Not lost** — real and identical in 16 places (§2.1) | — | — |
| 9 | **LiveKit server URL** (`wss://uni-freestyle-battle-i951nakn.livekit.cloud`) | ✅ **Not lost** — present at `radio-talk-host.html:56` and `radio-talk-studio.js:9` | — | — |
| 10 | **Firebase admin access for `admin-radio.html`** | Outside repo scope | Moderation requires a Firebase Auth user with custom claim `admin: true`, set via Admin SDK (README §5). If Eugene's admin user/claim is lost: Firebase Console → Authentication (user) + re-run the claim-setting script | Firebase Console / Admin SDK environment — not a repo file |
| 11 | **Disconnected features** (not secrets — code wiring) | Files present but never loaded | n/a | Load `unibeatz-stripe-connect.js` from `unipack.html` + `unifreestyle.html`; load `unipack-stems.js` (+ `unipack-mobile-upload-fix.js`) from `unipack.html`; decide on `unibeatz-radio-v5-patch.js` and the root `dj-midi-controller.js` duplicate (keep one copy) |
| 12 | **Unmerged branch work** (optional rescue) | Exists only on branches | n/a | Merge or cherry-pick: `add-packs` (`packs/UniBeatz_Percussion_Loops_Vol1.zip`, `packs/pack_cover.png`); `codex/…-yeg6u7` (player-first / 90s Bronx radio redesign, `e8e608a` + `a1cde7a`) |

*Values note: per audit policy, no full secret values are reproduced here. Firebase identifiers (project ID, sender ID, app ID, measurement ID) are public web-config values and are shown in full; the Stripe publishable key and VAPID key are masked to prefix + length, with the exact commits named where Eugene (repo owner) can retrieve them.*
