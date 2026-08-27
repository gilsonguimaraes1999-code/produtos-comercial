# Migração Completa para Supabase — Especificação de Design

**Data:** 27 de agosto de 2026  
**Status:** Aprovado pelo usuário  
**Sistema de origem:** backend e armazenamento legados  
**Sistema de destino:** Supabase Postgres + Auth + Storage + Realtime + Edge Functions

## 1. Objetivo

Desvincular totalmente o site Comercial Produtos dos serviços legados, tornando o Supabase a fonte oficial de dados, autenticação, arquivos e eventos em tempo real. A migração deve preservar todo o conteúdo e comportamento já criado: cidades, ordem das cidades, categorias, ordem das categorias, produtos, ordem dos produtos, valores por moeda, traduções, descrições, mídia, usuários, permissões, solicitações, históricos, modelos de descrição e configurações.

## 2. Decisões aprovadas

- O Supabase será o único backend oficial depois do corte.
- Todas as imagens hospedadas externamente serão copiadas para Supabase Storage.
- Produtos e preços serão preservados dentro da cidade e categoria corretas.
- Os 42 usuários atuais serão migrados pelo `username`, sem reaproveitar senhas antigas.
- Usuários migrados ficarão em estado `pending_activation` e criarão uma nova senha com código temporário de uso único.
- O login continuará apresentando `username`, embora o Supabase Auth use internamente uma identidade técnica não exibida.
- Traduções automáticas ocorrerão somente na criação. Edições posteriores alterarão apenas o idioma selecionado.
- A tradução gratuita, chamada exclusivamente por Supabase Edge Function, usará glossário comercial.
- Supabase Realtime substituirá o polling de 2,5 segundos.
- A migração ocorrerá em paralelo, com uma curta janela final sem edições para captura do último delta.

## 3. Arquitetura

### 3.1 Frontend

O frontend React/TanStack continuará sendo o aplicativo principal. A camada `src/app/api.ts` deixará de enviar envelopes ao backend legado e será substituída por módulos de domínio que usam `@supabase/supabase-js`. React Query controlará cache, revalidação e paginação. O contexto de autenticação passará a observar a sessão do Supabase Auth.

### 3.2 Backend Supabase

- **Postgres:** dados relacionais, regras, auditoria e filas de tradução/migração.
- **Auth:** sessão, renovação de token e identidade técnica associada ao username.
- **Storage:** originais, imagens otimizadas e miniaturas de produtos.
- **Realtime:** invalidação direcionada do catálogo, permissões e solicitações.
- **Edge Functions:** ativação inicial, administração de usuários, tradução, otimização/ingestão de mídia e operações administrativas que exigem `service_role`.

Segredos de `service_role`, Google Cloud e credenciais de migração nunca serão incluídos no bundle do navegador.

## 4. Modelo de dados

Todas as chaves primárias serão UUID. Datas serão `timestamptz`. Campos monetários serão `numeric(14,2)` e nunca `float`.

### 4.1 Catálogo

- `cities`: `id`, `name`, `position`, timestamps.
- `categories`: `id`, `city_id`, `icon`, `position`, timestamps.
- `category_translations`: `category_id`, `language`, `title`, `is_source`, timestamps; chave única por categoria/idioma.
- `products`: `id`, `category_id`, `coordinates`, `storage_weight`, `import_key`, `sold`, dados do comprador, `position`, timestamps.
- `product_translations`: `product_id`, `language`, `name`, `description_html`, `is_source`, `translation_status`, timestamps; chave única por produto/idioma.
- `product_prices`: `product_id`, `currency`, `amount`, timestamps; chave única por produto/moeda.
- `product_media`: `id`, `product_id`, `media_type`, `storage_path`, `public_url`, `thumbnail_path`, `video_provider`, `position`, timestamps.
- `description_templates`: dados gerais do modelo, categoria, posição e estado ativo.
- `description_template_translations`: HTML por idioma.

As posições terão restrições únicas dentro do escopo apropriado e serão atualizadas por funções transacionais de reordenação.

### 4.2 Usuários e autorização

- `profiles`: `auth_user_id`, `username`, `username_normalized`, `display_name`, `role`, `status`, timestamps.
- `user_cities`: usuário e cidade permitida.
- `user_product_permissions`: flags normalizadas pelas permissões já existentes, incluindo clonar produto e clonar categoria.
- `user_access_permissions`: permissão de gerenciar solicitações das cidades atribuídas.
- `activation_codes`: hash do código, usuário, validade, tentativas, data de consumo e criador.
- `access_requests`: nome, username, cidades pedidas, status e timestamps.
- `access_request_cities`: cidades associadas à solicitação.
- `access_history`: fotografia imutável da decisão, cidades aprovadas, cargo, revisor e data.

`username_normalized` será único e comparado sem diferença de maiúsculas/minúsculas. A identidade técnica do Auth será determinística e nunca exibida ao usuário.

Credenciais ou hashes legados presentes em usuários/solicitações não serão importados. URLs administrativas de exclusão do armazenamento antigo também serão descartadas depois que o arquivo correspondente for validado no Storage.

### 4.3 Operação e auditoria

- `site_settings`: configurações versionadas.
- `audit_events`: ator, ação, entidade, antes/depois, cidade e data.
- `migration_runs`: execução, etapa, contagens, checksums, erros e status.
- `translation_jobs`: entidade, idioma fonte/destino, tentativas, erro e status.

## 5. Autenticação e primeiro acesso

1. A migração cria o registro no Supabase Auth com senha aleatória impossível de conhecer e e-mail técnico confirmado.
2. O perfil fica `pending_activation`.
3. O Owner gera no painel um código criptograficamente aleatório, exibido uma única vez e válido por 24 horas.
4. O usuário informa username, código e nova senha.
5. A Edge Function compara o hash, limita tentativas, altera a senha via Admin API, consome o código e ativa o perfil.
6. Os acessos seguintes usam username e senha normais; o frontend converte internamente o username para a identidade técnica.

Não haverá armazenamento de senha ou código em texto puro. O Owner também passará pelo fluxo seguro de definição de nova senha durante o corte.

## 6. RLS e autorização

- `OWNER`: acesso integral e operações administrativas via funções seguras.
- `COMERCIAL`: leitura das cidades atribuídas e escrita somente quando a permissão específica estiver ativa.
- `VIEWER`: sessão anônima restrita à cidade selecionada e somente leitura.
- Gestores de solicitações: leitura e decisão apenas para solicitações que intersectem suas cidades atribuídas; não podem alterar cargo nem permissões.

Toda mutação será validada no banco/Edge Function, não somente pela interface. Policies cobrirão tabelas e objetos do Storage. Funções privilegiadas usarão `security definer`, `search_path` fixo e validação explícita do ator.

## 7. Tradução

Na criação, o frontend envia `sourceLanguage`. O registro original é salvo imediatamente e um job cria somente os idiomas ausentes (`pt`, `en`, `es`). A Edge Function chama Google Cloud Translation Advanced com glossário para nomes próprios, categorias e termos comerciais.

- Criação: traduz automaticamente campos textuais habilitados.
- Edição: atualiza somente a linha do idioma selecionado.
- Tradução manual: regenera apenas o idioma escolhido, com confirmação caso já exista conteúdo.
- Falha: o conteúdo original permanece disponível; o job recebe `failed` e pode ser repetido.
- O glossário é versionado no repositório e aplicado a todas as traduções automáticas.

## 8. Mídia

O migrador baixará cada arquivo atual, validará MIME/tamanho/hash e enviará para buckets privados ou públicos conforme uso. Caminhos seguirão `products/{product_id}/{media_id}/{variant}`. Links diretos externos deixarão de ser a fonte primária.

Imagens terão original, versão de exibição e thumbnail. Vídeos externos continuarão como referência quando o conteúdo não puder ser legal ou tecnicamente copiado; sua miniatura será armazenada no Supabase. Falhas serão registradas individualmente e impedirão o corte se deixarem produto sem mídia obrigatória.

## 9. Realtime e cache

O catálogo será consultado por cidade e paginado. React Query manterá cache persistente e stale-while-revalidate. Eventos Realtime não transportarão o catálogo inteiro; invalidarão somente as queries afetadas por cidade, categoria, produto, usuário ou solicitação.

Reconexão fará revalidação. Alterações locais usarão atualização otimista somente onde houver rollback seguro. O polling periódico do backend legado será removido.

## 10. Migração e corte

1. Criar infraestrutura, schema, RLS, Storage e funções em ambiente Supabase novo.
2. Gerar backup JSON atual a partir do painel Owner.
3. Normalizar e validar o snapshot sem modificar a origem.
4. Importar tabelas na ordem de dependência.
5. Migrar mídia e atualizar referências.
6. Criar identidades pendentes e vínculos de permissão.
7. Comparar contagens, chaves, preços, ordens e checksums por cidade/categoria.
8. Executar testes de leitura, escrita, RLS, tradução, ativação e Realtime.
9. Abrir janela curta sem edição, gerar snapshot final e aplicar o delta.
10. Alterar variáveis da Vercel para o Supabase e publicar.
11. Fazer smoke test de Owner, Comercial e Viewer.
12. Manter a origem antiga somente como rollback isolado durante a janela de observação; depois remover URL, código e documentação legados.

A migração será bloqueada se contagens não coincidirem, se houver preços órfãos, ordens duplicadas, usuários sem perfil, mídia obrigatória ausente ou falha nos testes de autorização.

## 11. Desempenho

Serão criados índices para cidade/posição, categoria/posição, produto/posição, username normalizado, status de solicitação e datas de atualização. O frontend solicitará somente colunas necessárias, usará paginação e carregamento progressivo. Assets serão servidos pela CDN do Storage com cache-control e dimensões adequadas.

## 12. Observabilidade, backup e rollback

Edge Functions produzirão logs estruturados sem segredos. Eventos críticos entrarão em `audit_events`. O banco usará os recursos de backup disponíveis no plano contratado e exportações JSON manuais compatíveis com a interface existente.

Rollback antes da remoção definitiva consiste em restaurar as variáveis antigas da Vercel e reabrir a origem somente leitura/escrita conforme a fase. Nenhum dado de produção será apagado durante a migração. A desativação final dos serviços antigos ocorrerá somente após aceite funcional e comparação pós-corte.

## 13. Critérios de aceite

- Os serviços legados não recebem chamadas do site publicado.
- Todas as cidades, categorias, produtos, preços, traduções, descrições, mídias e ordens conferem com a origem.
- Todos os usuários e permissões conferem; contas antigas exigem ativação segura.
- Owner, Comercial, gestor de solicitações e Viewer respeitam RLS.
- Criação traduz PT/EN/ES; edição modifica somente o idioma atual.
- Alterações aparecem em outras sessões sem recarregar a página.
- Catálogo inicial e troca de cidade não dependem do tempo de resposta do backend legado.
- Build, lint, testes automatizados e smoke tests passam antes do corte.

## 14. Restrições de execução

- Não reescrever histórico publicado conectado ao Lovable.
- Não apagar ou alterar dados de origem durante importações de ensaio.
- Confirmar no momento exato antes de criar projeto/chaves persistentes, transmitir backup ou segredos via navegador.
- Nunca expor `SUPABASE_SERVICE_ROLE_KEY`, credenciais Google Cloud ou códigos de ativação no frontend, logs ou commits.
