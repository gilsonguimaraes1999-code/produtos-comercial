import type { Language } from '../i18n';
import { normalizeMansionDescriptionCoordinates } from './mansionData';
import type { Category, ContentLanguage, CurrencyCode, LocalizedText, Product, ProductPrices } from './types';

export const defaultCurrencyByLanguage: Record<Language, CurrencyCode> = {
  pt: 'BRL',
  en: 'USD',
  es: 'EUR',
};

export const languageByCurrency: Record<CurrencyCode, Language> = {
  BRL: 'pt',
  USD: 'en',
  GBP: 'en',
  EUR: 'es',
};

export function contentLanguageFor(language: Language): ContentLanguage {
  return language;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function localizedCandidate(value: unknown, language: Language) {
  const plain = stringValue(value);
  if (!plain) return '';
  if (plain.startsWith('{') && plain.endsWith('}')) {
    try {
      const nested = readLocalizedObject(JSON.parse(plain));
      return nested[language] || nested.pt || nested.en || nested.es || '';
    } catch {
      return plain;
    }
  }
  return plain;
}

function readLocalizedObject(value: unknown): LocalizedText {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return {
      pt: localizedCandidate(record['pt'] ?? record['br'] ?? record['BR'] ?? record['titleBR'] ?? record['nameBR'], 'pt'),
      en: localizedCandidate(record['en'] ?? record['EN'] ?? record['titleEN'] ?? record['nameEN'], 'en'),
      es: localizedCandidate(record['es'] ?? record['ES'] ?? record['titleES'] ?? record['nameES'], 'es'),
    };
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return {};
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return readLocalizedObject(JSON.parse(trimmed));
      } catch {
        return {};
      }
    }
  }

  return {};
}

function plainFallback(value: unknown, language: Language) {
  const parsed = readLocalizedObject(value);
  const parsedValue = parsed[language] || parsed.pt || parsed.en || parsed.es;
  if (parsedValue) return parsedValue;
  return stringValue(value);
}

export function localizedText(values: LocalizedText | string | undefined, fallback: string, language: Language) {
  const normalized = readLocalizedObject(values);
  return normalized[language]
    || normalized.pt
    || normalized.en
    || normalized.es
    || plainFallback(fallback, language);
}

const knownCategoryTranslations: Record<string, LocalizedText> = {
  'produtos la': { pt: 'Produtos LA', en: 'LA Products', es: 'Productos LA' },
  'mansoes': { pt: 'Mansões', en: 'Mansions', es: 'Mansiones' },
  'mansions': { pt: 'Mansões', en: 'Mansions', es: 'Mansiones' },
  'estatuas': { pt: 'Estátuas', en: 'Statues', es: 'Estatuas' },
  'statues': { pt: 'Estátuas', en: 'Statues', es: 'Estatuas' },
};

const knownProductTranslations: Record<string, LocalizedText> = {
  'blue dragon': { pt: 'Dragão Azul', en: 'Blue Dragon', es: 'Dragón Azul' },
  'dragao azul': { pt: 'Dragão Azul', en: 'Blue Dragon', es: 'Dragón Azul' },
  'dragon azul': { pt: 'Dragão Azul', en: 'Blue Dragon', es: 'Dragón Azul' },
  'lobo': { pt: 'Lobo', en: 'Wolf', es: 'Lobo' },
  'wolf': { pt: 'Lobo', en: 'Wolf', es: 'Lobo' },
  'tiger': { pt: 'Tigre', en: 'Tiger', es: 'Tigre' },
  'tigre': { pt: 'Tigre', en: 'Tiger', es: 'Tigre' },
  'aguia': { pt: 'Águia', en: 'Eagle', es: 'Águila' },
  'eagle': { pt: 'Águia', en: 'Eagle', es: 'Águila' },
  'aguila': { pt: 'Águia', en: 'Eagle', es: 'Águila' },
};

function normalizeKnownTitle(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function localizedCategoryTitle(category: Category, language: Language) {
  const normalized = readLocalizedObject(category.translations);
  const known = [
    category.title,
    normalized.pt,
    normalized.en,
    normalized.es,
  ].map((value) => knownCategoryTranslations[normalizeKnownTitle(value || '')]).find(Boolean);
  if (known?.[language]) return known[language]!;
  if (normalized[language]) return normalized[language]!;

  const fallback = localizedText(category.translations, category.title, language);
  return known?.[language] || fallback;
}

export function localizedProductName(product: Product, language: Language) {
  const normalized = readLocalizedObject(product.translations);
  const known = [
    product.name,
    normalized.pt,
    normalized.en,
    normalized.es,
  ].map((value) => knownProductTranslations[normalizeKnownTitle(value || '')]).find(Boolean);
  if (known?.[language]) return known[language]!;
  return localizedText(product.translations, product.name, language);
}

function translateKnownDescriptionHtml(html: string, language: Language, productName?: string) {
  if (language === 'pt' || !html) return html;

  const replacements: Array<[RegExp, string]> = language === 'en'
    ? [
        [/Benef(?:í|&iacute;|Ã­)cios da Mans(?:ã|&atilde;|Ã£)o/gi, 'Mansion Benefits'],
        [/Blip de tatuagem/gi, 'Tattoo blip'],
        [/Blip de barbearia/gi, 'Barber shop blip'],
        [/Blip de roupas/gi, 'Clothing store blip'],
        [/Loja de conveni(?:ê|&ecirc;|Ãª)ncia/gi, 'Convenience store'],
        [/Garagem/gi, 'Garage'],
        [/Ba(?:ú|&uacute;|Ãº)/gi, 'Storage'],
        [/Mans(?:ã|&atilde;|Ã£)o/gi, 'Mansion'],
      ]
    : [
        [/Benef(?:í|&iacute;|Ã­)cios da Mans(?:ã|&atilde;|Ã£)o/gi, 'Beneficios de la Mansión'],
        [/Blip de tatuagem/gi, 'Blip de tatuaje'],
        [/Blip de barbearia/gi, 'Blip de barbería'],
        [/Blip de roupas/gi, 'Blip de ropa'],
        [/Loja de conveni(?:ê|&ecirc;|Ãª)ncia/gi, 'Tienda de conveniencia'],
        [/Garagem/gi, 'Garaje'],
        [/Ba(?:ú|&uacute;|Ãº)/gi, 'Baúl'],
        [/Mans(?:ã|&atilde;|Ã£)o/gi, 'Mansión'],
      ];

  let translated = html;
  replacements.forEach(([pattern, value]) => {
    translated = translated.replace(pattern, value);
  });

  if (productName) {
    translated = translated.replace(/(<p[^>]*>\s*(?:👑\s*)?)(Mansion|Mansión|Mans(?:ã|&atilde;|Ã£)o)\s*(\d+)/i, '$1' + productName.replace(/\$/g, '$$$$'));
  }

  return translated;
}

export function localizedProductDescription(product: Product, language: Language) {
  const translated = localizedText(product.descriptionTranslations, '', language);
  if (translated) return normalizeMansionDescriptionCoordinates(translated, product);
  return normalizeMansionDescriptionCoordinates(
    translateKnownDescriptionHtml(product.descriptionHtml || '', language, localizedProductName(product, language)),
    product,
  );
}

export function normalizedPrices(product: Pick<Product, 'amount' | 'currency' | 'prices'>): ProductPrices {
  const prices: ProductPrices = {};

  if (product.prices && typeof product.prices === 'object') {
    for (const currency of ['BRL', 'USD', 'GBP', 'EUR'] as const) {
      const raw = product.prices[currency];
      const amount = Number(raw);
      if (raw !== undefined && Number.isFinite(amount) && amount > 0) {
        prices[currency] = amount;
      }
    }
  }

  const hasLegacyAmount = product.amount !== null && product.amount !== undefined;
  const legacyAmount = Number(product.amount);
  if (hasLegacyAmount && Number.isFinite(legacyAmount) && legacyAmount > 0 && !Object.prototype.hasOwnProperty.call(prices, product.currency)) {
    prices[product.currency] = legacyAmount;
  }

  return prices;
}

export function localizedProductPrice(product: Pick<Product, 'amount' | 'currency' | 'prices'>, preferredCurrency: CurrencyCode) {
  const prices = normalizedPrices(product);
  const preferredAmount = prices[preferredCurrency];
  if (typeof preferredAmount === 'number' && Number.isFinite(preferredAmount)) {
    return { amount: preferredAmount, currency: preferredCurrency };
  }

  const fallbackEntries = (Object.entries(prices) as Array<[CurrencyCode, number]>).filter(([, amount]) => Number.isFinite(amount));
  if (fallbackEntries.length) {
    return { currency: fallbackEntries[0]![0], amount: fallbackEntries[0]![1] };
  }

  return { amount: null, currency: product.currency || preferredCurrency || 'BRL' };
}
