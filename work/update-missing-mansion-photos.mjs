import fs from 'node:fs/promises';
import path from 'node:path';

const API = 'https://script.google.com/macros/s/AKfycbyRRobZPHqB5OEeLsWNEYDYNKPf7Cd9CDQiVwBDVP74E07VK-kder0LlIsrJU7jq6Iv/exec';
const IMGBB_KEY = 'fc7a049d22afc785b615ecde51392119';
const IMGBB_ENDPOINT = 'https://api.imgbb.com/1/upload';
const USERNAME = 'Owner';
const PASSWORD = 'SantaGroup@2026';
const IMAGE_DIR = 'C:\\Users\\gilso\\Pictures\\Mansoes';
const TARGET_NUMBERS = [30, 57, 59, 60];
const DRY_RUN = process.argv.includes('--dry-run');

function mansionNumber(value) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const match = normalized.match(/mansao\s*0*(\d+)/i) || normalized.match(/mansao0*(\d+)/i);
  return match ? Number(match[1]) : null;
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

async function request(action, payload = {}, token = undefined) {
  let lastText = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch(API, {
      method: 'POST',
      body: JSON.stringify({ action, token, ...payload }),
    });
    const text = await response.text();
    lastText = text;
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 2500 * attempt));
        continue;
      }
      throw new Error(`Resposta invalida em ${action}: ${text.slice(0, 300)}`);
    }
    if (!data.success) throw new Error(`${action} falhou: ${data.message || JSON.stringify(data).slice(0, 300)}`);
    return data.data ?? data;
  }
  throw new Error(`Resposta invalida em ${action}: ${lastText.slice(0, 300)}`);
}

async function uploadImage(filePath, name) {
  const bytes = await fs.readFile(filePath);
  const body = new FormData();
  body.append('key', IMGBB_KEY);
  body.append('name', name);
  body.append('image', bytes.toString('base64'));

  const response = await fetch(IMGBB_ENDPOINT, { method: 'POST', body });
  const data = await response.json();
  if (!response.ok || !data.success || !data.data?.url) {
    throw new Error(`ImgBB falhou para ${name}: ${data.error?.message || response.status}`);
  }

  return {
    url: data.data.url,
    deleteUrl: data.data.delete_url,
    thumbnailUrl: data.data.thumb?.url,
    mediaType: 'image',
    mimeType: mimeType(filePath),
  };
}

async function main() {
  const files = await fs.readdir(IMAGE_DIR);
  const imageByNumber = new Map();
  for (const file of files) {
    if (!/\.(png|jpe?g|webp)$/i.test(file)) continue;
    const number = mansionNumber(file);
    if (TARGET_NUMBERS.includes(number)) imageByNumber.set(number, path.join(IMAGE_DIR, file));
  }

  const missingFiles = TARGET_NUMBERS.filter((number) => !imageByNumber.has(number));
  if (missingFiles.length) throw new Error(`Imagens nao encontradas: ${missingFiles.join(', ')}`);

  const login = await request('login', { username: USERNAME, password: PASSWORD });
  const token = login.token;
  if (!token) throw new Error('Login nao retornou token.');

  const sync = await request('sync', { sinceRevision: -1 }, token);
  const catalog = sync.catalog;
  if (!catalog) throw new Error('Nao foi possivel carregar o catalogo.');

  const categoriesById = new Map((catalog.categories || []).map((category) => [String(category.id), category]));
  const productsByNumber = new Map();
  for (const product of catalog.products || []) {
    const category = categoriesById.get(String(product.categoryId || ''));
    const categoryName = String(category?.titleBR || category?.title || product.categoryName || '');
    if (!/mans/i.test(categoryName.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) continue;
    const number = mansionNumber(product.nameBR || product.name || '');
    if (TARGET_NUMBERS.includes(number)) productsByNumber.set(number, product);
  }

  const missingProducts = TARGET_NUMBERS.filter((number) => !productsByNumber.has(number));
  if (missingProducts.length) throw new Error(`Produtos nao encontrados: ${missingProducts.join(', ')}`);

  console.log('Mapeamento encontrado:');
  for (const number of TARGET_NUMBERS) {
    const product = productsByNumber.get(number);
    const filePath = imageByNumber.get(number);
    console.log(`Mansao ${number}: ${product.name || product.nameBR} <= ${path.basename(filePath)}`);
  }

  if (DRY_RUN) return;

  let updated = 0;
  for (const number of TARGET_NUMBERS) {
    const product = productsByNumber.get(number);
    const filePath = imageByNumber.get(number);
    const uploaded = await uploadImage(filePath, `Mansao-${String(number).padStart(2, '0')}`);
    const payload = {
      ...product,
      prices: product.prices || { [product.currency || 'BRL']: product.amount || 0 },
      amount: product.amount || product.prices?.BRL || 0,
      currency: product.currency || 'BRL',
      images: [uploaded],
    };
    await request('saveProduct', { product: payload }, token);
    updated += 1;
    console.log(`${updated}/${TARGET_NUMBERS.length} atualizado: Mansao ${number} -> ${uploaded.url}`);
    await new Promise((resolve) => setTimeout(resolve, 900));
  }

  console.log(JSON.stringify({ updated, numbers: TARGET_NUMBERS }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
