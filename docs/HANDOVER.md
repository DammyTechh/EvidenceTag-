# EvidenceTag — Handover

**Stage:** core product complete and verified locally; not yet deployed to a hosted project.
**Handover date:** 1 October 2026
**Specification:** *EvidenceTag — Project Plan & System Specification* (1 Oct 2026)

This document is for whoever takes the project from here: a developer continuing the
build, or the IT team running it. It says what exists, how it fits together, how to run
and deploy it, how to operate it day to day, and what is still to do.

---

## 1. Status at a glance

| Spec module | Status | Notes |
| --- | --- | --- |
| 4.1 Public passport `/e/:token` | **Done** | No login. Photo, status, SOPs, specs, full history (decision: full, not summary). Update panel for technician/HOD of that lab. |
| 4.2 Lab entrance board `/l/:token` | **Done** | Thumbnails, status filter chips, search. |
| 4.3 Equipment registration | **Done** | Auto asset ID (`FUGO-CHEM1-0001`), permanent QR token, optional photo, label shown on save. SOP document upload is **not** in the form yet (see §12). |
| 4.4 Record an event (5 types) | **Done** | Use, fault, maintenance, inspection, external service report (with signed report file). All save offline first. |
| 4.5 Replacement recommendation | **Done** | Replace → status + critical alert; outcome page records Replaced / Retired / Kept in service. |
| 4.6 Dashboard | **Done** | Summary cards, status-by-lab, services due by month, faults per lab per month, filterable table. HOD sees own labs. |
| 4.7 Reports | **Done** | Excel: register, service schedule, fault log, event history. Word: equipment report, lab summary. Generated in the browser. |
| 4.8 Notifications centre | **Partly** | In-app alert list with unread count and mark-read. **Not built:** push opt-in, per-user notification settings, live (Realtime) updates. |
| 5 Alerts (cron, email, outbox) | **Written, not live** | Triggers, tiers, dedupe, cron and `dispatch-outbox` exist. Need Resend + Vault secrets on the hosted project to actually send (§7). |
| 6 Offline | **Done for staff devices** | Device cache, outbox, sync, 3-state network badge. See §6 for the honest limit on Supabase Cloud. |
| Labels | **Done** | A4 sheet of 8 or one per page, plus lab entrance cards. Browser print (Save as PDF). |
| Admin | **Done** | Labs with entrance links; accounts with deactivate/reactivate. Accounts are created by seed only. |
| Equipment photo | **Done** | Live in-app camera (viewfinder, shutter, retake) or upload from the device. |
| Mobile | **Done** | Every route audited at 375px with no horizontal overflow; header collapses to a menu below 1024px. |

**Verified on this tree:** `npm run check` (typecheck, lint with zero warnings, 17 tests including real
.xlsx/.docx generation) and `npm run build:fugo` pass. All eight migrations were applied
successfully against local Supabase (CLI 2.119) by the project owner.

---

## 2. Decisions confirmed by the client

From the open questions in the specification:

| Question | Answer |
| --- | --- |
| HOD interpretation | Technician **and** lab HOD can update; dean and senior leaders are view-only. |
| Public history | **Full** history, not a 5-event summary. |
| Alert thresholds | 30 / 7 / 0 days accepted. |
| Replacement email recipients | Lab technicians (and HOD) only; no procurement/bursary. |
| Hosting | **Supabase Cloud for now**, with the code ready to move on-premise. |
| QR codes | One permanent code per machine and one per lab, printed once; updates show through the same printed code. Enforced in the database. |
| Naming | One institution shows **EvidenceTag/FugoTag**, the other a plain "lab equipment inventory" name. *Still to confirm: real names, codes and domains for both* (§13). |

---

## 3. Architecture

```
 Phone / laptop browser (installable PWA)
 ┌──────────────────────────────────────────────┐
 │ React 18 + Vite + TypeScript                 │
 │  ├─ TanStack Query (server state, persisted) │
 │  ├─ Dexie / IndexedDB: equipment cache +     │
 │  │   write outbox (events, photos, reports)  │
 │  └─ Service worker (Workbox): app shell,     │
 │      photo cache, push handler               │
 └───────────────┬──────────────────────────────┘
                 │ supabase-js (anon/publishable key; RLS decides everything)
 ┌───────────────▼──────────────────────────────┐
 │ Supabase                                     │
 │  Postgres: tables, RLS, triggers (status,    │
 │    alerts, audit), pg_cron (07:00 due-date   │
 │    check, 5-min outbox dispatch)             │
 │  Storage: equipment-photos (public),         │
 │    documents, event-files (private)          │
 │  Auth: email + password, sign-up disabled    │
 │  Edge Functions: dispatch-outbox (email via  │
 │    Resend, Web Push), seed-users             │
 └──────────────────────────────────────────────┘
```

Principles that the code depends on:

1. **The server computes status.** `recompute_equipment_state()` sets `status`,
   `last_service_at` and `next_service_due` after every event. The client never does.
2. **History is append-only.** No update/delete on `events`; corrections are new rows.
   Service reports are locked after saving except for the replacement outcome (0008).
3. **QR tokens are immutable** (`equipment_qr_token_immutable`).
4. **Every device write has a device-generated UUID**, so offline saves never collide and
   retries never double-insert.
5. **Route guards are courtesy; RLS is security.** Never rely on hiding a button.

### Code layout

| Path | What lives there |
| --- | --- |
| `src/app/` | `AppShell` (header, desktop nav, mobile menu), `router.tsx` (every route and guard), auth and network providers |
| `src/features/<module>/` | Screens and queries for one module. Cross-feature imports go through that feature's `index.ts` only (`equipment`, `public-passport`). |
| `src/ui/` | Design-system components. Leaf layer: imports only `src/lib`. Includes `CameraCapture` (live camera) and `PhotoSource` (Take photo / Upload). |
| `src/offline/` | `db.ts` (Dexie schema), `outbox.ts`, `sync.ts` (push outbox, then pull), `network.ts` |
| `src/lib/` | Supabase client, institution branding, status labels, date helpers (Africa/Lagos) |
| `src/styles/tokens.css` | The only place colours, spacing and radii are defined |
| `supabase/migrations/` | `0001` schema · `0002` RLS · `0003` triggers · `0004` cron · `0005` institution + labs · `0006` accounts · `0007` storage buckets + policies · `0008` replacement outcome rules |
| `supabase/functions/` | `dispatch-outbox`, `seed-users`, `_shared/templates.ts` |
| `deploy/env/` | `.env.fugo.example`, `.env.instb.example` (real files are gitignored) |

---

## 4. Roles and routes

| Route | Who | Screen |
| --- | --- | --- |
| `/` | anyone | Forwards to the person's home (staff → `/staff`, leader → `/dashboard`, admin → `/admin`, signed out → `/login`) |
| `/e/:qrToken` | public | Equipment passport; update panel when signed in with rights for that lab |
| `/l/:labToken` | public | Lab entrance board |
| `/login` | public | Sign in (no sign-up) |
| `/change-password` | signed in | Forced on first sign-in |
| `/notifications` | signed in | Alerts |
| `/staff` | technician, HOD | My equipment |
| `/staff/equipment/new` | technician, HOD | Register equipment |
| `/staff/equipment/:id/event/:type` | technician, HOD | `use`, `fault`, `maintenance`, `inspection`, `service_report` |
| `/staff/equipment/:id/replacement` | technician, HOD | Replacement outcome |
| `/staff/labels` | technician, HOD | Print labels and lab entrance cards |
| `/dashboard` | HOD (own labs), senior leader (all) | Dashboard |
| `/reports` | technician, HOD, senior leader | Excel / Word exports |
| `/admin` | admin | Labs and accounts |
| anything else | — | "Page not found" |

A signed-in person who opens a route their role cannot use is sent to their own home.
Errors inside a screen render under the header, so the menu and sign out stay reachable.

---

## 5. Key flows

**Scan (public).** Camera opens `/e/<token>` → `get_public_equipment()` (security definer,
public fields only) → passport. Unknown code → "That label does not match any equipment".
Server unreachable → "can't be read right now".

**Register → label.** Technician fills the form → next asset number for the lab is
computed and inserted (unique constraint + retry handles two people at once) → QR token
generated → optional photo queued → label shown with *Print label*. Registering needs a
connection (the asset ID must be unique); everything after works offline.

**Record an event.** Passport → *Record an event* → choose type → form → saved to the
device outbox immediately → sync uploads files, inserts the event (and service report),
then the trigger recomputes status and due dates and raises any alert.

**Replacement.** Service report with *Replace* → status *Replacement recommended* +
critical alert + email with the report attached (weekly until resolved) → passport shows
*Record replacement outcome* → Replaced (choose the new machine) / Retired / Kept in
service (reason required) → alert closed; Replaced/Retired marks the machine retired.

**Photo.** Passport (or registration) → *Take photo* opens a live viewfinder from the
device camera → shutter → *Use photo* or *Retake*; *Upload* picks an existing image.
Compressed on the device to ~0.5 MB, queued, shown immediately, uploaded by sync.
The live camera needs https or localhost; on plain http the button falls back to the
phone's own camera app.

**Alerts.** Daily 07:00 Lagos: `check_due_dates()` writes tiered notifications and
outbox rows. Every 5 minutes: cron calls `dispatch-outbox`, which sends email (Resend)
and push, with retries. Dedupe key = equipment + tier + due date.

---

## 6. Offline — what works and the honest limit

| State | Detected when | What works |
| --- | --- | --- |
| online | server and internet reachable | everything |
| lan | server reachable, internet not (on-premise only) | everything except email/push, which queue |
| offline | server unreachable | staff devices: view cached equipment, record events, take photos, export register/schedule; all writes sync later |

**The limit:** offline works on devices that have opened the app before. On
**Supabase Cloud** the server *is* on the internet, so a campus internet outage means
`offline`, and **a first-time visitor's scan cannot load**. The client asked that scans
keep working without network; that requires the on-premise deployment in the spec (§6
of the spec: local server + split-horizon DNS). The application code is already written
for it; what is missing is the deployment kit (§12, item 4).

---

## 7. Going live on Supabase Cloud — checklist

Do these in order. Tick each one.

1. **Create the Supabase project** (one per institution), region closest to Nigeria.
2. **Edit the seeds before the first push.**
   - `supabase/migrations/0005_seed_institution.sql`: institution name and the lab list.
     Lab `code`s appear in every asset ID; settle them before printing any label.
   - `supabase/migrations/0006_seed_users.sql`: real names, emails, roles, labs, and
     temporary passwords. **Do not commit real passwords**: run it, then restore the
     placeholders.
3. **Push the schema.**
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```
4. **Auth settings** (Dashboard → Authentication → Sign In / Providers): keep **Email
   enabled**, turn **off** "Allow new users to sign up", turn off email confirmation.
5. **Vault secrets for the cron job** (SQL editor):
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'app_base_url');
   select vault.create_secret('<legacy service_role JWT>', 'service_role_key');
   ```
   `app_base_url` is the **Supabase project URL** (the function lives there), not the
   website. Use the legacy `service_role` **JWT** (Settings → API keys → Legacy) because
   the function is deployed with JWT verification; the new `sb_secret_` keys are not JWTs.
6. **Email.** Verify the sending domain in Resend (SPF + DKIM).
7. **Edge functions.**
   ```bash
   npx web-push generate-vapid-keys            # once; keep both keys
   npx supabase secrets set RESEND_API_KEY=... VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... APP_BASE_URL=https://<website>
   npx supabase functions deploy dispatch-outbox
   npx supabase functions deploy seed-users
   ```
   Here `APP_BASE_URL` is the **website** address used in email links.
8. **Frontend env** `deploy/env/.env.fugo`:
   ```
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<publishable key>
   VITE_PUBLIC_BASE_URL=https://evidencetag.<school-domain>   # printed into every QR
   ```
   **Set `VITE_PUBLIC_BASE_URL` before printing a single label.** The Labels page shows a red
   warning while codes would point at localhost or a LAN address.
9. **Build and host.** `npm run build:fugo` → upload `dist/` to any static host (Netlify,
   Vercel, Cloudflare Pages) on the institution domain. **Add an SPA fallback** (every path →
   `index.html`), otherwise opening `/e/<token>` directly returns the host's 404.
   Netlify: `_redirects` with `/* /index.html 200`. Vercel: a rewrite of `/(.*)` to `/`.
10. **Smoke test** on a phone over mobile data: sign in as each role, register a machine,
    take a photo, record a fault, scan the printed label signed out.
11. **Print** lab entrance cards and equipment labels; mark them printed.

Repeat for the second institution with `--mode instb` and its own project.

---

## 8. Local development and the problems already solved

```bash
npm ci
cp deploy/env/.env.fugo.example deploy/env/.env.fugo
npx supabase start        # Docker Desktop must be running
npx supabase db reset
npm run dev
```

Local env: `VITE_SUPABASE_URL=http://127.0.0.1:55321`, `VITE_SUPABASE_ANON_KEY=` the
**Publishable** key printed by `supabase start` (`npx supabase status` shows it again).
Studio: http://127.0.0.1:55323. Local email inbox (Mailpit): http://127.0.0.1:55324.

| Symptom | Cause | Fix (already applied in this repo) |
| --- | --- | --- |
| `failed to read config: CliConfigParseError` | `[[storage.buckets]]` array syntax | One table per bucket: `[storage.buckets.equipment-photos]` |
| `Bind for 0.0.0.0:54322 failed: port is already allocated` | another local Supabase project | This project uses ports **55320–55329** |
| `email_provider_disabled` on sign in | `[auth.email] enable_signup = false` turns off email login entirely | `[auth.email] enable_signup = true`; sign-ups stay blocked by `[auth] enable_signup = false` |
| GitHub push blocked: "Supabase Secret Key" | `supabase/.temp/` was committed | `.gitignore` covers `supabase/.temp/`; history rebuilt without it |
| Camera button opens a file picker on a phone | page served over plain http on a LAN IP | expected; the live camera needs https or localhost. Upload works everywhere |
| Labels warn "Do not print these for real yet" | `VITE_PUBLIC_BASE_URL` unset | set it to the live address |

Testing on a phone during development: `npm run dev -- --host`, open the `Network:`
address on the same Wi-Fi. For the live camera on a phone, use an https tunnel (for
example `npx localtunnel --port 5173` or Cloudflare Tunnel).

Applying a new migration without losing local data: `npx supabase migration up`.

---

## 9. Environment variables

Frontend (`deploy/env/.env.<mode>`, read at build time, all public):

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_INSTITUTION_CODE` | yes | Prefix of asset IDs, e.g. `FUGO` |
| `VITE_INSTITUTION_NAME` | yes | Shown in headers, labels, reports |
| `VITE_PRODUCT_NAME` | yes | e.g. `FugoTag` |
| `VITE_BRAND_PRIMARY`, `VITE_BRAND_ACCENT` | yes | Brand colours. **Quote them**: `"#0b4a28"` |
| `VITE_BRAND_LOGO_URL` | no | Logo image; wordmark renders when empty |
| `VITE_TIMEZONE` | no | Defaults to `Africa/Lagos` |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | yes | Project URL and publishable/anon key |
| `VITE_PUBLIC_BASE_URL` | yes before printing | Permanent address printed into QR codes |
| `VITE_HEALTH_URL` | no | Only for an on-premise health endpoint |

Server secrets (never in the frontend): `RESEND_API_KEY`, `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `APP_BASE_URL` (function secrets) and `app_base_url`,
`service_role_key` (Vault).

---

## 10. Operations runbook

| Task | How |
| --- | --- |
| Add a person | Add a row to `0006_seed_users.sql` and run the file in the SQL editor (idempotent; existing people untouched), or POST a private JSON file to `seed-users`. They must change the password at first sign-in. |
| Reset a password | Snippet at the foot of `0006_seed_users.sql`. |
| Someone leaves | Admin → Accounts → **Deactivate**. Their history stays attributed to them. |
| Move someone between labs | Snippet at the foot of `0006_seed_users.sql` (edits `lab_members`). |
| Add a lab | Insert into `labs` (see `0005`); print its entrance card from Labels. |
| Damaged label | Labels → untick "Only machines not printed yet" → select it → Print. Same code, same URL. |
| Machine replaced | Register the new machine first, then record the outcome on the old one as *Replaced*. |
| Wrong event entered | Record a new event that corrects it. Events cannot be edited by design. |
| Backups | Supabase Cloud: daily backups on paid plans; also export a weekly dump with `npx supabase db dump`. Storage buckets are not in the dump; back them up separately. |

---

## 11. Quick user guide

**Anyone (no account):** scan a machine's label to see its photo, status, safe operating
conditions, SOPs, service dates and history. Scan the code at the lab door to see every
machine in the lab.

**Technician / Lab HOD:**
- *My equipment* lists your labs' machines, most urgent first.
- Open a machine → **Record an event** → pick the type. It saves even with no signal.
- **Take photo** / **Upload** on a machine to set its profile picture.
- *Register* a new machine; print its label straight away or later from *Labels*.
- When an engineer recommends replacement, record the outcome from the machine's page.
- *Reports* for Excel and Word exports. HODs also have the *Dashboard*.

**Senior leader:** *Dashboard* for every lab, with charts and a filterable list; *Reports*
for any lab or all labs. View only.

**Administrator:** *Admin* for labs, entrance-board links and accounts.

---

## 12. Remaining work, in priority order

1. **Go live** on Supabase Cloud using §7, including the SPA fallback and
   `VITE_PUBLIC_BASE_URL`. Without this nothing is usable outside the developer's laptop.
2. **SOP and document upload** at registration and on the passport (the `documents` bucket,
   table and public SOP access are ready; there is no upload UI yet).
3. **Notifications:** push opt-in (`pushManager.subscribe` → `push_subscriptions`),
   per-user settings, Supabase Realtime on `notifications` for a live bell, and the weekly
   senior-leader digest.
4. **On-premise kit** (`deploy/docker-compose.yml`, Caddyfile, cloudflared, backup script)
   if first-time scans must work during an internet outage (§6).
5. **Edit equipment details** after registration (name, location, interval). Today only the
   photo can be changed after saving.
6. **End-to-end tests** (Playwright) for the offline save-and-sync path and each role's
   main flow.
7. **Generated database types:** `npm run gen:types` replaces the hand-written
   `src/lib/database.types.ts`; run `npm run check` afterwards and fix any casts it exposes.

Known limitations to communicate to users: registering needs a connection; the live camera
needs https; iOS push requires installing the app to the home screen; email and push need
internet.

---

## 13. Open items needing a decision

- Real names, short codes and domains for both institutions, and which one carries the
  EvidenceTag brand.
- Final seed list (names, emails, labs) for deans, HODs, technicians and admins. The
  current `0006` uses placeholders: two senior leaders, three HODs, four technicians, one admin.
- Whether to fund the on-premise server now or after the pilot (§6).

---

## 14. Quality gate

Before every push: `npm run check`. Before every release: `npm run build:fugo` and
`npm run build:instb`, then the smoke test in §7 step 10.

Conventions enforced by lint: no hex colours in `.tsx` (use tokens), no emoji, no
assignment to `.status`, accessibility rules (jsx-a11y). Layout rules: every screen uses
one of three `Container` widths; touch targets are 48px; only spacing steps defined in
`tailwind.config.ts` exist (0–6, 8, 10, 12, 16), so classes like `h-9` silently do nothing.
