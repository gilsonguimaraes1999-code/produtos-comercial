import fs from 'node:fs/promises';
import path from 'node:path';

const API = 'https://script.google.com/macros/s/AKfycbyRRobZPHqB5OEeLsWNEYDYNKPf7Cd9CDQiVwBDVP74E07VK-kder0LlIsrJU7jq6Iv/exec';
const IMGBB_KEY = 'fc7a049d22afc785b615ecde51392119';
const IMGBB_ENDPOINT = 'https://api.imgbb.com/1/upload';
const USERNAME = 'Owner';
const PASSWORD = 'SantaGroup@2026';
const IMAGE_DIR = 'C:\\Users\\gilso\\Pictures\\Mansoes';

const ROWS = [
  [3, '-823.95,268.07,86.19,51.03', 'R$ 3.000,00', '25T'],
  [4, '-770.53,309.17,85.7,263.63', 'R$ 5.000,00', '35T'],
  [9, '-106.14,844.21,235.66,172.92', 'R$ 4.000,00', '30T'],
  [13, '1989.79,3369.7,55.96,22.68', 'R$ 5.000,00', '25T'],
  [25, '-1471.22,64.77,53.19,5.67', 'Facção', '40T'],
  [27, '-225.67,565.23,187.71,235.28', 'R$ 2.500,00', '25T'],
  [29, '-2568.85,3749.23,27.53,303.31', 'R$ 4.000,00', '30T'],
  [31, '-275.86,-729.36,125.48,260.79', 'R$ 5.000,00', '35T'],
  [46, '-158.74,910.22,235.59,252.29', 'R$ 3.500,00', '25T'],
  [53, '1177.02,867.09,144.0,82.21', 'R$ 3.500,00', '40T'],
  [56, '-1975.06,-229.37,95.56,121.89', 'R$ 6.000,00', '40T'],
  [68, '-818.4,-714.85,123.27,59.53', 'R$ 7.000,00', '40T'],
  [73, '-2874.42,3584.67,20.57,0.0', 'R$ 3.500,00', '40T'],
  [91, '-670.54,6360.52,13.29,25.52', 'R$ 3.500,00', '40T'],
  [93, '-3020.57,3431.78,9.72,70.87', 'R$ 3.500,00', '40T'],
  [96, '-3545.94,4626.48,22.01,257.96', 'R$ 10.000,00', '40T'],
  [97, '2307.62,4886.89,41.81,231.22', 'SKORPION', '40T'],
].map(([number, coordinates, rawPrice, storage]) => ({
  number,
  name: `👑 Mansão ${String(number).padStart(2, '0')}`,
  coordinates,
  rawPrice,
  price: parseBrl(rawPrice),
  storage,
}));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseBrl(value) {
  const text = String(value || '').trim();
  const match = text.match(/R\$\s*([0-9.]+),([0-9]{2})/i);
  if (!match) return null;
  return Number(`${match[1].replace(/\./g, '')}.${match[2]}`);
}

function mansionNumber(value) {
  const match = String(value || '').match(/mans[aã]o\s*0*(\d+)/i) || String(value || '').match(/mansao\s*0*(\d+)/i);
  return match ? Number(match[1]) : null;
}

function descriptionHtml(row) {
  return [
    `<p>${escapeHtml(row.name)}</p>`,
    '',
    '<p>➝ Benefícios da Mansão:</p>',
    '',
    '<ul>',
    '\t<li>Blip de tatuagem</li>',
    '\t<li>Blip de barbearia</li>',
    '\t<li>Blip de roupas</li>',
    '\t<li>Loja de conveniência</li>',
    '\t<li>Garagem</li>',
    '</ul>',
    '',
    `<p>➝ Baú: ${escapeHtml(row.storage)}</p>`,
    '',
    `<p>➝ CDS: ${escapeHtml(row.coordinates)}</p>`,
  ].join('\n');
}

function textFromHtml(html = '') {
  return String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function productLooksDone(product, row) {
  const text = `${textFromHtml(product.descriptionHtml)} ${product.coordinates || ''}`;
  const prices = product.prices || {};
  const price = Number(prices.BRL ?? product.amount);
  return text.includes(row.coordinates)
    && /Benef/i.test(text)
    && text.includes(row.storage)
    && Number.isFinite(price)
    && Math.abs(price - row.price) < 0.001;
}

async function request(action, payload = {}, token = undefined, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 70000);
    try {
      const response = await fetch(API, {
        method: 'POST',
        body: JSON.stringify({ action, token, ...payload }),
        signal: controller.signal,
      });
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Resposta invalida em ${action}: ${text.slice(0, 300)}`);
      }
      if (!data.success) throw new Error(`${action} falhou: ${data.message || JSON.stringify(data).slice(0, 300)}`);
      return data.data ?? data;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(4000 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function findCity(catalog, name) {
  return (catalog.cities || []).find((city) => normalize(city.name) === normalize(name));
}

function findCategory(catalog, cityId, title) {
  return (catalog.categories || []).find((category) =>
    String(category.cityId || '') === String(cityId || '') &&
    normalize(category.title || category.titleBR) === normalize(title)
  );
}

function findMansionProduct(catalog, categoryId, row) {
  return (catalog.products || []).find((product) =>
    String(product.categoryId || '') === String(categoryId || '') &&
    mansionNumber(product.name || product.nameBR || '') === row.number
  );
}

function draftImages(product) {
  return (product?.images || []).map((image) => ({
    id: image.id,
    url: image.url,
    mediaType: image.mediaType || 'image',
    videoProvider: image.videoProvider,
    thumbnailUrl: image.thumbnailUrl,
  }));
}

async function collectImages() {
  const files = await fs.readdir(IMAGE_DIR);
  const imageByNumber = new Map();
  for (const file of files) {
    if (!/\.(png|jpe?g|webp)$/i.test(file)) continue;
    const number = mansionNumber(file);
    if (!number) continue;
    const fullPath = path.join(IMAGE_DIR, file);
    const previous = imageByNumber.get(number);
    if (!previous || file.startsWith('- ')) imageByNumber.set(number, fullPath);
  }
  return imageByNumber;
}

async function uploadImage(filePath, row) {
  const bytes = await fs.readFile(filePath);
  const body = new FormData();
  body.append('key', IMGBB_KEY);
  body.append('name', `Mansao-${String(row.number).padStart(2, '0')}`);
  body.append('image', bytes.toString('base64'));

  const response = await fetch(IMGBB_ENDPOINT, { method: 'POST', body });
  const data = await response.json();
  if (!response.ok || !data.success || !data.data?.url) {
    throw new Error(`ImgBB falhou para ${row.name}: ${data.error?.message || response.status}`);
  }

  return {
    url: data.data.url,
    deleteUrl: data.data.delete_url,
    thumbnailUrl: data.data.thumb?.url,
    mediaType: 'image',
  };
}

async function syncCatalog(token) {
  let sync = await request('sync', { sinceRevision: -1 }, token);
  if (!sync.catalog) sync = await request('sync', { sinceRevision: 0 }, token);
  if (!sync.catalog) throw new Error('Nao foi possivel sincronizar o catalogo.');
  return sync.catalog;
}

async function main() {
  const login = await request('login', { username: USERNAME, password: PASSWORD });
  const token = login.token;
  if (!token) throw new Error('Login nao retornou token.');

  let catalog = await syncCatalog(token);
  const city = findCity(catalog, 'Nobre');
  if (!city) throw new Error('Cidade Nobre nao encontrada.');
  const category = findCategory(catalog, city.id, 'Mansões');
  if (!category) throw new Error('Categoria Mansoes nao encontrada na cidade Nobre.');

  const invalidPrice = ROWS.filter((row) => row.price === null);
  const validRows = ROWS.filter((row) => row.price !== null);
  const imageByNumber = await collectImages();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const failed = [];

  for (const row of validRows) {
    catalog = await syncCatalog(token);
    const existing = findMansionProduct(catalog, category.id, row);
    if (existing && productLooksDone(existing, row)) {
      skipped += 1;
      console.log(`SKIP ${row.name}: ja estava no padrao.`);
      continue;
    }

    try {
      const existingImages = draftImages(existing);
      const filePath = imageByNumber.get(row.number);
      if (!existingImages.length && !filePath) throw new Error(`Imagem nao encontrada para ${row.name}.`);
      const images = existingImages.length ? existingImages : [await uploadImage(filePath, row)];

      const payload = {
        ...(existing?.id ? { id: existing.id } : {}),
        categoryId: category.id,
        name: row.name,
        coordinates: row.coordinates,
        storageWeight: row.storage,
        importKey: `nobre-mansoes:${row.number}`,
        descriptionHtml: descriptionHtml(row),
        sourceLanguage: 'pt',
        autoTranslate: false,
        syncNameAcrossLanguages: true,
        prices: { BRL: row.price },
        amount: row.price,
        currency: 'BRL',
        images,
      };

      const result = await request('saveProduct', { product: payload }, token, 2);
      catalog = result.catalog || catalog;
      if (existing?.id) updated += 1;
      else created += 1;
      console.log(`${created + updated}/${validRows.length} ${existing?.id ? 'ATUALIZADA' : 'CRIADA'} ${row.name} - R$ ${row.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} - ${row.storage}`);
    } catch (error) {
      catalog = await syncCatalog(token).catch(() => catalog);
      const afterError = findMansionProduct(catalog, category.id, row);
      if (afterError && productLooksDone(afterError, row)) {
        if (existing?.id) updated += 1;
        else created += 1;
        console.log(`OK APOS TIMEOUT ${row.name}: Apps Script salvou mesmo com erro local.`);
      } else {
        failed.push({ name: row.name, error: error instanceof Error ? error.message : String(error) });
        console.log(`FALHA ${row.name}: ${failed.at(-1).error}`);
      }
    }

    await sleep(1200);
  }

  console.log(JSON.stringify({
    category: category.title || category.titleBR,
    requested: ROWS.length,
    validPriceRows: validRows.length,
    created,
    updated,
    skippedAlreadyDone: skipped,
    skippedInvalidPrice: invalidPrice.map((row) => ({ name: row.name, rawPrice: row.rawPrice })),
    failed,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
