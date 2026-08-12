import { Languages } from 'lucide-react';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Language = 'pt' | 'en' | 'es';

const STORAGE_KEY = 'language';

const pt = {
  siteName: 'Comercial Produtos',
  siteDescription: 'Catálogo comercial de produtos.',
  appTitle: 'Site de Produtos',
  access: 'Acessar',
  username: 'Usuário',
  password: 'Senha',
  continue: 'Continuar',
  enter: 'Entrar',
  backToUser: 'Voltar para usuário',
  rememberAccess: 'Lembrar acesso',
  userRequired: 'Informe o usuário.',
  invalidCredentials: 'Credenciais não reconhecidas.',
  showPassword: 'Mostrar senha',
  hidePassword: 'Ocultar senha',
  requestAccess: 'Solicitar acesso',
  requestAccessTitle: 'Solicitar acesso',
  requestAccessSubtitle: 'Preencha seus dados. Um administrador vai revisar e definir seu cargo.',
  displayName: 'Nome de exibição',
  displayNamePlaceholder: 'Seu nome',
  requestUsernamePlaceholder: 'sem_espacos',
  requestPasswordHint: 'Mínimo 8 caracteres',
  sendAccessRequest: 'Enviar pedido',
  alreadyHaveAccount: 'Já tem conta?',
  accessRequestSent: 'Pedido enviado. Aguarde aprovação do administrador.',
  fillAccessRequest: 'Preencha nome, usuário, senha e cidade.',
  passwordMinLength: 'A senha precisa ter no mínimo 8 caracteres.',

  categories: 'Categorias',
  products: 'Produtos',
  product: 'Produto',
  users: 'Usuários',
  category: 'Categoria',
  owner: 'Owner',
  commercial: 'Comercial',
  loadingCatalog: 'Carregando catálogo...',
  noCategoryFound: 'Nenhuma categoria encontrada.',
  noCategoryCreated: 'Nenhuma categoria criada',
  ownerCreateFirst: 'O Owner precisa criar a primeira categoria antes de adicionar produtos.',
  createFirstCategory: 'Criar primeira categoria',
  availableOne: '1 produto disponível nesta categoria.',
  availableMany: '{{count}} produtos disponíveis nesta categoria.',
  searchProductIn: 'Pesquisar produto em {{category}}...',
  catalogBreadcrumb: 'Catálogo · {{category}}',
  clearSearch: 'Limpar busca',
  emptyCategory: 'Nenhum produto nesta categoria.',
  emptyCategoryOwnerHint: 'Arraste um produto para cá ou crie um novo.',
  show: 'Exibir',
  tenPerPage: '10 por página',
  allProducts: 'Todos',
  sort: 'Ordenar',
  defaultOrder: 'Padrão',
  priceLowToHigh: 'Menor preço',
  priceHighToLow: 'Maior preço',
  gridView: 'Grade',
  listView: 'Lista',
  showGridView: 'Mostrar em grade',
  showListView: 'Mostrar em lista',
  productFilters: 'Filtros de produtos',
  standardizeDescriptions: 'Padronizar descrições',
  translateProducts: 'Traduzir produtos',
  translatingProducts: 'Traduzindo produtos...',
  productsTranslated: 'Produtos traduzidos com sucesso.',
  productsAlreadyTranslated: 'Produtos já sincronizados nesse idioma.',
  updateMansionPhotos: 'Atualizar fotos',
  updatingMansionPhotos: 'Atualizando fotos...',
  mansionPhotosUpdated: 'Fotos das mansões atualizadas com sucesso.',
  mansionPhotosAlreadyUpdated: 'As mansões com foto conhecida já estão atualizadas.',

  editCategory: 'Editar categoria',
  delete: 'Excluir',
  deleteCategory: 'Excluir categoria',
  deleteProduct: 'Excluir produto',
  deleteUser: 'Excluir usuário',
  deleteCategoryMessage: 'Tem certeza de que deseja excluir a categoria "{{name}}"?',
  deleteProductMessage: 'Tem certeza de que deseja excluir o produto "{{name}}"?',
  deleteUserMessage: 'Tem certeza de que deseja excluir a conta de "{{name}}"?',
  deleteCategoryWarning: 'Todos os produtos vinculados a esta categoria também serão excluídos. Esta ação não poderá ser desfeita.',
  irreversible: 'Esta ação não poderá ser desfeita.',
  categoryDeleted: 'Categoria excluída com sucesso.',
  productDeleted: 'Produto excluído com sucesso.',
  userDeleted: 'Usuário excluído com sucesso.',

  newCategory: 'Nova categoria',
  newProduct: 'Novo produto',
  editProduct: 'Editar produto',
  productDetails: 'Detalhes do produto',
  usersPermissions: 'Usuários e permissões',
  configuration: 'Configuração',
  cancel: 'Cancelar',
  close: 'Fechar',
  deleting: 'Excluindo...',
  saving: 'Salvando...',
  saveCategory: 'Salvar categoria',
  saveProduct: 'Salvar produto',
  sendSave: 'Enviando e salvando...',
  processingImages: 'Processando imagens...',

  categoryTitle: 'Título da categoria',
  categoryTitlePlaceholder: 'Ex.: Veículos',
  globalIcon: 'Ícone global',
  iconNameUsed: 'Nome do Ícone utilizado no site',
  searchIcon: 'Buscar Ícone',
  typeCategoryTitle: 'Digite o título da categoria.',
  categorySaveError: 'Erro ao salvar categoria.',
  categorySaved: 'Categoria salva com sucesso.',
  select: 'Selecione',

  productName: 'Nome do produto',
  productNamePlaceholder: 'Ex.: VIP Ouro',
  price: 'Valor',
  currency: 'Moeda',
  productImages: 'Fotos do produto',
  uploadImages: 'Anexar imagens',
  imageLimits: 'PNG, JPG ou WEBP, até 10 MB',
  importByLink: 'Importar por link',
  add: 'Adicionar',
  imageHelper: 'As novas imagens são otimizadas antes do envio para melhorar o carregamento e a exibição.',
  mainImage: 'Imagem principal',
  additionalImage: 'Imagem adicional',
  currentImage: 'Imagem atual',
  linkImage: 'Imagem por link',
  mainVideo: 'Video principal',
  additionalVideo: 'Video adicional',
  currentVideo: 'Video atual',
  linkVideo: 'Video por link',
  moveUp: 'Mover para cima',
  moveDown: 'Mover para baixo',
  remove: 'Remover',
  productMaxImages: 'Cada produto pode ter no máximo 10 imagens.',
  notImage: '{{name}} não é uma imagem.',
  imageTooLarge: '{{name}} ultrapassa o limite de 10 MB.',
  importAttachmentError: 'Erro ao importar anexos.',
  invalidLink: 'Informe um link válido iniciado por http:// ou https://.',
  createOrSelectCategory: 'Crie ou selecione uma categoria.',
  typeProductName: 'Digite o nome do produto.',
  typeValidPrice: 'Digite um valor válido.',
  addProductPhoto: 'Adicione pelo menos uma foto do produto.',
  productSaveError: 'Erro ao salvar produto.',
  productSaved: 'Produto salvo com sucesso.',
  markAsSold: 'Vendido',
  sold: 'Vendido',
  soldOwner: 'Dono',
  soldOwnerName: 'Nome do dono',
  soldOwnerNamePlaceholder: 'Ex.: Guilherme',
  soldOwnerDiscordId: 'Discord ID do dono',
  soldOwnerRequired: 'Informe o nome do dono para marcar como vendido.',
  productPermissionDenied: 'Você não tem permissão para executar esta ação no produto.',
  productPermissions: 'Permissões de produto',
  productPermissionsHint: 'Escolha exatamente quais ações este usuário pode fazer nos produtos.',
  noImage: 'Sem imagem',
  moveProduct: 'Mover produto',
  readImageError: 'Não foi possível ler {{name}}.',
  optimizeImageError: 'Não foi possível otimizar {{name}}.',
  previousImage: 'Imagem anterior',
  nextImage: 'Próxima imagem',
  imageThumbnail: 'Visualizar imagem {{index}}',
  editProductAction: 'Editar {{name}}',
  deleteProductAction: 'Excluir {{name}}',
  city: 'Cidade',
  addCity: 'Adicionar cidade',
  editCity: 'Editar cidade',
  deleteCity: 'Excluir cidade',
  saveCity: 'Salvar cidade',
  selectCity: 'Selecione uma cidade',
  typeCityName: 'Digite o nome da cidade.',
  cityNamePlaceholder: 'Ex.: Los Angeles',
  citySaveError: 'Erro ao salvar cidade.',
  cityDeleted: 'Cidade excluída com sucesso.',
  cityStats: '{{categories}} categorias · {{products}} produtos',
  deleteCityMessage: 'Tem certeza de que deseja excluir a cidade "{{name}}"?',
  deleteCityWarning: 'Cidades com categorias ou produtos vinculados não podem ser excluídas.',
  ownerCreateFirstCity: 'O Owner precisa criar a primeira cidade antes de adicionar categorias.',
  catalogCityBreadcrumb: 'Catálogo · {{city}} · {{category}}',
  cloneProduct: 'Clonar produto',
  cloneCategory: 'Clonar categoria',
  cloneProductAction: 'Clonar {{name}}',
  targetCity: 'Cidade de destino',
  targetCategory: 'Categoria de destino',
  cloneProductHint: 'A cópia será criada na categoria selecionada, preservando mídia, valores e descrição.',
  cloneCategoryHint: 'A categoria e todos os seus produtos serão copiados para a cidade selecionada.',
  productCloned: 'Produto clonado com sucesso.',
  categoryCloned: 'Categoria clonada com sucesso.',
  description: 'Descrição',
  visualEditor: 'Editor visual',
  htmlCode: 'Código HTML',
  importHtml: 'Importar HTML',
  exportHtml: 'Exportar HTML',
  copyHtml: 'Copiar HTML',
  descriptionPreview: 'Pré-visualização da descrição',
  emptyDescriptionPreview: 'Sem descrição.',
  bold: 'Negrito',
  italic: 'Itálico',
  underline: 'Sublinhado',
  heading: 'Título',
  textColor: 'Cor do texto',
  alignLeft: 'Alinhar à esquerda',
  alignCenter: 'Centralizar',
  alignRight: 'Alinhar à direita',
  numberedList: 'Lista numerada',
  bulletList: 'Lista com marcadores',
  insertLink: 'Inserir link',
  insertImage: 'Inserir imagem',
  insertTable: 'Inserir tabela',
  clearFormatting: 'Limpar formatação',
  linkUrl: 'URL do link',
  imageUrl: 'URL da imagem',

  exhibitorPermissions: 'Permissões do site',
  permissionsHint: 'Owner edita tudo. Comercial apenas visualiza.',
  newAccount: 'Nova conta',
  loadingUsers: 'Carregando usuários...',
  editAccount: 'Editar conta',
  name: 'Nome',
  role: 'Cargo',
  activeAccount: 'Conta ativa',
  saveAccount: 'Salvar conta',
  closeSettings: 'Fechar configurações',
  fillNameUser: 'Preencha nome e usuário.',
  definePassword: 'Defina uma senha para a nova conta.',
  saveUserError: 'Erro ao salvar usuário.',
  userSaved: 'Usuário salvo com sucesso.',
  deleteUserError: 'Erro ao excluir usuário.',
  leaveEmptyPassword: 'Deixe vazio para manter',
  requiredPassword: 'Senha obrigatéria',
  active: 'Ativo',
  inactive: 'Inativo',
  editUserAction: 'Editar usuário {{name}}',
  deleteUserAction: 'Excluir usuário {{name}}',
  accessRequests: 'Solicitações de acesso',
  accessRequestsHint: 'Pedidos aguardando aprovação e histórico de contas removidas.',
  accessPendingHint: 'Apenas pedidos pendentes aguardando resposta.',
  accessHistory: 'Histórico',
  accessHistoryTitle: 'Histórico de acessos',
  accessHistoryHint: 'Contas aprovadas, reprovadas ou removidas ficam aqui.',
  noAccessRequests: 'Nenhuma solicitação registrada.',
  noPendingAccessRequests: 'Nenhuma solicitação pendente.',
  noAccessHistory: 'Nenhum histórico registrado.',
  approveAccess: 'Aprovar acesso',
  rejectAccess: 'Reprovar acesso',
  accessStatusPending: 'Pendente',
  accessStatusApproved: 'Aprovado',
  accessStatusRejected: 'Reprovado',
  accessStatusRemoved: 'Removido',

  language: 'Idioma',
  selectPortuguese: 'Selecionar Português',
  selectEnglish: 'Selecionar Inglês',
  selectBritishEnglish: 'Selecionar Inglês',
  selectSpanish: 'Selecionar Espanhol',

  currency_BRL: 'Real',
  currency_USD: 'Dólar',
  currency_GBP: 'Libra',
  currency_EUR: 'Euro',
  pricesByRegion: 'Valores por moeda',
  addAnotherCurrency: 'Adicionar valor em outra moeda',
  removeCurrency: 'Remover esta moeda',
  priceRegionHint: 'O site mostra o valor correspondente à moeda selecionada no catálogo.',
  autoTranslationHint: 'Ao salvar, o nome e a descrição serão traduzidos automaticamente para Português, Inglês e Espanhol.',
  editLanguageHint: 'Ao salvar, o idioma atual será usado como base para atualizar Português, Inglês e Espanhol.',
  autoTranslateProductName: 'Tradução automática do nome',
  manualTranslationHint: 'A tradução automática está desligada; este nome será usado nos três idiomas.',
  syncNameAcrossLanguages: 'Usar este nome em todos os idiomas',
  syncNameAcrossLanguagesHint: 'Ao salvar, este nome substituirá Português, Inglês e Espanhol.',
  duplicateCurrency: 'Cada moeda só pode ser adicionada uma vez.',
  atLeastOnePrice: 'Adicione pelo menos um valor válido.',

  resizeSidebar: 'Redimensionar menu lateral',
  moveCategory: 'Mover categoria',
  logout: 'Sair',
  menu: 'Menu',
  backup: 'Backup',
  backupSnapshotTitle: 'Salvar estado atual do site',
  backupSnapshotDescription: 'Gera um arquivo JSON direto no site com categorias, produtos, imagens, precos, icones, usuarios, cargos e configuracoes salvas ate este momento.',
  backupPageDescription: 'Gere e importe arquivos JSON do site. A planilha exibe o ID único do backup e o horario criado.',
  createBackupNow: 'Gerar Backup',
  creatingBackup: 'Gerando backup...',
  importBackup: 'Importar Backup',
  importingBackup: 'Importando backup...',
  backupCreated: 'Backup gerado e baixado pelo site.',
  backupInvalidFile: 'Arquivo de backup inválido.',
  backupImportError: 'Erro ao importar backup.',
  downloadBackup: 'Baixar arquivo',
  backupHistory: 'Backups registrados',
  backupHistoryEmpty: 'Nenhum backup registrado ainda.',
  backupError: 'Erro ao gerar backup.',
  reorderCategories: 'Reordenando categorias...',
  movingProduct: 'Movendo produto...',
  saveChanges: 'Salvar Alterações',
  discardChanges: 'Descartar Alterações',
  savingChanges: 'Salvando alterações...',
  changesSaved: 'Alterações salvas com sucesso.',
  pendingChanges: 'Alterações pendentes',
  genericActionError: 'Não foi possível concluir a ação.',
  genericDeleteError: 'Não foi possível concluir a exclusão.',

  paginationLabel: 'Paginação de produtos',
  paginationInfo: 'Exibindo {{from}}-{{to}} de {{total}} · Página {{page}} de {{pages}}',
  previousPage: 'Página anterior',
  nextPage: 'Próxima página',
  pageNumber: 'Página {{page}}',

  apiNotConfiguredTitle: 'Apps Script não configurado',
  apiNotConfiguredDescription: 'Crie o arquivo .env na raiz do projeto e informe a URL da implantação do Apps Script.',
  apiNotConfiguredCode: 'VITE_APPS_SCRIPT_API_URL=https://script.google.com/macros/s/SEU_ID/exec',
  apiNotConfigured: 'Configure VITE_APPS_SCRIPT_API_URL no arquivo .env.',
  requestTimeout: 'O servidor demorou demais para responder. Tente novamente.',
  networkError: 'Falha de conexão com o servidor.',
  invalidResponse: 'Resposta inválida do Apps Script.',
  requestFailed: 'Não foi possível concluir a solicitação.',
  syncError: 'Erro ao sincronizar catálogo.',
  sessionExpired: 'Sua sessão expirou. Entre novamente.',
  ownerRequired: 'Apenas o cargo Owner pode realizar esta ação.',
  categoryNotFound: 'Categoria não encontrada.',
  productNotFound: 'Produto não encontrado.',
  userNotFound: 'Usuário não encontrado.',
  invalidCurrency: 'Moeda inválida.',
  imageRequired: 'Adicione pelo menos uma imagem.',
  invalidImageContent: 'Uma das imagens não possui conteúdo válido.',
  uploadFailed: 'Falha ao enviar a imagem.',

  pageNotFound: 'Página não encontrada',
  pageNotFoundDescription: 'A página que você procura não existe ou foi movida.',
  goHome: 'Ir para o início',
  pageLoadError: 'Não foi possível carregar esta página',
  pageLoadErrorDescription: 'Algo deu errado. Tente novamente ou volte para o início.',
  tryAgain: 'Tentar novamente',
} as const;

export type TranslationKey = keyof typeof pt;
type TranslationTable = Record<TranslationKey, string>;

const en: TranslationTable = {
  siteName: 'Commercial Products', siteDescription: 'Catálogo comercial de produtos.', appTitle: 'Product Site', access: 'Access', username: 'Username', password: 'Password', continue: 'Continue', enter: 'Sign in', backToUser: 'Back to username', rememberAccess: 'Remember access', userRequired: 'Enter your username.', invalidCredentials: 'Credentials not recognized.', showPassword: 'Show password', hidePassword: 'Hide password', requestAccess: 'Request access', requestAccessTitle: 'Request access', requestAccessSubtitle: 'Fill in your details. An administrator will review and assign your role.', displayName: 'Display name', displayNamePlaceholder: 'Your name', requestUsernamePlaceholder: 'no_spaces', requestPasswordHint: 'Minimum 8 characters', sendAccessRequest: 'Send request', alreadyHaveAccount: 'Already have an account?', accessRequestSent: 'Request sent. Wait for administrator approval.', fillAccessRequest: 'Fill in name, username, password and city.', passwordMinLength: 'Password must be at least 8 characters.',
  categories: 'Categories', products: 'Products', product: 'Product', users: 'Users', category: 'Category', owner: 'Owner', commercial: 'Commercial', loadingCatalog: 'Loading catalog...', noCategoryFound: 'No categories found.', noCategoryCreated: 'No categories created', ownerCreateFirst: 'The Owner must create the first category before adding products.', createFirstCategory: 'Create first category', availableOne: '1 product available in this category.', availableMany: '{{count}} products available in this category.', searchProductIn: 'Search products in {{category}}...', catalogBreadcrumb: 'Catalog · {{category}}', clearSearch: 'Clear search', emptyCategory: 'No products in this category.', emptyCategoryOwnerHint: 'Drag a product here or create a new one.', show: 'Show', tenPerPage: '10 per page', allProducts: 'All products', sort: 'Sort', defaultOrder: 'Standard', priceLowToHigh: 'Lowest price', priceHighToLow: 'Highest price', gridView: 'Grid', listView: 'List', showGridView: 'Show as grid', showListView: 'Show as list', productFilters: 'Product filters', standardizeDescriptions: 'Standardize descriptions', translateProducts: 'Translate products', translatingProducts: 'Translating products...', productsTranslated: 'Products translated successfully.', productsAlreadyTranslated: 'Products already synchronized in this language.', updateMansionPhotos: 'Update photos', updatingMansionPhotos: 'Updating photos...', mansionPhotosUpdated: 'Mansion photos updated successfully.', mansionPhotosAlreadyUpdated: 'Mansions with known photos are already updated.',
  editCategory: 'Edit category', delete: 'Delete', deleteCategory: 'Delete category', deleteProduct: 'Delete product', deleteUser: 'Delete user', deleteCategoryMessage: 'Are you sure you want to delete the category "{{name}}"?', deleteProductMessage: 'Are you sure you want to delete the product "{{name}}"?', deleteUserMessage: 'Are you sure you want to delete the account "{{name}}"?', deleteCategoryWarning: 'All products linked to this category will also be deleted. This action cannot be undone.', irreversible: 'This action cannot be undone.', categoryDeleted: 'Category deleted successfully.', productDeleted: 'Product deleted successfully.', userDeleted: 'User deleted successfully.',
  newCategory: 'New category', newProduct: 'New product', editProduct: 'Edit product', productDetails: 'Product details', usersPermissions: 'Users and permissions', configuration: 'Configuration', cancel: 'Cancel', close: 'Close', deleting: 'Deleting...', saving: 'Saving...', saveCategory: 'Save category', saveProduct: 'Save product', sendSave: 'Uploading and saving...', processingImages: 'Processing images...',
  categoryTitle: 'Category title', categoryTitlePlaceholder: 'E.g.: Vehicles', globalIcon: 'Global icon', iconNameUsed: 'Icon name used on the site', searchIcon: 'Search icon', typeCategoryTitle: 'Enter the category title.', categorySaveError: 'Error saving category.', categorySaved: 'Category saved successfully.', select: 'Select',
  productName: 'Product name', productNamePlaceholder: 'E.g.: Gold VIP', price: 'Price', currency: 'Currency', productImages: 'Product images', uploadImages: 'Upload images', imageLimits: 'PNG, JPG or WEBP, up to 10 MB', importByLink: 'Import from link', add: 'Add', imageHelper: 'New images are optimized before upload to improve loading and display.', mainImage: 'Main image', additionalImage: 'Additional image', currentImage: 'Current image', linkImage: 'Image from link', mainVideo: 'Main video', additionalVideo: 'Additional video', currentVideo: 'Current video', linkVideo: 'Video from link', moveUp: 'Move up', moveDown: 'Move down', remove: 'Remove', productMaxImages: 'Each product can have up to 10 images.', notImage: '{{name}} is not an image.', imageTooLarge: '{{name}} exceeds the 10 MB limit.', importAttachmentError: 'Error importing attachments.', invalidLink: 'Enter a valid link starting with http:// or https://.', createOrSelectCategory: 'Create or select a category.', typeProductName: 'Enter the product name.', typeValidPrice: 'Enter a valid price.', addProductPhoto: 'Add at least one product photo.', productSaveError: 'Error saving product.', productSaved: 'Product saved successfully.', markAsSold: 'Sold', sold: 'Sold', soldOwner: 'Owner', soldOwnerName: 'Owner name', soldOwnerNamePlaceholder: 'E.g.: William', soldOwnerDiscordId: 'Owner Discord ID', soldOwnerRequired: 'Enter the owner name to mark it as sold.', productPermissionDenied: 'You do not have permission to perform this product action.', productPermissions: 'Product permissions', productPermissionsHint: 'Choose exactly which product actions this user can perform.', noImage: 'No image', moveProduct: 'Move product', readImageError: 'Could not read {{name}}.', optimizeImageError: 'Could not optimize {{name}}.', previousImage: 'Previous image', nextImage: 'Next image', imageThumbnail: 'View image {{index}}', editProductAction: 'Edit {{name}}', deleteProductAction: 'Delete {{name}}',
  city: 'City', addCity: 'Add city', editCity: 'Edit city', deleteCity: 'Delete city', saveCity: 'Save city', selectCity: 'Select a city', typeCityName: 'Enter the city name.', cityNamePlaceholder: 'E.g.: Los Angeles', citySaveError: 'Error saving city.', cityDeleted: 'City deleted successfully.', cityStats: '{{categories}} categories · {{products}} products', deleteCityMessage: 'Are you sure you want to delete the city "{{name}}"?', deleteCityWarning: 'Cities with linked categories or products cannot be deleted.', ownerCreateFirstCity: 'The Owner must create the first city before adding categories.', catalogCityBreadcrumb: 'Catalog · {{city}} · {{category}}', cloneProduct: 'Clone product', cloneCategory: 'Clone category', cloneProductAction: 'Clone {{name}}', targetCity: 'Target city', targetCategory: 'Target category', cloneProductHint: 'The copy will be created in the selected category, preserving media, prices and description.', cloneCategoryHint: 'The category and all of its products will be copied to the selected city.', productCloned: 'Product cloned successfully.', categoryCloned: 'Category cloned successfully.', description: 'Description', visualEditor: 'Visual editor', htmlCode: 'HTML code', importHtml: 'Import HTML', exportHtml: 'Export HTML', copyHtml: 'Copy HTML', descriptionPreview: 'Description preview', emptyDescriptionPreview: 'No description.', bold: 'Bold', italic: 'Italic', underline: 'Underline', heading: 'Heading', textColor: 'Text color', alignLeft: 'Align left', alignCenter: 'Align center', alignRight: 'Align right', numberedList: 'Numbered list', bulletList: 'Bullet list', insertLink: 'Insert link', insertImage: 'Insert image', insertTable: 'Insert table', clearFormatting: 'Clear formatting', linkUrl: 'Link URL', imageUrl: 'Image URL',
  exhibitorPermissions: 'Site permissions', permissionsHint: 'Owner can edit everything. Commercial can only view.', newAccount: 'New account', loadingUsers: 'Loading users...', editAccount: 'Edit account', name: 'Name', role: 'Role', activeAccount: 'Active account', saveAccount: 'Save account', closeSettings: 'Close settings', fillNameUser: 'Enter a name and username.', definePassword: 'Set a password for the new account.', saveUserError: 'Error saving user.', userSaved: 'User saved successfully.', deleteUserError: 'Error deleting user.', leaveEmptyPassword: 'Leave blank to keep current password', requiredPassword: 'Password required', active: 'Active', inactive: 'Inactive', editUserAction: 'Edit user {{name}}', deleteUserAction: 'Delete user {{name}}', accessRequests: 'Access requests', accessRequestsHint: 'Pending requests and removed account history.', accessPendingHint: 'Only pending requests waiting for a response.', accessHistory: 'History', accessHistoryTitle: 'Access history', accessHistoryHint: 'Approved, rejected, and removed accounts stay here.', noAccessRequests: 'No requests registered.', noPendingAccessRequests: 'No pending requests.', noAccessHistory: 'No history registered.', approveAccess: 'Approve access', rejectAccess: 'Reject access', accessStatusPending: 'Pending', accessStatusApproved: 'Approved', accessStatusRejected: 'Rejected', accessStatusRemoved: 'Removed',
  language: 'Language and region', selectPortuguese: 'Select Brazilian Portuguese', selectEnglish: 'Select English (United States)', selectBritishEnglish: 'Select English (United Kingdom)', selectSpanish: 'Select Spanish with Euro pricing',
  currency_BRL: 'Brazilian Real', currency_USD: 'US Dollar', currency_GBP: 'British Pound', currency_EUR: 'Euro', pricesByRegion: 'Prices by currency', addAnotherCurrency: 'Add price in another currency', removeCurrency: 'Remove this currency', priceRegionHint: 'The site shows the price for the currency selected in the catalog.', autoTranslationHint: 'When saved, the name and description will be automatically translated into Portuguese, English and Spanish.', editLanguageHint: 'When saved, the current language will be used as the base to update Portuguese, English and Spanish.', autoTranslateProductName: 'Automatic name translation', manualTranslationHint: 'Automatic translation is off; this name will be used in all three languages.', syncNameAcrossLanguages: 'Use this name in all languages', syncNameAcrossLanguagesHint: 'When saved, this name will replace Portuguese, English and Spanish.', duplicateCurrency: 'Each currency can only be added once.', atLeastOnePrice: 'Add at least one valid price.',
  resizeSidebar: 'Resize sidebar', moveCategory: 'Move category', logout: 'Sign out', menu: 'Menu', backup: 'Backup', backupSnapshotTitle: 'Save current site state', backupSnapshotDescription: 'Generates a JSON file directly in the site with categories, products, images, prices, icons, users, roles and settings saved up to this moment.', backupPageDescription: 'Generate and import site JSON files. The spreadsheet displays the unique backup ID and creation time.', createBackupNow: 'Generate Backup', creatingBackup: 'Generating backup...', importBackup: 'Import Backup', importingBackup: 'Importing backup...', backupCreated: 'Backup generated and downloaded by the site.', backupInvalidFile: 'Invalid backup file.', backupImportError: 'Error importing backup.', downloadBackup: 'Download file', backupHistory: 'Registered backups', backupHistoryEmpty: 'No backups registered yet.', backupError: 'Error generating backup.', reorderCategories: 'Reordering categories...', movingProduct: 'Moving product...', saveChanges: 'Save Changes', discardChanges: 'Discard Changes', savingChanges: 'Saving changes...', changesSaved: 'Changes saved successfully.', pendingChanges: 'Pending changes', genericActionError: 'The action could not be completed.', genericDeleteError: 'The deletion could not be completed.',
  paginationLabel: 'Product pagination', paginationInfo: 'Showing {{from}}-{{to}} of {{total}} · Page {{page}} of {{pages}}', previousPage: 'Previous page', nextPage: 'Next page', pageNumber: 'Page {{page}}',
  apiNotConfiguredTitle: 'Apps Script is not configured', apiNotConfiguredDescription: 'Create a .env file in the project root and add the Apps Script deployment URL.', apiNotConfiguredCode: 'VITE_APPS_SCRIPT_API_URL=https://script.google.com/macros/s/YOUR_ID/exec', apiNotConfigured: 'Set VITE_APPS_SCRIPT_API_URL in the .env file.', requestTimeout: 'The server took too long to respond. Try again.', networkError: 'Could not connect to the server.', invalidResponse: 'Invalid response from Apps Script.', requestFailed: 'The request could not be completed.', syncError: 'Could not synchronize the catalog.', sessionExpired: 'Your session has expired. Sign in again.', ownerRequired: 'Only the Owner role can perform this action.', categoryNotFound: 'Category not found.', productNotFound: 'Product not found.', userNotFound: 'User not found.', invalidCurrency: 'Invalid currency.', imageRequired: 'Add at least one image.', invalidImageContent: 'One of the images has no valid content.', uploadFailed: 'Image upload failed.',
  pageNotFound: 'Page not found', pageNotFoundDescription: 'The page you are looking for does not exist or has been moved.', goHome: 'Go home', pageLoadError: 'This page could not be loaded', pageLoadErrorDescription: 'Something went wrong. Try again or go back home.', tryAgain: 'Try again',
};

const es: TranslationTable = {
  siteName: 'Productos Comerciales', siteDescription: 'Catálogo comercial de produtos.', appTitle: 'Sitio de Productos', access: 'Acceder', username: 'Usuario', password: 'Contraseña', continue: 'Continuar', enter: 'Entrar', backToUser: 'Volver al usuario', rememberAccess: 'Recordar acceso', userRequired: 'Introduce el usuario.', invalidCredentials: 'Credenciales no reconocidas.', showPassword: 'Mostrar contraseña', hidePassword: 'Ocultar contraseña', requestAccess: 'Solicitar acceso', requestAccessTitle: 'Solicitar acceso', requestAccessSubtitle: 'Completa tus datos. Un administrador revisará y definirá tu cargo.', displayName: 'Nombre visible', displayNamePlaceholder: 'Tu nombre', requestUsernamePlaceholder: 'sin_espacios', requestPasswordHint: 'Mínimo 8 caracteres', sendAccessRequest: 'Enviar solicitud', alreadyHaveAccount: '¿Ya tienes cuenta?', accessRequestSent: 'Solicitud enviada. Espera la aprobación del administrador.', fillAccessRequest: 'Completa nombre, usuario, contraseña y ciudad.', passwordMinLength: 'La contraseña debe tener al menos 8 caracteres.',
  categories: 'Categorías', products: 'Productos', product: 'Producto', users: 'Usuarios', category: 'Categoría', owner: 'Propietario', commercial: 'Comercial', loadingCatalog: 'Cargando catálogo...', noCategoryFound: 'No se encontraron categorías.', noCategoryCreated: 'No hay categorías creadas', ownerCreateFirst: 'El Propietario debe crear la primera categoría antes de añadir productos.', createFirstCategory: 'Crear primera categoría', availableOne: '1 producto disponible en esta categoría.', availableMany: '{{count}} productos disponibles en esta categoría.', searchProductIn: 'Buscar productos en {{category}}...', catalogBreadcrumb: 'Catálogo · {{category}}', clearSearch: 'Limpiar búsqueda', emptyCategory: 'No hay productos en esta categoría.', emptyCategoryOwnerHint: 'Arrastra un producto aqué o crea uno nuevo.', show: 'Mostrar', tenPerPage: '10 por página', allProducts: 'Todos los productos', sort: 'Ordenar', defaultOrder: 'Estándar', priceLowToHigh: 'Precio más bajo', priceHighToLow: 'Precio más alto', gridView: 'Cuadrícula', listView: 'Lista', showGridView: 'Mostrar en cuadrícula', showListView: 'Mostrar en lista', productFilters: 'Filtros de productos', standardizeDescriptions: 'Estandarizar descripciones', translateProducts: 'Traducir productos', translatingProducts: 'Traduciendo productos...', productsTranslated: 'Productos traducidos correctamente.', productsAlreadyTranslated: 'Productos ya sincronizados en este idioma.', updateMansionPhotos: 'Actualizar fotos', updatingMansionPhotos: 'Actualizando fotos...', mansionPhotosUpdated: 'Fotos de mansiones actualizadas correctamente.', mansionPhotosAlreadyUpdated: 'Las mansiones con foto conocida ya están actualizadas.',
  editCategory: 'Editar categoría', delete: 'Eliminar', deleteCategory: 'Eliminar categoría', deleteProduct: 'Eliminar producto', deleteUser: 'Eliminar usuario', deleteCategoryMessage: '¿Seguro que deseas eliminar la categoría "{{name}}"?', deleteProductMessage: '¿Seguro que deseas eliminar el producto "{{name}}"?', deleteUserMessage: '¿Seguro que deseas eliminar la cuenta de "{{name}}"?', deleteCategoryWarning: 'Todos los productos vinculados a esta categoría también se eliminarán. Esta acción no se puede deshacer.', irreversible: 'Esta acción no se puede deshacer.', categoryDeleted: 'Categoría eliminada correctamente.', productDeleted: 'Producto eliminado correctamente.', userDeleted: 'Usuario eliminado correctamente.',
  newCategory: 'Nueva categoría', newProduct: 'Nuevo producto', editProduct: 'Editar producto', productDetails: 'Detalles del producto', usersPermissions: 'Usuarios y permisos', configuration: 'Configuración', cancel: 'Cancelar', close: 'Cerrar', deleting: 'Eliminando...', saving: 'Guardando...', saveCategory: 'Guardar categoría', saveProduct: 'Guardar producto', sendSave: 'Subiendo y guardando...', processingImages: 'Procesando imágenes...',
  categoryTitle: 'Título de la categoría', categoryTitlePlaceholder: 'Ej.: Vehículos', globalIcon: 'Icono global', iconNameUsed: 'Nombre del icono utilizado en el sitio', searchIcon: 'Buscar icono', typeCategoryTitle: 'Introduce el título de la categoría.', categorySaveError: 'Error al guardar la categoría.', categorySaved: 'Categoría guardada correctamente.', select: 'Selecciona',
  productName: 'Nombre del producto', productNamePlaceholder: 'Ej.: VIP Oro', price: 'Precio', currency: 'Moneda', productImages: 'Imágenes del producto', uploadImages: 'Adjuntar imágenes', imageLimits: 'PNG, JPG o WEBP, hasta 10 MB', importByLink: 'Importar mediante enlace', add: 'Añadir', imageHelper: 'Las imágenes nuevas se optimizan antes de subirlas para mejorar la carga y visualización.', mainImage: 'Imagen principal', additionalImage: 'Imagen adicional', currentImage: 'Imagen actual', linkImage: 'Imagen mediante enlace', mainVideo: 'Video principal', additionalVideo: 'Video adicional', currentVideo: 'Video actual', linkVideo: 'Video mediante enlace', moveUp: 'Mover hacia arriba', moveDown: 'Mover hacia abajo', remove: 'Eliminar', productMaxImages: 'Cada producto puede tener como máximo 10 imágenes.', notImage: '{{name}} no es una imagen.', imageTooLarge: '{{name}} supera el límite de 10 MB.', importAttachmentError: 'Error al importar archivos adjuntos.', invalidLink: 'Introduce un enlace válido que empiece por http:// o https://.', createOrSelectCategory: 'Crea o selecciona una categoría.', typeProductName: 'Introduce el nombre del producto.', typeValidPrice: 'Introduce un precio válido.', addProductPhoto: 'Añade al menos una imagen del producto.', productSaveError: 'Error al guardar el producto.', productSaved: 'Producto guardado correctamente.', markAsSold: 'Vendido', sold: 'Vendido', soldOwner: 'Dueño', soldOwnerName: 'Nombre del dueño', soldOwnerNamePlaceholder: 'Ej.: Guillermo', soldOwnerDiscordId: 'Discord ID del dueño', soldOwnerRequired: 'Introduce el nombre del dueño para marcarlo como vendido.', productPermissionDenied: 'No tienes permiso para ejecutar esta acción en el producto.', productPermissions: 'Permisos de producto', productPermissionsHint: 'Elige exactamente qué acciones de producto puede realizar este usuario.', noImage: 'Sin imagen', moveProduct: 'Mover producto', readImageError: 'No se pudo leer {{name}}.', optimizeImageError: 'No se pudo optimizar {{name}}.', previousImage: 'Imagen anterior', nextImage: 'Imagen siguiente', imageThumbnail: 'Ver imagen {{index}}', editProductAction: 'Editar {{name}}', deleteProductAction: 'Eliminar {{name}}',
  city: 'Ciudad', addCity: 'Añadir ciudad', editCity: 'Editar ciudad', deleteCity: 'Eliminar ciudad', saveCity: 'Guardar ciudad', selectCity: 'Selecciona una ciudad', typeCityName: 'Introduce el nombre de la ciudad.', cityNamePlaceholder: 'Ej.: Los Angeles', citySaveError: 'Error al guardar la ciudad.', cityDeleted: 'Ciudad eliminada correctamente.', cityStats: '{{categories}} categorías · {{products}} productos', deleteCityMessage: '¿Seguro que deseas eliminar la ciudad "{{name}}"?', deleteCityWarning: 'No se pueden eliminar ciudades con categorías o productos vinculados.', ownerCreateFirstCity: 'El Propietario debe crear la primera ciudad antes de añadir categorías.', catalogCityBreadcrumb: 'Catálogo · {{city}} · {{category}}', cloneProduct: 'Clonar producto', cloneCategory: 'Clonar categoría', cloneProductAction: 'Clonar {{name}}', targetCity: 'Ciudad de destino', targetCategory: 'Categoría de destino', cloneProductHint: 'La copia se creará en la categoría seleccionada, preservando medios, precios y descripción.', cloneCategoryHint: 'La categoría y todos sus productos se copiarán a la ciudad seleccionada.', productCloned: 'Producto clonado correctamente.', categoryCloned: 'Categoría clonada correctamente.', description: 'Descripción', visualEditor: 'Editor visual', htmlCode: 'Código HTML', importHtml: 'Importar HTML', exportHtml: 'Exportar HTML', copyHtml: 'Copiar HTML', descriptionPreview: 'Vista previa de la descripción', emptyDescriptionPreview: 'Sin descripción.', bold: 'Negrita', italic: 'Cursiva', underline: 'Subrayado', heading: 'Título', textColor: 'Color del texto', alignLeft: 'Alinear a la izquierda', alignCenter: 'Centrar', alignRight: 'Alinear a la derecha', numberedList: 'Lista numerada', bulletList: 'Lista con viñetas', insertLink: 'Insertar enlace', insertImage: 'Insertar imagen', insertTable: 'Insertar tabla', clearFormatting: 'Limpiar formato', linkUrl: 'URL del enlace', imageUrl: 'URL de la imagen',
  exhibitorPermissions: 'Permisos del sitio', permissionsHint: 'El Propietario puede editar todo. Comercial solo puede visualizar.', newAccount: 'Nueva cuenta', loadingUsers: 'Cargando usuarios...', editAccount: 'Editar cuenta', name: 'Nombre', role: 'Cargo', activeAccount: 'Cuenta activa', saveAccount: 'Guardar cuenta', closeSettings: 'Cerrar configuración', fillNameUser: 'Completa el nombre y el usuario.', definePassword: 'Define una contraseña para la nueva cuenta.', saveUserError: 'Error al guardar el usuario.', userSaved: 'Usuario guardado correctamente.', deleteUserError: 'Error al eliminar el usuario.', leaveEmptyPassword: 'Déjalo vacío para mantener la contraseña actual', requiredPassword: 'Contraseña obligatoria', active: 'Activo', inactive: 'Inactivo', editUserAction: 'Editar usuario {{name}}', deleteUserAction: 'Eliminar usuario {{name}}', accessRequests: 'Solicitudes de acceso', accessRequestsHint: 'Solicitudes pendientes e historial de cuentas eliminadas.', accessPendingHint: 'Solo solicitudes pendientes esperando respuesta.', accessHistory: 'Historial', accessHistoryTitle: 'Historial de accesos', accessHistoryHint: 'Las cuentas aprobadas, rechazadas o eliminadas quedan aqué.', noAccessRequests: 'No hay solicitudes registradas.', noPendingAccessRequests: 'No hay solicitudes pendientes.', noAccessHistory: 'No hay historial registrado.', approveAccess: 'Aprobar acceso', rejectAccess: 'Rechazar acceso', accessStatusPending: 'Pendiente', accessStatusApproved: 'Aprobado', accessStatusRejected: 'Rechazado', accessStatusRemoved: 'Eliminado',
  language: 'Idioma', selectPortuguese: 'Seleccionar portugués', selectEnglish: 'Seleccionar inglés', selectBritishEnglish: 'Seleccionar inglés', selectSpanish: 'Seleccionar español',
  currency_BRL: 'Real', currency_USD: 'Dólar', currency_GBP: 'Libra', currency_EUR: 'Euro', pricesByRegion: 'Precios por moneda', addAnotherCurrency: 'Añadir precio en otra moneda', removeCurrency: 'Eliminar esta moneda', priceRegionHint: 'El sitio muestra el precio correspondiente a la moneda seleccionada en el catálogo.', autoTranslationHint: 'Al guardar, el nombre y la descripción se traducirán automáticamente al portugués, inglés y español.', editLanguageHint: 'Al guardar, el idioma actual se usará como base para actualizar portugués, inglés y español.', autoTranslateProductName: 'Traducción automática del nombre', manualTranslationHint: 'La traducción automática está desactivada; este nombre se usará en los tres idiomas.', syncNameAcrossLanguages: 'Usar este nombre en todos los idiomas', syncNameAcrossLanguagesHint: 'Al guardar, este nombre reemplazará portugués, inglés y español.', duplicateCurrency: 'Cada moneda solo se puede añadir una vez.', atLeastOnePrice: 'Añade al menos un precio válido.',
  resizeSidebar: 'Redimensionar menú lateral', moveCategory: 'Mover categoría', logout: 'Salir', menu: 'Menú', backup: 'Backup', backupSnapshotTitle: 'Guardar estado actual del sitio', backupSnapshotDescription: 'Genera un archivo JSON directamente en el sitio con categorías, productos, imágenes, precios, iconos, usuarios, cargos y configuraciones guardadas hasta este momento.', backupPageDescription: 'Genera e importa archivos JSON del sitio. La hoja muestra el ID único del backup y la hora de creacion.', createBackupNow: 'Generar Backup', creatingBackup: 'Generando backup...', importBackup: 'Importar Backup', importingBackup: 'Importando backup...', backupCreated: 'Backup generado y descargado por el sitio.', backupInvalidFile: 'Archivo de backup inválido.', backupImportError: 'Error al importar backup.', downloadBackup: 'Descargar archivo', backupHistory: 'Backups registrados', backupHistoryEmpty: 'No hay backups registrados todavia.', backupError: 'Error al generar backup.', reorderCategories: 'Reordenando categorías...', movingProduct: 'Moviendo producto...', saveChanges: 'Guardar Cambios', discardChanges: 'Descartar Cambios', savingChanges: 'Guardando cambios...', changesSaved: 'Cambios guardados correctamente.', pendingChanges: 'Cambios pendientes', genericActionError: 'No se pudo completar la acción.', genericDeleteError: 'No se pudo completar la eliminación.',
  paginationLabel: 'Paginación de productos', paginationInfo: 'Mostrando {{from}}-{{to}} de {{total}} · Página {{page}} de {{pages}}', previousPage: 'Página anterior', nextPage: 'Página siguiente', pageNumber: 'Página {{page}}',
  apiNotConfiguredTitle: 'Apps Script no está configurado', apiNotConfiguredDescription: 'Crea un archivo .env en la raíz del proyecto e introduce la URL de implementación de Apps Script.', apiNotConfiguredCode: 'VITE_APPS_SCRIPT_API_URL=https://script.google.com/macros/s/TU_ID/exec', apiNotConfigured: 'Configura VITE_APPS_SCRIPT_API_URL en el archivo .env.', requestTimeout: 'El servidor tardó demasiado en responder. Inténtalo de nuevo.', networkError: 'No se pudo conectar con el servidor.', invalidResponse: 'Respuesta no válida de Apps Script.', requestFailed: 'No se pudo completar la solicitud.', syncError: 'No se pudo sincronizar el catálogo.', sessionExpired: 'Tu sesión ha caducado. Inicia sesión de nuevo.', ownerRequired: 'Solo el cargo Propietario puede realizar esta acción.', categoryNotFound: 'Categoría no encontrada.', productNotFound: 'Producto no encontrado.', userNotFound: 'Usuario no encontrado.', invalidCurrency: 'Moneda no válida.', imageRequired: 'Añade al menos una imagen.', invalidImageContent: 'Una de las imágenes no tiene contenido válido.', uploadFailed: 'Error al subir la imagen.',
  pageNotFound: 'Página no encontrada', pageNotFoundDescription: 'La página que buscas no existe o se ha movido.', goHome: 'Ir al inicio', pageLoadError: 'No se pudo cargar esta página', pageLoadErrorDescription: 'Algo salió mal. Inténtalo de nuevo o vuelve al inicio.', tryAgain: 'Intentar de nuevo',
};

const translations: Record<Language, TranslationTable> = { pt, en, es };
const localeByLanguage: Record<Language, string> = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' };
const htmlLangByLanguage: Record<Language, string> = { pt: 'pt-BR', en: 'en', es: 'es' };

export type Translator = (key: TranslationKey, values?: Record<string, string | number>) => string;

interface LanguageContextValue {
  language: Language;
  locale: string;
  setLanguage: (language: Language) => void;
  t: Translator;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function getInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'pt';
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === 'pt' || saved === 'en' || saved === 'es') return saved;
  if (saved === 'us' || saved === 'gb') return 'en';
  if (saved === 'eu') return 'es';
  const browser = window.navigator.language.toLowerCase();
  if (browser.startsWith('en')) return 'en';
  if (browser.startsWith('es')) return 'es';
  return 'pt';
}

export function getStoredLanguage(): Language {
  return getInitialLanguage();
}

export function translateForLanguage(language: Language, key: TranslationKey, values?: Record<string, string | number>) {
  let text = translations[language][key] || translations.pt[key] || key;
  if (values) {
    for (const [name, value] of Object.entries(values)) {
      text = text.replaceAll(`{{${name}}}`, String(value));
    }
  }
  return text;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = htmlLangByLanguage[language];

    const currentTranslations = translations[language];
    document.title = currentTranslations.siteName;

    const updateMeta = (selector: string, content: string) => {
      const element = document.querySelector<HTMLMetaElement>(selector);
      if (element) element.content = content;
    };

    updateMeta('meta[name="description"]', currentTranslations.siteDescription);
    updateMeta('meta[property="og:title"]', currentTranslations.siteName);
    updateMeta('meta[property="og:description"]', currentTranslations.siteDescription);
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    locale: localeByLanguage[language],
    setLanguage: setLanguageState,
    t: (key, values) => translateForLanguage(language, key, values),
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useTranslation must be used inside LanguageProvider.');
  return context;
}

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage, t } = useTranslation();
  const labels: Array<{ value: Language; label: string; title: string }> = [
    { value: 'pt', label: 'PT', title: t('selectPortuguese') },
    { value: 'en', label: 'EN', title: t('selectEnglish') },
    { value: 'es', label: 'ES', title: t('selectSpanish') },
  ];

  return (
    <div className={`language-switcher${compact ? ' compact' : ''}`} role="group" aria-label={t('language')}>
      <span className="language-icon" aria-hidden="true"><Languages size={16} /></span>
      {labels.map((item) => (
        <button
          key={item.value}
          type="button"
          aria-pressed={language === item.value}
          aria-label={item.title}
          title={item.title}
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('sg-language-selected', { detail: item.value }));
            }
            setLanguage(item.value);
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}


const iconNames: Record<'pt' | 'en' | 'es', Record<string, string>> = {
  pt: {
    Store: 'Loja', ShoppingBag: 'Sacola de compras', ShoppingBasket: 'Cesta de compras', Package: 'Pacote',
    Boxes: 'Caixas', Box: 'Caixa', Tag: 'Etiqueta', Gift: 'Presente', Crown: 'Coroa', Star: 'Estrela',
    Sparkles: 'Brilhos', Gem: 'Joia', Diamond: 'Diamante', Medal: 'Medalha', Trophy: 'Troféu',
    BadgeDollarSign: 'Selo de dólar', CircleDollarSign: 'Dólar em círculo', HandCoins: 'Moedas na mão',
    Car: 'Carro', Bike: 'Bicicleta', Truck: 'Caminhão', Plane: 'Avião', Rocket: 'Foguete', Sword: 'Espada',
    Shield: 'Escudo', Flame: 'Chama', Gamepad2: 'Controle', Headphones: 'Fones de ouvido', Radio: 'Rádio',
    Smartphone: 'Celular', Laptop: 'Notebook', Watch: 'Relógio', Shirt: 'Camiseta', Palette: 'Paleta',
    House: 'Casa', KeyRound: 'Chave', UserRound: 'Usuário', BriefcaseBusiness: 'Maleta', Dumbbell: 'Haltere',
    Heart: 'Coração', Ticket: 'Ingresso', WandSparkles: 'Varinha mágica',
  },
  en: {
    Store: 'Store', ShoppingBag: 'Shopping bag', ShoppingBasket: 'Shopping basket', Package: 'Package',
    Boxes: 'Boxes', Box: 'Box', Tag: 'Tag', Gift: 'Gift', Crown: 'Crown', Star: 'Star', Sparkles: 'Sparkles',
    Gem: 'Gem', Diamond: 'Diamond', Medal: 'Medal', Trophy: 'Trophy', BadgeDollarSign: 'Dollar badge',
    CircleDollarSign: 'Dollar circle', HandCoins: 'Hand coins', Car: 'Car', Bike: 'Bike', Truck: 'Truck',
    Plane: 'Plane', Rocket: 'Rocket', Sword: 'Sword', Shield: 'Shield', Flame: 'Flame', Gamepad2: 'Game controller',
    Headphones: 'Headphones', Radio: 'Radio', Smartphone: 'Smartphone', Laptop: 'Laptop', Watch: 'Watch',
    Shirt: 'Shirt', Palette: 'Palette', House: 'House', KeyRound: 'Key', UserRound: 'User',
    BriefcaseBusiness: 'Briefcase', Dumbbell: 'Dumbbell', Heart: 'Heart', Ticket: 'Ticket', WandSparkles: 'Magic wand',
  },
  es: {
    Store: 'Tienda', ShoppingBag: 'Bolsa de compras', ShoppingBasket: 'Cesta de compras', Package: 'Paquete',
    Boxes: 'Cajas', Box: 'Caja', Tag: 'Etiqueta', Gift: 'Regalo', Crown: 'Corona', Star: 'Estrella',
    Sparkles: 'Destellos', Gem: 'Gema', Diamond: 'Diamante', Medal: 'Medalla', Trophy: 'Trofeo',
    BadgeDollarSign: 'Insignia de dólar', CircleDollarSign: 'Dólar en círculo', HandCoins: 'Monedas en mano',
    Car: 'Coche', Bike: 'Bicicleta', Truck: 'Camión', Plane: 'Avión', Rocket: 'Cohete', Sword: 'Espada',
    Shield: 'Escudo', Flame: 'Llama', Gamepad2: 'Mando', Headphones: 'Auriculares', Radio: 'Radio',
    Smartphone: 'Móvil', Laptop: 'Portátil', Watch: 'Reloj', Shirt: 'Camiseta', Palette: 'Paleta', House: 'Casa',
    KeyRound: 'Llave', UserRound: 'Usuario', BriefcaseBusiness: 'Maletín', Dumbbell: 'Mancuerna',
    Heart: 'Corazón', Ticket: 'Entrada', WandSparkles: 'Varita mágica',
  },
};

const extraIconNames: Record<'pt' | 'en' | 'es', Record<string, string>> = {
  pt: {
    ShoppingCart: 'Carrinho de compras', BadgePercent: 'Selo de desconto', Banknote: 'Cedula', CreditCard: 'Cartao',
    Bus: 'Onibus', TrainFront: 'Trem', Ship: 'Navio', Anchor: 'Ancora', Zap: 'Raio', Music: 'Musica',
    Mic: 'Microfone', Camera: 'Camera', Film: 'Filme', Monitor: 'Monitor', Printer: 'Impressora', Glasses: 'Oculos',
    Paintbrush: 'Pincel', Brush: 'Escova', Scissors: 'Tesoura', Building2: 'Predio', Landmark: 'Banco',
    Globe: 'Globo', MapPinned: 'Mapa', LockKeyhole: 'Cadeado', Baby: 'Bebe', Smile: 'Sorriso', BookOpen: 'Livro',
    LibraryBig: 'Biblioteca', NotebookPen: 'Caderno', GraduationCap: 'Formatura', Lightbulb: 'Lampada', Bot: 'Robo',
    HeartPulse: 'Saude', HandHeart: 'Cuidado', Handshake: 'Acordo', Pill: 'Remedio', Bell: 'Sino', Apple: 'Maca',
    Pizza: 'Pizza', Coffee: 'Cafe', CupSoda: 'Refrigerante', Utensils: 'Talheres', ChefHat: 'Chef', Cake: 'Bolo',
    CakeSlice: 'Fatia de bolo', Candy: 'Doce', Cookie: 'Biscoito', IceCreamCone: 'Sorvete', Popcorn: 'Pipoca',
    Beer: 'Cerveja', Wine: 'Taca de vinho', BottleWine: 'Garrafa de vinho', Fish: 'Peixe', Flower: 'Flor',
    Flower2: 'Flor aberta', Leaf: 'Folha', Sprout: 'Broto', Trees: 'Arvores', Sun: 'Sol', Moon: 'Lua',
    Cloud: 'Nuvem', Bed: 'Cama', Backpack: 'Mochila', Hammer: 'Martelo', Wrench: 'Chave inglesa', Drum: 'Tambor',
    PawPrint: 'Pata', Footprints: 'Pegadas',
  },
  en: {
    ShoppingCart: 'Shopping cart', BadgePercent: 'Discount badge', Banknote: 'Banknote', CreditCard: 'Credit card',
    Bus: 'Bus', TrainFront: 'Train', Ship: 'Ship', Anchor: 'Anchor', Zap: 'Lightning', Music: 'Music',
    Mic: 'Microphone', Camera: 'Camera', Film: 'Film', Monitor: 'Monitor', Printer: 'Printer', Glasses: 'Glasses',
    Paintbrush: 'Paintbrush', Brush: 'Brush', Scissors: 'Scissors', Building2: 'Building', Landmark: 'Landmark',
    Globe: 'Globe', MapPinned: 'Map pin', LockKeyhole: 'Lock', Baby: 'Baby', Smile: 'Smile', BookOpen: 'Book',
    LibraryBig: 'Library', NotebookPen: 'Notebook', GraduationCap: 'Graduation', Lightbulb: 'Lightbulb', Bot: 'Robot',
    HeartPulse: 'Health', HandHeart: 'Care', Handshake: 'Handshake', Pill: 'Pill', Bell: 'Bell', Apple: 'Apple',
    Pizza: 'Pizza', Coffee: 'Coffee', CupSoda: 'Soda cup', Utensils: 'Utensils', ChefHat: 'Chef hat', Cake: 'Cake',
    CakeSlice: 'Cake slice', Candy: 'Candy', Cookie: 'Cookie', IceCreamCone: 'Ice cream', Popcorn: 'Popcorn',
    Beer: 'Beer', Wine: 'Wine glass', BottleWine: 'Wine bottle', Fish: 'Fish', Flower: 'Flower',
    Flower2: 'Open flower', Leaf: 'Leaf', Sprout: 'Sprout', Trees: 'Trees', Sun: 'Sun', Moon: 'Moon',
    Cloud: 'Cloud', Bed: 'Bed', Backpack: 'Backpack', Hammer: 'Hammer', Wrench: 'Wrench', Drum: 'Drum',
    PawPrint: 'Paw print', Footprints: 'Footprints',
  },
  es: {
    ShoppingCart: 'Carrito de compras', BadgePercent: 'Insignia de descuento', Banknote: 'Billete', CreditCard: 'Tarjeta',
    Bus: 'Autobus', TrainFront: 'Tren', Ship: 'Barco', Anchor: 'Ancla', Zap: 'Rayo', Music: 'Musica',
    Mic: 'Microfono', Camera: 'Camara', Film: 'Pelicula', Monitor: 'Monitor', Printer: 'Impresora', Glasses: 'Gafas',
    Paintbrush: 'Pincel', Brush: 'Cepillo', Scissors: 'Tijeras', Building2: 'Edificio', Landmark: 'Banco',
    Globe: 'Globo', MapPinned: 'Mapa', LockKeyhole: 'Candado', Baby: 'Bebe', Smile: 'Sonrisa', BookOpen: 'Libro',
    LibraryBig: 'Biblioteca', NotebookPen: 'Cuaderno', GraduationCap: 'Graduacion', Lightbulb: 'Bombilla', Bot: 'Robot',
    HeartPulse: 'Salud', HandHeart: 'Cuidado', Handshake: 'Acuerdo', Pill: 'Pastilla', Bell: 'Campana', Apple: 'Manzana',
    Pizza: 'Pizza', Coffee: 'Cafe', CupSoda: 'Refresco', Utensils: 'Cubiertos', ChefHat: 'Chef', Cake: 'Pastel',
    CakeSlice: 'Porcion de pastel', Candy: 'Dulce', Cookie: 'Galleta', IceCreamCone: 'Helado', Popcorn: 'Palomitas',
    Beer: 'Cerveza', Wine: 'Copa de vino', BottleWine: 'Botella de vino', Fish: 'Pez', Flower: 'Flor',
    Flower2: 'Flor abierta', Leaf: 'Hoja', Sprout: 'Brote', Trees: 'Arboles', Sun: 'Sol', Moon: 'Luna',
    Cloud: 'Nube', Bed: 'Cama', Backpack: 'Mochila', Hammer: 'Martillo', Wrench: 'Llave inglesa', Drum: 'Tambor',
    PawPrint: 'Huella', Footprints: 'Pisadas',
  },
};

export function contentLanguageForInterface(language: Language): 'pt' | 'en' | 'es' {
  return language;
}

export function translateIconName(language: Language, iconName: string) {
  const interfaceLanguage = contentLanguageForInterface(language);
  return iconNames[interfaceLanguage][iconName] || extraIconNames[interfaceLanguage][iconName] || iconName;
}

const errorCodeToKey: Record<string, TranslationKey> = {
  API_NOT_CONFIGURED: 'apiNotConfigured',
  REQUEST_TIMEOUT: 'requestTimeout',
  NETWORK_ERROR: 'networkError',
  INVALID_RESPONSE: 'invalidResponse',
  REQUEST_FAILED: 'requestFailed',
  INVALID_CREDENTIALS: 'invalidCredentials',
  SESSION_EXPIRED: 'sessionExpired',
  OWNER_REQUIRED: 'ownerRequired',
  CATEGORY_NOT_FOUND: 'categoryNotFound',
  PRODUCT_NOT_FOUND: 'productNotFound',
  USER_NOT_FOUND: 'userNotFound',
  INVALID_CURRENCY: 'invalidCurrency',
  IMAGE_REQUIRED: 'imageRequired',
  INVALID_IMAGE_CONTENT: 'invalidImageContent',
  UPLOAD_FAILED: 'uploadFailed',
};

export function translateAppError(error: unknown, t: Translator, fallback: TranslationKey = 'requestFailed') {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
  return t(errorCodeToKey[code] || fallback);
}

export function formatLocalizedPrice(amount: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatLocalizedDate(value: string | number | Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}


