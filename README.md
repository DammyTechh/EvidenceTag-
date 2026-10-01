# EvidenceTag

A digital passport for every piece of laboratory equipment. Scan the QR label
on a machine and read what it is, whether it is safe to use and when it was
last serviced. Only the lab technician and the lab HOD can change that record.
The dean sees every lab at once.

One React PWA plus Supabase. No separate backend server — all server logic
lives in PostgreSQL (RLS, triggers, pg_cron) and Edge Functions in this repo.

---

## One build, two institutions

The product is built once and deployed twice. **Nothing in `src/` branches on
which institution it is.** The whole difference:

| | Institution A | Institution B |
| --- | --- | --- |
| Shown name | FugoTag | Lab Equipment Register |
| Mark | supplied artwork | none — wordmark renders instead |
| `VITE_BRAND_PRIMARY` | `#0b4a28` | `#1d4e76` *(proposed)* |
| `VITE_BRAND_ACCENT` | `#e8b93f` | `#d49216` *(proposed)* |
| Asset ID | `FUGO-CHEM-0042` | `INSTB-CHEM-0042` |

```bash
pnpm build --mode fugo    # reads deploy/env/fugo.env
pnpm build --mode instb   # reads deploy/env/instb.env
```

Two colour values are written onto the document root at boot
(`src/lib/institution.ts`). `<Brandmark />` renders the image when a logo URL
is set and the wordmark when it is null. One pull request ships to both.

---

## Three rules the codebase is built around

**1. The client never computes status.** `equipment.status` and
`next_service_due` are written only by `recompute_equipment_state()` in
`0003_triggers.sql`, which runs after every event lands — whether it arrived
live or came up from a phone's outbox an hour later. There is no status
picker anywhere in the interface, and a lint rule rejects assignment to
`.status`.

**2. The history is append-only.** `events` has no update and no delete
policy, and a `before` trigger raises on both as a second line of defence. A
correction is a new row with `corrects_event_id` set, and both stay visible.
This record has to stand up in an audit.

**3. The QR token is permanent.** It is generated once at registration from a
30-character alphabet with the ambiguous letters removed, and
`equipment_qr_token_immutable` rejects any change to it. The label is printed
once and glued to the machine; every later update is read through that same
printed code. This is enforced in the database, not by convention.

---

## Offline, and the honest limit

Three network states, in `src/offline/network.ts`:

- **online** — server and internet reachable.
- **lan** — the server answers but the internet does not. Saving, viewing and
  in-app alerts all work; emails and push wait in `email_outbox` /
  `push_outbox`.
- **offline** — writes go to the device outbox in IndexedDB and sync by
  themselves later.

Event ids are generated on the device, so two technicians working offline in
the same lab merge without a conflict and a retry can never double-insert.

**The limit, stated plainly:** offline covers a device that has opened the app
before. A visitor scanning a label for the first time with no network has
nothing cached and will see the offline state. On **Supabase Cloud the `lan`
state cannot occur at all** — the server is on the internet, so a campus
outage lands straight in `offline` and a public scan fails. If a first-time
public scan must survive an outage, the on-premise server is needed from day
one. The code is already written for it; it is a deployment decision, not a
code change.

---

## Getting it running

Node 20 or newer. npm is what the lockfile is built for; `npm ci` reproduces
exactly the tree this was verified against.

```bash
npm install                                          # or: npm ci
cp deploy/env/.env.fugo.example deploy/env/.env.fugo # then fill it in
npm run dev
```

Then the database:

```bash
supabase start
supabase db reset     # runs 0001 to 0008: schema, RLS, triggers, jobs, seeds, storage, outcomes
npm run gen:types     # replaces src/lib/database.types.ts
```

**Before that first reset, edit two files.**

`supabase/migrations/0005_seed_institution.sql` holds the institution row and
the list of labs. The `code` on each lab appears in every asset ID
(`FUGO-CHEM2-0042`) and is what the user seed uses to place people, so settle
it before any label is printed.

`supabase/migrations/0006_seed_users.sql` holds every account: email, name,
role, a temporary password and the lab codes they may write to. There is no
sign-up page, so this file and the `seed-users` edge function are the only two
ways an account comes into existence. It is idempotent — re-running adds new
people and leaves everyone else untouched — and every account starts with
`must_change_password`, so the first sign-in forces a real password before any
other screen is reachable. Snippets at the foot of that file cover resetting
one password, moving someone between labs, deactivating a leaver, and listing
who can reach what.

Edit it locally, run it, then put the placeholder passwords back before you
push. On the hosted project you can paste either file straight into the SQL
editor.

Scripts: `dev`, `dev:instb`, `build:fugo`, `build:instb`, `typecheck`, `lint`,
`format`, `test`, `test:e2e`, `db:reset`, `gen:types`.

**Two things that will bite you if nobody says them.**

Environment files are named `.env.fugo` and `.env.instb` and live in
`deploy/env/`. That is Vite's convention: `--mode fugo` resolves to
`.env.fugo`. They are gitignored; the `.example` files are not.

Quote the hex values. An unquoted `#` starts a comment in a dotenv file, so
`VITE_BRAND_PRIMARY=#0b4a28` parses as **empty** and the whole brand silently
disappears. The build now refuses to start when a required value is missing
rather than shipping a blank header, but quote them anyway.

`VITE_HEALTH_URL` is optional and normally left unset. The network probe
derives it from `VITE_SUPABASE_URL` and sends the anon key with it, because
the Supabase gateway answers 401 to an unauthenticated request and that is
not the same thing as the server being down. Set it only for an on-premise
host that exposes its own health check.

Once per deployment:

1. Sign-ups are already disabled in `supabase/config.toml`. Confirm it in the
   hosted project too. There is no sign-up page and there should be no way
   around that.
2. Accounts come from `0006_seed_users.sql`. If you would rather create them
   from a private file that is never committed, copy
   `supabase/seed/users.example.json` to `users.fugo.json` (gitignored) and
   POST it to the `seed-users` edge function with the service role key — it
   does exactly the same thing.
3. Set the function secrets: `RESEND_API_KEY`, `VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`, `APP_BASE_URL`. None of them ever reach the frontend.
   The cron job in `0004_jobs.sql` also reads `app_base_url` and
   `service_role_key` from Supabase Vault — add them there.
4. Verify the Resend sending domain (SPF and DKIM).
5. Register equipment, print labels, stick them on.

### Verified

Run against this tree before it was packaged:

| | |
| --- | --- |
| `npm ci` from the lockfile | clean, no peer conflicts |
| `npm run typecheck` | passes |
| `npm run lint` | passes, zero warnings |
| `npm test` | 7 tests, passing |
| `npm run build:fugo` | passes |
| `npm run build:instb` | passes |
| `npm test` route + probe coverage | 15 tests |

`npm install` prints one deprecation notice for ESLint 9. That is cosmetic and
deliberate: `eslint-plugin-jsx-a11y` does not yet support ESLint 10, and
upgrading would reintroduce the peer conflict. Accessibility linting is worth
more than a clean install log. Move the whole toolchain up together when the
plugin catches up.

The bundle is split so a visitor scanning a label does not download the
dashboard: React, Supabase, the query layer, charts and forms are separate
chunks, the dashboard and reports screens load on demand, and ExcelJS is only
fetched when someone clicks Export.

## Layout

```
src/
  app/        shell, router, providers, auth and network context, route guards
  features/   one folder per module; each owns its queries, schemas and screens
  ui/         the design system components, and only these
  offline/    Dexie schema, outbox, sync, network probe
  lib/        supabase client, institution config, status map, dates
  styles/     tokens.css (generated from the design system), app.css
  sw.ts       service worker: precache, runtime caches, push handler
supabase/
  migrations/ 0001 schema · 0002 RLS · 0003 triggers · 0004 cron jobs
              0005 institution + labs · 0006 accounts (edit both)
              0007 storage buckets + storage policies
              0008 replacement outcome: retire on Replaced/Retired, lock reports
  functions/  dispatch-outbox, seed-users, shared email templates
  seed/       users.example.json, for the edge-function route
deploy/env/   one env file per institution
```

`src/ui` is a leaf: it imports from `lib` and nothing else. No feature reaches
into another feature's internals. That is what keeps the eight modules
independent enough for two people to work without colliding.

## Layout and responsiveness

Three column widths, in `src/ui/Container.tsx`, and every screen uses one:

- **form** (26rem) — sign in, change password.
- **reading** (36rem) — the passport, the lab board, event forms. These stay
  phone-shaped on a desktop monitor, because that is how they are used: a
  passport stretched to 1900px is unreadable, and widening it would not add a
  single thing a technician needs.
- **app** (80rem) — dashboards and tables, which genuinely want the width.

Action bars at the foot of a passport or a form are `sticky`, not `fixed`, so
they stay inside their column on a desktop instead of spanning the window, and
no screen needs bottom padding to clear them. Their bottom padding uses
`env(safe-area-inset-bottom)` so a phone's home indicator never covers a
button.

Touch targets are 48px everywhere and never shrink on desktop. Type steps up
at the `sm` breakpoint only where a heading would otherwise crowd a phone.

## The design system

Four colours: the brand green, one amber, one rust, and neutrals. Colour
carries **urgency**; the glyph and the word carry **which kind**. That is why
Overdue, Faulty and Replacement recommended share one rust without ever being
confused for each other, and why the set survives greyscale printing and
red–green colour blindness.

Fonts are Archivo for everything a person reads and IBM Plex Mono for
everything a machine assigned — asset IDs, serials, tokens, timestamps.
Icons are Material Symbols Rounded, a real font. There are no emoji in this
codebase and a lint rule keeps it that way.

Tokens live in `src/styles/tokens.css` and nowhere else. Tailwind reads the
same custom properties, so there is no second palette and no hex literal in
any `.tsx` file.

---

## What is built, and what is not

Honest inventory, so nobody discovers this halfway through a sprint.

**Complete and reviewed**

- All four migrations: schema, RLS with the two public read functions, the
  status/alert/audit triggers, and the cron jobs.
- The offline layer end to end: Dexie schema, outbox, three-state network
  probe, push-then-pull sync with device-generated ids.
- `dispatch-outbox` and `seed-users` edge functions, and the tiered email
  templates that match the in-app banners.
- The design system in code: tokens, Tailwind binding, and the components in
  `src/ui`.
- Four screens built out: public passport, lab entrance board, sign in, and
  the fault form (the one with real consequences).
- Lint rules, type config, Supabase config, and tests for the two rules most
  likely to be broken by accident.

- Storage (`0007_storage.sql`): the three buckets — `equipment-photos`
  (public), `documents`, `event-files` — with size and type limits, and
  storage policies that mirror the table RLS. `config.toml` only creates
  buckets locally; the hosted project gets them from this migration.
- Equipment profile photo: a technician or HOD in the machine's lab can take
  a photo with the phone camera (or pick one) from the passport. Compressed
  on the device, queued offline like an event, shown at once from the device,
  then uploaded by sync. Photos also appear as thumbnails on the lab board.
- Event photos now get their `event_attachments` rows when they sync.

- Header navigation per role, unread-alert count, and sign out (which also
  clears the cached data so the next person on the device sees none of it).
- `StaffHomePage` (urgent first, search, photos), `RegisterEquipmentPage`
  (asset ID, permanent QR, optional photo, printable label), `DashboardPage`
  (status tiles filter the table; HODs scoped by RLS), `AdminPage` (labs with
  entrance links, accounts with deactivate/reactivate), `AlertsPage`.

- All five event forms (use, fault, maintenance, inspection, external
  service report with the signed report attached), reached from the update
  panel on the passport. All save offline first.
- `ReplacementOutcomePage`: Replaced (linked to the new machine), Retired, or
  Kept in service with a reason. Closes the weekly critical email.
- `LabelsPage`: equipment labels (A4 sheet of 8, or one per page) and lab
  entrance cards, printed through the browser (Save as PDF for a PDF), with
  "mark as printed". Codes use `VITE_PUBLIC_BASE_URL`; the page refuses to
  look finished while that would point at localhost.
- `ReportsPage`: Excel (register, service schedule, fault log, event history)
  and Word (equipment report, lab summary). Register and schedule work
  offline from the device copy.

**Not started**
- Push subscription opt-in (`push_subscriptions` is written and read; nothing
  calls `registration.pushManager.subscribe` yet).
- Supabase Realtime on `notifications`, which is what makes the in-app bell
  live on a LAN with no internet.
- Playwright offline end-to-end tests.
- `deploy/docker-compose.yml`, `Caddyfile` and `cloudflared` for on-premise.
  Not needed on Supabase Cloud; needed the day a first-time public scan has to
  survive an outage.

**Not executed**

The SQL has been written and read carefully but has not been run against a
live Postgres in this environment. Run `supabase db reset` first and fix what
it reports before building on top of it.
