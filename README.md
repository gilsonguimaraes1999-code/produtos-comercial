# Comercial Produtos

Catálogo React + TanStack Start com Supabase como backend oficial.

## Arquitetura

- PostgreSQL/Supabase: cidades, categorias, produtos, valores, usuários, permissões e histórico.
- Supabase Auth: login por `username`, mapeado internamente para um e-mail técnico não exibido.
- Supabase Storage: imagens dos produtos e backups privados.
- Supabase Realtime: atualização automática do catálogo sem recarregar a página.
- MyMemory via Edge Functions: tradução inicial PT/EN/ES sem chave paga, com glossário controlado.
- Vercel: hospedagem do frontend.

O frontend usa exclusivamente o Supabase. Se as variáveis públicas não estiverem configuradas, o site mostra um erro de configuração e não tenta outro backend.

## Regra de tradução

- Na criação de uma categoria ou produto, os idiomas ausentes são traduzidos automaticamente.
- Depois de criado, editar PT altera somente PT; editar EN altera somente EN; editar ES altera somente ES.
- O botão manual de tradução continua disponível quando uma nova tradução for desejada.
- O glossário preserva termos comerciais, por exemplo `Modificações → Modifications → Modificaciones`.

## Usuários

- Usuários migrados entram como `pending_activation`.
- O Owner entrega um código de uso único, válido por 24 horas.
- No primeiro acesso, a pessoa informa username, código e cria sua própria senha.
- Credenciais antigas não são copiadas; cada usuário define a própria senha na ativação.
- A permissão de solicitações permite aprovar somente cidades atribuídas, sem conceder cargos ou outras permissões.

## Desenvolvimento

```bash
pnpm install
pnpm test
pnpm dev
```

Build de produção:

```bash
pnpm build
```

Copie `.env.example` para `.env.local` e preencha apenas a URL e a chave pública `anon` no frontend. A chave `service_role` é exclusiva das ferramentas administrativas locais e nunca deve ser enviada ao GitHub ou à Vercel.

## Banco e funções

- Migrações SQL: `supabase/migrations/`
- Edge Functions: `supabase/functions/`
- Glossário inicial: `supabase/seed/translation-glossary.csv`
- Plano operacional: `docs/superpowers/plans/2026-08-27-supabase-complete-migration.md`

## Ferramentas de migração

As ferramentas trabalham em quatro etapas, sempre com um snapshot local privado:

```bash
pnpm migration:normalize -- entrada.json saida-normalizada.json
pnpm migration:import -- saida-normalizada.json
pnpm migration:media -- saida-normalizada.json
pnpm migration:verify -- saida-normalizada.json relatorio.json
```

O importador é idempotente e preserva IDs, ordem, preços por cidade, traduções, permissões e solicitações. A migração de mídia valida MIME, tamanho e checksum antes do upload.

## Publicação

1. Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` na Vercel.
2. Publique a versão atual do repositório, incluindo os arquivos removidos no commit.
3. Valide login, Visualizador, edição, Storage e Realtime.

Não reescreva o histórico publicado. Faça um commit normal com inclusões, alterações e exclusões para preservar a integração com o Lovable.
