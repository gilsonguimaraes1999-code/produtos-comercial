# Catalog Concurrency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir edições paralelas sem travar o catálogo e impedir que uma versão antiga sobrescreva uma alteração recente.

**Architecture:** Entidades recebem versões monotônicas verificadas dentro dos RPCs. O frontend aplica respostas de mutação localmente, atualiza somente entidades afetadas por Realtime e usa o snapshot completo apenas para inicialização e recuperação.

**Tech Stack:** React 18, TypeScript, Vitest, Supabase JS, PostgreSQL RPC e Realtime.

**Spec:** `docs/superpowers/specs/2026-08-27-realtime-concurrency-design.md`

## Global Constraints

- Conflitos devem ser detectados no PostgreSQL e nunca apenas no navegador.
- O conteúdo digitado permanece no formulário quando houver conflito.
- Mutações de entidades diferentes não compartilham um bloqueio global.
- Migrações devem preservar dados e contratos antigos durante a implantação.
- Não reescrever histórico Git publicado e conectado ao Lovable.

---

### Task 1: Versões monotônicas e RPCs compatíveis

**Files:**
- Create: `supabase/migrations/202608270016_catalog_concurrency.sql`
- Create: `supabase/tests/catalog_concurrency.test.sql`

**Interfaces:**
- Produces: `save_city_v2(uuid,text,bigint) -> jsonb`
- Produces: `save_category_v2(uuid,uuid,text,jsonb,bigint) -> jsonb`
- Produces: `save_product_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb,bigint) -> jsonb`
- Produces: `save_description_template_v2(uuid,uuid,text,integer,boolean,jsonb,bigint) -> jsonb`
- Produces: `reorder_cities_v2(uuid[],uuid[])`, `reorder_categories_v2(uuid,uuid[],uuid[])` e `reorder_products_v2(uuid,uuid[],uuid[])`.

- [ ] **Step 1: Escrever testes SQL de conflito**

```sql
begin;
select has_column('public', 'cities', 'version');
select has_column('public', 'categories', 'version');
select has_column('public', 'products', 'version');
select has_column('public', 'description_templates', 'version');
select throws_ok(
  $$ select public.save_city_v2((select id from public.cities limit 1), 'Conflito', 0) $$,
  '40001', 'EDIT_CONFLICT'
);
rollback;
```

- [ ] **Step 2: Executar o teste e confirmar falha**

Run: `supabase test db supabase/tests/catalog_concurrency.test.sql`

Expected: FAIL porque versões e RPCs v2 ainda não existem.

- [ ] **Step 3: Adicionar versões e comparação sob bloqueio**

```sql
alter table public.cities add column if not exists version bigint not null default 1;
alter table public.categories add column if not exists version bigint not null default 1;
alter table public.products add column if not exists version bigint not null default 1;
alter table public.description_templates add column if not exists version bigint not null default 1;
```

Cada RPC v2 deve executar `SELECT version ... FOR UPDATE`, comparar com `expected_version`, levantar `EDIT_CONFLICT` com SQLSTATE `40001` quando diferente, executar a mutação e retornar `jsonb_build_object('id', saved_id, 'version', current_version + 1)`.

Cada gravação deve inserir em `audit_events.metadata` as chaves `previous_version` e `new_version`. RPCs devem usar `set_config('app.skip_catalog_version_trigger', 'on', true)` e incrementar uma vez ao fim; triggers nas tabelas filhas incrementam a entidade pai somente quando essa configuração não estiver ativa, cobrindo traduções executadas fora dos RPCs.

- [ ] **Step 4: Implementar comparação de ordem atual**

Antes de reordenar, cada RPC v2 deve montar `array_agg(id order by position, id)` e compará-lo com `expected_order`. Diferença deve levantar `ORDER_CONFLICT` com SQLSTATE `40001`. A transação mantém o bloqueio somente sobre as linhas da lista correspondente.

- [ ] **Step 5: Executar os testes SQL**

Run: `supabase test db supabase/tests/catalog_concurrency.test.sql supabase/tests/reorder.test.sql supabase/tests/rls.test.sql`

Expected: PASS, incluindo dois salvamentos concorrentes simulados em que apenas o primeiro confirma.

- [ ] **Step 6: Criar checkpoint versionado**

```powershell
git add supabase/migrations/202608270016_catalog_concurrency.sql supabase/tests/catalog_concurrency.test.sql
git commit -m "feat: add optimistic catalog concurrency"
```

Se o checkout local continuar sem metadados Git, manter os arquivos prontos e criar o checkpoint pelo commit normal do GitHub sem reescrever histórico.

---

### Task 2: Tipos e contratos de mutação versionados

**Files:**
- Modify: `src/app/types.ts`
- Modify: `src/app/supabase/catalogMutations.ts`
- Modify: `src/app/supabase/catalogMutations.test.ts`
- Modify: `src/app/supabase/mappers.ts`
- Modify: `src/app/supabase/mappers.test.ts`
- Modify: `src/app/supabase/catalogRepository.ts`

**Interfaces:**
- Consumes: RPCs v2 da Task 1.
- Produces: `VersionedEntity { version: number }` em City, Category, Product e DescriptionTemplate.
- Produces: `MutationResult { id: string; version: number }`.

- [ ] **Step 1: Escrever teste do `expected_version`**

```ts
it('sends the opened product version to save_product_v2', async () => {
  rpc.mockResolvedValue({ data: { id: 'p1', version: 8 }, error: null });
  const result = await repository.saveProduct(product({ id: 'p1', version: 7 }));
  expect(rpc).toHaveBeenCalledWith('save_product_v2', expect.objectContaining({ expected_version: 7 }));
  expect(result).toEqual({ id: 'p1', version: 8 });
});
```

- [ ] **Step 2: Executar testes e confirmar falha**

Run: `pnpm vitest run src/app/supabase/catalogMutations.test.ts src/app/supabase/mappers.test.ts`

Expected: FAIL porque os tipos atuais não transportam versão.

- [ ] **Step 3: Implementar tipos e mapeamento**

Adicionar `version?: number` aos quatro modelos e payloads editáveis. Consultas devem selecionar `version`; mapeadores devem usar `Number(row.version || 1)`. Atualizações existentes sempre exigem uma versão numérica, enquanto criações enviam `null`.

- [ ] **Step 4: Mapear erros de concorrência**

`assertMutation` deve preservar `EDIT_CONFLICT` e `ORDER_CONFLICT` em uma classe `CatalogConflictError` com `kind: 'entity' | 'order'`, permitindo tratamento específico na interface.

- [ ] **Step 5: Executar testes de contratos**

Run: `pnpm vitest run src/app/supabase/catalogMutations.test.ts src/app/supabase/mappers.test.ts src/app/supabase/catalogRepository.test.ts`

Expected: PASS.

- [ ] **Step 6: Criar checkpoint versionado**

```powershell
git add src/app/types.ts src/app/supabase/catalogMutations.ts src/app/supabase/catalogMutations.test.ts src/app/supabase/mappers.ts src/app/supabase/mappers.test.ts src/app/supabase/catalogRepository.ts
git commit -m "feat: send catalog entity versions"
```

---

### Task 3: Leitura granular e agrupamento de eventos

**Files:**
- Create: `src/app/supabase/catalogEntityRepository.ts`
- Create: `src/app/supabase/catalogEntityRepository.test.ts`
- Modify: `src/app/supabase/realtime.ts`
- Modify: `src/app/supabase/realtime.test.ts`

**Interfaces:**
- Produces: `fetchCity(id, language)`, `fetchCategory(id, language)`, `fetchProduct(id, language, currency)` e `fetchDescriptionTemplate(id)`.
- Produces: `CatalogRealtimeEvent { entity: 'city'|'category'|'product'|'template'; id: string; deleted: boolean }`.

- [ ] **Step 1: Escrever teste que agrupa tabelas filhas por produto**

```ts
it('coalesces price, translation and media changes for one product', async () => {
  handlers.product_prices({ new: { product_id: 'p1' } });
  handlers.product_translations({ new: { product_id: 'p1' } });
  handlers.product_media({ new: { product_id: 'p1' } });
  await vi.advanceTimersByTimeAsync(100);
  expect(onEvent).toHaveBeenCalledTimes(1);
  expect(onEvent).toHaveBeenCalledWith({ entity: 'product', id: 'p1', deleted: false });
});
```

- [ ] **Step 2: Executar testes e confirmar falha**

Run: `pnpm vitest run src/app/supabase/realtime.test.ts src/app/supabase/catalogEntityRepository.test.ts`

Expected: FAIL porque o canal atual apenas invalida consultas inteiras.

- [ ] **Step 3: Implementar eventos normalizados**

O assinante deve extrair identificadores de `payload.new` ou `payload.old`, manter um `Map<string, CatalogRealtimeEvent>`, agrupar por 100 ms e emitir uma vez por entidade. Exclusões usam `deleted: true`; tabelas filhas resolvem o identificador do pai pelo campo `product_id`, `category_id` ou `template_id`.

- [ ] **Step 4: Implementar consultas unitárias**

Cada função seleciona a mesma projeção usada pelo repositório principal, filtra por `id`, mapeia com os mapeadores existentes e retorna `null` para registro removido.

- [ ] **Step 5: Executar testes granulares**

Run: `pnpm vitest run src/app/supabase/realtime.test.ts src/app/supabase/catalogEntityRepository.test.ts`

Expected: PASS.

- [ ] **Step 6: Criar checkpoint versionado**

```powershell
git add src/app/supabase/realtime.ts src/app/supabase/realtime.test.ts src/app/supabase/catalogEntityRepository.ts src/app/supabase/catalogEntityRepository.test.ts
git commit -m "perf: refresh only changed catalog entities"
```

---

### Task 4: Estado local granular e operações por entidade

**Files:**
- Modify: `src/app/catalog.tsx`
- Create: `src/app/catalog.test.tsx`
- Modify: `src/app/supabase/catalogSnapshot.ts`

**Interfaces:**
- Consumes: `CatalogRealtimeEvent` e repositório granular da Task 3.
- Produces: `busyEntityIds: ReadonlySet<string>` no contexto.
- Produces: mutações que aplicam resultado local e reservam snapshot integral para recuperação.

- [ ] **Step 1: Escrever teste que rejeita recarga integral após edição**

```tsx
it('updates one product without fetching the full catalog', async () => {
  renderCatalogProvider();
  await act(() => context.saveProduct(changedProduct));
  expect(mutations.saveProduct).toHaveBeenCalledTimes(1);
  expect(entityRepository.fetchProduct).toHaveBeenCalledWith('p1', 'pt', 'BRL');
  expect(snapshotRepository.fetchCatalogSnapshot).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Executar teste e confirmar falha**

Run: `pnpm vitest run src/app/catalog.test.tsx`

Expected: FAIL porque toda mutação chama `refresh(true)`.

- [ ] **Step 3: Implementar `upsertEntity` e `removeEntity`**

Atualizar arrays imutavelmente por `id`, manter ordenação por `order` e atualizar cache persistente após cada lote. A mutação marca somente seu identificador em `busyEntityIds`, aplica a entidade confirmada e remove o identificador no `finally`.

- [ ] **Step 4: Substituir o canal global**

Remover o loop de tabelas que chama `refresh(true)`. Conectar `subscribeToCatalog` ao manipulador granular. `visibilitychange`, `focus` e `online` devem comparar revisão e solicitar snapshot apenas quando a recuperação for necessária.

- [ ] **Step 5: Executar testes do provider**

Run: `pnpm vitest run src/app/catalog.test.tsx src/app/supabase/catalogSnapshot.test.ts`

Expected: PASS e nenhuma leitura integral depois de uma edição comum.

- [ ] **Step 6: Criar checkpoint versionado**

```powershell
git add src/app/catalog.tsx src/app/catalog.test.tsx src/app/supabase/catalogSnapshot.ts
git commit -m "perf: apply catalog changes by entity"
```

---

### Task 5: Interface de conflito sem perda do rascunho

**Files:**
- Create: `src/app/components/EditConflictDialog.tsx`
- Create: `src/app/components/EditConflictDialog.test.tsx`
- Modify: `src/app/components/CityForm.tsx`
- Modify: `src/app/components/CategoryForm.tsx`
- Modify: `src/app/components/ProductForm.tsx`
- Modify: `src/app/components/DescriptionTemplatesPage.tsx`
- Modify: `src/i18n/index.tsx`

**Interfaces:**
- Consumes: `CatalogConflictError` da Task 2.
- Produces: `EditConflictDialog({ entityName, onReload, onCopy, onCancel })`.

- [ ] **Step 1: Escrever teste que preserva campos do formulário**

```tsx
it('keeps the draft open when the server reports EDIT_CONFLICT', async () => {
  saveProduct.mockRejectedValue(new CatalogConflictError('entity'));
  render(<ProductForm product={product} />);
  await userEvent.clear(screen.getByLabelText(/nome/i));
  await userEvent.type(screen.getByLabelText(/nome/i), 'Meu rascunho');
  await userEvent.click(screen.getByRole('button', { name: /salvar/i }));
  expect(screen.getByDisplayValue('Meu rascunho')).toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: /conflito/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Executar teste e confirmar falha**

Run: `pnpm vitest run src/app/components/EditConflictDialog.test.tsx`

Expected: FAIL porque o diálogo ainda não existe.

- [ ] **Step 3: Implementar diálogo e ações**

`onReload` busca a entidade atual e reinicializa o formulário; `onCopy` usa `navigator.clipboard.writeText(JSON.stringify(draft, null, 2))`; `onCancel` fecha apenas o aviso. O erro não deve fechar o modal de edição.

- [ ] **Step 4: Adicionar traduções completas**

Adicionar em PT, EN e ES as chaves `editConflictTitle`, `editConflictMessage`, `loadLatestVersion`, `copyMyChanges`, `keepEditing` e `orderConflictMessage`.

- [ ] **Step 5: Executar testes de interface**

Run: `pnpm vitest run src/app/components/EditConflictDialog.test.tsx src/app/components/Login.test.tsx`

Expected: PASS.

- [ ] **Step 6: Criar checkpoint versionado**

```powershell
git add src/app/components/EditConflictDialog.tsx src/app/components/EditConflictDialog.test.tsx src/app/components/CityForm.tsx src/app/components/CategoryForm.tsx src/app/components/ProductForm.tsx src/app/components/DescriptionTemplatesPage.tsx src/i18n/index.tsx
git commit -m "feat: warn editors about concurrent changes"
```

---

### Task 6: Verificação integrada e publicação segura

**Files:**
- Modify: `README.md`
- Modify: `ATUALIZACAO.md`

**Interfaces:**
- Consumes: todas as Tasks anteriores.
- Produces: documentação operacional e evidências de verificação.

- [ ] **Step 1: Executar testes unitários e build**

Run: `pnpm vitest run && pnpm build`

Expected: todos os testes passam e o build termina com código 0.

- [ ] **Step 2: Executar testes do banco**

Run: `supabase test db`

Expected: schema, RLS, reordenação, solicitações e concorrência passam.

- [ ] **Step 3: Testar duas sessões manualmente**

Abrir duas sessões, editar o mesmo produto em ambas, salvar a primeira e confirmar que a segunda recebe o diálogo sem perder o rascunho. Depois editar produtos diferentes e confirmar que ambas salvam sem bloqueio global.

- [ ] **Step 4: Testar solicitações em duas sessões**

Manter a página de usuários aberta, enviar uma solicitação e confirmar destaque em menos de dois segundos. Aprovar e confirmar atualização nas duas sessões sem recarregar a página.

- [ ] **Step 5: Documentar implantação aditiva**

Registrar a ordem: migrações 015 e 016, Edge Functions, frontend, monitoramento e remoção do polling legado. Incluir instrução explícita de rollback do frontend sem remover colunas ou dados.

- [ ] **Step 6: Criar checkpoint final**

```powershell
git add README.md ATUALIZACAO.md
git commit -m "docs: document realtime concurrency rollout"
```
