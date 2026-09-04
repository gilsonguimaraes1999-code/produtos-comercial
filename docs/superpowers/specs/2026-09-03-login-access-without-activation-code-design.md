# Login e solicitação de acesso sem código de ativação

## Objetivo

Restaurar login, visualizador e solicitação de acesso sem ativar faturamento no Supabase. O novo fluxo deve permitir que a pessoa defina sua senha ao solicitar acesso e use essa mesma senha depois da aprovação, sem código de ativação ou etapa de “Primeiro acesso”. A implementação será validada primeiro no localhost e só será publicada após conferência do usuário.

## Situação atual

O projeto Supabase atual responde HTTP 402 porque ultrapassou as cotas gratuitas de armazenamento, egress e cached egress. Como login, catálogo público e solicitações usam o mesmo projeto, todos esses fluxos falham ao mesmo tempo. Alterações apenas no frontend não restauram o serviço.

O fluxo atual aprova uma solicitação criando um usuário Auth com senha aleatória, mantém o perfil como `pending_activation` e gera um código de ativação. Esse desenho será substituído.

## Arquitetura recomendada

Um novo projeto Supabase gratuito será usado como banco oficial. Dados estruturados serão migrados: perfis, cidades, permissões, categorias, produtos, traduções, valores, histórico e solicitações relevantes. Arquivos de mídia não serão armazenados no Supabase Storage; os produtos continuarão referenciando URLs externas válidas, evitando consumir novamente a cota de armazenamento e tráfego do Supabase.

O frontend continuará usando apenas a URL e a chave pública do Supabase. Operações privilegiadas permanecerão em Edge Functions com a service role apenas no servidor.

## Novo fluxo de solicitação

1. A pessoa informa nome, usuário, senha e uma ou mais cidades.
2. O frontend envia os dados a uma Edge Function pública protegida por validação, limitação de tentativas e chave de idempotência.
3. A função cria a identidade no Supabase Auth com a senha informada. A senha nunca é gravada em tabelas, logs ou histórico.
4. A solicitação guarda somente a referência ao usuário Auth, os dados públicos e as cidades pedidas.
5. Enquanto pendente, o usuário Auth não possui perfil ativo e não consegue entrar no sistema.
6. Ao aprovar, a função cria o perfil `active`, vincula cidades e permissões e registra o histórico. A pessoa passa a entrar com a senha escolhida.
7. Ao reprovar, a função remove a identidade Auth reservada para aquela solicitação e registra a reprovação.

## Contas existentes

Contas já ativas serão migradas preservando seus vínculos e permissões. Como hashes de senha do Supabase Auth não podem ser exportados ou reutilizados de forma segura, contas existentes não terão a senha copiada automaticamente para o novo projeto. Para elas haverá redefinição administrada de senha, sem código de ativação público. Nenhuma senha será exposta em arquivo ou commit.

Perfis antigos em `pending_activation` serão migrados como pendentes e deverão receber uma senha administrada antes de serem ativados, ou ser recriados por uma nova solicitação. Não haverá uma tela que permita redefinir senha apenas conhecendo o nome de usuário.

## Interface

- Remover o botão “Primeiro acesso”.
- Remover formulário, textos e traduções relativos a código de ativação.
- Tornar senha e confirmação obrigatórias em “Solicitar acesso”.
- Exibir estados específicos para indisponibilidade do serviço, solicitação duplicada, usuário existente e credenciais inválidas.
- Manter o visualizador independente de sessão autenticada.

## Concorrência e segurança

- A criação da solicitação será idempotente para evitar contas duplicadas em cliques repetidos.
- Username será normalizado e terá unicidade tanto em solicitações pendentes quanto em perfis.
- Aprovação e reprovação continuarão transacionais e idempotentes.
- Senhas serão entregues diretamente ao Supabase Auth e nunca persistidas no banco da aplicação.
- Service role e credenciais administrativas nunca entrarão no bundle do navegador ou no GitHub.

## Migração e publicação

1. Preparar schema, funções e frontend localmente.
2. Executar testes unitários, de integração SQL e build.
3. Subir o site no localhost para conferência do usuário.
4. Criar/configurar o novo projeto Supabase gratuito e importar os dados estruturados.
5. Validar login, visualizador, solicitação e aprovação no ambiente novo.
6. Somente após aprovação do usuário, fazer commit/push normal no GitHub e atualizar as variáveis da Vercel.
7. Validar o deploy de produção em navegadores sem sessão prévia.

## Critérios de aceite

- O localhost abre e permite conferir todas as telas afetadas.
- Não existe campo, botão ou dependência de código de ativação no fluxo público.
- Nova solicitação exige senha e confirmação.
- Após aprovação, a mesma senha escolhida autentica a conta.
- Antes da aprovação e após reprovação, a conta não acessa o dashboard.
- O visualizador carrega cidades e produtos sem autenticação.
- Nenhuma mídia nova é enviada ao Supabase Storage.
- Testes e build passam antes da publicação.
