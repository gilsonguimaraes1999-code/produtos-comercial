import fs from 'node:fs';
import vm from 'node:vm';

const API = 'https://script.google.com/macros/s/AKfycbyRRobZPHqB5OEeLsWNEYDYNKPf7Cd9CDQiVwBDVP74E07VK-kder0LlIsrJU7jq6Iv/exec';
const USERNAME = 'Owner';
const PASSWORD = 'SantaGroup@2026';

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function request(action, payload = {}, token = undefined) {
  const response = await fetch(API, {
    method: 'POST',
    body: JSON.stringify({ action, token, ...payload }),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Resposta inválida em ${action}: ${text.slice(0, 300)}`);
  }
  if (!data.success) {
    throw new Error(`${action} falhou: ${data.message || JSON.stringify(data).slice(0, 300)}`);
  }
  return data.data ?? data;
}

function loadMansionRows() {
  const code = fs.readFileSync('Code.gs', 'utf8');
  const context = { console };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: 'Code.gs' });

  return context.parseMansionSourceRows_()
    .map((row) => {
      const price = context.parseMansionPrice_(row.rawPrice);
      const valid = row.name &&
        context.validMansionCoordinates_(row.coordinates) &&
        price !== null &&
        context.validMansionStorageWeight_(row.storageWeight);
      if (!valid) return null;
      return {
        ...row,
        price,
        importKey: `nobre-mansoes:${context.mansionSlug_(`${row.sourceName}:${row.coordinates}`)}`,
        descriptionHtml: context.mansionDescriptionHtml_(row.name, row.coordinates, row.storageWeight),
      };
    })
    .filter(Boolean);
}

function findCity(catalog, name) {
  return (catalog.cities || []).find((city) => normalize(city.name) === normalize(name));
}

function findCategory(catalog, cityId, title) {
  return (catalog.categories || []).find((category) =>
    String(category.cityId || '') === String(cityId || '') &&
    normalize(category.title) === normalize(title)
  );
}

function productHasCoordinates(product, coordinates) {
  const text = `${product.descriptionHtml || ''} ${product.coordinates || ''}`;
  return text.includes(coordinates);
}

async function main() {
  const rows = loadMansionRows();
  console.log(`Linhas válidas para criar pelo site: ${rows.length}`);

  const login = await request('login', { username: USERNAME, password: PASSWORD });
  const token = login.token;
  if (!token) throw new Error('Login não retornou token.');

  let sync = await request('sync', { sinceRevision: -1 }, token);
  let catalog = sync.catalog;

  let city = findCity(catalog, 'Nobre');
  if (!city) {
    const result = await request('saveCity', { city: { name: 'Nobre' } }, token);
    catalog = result.catalog;
    city = findCity(catalog, 'Nobre');
  }
  if (!city) throw new Error('Não foi possível criar/localizar a cidade Nobre.');

  let category = findCategory(catalog, city.id, 'Mansões');
  if (!category) {
    const result = await request('saveCategory', {
      category: {
        cityId: city.id,
        title: 'Mansões',
        icon: 'Home',
        sourceLanguage: 'pt',
      },
    }, token);
    catalog = result.catalog;
    category = findCategory(catalog, city.id, 'Mansões');
  }
  if (!category) throw new Error('Não foi possível criar/localizar a categoria Mansões.');

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const currentProducts = catalog.products || [];
    const existing = currentProducts.find((product) =>
      String(product.categoryId || '') === String(category.id || '') &&
      (
        product.importKey === row.importKey ||
        (product.name === row.name && productHasCoordinates(product, row.coordinates))
      )
    );

    const payload = {
      ...(existing?.id ? { id: existing.id } : {}),
      categoryId: category.id,
      name: row.name,
      coordinates: row.coordinates,
      storageWeight: row.storageWeight,
      importKey: row.importKey,
      descriptionHtml: row.descriptionHtml,
      sourceLanguage: 'pt',
      autoTranslate: false,
      syncNameAcrossLanguages: true,
      prices: { BRL: row.price },
      amount: row.price,
      currency: 'BRL',
      images: [],
    };

    const result = await request('saveProduct', { product: payload }, token);
    catalog = result.catalog;
    if (existing?.id) updated++;
    else created++;

    console.log(`${created + updated}/${rows.length} ${existing?.id ? 'atualizado' : 'criado'}: ${row.name} (${row.storageWeight})`);
  }

  const finalCategory = findCategory(catalog, city.id, 'Mansões');
  const finalProducts = (catalog.products || []).filter((product) => String(product.categoryId) === String(finalCategory?.id));

  console.log(JSON.stringify({
    city: city.name,
    category: finalCategory?.title,
    validRows: rows.length,
    created,
    updated,
    skipped,
    finalProductsInCategory: finalProducts.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
