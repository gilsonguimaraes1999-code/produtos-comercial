# Comercial Produtos

Catálogo interno em React + TanStack Start, conectado ao Google Apps Script e preparado para publicação no Vercel.

## Novidades desta versão

- Valores independentes em **Real, Dólar, Libra e Euro** no mesmo produto.
- Botão **Adicionar valor em outra moeda** na criação e edição de produtos.
- Exibição automática do preço conforme a região selecionada:
  - `PT` → Real brasileiro (`BRL`)
  - `US` → Dólar americano (`USD`)
  - `GB` → Libra esterlina (`GBP`)
  - `EU` → Euro (`EUR`)
- Tradução automática dos nomes de categorias e produtos para Português, Inglês e Espanhol pelo Google Apps Script.
- `US` e `GB` exibem a tradução em inglês, cada um com sua própria moeda.
- `EU` exibe a tradução em espanhol e o preço em Euro.
- Compatibilidade com produtos antigos: o valor/moeda já existente é preservado como primeiro preço.
- Paginação com até 8 produtos por página.
- Projeto sem `node_modules`, pronto para GitHub e Vercel.

## Atualizar o Google Apps Script

O frontend desta versão precisa do novo backend presente em:

```text
apps-script/Code.gs
```

1. Abra a planilha ligada ao projeto.
2. Acesse **Extensões → Apps Script**.
3. Substitua o código atual pelo novo `Code.gs`.
4. Execute `setupProject` uma vez.
5. Para traduzir categorias e produtos que já existiam antes desta atualização, execute também `translateExistingCatalog`.
6. Atualize a implantação do Aplicativo da Web criando uma nova versão.

O Apps Script adicionará automaticamente as colunas `translations` e `prices` sem apagar os dados existentes.

## Tradução automática

Ao salvar uma categoria ou produto, o texto digitado no idioma/região atual é enviado ao Apps Script. O backend usa `LanguageApp.translate` para gerar e armazenar versões em:

- Português (`pt`)
- Inglês (`en`)
- Espanhol (`es`)

Os nomes criados pelo usuário continuam sendo os dados oficiais; apenas as versões traduzidas são armazenadas junto deles para exibição.

## Executar localmente

Requisitos:

- Node.js 20 ou superior.
- pnpm 10.

```bash
pnpm install
pnpm dev
```

## Gerar versão de produção

```bash
pnpm build
```

## Variável do Apps Script

Altere o arquivo `.env` quando utilizar outra implantação:

```env
VITE_APPS_SCRIPT_API_URL=https://script.google.com/macros/s/SEU_ID/exec
```

## Publicar no GitHub e Vercel

1. Envie os arquivos desta pasta para a raiz do repositório.
2. Não envie `node_modules`, `.output`, `dist` ou `.tanstack`.
3. Importe o repositório no Vercel.
4. Use `pnpm build` como comando de build.
5. Cadastre `VITE_APPS_SCRIPT_API_URL` nas variáveis de ambiente do Vercel, caso não mantenha o `.env` no repositório.


## Traduções e valores por moeda

- Cada categoria é salva em Português, Inglês e Espanhol no mesmo registro.
- Cada produto mantém um único ID e uma única linha na aba `Products`.
- O valor em Real permanece na coluna `amount`.
- Os valores adicionais ficam nas colunas `amountUSD`, `amountGBP` e `amountEUR`.
- Alterar uma moeda atualiza a coluna correspondente do mesmo produto, sem criar outro registro.
- Execute `setupProject()` após substituir o Apps Script. Para migrar registros existentes, execute `translateExistingCatalog()`.
- O seletor inferior contém apenas PT, EN e ES. A moeda exibida é escolhida separadamente no topo do catálogo.

## Migração da estrutura atual

Para corrigir os registros antigos e aplicar `nameBR`, `nameEN`, `nameES`, `amountBRL`, `amountUSD`, `amountGBP` e `amountEUR`, execute `migrateCatalogSchema` no Apps Script após colar o novo `Code.gs`.
