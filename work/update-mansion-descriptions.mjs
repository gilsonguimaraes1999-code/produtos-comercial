const API = 'https://script.google.com/macros/s/AKfycbyRRobZPHqB5OEeLsWNEYDYNKPf7Cd9CDQiVwBDVP74E07VK-kder0LlIsrJU7jq6Iv/exec';
const USERNAME = 'Owner';
const PASSWORD = 'SantaGroup@2026';
const DRY_RUN = process.argv.includes('--dry-run');
const ONLY_NUMBERS = new Set(
  process.argv
    .filter((arg) => /^--only=/.test(arg))
    .flatMap((arg) => arg.replace(/^--only=/, '').split(','))
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0),
);

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mansionNumber(value) {
  const match = String(value || '').match(/mans[aã]o\s*0*(\d+)/i);
  return match ? Number(match[1]) : null;
}

function normalizeMansionName(product) {
  const number = mansionNumber(product.name || product.nameBR || '');
  return number ? `👑 Mansão ${String(number).padStart(2, '0')}` : String(product.name || product.nameBR || '');
}

function textFromHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readCoordinates(product) {
  if (product.coordinates) return String(product.coordinates).trim();
  const text = textFromHtml(product.descriptionHtml);
  const match = text.match(/CDS:\s*([-0-9.,\s]+)/i);
  return match ? match[1].trim().replace(/\s+/g, '') : '';
}

function readStorage(product) {
  if (product.storageWeight) return String(product.storageWeight).trim();
  const text = textFromHtml(product.descriptionHtml);
  const match = text.match(/Ba[uú]:\s*([0-9]+\s*T)/i);
  return match ? match[1].trim().toUpperCase().replace(/\s+/g, '') : '';
}

function mansionDescription(product) {
  const name = escapeHtml(normalizeMansionName(product));
  const storage = escapeHtml(readStorage(product));
  const coordinates = escapeHtml(readCoordinates(product));

  return [
    '<p><span style="font-family: Arial, Helvetica, sans-serif;"><span style="font-size: 18px;"><strong>' + name + '</strong></span></span></p>',
    '',
    '<p><span style="font-size: 14px;"><span style="font-family: Arial,Helvetica,sans-serif;"><strong><span style="color: rgb(250,197,28);">➝ Benefícios da Mansão:</span></strong></span></span></p>',
    '',
    '<ul>',
    '\t<li><span style="font-size: 14px;"><span style="font-family: Arial,Helvetica,sans-serif;"><strong>Blip de tatuagem</strong></span></span></li>',
    '\t<li><span style="font-size: 14px;"><span style="font-family: Arial,Helvetica,sans-serif;"><strong>Blip de barbearia</strong></span></span></li>',
    '\t<li><span style="font-size: 14px;"><span style="font-family: Arial,Helvetica,sans-serif;"><strong>Blip de roupas</strong></span></span></li>',
    '\t<li><span style="font-size: 14px;"><span style="font-family: Arial,Helvetica,sans-serif;"><strong>Loja de conveniência</strong></span></span></li>',
    '\t<li><span style="font-size: 14px;"><span style="font-family: Arial,Helvetica,sans-serif;"><strong>Garagem</strong></span></span></li>',
    '</ul>',
    '',
    '<p><span style="font-size: 14px;"><span style="font-family: Arial,Helvetica,sans-serif;"><strong><span style="color: rgb(250,197,28);">➝ Baú:</span> <span style="color: rgb(97,189,109);">' + storage + '</span></strong></span></span></p>',
    '',
    '<p><span style="font-family: Arial, Helvetica, sans-serif;"><span style="font-size: 14px;"><strong><span style="color: rgb(250, 197, 28);">➝ CDS:</span> </strong><span style="color: rgb(61, 142, 185);"><strong>' + coordinates + '</strong></span></span></span></p>',
  ].join('\n');
}

async function request(action, payload = {}, token = undefined) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch(API, {
      method: 'POST',
      body: JSON.stringify({ action, token, ...payload }),
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
        continue;
      }
      throw new Error(`Resposta inválida em ${action}: ${text.slice(0, 300)}`);
    }
    if (!data.success) throw new Error(`${action} falhou: ${data.message || JSON.stringify(data).slice(0, 300)}`);
    return data.data ?? data;
  }
}

async function main() {
  const login = await request('login', { username: USERNAME, password: PASSWORD });
  const token = login.token;
  if (!token) throw new Error('Login não retornou token.');

  let sync = await request('sync', { sinceRevision: -1 }, token);
  if (!sync.catalog) sync = await request('sync', { sinceRevision: 0 }, token);
  let catalog = sync.catalog;
  if (!catalog) throw new Error('Não foi possível carregar o catálogo.');

  const categoriesById = new Map((catalog.categories || []).map((category) => [String(category.id), category]));
  const targets = (catalog.products || [])
    .filter((product) => {
      const number = mansionNumber(product.name || product.nameBR || '');
      const category = categoriesById.get(String(product.categoryId || ''));
      const categoryName = String(category?.titleBR || category?.title || product.categoryName || '');
      return Boolean(number && /mans/i.test(categoryName) && (!ONLY_NUMBERS.size || ONLY_NUMBERS.has(number)));
    })
    .sort((a, b) => mansionNumber(a.name || a.nameBR || '') - mansionNumber(b.name || b.nameBR || ''));

  console.log(`Mansões encontradas para atualizar descrição: ${targets.length}`);
  if (DRY_RUN) {
    targets.forEach((product) => console.log(`${normalizeMansionName(product)} | Baú=${readStorage(product)} | CDS=${readCoordinates(product)}`));
    return;
  }

  let updated = 0;
  for (const product of targets) {
    const payload = {
      ...product,
      name: normalizeMansionName(product),
      descriptionHtml: mansionDescription(product),
      prices: product.prices || { [product.currency || 'BRL']: product.amount || 0 },
      amount: product.amount || product.prices?.BRL || 0,
      currency: product.currency || 'BRL',
      images: (product.images || []).map((image) => ({
        id: image.id,
        url: image.url,
        deleteUrl: image.deleteUrl,
        mediaType: image.mediaType || 'image',
        videoProvider: image.videoProvider,
        thumbnailUrl: image.thumbnailUrl,
      })),
    };

    const result = await request('saveProduct', { product: payload }, token);
    catalog = result.catalog;
    updated++;
    console.log(`${updated}/${targets.length} atualizado: ${payload.name}`);
    await new Promise((resolve) => setTimeout(resolve, 900));
  }

  console.log(JSON.stringify({ updated }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
