import fs from 'node:fs/promises';
import path from 'node:path';

const API = 'https://script.google.com/macros/s/AKfycbyRRobZPHqB5OEeLsWNEYDYNKPf7Cd9CDQiVwBDVP74E07VK-kder0LlIsrJU7jq6Iv/exec';
const IMGBB_KEY = 'fc7a049d22afc785b615ecde51392119';
const IMGBB_ENDPOINT = 'https://api.imgbb.com/1/upload';
const USERNAME = 'Owner';
const PASSWORD = 'SantaGroup@2026';
const IMAGE_DIR = process.env.MANSION_IMAGE_DIR || 'C:\\Users\\gilso\\Pictures\\Mansoes';
const DRY_RUN = process.argv.includes('--dry-run');
const ONLY_NUMBERS = new Set(
  process.argv
    .filter((arg) => /^--only=/.test(arg))
    .flatMap((arg) => arg.replace(/^--only=/, '').split(','))
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0),
);

function mansionNumber(value) {
  const match = String(value || '').match(/mans[aã]o\s*0*(\d+)/i) || String(value || '').match(/mansao0*(\d+)/i);
  return match ? Number(match[1]) : null;
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
        await new Promise((resolve) => setTimeout(resolve, 5000 * attempt));
        continue;
      }
      throw new Error(`Resposta inválida em ${action}: ${text.slice(0, 300)}`);
    }
    if (!data.success) throw new Error(`${action} falhou: ${data.message || JSON.stringify(data).slice(0, 300)}`);
    return data.data ?? data;
  }
  throw new Error(`Resposta inválida em ${action}: ${lastText.slice(0, 300)}`);
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
  };
}

async function main() {
  const files = await fs.readdir(IMAGE_DIR);
  const imageByNumber = new Map();
  for (const file of files) {
    if (!/\.(png|jpe?g|webp)$/i.test(file)) continue;
    const number = mansionNumber(file);
    if (!number) continue;
    imageByNumber.set(number, path.join(IMAGE_DIR, file));
  }

  const login = await request('login', { username: USERNAME, password: PASSWORD });
  const token = login.token;
  if (!token) throw new Error('Login não retornou token.');

  let sync = await request('sync', { sinceRevision: -1 }, token);
  if (!sync.catalog) sync = await request('sync', { sinceRevision: 0 }, token);
  let catalog = sync.catalog;
  if (!catalog) throw new Error('Não foi possível carregar o catálogo antes de atualizar as imagens.');
  const categoriesById = new Map((catalog.categories || []).map((category) => [String(category.id), category]));
  const targets = (catalog.products || [])
    .map((product) => {
      const number = mansionNumber(product.name || product.nameBR || '');
      const category = categoriesById.get(String(product.categoryId || ''));
      const categoryName = String(category?.titleBR || category?.title || product.categoryName || '');
      if (!number || !/mans/i.test(categoryName)) return null;
      if (ONLY_NUMBERS.size && !ONLY_NUMBERS.has(number)) return null;
      const filePath = imageByNumber.get(number);
      if (!filePath) return null;
      return { product, number, filePath };
    })
    .filter(Boolean)
    .sort((a, b) => a.number - b.number);

  console.log(`Imagens encontradas: ${imageByNumber.size}`);
  console.log(`Produtos de mansão com imagem correspondente: ${targets.length}`);

  if (DRY_RUN) {
    targets.forEach(({ product, number, filePath }) => console.log(`${String(number).padStart(3, '0')} -> ${product.name} <= ${path.basename(filePath)}`));
    return;
  }

  let updated = 0;
  for (const { product, number, filePath } of targets) {
    const uploaded = await uploadImage(filePath, `Mansao-${String(number).padStart(2, '0')}`);
    const payload = {
      ...product,
      prices: product.prices || { [product.currency || 'BRL']: product.amount || 0 },
      amount: product.amount || product.prices?.BRL || 0,
      currency: product.currency || 'BRL',
      images: [uploaded],
    };
    const result = await request('saveProduct', { product: payload }, token);
    catalog = result.catalog;
    updated++;
    console.log(`${updated}/${targets.length} atualizado: ${product.name} -> ${path.basename(filePath)}`);
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  console.log(JSON.stringify({ updated, availableImages: imageByNumber.size }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
