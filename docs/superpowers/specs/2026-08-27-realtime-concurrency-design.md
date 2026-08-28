# Realtime e concorrência segura

## Objetivo

Reduzir ao mínimo o tempo entre a criação e a análise de uma solicitação de acesso e permitir que várias pessoas editem cidades e catálogos simultaneamente sem travamentos, recargas integrais desnecessárias ou perda silenciosa de alterações.

## Diagnóstico atual

- A tela de usuários consulta solicitações a cada quatro segundos, embora as tabelas já façam parte da publicação `supabase_realtime`.
- Aprovar ou rejeitar uma solicitação é seguido por novas consultas completas das solicitações e, quando permitido, de todos os usuários.
- Cada evento Realtime do catálogo agenda uma nova leitura do snapshot completo, incluindo cidades, categorias, produtos, preços, traduções, mídias e descrições.
- Cada mutação também força uma leitura completa ao terminar.
- Os RPCs de edição não recebem a versão que o editor abriu. Duas pessoas podem, portanto, salvar dados antigos sobre dados mais recentes.
- Reordenações são transacionais, mas não distinguem uma lista atual de uma lista antiga apresentada a outro editor.

## Arquitetura escolhida

Será adotado um modelo híbrido com:

1. Realtime granular para notificações e sincronização de registros afetados.
2. Atualizações otimistas no frontend para resposta imediata.
3. Concorrência otimista validada pelo PostgreSQL para impedir sobrescritas silenciosas.
4. Bloqueios transacionais apenas no escopo necessário para reordenações.
5. Recuperação por leitura integral somente quando houver reconexão, perda de eventos ou inconsistência detectada.

## Solicitações de acesso

### Criação

- O envio continuará sendo validado no PostgreSQL por uma operação atômica e idempotente.
- A resposta conterá o identificador da solicitação e um comprovante secreto de acompanhamento gerado no cliente ou na função de borda. Somente o hash será persistido.
- A tela manterá um estado de acompanhamento com os estados `enviando`, `pendente`, `aprovada` ou `rejeitada`.
- Erros conhecidos continuarão sendo traduzidos para mensagens específicas, sem retornar detalhes internos do banco.

### Comunicação com os responsáveis

- A tela de usuários e a página de solicitações assinarão alterações em `access_requests` e `access_request_cities`.
- O polling de quatro segundos será removido.
- Eventos serão agrupados por um intervalo curto para evitar consultas duplicadas quando a solicitação e suas cidades forem inseridas na mesma transação.
- Ao receber um evento, será consultada apenas a lista visível de solicitações; usuários e histórico não serão recarregados sem necessidade.
- O botão mostrará imediatamente cor de destaque e contador quando existir solicitação pendente administrável pelo usuário atual.

### Aprovação e rejeição

- A função de revisão manterá o bloqueio da solicitação `FOR UPDATE`, garantindo que apenas a primeira decisão válida seja aplicada.
- Um identificador idempotente impedirá repetição acidental por clique duplo ou repetição de rede.
- A aprovação continuará criando o usuário de autenticação com privilégio administrativo somente no servidor.
- A resposta retornará os registros alterados necessários para atualizar a interface local, evitando reler listas completas.
- Eventos Realtime atualizarão os demais responsáveis conectados e removerão imediatamente a solicitação já respondida.
- O solicitante poderá consultar o estado usando o identificador e o comprovante secreto. Quando a solicitação for aprovada, receberá o próximo passo de ativação sem expor outras solicitações.

## Controle de concorrência

### Versões

- `cities`, `categories`, `products` e `description_templates` receberão uma coluna `version bigint not null default 1`.
- Alterações em traduções, preços ou mídias incrementarão a versão da entidade principal correspondente na mesma transação.
- Os modelos do frontend transportarão `version` junto com `updatedAt`.

### Salvamento

- RPCs de atualização receberão `expected_version`.
- O registro será bloqueado por `SELECT ... FOR UPDATE` durante a validação e a gravação.
- Se a versão atual for diferente da versão esperada, o RPC levantará `EDIT_CONFLICT` e não gravará nenhuma parte da alteração.
- Criações não exigirão versão esperada.
- A versão será incrementada uma vez por operação lógica, ainda que a operação altere várias tabelas relacionadas.

### Experiência de conflito

- O formulário continuará aberto e preservará todos os campos digitados.
- Um aviso explicará que outra pessoa alterou o mesmo item.
- O usuário poderá:
  - carregar a versão mais recente e descartar sua edição;
  - copiar os dados digitados para revisão manual;
  - cancelar e continuar analisando o formulário.
- Não haverá opção de sobrescrever sem confirmação explícita. Uma futura sobrescrita deverá usar a versão recém-carregada.

### Reordenação

- Reordenação de cidades usará um bloqueio transacional específico para a lista global de cidades.
- Reordenação de categorias usará um bloqueio por cidade.
- Reordenação de produtos usará um bloqueio por categoria.
- Cada chamada receberá uma revisão esperada do escopo. Se a lista mudou, retornará `ORDER_CONFLICT` em vez de aplicar uma ordem calculada sobre dados antigos.
- Alterações em produtos de categorias diferentes poderão ocorrer em paralelo.

## Sincronização granular do catálogo

- O estado local será indexado por identificadores de cidade, categoria e produto.
- Após uma mutação bem-sucedida, a resposta do RPC será aplicada imediatamente ao estado local.
- Eventos de `product_translations`, `product_prices` e `product_media` serão agrupados pelo `product_id` e provocarão uma única leitura daquele produto.
- Eventos de traduções de categoria atualizarão somente a categoria correspondente.
- Eventos de cidade atualizarão somente metadados de cidade e as listas de ordem relacionadas.
- A leitura integral do snapshot permanecerá para carregamento inicial, mudança de idioma, reconexão após ausência prolongada e recuperação de inconsistência.
- Um evento originado pelo próprio cliente será reconciliado pela versão e não causará uma segunda atualização visual desnecessária.

## Cache e estado de interface

- O cache persistente será atualizado por entidade e manterá a última revisão confirmada.
- Mutações simultâneas terão estado de carregamento por entidade, não um bloqueio global do catálogo.
- Botões impedirão clique duplicado apenas para o item atualmente em operação.
- Falhas de rede reverterão somente a atualização otimista afetada.
- Reconexão executará uma verificação de revisão; o snapshot completo só será baixado quando a revisão local estiver defasada ou inconsistente.

## Banco, segurança e auditoria

- Todas as validações de versão e permissão serão executadas no PostgreSQL.
- RLS continuará limitando solicitações às cidades administráveis pelo usuário.
- O comprovante de acompanhamento de uma solicitação nunca será armazenado em texto puro.
- Chaves administrativas continuarão restritas às funções de borda.
- Eventos de auditoria registrarão ator, entidade, versão anterior, versão nova e metadados da operação.
- Migrações serão aditivas e compatíveis com os dados atuais; nenhuma tabela existente será apagada.

## Tratamento de erros

- `EDIT_CONFLICT`: o registro foi alterado depois da abertura do formulário.
- `ORDER_CONFLICT`: a ordem da lista mudou durante a edição.
- `REQUEST_NOT_PENDING`: outra pessoa já respondeu à solicitação.
- `REQUEST_PERMISSION_DENIED`: o responsável não administra todas as cidades necessárias.
- `REALTIME_DISCONNECTED`: a interface informa modo de reconexão e usa verificação de revisão.
- Erros desconhecidos serão registrados tecnicamente e apresentados ao usuário como falha recuperável.

## Testes e critérios de aceite

- Uma nova solicitação aparece para um responsável conectado sem atualização manual e normalmente em menos de dois segundos.
- Aprovação ou rejeição desaparece nas demais sessões sem atualização manual.
- Dois usuários editando produtos diferentes conseguem salvar em paralelo.
- Dois usuários editando o mesmo produto: o primeiro salva; o segundo recebe `EDIT_CONFLICT` e nenhum dado é perdido.
- Eventos de preço, tradução e mídia de um produto resultam em apenas uma atualização desse produto.
- Reordenar categorias simultaneamente na mesma cidade gera conflito para a lista antiga; reordenar cidades diferentes não bloqueia uma à outra.
- Perda e retorno da conexão recuperam a revisão correta sem duplicar registros.
- Todas as regras de permissão e os testes atuais continuam passando.
- O build de produção e os testes unitários, de integração e SQL passam antes da publicação.

## Implantação

1. Aplicar migrações aditivas de versão, revisões de escopo, RPCs e acompanhamento seguro.
2. Publicar funções de borda compatíveis com os contratos antigos e novos durante a transição.
3. Publicar frontend com suporte a Realtime granular e conflitos.
4. Monitorar conflitos, falhas de canal e tempo de aprovação.
5. Remover os caminhos legados de polling e recarga integral somente após a validação do novo fluxo.

Não será feito force push, rebase, amend ou qualquer reescrita do histórico conectado ao Lovable.
