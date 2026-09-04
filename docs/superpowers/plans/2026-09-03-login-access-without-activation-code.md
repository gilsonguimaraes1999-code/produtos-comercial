# Login and Access Without Activation Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace activation-code onboarding with a password-at-request flow, restore all public entry flows on a new free Supabase project, and validate the complete UI locally before publication.

**Architecture:** A public `request-access` Edge Function receives the password and sends it directly to Supabase Auth; application tables store only the pending Auth user id and request metadata. Approval atomically creates an active profile linked to that identity, while rejection removes the pending identity. The frontend removes all activation-code UI and calls the Edge Function instead of submitting a public SQL RPC directly.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Supabase Auth/Postgres/Edge Functions, Deno tests, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-03-login-access-without-activation-code-design.md`

## Global Constraints

- Validate all changes on localhost before any GitHub or Vercel publication.
- Do not enable Supabase billing.
- Never store passwords in application tables, logs, snapshots, browser storage, or commits.
- Never expose the Supabase service-role key to the browser bundle.
- Keep product media outside Supabase Storage and preserve valid external media URLs.
- Preserve existing users, permissions, cities, categories, products, translations, prices, history, and relevant requests.
- Do not rewrite published Git history; use normal commits only.

## File Structure

- `supabase/migrations/202609030001_password_based_access_requests.sql`: schema and transactional request-review functions for pending Auth identities.
- `supabase/functions/request-access/handler.ts`: pure validation and compensation workflow for creating a pending Auth identity.
- `supabase/functions/request-access/adapter.ts`: HTTP/CORS boundary and stable error mapping.
- `supabase/functions/request-access/index.ts`: Supabase Admin and Postgres runtime wiring.
- `supabase/functions/request-access/handler_test.ts`: Deno unit tests for validation, success, retry, and cleanup.
- `supabase/functions/review-access-request/handler.ts`: approval/rejection workflow using the Auth identity already reserved by the request.
- `supabase/functions/review-access-request/adapter.ts`: review runtime contract without activation generation.
- `supabase/functions/review-access-request/index.ts`: production runtime for profile activation and rejected-user cleanup.
- `src/app/supabase/accessRequestsRepository.ts`: browser calls to request/review Edge Functions.
- `src/app/types.ts`: request/review types without activation payloads.
- `src/app/auth.tsx`: authentication context without activation methods.
- `src/app/components/Login.tsx`: request password/confirmation UI and no first-access mode.
- `src/i18n/index.tsx`: localized copy for the new request/login states.
- Corresponding `*.test.*` files: regression coverage.

---

### Task 1: Transactional Pending Identity Schema

**Files:**
- Create: `supabase/migrations/202609030001_password_based_access_requests.sql`
- Create: `supabase/tests/password_access_requests.test.sql`

**Interfaces:**
- Produces: `submit_access_request_v3(text, text, uuid[], text, uuid, uuid) returns uuid`
- Produces: `review_access_request_v3(uuid, access_request_status, uuid[], uuid, text) returns uuid`
- Produces: `access_requests.pending_auth_user_id uuid`
- Consumes: existing `profiles`, `access_requests`, `access_request_cities`, `access_history`, and authorization helpers.

- [ ] **Step 1: Write failing pgTAP coverage**

```sql
select has_column('public', 'access_requests', 'pending_auth_user_id');
select function_returns(
  'public', 'submit_access_request_v3',
  array['text','text','uuid[]','text','uuid','uuid'], 'uuid'
);
select function_returns(
  'public', 'review_access_request_v3',
  array['uuid','access_request_status','uuid[]','uuid','text'], 'uuid'
);
```

- [ ] **Step 2: Run the SQL test and confirm RED**

Run: `supabase test db supabase/tests/password_access_requests.test.sql`

Expected: FAIL because the column and v3 functions do not exist.

- [ ] **Step 3: Implement the schema and functions**

```sql
alter table public.access_requests
  add column if not exists pending_auth_user_id uuid;

create unique index if not exists access_requests_pending_auth_user_id_idx
  on public.access_requests(pending_auth_user_id)
  where pending_auth_user_id is not null;
```

`submit_access_request_v3` must validate the same fields as v2, return the existing request for the same submission key, reject usernames already present in profiles or another pending request, save only `pending_auth_user_id`, and insert requested cities. `review_access_request_v3` must lock the request row, require reviewer permission, create an `active` profile from `pending_auth_user_id` on approval, and preserve idempotent review keys and access history.

- [ ] **Step 4: Run SQL tests and confirm GREEN**

Run: `supabase test db supabase/tests/password_access_requests.test.sql`

Expected: PASS, including assertions that approved profiles are `active` and no password column exists in `access_requests`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202609030001_password_based_access_requests.sql supabase/tests/password_access_requests.test.sql
git commit -m "feat: add password-based access request schema"
```

### Task 2: Secure Request Edge Function

**Files:**
- Create: `supabase/functions/request-access/handler.ts`
- Create: `supabase/functions/request-access/adapter.ts`
- Create: `supabase/functions/request-access/handler_test.ts`
- Modify: `supabase/functions/request-access/index.ts`

**Interfaces:**
- Consumes: `{ displayName: string; username: string; password: string; cityIds: string[]; trackingSecret: string; submissionKey: string }`
- Produces: HTTP `201 { requestId: string }` or stable error JSON.
- Produces: `requestAccess(body, dependencies): Promise<{ requestId: string }>`.

- [ ] **Step 1: Write failing handler tests**

```ts
Deno.test('creates auth identity before persisting the request', async () => {
  const calls: string[] = [];
  const result = await requestAccess(validBody, {
    findBySubmissionKey: async () => null,
    createAuthUser: async () => { calls.push('auth'); return 'auth-1'; },
    submitRequest: async () => { calls.push('request'); return 'request-1'; },
    deleteAuthUser: async () => calls.push('cleanup'),
  });
  assertEquals(result, { requestId: 'request-1' });
  assertEquals(calls, ['auth', 'request']);
});

Deno.test('deletes the auth identity when persistence fails', async () => {
  // submitRequest throws; deleteAuthUser must receive auth-1.
});
```

- [ ] **Step 2: Run handler tests and confirm RED**

Run: `deno test supabase/functions/request-access/handler_test.ts`

Expected: FAIL because `requestAccess` does not exist.

- [ ] **Step 3: Implement pure workflow and HTTP adapter**

```ts
export type RequestAccessBody = {
  displayName?: string;
  username?: string;
  password?: string;
  cityIds?: string[];
  trackingSecret?: string;
  submissionKey?: string;
};

export async function requestAccess(
  body: RequestAccessBody,
  deps: RequestAccessDependencies,
): Promise<{ requestId: string }> {
  // Normalize and validate; return existing id on retry; create Auth user;
  // call submit_access_request_v3; compensate by deleting Auth user on failure.
}
```

The adapter maps invalid password to `PASSWORD_INVALID`, duplicate username to `ACCOUNT_ALREADY_EXISTS`, duplicate pending request to `ACCESS_REQUEST_PENDING`, and unknown server errors to `ACCESS_REQUEST_FAILED` without returning internal messages.

- [ ] **Step 4: Wire the Supabase runtime**

`index.ts` must use `admin.auth.admin.createUser({ email: technicalEmailForUsername(username), password, email_confirm: true })`, call `submit_access_request_v3`, and never log the request body.

- [ ] **Step 5: Run Deno tests and confirm GREEN**

Run: `deno test supabase/functions/request-access/*.test.ts`

Expected: PASS for success, idempotent retry, validation, duplicate username, and compensation.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/request-access
git commit -m "feat: create pending accounts with requested passwords"
```

### Task 3: Approval Without Activation Codes

**Files:**
- Modify: `supabase/functions/review-access-request/handler.ts`
- Modify: `supabase/functions/review-access-request/adapter.ts`
- Modify: `supabase/functions/review-access-request/index.ts`
- Modify: `supabase/functions/review-access-request/adapter_test.ts`
- Modify: `supabase/functions/review-access-request/index.test.ts`
- Delete: `supabase/functions/activate-user/index.ts`
- Delete: `supabase/functions/create-activation-code/index.ts`

**Interfaces:**
- Consumes: pending request containing `pending_auth_user_id`.
- Produces: `{ ok: true, request, user? }` with no `activation` member.

- [ ] **Step 1: Change tests to require an active user and no activation payload**

```ts
assert(body.user?.status === 'active', 'approved user must be active');
assert(!('activation' in body), 'response must not expose activation data');
```

Add rejection coverage proving `deleteAuthUser(pendingAuthUserId)` runs after the transactional rejection succeeds.

- [ ] **Step 2: Run review tests and confirm RED**

Run: `deno test supabase/functions/review-access-request/*.test.ts`

Expected: FAIL because the existing handler creates a random-password user and issues an activation code.

- [ ] **Step 3: Implement the new review workflow**

Remove `createAuthUser` and `issueActivation` dependencies. Load `pending_auth_user_id`, call `review_access_request_v3`, return the active profile on approval, and delete the reserved Auth identity after rejection. Keep review-key idempotency and best-effort compensation semantics.

- [ ] **Step 4: Run review tests and confirm GREEN**

Run: `deno test supabase/functions/review-access-request/*.test.ts`

Expected: PASS with active approval and no activation output.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/review-access-request supabase/functions/activate-user supabase/functions/create-activation-code
git commit -m "feat: approve access without activation codes"
```

### Task 4: Browser Repository and Types

**Files:**
- Modify: `src/app/supabase/accessRequestsRepository.ts`
- Modify: `src/app/supabase/accessRequestsRepository.test.ts`
- Modify: `src/app/types.ts`
- Modify: `src/app/api.ts`

**Interfaces:**
- Consumes: `AccessRequestPayload` with required `password: string`.
- Produces: request Edge Function body with password and idempotency data.
- Produces: `AccessRequestReviewResult` without `activation`.

- [ ] **Step 1: Write failing repository tests**

```ts
expect(invoke).toHaveBeenCalledWith('request-access', {
  body: expect.objectContaining({
    password: 'safe-password',
    trackingSecret: expect.any(String),
    submissionKey: expect.any(String),
  }),
});
expect(result).not.toHaveProperty('activation');
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm test -- src/app/supabase/accessRequestsRepository.test.ts`

Expected: FAIL because create still calls `submit_access_request_v2` and review maps activation.

- [ ] **Step 3: Implement repository changes**

Use `client.functions.invoke('request-access', { body })`; preserve the generated receipt in the browser; parse stable function error codes with `assertFunction`; remove activation mapping and type fields.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `pnpm test -- src/app/supabase/accessRequestsRepository.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/supabase/accessRequestsRepository.ts src/app/supabase/accessRequestsRepository.test.ts src/app/types.ts src/app/api.ts
git commit -m "refactor: request access through secure function"
```

### Task 5: Remove First Access UI

**Files:**
- Modify: `src/app/auth.tsx`
- Modify: `src/app/components/Login.tsx`
- Modify: `src/app/components/Login.test.tsx`
- Modify: `src/i18n/index.tsx`
- Modify: `src/styles.css`
- Modify: `src/app/supabase/authRepository.ts`
- Modify: `src/app/supabase/authRepository.test.ts`

**Interfaces:**
- Removes: `activateAccount`, `activationEnabled`, `LoginMode = 'activation'`, and activation form state.
- Keeps: `login(username, password)`, `loginAsViewer(cityNames)`, and request tracking.

- [ ] **Step 1: Write failing UI tests**

```tsx
expect(screen.queryByRole('button', { name: /primeiro acesso/i })).not.toBeInTheDocument();
await user.click(screen.getByRole('button', { name: /solicitar acesso/i }));
expect(screen.getByLabelText(/^senha/i)).toBeRequired();
expect(screen.getByLabelText(/confirmar senha/i)).toBeRequired();
```

Add a submission assertion that mismatched passwords blocks the API and matching passwords passes the password in the request payload.

- [ ] **Step 2: Run UI/auth tests and confirm RED**

Run: `pnpm test -- src/app/components/Login.test.tsx src/app/supabase/authRepository.test.ts`

Expected: FAIL because activation UI and repository methods still exist.

- [ ] **Step 3: Remove activation code behavior**

Delete activation mode, form, submit handler, button, auth-context method, repository `activate`, and activation-specific CSS. Always require request password and confirmation; never persist either field in local/session storage.

- [ ] **Step 4: Update translations and error mapping**

Remove public activation labels from PT/EN/ES and add localized messages for `SERVICE_UNAVAILABLE`, `PASSWORD_INVALID`, `ACCOUNT_ALREADY_EXISTS`, and `ACCESS_REQUEST_PENDING`.

- [ ] **Step 5: Run tests and confirm GREEN**

Run: `pnpm test -- src/app/components/Login.test.tsx src/app/supabase/authRepository.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/auth.tsx src/app/components/Login.tsx src/app/components/Login.test.tsx src/i18n/index.tsx src/styles.css src/app/supabase/authRepository.ts src/app/supabase/authRepository.test.ts
git commit -m "feat: remove activation code onboarding"
```

### Task 6: Local Verification and Preview

**Files:**
- Modify only if tests expose defects in files from Tasks 1–5.

**Interfaces:**
- Produces: a running local Vite preview for user inspection.

- [ ] **Step 1: Run the complete frontend suite**

Run: `pnpm test`

Expected: all tests PASS.

- [ ] **Step 2: Run lint and build**

Run: `pnpm lint`

Expected: exit code 0.

Run: `pnpm build`

Expected: exit code 0 and a generated `dist` directory.

- [ ] **Step 3: Audit activation and secret references**

Run: `rg -n "activateAccount|activationCode|Primeiro acesso|Código de ativação|SUPABASE_SERVICE_ROLE_KEY" src`

Expected: no activation-flow references in `src`; service-role key absent from browser source.

- [ ] **Step 4: Start localhost without publishing**

Run: `pnpm dev --host 127.0.0.1 --port 8080`

Expected: Vite serves `http://127.0.0.1:8080/login`. Because the old Supabase project is restricted, backend success paths require the new free project configuration; the UI and client validation remain inspectable before migration.

- [ ] **Step 5: User checkpoint**

Ask the user to verify login, viewer, and request-access presentation on localhost. Do not push to GitHub or update Vercel yet.

### Task 7: New Free Supabase Project and Data Migration

**Files:**
- Modify: `.env.migration.local` (ignored; never commit)
- Modify: local `.env` used for localhost (ignored; never commit)
- Use: `scripts/migration/import-snapshot.mjs`, `scripts/migration/verify-migration.mjs`

**Interfaces:**
- Consumes: normalized migration snapshot and external media URLs.
- Produces: configured free Supabase project with migrated structured data and deployed Edge Functions.

- [ ] **Step 1: Create the free project and apply migrations**

Use the Supabase dashboard/CLI with billing disabled. Apply all migrations in filename order and deploy `request-access`, `review-access-request`, translation, backup, and management functions required by the app.

- [ ] **Step 2: Import and verify structured data**

Run: `pnpm migration:import`

Expected: import completes without password or secret data in output.

Run: `pnpm migration:verify`

Expected: cities, categories, products, translations, prices, permissions, and history match the source snapshot; media URLs remain external.

- [ ] **Step 3: Configure active accounts safely**

Create/reset passwords through Supabase Admin operations without writing them to repository files. Mark migrated profiles active only after their Auth identities exist.

- [ ] **Step 4: Run localhost integration checks**

Verify: viewer catalog loads; a new request can be submitted; pre-approval login is denied; approval activates the profile; the same requested password logs in; rejection removes the reserved identity.

- [ ] **Step 5: User checkpoint before publication**

Keep GitHub and Vercel unchanged until the user explicitly approves the localhost result.

### Task 8: Publish After Local Approval

**Files:**
- No additional source files unless deployment verification finds a release-only defect.

**Interfaces:**
- Produces: normal GitHub commits on `main`, updated Vercel public environment variables, and a verified production deployment.

- [ ] **Step 1: Push without rewriting history**

Run: `git push origin main`

Expected: fast-forward push succeeds; no force option is used.

- [ ] **Step 2: Update Vercel variables**

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for Production, Preview, and Development. Do not add a service-role key to Vercel frontend variables.

- [ ] **Step 3: Deploy and verify clean-browser flows**

Verify production in a browser without prior storage/session: viewer, request submission, approval, login, city switching, and logout.

- [ ] **Step 4: Confirm quota-safe operation**

Confirm no media object was uploaded to Supabase Storage and network requests reference external media URLs.
