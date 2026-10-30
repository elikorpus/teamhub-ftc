# Testing

Teams can turn on **any combination of tabs**, so most of the tests check that every combination still builds and
keeps its data safe.

| Command | What it checks | Time |
|---|---|---|
| `npm run typecheck` | TypeScript across every package, module and integration | ~10 s |
| `npm run lint` | ESLint (incl. the module-boundary rule: modules never import each other) + the SQL linter | ~15 s |
| `npm test` | Vitest: config schema, generator snapshots, wizard server (mocked Management API), module logic, and **every module's RLS rules on real Postgres** (PGlite), plus the upgrade and DB-budget tests | ~1 min |
| `npm run build:demo && npm run e2e` | Smoke + accessibility: every tab opens without console errors, Home, Ctrl+K or Cmd+K, axe in light/dark, desktop and phone | ~15 s |
| `npm run ci:matrix` | The module matrix (below) | ~4 min |

## Database tests (PGlite)

`tools/tests/db/harness.ts` runs real Postgres in-process with [PGlite](https://pglite.dev) and stubs just enough of
Supabase to apply the exact SQL plan the wizard would send:

- roles `anon`, `authenticated`, `service_role` and Supabase's default grants
- `auth.users` and `auth.uid()` (read from `request.jwt.claim.sub`, like PostgREST)
- `storage.buckets` / `storage.objects` with RLS
- an empty `supabase_realtime` publication

Helpers:

```ts
const db = await createTestDb();
await db.applyConfig(withModules(['tasks', 'calendar']), true); // fresh plan for this config
const mentor = await db.user('Mentor', { [TEAM_A]: 'mentor' });   // active user with memberships
await db.as(mentor, 'insert into task_items …');                  // runs as that user, with RLS
expect(await db.denied(member, 'delete from task_items …')).toBe(true);
```

Every module has a `<id>.test.ts` next to it covering who can read, write and delete, including cross-team
isolation and pending users.

**What PGlite doesn't cover:** Supabase's real auth server, Storage API, Realtime, `pg_cron`/`pg_net` (cron SQL is
excluded from test plans) and edge functions. Those are exercised by the release QA checklist below.

### Upgrade test

`tools/tests/db/upgrade.test.ts` applies the *previous* release's migrations, seeds data, then applies the current release
and checks the data survived (the expand-only rule). By default "previous" is simulated by dropping each module's newest
migration. Against a real tag:

```sh
git worktree add ../prev v1.0.0 && (cd ../prev && npm ci)
TEAMHUB_PREV_ROOT=../prev npm test -- tools/tests/db/upgrade.test.ts
```

### DB budget test

`tools/tests/db/budget.test.ts` seeds a generous "typical season" (20 people and every tab: 100 practices, 300 tasks, 200
notebook entries, 670 scouting entries, 3,000 notifications…) and asserts the database stays under **25 MB**
(it measures about 5 MB), so a free 500 MB Supabase project lasts for years.

## Module matrix

`npm run ci:matrix` generates, typechecks, builds, applies the SQL to a fresh PGlite database (twice, to prove
idempotency) and checks the bundle budget for:

- core only
- each of the 28 tabs alone
- all tabs
- 10 random subsets (the seed is printed; reproduce with `--seed`)

Options: `--only core,singles,all,random`, `--seed 1234`, `--count 3`, `--shard 2/4`, `--smoke` (also run the
Playwright smoke test per config), `--no-typecheck`.

### Bundle budget

`tools/scripts/check-bundle.ts` enforces: initial JavaScript ≤ 181 KB gzip for core only, plus 1.5 KB per enabled tab
(each tab adds a tiny always-loaded client); every lazy chunk ≤ 60 KB gzip (except the 3D model viewer); and
**disabled tabs contribute zero bytes**: each tab's client contains the marker `teamhub-module:<id>`, which must be
absent from the build when the tab is off.

## SQL linter

`tools/scripts/lint-sql.ts` (part of `npm run lint`) enforces for every module and integration:

- every table, function, trigger, policy, index, view and cron job starts with the unit's prefix
- migrations are expand-only: no `DROP TABLE`, `DROP COLUMN`, `RENAME` or column type changes
- a module never references another module's tables (integrations may reference their two modules)
- `security definer` functions set `search_path` and never test `current_user`
- `{{settings.x}}` placeholders exist and appear only in `policies.sql` / `cron.sql`

## Screenshots

`tools/tests/e2e/screens.spec.ts` captures light and dark screenshots for the docs:

```sh
npm run build:demo
SCREENSHOTS=docs/screenshots SCREEN_PAGES=/,/calendar,/tasks npm run e2e -- tools/tests/e2e/screens.spec.ts --project=desktop
```

`SCREEN_DATA` accepts JSON `{ "tables": { … }, "rpc": { … } }` to seed the mocked Supabase.

## Release QA checklist (manual, real services)

Run before tagging a release, with a throwaway Supabase project:

1. `npm run setup` from a fresh fork: every step, including FTCScout lookup, logo upload and the migration plan.
2. Apply to Supabase; create the admin; publish; deploy to each host (Cloudflare, Vercel, Netlify, GitHub Pages).
3. Sign up a second account on the live site > pending screen > approve as admin > member sees the right tabs.
4. Upload a photo (Media Gallery) and a model (To Manufacture); delete them; confirm the cleanup job empties storage.
5. Admin > reset link for a member; confirm the link works.
6. Wizard > Edit: add a tab, make one dormant, delete one; confirm data export, dormant read-only, and teardown.
7. Wizard > New Season, Backup & Export, Import into a second project.
8. Keep-alive workflow runs green from the Actions tab.
