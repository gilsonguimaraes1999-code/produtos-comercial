# Correção de idiomas, moedas e estrutura da planilha

Esta versão corrige três pontos:

1. Nomes de categorias e produtos não exibem mais o JSON bruto no site.
2. Idioma e moeda ficam sincronizados:
   - PT → BRL
   - EN → USD
   - ES → EUR
   - BRL → PT
   - USD ou GBP → EN
   - EUR → ES
3. A aba `Products` passa a usar exatamente estas colunas:

```text
id
categoryId
name
order
createdAt
updatedAt
updatedBy
nameBR
nameEN
nameES
amountBRL
amountUSD
amountGBP
amountEUR
```

Cada produto continua com somente um ID e uma linha. Alterar qualquer moeda atualiza a coluna correspondente da mesma linha.

## Atualizar o Apps Script

1. Abra `apps-script/Code.gs`.
2. Substitua todo o código do Apps Script atual.
3. Salve.
4. Execute a função pública `migrateCatalogSchema` uma vez.
5. Confira as abas `Categories` e `Products`.
6. Crie uma nova versão da implantação do Aplicativo da Web.

A migração lê os cabeçalhos antigos antes de reorganizar as colunas. Ela também converte textos que tenham sido gravados como JSON visível.

## Atualizar o site

Publique esta pasta no GitHub e importe o repositório no Vercel. Mantenha a variável:

```env
VITE_APPS_SCRIPT_API_URL=SUA_URL_EXEC
```


## Regra de tradução na criação e edição

- Na criação de categoria ou produto, o Apps Script traduz o nome para Português, Inglês e Espanhol.
- Na edição, somente a coluna do idioma atualmente selecionado é alterada.
- Editar Português altera `titleBR`/`nameBR` e o campo-base de compatibilidade.
- Editar Inglês altera somente `titleEN`/`nameEN`.
- Editar Espanhol altera somente `titleES`/`nameES`.
- Os outros idiomas são preservados e não são traduzidos novamente.
