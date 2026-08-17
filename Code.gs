/**
 * SANTAGROUP â€” SITE DE PRODUTOS
 * Backend Google Apps Script + Google Sheets + ImgBB
 *
 * COMO USAR:
 * 1. Crie uma Planilha Google vazia.
 * 2. Abra ExtensÃµes > Apps Script.
 * 3. Cole este arquivo em Code.gs.
 * 4. Execute setupProject() uma vez e autorize.
 * 5. Implante como Aplicativo da Web:
 *    - Executar como: vocÃª
 *    - Quem pode acessar: qualquer pessoa
 * 6. Copie a URL /exec para VITE_APPS_SCRIPT_API_URL no frontend.
 */

var TABLES = {
  Users: [
    'id',
    'name',
    'username',
    'passwordHash',
    'passwordSalt',
    'role',
    'status',
    'permissions',
    'createdAt',
    'updatedAt',
    'allowedCityIds'
  ],

  SolicitacoesAcesso: [
    'id',
    'name',
    'username',
    'passwordHash',
    'passwordSalt',
    'cityName',
    'status',
    'approved',
    'createdAt',
    'updatedAt',
    'reviewedAt',
    'reviewedBy',
    'requestedCityNames',
    'approvedCityIds'
  ],

  Sessions: [
    'token',
    'userId',
    'expiresAt',
    'createdAt',
    'lastSeenAt'
  ],

  Cities: [
    'id',
    'name',
    'order',
    'createdAt',
    'updatedAt',
    'updatedBy'
  ],

  Categories: [
    'id',
    'cityId',
    'cityName',
    'title',
    'icon',
    'order',
    'createdAt',
    'updatedAt',
    'updatedBy',
    'titleBR',
    'titleEN',
    'titleES'
  ],

  Products: [
    'id',
    'categoryId',
    'cityName',
    'categoryName',
    'coordinates',
    'storageWeight',
    'importKey',
    'name',
    'order',
    'createdAt',
    'updatedAt',
    'updatedBy',
    'nameBR',
    'nameEN',
    'nameES',
    'amountBRL',
    'amountUSD',
    'amountGBP',
    'amountEUR',
    'descriptionHtml',
    'descriptionHtmlBR',
    'descriptionHtmlEN',
    'descriptionHtmlES',
    'sold',
    'soldOwnerName',
    'soldOwnerDiscordId'
  ],

  ProductImages: [
    'id',
    'productId',
    'url',
    'deleteUrl',
    'order',
    'createdAt',
    'mediaType',
    'videoProvider',
    'thumbnailUrl'
  ],

  DescriptionTemplates: [
    'id',
    'categoryId',
    'title',
    'order',
    'active',
    'htmlBR',
    'htmlEN',
    'htmlES',
    'createdAt',
    'updatedAt',
    'updatedBy'
  ],

  Meta: [
    'key',
    'value'
  ],

  Backup: [
    'id',
    'createdAt',
    'snapshot'
  ]
};

var ALLOWED_ROLES = [
  'OWNER',
  'COMERCIAL'
];

var ALLOWED_CURRENCIES = [
  'BRL',
  'USD',
  'GBP',
  'EUR'
];

var PRODUCT_PERMISSIONS = [
  'createProduct',
  'editProductCategory',
  'editProductName',
  'editProductPrice',
  'editProductDescription',
  'editProductMedia',
  'markProductSold',
  'viewSoldDiscordId',
  'cloneProduct',
  'cloneCategory',
  'deleteProduct',
  'moveProduct'
];

var SESSION_DAYS = 30;


/* =============================================================================
   CONFIGURAÃ‡ÃƒO INICIAL
============================================================================= */

function setupProject() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error(
      'Abra este Apps Script atravÃ©s de uma Planilha Google e execute novamente.'
    );
  }

  var properties = PropertiesService.getScriptProperties();

  properties.setProperties(
    {
      SPREADSHEET_ID: spreadsheet.getId(),
      IMGBB_API_KEY: 'fc7a049d22afc785b615ecde51392119',
      DEEPL_API_KEY: properties.getProperty('DEEPL_API_KEY') || '8653b464-0e31-4c24-a1eb-2ce549e12d8d:fx',
      CATALOG_REVISION: properties.getProperty('CATALOG_REVISION') || '1',
      AUTH_REVISION: properties.getProperty('AUTH_REVISION') || '1'
    },
    false
  );

  // A migraÃ§Ã£o precisa acontecer antes de ensureAllSheets_ para que os dados
  // antigos sejam lidos pelos nomes reais dos cabeÃ§alhos, sem deslocar colunas.
  migrateCatalogSchema_();
  ensureAllSheets_();
  seedOwner_();
  ensureProductTranslationTrigger_();

  writeMetaValue_('catalogRevision', getCatalogRevision_());
  writeMetaValue_('project', 'SantaGroup Site de Produtos');

  formatAllSheets();
  bumpCatalogRevision_();

  Logger.log(
    'ConfiguraÃ§Ã£o concluÃ­da. Login inicial: owner | Senha: SantaGroup@2026'
  );

  return {
    success: true,
    message: 'Projeto configurado e estrutura do catÃ¡logo atualizada.',
    initialLogin: 'owner',
    initialPassword: 'SantaGroup@2026'
  };
}

/**
 * Migração segura para projetos que já possuem a aba Users.
 * Execute uma vez depois de substituir o Code.gs e antes de publicar o deploy.
 *
 * A coluna allowedCityIds armazena um JSON com os IDs das cidades permitidas,
 * por exemplo: ["city-id-1","city-id-2"]. Célula vazia mantém compatibilidade
 * com contas antigas e concede acesso a todas as cidades.
 */
function setupUserCityAccessColumn() {
  var spreadsheet = getSpreadsheet_();
  var sheet = spreadsheet.getSheetByName('Users');

  if (!sheet) {
    throw new Error('A aba Users nao foi encontrada. Execute setupProject() primeiro.');
  }

  var column = TABLES.Users.indexOf('allowedCityIds') + 1;
  if (column <= 0) {
    throw new Error('A coluna allowedCityIds nao esta configurada em TABLES.Users.');
  }

  if (sheet.getMaxColumns() < column) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), column - sheet.getMaxColumns());
  }

  sheet.getRange(1, column).setValue('allowedCityIds');
  formatSheet_(sheet, TABLES.Users);
  bumpAuthRevision_();
  bumpCatalogRevision_();

  return {
    success: true,
    sheet: 'Users',
    column: 'allowedCityIds',
    columnNumber: column,
    message: 'Coluna de cidades por usuario configurada com sucesso.'
  };
}


/* =============================================================================
   API
============================================================================= */

function doGet() {
  try {
    var configured = Boolean(
      PropertiesService
        .getScriptProperties()
        .getProperty('SPREADSHEET_ID')
    );

    return json_({
      success: true,

      data: {
        service: 'SantaGroup Site de Produtos API',
        configured: configured,
        revision: configured
          ? getCatalogRevision_()
          : 0
      }
    });
  } catch (error) {
    return json_({
      success: false,
      message: errorMessage_(error)
    });
  }
}


function doPost(event) {
  try {
    assertConfigured_();

    var body = parseBody_(event);

    var action = String(
      body.action || ''
    ).trim();

    switch (action) {
      case 'login':
        return json_({
          success: true,
          data: login_(
            body.username,
            body.password
          )
        });

      case 'viewerLogin':
        return json_({
          success: true,
          data: viewerLogin_(body.cityName)
        });

      case 'validateSession':
        return json_({
          success: true,

          data: {
            user: publicUser_(
              requireSession_(body.token)
            )
          }
        });

      case 'logout':
        return json_({
          success: true,
          data: logout_(body.token)
        });

      case 'uploadImage':
        return json_({
          success: true,

          data: uploadProductImage_(
            body.token,
            body.image,
            body.productName
          )
        });

      case 'sync':
        return json_({
          success: true,

          data: sync_(
            body.token,
            body.sinceRevision,
            body.language
          )
        });

      case 'saveCity':
        return json_({
          success: true,
          data: saveCity_(
            body.token,
            body.city
          )
        });

      case 'deleteCity':
        return json_({
          success: true,
          data: deleteCity_(
            body.token,
            body.id
          )
        });

      case 'reorderCities':
        return json_({
          success: true,
          data: reorderCities_(
            body.token,
            body.cityIds
          )
        });

      case 'saveCategory':
        return json_({
          success: true,

          data: saveCategory_(
            body.token,
            body.category
          )
        });

      case 'deleteCategory':
        return json_({
          success: true,

          data: deleteCategory_(
            body.token,
            body.id
          )
        });

      case 'reorderCategories':
        return json_({
          success: true,

          data: reorderCategories_(
            body.token,
            body.categoryIds
          )
        });

      case 'saveProduct':
        return json_({
          success: true,

          data: saveProduct_(
            body.token,
            body.product
          )
        });

      case 'translateProductLanguage':
        return json_({
          success: true,

          data: translateProductLanguage_(
            body.token,
            body.productId,
            body.language
          )
        });

      case 'cloneProduct':
        return json_({
          success: true,
          data: cloneProduct_(
            body.token,
            body.productId,
            body.targetCategoryId
          )
        });

      case 'cloneCategory':
        return json_({
          success: true,
          data: cloneCategory_(
            body.token,
            body.categoryId,
            body.targetCityId
          )
        });

      case 'deleteProduct':
        return json_({
          success: true,

          data: deleteProduct_(
            body.token,
            body.id
          )
        });

      case 'reorderProducts':
        return json_({
          success: true,

          data: reorderProducts_(
            body.token,
            body.orders
          )
        });

      case 'saveDescriptionTemplate':
        return json_({
          success: true,
          data: saveDescriptionTemplate_(
            body.token,
            body.template
          )
        });

      case 'deleteDescriptionTemplate':
        return json_({
          success: true,
          data: deleteDescriptionTemplate_(
            body.token,
            body.id
          )
        });

      case 'listAccessCities':
        return json_({
          success: true,
          data: listAccessCities_()
        });

      case 'requestAccess':
        return json_({
          success: true,
          data: requestAccess_(
            body.request
          )
        });

      case 'listUsers':
        return json_({
          success: true,
          data: listUsers_(body.token)
        });

      case 'listAccessRequests':
        return json_({
          success: true,
          data: listAccessRequests_(
            body.token
          )
        });

      case 'approveAccessRequest':
        return json_({
          success: true,
          data: approveAccessRequest_(
            body.token,
            body.id,
            body.role,
            body.permissions,
            body.allowedCityIds
          )
        });

      case 'rejectAccessRequest':
        return json_({
          success: true,
          data: rejectAccessRequest_(
            body.token,
            body.id
          )
        });

      case 'saveUser':
        return json_({
          success: true,

          data: saveUser_(
            body.token,
            body.user
          )
        });

      case 'deleteUser':
        return json_({
          success: true,

          data: deleteUser_(
            body.token,
            body.id
          )
        });

      case 'createBackup':
        return json_({
          success: true,
          data: createBackup_(body.token)
        });

      case 'listBackups':
        return json_({
          success: true,
          data: listBackups_(body.token)
        });

      case 'importBackup':
        return json_({
          success: true,
          data: importBackup_(body.token, body.backup)
        });

      default:
        throw new Error(
          'AÃ§Ã£o invÃ¡lida ou nÃ£o informada.'
        );
    }
  } catch (error) {
    console.error(
      error && error.stack
        ? error.stack
        : error
    );

    return json_({
      success: false,
      message: errorMessage_(error)
    });
  }
}


/* =============================================================================
   AUTENTICAÃ‡ÃƒO E USUÃRIOS
============================================================================= */

function seedOwner_() {
  withLock_(function () {
    var users = readTable_('Users');

    if (users.length) {
      return;
    }

    var salt = Utilities.getUuid();
    var now = now_();

    users.push({
      id: Utilities.getUuid(),
      name: 'Owner',
      username: 'owner',

      passwordHash: hashPassword_(
        'SantaGroup@2026',
        salt
      ),

      passwordSalt: salt,
      role: 'OWNER',
      status: 'Ativo',
      permissions: permissionsCellValue_({}),
      createdAt: now,
      updatedAt: now,
      allowedCityIds: ''
    });

    writeTable_(
      'Users',
      users
    );
    writeUserPermissionsColumn_(users);

    bumpAuthRevision_();
  });
}


function login_(username, password) {
  username = String(
    username || ''
  )
    .trim()
    .toLowerCase();

  password = String(
    password || ''
  );

  if (!username || !password) {
    throw new Error(
      'Informe usuÃ¡rio e senha.'
    );
  }

  return withLock_(function () {
    var users = readTable_('Users');
    var user = null;

    for (var i = 0; i < users.length; i++) {
      if (
        String(
          users[i].username || ''
        )
          .trim()
          .toLowerCase() === username
      ) {
        user = users[i];
        break;
      }
    }

    if (
      !user ||
      user.status !== 'Ativo'
    ) {
      throw new Error(
        'Credenciais nÃ£o reconhecidas.'
      );
    }

    var expected = hashPassword_(
      password,
      user.passwordSalt
    );

    if (
      !constantTimeEqual_(
        expected,
        user.passwordHash
      )
    ) {
      throw new Error(
        'Credenciais nÃ£o reconhecidas.'
      );
    }

    var sessions = cleanExpiredSessions_(
      readTable_('Sessions')
    );

    var token = createToken_();
    var createdAt = now_();

    var expiresAt = new Date(
      Date.now() +
        SESSION_DAYS *
          24 *
          60 *
          60 *
          1000
    ).toISOString();

    sessions.push({
      token: token,
      userId: user.id,
      expiresAt: expiresAt,
      createdAt: createdAt,
      lastSeenAt: createdAt
    });

    writeTable_(
      'Sessions',
      sessions
    );

    cacheSession_(
      token,
      user
    );

    return {
      token: token,
      user: publicUser_(user)
    };
  });
}

function viewerUserForCity_(city) {
  return {
    id: 'viewer:' + String(city.id || ''),
    name: String(city.name || ''),
    username: 'visualizador',
    role: 'COMERCIAL',
    status: 'Ativo',
    permissions: { product: {} },
    allowedCityIds: [String(city.id || '')]
  };
}

function viewerUserFromToken_(token) {
  var prefix = 'viewer:';
  token = String(token || '').trim();
  if (token.indexOf(prefix) !== 0) return null;

  var cityId = token.substring(prefix.length);
  var cities = readTable_('Cities');
  for (var i = 0; i < cities.length; i++) {
    if (String(cities[i].id || '') === cityId) return viewerUserForCity_(cities[i]);
  }
  return null;
}

function viewerLogin_(cityName) {
  var requested = String(cityName || '').trim().toLowerCase();
  if (!requested) throw new Error('Selecione uma cidade para visualizar.');

  var cities = readTable_('Cities').sort(orderSorter_);
  for (var i = 0; i < cities.length; i++) {
    if (String(cities[i].name || '').trim().toLowerCase() === requested) {
      var user = viewerUserForCity_(cities[i]);
      return {
        token: 'viewer:' + String(cities[i].id || ''),
        user: publicUser_(user),
        catalog: readCatalog_(null, user)
      };
    }
  }

  throw new Error('A cidade selecionada não está mais disponível.');
}


function requireSession_(token) {
  token = String(
    token || ''
  ).trim();

  if (!token) {
    throw new Error(
      'SessÃ£o nÃ£o informada.'
    );
  }

  var viewerUser = viewerUserFromToken_(token);
  if (viewerUser) return viewerUser;

  var cache =
    CacheService.getScriptCache();

  var cacheKey =
    sessionCacheKey_(token);

  var cached =
    cache.get(cacheKey);

  if (cached) {
    var cachedUser =
      JSON.parse(cached);

    if (
      cachedUser.status === 'Ativo'
    ) {
      return cachedUser;
    }
  }

  var sessions =
    readTable_('Sessions');

  var session = null;

  for (
    var i = 0;
    i < sessions.length;
    i++
  ) {
    if (
      sessions[i].token === token
    ) {
      session = sessions[i];
      break;
    }
  }

  if (
    !session ||
    new Date(
      session.expiresAt
    ).getTime() <= Date.now()
  ) {
    throw new Error(
      'SessÃ£o expirada. Entre novamente.'
    );
  }

  var users =
    readTable_('Users');

  var user = null;

  for (
    var j = 0;
    j < users.length;
    j++
  ) {
    if (
      users[j].id ===
      session.userId
    ) {
      user = users[j];
      break;
    }
  }

  if (
    !user ||
    user.status !== 'Ativo'
  ) {
    throw new Error(
      'Conta desativada ou removida.'
    );
  }

  cacheSession_(
    token,
    user
  );

  return user;
}


function requireOwner_(token) {
  var user =
    requireSession_(token);

  if (
    user.role !== 'OWNER'
  ) {
    throw new Error(
      'Apenas o cargo Owner pode realizar esta aÃ§Ã£o.'
    );
  }

  return user;
}

function productPermissions_(permissions) {
  var source = permissions;
  if (typeof source === 'string') {
    try {
      source = source ? JSON.parse(source) : {};
    } catch (error) {
      source = {};
    }
  }

  source = source && typeof source === 'object' ? source : {};
  var product = source.product && typeof source.product === 'object'
    ? source.product
    : {};
  var accessRequests = source.accessRequests && typeof source.accessRequests === 'object'
    ? source.accessRequests
    : {};
  var normalized = {};

  PRODUCT_PERMISSIONS.forEach(function (permission) {
    normalized[permission] = product[permission] === true || source[permission] === true;
  });

  return {
    product: normalized,
    accessRequests: {
      manageAssignedCities: accessRequests.manageAssignedCities === true || source.manageAssignedCityRequests === true
    }
  };
}

function permissionsCellValue_(permissions) {
  return JSON.stringify(productPermissions_(permissions));
}

function stringList_(value) {
  var source = value;
  if (typeof source === 'string') {
    var text = source.trim();
    if (!text) return [];
    try {
      source = JSON.parse(text);
    } catch (error) {
      source = text.split(',');
    }
  }

  if (!Array.isArray(source)) return [];
  var seen = {};
  return source.map(function (item) {
    return String(item || '').trim();
  }).filter(function (item) {
    var key = item.toLowerCase();
    if (!item || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function allowedCityIdsCellValue_(ids) {
  return JSON.stringify(stringList_(ids));
}

function hasExplicitCityAccess_(user) {
  return user && user.allowedCityIds !== undefined && user.allowedCityIds !== null && String(user.allowedCityIds).trim() !== '';
}

function allCityIds_(cities) {
  return (cities || readTable_('Cities')).map(function (city) {
    return String(city.id || '').trim();
  }).filter(Boolean);
}

function allowedCityIdsForUser_(user, cities) {
  var allIds = allCityIds_(cities);
  if (!user || user.role === 'OWNER' || !hasExplicitCityAccess_(user)) return allIds;
  var valid = {};
  allIds.forEach(function (id) { valid[id] = true; });
  return stringList_(user.allowedCityIds).filter(function (id) { return valid[id]; });
}

function canAccessCity_(user, cityId, cities) {
  if (!user) return false;
  if (user.role === 'OWNER' || !hasExplicitCityAccess_(user)) return true;
  return allowedCityIdsForUser_(user, cities).indexOf(String(cityId || '')) !== -1;
}

function requireCityAccess_(user, cityId, cities) {
  if (!canAccessCity_(user, cityId, cities)) {
    throw new Error('Sua conta nao tem permissao para acessar esta cidade.');
  }
}

function canManageProduct_(user, permission) {
  if (!user) return false;
  if (user.role === 'OWNER') return true;

  var permissions = productPermissions_(user.permissions);
  return permissions.product[permission] === true;
}

function requireProductPermission_(token, permission) {
  var user = requireSession_(token);
  if (!canManageProduct_(user, permission)) {
    throw new Error('Sua conta nao tem permissao para esta acao de produto.');
  }

  return user;
}

function canManageAccessRequests_(user) {
  if (!user) return false;
  if (user.role === 'OWNER') return true;
  return productPermissions_(user.permissions).accessRequests.manageAssignedCities === true;
}

function requireAccessRequestManager_(token) {
  var user = requireSession_(token);
  if (!canManageAccessRequests_(user)) {
    throw new Error('Sua conta nao tem permissao para gerenciar solicitacoes de acesso.');
  }
  return user;
}

function requestedCityIdsForAccessRequest_(accessRequest, cities) {
  var names = stringList_(accessRequest && accessRequest.requestedCityNames);
  if (!names.length && accessRequest && accessRequest.cityName) names = [String(accessRequest.cityName)];
  return (cities || readTable_('Cities')).filter(function (city) {
    return names.some(function (name) {
      return String(name || '').trim().toLowerCase() === String(city.name || '').trim().toLowerCase();
    });
  }).map(function (city) { return String(city.id || '').trim(); }).filter(Boolean);
}

function accessRequestWithinUserScope_(user, accessRequest, cities) {
  if (user && user.role === 'OWNER') return true;
  var requestedIds = requestedCityIdsForAccessRequest_(accessRequest, cities);
  var allowedIds = allowedCityIdsForUser_(user, cities);
  return requestedIds.length > 0 && requestedIds.every(function (id) { return allowedIds.indexOf(id) !== -1; });
}

function publicAccessRequestsForUser_(user, requests, cities, users) {
  return (requests || []).filter(function (item) {
    return accessRequestWithinUserScope_(user, item, cities);
  }).map(function (item) {
    return publicAccessRequest_(item, users, cities);
  }).sort(sortAccessRequests_);
}


function logout_(token) {
  token = String(
    token || ''
  );

  if (!token) {
    return {
      loggedOut: true
    };
  }

  if (token.indexOf('viewer:') === 0) {
    return { loggedOut: true };
  }

  return withLock_(function () {
    var sessions =
      readTable_('Sessions')
        .filter(
          function (session) {
            return (
              session.token !== token
            );
          }
        );

    writeTable_(
      'Sessions',
      sessions
    );

    CacheService
      .getScriptCache()
      .remove(
        sessionCacheKey_(token)
      );

    return {
      loggedOut: true
    };
  });
}


function listUsers_(token) {
  requireOwner_(token);

  return {
    users: readTable_('Users')
      .map(publicUser_)
      .sort(sortUsers_)
  };
}


function listAccessCities_() {
  var cities = readTable_('Cities')
    .sort(orderSorter_)
    .map(function (city) {
      return String(
        city.name || ''
      ).trim();
    })
    .filter(Boolean);

  var seen = {};

  cities = cities.filter(
    function (name) {
      var key =
        name.toLowerCase();

      if (seen[key]) {
        return false;
      }

      seen[key] = true;
      return true;
    }
  );

  return {
    cities: cities
  };
}


function requestAccess_(input) {
  input = input || {};

  var name = String(
    input.name || ''
  ).trim();

  var username = String(
    input.username || ''
  ).trim();

  var password = String(
    input.password || ''
  );

  var cityName = String(
    input.cityName || ''
  ).trim();
  var requestedCityNames = stringList_(input.requestedCityNames);
  if (!requestedCityNames.length && cityName) requestedCityNames = [cityName];
  cityName = requestedCityNames[0] || cityName;

  if (!name) throw new Error('O nome de exibicao e obrigatorio.');
  if (!username) throw new Error('O nome de usuario e obrigatorio.');
  if (!password) throw new Error('A senha e obrigatoria.');
  if (!requestedCityNames.length) throw new Error('Selecione ao menos uma cidade.');

  if (password.length < 8) {
    throw new Error(
      'A senha precisa ter pelo menos 8 caracteres.'
    );
  }

  if (/\s/.test(username)) {
    throw new Error(
      'O usuario nao pode conter espacos.'
    );
  }

  return withLock_(function () {
    var validCityNames = listAccessCities_().cities;
    var validCityKeys = {};
    validCityNames.forEach(function (name) { validCityKeys[String(name).toLowerCase()] = true; });
    requestedCityNames.forEach(function (name) {
      if (!validCityKeys[String(name).toLowerCase()]) throw new Error('Selecione apenas cidades validas.');
    });
    var users =
      readTable_('Users');

    for (
      var i = 0;
      i < users.length;
      i++
    ) {
      if (
        String(users[i].username || '')
          .trim()
          .toLowerCase() ===
          username.toLowerCase() &&
        users[i].status !== 'Desativado'
      ) {
        throw new Error(
          'Este nome de usuario ja esta em uso.'
        );
      }
    }

    var requests =
      readTable_('SolicitacoesAcesso');

    var pendingIndex = -1;

    for (
      var j = 0;
      j < requests.length;
      j++
    ) {
      if (
        String(requests[j].username || '')
          .trim()
          .toLowerCase() ===
          username.toLowerCase() &&
        requests[j].status === 'PENDENTE'
      ) {
        pendingIndex = j;
        break;
      }
    }

    if (pendingIndex !== -1) {
      throw new Error('Ja existe uma solicitacao pendente para este usuario.');
    }

    var now = now_();
    var salt =
      Utilities.getUuid();

    var record = {
      id:
        pendingIndex === -1
          ? Utilities.getUuid()
          : requests[pendingIndex].id,
      name: name,
      username: username,
      passwordHash:
        hashPassword_(
          password,
          salt
        ),
      passwordSalt: salt,
      cityName: cityName,
      requestedCityNames: JSON.stringify(requestedCityNames),
      approvedCityIds: '[]',
      status: 'PENDENTE',
      approved: false,
      createdAt:
        pendingIndex === -1
          ? now
          : requests[pendingIndex].createdAt || now,
      updatedAt: now,
      reviewedAt: '',
      reviewedBy: ''
    };

    if (pendingIndex === -1) {
      requests.push(record);
    } else {
      requests[pendingIndex] = record;
    }

    writeTable_(
      'SolicitacoesAcesso',
      requests
    );

    return {
      request: publicAccessRequest_(record)
    };
  });
}


function listAccessRequests_(token) {
  var currentUser = requireAccessRequestManager_(token);
  var cities = readTable_('Cities');
  var users = readTable_('Users');

  return {
    requests: publicAccessRequestsForUser_(currentUser, readTable_('SolicitacoesAcesso'), cities, users)
  };
}


function approveAccessRequest_(token, id, role, permissions, allowedCityIds) {
  var currentUser =
    requireAccessRequestManager_(token);
  var owner = currentUser.role === 'OWNER';

  id = String(
    id || ''
  ).trim();

  if (!id) {
    throw new Error(
      'Solicitacao nao informada.'
    );
  }

  role = String(
    owner ? role || 'COMERCIAL' : 'COMERCIAL'
  ).toUpperCase();

  if (
    ALLOWED_ROLES.indexOf(role) === -1
  ) {
    throw new Error(
      'Cargo invalido.'
    );
  }

  var normalizedPermissions =
    productPermissions_(owner ? permissions : {});

  return withLock_(function () {
    var requests =
      readTable_('SolicitacoesAcesso');

    var requestIndex =
      findIndexById_(
        requests,
        id
      );

    if (requestIndex === -1) {
      throw new Error(
        'Solicitacao nao encontrada.'
      );
    }

    var accessRequest =
      requests[requestIndex];

    var cities = readTable_('Cities');
    if (!accessRequestWithinUserScope_(currentUser, accessRequest, cities)) {
      throw new Error('Esta solicitacao inclui uma cidade fora da sua permissao.');
    }
    var approvedCityIds = stringList_(allowedCityIds);
    if (!owner) approvedCityIds = requestedCityIdsForAccessRequest_(accessRequest, cities);
    if (!approvedCityIds.length) {
      var requestedNames = stringList_(accessRequest.requestedCityNames);
      if (!requestedNames.length && accessRequest.cityName) requestedNames = [String(accessRequest.cityName)];
      approvedCityIds = cities.filter(function (city) {
        return requestedNames.some(function (name) {
          return String(name).toLowerCase() === String(city.name || '').toLowerCase();
        });
      }).map(function (city) { return String(city.id); });
    }
    var validCityIds = allCityIds_(cities);
    approvedCityIds = approvedCityIds.filter(function (cityId) { return validCityIds.indexOf(cityId) !== -1; });
    if (role !== 'OWNER' && !approvedCityIds.length) throw new Error('Selecione ao menos uma cidade para aprovar a conta.');

    var users =
      readTable_('Users');

    var userIndex = -1;
    var username = String(
      accessRequest.username || ''
    ).trim();

    for (
      var i = 0;
      i < users.length;
      i++
    ) {
      if (
        String(users[i].username || '')
          .trim()
          .toLowerCase() ===
        username.toLowerCase()
      ) {
        userIndex = i;
        break;
      }
    }

    var passwordHash =
      accessRequest.passwordHash ||
      (
        userIndex === -1
          ? ''
          : users[userIndex].passwordHash
      );

    var passwordSalt =
      accessRequest.passwordSalt ||
      (
        userIndex === -1
          ? ''
          : users[userIndex].passwordSalt
      );

    if (
      !passwordHash ||
      !passwordSalt
    ) {
      throw new Error(
        'Solicitacao sem senha valida.'
      );
    }

    var now = now_();

    var userRecord = {
      id:
        userIndex === -1
          ? Utilities.getUuid()
          : users[userIndex].id,
      name: String(
        accessRequest.name || ''
      ).trim(),
      username: username,
      passwordHash:
        passwordHash,
      passwordSalt:
        passwordSalt,
      role: role,
      status: 'Ativo',
      permissions:
        permissionsCellValue_(
          normalizedPermissions
        ),
      allowedCityIds: allowedCityIdsCellValue_(approvedCityIds),
      createdAt:
        userIndex === -1
          ? now
          : users[userIndex].createdAt || now,
      updatedAt: now
    };

    if (userIndex === -1) {
      users.push(userRecord);
    } else {
      users[userIndex] =
        userRecord;
    }

    accessRequest.status =
      'APROVADO';
    accessRequest.approved =
      true;
    accessRequest.passwordHash =
      passwordHash;
    accessRequest.passwordSalt =
      passwordSalt;
    accessRequest.updatedAt =
      now;
    accessRequest.reviewedAt =
      now;
    accessRequest.reviewedBy =
      currentUser.username ||
      currentUser.name ||
      currentUser.id;
    accessRequest.approvedCityIds =
      allowedCityIdsCellValue_(approvedCityIds);

    requests[requestIndex] =
      accessRequest;

    ensureActiveOwner_(users);

    writeTable_(
      'Users',
      users
    );
    writeUserPermissionsColumn_(users);

    writeTable_(
      'SolicitacoesAcesso',
      requests
    );

    bumpAuthRevision_();
    bumpCatalogRevision_();

    return {
      users: owner ? users.map(publicUser_).sort(sortUsers_) : [],
      requests: publicAccessRequestsForUser_(currentUser, requests, cities, users)
    };
  });
}


function rejectAccessRequest_(token, id) {
  var currentUser =
    requireAccessRequestManager_(token);

  id = String(
    id || ''
  ).trim();

  if (!id) {
    throw new Error(
      'Solicitacao nao informada.'
    );
  }

  return withLock_(function () {
    var requests =
      readTable_('SolicitacoesAcesso');

    var index =
      findIndexById_(
        requests,
        id
      );

    if (index === -1) {
      throw new Error(
        'Solicitacao nao encontrada.'
      );
    }

    var cities = readTable_('Cities');
    if (!accessRequestWithinUserScope_(currentUser, requests[index], cities)) {
      throw new Error('Esta solicitacao inclui uma cidade fora da sua permissao.');
    }

    var now = now_();

    requests[index].status =
      'REPROVADO';
    requests[index].approved =
      false;
    requests[index].updatedAt =
      now;
    requests[index].reviewedAt =
      now;
    requests[index].reviewedBy =
      currentUser.username ||
      currentUser.name ||
      currentUser.id;

    writeTable_(
      'SolicitacoesAcesso',
      requests
    );

    return {
      requests: publicAccessRequestsForUser_(currentUser, requests, cities, readTable_('Users'))
    };
  });
}


function saveUser_(token, input) {
  var currentUser =
    requireOwner_(token);

  input = input || {};

  return withLock_(function () {
    var users =
      readTable_('Users');

    var id = String(
      input.id || ''
    ).trim();

    var name = String(
      input.name || ''
    ).trim();

    var username = String(
      input.username || ''
    ).trim();

    var password = String(
      input.password || ''
    );

    var role = String(
      input.role ||
      'COMERCIAL'
    ).toUpperCase();

    var status =
      input.active === false
        ? 'Desativado'
        : 'Ativo';
    var permissions =
      productPermissions_(input.permissions);
    var cityAccessProvided = input.allowedCityIds !== undefined && input.allowedCityIds !== null;
    var allowedCityIds = stringList_(input.allowedCityIds);
    var validCityIds = allCityIds_();
    allowedCityIds = allowedCityIds.filter(function (cityId) { return validCityIds.indexOf(cityId) !== -1; });

    if (!name || !username) {
      throw new Error(
        'Nome e usuÃ¡rio sÃ£o obrigatÃ³rios.'
      );
    }

    if (
      ALLOWED_ROLES.indexOf(
        role
      ) === -1
    ) {
      throw new Error(
        'Cargo invÃ¡lido.'
      );
    }

    for (
      var i = 0;
      i < users.length;
      i++
    ) {
      if (
        String(
          users[i].username
        ).toLowerCase() ===
          username.toLowerCase() &&
        users[i].id !== id
      ) {
        throw new Error(
          'Este nome de usuÃ¡rio jÃ¡ estÃ¡ em uso.'
        );
      }
    }

    var now = now_();

    var index =
      findIndexById_(
        users,
        id
      );

    if (role !== 'OWNER' && (index === -1 || cityAccessProvided) && !allowedCityIds.length) {
      throw new Error('Selecione ao menos uma cidade para a conta.');
    }

    if (index === -1) {
      if (!password) {
        throw new Error(
          'Defina uma senha para a nova conta.'
        );
      }

      var salt =
        Utilities.getUuid();

      users.push({
        id: Utilities.getUuid(),
        name: name,
        username: username,

        passwordHash:
          hashPassword_(
            password,
            salt
          ),

        passwordSalt: salt,
        role: role,
        status: status,
        permissions: permissionsCellValue_(permissions),
        createdAt: now,
        updatedAt: now,
        allowedCityIds: allowedCityIdsCellValue_(allowedCityIds)
      });
    } else {
      var existing =
        users[index];

      existing.name =
        name;

      existing.username =
        username;

      existing.role =
        role;

      existing.status =
        status;

      existing.permissions =
        permissionsCellValue_(permissions);

      if (cityAccessProvided) {
        existing.allowedCityIds = allowedCityIdsCellValue_(allowedCityIds);
      }

      existing.updatedAt =
        now;

      if (password) {
        existing.passwordSalt =
          Utilities.getUuid();

        existing.passwordHash =
          hashPassword_(
            password,
            existing.passwordSalt
          );
      }

      users[index] =
        existing;
    }

    ensureActiveOwner_(users);

    writeTable_(
      'Users',
      users
    );
    writeUserPermissionsColumn_(users);

    bumpAuthRevision_();
    bumpCatalogRevision_();

    var activeIds = {};

    users.forEach(
      function (user) {
        if (
          user.status === 'Ativo'
        ) {
          activeIds[user.id] =
            true;
        }
      }
    );

    writeTable_(
      'Sessions',

      readTable_('Sessions')
        .filter(
          function (session) {
            return Boolean(
              activeIds[
                session.userId
              ]
            );
          }
        )
    );

    return {
      users: users
        .map(publicUser_)
        .sort(sortUsers_)
    };
  });
}


function deleteUser_(token, id) {
  var currentUser =
    requireOwner_(token);

  id = String(
    id || ''
  );

  if (!id) {
    throw new Error(
      'UsuÃ¡rio nÃ£o informado.'
    );
  }

  if (
    id === currentUser.id
  ) {
    throw new Error(
      'VocÃª nÃ£o pode excluir a prÃ³pria conta.'
    );
  }

  return withLock_(function () {
    var users =
      readTable_('Users');

    var deletedIndex =
      findIndexById_(
        users,
        id
      );

    if (deletedIndex === -1) {
      throw new Error(
        'UsuÃ¡rio nÃ£o encontrado.'
      );
    }

    var deletedUser =
      users[deletedIndex];

    users = users.filter(
      function (user) {
        return user.id !== id;
      }
    );

    ensureActiveOwner_(users);

    writeTable_(
      'Users',
      users
    );

    writeTable_(
      'Sessions',

      readTable_('Sessions')
        .filter(
          function (session) {
            return (
              session.userId !== id
            );
          }
        )
    );

    markAccessRequestRemoved_(
      deletedUser,
      currentUser
    );

    bumpAuthRevision_();

    return {
      users: users
        .map(publicUser_)
        .sort(sortUsers_)
    };
  });
}


function ensureActiveOwner_(users) {
  var activeOwners =
    users.filter(
      function (user) {
        return (
          user.role === 'OWNER' &&
          user.status === 'Ativo'
        );
      }
    );

  if (!activeOwners.length) {
    throw new Error(
      'Ã‰ obrigatÃ³rio manter pelo menos um Owner ativo.'
    );
  }
}


function publicUser_(user) {
  var result = {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    permissions: productPermissions_(user.permissions),
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
  if (hasExplicitCityAccess_(user)) result.allowedCityIds = stringList_(user.allowedCityIds);
  return result;
}


function sortUsers_(a, b) {
  if (
    a.role !== b.role
  ) {
    return (
      a.role === 'OWNER'
        ? -1
        : 1
    );
  }

  return String(
    a.name
  ).localeCompare(
    String(b.name)
  );
}


function markAccessRequestRemoved_(user, currentUser) {
  if (
    !user ||
    !user.username
  ) {
    return;
  }

  var requests =
    readTable_('SolicitacoesAcesso');

  var username =
    String(user.username || '')
      .trim()
      .toLowerCase();

  var targetIndex =
    -1;

  for (
    var i = requests.length - 1;
    i >= 0;
    i--
  ) {
    if (
      String(requests[i].username || '')
        .trim()
        .toLowerCase() === username
    ) {
      targetIndex = i;
      break;
    }
  }

  var now =
    now_();

  var reviewedBy =
    currentUser.username ||
    currentUser.name ||
    currentUser.id;

  if (targetIndex === -1) {
    requests.push({
      id: Utilities.getUuid(),
      name: user.name || '',
      username: user.username || '',
      passwordHash: '',
      passwordSalt: '',
      cityName: '',
      requestedCityNames: '[]',
      approvedCityIds: allowedCityIdsCellValue_(allowedCityIdsForUser_(user)),
      status: 'REMOVIDO',
      approved: false,
      createdAt: user.createdAt || now,
      updatedAt: now,
      reviewedAt: now,
      reviewedBy: reviewedBy
    });
  } else {
    if (!stringList_(requests[targetIndex].approvedCityIds).length) {
      requests[targetIndex].approvedCityIds = allowedCityIdsCellValue_(allowedCityIdsForUser_(user));
    }
    requests[targetIndex].status =
      'REMOVIDO';
    requests[targetIndex].approved =
      false;
    requests[targetIndex].updatedAt =
      now;
    requests[targetIndex].reviewedAt =
      now;
    requests[targetIndex].reviewedBy =
      reviewedBy;
  }

  writeTable_(
    'SolicitacoesAcesso',
    requests
  );
}


function approvedCityIdsForAccessRequest_(accessRequest, users, cities) {
  var stored = stringList_(accessRequest.approvedCityIds);
  if (stored.length) return stored;
  var username = String(accessRequest.username || '').trim().toLowerCase();
  if (!username || !users) return [];
  for (var i = 0; i < users.length; i++) {
    if (String(users[i].username || '').trim().toLowerCase() === username) {
      return allowedCityIdsForUser_(users[i], cities);
    }
  }
  return [];
}

function publicAccessRequest_(accessRequest, users, cities) {
  var requestedCityNames = stringList_(accessRequest.requestedCityNames);
  if (!requestedCityNames.length && accessRequest.cityName) requestedCityNames = [String(accessRequest.cityName)];
  return {
    id: accessRequest.id,
    name: accessRequest.name,
    username: accessRequest.username,
    cityName: accessRequest.cityName,
    requestedCityNames: requestedCityNames,
    approvedCityIds: approvedCityIdsForAccessRequest_(accessRequest, users, cities),
    status: String(
      accessRequest.status ||
      'PENDENTE'
    ),
    approved:
      accessRequest.approved === true ||
      String(
        accessRequest.approved || ''
      ).toUpperCase() === 'TRUE',
    createdAt: accessRequest.createdAt || '',
    updatedAt: accessRequest.updatedAt || '',
    reviewedAt: accessRequest.reviewedAt || '',
    reviewedBy: accessRequest.reviewedBy || ''
  };
}


function sortAccessRequests_(a, b) {
  var aTime =
    new Date(
      a.updatedAt ||
      a.createdAt ||
      0
    ).getTime() || 0;

  var bTime =
    new Date(
      b.updatedAt ||
      b.createdAt ||
      0
    ).getTime() || 0;

  return bTime - aTime;
}


function writeUserPermissionsColumn_(users) {
  var sheet =
    getSpreadsheet_()
      .getSheetByName('Users');

  if (!sheet) {
    return;
  }

  var permissionColumn =
    TABLES.Users.indexOf('permissions') + 1;

  if (permissionColumn <= 0) {
    return;
  }

  if (sheet.getMaxColumns() < permissionColumn) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      permissionColumn - sheet.getMaxColumns()
    );
  }

  sheet
    .getRange(1, permissionColumn)
    .setValue('permissions');

  var clearRows =
    Math.max(
      sheet.getLastRow() - 1,
      0
    );

  if (clearRows > 0) {
    sheet
      .getRange(
        2,
        permissionColumn,
        clearRows,
        1
      )
      .clearContent();
  }

  if (!users || !users.length) {
    return;
  }

  sheet
    .getRange(
      2,
      permissionColumn,
      users.length,
      1
    )
    .setValues(
      users.map(function (user) {
        return [
          permissionsCellValue_(
            user.permissions
          )
        ];
      })
    );
}


/* =============================================================================
   CATÃLOGO E SINCRONIZAÃ‡ÃƒO
============================================================================= */

function createBackup_(token) {
  var user = requireOwner_(token);

  return withLock_(function () {
    ensureAllSheets_();

    var now = now_();
    var id = Utilities.getUuid();
    var snapshot = buildBackupSnapshot_(user, now);
    var categories = snapshot.tables.Categories;
    var products = snapshot.tables.Products;
    var descriptionTemplates = snapshot.tables.DescriptionTemplates;
    var users = snapshot.tables.Users;

    var fileName = backupFileName_(now, id);
    var backups = readTable_('Backup');
    backups.push({
      id: id,
      createdAt: now,
      snapshot: JSON.stringify(snapshot)
    });

    writeTable_('Backup', backups);

    return {
      backup: {
        id: id,
        createdAt: now,
        categoriesCount: categories.length,
        productsCount: products.length,
        usersCount: users.length,
        fileName: fileName,
        snapshot: snapshot
      }
    };
  });
}


function listBackups_(token) {
  var user = requireOwner_(token);
  ensureAllSheets_();

  return {
    backups: readTable_('Backup')
      .map(function (backup) {
        var createdAt = String(backup.createdAt || '');
        var id = String(backup.id || '');
        var snapshot = parseStoredBackupSnapshot_(backup.snapshot);

        if (!snapshot && id && createdAt) {
          snapshot = buildBackupSnapshot_(user, createdAt);
        }

        return {
          id: id,
          createdAt: createdAt,
          fileName: id && createdAt
            ? backupFileName_(createdAt, id)
            : '',
          snapshot: snapshot
        };
      })
      .filter(function (backup) {
        return backup.id && backup.createdAt;
      })
      .sort(function (a, b) {
        return String(b.createdAt).localeCompare(String(a.createdAt));
      })
  };
}


function buildBackupSnapshot_(user, createdAt) {
  var cities = readTable_('Cities');
  var categories = readTable_('Categories');
  var products = readProducts_();
  var productImages = readTable_('ProductImages');
  var users = readTable_('Users');
  var meta = readTable_('Meta');

  return {
    version: 1,
    createdAt: createdAt,
    createdBy: publicUser_(user),
    tables: {
      Cities: cities,
      Categories: categories,
      Products: products,
      DescriptionTemplates: descriptionTemplates,
      ProductImages: productImages,
      Users: users,
      Meta: meta
    },
    catalog: readCatalog_()
  };
}


function parseStoredBackupSnapshot_(snapshot) {
  if (!snapshot) {
    return null;
  }

  if (typeof snapshot === 'object') {
    return snapshot;
  }

  try {
    return JSON.parse(String(snapshot));
  } catch (error) {
    return null;
  }
}


function importBackup_(token, input) {
  var user = requireOwner_(token);
  var snapshot = normalizeBackupSnapshot_(input);

  return withLock_(function () {
    ensureAllSheets_();

    var tables = snapshot.tables || {};
    var cities = backupRowsForTable_(tables.Cities || (snapshot.catalog && snapshot.catalog.cities), 'Cities');
    var categories = backupRowsForTable_(tables.Categories, 'Categories');
    var products = backupRowsForTable_(tables.Products || (snapshot.catalog && snapshot.catalog.products), 'Products');
    var descriptionTemplates = backupRowsForTable_(tables.DescriptionTemplates || (snapshot.catalog && snapshot.catalog.descriptionTemplates), 'DescriptionTemplates');
    var productImages = backupRowsForTable_(tables.ProductImages, 'ProductImages');
    var users = backupRowsForTable_(tables.Users, 'Users');
    var meta = backupRowsForTable_(tables.Meta, 'Meta');

    var defaultCityId = ensureDefaultCity_(cities);
    categories.forEach(function (category) {
      if (!category.cityId) category.cityId = defaultCityId;
    });
    fillCatalogLinkNames_(cities, categories, products);

    ensureActiveOwner_(users);

    writeTable_('Cities', cities);
    writeTable_('Categories', categories);
    writeProducts_(products);
    writeDescriptionTemplates_(descriptionTemplates);
    writeTable_('ProductImages', productImages);
    writeTable_('Users', users);
    writeTable_('Meta', meta);
    bumpCatalogRevision_();

    return {
      imported: true,
      importedAt: now_(),
      importedBy: user.id,
      categoriesCount: categories.length,
      productsCount: products.length,
      usersCount: users.length,
      catalog: readCatalog_()
    };
  });
}


function backupFileName_(createdAt, id) {
  var safeDate = String(createdAt || now_())
    .replace(/[^0-9A-Za-z]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return 'santagroup-backup-' + safeDate + '-' + String(id).slice(0, 8) + '.json';
}


function normalizeBackupSnapshot_(input) {
  var value = input;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch (error) {
      throw new Error('Arquivo de backup invalido.');
    }
  }

  if (!value || typeof value !== 'object' || !value.tables || typeof value.tables !== 'object') {
    throw new Error('Arquivo de backup invalido.');
  }

  return value;
}


function backupRowsForTable_(rows, tableName) {
  if (!Array.isArray(rows)) {
    return [];
  }

  var headers = TABLES[tableName] || [];
  return rows.map(function (row) {
    row = row || {};
    var next = {};
    headers.forEach(function (header) {
      next[header] = row[header] === undefined || row[header] === null ? '' : row[header];
    });
    if (tableName === 'Products') {
      var descriptions = localizedDescriptionValues_({
        descriptionHtml: next.descriptionHtml || row.description || '',
        descriptionHtmlBR: next.descriptionHtmlBR,
        descriptionHtmlEN: next.descriptionHtmlEN,
        descriptionHtmlES: next.descriptionHtmlES
      });
      next.descriptionHtml = descriptions.pt;
      next.descriptionHtmlBR = descriptions.pt;
      next.descriptionHtmlEN = descriptions.en;
      next.descriptionHtmlES = descriptions.es;
    }
    return next;
  });
}


function sync_(
  token,
  sinceRevision,
  language
) {
  var user = requireSession_(token);

  var revision =
    getCatalogRevision_();

  if (
    Number(
      sinceRevision
    ) === revision
  ) {
    return {
      changed: false,
      revision: revision
    };
  }

  return {
    changed: true,
    revision: revision,
    catalog: readCatalog_(language, user)
  };
}

function defaultCityName_() {
  return 'SantaGroup';
}

function ensureDefaultCity_(cities) {
  if (cities.length) return cities[0].id;

  var now = now_();
  var city = {
    id: Utilities.getUuid(),
    name: defaultCityName_(),
    order: 0,
    createdAt: now,
    updatedAt: now,
    updatedBy: ''
  };
  cities.push(city);
  return city.id;
}

function cityNameById_(cities) {
  var map = {};
  (cities || []).forEach(function (city) {
    map[String(city.id || '')] = String(city.name || '');
  });
  return map;
}

function categoryById_(categories) {
  var map = {};
  (categories || []).forEach(function (category) {
    map[String(category.id || '')] = category;
  });
  return map;
}

function fillCatalogLinkNames_(cities, categories, products) {
  var citiesById = cityNameById_(cities);

  (categories || []).forEach(function (category) {
    category.cityName = citiesById[String(category.cityId || '')] || '';
  });

  var categoriesById = categoryById_(categories);

  (products || []).forEach(function (product) {
    var category = categoriesById[String(product.categoryId || '')];
    product.categoryName = category ? String(category.titleBR || category.title || '') : '';
    product.cityName = category ? String(category.cityName || '') : '';
  });
}

function saveCity_(token, input) {
  var user = requireOwner_(token);
  input = input || {};

  return withLock_(function () {
    var cities = readTable_('Cities');
    var id = String(input.id || '').trim();
    var name = cleanCatalogText_(input.name);

    if (!name) throw new Error('O nome da cidade e obrigatorio.');

    var now = now_();
    var index = findIndexById_(cities, id);

    if (index === -1) {
      cities.push({
        id: Utilities.getUuid(),
        name: name,
        order: cities.length,
        createdAt: now,
        updatedAt: now,
        updatedBy: user.id
      });
    } else {
      cities[index].name = name;
      cities[index].updatedAt = now;
      cities[index].updatedBy = user.id;
    }

    normalizeOrders_(cities);
    var categories = readTable_('Categories');
    var products = readProducts_();
    fillCatalogLinkNames_(cities, categories, products);
    writeTable_('Cities', cities);
    writeTable_('Categories', categories);
    writeProducts_(products);
    bumpCatalogRevision_();

    return { catalog: readCatalog_() };
  });
}

function deleteCity_(token, id) {
  requireOwner_(token);
  id = String(id || '').trim();

  return withLock_(function () {
    var cities = readTable_('Cities');
    var index = findIndexById_(cities, id);
    if (index === -1) throw new Error('Cidade nao encontrada.');

    var categories = readTable_('Categories');
    var hasCategories = categories.some(function (category) {
      return String(category.cityId || '') === id;
    });

    if (hasCategories) {
      throw new Error('Nao e possivel excluir uma cidade que ainda possui categorias ou produtos.');
    }

    cities.splice(index, 1);
    normalizeOrders_(cities);
    var products = readProducts_();
    fillCatalogLinkNames_(cities, categories, products);
    writeTable_('Cities', cities);
    writeTable_('Categories', categories);
    writeProducts_(products);
    bumpCatalogRevision_();

    return { catalog: readCatalog_() };
  });
}

function reorderCities_(token, cityIds) {
  requireOwner_(token);
  cityIds = Array.isArray(cityIds) ? cityIds.map(String) : [];

  return withLock_(function () {
    var cities = readTable_('Cities');
    var citiesById = {};
    var ordered = [];

    cities.forEach(function (city) {
      citiesById[String(city.id)] = city;
    });

    cityIds.forEach(function (id) {
      var city = citiesById[id];
      if (!city) return;
      ordered.push(city);
      delete citiesById[id];
    });

    cities.forEach(function (city) {
      var id = String(city.id);
      if (citiesById[id]) ordered.push(city);
    });

    assignOrdersInCurrentSequence_(ordered);
    writeTable_('Cities', ordered);
    bumpCatalogRevision_();

    return { catalog: readCatalog_() };
  });
}


function saveCategory_(token, input) {
  var user = requireOwner_(token);
  input = input || {};

  return withLock_(function () {
    var cities = readTable_('Cities');
    var categories = readTable_('Categories');
    var id = String(input.id || '').trim();
    var cityId = String(input.cityId || '').trim();
    var title = cleanCatalogText_(input.title);
    var sourceLanguage = normalizeContentLanguage_(input.sourceLanguage);
    var icon = String(input.icon || 'Package').trim();

    if (!title) {
      throw new Error('O tÃ­tulo da categoria Ã© obrigatÃ³rio.');
    }

    if (!cityId || findIndexById_(cities, cityId) === -1) {
      throw new Error('Selecione uma cidade valida para a categoria.');
    }

    var now = now_();
    var index = findIndexById_(categories, id);

    if (index === -1) {
      // Na criaÃ§Ã£o, gera automaticamente os nomes nos trÃªs idiomas.
      var translations = translateCatalogText_(title, sourceLanguage);

      categories.push({
        id: Utilities.getUuid(),
        cityId: cityId,
        title: translations.pt,
        icon: icon,
        order: categories.length,
        createdAt: now,
        updatedAt: now,
        updatedBy: user.id,
        titleBR: translations.pt,
        titleEN: translations.en,
        titleES: translations.es
      });
    } else {
      // Na ediÃ§Ã£o, recalcula automaticamente os nomes nos trÃªs idiomas.
      var editedTranslations = translateCatalogText_(title, sourceLanguage);
      var current = categories[index];
      current.cityId = cityId;
      current.icon = icon;
      current.updatedAt = now;
      current.updatedBy = user.id;
      current.title = editedTranslations.pt;
      current.titleBR = editedTranslations.pt;
      current.titleEN = editedTranslations.en;
      current.titleES = editedTranslations.es;

      categories[index] = current;
    }

    normalizeOrders_(categories);
    var products = readProducts_();
    fillCatalogLinkNames_(cities, categories, products);
    writeTable_('Categories', categories);
    writeProducts_(products);
    bumpCatalogRevision_();

    return { catalog: readCatalog_() };
  });
}


function deleteCategory_(
  token,
  id
) {
  requireOwner_(token);

  id = String(
    id || ''
  );

  return withLock_(function () {
    var categories =
      readTable_('Categories');

    if (
      findIndexById_(
        categories,
        id
      ) === -1
    ) {
      throw new Error(
        'Categoria nÃ£o encontrada.'
      );
    }

    var products =
      readProducts_();

    var productIds = {};

    products.forEach(
      function (product) {
        if (
          product.categoryId === id
        ) {
          productIds[
            product.id
          ] = true;
        }
      }
    );

    categories =
      categories.filter(
        function (category) {
          return (
            category.id !== id
          );
        }
      );

    products =
      products.filter(
        function (product) {
          return (
            product.categoryId !== id
          );
        }
      );

    var images =
      readTable_(
        'ProductImages'
      ).filter(
        function (image) {
          return !productIds[
            image.productId
          ];
        }
      );

    normalizeOrders_(
      categories
    );

    normalizeProductOrders_(
      products
    );

    fillCatalogLinkNames_(readTable_('Cities'), categories, products);

    writeTable_(
      'Categories',
      categories
    );

    writeTable_(
      'Products',
      products
    );

    writeTable_(
      'ProductImages',
      images
    );

    bumpCatalogRevision_();

    return {
      catalog: readCatalog_()
    };
  });
}


function reorderCategories_(
  token,
  categoryIds
) {
  requireOwner_(token);

  categoryIds =
    Array.isArray(
      categoryIds
    )
      ? categoryIds.map(String)
      : [];

  return withLock_(function () {
    var categories =
      readTable_('Categories');

    var ordered = [];

    categoryIds.forEach(
      function (id) {
        var category =
          categories.find(
            function (item) {
              return (
                item.id === id
              );
            }
          );

        if (
          category &&
          ordered.indexOf(
            category
          ) === -1
        ) {
          ordered.push(
            category
          );
        }
      }
    );

    categories.forEach(
      function (category) {
        if (
          ordered.indexOf(
            category
          ) === -1
        ) {
          ordered.push(
            category
          );
        }
      }
    );

    assignOrdersInCurrentSequence_(
      ordered
    );

    writeTable_(
      'Categories',
      ordered
    );

    bumpCatalogRevision_();

    return {
      catalog: readCatalog_()
    };
  });
}


function uploadProductImage_(
  token,
  image,
  productName
) {
  requireProductPermission_(token, 'editProductMedia');

  image = image || {};

  var uploaded =
    uploadImageToImgBB_(
      image,
      String(
        productName ||
        'produto'
      )
    );

  return {
    image: uploaded
  };
}


function saveProduct_(token, input) {
  var user = requireSession_(token);
  input = input || {};
  var normalized = validateProductInput_(input);

  return withLock_(function () {
    var categories = readTable_('Categories');

    var targetCategoryIndex = findIndexById_(categories, normalized.categoryId);
    if (targetCategoryIndex === -1) {
      throw new Error('A categoria selecionada nÃ£o existe mais.');
    }
    requireCityAccess_(user, categories[targetCategoryIndex].cityId);

    var products = readProducts_();
    var id = normalized.id || Utilities.getUuid();
    var index = findIndexById_(products, id);
    var now = now_();

    var prices = {
      amountBRL: priceCellValue_(normalized.prices.BRL),
      amountUSD: priceCellValue_(normalized.prices.USD),
      amountGBP: priceCellValue_(normalized.prices.GBP),
      amountEUR: priceCellValue_(normalized.prices.EUR)
    };

    var currentImages = [];
    if (index === -1) {
      if (!canManageProduct_(user, 'createProduct')) {
        throw new Error('Sua conta nao tem permissao para criar produtos.');
      }
      if (normalized.sold && !canManageProduct_(user, 'markProductSold')) {
        throw new Error('Sua conta nao tem permissao para marcar produtos como vendidos.');
      }
    } else {
      var productBeforeChanges = products[index];
      var sourceCategoryIndex = findIndexById_(categories, productBeforeChanges.categoryId);
      if (sourceCategoryIndex !== -1) requireCityAccess_(user, categories[sourceCategoryIndex].cityId);
      currentImages = readTable_('ProductImages').filter(function (image) {
        return image.productId === id;
      });

      if (
        productBeforeChanges.categoryId !== normalized.categoryId &&
        !canManageProduct_(user, 'editProductCategory')
      ) {
        throw new Error('Sua conta nao tem permissao para alterar a categoria do produto.');
      }

      if (
        productSourceName_(productBeforeChanges, normalized.sourceLanguage) !== normalized.name &&
        !canManageProduct_(user, 'editProductName')
      ) {
        throw new Error('Sua conta nao tem permissao para editar o nome do produto.');
      }

      if (
        productPricesChanged_(productBeforeChanges, prices) &&
        !canManageProduct_(user, 'editProductPrice')
      ) {
        throw new Error('Sua conta nao tem permissao para editar o valor do produto.');
      }

      if (
        sanitizeHtml_(productSourceDescription_(productBeforeChanges, normalized.sourceLanguage)) !== normalized.descriptionHtml &&
        !canManageProduct_(user, 'editProductDescription')
      ) {
        throw new Error('Sua conta nao tem permissao para editar a descricao do produto.');
      }

      if (
        productImagesChanged_(currentImages, normalized.images) &&
        !canManageProduct_(user, 'editProductMedia')
      ) {
        throw new Error('Sua conta nao tem permissao para editar imagens do produto.');
      }

      if (
        productSoldChanged_(productBeforeChanges, normalized) &&
        !canManageProduct_(user, 'markProductSold')
      ) {
        throw new Error('Sua conta nao tem permissao para marcar produtos como vendidos.');
      }
    }

    var uploadedImages = normalized.images.map(function (image, imageIndex) {
      if (image.url && !image.source) {
        return {
          id: image.id || Utilities.getUuid(),
          url: image.url,
          deleteUrl: image.deleteUrl || '',
          order: imageIndex,
          mediaType: normalizeMediaType_(image.mediaType),
          videoProvider: normalizeVideoProvider_(image.videoProvider),
          thumbnailUrl: String(image.thumbnailUrl || '').trim()
        };
      }

      if (normalizeMediaType_(image.mediaType) === 'video') {
        return {
          id: image.id || Utilities.getUuid(),
          url: String(image.url || image.source || '').trim(),
          deleteUrl: '',
          order: imageIndex,
          mediaType: 'video',
          videoProvider: normalizeVideoProvider_(image.videoProvider),
          thumbnailUrl: String(image.thumbnailUrl || '').trim()
        };
      }

      var uploaded = uploadImageToImgBB_(
        image,
        normalized.name + '-' + (imageIndex + 1)
      );

      return {
        id: Utilities.getUuid(),
        url: uploaded.url,
        deleteUrl: uploaded.deleteUrl || '',
        order: imageIndex,
        mediaType: 'image',
        videoProvider: '',
        thumbnailUrl: ''
      };
    });

    if (index === -1) {
      var translations = completeCatalogTextTranslations_(
        normalized.name,
        normalized.sourceLanguage
      );

      var descriptionTranslations = hasCompleteCatalogHtmlTranslations_(normalized.descriptionTranslations)
        ? normalized.descriptionTranslations
        : completeCatalogHtmlTranslations_(
          normalized.descriptionHtml,
          normalized.sourceLanguage
        );

      var countInCategory = products.filter(function (product) {
        return product.categoryId === normalized.categoryId;
      }).length;

      products.push({
        id: id,
        categoryId: normalized.categoryId,
        coordinates: normalized.coordinates,
        storageWeight: normalized.storageWeight,
        importKey: '',
        name: translations.pt,
        order: isFinite(normalized.order) ? normalized.order : countInCategory + 1,
        createdAt: now,
        updatedAt: now,
        updatedBy: user.id,
        nameBR: translations.pt,
        nameEN: translations.en,
        nameES: translations.es,
        amountBRL: prices.amountBRL,
        amountUSD: prices.amountUSD,
        amountGBP: prices.amountGBP,
        amountEUR: prices.amountEUR,
        descriptionHtml: descriptionTranslations.pt,
        descriptionHtmlBR: descriptionTranslations.pt,
        descriptionHtmlEN: descriptionTranslations.en,
        descriptionHtmlES: descriptionTranslations.es,
        sold: normalized.sold,
        soldOwnerName: normalized.soldOwnerName,
        soldOwnerDiscordId: normalized.soldOwnerDiscordId
      });
    } else {
      var current = products[index];
      var categoryChanged = current.categoryId !== normalized.categoryId;

      current.categoryId = normalized.categoryId;
      current.coordinates = normalized.coordinates || current.coordinates || '';
      current.storageWeight = normalized.storageWeight || current.storageWeight || '';
      current.updatedAt = now;
      current.updatedBy = user.id;

      // Translation is only automatic when a product is first created. On an
      // existing product, changing one language must preserve the other two.
      if (normalized.sourceLanguage === 'en') {
        current.nameEN = normalized.name;
      } else if (normalized.sourceLanguage === 'es') {
        current.nameES = normalized.name;
      } else {
        current.name = normalized.name;
        current.nameBR = normalized.name;
      }

      current.amountBRL = prices.amountBRL;
      current.amountUSD = prices.amountUSD;
      current.amountGBP = prices.amountGBP;
      current.amountEUR = prices.amountEUR;

      var currentDescriptionTranslations = hasCompleteCatalogHtmlTranslations_(normalized.descriptionTranslations)
        ? normalized.descriptionTranslations
        : completeCatalogHtmlTranslations_(
          normalized.descriptionHtml,
          normalized.sourceLanguage
        );

      current.descriptionHtml = currentDescriptionTranslations.pt;
      current.descriptionHtmlBR = currentDescriptionTranslations.pt;
      current.descriptionHtmlEN = currentDescriptionTranslations.en;
      current.descriptionHtmlES = currentDescriptionTranslations.es;
      current.sold = normalized.sold;
      current.soldOwnerName = normalized.soldOwnerName;
      current.soldOwnerDiscordId = normalized.soldOwnerDiscordId;

      if (categoryChanged) {
        current.order = products.filter(function (product) {
          return product.categoryId === normalized.categoryId && product.id !== id;
        }).length + 1;
      }

      if (isFinite(normalized.order)) {
        current.order = normalized.order;
      }

      products[index] = current;
    }

    var images = readTable_('ProductImages').filter(function (image) {
      return image.productId !== id;
    });

    uploadedImages.forEach(function (image) {
      images.push({
        id: image.id,
        productId: id,
        url: image.url,
        deleteUrl: image.deleteUrl,
        order: image.order,
        createdAt: now,
        mediaType: image.mediaType || 'image',
        videoProvider: image.videoProvider || '',
        thumbnailUrl: image.thumbnailUrl || ''
      });
    });

    normalizeProductOrders_(products);
    applyMansionNameOrders_(products);
    fillCatalogLinkNames_(readTable_('Cities'), categories, products);
    writeProducts_(products);
    writeTable_('ProductImages', images);
    bumpCatalogRevision_();

    return { catalog: readCatalog_(null, user) };
  });
}

function translateProductLanguage_(token, productId, language) {
  var user = requireOwner_(token);
  productId = String(productId || '').trim();
  var targetLanguage = normalizeContentLanguage_(language);

  if (!productId) {
    throw new Error('Produto nao informado.');
  }

  return withLock_(function () {
    var products = readProducts_();
    var index = findIndexById_(products, productId);

    if (index === -1) {
      throw new Error('Produto nao encontrado.');
    }

    var product = products[index];
    var now = now_();
    var sourceLanguage =
      String(product.nameBR || product.name || '').trim()
        ? 'pt'
        : String(product.nameEN || '').trim()
          ? 'en'
          : 'es';
    var sourceName =
      sourceLanguage === 'pt'
        ? String(product.nameBR || product.name || '').trim()
        : sourceLanguage === 'en'
          ? String(product.nameEN || '').trim()
          : String(product.nameES || '').trim();
    var sourceDescription =
      sourceLanguage === 'pt'
        ? sanitizeHtml_(product.descriptionHtmlBR || product.descriptionHtml || '')
        : sourceLanguage === 'en'
          ? sanitizeHtml_(product.descriptionHtmlEN || '')
          : sanitizeHtml_(product.descriptionHtmlES || '');

    if (!sourceName && !sourceDescription) {
      throw new Error('Produto sem texto de origem para traduzir.');
    }

    var translatedNames = sourceName
      ? completeCatalogTextTranslations_(sourceName, sourceLanguage)
      : { pt: '', en: '', es: '' };
    var translatedDescriptions = sourceDescription
      ? completeCatalogHtmlTranslations_(sourceDescription, sourceLanguage)
      : { pt: '', en: '', es: '' };
    var targetName =
      targetLanguage === 'en'
        ? translatedNames.en
        : targetLanguage === 'es'
          ? translatedNames.es
          : translatedNames.pt;
    var targetDescription =
      targetLanguage === 'en'
        ? translatedDescriptions.en
        : targetLanguage === 'es'
          ? translatedDescriptions.es
          : translatedDescriptions.pt;

    if (sourceName && !targetName) {
      throw new Error('A API de traducao nao retornou nome traduzido.');
    }

    if (targetLanguage === 'en') {
      product.nameEN = targetName || product.nameEN || '';
      product.descriptionHtmlEN = targetDescription || product.descriptionHtmlEN || '';
    } else if (targetLanguage === 'es') {
      product.nameES = targetName || product.nameES || '';
      product.descriptionHtmlES = targetDescription || product.descriptionHtmlES || '';
    } else {
      product.name = targetName || product.name || '';
      product.nameBR = targetName || product.nameBR || '';
      product.descriptionHtml = targetDescription || product.descriptionHtml || '';
      product.descriptionHtmlBR = targetDescription || product.descriptionHtmlBR || '';
    }

    product.updatedAt = now;
    product.updatedBy = user.id;
    products[index] = product;

    fillCatalogLinkNames_(readTable_('Cities'), readTable_('Categories'), products);
    writeProducts_(products);
    bumpCatalogRevision_();

    return {
      productId: productId,
      language: targetLanguage,
      catalog: readCatalog_()
    };
  });
}


function cloneProduct_(token, productId, targetCategoryId) {
  var user = requireProductPermission_(token, 'cloneProduct');
  productId = String(productId || '').trim();
  targetCategoryId = String(targetCategoryId || '').trim();

  return withLock_(function () {
    var categories = readTable_('Categories');
    var targetCategoryIndex = findIndexById_(categories, targetCategoryId);
    if (targetCategoryIndex === -1) {
      throw new Error('Categoria de destino nao encontrada.');
    }
    requireCityAccess_(user, categories[targetCategoryIndex].cityId);

    var products = readProducts_();
    var sourceIndex = findIndexById_(products, productId);
    if (sourceIndex === -1) throw new Error('Produto nao encontrado.');

    var source = products[sourceIndex];
    var sourceCategoryIndex = findIndexById_(categories, source.categoryId);
    if (sourceCategoryIndex !== -1) requireCityAccess_(user, categories[sourceCategoryIndex].cityId);
    var now = now_();
    var newId = Utilities.getUuid();
    var countInCategory = products.filter(function (product) {
      return product.categoryId === targetCategoryId;
    }).length;

    products.push({
      id: newId,
      categoryId: targetCategoryId,
      coordinates: source.coordinates || '',
      storageWeight: source.storageWeight || '',
      importKey: '',
      name: source.name,
      order: countInCategory + 1,
      createdAt: now,
      updatedAt: now,
      updatedBy: user.id,
      nameBR: source.nameBR,
      nameEN: source.nameEN,
      nameES: source.nameES,
      amountBRL: source.amountBRL,
      amountUSD: source.amountUSD,
      amountGBP: source.amountGBP,
      amountEUR: source.amountEUR,
      descriptionHtml: source.descriptionHtml || '',
      descriptionHtmlBR: source.descriptionHtmlBR || source.descriptionHtml || '',
      descriptionHtmlEN: source.descriptionHtmlEN || '',
      descriptionHtmlES: source.descriptionHtmlES || '',
      sold: false,
      soldOwnerName: '',
      soldOwnerDiscordId: ''
    });

    var images = readTable_('ProductImages');
    images
      .filter(function (image) { return image.productId === productId; })
      .sort(orderSorter_)
      .forEach(function (image, index) {
        images.push({
          id: Utilities.getUuid(),
          productId: newId,
          url: image.url,
          deleteUrl: image.deleteUrl || '',
          order: index,
          createdAt: now,
          mediaType: image.mediaType || 'image',
          videoProvider: image.videoProvider || '',
          thumbnailUrl: image.thumbnailUrl || ''
        });
      });

    normalizeProductOrders_(products);
    fillCatalogLinkNames_(readTable_('Cities'), categories, products);
    writeProducts_(products);
    writeTable_('ProductImages', images);
    bumpCatalogRevision_();

    return { catalog: readCatalog_(null, user) };
  });
}

function cloneCategory_(token, categoryId, targetCityId) {
  var user = requireProductPermission_(token, 'cloneCategory');
  categoryId = String(categoryId || '').trim();
  targetCityId = String(targetCityId || '').trim();

  return withLock_(function () {
    var cities = readTable_('Cities');
    if (findIndexById_(cities, targetCityId) === -1) {
      throw new Error('Cidade de destino nao encontrada.');
    }
    requireCityAccess_(user, targetCityId, cities);

    var categories = readTable_('Categories');
    var sourceIndex = findIndexById_(categories, categoryId);
    if (sourceIndex === -1) throw new Error('Categoria nao encontrada.');

    var source = categories[sourceIndex];
    requireCityAccess_(user, source.cityId, cities);
    var now = now_();
    var newCategoryId = Utilities.getUuid();
    var sameNameInCity = categories.some(function (category) {
      return category.cityId === targetCityId && String(category.title || '').toLowerCase() === String(source.title || '').toLowerCase();
    });
    var suffix = sameNameInCity ? ' - Copia' : '';
    var countInCity = categories.filter(function (category) {
      return category.cityId === targetCityId;
    }).length;

    categories.push({
      id: newCategoryId,
      cityId: targetCityId,
      title: String(source.title || '') + suffix,
      icon: source.icon || 'Package',
      order: countInCity,
      createdAt: now,
      updatedAt: now,
      updatedBy: user.id,
      titleBR: String(source.titleBR || source.title || '') + suffix,
      titleEN: String(source.titleEN || source.title || '') + suffix,
      titleES: String(source.titleES || source.title || '') + suffix
    });

    var products = readProducts_();
    var images = readTable_('ProductImages');
    var idMap = {};
    var clonedProducts = products
      .filter(function (product) { return product.categoryId === categoryId; })
      .sort(orderSorter_);

    clonedProducts.forEach(function (product, index) {
      var newProductId = Utilities.getUuid();
      idMap[product.id] = newProductId;
      products.push({
        id: newProductId,
        categoryId: newCategoryId,
        coordinates: product.coordinates || '',
        storageWeight: product.storageWeight || '',
        importKey: '',
        name: product.name,
        order: index + 1,
        createdAt: now,
        updatedAt: now,
        updatedBy: user.id,
        nameBR: product.nameBR,
        nameEN: product.nameEN,
        nameES: product.nameES,
        amountBRL: product.amountBRL,
        amountUSD: product.amountUSD,
        amountGBP: product.amountGBP,
        amountEUR: product.amountEUR,
        descriptionHtml: product.descriptionHtml || '',
        descriptionHtmlBR: product.descriptionHtmlBR || product.descriptionHtml || '',
        descriptionHtmlEN: product.descriptionHtmlEN || '',
        descriptionHtmlES: product.descriptionHtmlES || ''
      });
    });

    var sourceImages = images.filter(function (image) {
      return idMap[image.productId];
    });

    sourceImages.forEach(function (image) {
      images.push({
        id: Utilities.getUuid(),
        productId: idMap[image.productId],
        url: image.url,
        deleteUrl: image.deleteUrl || '',
        order: image.order,
        createdAt: now,
        mediaType: image.mediaType || 'image',
        videoProvider: image.videoProvider || '',
        thumbnailUrl: image.thumbnailUrl || ''
      });
    });

    normalizeOrders_(categories);
    normalizeProductOrders_(products);
    fillCatalogLinkNames_(cities, categories, products);
    writeTable_('Categories', categories);
    writeProducts_(products);
    writeTable_('ProductImages', images);
    bumpCatalogRevision_();

    return { catalog: readCatalog_() };
  });
}

function deleteProduct_(
  token,
  id
) {
  var user = requireProductPermission_(token, 'deleteProduct');

  id = String(
    id || ''
  );

  return withLock_(function () {
    var products =
      readProducts_();

    var targetProduct = products[findIndexById_(products, id)];
    if (targetProduct) {
      var categories = readTable_('Categories');
      var targetCategory = categories[findIndexById_(categories, targetProduct.categoryId)];
      if (targetCategory) requireCityAccess_(user, targetCategory.cityId);
    }

    if (
      findIndexById_(
        products,
        id
      ) === -1
    ) {
      throw new Error(
        'Produto nÃ£o encontrado.'
      );
    }

    products =
      products.filter(
        function (product) {
          return (
            product.id !== id
          );
        }
      );

    var images =
      readTable_(
        'ProductImages'
      ).filter(
        function (image) {
          return (
            image.productId !== id
          );
        }
      );

    normalizeProductOrders_(
      products
    );

    fillCatalogLinkNames_(readTable_('Cities'), readTable_('Categories'), products);

    writeTable_(
      'Products',
      products
    );

    writeTable_(
      'ProductImages',
      images
    );

    bumpCatalogRevision_();

    return {
      catalog: readCatalog_(null, user)
    };
  });
}


function reorderProducts_(
  token,
  orders
) {
  var user = requireProductPermission_(token, 'moveProduct');

  orders =
    Array.isArray(orders)
      ? orders
      : [];

  return withLock_(function () {
    var categories =
      readTable_('Categories');

    var products =
      readProducts_();

    var validCategories = {};

    categories.forEach(
      function (category) {
        if (canAccessCity_(user, category.cityId)) validCategories[category.id] = true;
      }
    );

    var productById = {};

    products.forEach(
      function (product) {
        productById[
          product.id
        ] = product;
      }
    );

    var used = {};

    orders.forEach(
      function (group) {
        var categoryId =
          String(
            group.categoryId ||
            ''
          );

        if (
          !validCategories[
            categoryId
          ]
        ) {
          return;
        }

        var ids =
          Array.isArray(
            group.productIds
          )
            ? group.productIds
                .map(String)
            : [];

        var order = 1;

        ids.forEach(
          function (id) {
            if (
              !productById[id] ||
              used[id]
            ) {
              return;
            }

            if (!validCategories[productById[id].categoryId]) {
              throw new Error('Sua conta nao tem permissao para mover produtos desta cidade.');
            }

            productById[
              id
            ].categoryId =
              categoryId;

            productById[
              id
            ].order =
              order++;

            productById[
              id
            ].updatedAt =
              now_();

            used[id] = true;
          }
        );
      }
    );

    products
      .filter(
        function (product) {
          return !used[
            product.id
          ];
        }
      )
      .forEach(
        function (product) {
          var siblings =
            products.filter(
              function (item) {
                return (
                  item.categoryId ===
                    product.categoryId &&
                  used[item.id]
                );
              }
            );

          product.order =
            siblings.length + 1;

          used[
            product.id
          ] = true;
        }
      );

    normalizeProductOrders_(
      products
    );

    fillCatalogLinkNames_(readTable_('Cities'), categories, products);

    writeTable_(
      'Products',
      products
    );

    bumpCatalogRevision_();

    return {
      catalog: readCatalog_(null, user)
    };
  });
}


function validateProductInput_(input) {
  var categoryId = String(input.categoryId || '').trim();
  var name = cleanCatalogText_(input.name);
  var sourceLanguage = normalizeContentLanguage_(input.sourceLanguage);
  var images = Array.isArray(input.images) ? input.images : [];
  var pricesInput = input.prices && typeof input.prices === 'object'
    ? input.prices
    : {};
  var prices = {};

  ALLOWED_CURRENCIES.forEach(function (code) {
    var raw = pricesInput[code];
    if (raw === undefined || raw === null || raw === '') return;

    var value = Number(raw);
    if (!isFinite(value) || value < 0) {
      throw new Error('Valor invÃ¡lido para a moeda ' + code + '.');
    }
    prices[code] = value;
  });

  // Compatibilidade com versÃµes antigas do frontend.
  var fallbackCurrency = String(input.currency || '').toUpperCase();
  var fallbackAmount = Number(input.amount);
  if (
    !Object.keys(prices).length &&
    ALLOWED_CURRENCIES.indexOf(fallbackCurrency) !== -1 &&
    isFinite(fallbackAmount) &&
    fallbackAmount >= 0
  ) {
    prices[fallbackCurrency] = fallbackAmount;
  }

  if (!categoryId) throw new Error('Selecione uma categoria.');
  if (!name) throw new Error('O nome do produto Ã© obrigatÃ³rio.');
  if (images.length > 10) throw new Error('O limite Ã© de 10 imagens por produto.');

  var sold = input.sold === true;
  var soldOwnerName = String(input.soldOwnerName || '').trim();
  var soldOwnerDiscordId = String(input.soldOwnerDiscordId || '').trim();

  if (sold && !soldOwnerName) {
    throw new Error('Informe o nome do dono quando marcar como vendido.');
  }

  return {
    id: String(input.id || '').trim(),
    categoryId: categoryId,
    coordinates: String(input.coordinates || '').trim(),
    storageWeight: String(input.storageWeight || '').trim(),
    name: name,
    order: normalizeOptionalOrder_(input.order),
    descriptionHtml: sanitizeHtml_(input.descriptionHtml || ''),
    descriptionTranslations: normalizeDescriptionTranslations_(input.descriptionTranslations),
    sourceLanguage: sourceLanguage,
    autoTranslate: input.autoTranslate !== false,
    autoTranslateDescription: input.autoTranslateDescription !== false,
    syncNameAcrossLanguages: input.syncNameAcrossLanguages === true,
    prices: prices,
    images: images,
    sold: sold,
    soldOwnerName: sold ? soldOwnerName : '',
    soldOwnerDiscordId: sold ? soldOwnerDiscordId : ''
  };
}

function productSourceName_(product, sourceLanguage) {
  var source = normalizeContentLanguage_(sourceLanguage);
  if (source === 'en') return String(product.nameEN || '').trim();
  if (source === 'es') return String(product.nameES || '').trim();
  return String(product.nameBR || product.name || '').trim();
}

function productSourceDescription_(product, sourceLanguage) {
  var source = normalizeContentLanguage_(sourceLanguage);
  if (source === 'en') return sanitizeHtml_(product.descriptionHtmlEN || '');
  if (source === 'es') return sanitizeHtml_(product.descriptionHtmlES || '');
  return sanitizeHtml_(product.descriptionHtmlBR || product.descriptionHtml || '');
}

function productPricesChanged_(product, prices) {
  return (
    priceCellValue_(product.amountBRL) !== priceCellValue_(prices.amountBRL) ||
    priceCellValue_(product.amountUSD) !== priceCellValue_(prices.amountUSD) ||
    priceCellValue_(product.amountGBP) !== priceCellValue_(prices.amountGBP) ||
    priceCellValue_(product.amountEUR) !== priceCellValue_(prices.amountEUR)
  );
}

function mediaComparable_(image, index) {
  return [
    image.id || '',
    image.url || '',
    normalizeMediaType_(image.mediaType),
    normalizeVideoProvider_(image.videoProvider),
    String(image.thumbnailUrl || ''),
    Number(index)
  ].join('|');
}

function productImagesChanged_(currentImages, nextImages) {
  var current = (currentImages || [])
    .sort(orderSorter_)
    .map(function (image, index) {
      return mediaComparable_(image, index);
    })
    .join('\n');

  var next = (nextImages || [])
    .map(function (image, index) {
      return mediaComparable_(image, index);
    })
    .join('\n');

  return current !== next;
}

function productSoldChanged_(product, normalized) {
  return (
    Boolean(product.sold) !== Boolean(normalized.sold) ||
    String(product.soldOwnerName || '').trim() !== String(normalized.soldOwnerName || '').trim() ||
    String(product.soldOwnerDiscordId || '').trim() !== String(normalized.soldOwnerDiscordId || '').trim()
  );
}

function normalizeDescriptionTranslations_(value) {
  value = value && typeof value === 'object' ? value : {};

  return {
    pt: sanitizeHtml_(value.pt || value.br || value.BR || value.descriptionHtmlBR || ''),
    en: sanitizeHtml_(value.en || value.EN || value.descriptionHtmlEN || ''),
    es: sanitizeHtml_(value.es || value.ES || value.descriptionHtmlES || '')
  };
}

function sanitizeHtml_(html) {
  html = String(html || '');
  if (!html) return '';

  html = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '');
  html = html.replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '');
  html = html.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');
  html = html.replace(/(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, '$1="#"');
  html = html.replace(/(href|src)\s*=\s*(['"])\s*data:(?!image\/(?:png|jpeg|jpg|gif|webp);)/gi, '$1="#" data-blocked="');

  if (html.length > 50000) {
    html = html.slice(0, 50000);
  }

  return html;
}

function normalizeMediaType_(mediaType) {
  return String(mediaType || '').toLowerCase() === 'video' ? 'video' : 'image';
}

function normalizeVideoProvider_(provider) {
  provider = String(provider || '').toLowerCase();
  if (provider === 'youtube' || provider === 'drive' || provider === 'direct') return provider;
  return '';
}


function uploadImageToImgBB_(
  image,
  fallbackName
) {
  var apiKey =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        'IMGBB_API_KEY'
      );

  if (!apiKey) {
    throw new Error(
      'IMGBB_API_KEY nÃ£o configurada nas propriedades do Apps Script.'
    );
  }

  var source = String(
    image.source || ''
  ).trim();

  if (!source) {
    throw new Error(
      'Uma das imagens nÃ£o possui conteÃºdo vÃ¡lido.'
    );
  }

  if (
    String(
      image.sourceType || ''
    ) === 'base64'
  ) {
    source = source.replace(
      /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
      ''
    );
  }

  var name = String(
    image.name ||
    fallbackName ||
    'produto'
  )
    .replace(
      /[^a-zA-Z0-9_-]+/g,
      '-'
    )
    .replace(
      /^-+|-+$/g,
      ''
    )
    .slice(
      0,
      80
    ) || 'produto';

  var response =
    UrlFetchApp.fetch(
      'https://api.imgbb.com/1/upload?key=' +
        encodeURIComponent(
          apiKey
        ),

      {
        method: 'post',

        payload: {
          image: source,
          name: name
        },

        muteHttpExceptions:
          true
      }
    );

  var status =
    response.getResponseCode();

  var text =
    response.getContentText();

  var result;

  try {
    result =
      JSON.parse(text);
  } catch (error) {
    throw new Error(
      'O ImgBB retornou uma resposta invÃ¡lida.'
    );
  }

  if (
    status < 200 ||
    status >= 300 ||
    !result.success ||
    !result.data
  ) {
    var message =
      result &&
      result.error &&
      result.error.message
        ? result.error.message
        : 'Falha ao enviar imagem ao ImgBB.';

    throw new Error(message);
  }

  return {
    url:
      result.data.url ||
      result.data.display_url,

    deleteUrl:
      result.data.delete_url ||
      ''
  };
}

function readDescriptionTemplates_() {
  return readTable_('DescriptionTemplates')
    .filter(function (row) {
      return String(row.id || '').trim();
    })
    .map(function (row) {
      return {
        id: String(row.id || '').trim(),
        categoryId: String(row.categoryId || '').trim(),
        title: cleanCatalogText_(row.title || 'Padrao'),
        order: Number(row.order || 0),
        active: row.active === true || String(row.active || '').toUpperCase() === 'TRUE',
        htmlBR: sanitizeHtml_(row.htmlBR || ''),
        htmlEN: sanitizeHtml_(row.htmlEN || ''),
        htmlES: sanitizeHtml_(row.htmlES || ''),
        createdAt: row.createdAt || '',
        updatedAt: row.updatedAt || '',
        updatedBy: row.updatedBy || ''
      };
    });
}

function writeDescriptionTemplates_(templates) {
  templates = templates || [];
  writeTable_('DescriptionTemplates', templates.map(function (template) {
    return {
      id: template.id,
      categoryId: template.categoryId,
      title: template.title,
      order: Number(template.order || 0),
      active: template.active === true ? 'TRUE' : '',
      htmlBR: sanitizeHtml_(template.htmlBR || ''),
      htmlEN: sanitizeHtml_(template.htmlEN || ''),
      htmlES: sanitizeHtml_(template.htmlES || ''),
      createdAt: template.createdAt || '',
      updatedAt: template.updatedAt || '',
      updatedBy: template.updatedBy || ''
    };
  }));
}

function validateDescriptionTemplateInput_(input) {
  input = input || {};
  var categoryId = String(input.categoryId || '').trim();
  var title = cleanCatalogText_(input.title || '');

  if (!categoryId) throw new Error('Selecione uma categoria para o padrao.');
  if (!title) throw new Error('Informe o nome do padrao.');

  return {
    id: String(input.id || '').trim(),
    categoryId: categoryId,
    title: title,
    order: Number(input.order || 0),
    active: input.active === true,
    htmlBR: sanitizeHtml_(input.htmlBR || ''),
    htmlEN: sanitizeHtml_(input.htmlEN || ''),
    htmlES: sanitizeHtml_(input.htmlES || '')
  };
}

function saveDescriptionTemplate_(token, input) {
  var user = requireProductPermission_(token, 'editProductDescription');
  var normalized = validateDescriptionTemplateInput_(input);

  return withLock_(function () {
    var categories = readTable_('Categories');
    var categoryExists = categories.some(function (category) {
      return category.id === normalized.categoryId;
    });

    if (!categoryExists) throw new Error('Categoria nao encontrada para o padrao.');
    var templateCategory = categories[findIndexById_(categories, normalized.categoryId)];
    requireCityAccess_(user, templateCategory.cityId);

    var now = now_();
    var templates = readDescriptionTemplates_();
    var id = normalized.id || Utilities.getUuid();
    var index = templates.findIndex(function (template) {
      return template.id === id;
    });
    var current = index >= 0 ? templates[index] : {};
    var next = {
      id: id,
      categoryId: normalized.categoryId,
      title: normalized.title,
      order: normalized.order,
      active: normalized.active,
      htmlBR: normalized.htmlBR,
      htmlEN: normalized.htmlEN,
      htmlES: normalized.htmlES,
      createdAt: current.createdAt || now,
      updatedAt: now,
      updatedBy: user.username || user.name || ''
    };

    if (index >= 0) templates[index] = next;
    else templates.push(next);

    writeDescriptionTemplates_(templates.sort(orderSorter_));
    bumpCatalogRevision_();

    return {
      catalog: readCatalog_(null, user)
    };
  });
}

function deleteDescriptionTemplate_(token, id) {
  var user = requireProductPermission_(token, 'editProductDescription');
  id = String(id || '').trim();
  if (!id) throw new Error('Padrao nao informado.');

  return withLock_(function () {
    var templates = readDescriptionTemplates_();
    var targetTemplate = templates.filter(function (template) { return template.id === id; })[0];
    if (targetTemplate) {
      var categories = readTable_('Categories');
      var targetCategory = categories[findIndexById_(categories, targetTemplate.categoryId)];
      if (targetCategory) requireCityAccess_(user, targetCategory.cityId);
    }
    var next = templates.filter(function (template) {
      return template.id !== id;
    });

    if (next.length === templates.length) throw new Error('Padrao nao encontrado.');

    writeDescriptionTemplates_(next);
    bumpCatalogRevision_();

    return {
      catalog: readCatalog_(null, user),
      deletedBy: user.username || user.name || ''
    };
  });
}


function readCatalog_(language, viewerUser) {
  var catalogLanguage = normalizeContentLanguage_(language);
  var revision = getCatalogRevision_();
  var canViewSoldDiscord =
    viewerUser &&
    canManageProduct_(viewerUser, 'viewSoldDiscordId');

  var allCities = readTable_('Cities');
  var allowedCityIds = allowedCityIdsForUser_(viewerUser, allCities);
  var allowedCityMap = {};
  allowedCityIds.forEach(function (cityId) { allowedCityMap[cityId] = true; });

  var cities = allCities
    .filter(function (city) { return Boolean(allowedCityMap[String(city.id || '')]); })
    .sort(orderSorter_)
    .map(function (city) {
      return {
        id: city.id,
        name: city.name,
        order: Number(city.order || 0),
        createdAt: city.createdAt,
        updatedAt: city.updatedAt
      };
    });

  var categories = readTable_('Categories')
    .filter(function (category) { return Boolean(allowedCityMap[String(category.cityId || '')]); })
    .sort(orderSorter_)
    .map(function (category) {
      var names = localizedRowValues_(category, 'title');
      return {
        id: category.id,
        cityId: category.cityId,
        title: names.br,
        translations: {
          pt: names.br,
          en: names.en,
          es: names.es
        },
        icon: category.icon || 'Package',
        order: Number(category.order || 0),
        createdAt: category.createdAt,
        updatedAt: category.updatedAt
      };
    });

  var allowedCategoryMap = {};
  categories.forEach(function (category) { allowedCategoryMap[category.id] = true; });

  var images = readTable_('ProductImages').sort(orderSorter_);
  var imagesByProduct = {};

  images.forEach(function (image) {
    if (!imagesByProduct[image.productId]) imagesByProduct[image.productId] = [];
    imagesByProduct[image.productId].push({
      id: image.id,
      productId: image.productId,
      url: image.url,
      deleteUrl: image.deleteUrl || '',
      order: Number(image.order || 0),
      mediaType: normalizeMediaType_(image.mediaType),
      videoProvider: normalizeVideoProvider_(image.videoProvider),
      thumbnailUrl: String(image.thumbnailUrl || '')
    });
  });

  var products = readProducts_()
    .filter(function (product) { return Boolean(allowedCategoryMap[String(product.categoryId || '')]); })
    .sort(function (a, b) {
      if (a.categoryId !== b.categoryId) {
        return String(a.categoryId).localeCompare(String(b.categoryId));
      }
      return Number(a.order || 0) - Number(b.order || 0);
    })
    .map(function (product) {
      var names = localizedRowValues_(product, 'name');
      var descriptions = localizedDescriptionValues_(product);
      var prices = {};
      addPriceIfValid_(prices, 'BRL', product.amountBRL);
      addPriceIfValid_(prices, 'USD', product.amountUSD);
      addPriceIfValid_(prices, 'GBP', product.amountGBP);
      addPriceIfValid_(prices, 'EUR', product.amountEUR);

      var firstCurrency = prices.BRL !== undefined
        ? 'BRL'
        : Object.keys(prices)[0] || 'BRL';
      var firstAmount = prices[firstCurrency] !== undefined
        ? prices[firstCurrency]
        : null;

      return {
        id: product.id,
        categoryId: product.categoryId,
        coordinates: product.coordinates || '',
        storageWeight: product.storageWeight || '',
        importKey: product.importKey || '',
        name: names.br,
        translations: {
          pt: names.br,
          en: names.en,
          es: names.es
        },
        amount: firstAmount === null ? null : Number(firstAmount),
        currency: firstCurrency,
        prices: prices,
        descriptionHtml: descriptions.pt,
        descriptionTranslations: {
          pt: descriptions.pt,
          en: descriptions.en,
          es: descriptions.es
        },
        sold: product.sold === true,
        soldOwnerName: product.soldOwnerName || '',
        soldOwnerDiscordId: canViewSoldDiscord ? product.soldOwnerDiscordId || '' : '',
        order: Number(product.order || 0),
        images: imagesByProduct[product.id] || [],
        createdAt: product.createdAt,
        updatedAt: product.updatedAt
      };
    });

  var descriptionTemplates = readDescriptionTemplates_()
    .filter(function (template) { return Boolean(allowedCategoryMap[String(template.categoryId || '')]); })
    .sort(function (a, b) {
      if (a.categoryId !== b.categoryId) {
        return String(a.categoryId).localeCompare(String(b.categoryId));
      }
      return Number(a.order || 0) - Number(b.order || 0);
    });

  return {
    revision: revision,
    cities: cities,
    categories: categories,
    products: products,
    descriptionTemplates: descriptionTemplates
  };
}

function readProducts_() {
  return readTable_('Products')
    .filter(function (row) {
      return String(row.id || '').trim();
    })
    .map(normalizeProductRow_);
}

function writeProducts_(products) {
  products = products || [];
  var cities = readTable_('Cities');
  var categories = readTable_('Categories');
  fillCatalogLinkNames_(cities, categories, products);

  writeTable_('Products', products.map(function (product) {
    var nameBR = String(product.nameBR || product.name || '').trim();
    var nameEN = String(product.nameEN || '').trim();
    var nameES = String(product.nameES || '').trim();
    var descriptionBR = sanitizeHtml_(product.descriptionHtmlBR || product.descriptionHtml || '');
    var descriptionEN = sanitizeHtml_(product.descriptionHtmlEN || '');
    var descriptionES = sanitizeHtml_(product.descriptionHtmlES || '');

    return {
      id: product.id,
      categoryId: product.categoryId,
      cityName: product.cityName || '',
      categoryName: product.categoryName || '',
      coordinates: product.coordinates || '',
      storageWeight: product.storageWeight || '',
      importKey: product.importKey || '',
      name: nameBR,
      order: product.order,
      createdAt: product.createdAt || '',
      updatedAt: product.updatedAt || '',
      updatedBy: product.updatedBy || '',
      nameBR: nameBR,
      nameEN: nameEN,
      nameES: nameES,
      amountBRL: product.amountBRL || '',
      amountUSD: product.amountUSD || '',
      amountGBP: product.amountGBP || '',
      amountEUR: product.amountEUR || '',
      descriptionHtml: descriptionBR,
      descriptionHtmlBR: descriptionBR,
      descriptionHtmlEN: descriptionEN,
      descriptionHtmlES: descriptionES,
      sold: product.sold === true ? 'TRUE' : '',
      soldOwnerName: product.soldOwnerName || '',
      soldOwnerDiscordId: product.soldOwnerDiscordId || ''
    };
  }));
}

function normalizeProductRow_(row) {
  row = row || {};
  var nameBR = String(row.nameBR || row.name || '').trim();
  var nameEN = String(row.nameEN || '').trim();
  var nameES = String(row.nameES || '').trim();
  var descriptionBR = sanitizeHtml_(row.descriptionHtmlBR || row.descriptionHtml || row.description || '');
  var descriptionEN = sanitizeHtml_(row.descriptionHtmlEN || '');
  var descriptionES = sanitizeHtml_(row.descriptionHtmlES || '');

  return {
    id: row.id || '',
    categoryId: row.categoryId || '',
    cityName: row.cityName || '',
    categoryName: row.categoryName || '',
    coordinates: row.coordinates || '',
    storageWeight: row.storageWeight || '',
    importKey: row.importKey || '',
    name: nameBR,
    order: row.order === '' || row.order === undefined ? 0 : Number(row.order),
    createdAt: row.createdAt || '',
    updatedAt: row.updatedAt || '',
    updatedBy: row.updatedBy || '',
    nameBR: nameBR,
    nameEN: nameEN,
    nameES: nameES,
    amountBRL: row.amountBRL || '',
    amountUSD: row.amountUSD || '',
    amountGBP: row.amountGBP || '',
    amountEUR: row.amountEUR || '',
    descriptionHtml: descriptionBR,
    descriptionHtmlBR: descriptionBR,
    descriptionHtmlEN: descriptionEN,
    descriptionHtmlES: descriptionES,
    sold: String(row.sold || '').toUpperCase() === 'TRUE' || row.sold === true,
    soldOwnerName: String(row.soldOwnerName || '').trim(),
    soldOwnerDiscordId: String(row.soldOwnerDiscordId || '').trim()
  };
}

function shouldTrimColumnsForTable_(name) {
  return (
    name === 'Backup' ||
    name === 'Products'
  );
}

function ensureProductTranslationTrigger_() {
  try {
    var spreadsheet = getSpreadsheet_();
    var triggers = ScriptApp.getProjectTriggers();
    var exists = triggers.some(function (trigger) {
      return trigger.getHandlerFunction() === 'handleProductTranslationEdit';
    });

    if (!exists) {
      ScriptApp
        .newTrigger('handleProductTranslationEdit')
        .forSpreadsheet(spreadsheet)
        .onEdit()
        .create();
    }
  } catch (error) {
    console.error(
      'Falha ao criar gatilho de traducao de produtos: ' +
      errorMessage_(error)
    );
  }
}

function handleProductTranslationEdit(event) {
  try {
    if (!event || !event.range) return;

    var range = event.range;
    var sheet = range.getSheet();
    if (!sheet || sheet.getName() !== 'Products') return;
    if (range.getRow() < 2) return;

    var startColumn = range.getColumn();
    var endColumn = startColumn + range.getNumColumns() - 1;
    var handlesNames = startColumn <= 15 && endColumn >= 13;
    var handlesDescriptions = startColumn <= 23 && endColumn >= 21;
    if (!handlesNames && !handlesDescriptions) return;

    var values = range.getDisplayValues();
    var updated = false;

    values.forEach(function (rowValues, rowOffset) {
      var row = range.getRow() + rowOffset;

      if (handlesNames) {
        var nameEdit = firstEditedValueInLanguageColumns_(
          rowValues,
          startColumn,
          {
            13: 'pt',
            14: 'en',
            15: 'es'
          }
        );

        if (nameEdit.value) {
          translateProductNameRow_(
            sheet,
            row,
            nameEdit.value,
            nameEdit.language
          );
          updated = true;
        }
      }

      if (handlesDescriptions) {
        var descriptionEdit = firstEditedValueInLanguageColumns_(
          rowValues,
          startColumn,
          {
            21: 'pt',
            22: 'en',
            23: 'es'
          }
        );

        if (descriptionEdit.value) {
          translateProductDescriptionRow_(
            sheet,
            row,
            descriptionEdit.value,
            descriptionEdit.language
          );
          updated = true;
        }
      }
    });

    if (updated) {
      bumpCatalogRevision_();
    }
  } catch (error) {
    logTranslationErrorOnce_(
      'product-sheet-edit',
      'Falha ao traduzir edicao na aba Products: ' +
      errorMessage_(error)
    );
  }
}

function firstEditedValueInLanguageColumns_(
  rowValues,
  startColumn,
  languageByColumn
) {
  var columns = Object.keys(languageByColumn)
    .map(function (column) { return Number(column); })
    .sort(function (a, b) { return a - b; });

  for (var indexInColumns = 0; indexInColumns < columns.length; indexInColumns++) {
    var column = columns[indexInColumns];
    var index = column - startColumn;
    if (index < 0 || index >= rowValues.length) continue;

    var value = String(rowValues[index] || '').trim();
    if (value) {
      return {
        value: value,
        language: languageByColumn[column]
      };
    }
  }

  return {
    value: '',
    language: 'pt'
  };
}

function translateProductNameRow_(
  sheet,
  row,
  value,
  sourceLanguage
) {
  var names = completeCatalogTextTranslations_(
    value,
    sourceLanguage
  );

  sheet.getRange(row, 8).setValue(names.pt);
  sheet.getRange(row, 13, 1, 3).setValues([[
    names.pt,
    names.en,
    names.es
  ]]);
  sheet.getRange(row, 11).setValue(now_());
}

function translateProductDescriptionRow_(
  sheet,
  row,
  value,
  sourceLanguage
) {
  var descriptions = completeCatalogHtmlTranslations_(
    value,
    sourceLanguage
  );

  sheet.getRange(row, 20).setValue(descriptions.pt);
  sheet.getRange(row, 21, 1, 3).setValues([[
    descriptions.pt,
    descriptions.en,
    descriptions.es
  ]]);
  sheet.getRange(row, 11).setValue(now_());
}

function translateExistingProductNames() {
  assertConfigured_();

  return withLock_(function () {
    var sheet = getSpreadsheet_().getSheetByName('Products');
    if (!sheet) throw new Error('Aba Products nao encontrada.');

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return {
        success: true,
        translated: 0
      };
    }

    var rows = sheet
      .getRange(2, 13, lastRow - 1, 3)
      .getDisplayValues();
    var translated = 0;

    rows.forEach(function (values, index) {
      var sourceLanguage =
        String(values[0] || '').trim()
          ? 'pt'
          : String(values[1] || '').trim()
            ? 'en'
            : 'es';
      var value =
        sourceLanguage === 'pt'
          ? String(values[0] || '').trim()
          : sourceLanguage === 'en'
            ? String(values[1] || '').trim()
            : String(values[2] || '').trim();

      if (!value) return;

      translateProductNameRow_(
        sheet,
        index + 2,
        value,
        sourceLanguage
      );
      translated += 1;
    });

    if (translated) bumpCatalogRevision_();

    return {
      success: true,
      translated: translated
    };
  });
}


function normalizeContentLanguage_(
  language
) {
  language = String(
    language || 'pt'
  ).toLowerCase();

  if (
    language === 'en' ||
    language === 'es'
  ) {
    return language;
  }

  return 'pt';
}

function deeplLanguageCode_(language, target) {
  language = normalizeContentLanguage_(language);
  if (language === 'pt') return target ? 'PT-BR' : 'PT';
  if (language === 'en') return target ? 'EN-US' : 'EN';
  if (language === 'es') return 'ES';
  return language.toUpperCase();
}

function deeplApiUrl_(apiKey) {
  return /:fx$/i.test(String(apiKey || ''))
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';
}

function logTranslationErrorOnce_(
  key,
  message
) {
  key = 'translation-error:' + String(key || 'generic');

  try {
    var cache = CacheService.getScriptCache();
    if (cache.get(key)) return;
    cache.put(key, '1', 300);
  } catch (error) {
    // If cache is unavailable, still avoid breaking translation.
  }

  console.error(message);
}

function translateWithDeepL_(
  value,
  sourceLanguage,
  targetLanguage,
  isHtml
) {
  var text = String(value || '');
  if (!text.trim()) return '';

  var autoSource = String(sourceLanguage || '').toLowerCase() === 'auto';
  var source = autoSource ? '' : normalizeContentLanguage_(sourceLanguage);
  var target = normalizeContentLanguage_(targetLanguage);
  if (source && source === target) return text;

  var apiKey = PropertiesService
    .getScriptProperties()
    .getProperty('DEEPL_API_KEY') || '8653b464-0e31-4c24-a1eb-2ce549e12d8d:fx';

  if (!apiKey) return '';

  try {
    var payload = {
      text: text,
      target_lang: deeplLanguageCode_(target, true),
      preserve_formatting: '1'
    };

    if (source) {
      payload.source_lang = deeplLanguageCode_(source, false);
    }

    if (isHtml) {
      payload.tag_handling = 'html';
    }

    var response = UrlFetchApp.fetch(
      deeplApiUrl_(apiKey),
      {
        method: 'post',
        headers: {
          Authorization: 'DeepL-Auth-Key ' + apiKey
        },
        payload: payload,
        muteHttpExceptions: true
      }
    );

    var status = response.getResponseCode();
    if (status < 200 || status >= 300) {
      logTranslationErrorOnce_(
        'deepl-http-' + status,
        'DeepL respondeu HTTP ' +
        status +
        ': ' +
        response.getContentText()
      );
      return '';
    }

    var parsed = JSON.parse(response.getContentText() || '{}');
    var translated =
      parsed &&
      parsed.translations &&
      parsed.translations[0] &&
      parsed.translations[0].text;

    return translated ? String(translated) : '';
  } catch (error) {
    logTranslationErrorOnce_(
      'deepl-exception',
      'Falha ao traduzir com DeepL de ' +
      source +
      ' para ' +
      target +
      ': ' +
      errorMessage_(error)
    );
    return '';
  }
}


function catalogLiteralTranslation_(
  value,
  targetLanguage
) {
  var normalized = String(value || '')
    .trim()
    .toLowerCase();
  var target = normalizeContentLanguage_(targetLanguage);
  var glossary = {
    'modification': {
      pt: 'Modificação',
      en: 'Modification',
      es: 'Modificación'
    },
    'modifications': {
      pt: 'Modificações',
      en: 'Modifications',
      es: 'Modificaciones'
    },
    'change': {
      pt: 'Alteração',
      en: 'Change',
      es: 'Cambio'
    },
    'changes': {
      pt: 'Alterações',
      en: 'Changes',
      es: 'Cambios'
    }
  };

  return glossary[normalized]
    ? glossary[normalized][target] || ''
    : '';
}

function catalogGlossaryKey_(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeCatalogLiteralTranslations_(values) {
  values = values || {};
  var br = String(values.br || values.pt || '').trim();
  var en = String(values.en || '').trim();
  var es = String(values.es || '').trim();
  var keys = [br, en, es].map(catalogGlossaryKey_);
  var modificationAliases = {
    modification: true,
    modifications: true,
    modificacao: true,
    modificacoes: true,
    modificacion: true,
    modificaciones: true
  };
  var changeAliases = {
    change: true,
    changes: true,
    cambio: true,
    cambios: true
  };
  var isModification = keys.some(function (key) {
    return Boolean(modificationAliases[key]);
  });
  var isChange = !isModification && keys.some(function (key) {
    return Boolean(changeAliases[key]);
  });

  if (isModification) {
    return {
      br: 'Modificações',
      pt: 'Modificações',
      en: 'Modifications',
      es: 'Modificaciones'
    };
  }

  if (isChange) {
    return {
      br: 'Alterações',
      pt: 'Alterações',
      en: 'Changes',
      es: 'Cambios'
    };
  }

  return {
    br: br,
    pt: br,
    en: en,
    es: es
  };
}


function translateCatalogText_(
  value,
  sourceLanguage
) {
  var text = String(
    value || ''
  ).trim();

  var source =
    normalizeContentLanguage_(
      sourceLanguage
    );

  var result = {
    pt: '',
    en: '',
    es: ''
  };

  if (!text) {
    return result;
  }

  result[source] = text;

  ['pt', 'en', 'es'].forEach(
    function (target) {
      if (target === source) {
        return;
      }

      try {
        result[target] =
          catalogLiteralTranslation_(
            text,
            target
          ) ||
          translateWithDeepL_(
            text,
            source,
            target,
            false
          ) ||
          LanguageApp.translate(
            text,
            source,
            target
          );
      } catch (error) {
        logTranslationErrorOnce_(
          'languageapp-text-' + source + '-' + target,
          'Falha ao traduzir de ' +
          source +
          ' para ' +
          target +
          ': ' +
          errorMessage_(error)
        );

        result[target] = '';
      }
    }
  );

  var normalizedResult = normalizeCatalogLiteralTranslations_(result);
  return {
    pt: normalizedResult.pt,
    en: normalizedResult.en,
    es: normalizedResult.es
  };
}

function translateCatalogTextAuto_(
  value
) {
  var text = String(value || '').trim();
  var result = {
    pt: '',
    en: '',
    es: ''
  };

  if (!text) return result;

  ['pt', 'en', 'es'].forEach(function (target) {
    var translated = translateWithDeepL_(
      text,
      'auto',
      target,
      false
    );

    if (!translated) {
      try {
        translated = LanguageApp.translate(text, 'pt', target);
      } catch (error) {
        logTranslationErrorOnce_(
          'languageapp-auto-text-' + target,
          'Falha ao traduzir automaticamente para ' +
          target +
          ': ' +
          errorMessage_(error)
        );
      }
    }

    result[target] = translated || '';
  });

  return result;
}

function translateHtmlTextNodes_(
  html,
  sourceLanguage,
  targetLanguage
) {
  html = String(html || '');
  var source = normalizeContentLanguage_(sourceLanguage);
  var target = normalizeContentLanguage_(targetLanguage);

  if (!html || source === target) {
    return html;
  }

  return html.split(/(<[^>]+>)/g).map(function (part) {
    if (!part || /^<[^>]+>$/.test(part)) {
      return part;
    }

    if (!/[A-Za-zÀ-ÿ]/.test(part)) {
      return part;
    }

    var leading = part.match(/^\s*/)[0];
    var trailing = part.match(/\s*$/)[0];
    var text = part.trim();

    if (!text) {
      return part;
    }

    try {
      return leading + (
        translateWithDeepL_(
          text,
          source,
          target,
          false
        ) ||
        LanguageApp.translate(text, source, target)
        ) + trailing;
    } catch (error) {
      logTranslationErrorOnce_(
        'languageapp-html-' + source + '-' + target,
        'Falha ao traduzir HTML de ' +
        source +
        ' para ' +
        target +
        ': ' +
        errorMessage_(error)
      );

      return part;
    }
  }).join('');
}

function translateCatalogHtml_(
  value,
  sourceLanguage
) {
  var html = sanitizeHtml_(value || '');
  var source = normalizeContentLanguage_(sourceLanguage);

  var result = {
    pt: '',
    en: '',
    es: ''
  };

  if (!html) {
    return result;
  }

  result[source] = html;

  ['pt', 'en', 'es'].forEach(function (target) {
    if (target === source) return;
    result[target] = sanitizeHtml_(
      translateWithDeepL_(
        html,
        source,
        target,
        true
      ) ||
      translateHtmlTextNodes_(html, source, target)
    );
  });

  return result;
}

function translateCatalogHtmlAuto_(
  value
) {
  var html = sanitizeHtml_(value || '');
  var result = {
    pt: '',
    en: '',
    es: ''
  };

  if (!html) return result;

  ['pt', 'en', 'es'].forEach(function (target) {
    var translated = translateWithDeepL_(
      html,
      'auto',
      target,
      true
    );

    if (!translated) {
      try {
        translated = translateHtmlTextNodes_(html, 'pt', target);
      } catch (error) {
        logTranslationErrorOnce_(
          'languageapp-auto-html-' + target,
          'Falha ao traduzir HTML automaticamente para ' +
          target +
          ': ' +
          errorMessage_(error)
        );
      }
    }

    result[target] = sanitizeHtml_(translated || '');
  });

  return result;
}

function htmlToPlainText_(html) {
  return normalizeCatalogTextEncoding_(String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&atilde;/gi, 'ã')
    .replace(/&aacute;/gi, 'á')
    .replace(/&acirc;/gi, 'â')
    .replace(/&agrave;/gi, 'à')
    .replace(/&eacute;/gi, 'é')
    .replace(/&ecirc;/gi, 'ê')
    .replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&otilde;/gi, 'õ')
    .replace(/&uacute;/gi, 'ú')
    .replace(/&ccedil;/gi, 'ç')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim());
}

function escapeHtmlText_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeCatalogTextEncoding_(value) {
  return String(value || '')
    .replace(/Ã£/g, 'ã')
    .replace(/Ã¡/g, 'á')
    .replace(/Ã¢/g, 'â')
    .replace(/Ã /g, 'à')
    .replace(/Ã©/g, 'é')
    .replace(/Ãª/g, 'ê')
    .replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó')
    .replace(/Ãµ/g, 'õ')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã§/g, 'ç')
    .replace(/Ã‡/g, 'Ç')
    .replace(/â€“/g, '-')
    .replace(/â€”/g, '-');
}

function extractMansionNumber_(text) {
  text = normalizeCatalogTextEncoding_(text);
  var match = String(text || '').match(/(?:mans[aã]o|mansion|mansi[oó]n)\s*0*([0-9]+)/i);
  return match ? Number(match[1]) : 0;
}

function extractMansionStorage_(text) {
  text = normalizeCatalogTextEncoding_(text);
  var match = text.match(/(?:ba[uú]|baul|baúl|peito|chest|storage|armazenamento|almacenamiento|capacidade\s+de\s+armazenamento|capacidad\s+de\s+almacenamiento)\s*:\s*([0-9]+\s*T|SKORPION)/i);
  return match ? String(match[1]).replace(/\s+/g, '').toUpperCase() : '';
}

function extractMansionCoordinates_(text) {
  text = normalizeCatalogTextEncoding_(text);
  var match = String(text || '').match(/(?:CDS|Coordinates|Coordenadas)\s*:\s*([-0-9.,\s]+)/i);
  if (!match) return '';
  return match[1].replace(/\s+/g, '').replace(/,+$/g, '');
}

function standardMansionDescriptionTranslations_(value) {
  var html = sanitizeHtml_(value || '');
  var plain = htmlToPlainText_(html);
  var number = extractMansionNumber_(plain);
  var storage = extractMansionStorage_(plain);
  var coordinates = extractMansionCoordinates_(plain);

  if (!number || !storage || !coordinates) {
    return null;
  }

  var padded = number < 10 ? '0' + number : String(number);
  var safeStorage = escapeHtmlText_(storage);
  var safeCoordinates = escapeHtmlText_(coordinates);

  function build(copy) {
    return [
      '<p>👑 ' + copy.name + ' ' + padded + '</p>',
      '',
      '<p>➝ ' + copy.benefits + ':</p>',
      '',
      '<ul>',
      '\t<li>' + copy.tattoo + '</li>',
      '\t<li>' + copy.barber + '</li>',
      '\t<li>' + copy.clothing + '</li>',
      '\t<li>' + copy.store + '</li>',
      '\t<li>' + copy.garage + '</li>',
      '</ul>',
      '',
      '<p>➝ ' + copy.storage + ': ' + safeStorage + '</p>',
      '',
      '<p>➝ ' + copy.coordinates + ': ' + safeCoordinates + '</p>'
    ].join('\n');
  }

  return {
    pt: build({
      name: 'Mansão',
      benefits: 'Benefícios da Mansão',
      tattoo: 'Blip de tatuagem',
      barber: 'Blip de barbearia',
      clothing: 'Blip de roupas',
      store: 'Loja de conveniência',
      garage: 'Garagem',
      storage: 'Armazenamento',
      coordinates: 'CDS'
    }),
    en: build({
      name: 'Mansion',
      benefits: 'Mansion Benefits',
      tattoo: 'Tattoo Shop Blip',
      barber: 'Barbershop Blip',
      clothing: 'Clothing Store Blip',
      store: 'Convenience Store',
      garage: 'Garage',
      storage: 'Storage',
      coordinates: 'Coordinates'
    }),
    es: build({
      name: 'Mansión',
      benefits: 'Beneficios de la Mansión',
      tattoo: 'Blip de tatuajes',
      barber: 'Blip de barbería',
      clothing: 'Blip de ropa',
      store: 'Tienda de conveniencia',
      garage: 'Garaje',
      storage: 'Almacenamiento',
      coordinates: 'Coordenadas'
    })
  };
}

function standardMansionNameTranslations_(value) {
  var text = normalizeCatalogTextEncoding_(String(value || '').trim());
  var number = extractMansionNumber_(text);
  if (!number) return null;

  var padded = number < 10 ? '0' + number : String(number);
  return {
    pt: '👑 Mansão ' + padded,
    en: '👑 Mansion ' + padded,
    es: '👑 Mansión ' + padded
  };
}

function completeCatalogTextTranslations_(
  value,
  sourceLanguage
) {
  var text = String(value || '').trim();
  var source = normalizeContentLanguage_(sourceLanguage);

  if (!text) {
    return {
      pt: '',
      en: '',
      es: ''
    };
  }

  var standardMansionName = standardMansionNameTranslations_(text);
  if (standardMansionName) {
    return standardMansionName;
  }

  var translations = translateCatalogText_(text, source);
  translations[source] = translations[source] || text;

  if (!translations.pt || !translations.en || !translations.es) {
    var fallback = translateCatalogTextAuto_(text);
    translations.pt = translations.pt || fallback.pt || '';
    translations.en = translations.en || fallback.en || '';
    translations.es = translations.es || fallback.es || '';
  }

  translations[source] = translations[source] || text;

  if (!translations.pt || !translations.en || !translations.es) {
    throw new Error(
      'Nao foi possivel traduzir o nome do produto para PT, EN e ES.'
    );
  }

  return translations;
}

function completeCatalogHtmlTranslations_(
  value,
  sourceLanguage
) {
  var html = sanitizeHtml_(value || '');
  var source = normalizeContentLanguage_(sourceLanguage);

  if (!html) {
    return {
      pt: '',
      en: '',
      es: ''
    };
  }

  var standardMansionDescription = standardMansionDescriptionTranslations_(html);
  if (standardMansionDescription) {
    return standardMansionDescription;
  }

  var translations = translateCatalogHtml_(html, source);
  translations[source] = translations[source] || html;

  if (!translations.pt || !translations.en || !translations.es) {
    var fallback = translateCatalogHtmlAuto_(html);
    translations.pt = translations.pt || fallback.pt || '';
    translations.en = translations.en || fallback.en || '';
    translations.es = translations.es || fallback.es || '';
  }

  translations[source] = translations[source] || html;

  if (!translations.pt || !translations.en || !translations.es) {
    throw new Error(
      'Nao foi possivel traduzir a descricao do produto para PT, EN e ES.'
    );
  }

  return translations;
}

function hasCompleteCatalogHtmlTranslations_(translations) {
  translations = translations || {};
  return Boolean(
    sanitizeHtml_(translations.pt || '').trim() &&
    sanitizeHtml_(translations.en || '').trim() &&
    sanitizeHtml_(translations.es || '').trim()
  );
}

function sameCatalogHtml_(
  value
) {
  var html = sanitizeHtml_(value || '');

  return {
    pt: html,
    en: html,
    es: html
  };
}


function sameCatalogText_(
  value
) {
  var text = String(
    value || ''
  ).trim();

  return {
    pt: text,
    en: text,
    es: text
  };
}


function addPriceIfValid_(
  target,
  currency,
  rawValue
) {
  if (
    rawValue === '' ||
    rawValue === null ||
    rawValue === undefined
  ) {
    return;
  }

  var value = Number(rawValue);

  if (
    isFinite(value) &&
    value > 0
  ) {
    target[currency] = value;
  }
}


function priceCellValue_(
  value
) {
  return (
    value === undefined ||
    value === null ||
    value === ''
  )
    ? ''
    : Number(value);
}

function cleanCatalogText_(value) {
  var localized = parseLocalizedValue_(value);
  if (localized.br || localized.en || localized.es) {
    return localized.br || localized.en || localized.es;
  }
  return String(value || '').trim();
}

function parseJsonObject_(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string') return null;
  var text = value.trim();
  if (!text || text.charAt(0) !== '{') return null;

  try {
    var parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch (error) {
    return null;
  }
}

function firstText_() {
  for (var i = 0; i < arguments.length; i++) {
    var value = arguments[i];
    if (value === undefined || value === null) continue;
    var text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function parseLocalizedValue_(value) {
  var parsed = parseJsonObject_(value);
  if (!parsed) {
    return { br: '', en: '', es: '' };
  }

  return {
    br: firstText_(parsed.br, parsed.BR, parsed.pt, parsed.PT, parsed.titleBR, parsed.titlePT, parsed.nameBR, parsed.namePT),
    en: firstText_(parsed.en, parsed.EN, parsed.titleEN, parsed.nameEN),
    es: firstText_(parsed.es, parsed.ES, parsed.titleES, parsed.nameES)
  };
}

function localizedFieldText_(value, language) {
  var parsed = parseLocalizedValue_(value);
  var localized = language === 'pt'
    ? parsed.br
    : language === 'en'
      ? parsed.en
      : parsed.es;

  if (localized) return localized;

  var plain = String(value || '').trim();
  return parseJsonObject_(plain) ? '' : plain;
}

function localizedRowValues_(row, field) {
  row = row || {};
  var parsedBase = parseLocalizedValue_(row[field]);
  var parsedTranslations = parseLocalizedValue_(row.translations);

  var br = field === 'title'
    ? firstText_(localizedFieldText_(row.titleBR, 'pt'), localizedFieldText_(row.titlePT, 'pt'), parsedBase.br, parsedTranslations.br)
    : firstText_(localizedFieldText_(row.nameBR, 'pt'), localizedFieldText_(row.namePT, 'pt'), parsedBase.br, parsedTranslations.br);

  var en = field === 'title'
    ? firstText_(localizedFieldText_(row.titleEN, 'en'), parsedBase.en, parsedTranslations.en)
    : firstText_(localizedFieldText_(row.nameEN, 'en'), parsedBase.en, parsedTranslations.en);

  var es = field === 'title'
    ? firstText_(localizedFieldText_(row.titleES, 'es'), parsedBase.es, parsedTranslations.es)
    : firstText_(localizedFieldText_(row.nameES, 'es'), parsedBase.es, parsedTranslations.es);

  var plainBase = String(row[field] || '').trim();
  if (!parseJsonObject_(plainBase)) {
    br = br || plainBase;
  }

  return normalizeCatalogLiteralTranslations_({
    br: br || en || es || '',
    en: en || br || es || '',
    es: es || br || en || ''
  });
}

function repairCatalogGlossaryTranslations() {
  assertConfigured_();

  return withLock_(function () {
    var updated = 0;
    var categories = readTable_('Categories');
    var products = readProducts_();

    categories.forEach(function (category) {
      var names = normalizeCatalogLiteralTranslations_(localizedRowValues_(category, 'title'));
      var before = [category.title, category.titleBR, category.titleEN, category.titleES].join('\n');
      var after = [names.br, names.br, names.en, names.es].join('\n');

      if (before !== after) {
        category.title = names.br;
        category.titleBR = names.br;
        category.titleEN = names.en;
        category.titleES = names.es;
        category.updatedAt = now_();
        updated += 1;
      }
    });

    products.forEach(function (product) {
      var names = normalizeCatalogLiteralTranslations_(localizedRowValues_(product, 'name'));
      var before = [product.name, product.nameBR, product.nameEN, product.nameES].join('\n');
      var after = [names.br, names.br, names.en, names.es].join('\n');

      if (before !== after) {
        product.name = names.br;
        product.nameBR = names.br;
        product.nameEN = names.en;
        product.nameES = names.es;
        product.updatedAt = now_();
        updated += 1;
      }
    });

    if (updated) {
      writeTable_('Categories', categories);
      writeProducts_(products);
      bumpCatalogRevision_();
    }

    return {
      success: true,
      updated: updated,
      revision: getCatalogRevision_()
    };
  });
}

function stripHtmlForCompare_(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function localizedDescriptionValues_(row) {
  row = row || {};

  var pt = sanitizeHtml_(row.descriptionHtmlBR || row.descriptionHtmlPT || row.descriptionHtml || row.description || '');
  var en = sanitizeHtml_(row.descriptionHtmlEN || '');
  var es = sanitizeHtml_(row.descriptionHtmlES || '');

  return {
    pt: pt || en || es || '',
    en: en || pt || es || '',
    es: es || pt || en || ''
  };
}

function rawSheetRows_(sheet) {
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow < 1 || lastColumn < 1) return { headers: [], rows: [] };

  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (header) {
    return String(header || '').trim();
  });

  if (lastRow < 2) return { headers: headers, rows: [] };

  var values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  var rows = values.filter(function (row) {
    return row.some(function (value) { return value !== '' && value !== null; });
  }).map(function (row) {
    var object = {};
    headers.forEach(function (header, index) {
      if (header) object[header] = row[index];
    });
    return object;
  });

  return { headers: headers, rows: rows };
}

function rewriteRawSheet_(sheet, headers, rows) {
  sheet.clearContents();

  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  if (rows.length) {
    var values = rows.map(function (row) {
      return headers.map(function (header) {
        var value = row[header];
        return value === undefined || value === null ? '' : value;
      });
    });
    sheet.getRange(2, 1, values.length, headers.length).setValues(values);
  }

  var excessColumns = sheet.getMaxColumns() - headers.length;
  if (excessColumns > 0) {
    sheet.deleteColumns(headers.length + 1, excessColumns);
  }
}

function legacyPrice_(row, code) {
  var direct = row['amount' + code];
  if (direct !== undefined && direct !== null && direct !== '' && isFinite(Number(direct))) {
    return Number(direct);
  }

  var parsedPrices = parseJsonObject_(row.prices) || {};
  var parsed = parsedPrices[code];
  if (parsed !== undefined && parsed !== null && parsed !== '' && isFinite(Number(parsed))) {
    return Number(parsed);
  }

  var legacyCurrency = String(row.currency || '').toUpperCase();
  var legacyAmount = row.amount;
  if (
    legacyAmount !== undefined &&
    legacyAmount !== null &&
    legacyAmount !== '' &&
    isFinite(Number(legacyAmount)) &&
    (legacyCurrency === code || (!legacyCurrency && code === 'BRL'))
  ) {
    return Number(legacyAmount);
  }

  return '';
}

function looksLikeIsoDate_(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(String(value || '').trim());
}

function repairShiftedCategoryRow_(row) {
  row = row || {};

  if (looksLikeIsoDate_(row.title) && row.createdAt && !looksLikeIsoDate_(row.createdAt)) {
    return {
      id: row.id,
      cityId: row.cityId,
      title: row.createdAt,
      icon: row.title || '',
      order: row.icon,
      createdAt: row.order,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
      titleBR: row.titleBR,
      titleEN: row.titleEN,
      titleES: row.titleES
    };
  }

  return row;
}

function repairShiftedProductRow_(row) {
  row = row || {};

  if (looksLikeIsoDate_(row.name) && row.createdAt && !looksLikeIsoDate_(row.createdAt)) {
    return {
      id: row.id,
      categoryId: row.categoryId,
      name: row.createdAt,
      order: row.name || '',
      createdAt: row.order,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
      nameBR: row.nameBR,
      nameEN: row.nameEN,
      nameES: row.nameES,
      amountBRL: row.amountBRL,
      amountUSD: row.amountUSD,
      amountGBP: row.amountGBP,
      amountEUR: row.amountEUR,
      descriptionHtml: row.descriptionHtml,
      descriptionHtmlBR: row.descriptionHtmlBR,
      descriptionHtmlEN: row.descriptionHtmlEN,
      descriptionHtmlES: row.descriptionHtmlES
    };
  }

  return row;
}

function migrateCatalogSchema_() {
  var spreadsheet = getSpreadsheet_();

  var citySheet = spreadsheet.getSheetByName('Cities');
  if (!citySheet) citySheet = spreadsheet.insertSheet('Cities');
  var cityRaw = rawSheetRows_(citySheet);
  var cities = cityRaw.rows.map(function (row, index) {
    return {
      id: row.id || Utilities.getUuid(),
      name: cleanCatalogText_(row.name) || defaultCityName_(),
      order: row.order === '' || row.order === undefined ? index : Number(row.order),
      createdAt: row.createdAt || now_(),
      updatedAt: row.updatedAt || row.createdAt || now_(),
      updatedBy: row.updatedBy || ''
    };
  });
  var defaultCityId = ensureDefaultCity_(cities);
  normalizeOrders_(cities);
  rewriteRawSheet_(citySheet, TABLES.Cities, cities);

  var categorySheet = spreadsheet.getSheetByName('Categories');
  if (!categorySheet) categorySheet = spreadsheet.insertSheet('Categories');
  var categoryRaw = rawSheetRows_(categorySheet);
  var categories = categoryRaw.rows.map(function (row) {
    row = repairShiftedCategoryRow_(row);
    var names = localizedRowValues_(row, 'title');
    var cityId = row.cityId || defaultCityId;
    if (findIndexById_(cities, cityId) === -1) cityId = defaultCityId;
    return {
      id: row.id || Utilities.getUuid(),
      cityId: cityId,
      cityName: '',
      title: names.br,
      icon: row.icon || 'Package',
      order: row.order === '' || row.order === undefined ? 0 : Number(row.order),
      createdAt: row.createdAt || now_(),
      updatedAt: row.updatedAt || row.createdAt || now_(),
      updatedBy: row.updatedBy || '',
      titleBR: names.br,
      titleEN: names.en,
      titleES: names.es
    };
  });
  normalizeOrders_(categories);

  var productSheet = spreadsheet.getSheetByName('Products');
  if (!productSheet) productSheet = spreadsheet.insertSheet('Products');
  var productRaw = rawSheetRows_(productSheet);
  var products = productRaw.rows.map(function (row) {
    row = repairShiftedProductRow_(row);
    var parsedName = parseLocalizedValue_(row.name);
    var nameBR = firstText_(row.nameBR, row.namePT, parsedName.br, row.name);
    var nameEN = firstText_(row.nameEN, parsedName.en);
    var nameES = firstText_(row.nameES, parsedName.es);
    var descriptionBR = sanitizeHtml_(row.descriptionHtmlBR || row.descriptionHtmlPT || row.descriptionHtml || row.description || '');
    var descriptionEN = sanitizeHtml_(row.descriptionHtmlEN || '');
    var descriptionES = sanitizeHtml_(row.descriptionHtmlES || '');
    return {
      id: row.id || Utilities.getUuid(),
      categoryId: row.categoryId || '',
      cityName: '',
      categoryName: '',
      coordinates: row.coordinates || row.cds || row.CDS || '',
      storageWeight: row.storageWeight || row.weight || row.peso || row.Peso || '',
      importKey: row.importKey || '',
      name: nameBR,
      order: row.order === '' || row.order === undefined ? 0 : Number(row.order),
      createdAt: row.createdAt || now_(),
      updatedAt: row.updatedAt || row.createdAt || now_(),
      updatedBy: row.updatedBy || '',
      nameBR: nameBR,
      nameEN: nameEN,
      nameES: nameES,
      amountBRL: legacyPrice_(row, 'BRL'),
      amountUSD: legacyPrice_(row, 'USD'),
      amountGBP: legacyPrice_(row, 'GBP'),
      amountEUR: legacyPrice_(row, 'EUR'),
      descriptionHtml: descriptionBR,
      descriptionHtmlBR: descriptionBR,
      descriptionHtmlEN: descriptionEN,
      descriptionHtmlES: descriptionES
    };
  });
  normalizeProductOrders_(products);
  fillCatalogLinkNames_(cities, categories, products);
  rewriteRawSheet_(categorySheet, TABLES.Categories, categories);
  rewriteRawSheet_(productSheet, TABLES.Products, products);
}

function migrateCatalogSchema() {
  assertConfigured_();
  migrateCatalogSchema_();
  ensureAllSheets_();
  formatAllSheets();
  bumpCatalogRevision_();

  return {
    success: true,
    message: 'Estrutura migrada para nameBR/nameEN/nameES e amountBRL/amountUSD/amountGBP/amountEUR.'
  };
}

function upgradeCatalogData_() {
  migrateCatalogSchema_();
}


function translateExistingCatalog() {
  assertConfigured_();
  migrateCatalogSchema_();
  ensureAllSheets_();
  formatAllSheets();
  bumpCatalogRevision_();

  return {
    success: true,
    message: 'Categorias, produtos, traduÃ§Ãµes e quatro moedas foram corrigidos na mesma linha de cada ID.'
  };
}

function declareMansionProductOrders() {
  assertConfigured_();
  ensureAllSheets_();

  var products = readProducts_();
  var previousOrders = {};

  products.forEach(function (product) {
    previousOrders[product.id] = Number(product.order || 0);
  });

  normalizeProductOrders_(products);

  var changed = products.filter(function (product) {
    return Number(product.order || 0) !== previousOrders[product.id];
  }).length;

  if (changed) {
    writeProducts_(products);
    bumpCatalogRevision_();
  }

  formatAllSheets();

  return {
    success: true,
    changed: changed,
    message: changed
      ? 'Ordem dos produtos atualizada comecando em 1; mansoes seguem o numero do nome.'
      : 'Todos os produtos ja estavam com a ordem correta.'
  };
}

function declareProductOrders() {
  return declareMansionProductOrders();
}

function updateMansionProductImages() {
  assertConfigured_();
  ensureAllSheets_();

  return withLock_(function () {
    var cities = readTable_('Cities');
    var categories = readTable_('Categories');
    var products = readProducts_();
    var images = readTable_('ProductImages');
    var now = now_();

    var city = findCatalogRowByNormalizedName_(cities, 'name', 'Nobre');
    if (!city) {
      throw new Error('Cidade Nobre nao encontrada.');
    }

    var category = findCatalogCategoryByNormalizedName_(categories, city.id, 'Mansoes');
    if (!category) {
      throw new Error('Categoria Mansoes nao encontrada na cidade Nobre.');
    }

    var imageMap = mansionSiteAssetImageMap_();
    var updated = 0;
    var notFound = [];

    Object.keys(imageMap).forEach(function (numberText) {
      var number = Number(numberText);
      var product = findMansionProductByNumber_(products, category.id, number);
      if (!product) {
        notFound.push('Mansao ' + String(number).padStart(2, '0'));
        return;
      }

      replaceProductImages_(images, product.id, imageMap[numberText], now);
      product.updatedAt = now;
      product.updatedBy = 'update-mansion-images';
      updated += 1;
    });

    writeProducts_(products);
    writeTable_('ProductImages', images);
    bumpCatalogRevision_();
    formatAllSheets();

    return {
      success: true,
      updated: updated,
      notFound: notFound,
      message: 'Fotos novas das mansoes atualizadas pelo numero no nome do arquivo.'
    };
  });
}

function addMissingMansionProducts() {
  assertConfigured_();
  ensureAllSheets_();

  return withLock_(function () {
    var cities = readTable_('Cities');
    var categories = readTable_('Categories');
    var products = readProducts_();
    var images = readTable_('ProductImages');
    var now = now_();

    var city = findCatalogRowByNormalizedName_(cities, 'name', 'Nobre');
    if (!city) {
      throw new Error('Cidade Nobre nao encontrada.');
    }

    var category = findCatalogCategoryByNormalizedName_(categories, city.id, 'Mansoes');
    if (!category) {
      throw new Error('Categoria Mansoes nao encontrada na cidade Nobre.');
    }

    var rows = missingMansionSeedRows_();
    var created = 0;
    var updated = 0;
    var placeholderImageUrl = mansionQuestionPlaceholderImageUrl_();
    var siteImageMap = mansionSiteAssetImageMap_();

    rows.forEach(function (row) {
      var existing = findMansionProductByNumber_(products, category.id, row.number);
      var productId = existing ? existing.id : Utilities.getUuid();
      var names = mansionSeedNameTranslations_(row.number);
      var descriptions = mansionSeedDescriptionTranslations_(row);
      var amountBRL = isFinite(row.amountBRL) ? row.amountBRL : '';

      if (existing) {
        existing.categoryId = category.id;
        existing.coordinates = row.coordinates || existing.coordinates || '';
        existing.storageWeight = row.storageWeight || existing.storageWeight || '';
        existing.importKey = existing.importKey || mansionSeedImportKey_(row.number);
        existing.name = names.pt;
        existing.nameBR = names.pt;
        existing.nameEN = names.en;
        existing.nameES = names.es;
        existing.order = row.number;
        existing.updatedAt = now;
        existing.updatedBy = 'seed-missing-mansions';

        if (amountBRL !== '') existing.amountBRL = amountBRL;
        existing.descriptionHtml = descriptions.pt;
        existing.descriptionHtmlBR = descriptions.pt;
        existing.descriptionHtmlEN = descriptions.en;
        existing.descriptionHtmlES = descriptions.es;
        updated += 1;
      } else {
        products.push({
          id: productId,
          categoryId: category.id,
          coordinates: row.coordinates || '',
          storageWeight: row.storageWeight || '',
          importKey: mansionSeedImportKey_(row.number),
          name: names.pt,
          order: row.number,
          createdAt: now,
          updatedAt: now,
          updatedBy: 'seed-missing-mansions',
          nameBR: names.pt,
          nameEN: names.en,
          nameES: names.es,
          amountBRL: amountBRL,
          amountUSD: '',
          amountGBP: '',
          amountEUR: '',
          descriptionHtml: descriptions.pt,
          descriptionHtmlBR: descriptions.pt,
          descriptionHtmlEN: descriptions.en,
          descriptionHtmlES: descriptions.es,
          sold: false,
          soldOwnerName: '',
          soldOwnerDiscordId: ''
        });
        created += 1;
      }

      if (siteImageMap[row.number]) {
        replaceProductImages_(images, productId, siteImageMap[row.number], now);
      } else {
        upsertMansionPlaceholderImage_(images, productId, placeholderImageUrl, now);
      }
    });

    normalizeProductOrders_(products);
    fillCatalogLinkNames_(cities, categories, products);
    writeProducts_(products);
    writeTable_('ProductImages', images);
    bumpCatalogRevision_();
    formatAllSheets();

    return {
      success: true,
      created: created,
      updated: updated,
      total: rows.length,
      message: 'Mansoes faltantes criadas/atualizadas. Sem valor fica oculto no site, e sem foto usa imagem padrao com casa e ?.'
    };
  });
}

function missingMansionSeedRows_() {
  return [
    { number: 5, storageWeight: '40T' },
    { number: 6, storageWeight: '35T' },
    { number: 22, amountBRL: 3000, storageWeight: '30T' },
    { number: 25, amountBRL: 7000, coordinates: '-1471.22,64.77,53.19,5.67', storageWeight: '40T' },
    { number: 64, storageWeight: '20T' },
    { number: 66 },
    { number: 67 },
    { number: 70 },
    { number: 72, storageWeight: '40T' },
    { number: 74, storageWeight: '40T' },
    { number: 75, storageWeight: '40T' },
    { number: 76, storageWeight: '40T' },
    { number: 78 },
    { number: 81, storageWeight: '40T' },
    { number: 82, storageWeight: '40T' },
    { number: 83, storageWeight: '40T' },
    { number: 86, storageWeight: '40T' },
    { number: 88, storageWeight: '40T' },
    { number: 89, storageWeight: '40T' },
    { number: 90, storageWeight: '40T' },
    { number: 94, storageWeight: '40T' },
    { number: 118, storageWeight: '40T' }
  ];
}

function mansionSiteAssetImageMap_() {
  return {};
}

function mansionSeedNameTranslations_(number) {
  var padded = String(number).padStart(2, '0');
  return {
    pt: '👑 Mansão ' + padded,
    en: '👑 Mansion ' + padded,
    es: '👑 Mansión ' + padded
  };
}

function mansionSeedDescriptionTranslations_(row) {
  var names = mansionSeedNameTranslations_(row.number);
  var storage = row.storageWeight || '?';
  var coordinates = row.coordinates || '?';

  return {
    pt: mansionSeedDescriptionHtml_(names.pt, 'Benefícios da Mansão:', [
      'Blip de tatuagem',
      'Blip de barbearia',
      'Blip de roupas',
      'Loja de conveniência',
      'Garagem'
    ], 'Armazenamento:', storage, 'CDS:', coordinates),
    en: mansionSeedDescriptionHtml_(names.en, 'Mansion Benefits:', [
      'Tattoo Shop Blip',
      'Barbershop Blip',
      'Clothing Store Blip',
      'Convenience Store',
      'Garage'
    ], 'Storage:', storage, 'Coordinates:', coordinates),
    es: mansionSeedDescriptionHtml_(names.es, 'Beneficios de la Mansión:', [
      'Blip de tatuajes',
      'Blip de barbería',
      'Blip de ropa',
      'Tienda de conveniencia',
      'Garaje'
    ], 'Almacenamiento:', storage, 'Coordenadas:', coordinates)
  };
}

function mansionSeedDescriptionHtml_(name, benefitsLabel, benefits, storageLabel, storage, coordinatesLabel, coordinates) {
  return [
    '<p>' + escapeHtml_(name) + '</p>',
    '',
    '<p>➝ ' + benefitsLabel + '</p>',
    '',
    '<ul>',
    benefits.map(function (benefit) {
      return '\t<li>' + escapeHtml_(benefit) + '</li>';
    }).join('\n'),
    '</ul>',
    '',
    '<p>➝ ' + storageLabel + ' ' + escapeHtml_(storage) + '</p>',
    '',
    '<p>➝ ' + coordinatesLabel + ' ' + escapeHtml_(coordinates) + '</p>'
  ].join('\n');
}

function mansionSeedImportKey_(number) {
  return 'nobre-mansoes:' + String(number).padStart(2, '0');
}

function findCatalogRowByNormalizedName_(items, field, expected) {
  var normalizedExpected = normalizeSeedText_(expected);
  for (var i = 0; i < items.length; i += 1) {
    if (normalizeSeedText_(items[i][field]) === normalizedExpected) {
      return items[i];
    }
  }
  return null;
}

function findCatalogCategoryByNormalizedName_(categories, cityId, expected) {
  var normalizedExpected = normalizeSeedText_(expected);
  for (var i = 0; i < categories.length; i += 1) {
    var category = categories[i];
    if (
      String(category.cityId || '') === String(cityId || '') &&
      (
        normalizeSeedText_(category.title) === normalizedExpected ||
        normalizeSeedText_(category.titleBR) === normalizedExpected
      )
    ) {
      return category;
    }
  }
  return null;
}

function findMansionProductByNumber_(products, categoryId, number) {
  for (var i = 0; i < products.length; i += 1) {
    var product = products[i];
    if (String(product.categoryId || '') !== String(categoryId || '')) continue;
    if (mansionOrderFromProduct_(product) === number) return product;
  }
  return null;
}

function productHasImage_(images, productId) {
  return images.some(function (image) {
    return String(image.productId || '') === String(productId || '') && String(image.url || '').trim();
  });
}

function replaceProductImages_(images, productId, imageUrl, now) {
  for (var i = images.length - 1; i >= 0; i -= 1) {
    if (String(images[i].productId || '') === String(productId || '')) {
      images.splice(i, 1);
    }
  }

  images.push({
    id: Utilities.getUuid(),
    productId: productId,
    url: imageUrl,
    deleteUrl: '',
    order: 0,
    createdAt: now,
    mediaType: 'image',
    videoProvider: '',
    thumbnailUrl: ''
  });
}

function upsertMansionPlaceholderImage_(images, productId, placeholderImageUrl, now) {
  var hasAnyImage = false;

  for (var i = 0; i < images.length; i += 1) {
    var image = images[i];
    if (String(image.productId || '') !== String(productId || '')) continue;
    hasAnyImage = true;

    if (isMansionQuestionPlaceholderUrl_(image.url)) {
      image.url = placeholderImageUrl;
      image.thumbnailUrl = '';
      image.mediaType = 'image';
      image.videoProvider = '';
      return;
    }
  }

  if (!hasAnyImage) {
    images.push({
      id: Utilities.getUuid(),
      productId: productId,
      url: placeholderImageUrl,
      deleteUrl: '',
      order: 0,
      createdAt: now,
      mediaType: 'image',
      videoProvider: '',
      thumbnailUrl: ''
    });
  }
}

function isMansionQuestionPlaceholderUrl_(url) {
  var value = String(url || '');
  if (/mansion-placeholder\.png/i.test(value)) return true;
  if (!/^data:image\/svg\+xml/i.test(value)) return false;
  var decoded = decodeURIComponentSafe_(value);
  return /MANSION_PLACEHOLDER|IMAGEM EM BREVE/i.test(decoded);
}

function decodeURIComponentSafe_(value) {
  try {
    return decodeURIComponent(String(value || ''));
  } catch (error) {
    return String(value || '');
  }
}

function normalizeSeedText_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mansionQuestionPlaceholderImageUrl_() {
  return '';
}


/* =============================================================================
   PLANILHAS E FORMATAÃ‡ÃƒO
============================================================================= */

function assertConfigured_() {
  var id =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        'SPREADSHEET_ID'
      );

  if (!id) {
    throw new Error(
      'Execute setupProject() antes de usar a API.'
    );
  }
}


function formatAllSheets() {
  ensureAllSheets_();

  var spreadsheet =
    getSpreadsheet_();

  Object.keys(TABLES)
    .forEach(
      function (name) {
        var sheet =
          spreadsheet
            .getSheetByName(
              name
            );

        if (!sheet) {
          return;
        }

        formatSheet_(
          sheet,
          TABLES[name]
        );
      }
    );

  SpreadsheetApp.flush();

  Logger.log(
    'Todas as abas foram formatadas com sucesso.'
  );

  return {
    success: true,

    message:
      'Todas as abas foram formatadas com sucesso.'
  };
}


function ensureAllSheets_() {
  var spreadsheet =
    getSpreadsheet_();

  var legacyBackupSheet =
    spreadsheet
      .getSheetByName(
        'BACKUP'
      );

  if (
    legacyBackupSheet &&
    !spreadsheet.getSheetByName(
      'Backup'
    )
  ) {
    legacyBackupSheet
      .setName(
        'Backup'
      );
  }

  Object.keys(TABLES)
    .forEach(
      function (name) {
        var sheet =
          spreadsheet
            .getSheetByName(
              name
            );

        if (!sheet) {
          sheet =
            spreadsheet
              .insertSheet(
                name
              );
        }

        var headers =
          TABLES[name];

        if (
          sheet.getMaxColumns() <
          headers.length
        ) {
          sheet.insertColumnsAfter(
            sheet.getMaxColumns(),

            headers.length -
              sheet.getMaxColumns()
          );
        }

        if (
          shouldTrimColumnsForTable_(name) &&
          sheet.getMaxColumns() >
          headers.length
        ) {
          sheet.deleteColumns(
            headers.length + 1,
            sheet.getMaxColumns() -
              headers.length
          );
        }

        sheet
          .getRange(
            1,
            1,
            1,
            headers.length
          )
          .setValues([
            headers
          ]);

        formatSheet_(
          sheet,
          headers
        );

        if (
          name === 'Backup' &&
          headers.length >= 3
        ) {
          sheet.hideColumns(
            3
          );
        }
      }
    );

}


function formatSheet_(
  sheet,
  headers
) {
  var totalColumns =
    headers.length;

  var lastRow =
    Math.max(
      sheet.getLastRow(),
      1
    );

  if (
    sheet.getMaxColumns() <
    totalColumns
  ) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),

      totalColumns -
        sheet.getMaxColumns()
    );
  }

  sheet
    .getRange(
      1,
      1,
      1,
      totalColumns
    )
    .setValues([
      headers
    ]);

  var usedRange =
    sheet.getRange(
      1,
      1,
      lastRow,
      totalColumns
    );

  usedRange
    .setHorizontalAlignment(
      'center'
    )
    .setVerticalAlignment(
      'middle'
    )
    .setWrapStrategy(
      SpreadsheetApp
        .WrapStrategy
        .WRAP
    )
    .setBorder(
      true,
      true,
      true,
      true,
      true,
      true,
      '#000000',
      SpreadsheetApp
        .BorderStyle
        .SOLID
    );

  var headerRange =
    sheet.getRange(
      1,
      1,
      1,
      totalColumns
    );

  headerRange
    .setFontWeight(
      'bold'
    )
    .setFontColor(
      '#000000'
    )
    .setBackground(
      '#01E6FF'
    )
    .setFontSize(
      11
    )
    .setHorizontalAlignment(
      'center'
    )
    .setVerticalAlignment(
      'middle'
    )
    .setWrapStrategy(
      SpreadsheetApp
        .WrapStrategy
        .WRAP
    )
    .setBorder(
      true,
      true,
      true,
      true,
      true,
      true,
      '#7A5800',
      SpreadsheetApp
        .BorderStyle
        .SOLID_MEDIUM
    );

  if (lastRow > 1) {
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        totalColumns
      )
      .setFontWeight(
        'normal'
      )
      .setFontColor(
        '#000000'
      )
      .setBackground(
        '#FFFFFF'
      )
      .setHorizontalAlignment(
        'center'
      )
      .setVerticalAlignment(
        'middle'
      )
      .setWrapStrategy(
        SpreadsheetApp
          .WrapStrategy
          .WRAP
      );
  }

  headers.forEach(
    function (
      header,
      index
    ) {
      sheet.setColumnWidth(
        index + 1,

        getColumnWidth_(
          header
        )
      );
    }
  );

  sheet.setFrozenRows(1);

  sheet.setRowHeight(
    1,
    42
  );

  if (lastRow > 1) {
    sheet.autoResizeRows(
      2,
      lastRow - 1
    );
  }

  sheet.setHiddenGridlines(
    false
  );
}


function getColumnWidth_(header) {
  var widths = {
    id: 260,
    userId: 260,
    cityId: 260,
    categoryId: 260,
    productId: 260,
    importKey: 280,
    updatedBy: 260,
    token: 420,
    passwordHash: 360,
    passwordSalt: 300,
    name: 240,
    cityName: 220,
    categoryName: 260,
    coordinates: 300,
    storageWeight: 150,
    descriptionHtml: 520,
    descriptionHtmlBR: 520,
    descriptionHtmlEN: 520,
    descriptionHtmlES: 520,
    nameBR: 260,
    nameEN: 260,
    nameES: 260,
    title: 240,
    titleBR: 260,
    titleEN: 260,
    titleES: 260,
    username: 220,
    icon: 180,
    role: 150,
    status: 150,
    amountBRL: 150,
    amountUSD: 150,
    amountGBP: 150,
    amountEUR: 150,
    order: 110,
    url: 450,
    deleteUrl: 450,
    key: 220,
    value: 350,
    createdAt: 220,
    updatedAt: 220,
    expiresAt: 220,
    lastSeenAt: 220
  };

  return widths[header] || 220;
}


/* =============================================================================
   LEITURA E GRAVAÃ‡ÃƒO DAS ABAS
============================================================================= */

function getSpreadsheet_() {
  var properties =
    PropertiesService
      .getScriptProperties();

  var id =
    properties
      .getProperty(
        'SPREADSHEET_ID'
      );

  if (id) {
    return SpreadsheetApp
      .openById(id);
  }

  var active =
    SpreadsheetApp
      .getActiveSpreadsheet();

  if (!active) {
    throw new Error(
      'Execute setupProject() antes de publicar o Apps Script.'
    );
  }

  properties.setProperty(
    'SPREADSHEET_ID',
    active.getId()
  );

  return active;
}


function readTable_(name) {
  var sheet =
    getSpreadsheet_()
      .getSheetByName(name);

  if (!sheet) {
    throw new Error(
      'Aba ausente: ' +
      name
    );
  }

  var headers =
    TABLES[name];

  var lastRow =
    sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  var lastColumn =
    Math.max(
      sheet.getLastColumn(),
      headers.length
    );

  var sheetHeaders =
    sheet
      .getRange(
        1,
        1,
        1,
        lastColumn
      )
      .getValues()[0]
      .map(function (header) {
        return String(header || '').trim();
      });

  var headerIndexes = {};

  sheetHeaders.forEach(
    function (
      header,
      index
    ) {
      if (header && headerIndexes[header] === undefined) {
        headerIndexes[header] = index;
      }
    }
  );

  var values =
    sheet.getRange(
      2,
      1,
      lastRow - 1,
      lastColumn
    ).getValues();

  return values
    .filter(
      function (row) {
        return row.some(
          function (value) {
            return (
              value !== '' &&
              value !== null
            );
          }
        );
      }
    )
    .map(
      function (row) {
        var object = {};

        headers.forEach(
          function (
            header
          ) {
            var index =
              headerIndexes[header];

            object[header] =
              index === undefined
                ? ''
                : row[index];
          }
        );

        return object;
      }
    );
}


function writeTable_(
  name,
  objects
) {
  var sheet =
    getSpreadsheet_()
      .getSheetByName(name);

  if (!sheet) {
    throw new Error(
      'Aba ausente: ' +
      name
    );
  }

  var headers =
    TABLES[name];

  if (
    sheet.getMaxColumns() <
    headers.length
  ) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      headers.length - sheet.getMaxColumns()
    );
  }

  if (
    shouldTrimColumnsForTable_(name) &&
    sheet.getMaxColumns() >
    headers.length
  ) {
    sheet.deleteColumns(
      headers.length + 1,
      sheet.getMaxColumns() - headers.length
    );
  }

  sheet
    .getRange(
      1,
      1,
      1,
      headers.length
    )
    .setValues([
      headers
    ]);

  var clearRows =
    Math.max(
      sheet.getLastRow() - 1,
      0
    );

  if (clearRows > 0) {
    sheet
      .getRange(
        2,
        1,
        clearRows,
        headers.length
      )
      .clearContent();
  }

  if (objects.length) {
    var values =
      objects.map(
        function (object) {
          return headers.map(
            function (header) {
              var value =
                object[header];

              return (
                value === undefined ||
                value === null
                  ? ''
                  : value
              );
            }
          );
        }
      );

    sheet
      .getRange(
        2,
        1,
        values.length,
        headers.length
      )
      .setValues(values);
  }

  formatSheet_(
    sheet,
    headers
  );
}


/* =============================================================================
   LOCKS E UTILITÃRIOS
============================================================================= */

function withLock_(callback) {
  var lock =
    LockService
      .getScriptLock();

  lock.waitLock(30000);

  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}


function parseBody_(event) {
  if (
    !event ||
    !event.postData ||
    !event.postData.contents
  ) {
    return {};
  }

  try {
    return JSON.parse(
      event.postData.contents
    );
  } catch (error) {
    throw new Error(
      'JSON invÃ¡lido no corpo da requisiÃ§Ã£o.'
    );
  }
}


function json_(payload) {
  return ContentService
    .createTextOutput(
      JSON.stringify(payload)
    )
    .setMimeType(
      ContentService
        .MimeType
        .JSON
    );
}


function now_() {
  return new Date()
    .toISOString();
}


function errorMessage_(error) {
  return (
    error &&
    error.message
      ? String(
          error.message
        )
      : 'Erro interno no Apps Script.'
  );
}


function findIndexById_(
  items,
  id
) {
  for (
    var i = 0;
    i < items.length;
    i++
  ) {
    if (
      String(
        items[i].id
      ) === String(id)
    ) {
      return i;
    }
  }

  return -1;
}


function normalizeOrders_(
  items
) {
  items.sort(
    orderSorter_
  );

  items.forEach(
    function (
      item,
      index
    ) {
      item.order =
        index;
    }
  );
}


function assignOrdersInCurrentSequence_(
  items
) {
  items.forEach(
    function (
      item,
      index
    ) {
      item.order = index;
    }
  );
}


function normalizeProductOrders_(
  products
) {
  var groups = {};

  products.forEach(
    function (product) {
      if (
        !groups[
          product.categoryId
        ]
      ) {
        groups[
          product.categoryId
        ] = [];
      }

      groups[
        product.categoryId
      ].push(product);
    }
  );

  Object.keys(groups)
    .forEach(
      function (categoryId) {
        groups[
          categoryId
        ]
          .sort(
            orderSorter_
          )
          .forEach(
            function (
              product,
              index
            ) {
              product.order =
                index + 1;
            }
          );
      }
    );

  applyMansionNameOrders_(products);
}


function normalizeOptionalOrder_(value) {
  if (value === undefined || value === null || value === '') {
    return NaN;
  }

  var order = Number(value);
  return isFinite(order) && order >= 1
    ? Math.floor(order)
    : NaN;
}


function mansionOrderFromProduct_(product) {
  var values = [
    product && product.name,
    product && product.nameBR,
    product && product.nameEN,
    product && product.nameES,
    product && product.descriptionHtml,
    product && product.descriptionHtmlBR,
    product && product.descriptionHtmlEN,
    product && product.descriptionHtmlES
  ];

  for (var i = 0; i < values.length; i += 1) {
    var text = String(values[i] || '')
      .replace(/<[^>]+>/g, ' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    var match = text.match(/(?:mansao|mansion)\s*0*([0-9]+)/i);
    if (match && match[1]) {
      return Number(match[1]);
    }
  }

  return NaN;
}


function applyMansionNameOrders_(products) {
  products.forEach(function (product) {
    var mansionOrder = mansionOrderFromProduct_(product);
    if (isFinite(mansionOrder)) {
      product.order = mansionOrder;
    }
  });
}


function orderSorter_(a, b) {
  return (
    Number(
      a.order || 0
    ) -
    Number(
      b.order || 0
    )
  );
}


function getCatalogRevision_() {
  return Number(
    PropertiesService
      .getScriptProperties()
      .getProperty(
        'CATALOG_REVISION'
      ) || '1'
  );
}


function bumpCatalogRevision_() {
  var properties =
    PropertiesService
      .getScriptProperties();

  var next =
    getCatalogRevision_() +
    1;

  properties.setProperty(
    'CATALOG_REVISION',
    String(next)
  );

  writeMetaValue_(
    'catalogRevision',
    next
  );

  return next;
}


function bumpAuthRevision_() {
  var properties =
    PropertiesService
      .getScriptProperties();

  var next =
    Number(
      properties.getProperty(
        'AUTH_REVISION'
      ) || '1'
    ) + 1;

  properties.setProperty(
    'AUTH_REVISION',
    String(next)
  );

  return next;
}


function writeMetaValue_(
  key,
  value
) {
  var meta =
    readTable_('Meta');

  var item =
    meta.find(
      function (row) {
        return (
          row.key === key
        );
      }
    );

  if (item) {
    item.value =
      value;
  } else {
    meta.push({
      key: key,
      value: value
    });
  }

  writeTable_(
    'Meta',
    meta
  );
}


function hashPassword_(
  password,
  salt
) {
  var bytes =
    Utilities.computeDigest(
      Utilities
        .DigestAlgorithm
        .SHA_256,

      String(salt) +
        ':' +
        String(password),

      Utilities
        .Charset
        .UTF_8
    );

  return Utilities
    .base64EncodeWebSafe(
      bytes
    );
}


function constantTimeEqual_(
  left,
  right
) {
  left = String(
    left || ''
  );

  right = String(
    right || ''
  );

  var mismatch =
    left.length ^
    right.length;

  var length =
    Math.max(
      left.length,
      right.length
    );

  for (
    var i = 0;
    i < length;
    i++
  ) {
    mismatch |=
      (
        left.charCodeAt(
          i %
          Math.max(
            left.length,
            1
          )
        ) || 0
      ) ^
      (
        right.charCodeAt(
          i %
          Math.max(
            right.length,
            1
          )
        ) || 0
      );
  }

  return mismatch === 0;
}


function createToken_() {
  var raw =
    Utilities.getUuid() +
    ':' +
    Utilities.getUuid() +
    ':' +
    Date.now();

  var bytes =
    Utilities.computeDigest(
      Utilities
        .DigestAlgorithm
        .SHA_256,

      raw,

      Utilities
        .Charset
        .UTF_8
    );

  return Utilities
    .base64EncodeWebSafe(
      bytes
    )
    .replace(
      /=+$/g,
      ''
    );
}


function cleanExpiredSessions_(
  sessions
) {
  var now =
    Date.now();

  return sessions.filter(
    function (session) {
      return (
        new Date(
          session.expiresAt
        ).getTime() > now
      );
    }
  );
}


function sessionCacheKey_(
  token
) {
  var revision =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        'AUTH_REVISION'
      ) || '1';

  return (
    'session:' +
    revision +
    ':' +
    token
  );
}


function cacheSession_(
  token,
  user
) {
  CacheService
    .getScriptCache()
    .put(
      sessionCacheKey_(
        token
      ),

      JSON.stringify(
        user
      ),

      60
    );
}

