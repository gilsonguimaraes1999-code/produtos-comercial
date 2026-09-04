# Access Requests Realtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer solicitações aparecerem e serem respondidas quase instantaneamente, sem polling e sem recarregar listas completas.

**Architecture:** A gestão autenticada usa Supabase Realtime com invalidação agrupada e respostas locais. O solicitante recebe um comprovante secreto, consulta somente a própria solicitação e acompanha o estado em intervalos curtos sem expor outras contas.

**Tech Stack:** React 18, TypeScript, Vitest, Supabase JS, PostgreSQL, Supabase Edge Functions.

**Spec:** `docs/superpowers/specs/2026-08-27-realtime-concurrency-design.md`

## Global Constraints

- Migrações devem ser aditivas e preservar todos os dados atuais.
- O comprovante de acompanhamento nunca será persistido em texto puro.
- A service role permanece somente nas Edge Functions.
- O polling de quatro segundos da tela administrativa será removido.
- Não reescrever histórico Git publicado e conectado ao Lovable.

---

### Task 1: Acompanhamento seguro no banco

**Files:**
- Create: `supabase/migrations/202608270015_access_request_tracking.sql`
- Test: `supabase/tests/access_requests_realtime.test.sql`

**Interfaces:**
- Produces: `submit_access_request_v2(text, text, uuid[], text, uuid) -> uuid`
- Produces: `get_access_request_status(uuid, text) -> table(status, reviewed_at, rejection_reason)`

- [ ] **Step 1: Escrever o teste SQL que exige hash e idempotência**

```sql
begin;
select has_column('public', 'access_requests', 'tracking_token_hash');
select has_column('public', 'access_requests', 'submission_key');
select has_function('public', 'submit_access_request_v2', array['text','text','uuid[]','text','uuid']);
select has_function('public', 'get_access_request_status', array['uuid','text']);
rollback;
```

- [ ] **Step 2: Executar o teste e confirmar a falha inicial**

Run: `supabase test db supabase/tests/access_requests_realtime.test.sql`

Expected: FAIL informando que as colunas e funções ainda não existem.

- [ ] **Step 3: Criar colunas, índices e funções seguras**

```sql
alter table public.access_requests
  add column if not exists tracking_token_hash text,
  add column if not exists submission_key uuid,
  add column if not exists rejection_reason text;

create unique index if not exists access_requests_submission_key_idx
  on public.access_requests(submission_key) where submission_key is not null;

create or replace function public.get_access_request_status(target_request_id uuid, tracking_secret text)
returns table(status public.access_request_status, reviewed_at timestamptz, rejection_reason text)
language sql stable security definer set search_path = public, extensions
as $$
  select request.status, request.reviewed_at, request.rejection_reason
  from public.access_requests request
  where request.id = target_request_id
    and request.tracking_token_hash = encode(digest(tracking_secret, 'sha256'), 'hex');
$$;
```

`submit_access_request_v2` deve repetir as validações de `submit_access_request`, retornar a solicitação existente quando `submission_key` coincidir e gravar `encode(digest(tracking_secret, 'sha256'), 'hex')`.

- [ ] **Step 4: Restringir privilégios e executar testes**

```sql
revoke all on function public.submit_access_request_v2(text,text,uuid[],text,uuid) from public;
revoke all on function public.get_access_request_status(uuid,text) from public;
grant execute on function public.submit_access_request_v2(text,text,uuid[],text,uuid) to anon, authenticated;
grant execute on function public.get_access_request_status(uuid,text) to anon, authenticated;
```

Run: `supabase test db supabase/tests/access_requests_realtime.test.sql`

Expected: PASS.

- [ ] **Step 5: Criar checkpoint versionado**

```powershell
git add supabase/migrations/202608270015_access_request_tracking.sql supabase/tests/access_requests_realtime.test.sql
git commit -m "feat: add secure access request tracking"
```

Se o checkout local continuar sem metadados Git, manter os arquivos prontos e criar o checkpoint pelo commit normal do GitHub sem reescrever histórico.

---

### Task 2: Contratos de repositório e Realtime administrativo

**Files:**
- Create: `src/app/supabase/accessRequestsRealtime.ts`
- Create: `src/app/supabase/accessRequestsRealtime.test.ts`
- Modify: `src/app/supabase/accessRequestsRepository.ts`
- Modify: `src/app/supabase/accessRequestsRepository.test.ts`
- Modify: `src/app/types.ts`

**Interfaces:**
- Consumes: `submit_access_request_v2` e `get_access_request_status` da Task 1.
- Produces: `AccessRequestReceipt { requestId: string; trackingSecret: string; submissionKey: string }`
- Produces: `subscribeToAccessRequests(client, onChange, debounceMs?) => () => void`
- Produces: `repository.status(receipt) -> Promise<AccessRequestTrackingStatus>`

- [ ] **Step 1: Escrever testes para agrupamento e cancelamento do canal**

```ts
it('groups request and city events into one refresh', () => {
  vi.useFakeTimers();
  const onChange = vi.fn();
  const unsubscribe = subscribeToAccessRequests(client, onChange, 100);
  handlers.access_requests();
  handlers.access_request_cities();
  vi.advanceTimersByTime(100);
  expect(onChange).toHaveBeenCalledTimes(1);
  unsubscribe();
  expect(client.removeChannel).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Executar os testes e confirmar falha**

Run: `pnpm vitest run src/app/supabase/accessRequestsRealtime.test.ts src/app/supabase/accessRequestsRepository.test.ts`

Expected: FAIL porque os novos contratos não existem.

- [ ] **Step 3: Implementar assinatura e comprovante**

```ts
export function subscribeToAccessRequests(
  client: SupabaseClient,
  onChange: () => void,
  debounceMs = 120,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const notify = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onChange, debounceMs);
  };
  const channel = client.channel('access-requests-management')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'access_requests' }, notify)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'access_request_cities' }, notify)
    .subscribe();
  return () => {
    if (timer) clearTimeout(timer);
    void client.removeChannel(channel);
  };
}
```

O repositório deve gerar `crypto.randomUUID()` para `submissionKey`, 32 bytes aleatórios codificados em hexadecimal para `trackingSecret`, chamar `submit_access_request_v2` e persistir o comprovante somente no navegador.

- [ ] **Step 4: Executar testes do repositório**

Run: `pnpm vitest run src/app/supabase/accessRequestsRealtime.test.ts src/app/supabase/accessRequestsRepository.test.ts`

Expected: PASS.

- [ ] **Step 5: Criar checkpoint versionado**

```powershell
git add src/app/types.ts src/app/supabase/accessRequestsRepository.ts src/app/supabase/accessRequestsRepository.test.ts src/app/supabase/accessRequestsRealtime.ts src/app/supabase/accessRequestsRealtime.test.ts
git commit -m "feat: stream access request changes"
```

---

### Task 3: Resposta enxuta da função de revisão

**Files:**
- Modify: `supabase/functions/review-access-request/index.ts`
- Create: `supabase/functions/review-access-request/index.test.ts`
- Modify: `supabase/migrations/202608270015_access_request_tracking.sql`

**Interfaces:**
- Produces: `{ ok, request, user, activation }` na aprovação.
- Produces: `{ ok, request }` na rejeição.
- Produces: `review_access_request_v2(uuid, access_request_status, uuid[], uuid, uuid) -> uuid`, em que o último argumento é `review_key`.

- [ ] **Step 1: Escrever testes para resposta idempotente**

```ts
Deno.test('returns the reviewed request instead of requiring a list reload', async () => {
  const response = await reviewAccessRequest(validApprovalRequest, dependencies);
  if (!response.request || response.request.status !== 'approved') throw new Error('missing reviewed request');
  if (!response.user || response.user.status !== 'pending_activation') throw new Error('missing created user');
});
```

- [ ] **Step 2: Executar teste e confirmar falha**

Run: `deno test --allow-env supabase/functions/review-access-request/index.test.ts`

Expected: FAIL porque a função atual retorna apenas identificadores.

- [ ] **Step 3: Extrair o handler testável e retornar os registros alterados**

A migração 015 deve adicionar `review_key uuid` com índice único parcial a `access_requests`. `review_access_request_v2` bloqueia a solicitação; se ela já tiver o mesmo `review_key`, retorna o perfil anteriormente criado; se estiver decidida por outra chave, retorna `REQUEST_NOT_PENDING`. A Edge Function deve aceitar `reviewKey`, manter a criação administrativa do usuário, chamar o RPC v2, selecionar somente o perfil criado e a solicitação revisada e devolver ambos. O cliente gera um `crypto.randomUUID()` por ação e reutiliza a mesma chave em repetição de rede.

- [ ] **Step 4: Executar teste da função**

Run: `deno test --allow-env supabase/functions/review-access-request/index.test.ts`

Expected: PASS.

- [ ] **Step 5: Criar checkpoint versionado**

```powershell
git add supabase/functions/review-access-request/index.ts supabase/functions/review-access-request/index.test.ts supabase/migrations/202608270015_access_request_tracking.sql
git commit -m "perf: return reviewed access request records"
```

---

### Task 4: Hook compartilhado e interface instantânea

**Files:**
- Create: `src/app/hooks/useAccessRequests.ts`
- Create: `src/app/hooks/useAccessRequests.test.tsx`
- Modify: `src/app/components/UserManagement.tsx`
- Modify: `src/app/components/AccessRequestsModal.tsx`
- Modify: `src/app/api.ts`

**Interfaces:**
- Consumes: `subscribeToAccessRequests` da Task 2.
- Produces: `useAccessRequests(): { requests, loading, error, approve, reject }`

- [ ] **Step 1: Escrever teste que comprova ausência de polling**

```tsx
it('refreshes from realtime and never starts a four-second interval', async () => {
  const intervalSpy = vi.spyOn(window, 'setInterval');
  renderHook(() => useAccessRequests());
  await act(async () => realtimeCallback());
  expect(repository.list).toHaveBeenCalledTimes(2);
  expect(intervalSpy).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Executar o teste e confirmar falha**

Run: `pnpm vitest run src/app/hooks/useAccessRequests.test.tsx`

Expected: FAIL porque o hook ainda não existe.

- [ ] **Step 3: Implementar o hook e substituir estados duplicados**

O hook deve carregar uma vez, assinar o canal, aplicar `approve`/`reject` localmente pela resposta e ignorar respostas antigas com um contador de geração. `UserManagement` e `AccessRequestsPage` devem consumir o mesmo estado, e o efeito com `setInterval(..., 4000)` deve ser removido.

- [ ] **Step 4: Executar testes dos componentes**

Run: `pnpm vitest run src/app/hooks/useAccessRequests.test.tsx src/app/components/Login.test.tsx`

Expected: PASS e nenhuma chamada a `setInterval` na gestão de solicitações.

- [ ] **Step 5: Criar checkpoint versionado**

```powershell
git add src/app/api.ts src/app/hooks/useAccessRequests.ts src/app/hooks/useAccessRequests.test.tsx src/app/components/UserManagement.tsx src/app/components/AccessRequestsModal.tsx
git commit -m "feat: update access requests in realtime"
```

---

### Task 5: Estado de acompanhamento do solicitante

**Files:**
- Modify: `src/app/components/Login.tsx`
- Modify: `src/app/components/Login.test.tsx`
- Modify: `src/i18n/index.tsx`

**Interfaces:**
- Consumes: `AccessRequestReceipt` e `repository.status` da Task 2.
- Produces: painel de acompanhamento com estados pendente, aprovado e rejeitado.

- [ ] **Step 1: Escrever teste de transição pendente para aprovado**

```tsx
it('shows approval without reloading the page', async () => {
  accessRequestsApi.create.mockResolvedValue({ receipt });
  accessRequestsApi.status
    .mockResolvedValueOnce({ status: 'PENDENTE' })
    .mockResolvedValueOnce({ status: 'APROVADO', reviewedAt: '2026-08-27T12:00:00Z' });
  await submitRequest();
  expect(await screen.findByText(/solicitação pendente/i)).toBeInTheDocument();
  await vi.advanceTimersByTimeAsync(1500);
  expect(await screen.findByText(/solicitação aprovada/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Executar teste e confirmar falha**

Run: `pnpm vitest run src/app/components/Login.test.tsx`

Expected: FAIL porque a tela atual mostra apenas uma mensagem final estática.

- [ ] **Step 3: Implementar painel e persistência do comprovante**

Salvar o comprovante no `sessionStorage`, consultar a cada 1500 ms somente enquanto o painel estiver aberto e o estado for pendente, pausar quando a aba estiver oculta e retomar ao ganhar foco. Apagar o comprovante após rejeição ou ativação concluída.

- [ ] **Step 4: Executar testes de login e traduções**

Run: `pnpm vitest run src/app/components/Login.test.tsx src/app/supabase/accessRequestsRepository.test.ts`

Expected: PASS em PT, EN e ES.

- [ ] **Step 5: Executar verificação do plano**

Run: `pnpm vitest run && pnpm build`

Expected: todos os testes passam e o build termina com código 0.
