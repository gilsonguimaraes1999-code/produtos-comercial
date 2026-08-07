import type { LocalizedText, Product, ProductPayload } from './types';

export type MansionLanguage = 'pt' | 'en' | 'es';

export const MANSION_COORDINATES: Record<string, string> = {
  '01': '-3128.34,799.85,17.78,116.23',
  '02': '18.62,549.86,176.25,0.0',
  '03': '-823.95,268.07,86.19,51.03',
  '04': '-770.53,309.17,85.7,263.63',
  '07': '-2598.89,1670.6,141.47,22.68',
  '08': '-2809.16,1431.86,104.49,138.9',
  '09': '-106.14,844.21,235.66,172.92',
  '11': '-2556.1,1912.2,168.9,59.53',
  '13': '1989.79,3369.7,55.96,22.68',
  '14': '2562.61,6174.53,164.81,306.15',
  '15': '175.05,1724.06,228.74,274.97',
  '16': '1038.0,3632.52,47.43,19.85',
  '17': '-5809.17,1155.12,4.43,294.81',
  '18': '-1737.73,387.99,88.88,212.6',
  '19': '-1976.84,-492.34,12.0,136.07',
  '20': '-529.6,520.28,112.74,223.94',
  '21': '-882.88,40.0,48.76,138.9',
  '23': '-1456.68,-19.21,54.64,90.71',
  '24': '-1130.2,366.9,80.2,45.36',
  '25': '-1471.22,64.77,53.19,5.67',
  '26': '220.01,772.55,204.66,235.28',
  '27': '-225.67,565.23,187.71,235.28',
  '28': '-519.92,4985.04,154.06,124.73',
  '29': '-2568.85,3749.23,27.53,303.31',
  '30': '-3250.83,-1218.52,7.8,201.26',
  '31': '-275.86,-729.36,125.48,260.79',
  '32': '-696.18,662.0,159.58,303.31',
  '34': '-690.93,960.45,238.73,297.64',
  '35': '-874.93,-57.75,38.22,252.29',
  '36': '-2003.011,305.206,94.10853',
  '37': '-764.6009,804.85,216.1005',
  '38': '-1027.887,-1156.656,7.442719',
  '39': '-932.29,-933.62,2.14,311.82',
  '40': '-989.6573,-885.8148,7.293941',
  '41': '-1107.377,-1078.822,7.293438',
  '42': '-998.5205,-1093.958,7.442586',
  '43': '-1029.933,-988.3876,7.420302',
  '44': '-1251.66,821.86,193.77,215.44',
  '45': '-195.29,988.36,231.53,51.03',
  '46': '-158.74,910.22,235.59,252.29',
  '47': '-2715.19,-59.45,21.74,317.49',
  '48': '766.79,3400.19,62.68,76.54',
  '50': '1407.92,4676.63,133.94,48.19',
  '52': '3428.73,4904.11,38.59,28.35',
  '53': '1177.02,867.09,144.0,82.21',
  '54': '-793.71,952.95,236.64,192.76',
  '56': '-1975.06,-229.37,95.56,121.89',
  '57': '-2979.19,-369.44,23.66,39.69',
  '58': '-3142.65,1481.12,37.32,2.84',
  '59': '574.87,766.04,202.97,141.74',
  '60': '-3324.06,558.47,23.88,158.75',
  '61': '649.79,911.32,257.58,280.63',
  '62': '-2987.45,2179.84,48.7,235.28',
  '63': '-2302.11,4339.14,43.37,206.93',
  '68': '-818.4,-714.85,123.27,59.53',
  '73': '-2874.42,3584.67,20.57,0.0',
  '91': '-670.54,6360.52,13.29,25.52',
  '93': '-3020.57,3431.78,9.72,70.87',
  '96': '-3545.94,4626.48,22.01,257.96',
};

export const MANSION_IMAGE_URLS: Record<string, string> = {};

function textFromHtml(value = '') {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mansionStorageFromTexts(values: Array<string | undefined>) {
  for (const value of values) {
    const match = textFromHtml(String(value || '')).match(/(?:Ba[u\u00fa]|Ba\u00fal|Peito|Chest|Storage|Armazenamento|Almacenamiento):\s*([0-9]+\s*T|SKORPION)/i);
    if (match?.[1]) return match[1].trim().toUpperCase().replace(/\s+/g, '');
  }
  return '';
}

function localizedMansionDescriptionHtml(name: string, storage: string, coordinates: string, language: MansionLanguage) {
  const copy = {
    pt: {
      benefits: '\u279d Benef\u00edcios da Mans\u00e3o:',
      tattoo: 'Blip de tatuagem',
      barber: 'Blip de barbearia',
      clothes: 'Blip de roupas',
      convenience: 'Loja de conveni\u00eancia',
      garage: 'Garagem',
      storage: '\u279d Armazenamento:',
      coordinates: '\u279d CDS:',
    },
    en: {
      benefits: '\u279d Mansion Benefits:',
      tattoo: 'Tattoo Shop Blip',
      barber: 'Barbershop Blip',
      clothes: 'Clothing Store Blip',
      convenience: 'Convenience Store',
      garage: 'Garage',
      storage: '\u279d Storage:',
      coordinates: '\u279d Coordinates:',
    },
    es: {
      benefits: '\u279d Beneficios de la Mansi\u00f3n:',
      tattoo: 'Blip de tatuajes',
      barber: 'Blip de barber\u00eda',
      clothes: 'Blip de ropa',
      convenience: 'Tienda de conveniencia',
      garage: 'Garaje',
      storage: '\u279d Almacenamiento:',
      coordinates: '\u279d Coordenadas:',
    },
  }[language];

  return [
    '<p>' + escapeHtml(name) + '</p>',
    '',
    '<p>' + copy.benefits + '</p>',
    '',
    '<ul>',
    '\t<li>' + copy.tattoo + '</li>',
    '\t<li>' + copy.barber + '</li>',
    '\t<li>' + copy.clothes + '</li>',
    '\t<li>' + copy.convenience + '</li>',
    '\t<li>' + copy.garage + '</li>',
    '</ul>',
    '',
    '<p>' + copy.storage + ' ' + escapeHtml(storage) + '</p>',
    '',
    '<p>' + copy.coordinates + ' ' + escapeHtml(coordinates) + '</p>',
  ].join('\n');
}

export function mansionNumberFromText(value = '') {
  const text = textFromHtml(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const match = text.match(/(?:mansao|mansion)\s*0*([0-9]+)/i);
  return match?.[1] ? match[1].padStart(2, '0') : '';
}

export function knownMansionCoordinatesFromTexts(values: Array<string | undefined>) {
  for (const value of values) {
    const mansionNumber = mansionNumberFromText(String(value || ''));
    if (mansionNumber && MANSION_COORDINATES[mansionNumber]) return MANSION_COORDINATES[mansionNumber];
  }
  return '';
}

export function knownMansionCoordinatesForProduct(product?: Product, extraValues: Array<string | undefined> = []) {
  return knownMansionCoordinatesFromTexts([
    ...extraValues,
    product?.name,
    product?.translations?.pt,
    product?.translations?.en,
    product?.translations?.es,
    product?.descriptionHtml,
    product?.descriptionTranslations?.pt,
    product?.descriptionTranslations?.en,
    product?.descriptionTranslations?.es,
  ]);
}

export function normalizeMansionDescriptionCoordinates(
  html: string,
  product?: Product,
  extraValues: Array<string | undefined> = [],
) {
  const coordinates = knownMansionCoordinatesForProduct(product, [html, ...extraValues]);
  if (!coordinates) return html;

  const labelPattern = '(?:CDS|Coordinates|Coordenadas)';
  const paragraphPattern = new RegExp(
    `(<p[^>]*>[^<]*${labelPattern}\\s*:\\s*)[^<]*(<\\/p>)`,
    'i',
  );

  if (paragraphPattern.test(html)) {
    return html.replace(paragraphPattern, `$1${coordinates}$2`);
  }

  return `${html}\n\n<p>\u279d CDS: ${coordinates}</p>`;
}

export function mansionNumberForProduct(product?: Product, extraValues: Array<string | undefined> = []) {
  for (const value of [
    ...extraValues,
    product?.name,
    product?.translations?.pt,
    product?.translations?.en,
    product?.translations?.es,
    product?.descriptionHtml,
    product?.descriptionTranslations?.pt,
    product?.descriptionTranslations?.en,
    product?.descriptionTranslations?.es,
  ]) {
    const mansionNumber = mansionNumberFromText(String(value || ''));
    if (mansionNumber) return mansionNumber;
  }
  return '';
}

export function localizedMansionNameFromNumber(mansionNumber: string, language: MansionLanguage) {
  if (!mansionNumber) return '';
  if (language === 'en') return `\uD83D\uDC51 Mansion ${mansionNumber}`;
  if (language === 'es') return `\uD83D\uDC51 Mansi\u00F3n ${mansionNumber}`;
  return `\uD83D\uDC51 Mans\u00E3o ${mansionNumber}`;
}

export function knownMansionImageUrlFromNumber(mansionNumber: string) {
  if (!mansionNumber) return '';
  return MANSION_IMAGE_URLS[mansionNumber.padStart(2, '0')] || '';
}

export function knownMansionImageUrlForProduct(product?: Product, extraValues: Array<string | undefined> = []) {
  const mansionNumber = mansionNumberForProduct(product, extraValues);
  return knownMansionImageUrlFromNumber(mansionNumber);
}

function isMansionPlaceholderUrl(url = '') {
  if (!url) return true;
  if (url === '/mansion-placeholder.png') return true;
  if (!/^data:image\/svg\+xml/i.test(url)) return false;

  let decoded = '';
  try {
    decoded = decodeURIComponent(url);
  } catch {
    decoded = url;
  }

  return decoded.includes('MANSION_PLACEHOLDER') || decoded.includes('IMAGEM EM BREVE');
}

function mansionPayloadImages(payload: ProductPayload, mansionNumber: string): ProductPayload['images'] {
  const imageUrl = knownMansionImageUrlFromNumber(mansionNumber);
  const hasRegisteredImage = payload.images.some((image) => image.url && !isMansionPlaceholderUrl(image.url));
  if (hasRegisteredImage) return payload.images;
  if (!imageUrl) return payload.images;

  const currentImage = payload.images[0];
  return [{
    ...(currentImage?.id ? { id: currentImage.id } : {}),
    url: imageUrl,
    sourceType: 'url',
    source: imageUrl,
    mediaType: 'image',
    name: `Mansao${mansionNumber}.png`,
  }];
}

export function completeMansionPayloadForSave(payload: ProductPayload, product?: Product): ProductPayload {
  const mansionNumber = mansionNumberForProduct(product, [
    payload.name,
    payload.descriptionHtml,
    payload.descriptionTranslations?.pt,
    payload.descriptionTranslations?.en,
    payload.descriptionTranslations?.es,
  ]);
  if (!mansionNumber) return payload;
  const mansionOrder = Number.parseInt(mansionNumber, 10);

  const coordinates = knownMansionCoordinatesForProduct(product, [
    payload.name,
    payload.descriptionHtml,
    payload.descriptionTranslations?.pt,
    payload.descriptionTranslations?.en,
    payload.descriptionTranslations?.es,
  ]);
  const storage = String(payload.storageWeight || product?.storageWeight || '').trim()
    || mansionStorageFromTexts([
      payload.descriptionHtml,
      payload.descriptionTranslations?.pt,
      payload.descriptionTranslations?.en,
      payload.descriptionTranslations?.es,
      product?.descriptionHtml,
      product?.descriptionTranslations?.pt,
      product?.descriptionTranslations?.en,
      product?.descriptionTranslations?.es,
    ]);

  if (!coordinates || !storage) return {
    ...payload,
    ...(Number.isFinite(mansionOrder) ? { order: mansionOrder } : {}),
    ...(coordinates ? { coordinates } : {}),
    ...(storage ? { storageWeight: storage } : {}),
    images: mansionPayloadImages(payload, mansionNumber),
  };

  const currentTranslations = payload.descriptionTranslations || {};
  const sourceLanguage = payload.sourceLanguage === 'en' || payload.sourceLanguage === 'es' ? payload.sourceLanguage : 'pt';
  const translations: LocalizedText = {
    pt: normalizeMansionDescriptionCoordinates(
      currentTranslations.pt || localizedMansionDescriptionHtml(
        sourceLanguage === 'pt' ? payload.name : localizedMansionNameFromNumber(mansionNumber, 'pt'),
        storage,
        coordinates,
        'pt',
      ),
      product,
      [payload.name],
    ),
    en: normalizeMansionDescriptionCoordinates(
      currentTranslations.en || localizedMansionDescriptionHtml(
        sourceLanguage === 'en' ? payload.name : localizedMansionNameFromNumber(mansionNumber, 'en'),
        storage,
        coordinates,
        'en',
      ),
      product,
      [payload.name],
    ),
    es: normalizeMansionDescriptionCoordinates(
      currentTranslations.es || localizedMansionDescriptionHtml(
        sourceLanguage === 'es' ? payload.name : localizedMansionNameFromNumber(mansionNumber, 'es'),
        storage,
        coordinates,
        'es',
      ),
      product,
      [payload.name],
    ),
  };

  return {
    ...payload,
    ...(Number.isFinite(mansionOrder) ? { order: mansionOrder } : {}),
    coordinates,
    storageWeight: storage,
    descriptionHtml: translations[sourceLanguage] || payload.descriptionHtml,
    descriptionTranslations: translations,
    images: mansionPayloadImages(payload, mansionNumber),
  };
}
