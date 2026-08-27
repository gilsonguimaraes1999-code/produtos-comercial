# Atualização do Comercial Produtos

O site utiliza o Supabase como backend oficial para catálogo, usuários, permissões, solicitações, traduções e mídias.

## Variáveis da Vercel

Configure somente as variáveis públicas do frontend:

```env
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA
```

Nunca publique a chave `service_role`, tokens administrativos, códigos de ativação ou arquivos `.env` privados.

## Regra de tradução

- Na criação de categoria ou produto, os idiomas ausentes são traduzidos automaticamente.
- Na edição, somente o idioma selecionado é alterado.
- Os demais idiomas permanecem exatamente como estavam.

## Publicação

Envie a versão atual em um commit normal, incluindo exclusões. A Vercel recompilará o site usando o Supabase.
