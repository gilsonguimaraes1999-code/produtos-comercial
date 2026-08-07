const API = 'https://script.google.com/macros/s/AKfycbyRRobZPHqB5OEeLsWNEYDYNKPf7Cd9CDQiVwBDVP74E07VK-kder0LlIsrJU7jq6Iv/exec';
const NUMBERS = [3, 4, 9, 13, 27, 29, 31, 46, 53, 56, 68, 73, 91, 93, 96];

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function mansionNumber(value) {
  const match = String(value || '').match(/mans[aã]o\s*0*(\d+)/i) || String(value || '').match(/mansao\s*0*(\d+)/i);
  return match ? Number(match[1]) : null;
}

async function request(action, payload = {}, token = undefined) {
  const response = await fetch(API, { method: 'POST', body: JSON.stringify({ action, token, ...payload }) });
  const data = await response.json();
  if (!data.success) throw new Error(data.message || action);
  return data.data || data;
}

const login = await request('login', { username: 'Owner', password: 'SantaGroup@2026' });
const sync = await request('sync', { sinceRevision: -1 }, login.token);
const catalog = sync.catalog;
const city = catalog.cities.find((item) => normalize(item.name) === 'nobre');
const category = catalog.categories.find((item) => String(item.cityId) === String(city.id) && normalize(item.title) === 'mansoes');
const products = catalog.products.filter((item) => String(item.categoryId) === String(category.id));
const found = NUMBERS.map((number) => {
  const product = products.find((item) => mansionNumber(item.name) === number);
  return {
    number,
    exists: Boolean(product),
    price: product?.prices?.BRL ?? product?.amount,
    storage: product?.storageWeight,
    hasDescription: Boolean(product?.descriptionHtml?.includes('Baú') && product?.descriptionHtml?.includes('CDS')),
    images: product?.images?.length || 0,
  };
});

console.log(JSON.stringify({ city: city.name, category: category.title, totalInCategory: products.length, found }, null, 2));
