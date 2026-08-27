# Supabase Complete Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy backend and media storage with Supabase while preserving every city, category, product, price, translation, media item, user, permission, request, history entry and setting.

**Architecture:** Keep the existing React/TanStack UI and replace its backend adapter with Supabase Postgres, Auth, Storage, Realtime and Edge Functions. Import a validated JSON snapshot in dependency order, migrate media to Storage, activate migrated usernames with one-time codes, then perform a short final synchronization and Vercel cutover.

**Tech Stack:** React 19, TanStack Router/Query, TypeScript 5.8, Vite 8, Supabase JS, Supabase CLI, PostgreSQL/RLS, Deno Edge Functions, Vitest, Testing Library, MyMemory Translation API.

**Spec:** `docs/superpowers/specs/2026-08-27-supabase-complete-migration-design.md`

## Global Constraints

- Supabase is the only official backend after cutover.
- Automatic PT/EN/ES translation runs only on creation; later edits update only the selected language.
- Money uses PostgreSQL `numeric(14,2)` and TypeScript decimal strings at the persistence boundary.
- Never expose service-role or activation secrets in browser code, logs or commits.
- Do not delete or modify source data during rehearsal imports.
- Do not rewrite Lovable-published Git history.
- The current workspace has no detectable `.git`; commit steps must be recorded as skipped until repository metadata is restored, and no new repository is initialized automatically.

---

### Task 1: Test Harness and Supabase Client Boundary

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/lib/supabase/env.ts`
- Create: `src/lib/supabase/client.ts`
- Test: `src/lib/supabase/env.test.ts`

**Interfaces:**
- Produces: `getSupabaseBrowserEnv(): { url: string; anonKey: string }`
- Produces: `supabase`, a singleton browser client with persisted Auth session.

- [ ] **Step 1: Add the failing environment test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { getSupabaseBrowserEnv } from './env';

describe('getSupabaseBrowserEnv', () => {
  it('rejects missing public configuration', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    expect(() => getSupabaseBrowserEnv()).toThrow('SUPABASE_NOT_CONFIGURED');
  });
});
```

- [ ] **Step 2: Install and run the test to verify failure**

Run: `pnpm add @supabase/supabase-js && pnpm add -D vitest @testing-library/react @testing-library/jest-dom jsdom`

Run: `pnpm vitest run src/lib/supabase/env.test.ts`

Expected: FAIL because `./env` does not exist.

- [ ] **Step 3: Add Vitest configuration and the environment guard**

```ts
export function getSupabaseBrowserEnv() {
  const url = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!url || !anonKey) throw new Error('SUPABASE_NOT_CONFIGURED');
  return { url, anonKey };
}
```

Create the singleton with `createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })`.

- [ ] **Step 4: Run checks**

Run: `pnpm vitest run src/lib/supabase/env.test.ts && pnpm lint && pnpm build`

Expected: all commands exit 0.

- [ ] **Step 5: Commit when Git metadata is available**

Run: `git add package.json pnpm-lock.yaml vitest.config.ts src/test src/lib/supabase && git commit -m "test: add Supabase client boundary"`

Expected in the current workspace: record `SKIPPED_NO_GIT_METADATA` instead of initializing a repository.

### Task 2: PostgreSQL Catalog and User Schema

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/202608270001_extensions_and_types.sql`
- Create: `supabase/migrations/202608270002_catalog_schema.sql`
- Create: `supabase/migrations/202608270003_identity_and_operations_schema.sql`
- Create: `supabase/tests/schema.test.sql`

**Interfaces:**
- Produces: the tables and enums named in sections 4.1–4.3 of the spec.
- Produces: generated UUIDs, timestamps and uniqueness constraints required by repositories.

- [ ] **Step 1: Write schema assertions first**

```sql
begin;
select plan(8);
select has_table('public', 'cities');
select has_table('public', 'products');
select has_table('public', 'product_prices');
select has_table('public', 'profiles');
select has_table('public', 'activation_codes');
select has_table('public', 'access_requests');
select col_type_is('public', 'product_prices', 'amount', 'numeric(14,2)');
select col_is_unique('public', 'profiles', 'username_normalized');
select * from finish();
rollback;
```

- [ ] **Step 2: Run the local database tests to verify failure**

Run: `supabase start && supabase db reset && supabase test db`

Expected: FAIL because the schema is absent.

- [ ] **Step 3: Implement enums, catalog tables and constraints**

Define `content_language`, `currency_code`, `user_role`, `profile_status`, `access_request_status`, `translation_status` and `media_type`. Add foreign keys with explicit delete behavior, unique `(scope_id, position)` constraints, `amount numeric(14,2) check (amount >= 0)`, and indexes for every filtering/sorting key in the spec.

- [ ] **Step 4: Implement identity, request, audit and job tables**

Use `citext` or stored lowercase normalization for usernames, immutable snapshots in `access_history`, JSONB before/after fields in `audit_events`, and unique idempotency keys in `migration_runs` and `translation_jobs`.

- [ ] **Step 5: Reset and test the database**

Run: `supabase db reset && supabase test db`

Expected: all 8 pgTAP assertions pass.

- [ ] **Step 6: Commit when Git metadata is available**

Run: `git add supabase && git commit -m "feat: add Supabase catalog and identity schema"`

### Task 3: RLS, Transactional Reordering and Audit Functions

**Files:**
- Create: `supabase/migrations/202608270004_authorization.sql`
- Create: `supabase/migrations/202608270005_catalog_functions.sql`
- Create: `supabase/tests/rls.test.sql`
- Create: `supabase/tests/reorder.test.sql`

**Interfaces:**
- Produces: `can_access_city(uuid) returns boolean`
- Produces: `has_product_permission(text, uuid) returns boolean`
- Produces: `reorder_cities(uuid[])`, `reorder_categories(uuid, uuid[])`, `reorder_products(uuid, uuid[])`.

- [ ] **Step 1: Add failing RLS and reorder tests**

Create fixtures for Owner, Commercial restricted to one city, request manager and Viewer. Assert cross-city reads/writes fail, assigned-city reads pass, missing permission writes fail, and reordering persists contiguous positions.

- [ ] **Step 2: Run tests to verify failure**

Run: `supabase db reset && supabase test db`

Expected: FAIL because policies/functions are missing.

- [ ] **Step 3: Implement helper functions and policies**

Every privileged function must include:

```sql
security definer
set search_path = public, auth
```

Validate `auth.uid()` inside each function. Enable RLS on all public tables and Storage objects. Viewer policies require the city claim; Commercial policies require both city assignment and action permission.

- [ ] **Step 4: Implement transactional reordering**

Reject duplicate, missing or foreign IDs before updating positions in one transaction. Write an `audit_events` row containing the previous and new order.

- [ ] **Step 5: Run database tests**

Run: `supabase db reset && supabase test db`

Expected: schema, RLS and reorder tests pass.

- [ ] **Step 6: Commit when Git metadata is available**

Run: `git add supabase && git commit -m "feat: enforce catalog authorization and ordering"`

### Task 4: Username Authentication and Activation Codes

**Files:**
- Create: `supabase/functions/_shared/cors.ts`
- Create: `supabase/functions/_shared/admin.ts`
- Create: `supabase/functions/activate-user/index.ts`
- Create: `supabase/functions/create-activation-code/index.ts`
- Create: `src/app/supabase/authRepository.ts`
- Modify: `src/app/auth.tsx`
- Modify: `src/app/components/Login.tsx`
- Test: `src/app/supabase/authRepository.test.ts`

**Interfaces:**
- Produces: `normalizeUsername(username: string): string`
- Produces: `usernameToTechnicalEmail(username: string): string`
- Produces: `login(username: string, password: string): Promise<SessionData>`
- Produces: `activate({ username, code, password }): Promise<void>`.

- [ ] **Step 1: Write failing normalization and login adapter tests**

```ts
it('maps usernames case-insensitively without exposing an address in UI', () => {
  expect(normalizeUsername('  Owner ')).toBe('owner');
  expect(usernameToTechnicalEmail('Owner')).toBe('owner@users.comercial.invalid');
});
```

Mock Supabase Auth and assert `login('Owner', secret)` calls `signInWithPassword` using the technical email.

- [ ] **Step 2: Run the test to verify failure**

Run: `pnpm vitest run src/app/supabase/authRepository.test.ts`

Expected: FAIL because the repository does not exist.

- [ ] **Step 3: Implement activation Edge Functions**

Generate 10-character uppercase codes with cryptographic randomness, store only SHA-256 hash, expire after 24 hours, cap failed attempts at 5, consume atomically, update the Auth password through Admin API and set profile status to `active`.

- [ ] **Step 4: Replace custom token handling in AuthProvider**

Use `supabase.auth.getSession()` at startup and `onAuthStateChange` afterward. Fetch `profiles`, `user_cities` and permissions into the existing `AuthUser` shape. Remove periodic legacy session validation.

- [ ] **Step 5: Add the first-access UI**

The login screen must expose a deliberate “Ativar conta” flow with username, code, new password and confirmation. It must never display the technical email.

- [ ] **Step 6: Run tests and build**

Run: `pnpm vitest run src/app/supabase/authRepository.test.ts && pnpm lint && pnpm build`

Expected: all commands exit 0.

- [ ] **Step 7: Commit when Git metadata is available**

Run: `git add supabase/functions src/app/auth.tsx src/app/components/Login.tsx src/app/supabase && git commit -m "feat: add username activation auth"`

### Task 5: Catalog Query Repository and Type Mapping

**Files:**
- Create: `src/app/supabase/catalogRepository.ts`
- Create: `src/app/supabase/mappers.ts`
- Modify: `src/app/types.ts`
- Modify: `src/app/catalog.tsx`
- Test: `src/app/supabase/mappers.test.ts`
- Test: `src/app/supabase/catalogRepository.test.ts`

**Interfaces:**
- Produces: `fetchCatalogPage({ cityId, categoryId, language, limit, cursor }): Promise<CatalogPage>`
- Produces: `fetchCatalogMetadata(language): Promise<{ cities: City[]; categories: Category[] }>`
- Produces: mapping functions that preserve the existing UI domain types.

- [ ] **Step 1: Write failing mapper tests for money, translations and order**

Assert PostgreSQL numeric strings such as `'60000.00'` map to UI price values without rounding, missing selected-language text falls back to source language, and positions remain stable.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm vitest run src/app/supabase/mappers.test.ts src/app/supabase/catalogRepository.test.ts`

Expected: FAIL because repository and mappers are absent.

- [ ] **Step 3: Implement targeted queries**

Fetch cities/categories separately from product pages. Product queries select translations, prices and ordered media only for the requested category. Return a cursor based on `(position,id)` and never fetch the entire cross-city catalog for normal browsing.

- [ ] **Step 4: Update the catalog provider**

Use React Query keys `['catalog-metadata', language]` and `['products', cityId, categoryId, language, cursor]`. Preserve existing component props so visual behavior remains unchanged.

- [ ] **Step 5: Run tests, lint and build**

Run: `pnpm vitest run src/app/supabase && pnpm lint && pnpm build`

Expected: all commands exit 0.

- [ ] **Step 6: Commit when Git metadata is available**

Run: `git add src/app && git commit -m "feat: read catalog from Supabase"`

### Task 6: Catalog Mutations, Clone and Ordering

**Files:**
- Create: `src/app/supabase/catalogMutations.ts`
- Modify: `src/app/components/CityForm.tsx`
- Modify: `src/app/components/CategoryForm.tsx`
- Modify: `src/app/components/ProductForm.tsx`
- Modify: `src/app/components/CloneDialog.tsx`
- Test: `src/app/supabase/catalogMutations.test.ts`

**Interfaces:**
- Produces: `saveCity`, `saveCategory`, `saveProduct`, `saveDescriptionTemplate`, `cloneProduct`, `cloneCategory`, delete functions and reorder functions matching existing payload types.

- [ ] **Step 1: Write failing mutation contract tests**

Assert product editing upserts only the selected `product_translations` row, creation queues missing translations, description templates preserve three separate languages, clone-category copies products/prices/translations/media references to new IDs, and reorder calls the transactional RPC.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm vitest run src/app/supabase/catalogMutations.test.ts`

Expected: FAIL because mutations are absent.

- [ ] **Step 3: Implement mutations with permission-safe RPCs**

Use database RPCs for multi-table saves/clones/reorders so partial writes cannot occur. Pass money as fixed decimal strings. Return invalidation metadata instead of a full catalog snapshot.

- [ ] **Step 4: Wire existing forms and progress modals**

Keep current visual components, replace legacy backend calls, surface Postgres/Edge Function error codes through the existing Toast system, and invalidate only affected React Query keys.

- [ ] **Step 5: Run checks**

Run: `pnpm vitest run src/app/supabase/catalogMutations.test.ts && pnpm lint && pnpm build`

Expected: all commands exit 0.

- [ ] **Step 6: Commit when Git metadata is available**

Run: `git add src/app && git commit -m "feat: move catalog mutations to Supabase"`

### Task 7: Supabase Storage Media Pipeline

**Files:**
- Create: `supabase/migrations/202608270006_storage.sql`
- Create: `supabase/functions/ingest-product-media/index.ts`
- Create: `src/app/supabase/mediaRepository.ts`
- Modify: `src/app/media.ts`
- Modify: `src/app/imagePreload.ts`
- Delete after cutover: the legacy media-upload module.
- Test: `src/app/supabase/mediaRepository.test.ts`

**Interfaces:**
- Produces: `uploadProductMedia(input): Promise<ProductImage>`
- Produces: deterministic Storage paths and CDN URLs for original/display/thumbnail variants.

- [ ] **Step 1: Write failing path and validation tests**

Assert invalid MIME, oversized payload and unsupported scheme are rejected; valid paths match `products/{productId}/{mediaId}/{variant}.{ext}`.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm vitest run src/app/supabase/mediaRepository.test.ts`

Expected: FAIL because media repository is absent.

- [ ] **Step 3: Create buckets and Storage policies**

Create `product-media` with public read for catalog objects and authenticated permission-checked writes. Do not allow users to choose arbitrary object prefixes.

- [ ] **Step 4: Implement ingestion and frontend upload**

Validate MIME and byte length server-side, compute SHA-256 for deduplication, create variants, store metadata, then return `ProductImage`. Existing external video links remain references with stored thumbnails.

- [ ] **Step 5: Run checks**

Run: `supabase db reset && supabase test db && pnpm vitest run src/app/supabase/mediaRepository.test.ts && pnpm build`

Expected: all commands exit 0.

- [ ] **Step 6: Commit when Git metadata is available**

Run: `git add supabase src/app && git commit -m "feat: move product media to Supabase Storage"`

### Task 8: Translation Jobs

**Files:**
- Create: `supabase/functions/process-translation/index.ts`
- Create: `supabase/functions/_shared/free-translate.ts`
- Create: `src/app/supabase/translationRepository.ts`
- Modify: `src/app/components/ProductForm.tsx`
- Modify: `src/app/components/CategoryForm.tsx`
- Test: `src/app/supabase/translationRepository.test.ts`

**Interfaces:**
- Produces: `queueCreationTranslations(entityType, entityId, sourceLanguage)`
- Produces: `translateSelectedLanguage(entityType, entityId, targetLanguage, overwrite)`.

- [ ] **Step 1: Write failing translation behavior tests**

Assert creation queues exactly the two missing target languages; editing Portuguese queues nothing and leaves English/Spanish unchanged; manual translation requires `overwrite=true` for existing text.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm vitest run src/app/supabase/translationRepository.test.ts`

Expected: FAIL because repository is absent.

- [ ] **Step 3: Implement the free MyMemory translation wrapper**

Use the public MyMemory endpoint without a billing account or API key. Preserve supported HTML tags, split visible text into UTF-8 chunks of at most 450 bytes, apply exponential retry for 429/5xx, and store provider errors for later retry.

- [ ] **Step 4: Implement queue processing and UI semantics**

Creation returns immediately after original content is committed. Realtime updates translations when jobs complete. Failed jobs display a retry action; edit forms mutate only the selected language.

- [ ] **Step 5: Run checks**

Run: `pnpm vitest run src/app/supabase/translationRepository.test.ts && pnpm lint && pnpm build`

Expected: all commands exit 0.

- [ ] **Step 6: Commit when Git metadata is available**

Run: `git add supabase src/app && git commit -m "feat: translate new content through Edge Functions"`

### Task 9: Realtime and Persistent Query Cache

**Files:**
- Create: `src/app/supabase/realtime.ts`
- Create: `src/app/queryClient.ts`
- Modify: `src/app/catalog.tsx`
- Modify: `src/app/App.tsx`
- Test: `src/app/supabase/realtime.test.ts`

**Interfaces:**
- Produces: `subscribeToCatalog(queryClient, scope): () => void`
- Produces: persistent React Query cache with schema/version key.

- [ ] **Step 1: Write failing invalidation tests**

Assert a product event invalidates only the product/category/city keys involved, permission events refetch the current profile, and reconnect triggers scoped revalidation.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm vitest run src/app/supabase/realtime.test.ts`

Expected: FAIL because subscriber is absent.

- [ ] **Step 3: Implement scoped subscriptions and cache persistence**

Subscribe by table and filter where supported; map payload IDs to query keys. Persist only public catalog results and never persist activation codes, service data or privileged user lists.

- [ ] **Step 4: Remove catalog polling**

Delete the 2.5-second sync interval and full-snapshot replacement from `catalog.tsx`. Revalidate on focus/reconnect and after mutation.

- [ ] **Step 5: Run checks**

Run: `pnpm vitest run src/app/supabase/realtime.test.ts && pnpm lint && pnpm build`

Expected: all commands exit 0.

- [ ] **Step 6: Commit when Git metadata is available**

Run: `git add src/app && git commit -m "feat: add realtime catalog updates"`

### Task 10: Users, Permissions and Access Requests

**Files:**
- Create: `src/app/supabase/usersRepository.ts`
- Create: `src/app/supabase/accessRequestsRepository.ts`
- Modify: `src/app/components/UserManagement.tsx`
- Modify: `src/app/components/AccessRequestsModal.tsx`
- Modify: `src/app/components/RoleSelect.tsx`
- Test: `src/app/supabase/usersRepository.test.ts`
- Test: `src/app/supabase/accessRequestsRepository.test.ts`

**Interfaces:**
- Produces: typed list/save/deactivate/generate-code functions.
- Produces: list/approve/reject requests restricted by RLS and city assignment.

- [ ] **Step 1: Write failing repository tests**

Assert permission flags round-trip, `cloneCategory` is independent of `cloneProduct`, assigned-city request managers cannot approve other cities, and approval writes an immutable cities/role snapshot.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm vitest run src/app/supabase/usersRepository.test.ts src/app/supabase/accessRequestsRepository.test.ts`

Expected: FAIL because repositories are absent.

- [ ] **Step 3: Implement repositories and Edge Function calls**

User creation, activation-code generation and privileged role changes go through Edge Functions. Ordinary filtered reads use Supabase queries protected by RLS. Do not allow request managers to send role/permission overrides.

- [ ] **Step 4: Wire the existing management UI**

Add activation status/code generation to user editing, keep city/cargo/date filters, pending-request badge and history detail, and preserve PT/EN/ES localization.

- [ ] **Step 5: Run checks**

Run: `pnpm vitest run src/app/supabase/usersRepository.test.ts src/app/supabase/accessRequestsRepository.test.ts && pnpm lint && pnpm build`

Expected: all commands exit 0.

- [ ] **Step 6: Commit when Git metadata is available**

Run: `git add src/app && git commit -m "feat: migrate users and access requests"`

### Task 11: Supabase Backup and Restore UI

**Files:**
- Create: `supabase/functions/export-backup/index.ts`
- Create: `supabase/functions/import-backup/index.ts`
- Create: `src/app/supabase/backupRepository.ts`
- Modify: `src/app/components/BackupDialog.tsx`
- Test: `src/app/supabase/backupRepository.test.ts`

**Interfaces:**
- Produces: `exportBackup(): Promise<BackupResult>`
- Produces: `listBackups(): Promise<BackupRecord[]>`
- Produces: `importBackup(file: File): Promise<{ migrationRunId: string }>`.

- [ ] **Step 1: Write failing backup contract tests**

Assert exports contain schema version, cities, categories, translations, products, prices, media metadata, templates, profiles, city assignments, permissions, requests, histories and settings; assert no password hash, activation-code hash, service key, signed URL or legacy delete URL is present.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm vitest run src/app/supabase/backupRepository.test.ts`

Expected: FAIL because the repository is absent.

- [ ] **Step 3: Implement protected export and import functions**

Allow Owner only. Export a versioned JSON file to a private `backups` bucket and record metadata. Import into a new `migration_runs` entry, validate the entire document before writes, and reuse the same transactional import rules as the migration tool.

- [ ] **Step 4: Connect the existing Backup screen**

Keep “Gerar Backup”, “Importar Backup” and the registered-backup list. Show file name, unique ID, creation time, counts and validation errors without exposing secrets.

- [ ] **Step 5: Run checks**

Run: `pnpm vitest run src/app/supabase/backupRepository.test.ts && pnpm lint && pnpm build`

Expected: all commands exit 0.

- [ ] **Step 6: Commit when Git metadata is available**

Run: `git add supabase/functions src/app && git commit -m "feat: add Supabase backup operations"`

### Task 12: Deterministic Snapshot and Migration Tool

**Files:**
- Create: `scripts/migration/schema.mjs`
- Create: `scripts/migration/normalize-snapshot.mjs`
- Create: `scripts/migration/import-snapshot.mjs`
- Create: `scripts/migration/migrate-media.mjs`
- Create: `scripts/migration/verify-migration.mjs`
- Create: `scripts/migration/__tests__/normalize-snapshot.test.mjs`
- Create: `scripts/migration/__tests__/verify-migration.test.mjs`
- Create: `work/migration/.gitkeep`

**Interfaces:**
- Consumes: current Owner backup JSON.
- Produces: normalized immutable JSON, migration run ID, import report and verification report.

- [ ] **Step 1: Write fixture-driven failing migration tests**

Create synthetic fixtures containing multiple cities, duplicate-case usernames, multilingual products, all currencies, product order, user permissions and failed media URLs. Assert normalization is deterministic and verification detects every mismatch class from section 10 of the spec.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm vitest run scripts/migration/__tests__`

Expected: FAIL because migration modules are absent.

- [ ] **Step 3: Implement normalization and idempotent imports**

Map legacy IDs to stable UUIDv5 values, preserve original IDs in `import_key`, parse money without floating-point math, normalize language/currency values, discard legacy password/hash and media delete-URL fields, and upsert using migration-run idempotency keys.

- [ ] **Step 4: Implement media transfer**

Download with bounded concurrency, validate bytes/MIME, hash for deduplication, upload variants and record per-object results. Never log signed URLs, keys or user passwords.

- [ ] **Step 5: Implement verification gates**

Compare totals by city/category, ordered ID sequences, price tuples, translation presence, media hashes, users/cities/permissions and request/history snapshots. Exit nonzero on any blocking mismatch.

- [ ] **Step 6: Run migration tests**

Run: `pnpm vitest run scripts/migration/__tests__`

Expected: all migration tests pass.

- [ ] **Step 7: Commit when Git metadata is available**

Run: `git add scripts work/migration/.gitkeep && git commit -m "feat: add verified legacy snapshot migrator"`

### Task 13: Legacy Removal, Deployment and Cutover Verification

**Files:**
- Modify: `src/app/api.ts`
- Delete after verified cutover: the legacy backend source.
- Delete after verified cutover: `outputs/Code-Apps-Script-Atualizado.gs`
- Delete after verified cutover: the legacy media-upload module.
- Modify: `README.md`
- Modify: `ATUALIZACAO.md`
- Create: `.env.example`
- Create: `docs/operations/supabase-cutover-checklist.md`
- Create: `docs/operations/supabase-rollback-checklist.md`

**Interfaces:**
- Produces: a production build with no legacy backend or media runtime references.
- Produces: repeatable cutover and rollback evidence.

- [ ] **Step 1: Add a legacy-reference gate**

Run: audit the frontend for retired backend URLs, variables and media endpoints.

Expected before cleanup: matches identify every legacy dependency.

- [ ] **Step 2: Rehearse import against a fresh Supabase database**

Generate a current backup from the Owner panel only after action-time confirmation, import it into the new project, migrate media, and run `verify-migration.mjs`. Save the non-sensitive report under `work/migration/`.

Expected: zero blocking mismatches.

- [ ] **Step 3: Execute role-based smoke tests**

Verify Owner CRUD/reorder/clone/translate, restricted Commercial permissions, request-manager city boundaries, Viewer read-only behavior, activation, session renewal and two-browser Realtime updates.

Expected: every row in `docs/operations/supabase-cutover-checklist.md` records PASS.

- [ ] **Step 4: Perform the final synchronized cutover**

Pause edits, generate/import the final snapshot, re-run verification, configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel, deploy, and run production smoke tests. Creating the Supabase project, persistent keys and transmitting the backup require action-time browser confirmation.

- [ ] **Step 5: Remove legacy runtime code only after acceptance**

Delete legacy backend and media modules, update documentation, and remove the old Vercel environment variable. Keep the source system untouched for the defined rollback observation window.

- [ ] **Step 6: Run the final local gates**

Run: `pnpm vitest run && pnpm lint && pnpm build`

Run: audit the frontend for retired backend URLs, variables and media endpoints.

Expected: tests/lint/build exit 0 and the legacy-reference search returns no runtime matches.

- [ ] **Step 7: Commit when Git metadata is available**

Run: `git add -A && git commit -m "feat: complete Supabase cutover"`

Expected: one additive commit on the connected branch; never amend, rebase or force-push Lovable history.
