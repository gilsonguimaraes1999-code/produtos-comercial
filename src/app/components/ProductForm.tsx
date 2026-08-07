import { ArrowDown, ArrowUp, ImagePlus, Link2, Play, Plus, Trash2, Upload, UploadCloud, Video } from 'lucide-react';
import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { translateAppError, useTranslation, type Translator } from '../../i18n';
import { contentLanguageFor, localizedProductDescription, localizedProductName, normalizedPrices } from '../localization';
import { knownMansionCoordinatesForProduct, localizedMansionNameFromNumber, mansionNumberForProduct, normalizeMansionDescriptionCoordinates, type MansionLanguage } from '../mansionData';
import { isVideoMedia, mediaThumbUrl, normalizeMediaLink, videoProviderName } from '../media';
import type { Category, City, CurrencyCode, DescriptionTemplate, DraftImageInput, Product, ProductPayload, ProductPermission } from '../types';
import { CategorySelect } from './CategorySelect';
import { CitySelect } from './CitySelect';
import { CURRENCIES, CurrencySelect } from './CurrencySelect';
import { RichHtmlEditor } from './RichHtmlEditor';

interface DraftImage {
  key: string;
  preview: string;
  input: DraftImageInput;
  label: string;
}

interface PriceRow {
  key: string;
  currency: CurrencyCode;
  amount: string;
}

function randomKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readFile(file: File, t: Translator): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(t('readImageError', { name: file.name })));
    reader.readAsDataURL(file);
  });
}

async function optimizeImage(file: File, t: Translator): Promise<string> {
  const original = await readFile(file, t);
  const image = new Image();

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(t('optimizeImageError', { name: file.name })));
    image.src = original;
  });

  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) return original;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);

  const compressed = canvas.toDataURL('image/webp', 0.82);
  return compressed.length < original.length ? compressed : original;
}

function initialPriceRows(product?: Product): PriceRow[] {
  if (!product) return [{ key: randomKey(), currency: 'BRL', amount: '' }];
  const prices = normalizedPrices(product);
  const ordered = CURRENCIES
    .map((currency) => currency.value)
    .filter((currency) => typeof prices[currency] === 'number')
    .map((currency) => ({ key: randomKey(), currency, amount: String(prices[currency]) }));
  return ordered.length ? ordered : [{ key: randomKey(), currency: product.currency, amount: product.amount === null || product.amount === undefined ? '' : String(product.amount) }];
}

function productImageInputs(product?: Product): DraftImageInput[] {
  return (product?.images || []).map((image) => ({
    id: image.id,
    url: image.url,
    mediaType: image.mediaType || 'image',
    videoProvider: image.videoProvider,
    thumbnailUrl: image.thumbnailUrl,
  }));
}

function productBaseName(product?: Product) {
  return (product?.translations?.pt || product?.name || '').trim();
}

function productBaseDescription(product?: Product) {
  return product?.descriptionTranslations?.pt || product?.descriptionHtml || '';
}

function DraftMediaPreview({ image }: { image: DraftImage }) {
  const thumb = mediaThumbUrl(image.input);
  if (!isVideoMedia(image.input)) {
    return <img src={image.preview} alt={image.label} referrerPolicy="no-referrer" />;
  }

  return (
    <div className="media-video-thumb">
      {thumb ? <img src={thumb} alt={image.label} referrerPolicy="no-referrer" /> : <Video size={23} />}
      <span><Play size={13} fill="currentColor" /></span>
    </div>
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textFromHtml(html: string) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findMansionStorage(product: Product | undefined, descriptionHtml: string) {
  if (product?.storageWeight) return String(product.storageWeight).trim();
  const match = textFromHtml(descriptionHtml).match(/(?:Ba[u\u00fa]|Ba\u00fal|Storage|Armazenamento|Almacenamiento):\s*([0-9]+\s*T|SKORPION)/i);
  return match?.[1] ? match[1].trim().toUpperCase().replace(/\s+/g, '') : '';
}

function findMansionCoordinates(product: Product | undefined, descriptionHtml: string) {
  const knownCoordinates = knownMansionCoordinatesForProduct(product, [descriptionHtml]);
  if (knownCoordinates) return knownCoordinates;
  if (product?.coordinates) return String(product.coordinates).trim();
  const match = textFromHtml(descriptionHtml).match(/(?:CDS|Coordinates|Coordenadas):\s*([-0-9.,\s]+)/i);
  return match?.[1] ? match[1].trim().replace(/\s+/g, '') : '';
}

function mansionDescriptionTemplate(name: string, storage: string, coordinates: string) {
  const title = escapeHtml(name);
  const safeStorage = escapeHtml(storage);
  const safeCoordinates = escapeHtml(coordinates);

  return [
    '<p>' + title + '</p>',
    '',
    '<p>\u279d Benef\u00edcios da Mans\u00e3o:</p>',
    '',
    '<ul>',
    '\t<li>Blip de tatuagem</li>',
    '\t<li>Blip de barbearia</li>',
    '\t<li>Blip de roupas</li>',
    '\t<li>Loja de conveni\u00eancia</li>',
    '\t<li>Garagem</li>',
    '</ul>',
    '',
    '<p>\u279d Armazenamento: ' + safeStorage + '</p>',
    '',
    '<p>\u279d CDS: ' + safeCoordinates + '</p>',
  ].join('\n');
}

function localizedMansionDescriptionTemplate(name: string, storage: string, coordinates: string, language: 'pt' | 'en' | 'es') {
  const title = escapeHtml(name);
  const safeStorage = escapeHtml(storage);
  const safeCoordinates = escapeHtml(coordinates);
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
    '<p>' + title + '</p>',
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
    '<p>' + copy.storage + ' ' + safeStorage + '</p>',
    '',
    '<p>' + copy.coordinates + ' ' + safeCoordinates + '</p>',
  ].join('\n');
}

function templateHtmlForLanguage(template: DescriptionTemplate, language: 'pt' | 'en' | 'es') {
  if (language === 'en') return template.htmlEN || '';
  if (language === 'es') return template.htmlES || '';
  return template.htmlBR || '';
}

function applyProductDescriptionTemplate(templateHtml: string, values: { name: string; storage: string; coordinates: string }) {
  const replacements: Record<string, string> = {
    nome: values.name,
    name: values.name,
    armazenamento: values.storage,
    storage: values.storage,
    bau: values.storage,
    'baú': values.storage,
    cds: values.coordinates,
    coordinates: values.coordinates,
    coordenadas: values.coordinates,
  };

  return templateHtml.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, key: string) => (
    escapeHtml(replacements[String(key || '').trim().toLowerCase()] || '')
  ));
}

function mansionDescriptionTranslations(
  product: Product | undefined,
  activeTemplate: DescriptionTemplate | undefined,
  currentLanguage: MansionLanguage,
  values: { name: string; storage: string; coordinates: string; descriptionHtml: string },
) {
  const mansionNumber = mansionNumberForProduct(product, [values.name, values.descriptionHtml]);
  if (!mansionNumber || !values.storage || !values.coordinates) return undefined;

  const translations: Record<MansionLanguage, string> = {
    pt: '',
    en: '',
    es: '',
  };

  (Object.keys(translations) as MansionLanguage[]).forEach((itemLanguage) => {
    const localizedName = itemLanguage === currentLanguage
      ? values.name
      : localizedMansionNameFromNumber(mansionNumber, itemLanguage);
    const templateHtml = activeTemplate ? templateHtmlForLanguage(activeTemplate, itemLanguage) : '';
    const itemValues = {
      name: localizedName || localizedMansionNameFromNumber(mansionNumber, itemLanguage),
      storage: values.storage,
      coordinates: values.coordinates,
    };
    translations[itemLanguage] = templateHtml
      ? applyProductDescriptionTemplate(templateHtml, itemValues)
      : localizedMansionDescriptionTemplate(itemValues.name, itemValues.storage, itemValues.coordinates, itemLanguage);
    translations[itemLanguage] = normalizeMansionDescriptionCoordinates(translations[itemLanguage], product, [values.name]);
  });

  return translations;
}

export function ProductForm({ product, cities, categories, descriptionTemplates = [], defaultCategoryId, permissions, onSave, onCancel }: {
  product?: Product | undefined;
  cities: City[];
  categories: Category[];
  descriptionTemplates?: DescriptionTemplate[];
  defaultCategoryId?: string | undefined;
  permissions?: Partial<Record<ProductPermission, boolean>>;
  onSave: (payload: ProductPayload) => Promise<void>;
  onCancel: () => void;
}) {
  const { language, locale, t } = useTranslation();
  const initialCategory = categories.find((category) => category.id === (product?.categoryId || defaultCategoryId)) || categories[0];
  const [cityId, setCityId] = useState(initialCategory?.cityId || cities[0]?.id || '');
  const cityCategories = useMemo(() => categories.filter((category) => category.cityId === cityId), [categories, cityId]);
  const [categoryId, setCategoryId] = useState(product?.categoryId || defaultCategoryId || cityCategories[0]?.id || '');
  const [name, setName] = useState(product ? localizedProductName(product, language) : '');
  const [descriptionHtml, setDescriptionHtml] = useState(product ? localizedProductDescription(product, language) : '');
  const [sold, setSold] = useState(product?.sold === true);
  const [soldOwnerName, setSoldOwnerName] = useState(product?.soldOwnerName || '');
  const [soldOwnerDiscordId, setSoldOwnerDiscordId] = useState(product?.soldOwnerDiscordId || '');
  const [priceRows, setPriceRows] = useState<PriceRow[]>(() => initialPriceRows(product));
  const [imageUrl, setImageUrl] = useState('');
  const [images, setImages] = useState<DraftImage[]>(() => (product?.images || []).map((image) => ({
    key: image.id,
    preview: mediaThumbUrl(image) || image.url,
    label: isVideoMedia(image) ? t('currentVideo') : t('currentImage'),
    input: {
      id: image.id,
      url: image.url,
      mediaType: image.mediaType || 'image',
      videoProvider: image.videoProvider,
      thumbnailUrl: image.thumbnailUrl,
    },
  })));
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const usedCurrencies = useMemo(() => priceRows.map((row) => row.currency), [priceRows]);
  const selectedCategoryValid = cityCategories.some((category) => category.id === categoryId);
  const canCreateProduct = permissions?.createProduct === true;
  const canEditCategory = !product || permissions?.editProductCategory === true;
  const canEditName = !product || permissions?.editProductName === true;
  const canEditPrice = !product || permissions?.editProductPrice === true;
  const canEditDescription = !product || permissions?.editProductDescription === true;
  const canEditMedia = !product || permissions?.editProductMedia === true;
  const canMarkSold = permissions?.markProductSold === true;
  const showCategoryFields = canEditCategory;
  const showNameField = canEditName;
  const showDescriptionField = canEditDescription;
  const showPriceEditor = canEditPrice;
  const showMediaEditor = canEditMedia;

  async function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    if (images.length + files.length > 10) {
      setError(t('productMaxImages'));
      return;
    }
    setProcessing(true);
    setError('');
    try {
      const next: DraftImage[] = [];
      for (const file of files) {
        if (!file.type.startsWith('image/')) throw new Error(t('notImage', { name: file.name }));
        if (file.size > 10 * 1024 * 1024) throw new Error(t('imageTooLarge', { name: file.name }));
        const dataUrl = await optimizeImage(file, t);
        next.push({
          key: randomKey(),
          preview: dataUrl,
          label: file.name,
          input: { sourceType: 'base64', source: dataUrl, name: file.name.replace(/\.[^.]+$/, ''), mediaType: 'image' },
        });
      }
      setImages((current) => [...current, ...next]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('importAttachmentError'));
    } finally {
      setProcessing(false);
    }
  }

  function addUrl() {
    const url = imageUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      setError(t('invalidLink'));
      return;
    }
    if (images.length >= 10) {
      setError(t('productMaxImages'));
      return;
    }
    const media = normalizeMediaLink(url);
    if (!media) {
      setError(t('invalidLink'));
      return;
    }
    const video = isVideoMedia(media);
    setImages((current) => [...current, {
      key: randomKey(),
      preview: mediaThumbUrl(media) || media.url || url,
      label: video ? `${t('linkVideo')} ${videoProviderName(media.videoProvider)}` : t('linkImage'),
      input: { ...media, name: video ? media.name : name || media.name || 'produto' },
    }]);
    setImageUrl('');
    setError('');
  }

  function moveImage(index: number, direction: -1 | 1) {
    setImages((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  function addPriceRow() {
    const nextCurrency = CURRENCIES.find((item) => !usedCurrencies.includes(item.value));
    if (!nextCurrency) return;
    setPriceRows((current) => [...current, { key: randomKey(), currency: nextCurrency.value, amount: '' }]);
  }

  function updatePriceCurrency(key: string, currency: CurrencyCode) {
    if (priceRows.some((row) => row.key !== key && row.currency === currency)) {
      setError(t('duplicateCurrency'));
      return;
    }
    setPriceRows((current) => current.map((row) => row.key === key ? { ...row, currency } : row));
    setError('');
  }

  function updatePriceAmount(key: string, amount: string) {
    setPriceRows((current) => current.map((row) => row.key === key ? { ...row, amount } : row));
  }

  function formatMansionDescription() {
    const activeTemplate = descriptionTemplates
      .filter((template) => template.categoryId === categoryId && template.active)
      .sort((first, second) => Number(first.order || 0) - Number(second.order || 0))[0];
    const templateHtml = activeTemplate ? templateHtmlForLanguage(activeTemplate, language) : '';
    const values = {
      name: name.trim() || (product ? localizedProductName(product, language) : ''),
      storage: findMansionStorage(product, descriptionHtml),
      coordinates: findMansionCoordinates(product, [name, descriptionHtml].join(' ')),
    };

    const nextDescriptionHtml = templateHtml
      ? applyProductDescriptionTemplate(templateHtml, values)
      : localizedMansionDescriptionTemplate(values.name, values.storage, values.coordinates, language);
    setDescriptionHtml(normalizeMansionDescriptionCoordinates(nextDescriptionHtml, product, [values.name]));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!cityId) return setError(t('selectCity'));
    if (!categoryId || !selectedCategoryValid) return setError(t('createOrSelectCategory'));
    if (!name.trim()) return setError(t('typeProductName'));
    if (!product && !canCreateProduct) return setError(t('productPermissionDenied'));
    if (sold && !soldOwnerName.trim()) return setError(t('soldOwnerRequired'));
    const prices: ProductPayload['prices'] = {};
    for (const row of priceRows) {
      if (!String(row.amount).trim()) continue;
      const amount = Number(String(row.amount).replace(',', '.'));
      if (!Number.isFinite(amount) || amount < 0) return setError(t('typeValidPrice'));
      prices[row.currency] = amount;
    }
    const primary = priceRows[0];
    const primaryAmount = primary && typeof prices[primary.currency] === 'number' ? prices[primary.currency]! : null;
    const activeTemplate = descriptionTemplates
      .filter((template) => template.categoryId === categoryId && template.active)
      .sort((first, second) => Number(first.order || 0) - Number(second.order || 0))[0];
    const mansionStorageValue = findMansionStorage(product, descriptionHtml);
    const mansionCoordinatesValue = findMansionCoordinates(product, [name, descriptionHtml].join(' '));
    const descriptionTranslations = mansionDescriptionTranslations(product, activeTemplate, language, {
      name: name.trim(),
      storage: mansionStorageValue,
      coordinates: mansionCoordinatesValue,
      descriptionHtml,
    });
    const preservedPrices = product ? normalizedPrices(product) : prices;
    const preservedName = productBaseName(product) || name.trim();
    const preservedDescriptionHtml = productBaseDescription(product) || descriptionHtml;
    const payloadCategoryId = canEditCategory ? categoryId : product?.categoryId || categoryId;
    const payloadName = canEditName ? name.trim() : preservedName;
    const payloadDescriptionHtml = canEditDescription ? descriptionHtml : preservedDescriptionHtml;
    const payloadDescriptionTranslations = canEditDescription
      ? descriptionTranslations
      : product?.descriptionTranslations;
    const payloadPrices = canEditPrice ? prices : preservedPrices;
    const payloadPrimaryCurrency = canEditPrice ? primary?.currency || 'BRL' : product?.currency || 'BRL';
    const payloadPrimaryAmount = canEditPrice ? primaryAmount : product?.amount ?? null;
    const payloadImages = canEditMedia ? images.map((image) => image.input) : productImageInputs(product);
    const payloadCoordinates = canEditDescription ? mansionCoordinatesValue : product?.coordinates || mansionCoordinatesValue;
    const payloadStorageWeight = canEditDescription ? mansionStorageValue : product?.storageWeight || mansionStorageValue;
    const payloadSourceLanguage = canEditName || canEditDescription ? contentLanguageFor(language) : 'pt';

    setSaving(true);
    setError('');
    try {
      await onSave({
        id: product?.id,
        categoryId: payloadCategoryId,
        coordinates: payloadCoordinates,
        storageWeight: payloadStorageWeight,
        name: payloadName,
        descriptionHtml: payloadDescriptionHtml,
        ...(payloadDescriptionTranslations ? { descriptionTranslations: payloadDescriptionTranslations } : {}),
        sourceLanguage: payloadSourceLanguage,
        autoTranslate: canEditName,
        autoTranslateDescription: canEditDescription,
        syncNameAcrossLanguages: false,
        prices: payloadPrices,
        amount: payloadPrimaryAmount,
        currency: payloadPrimaryCurrency,
        images: payloadImages,
        order: product?.order,
        sold: canMarkSold ? sold : product?.sold === true,
        soldOwnerName: canMarkSold && sold ? soldOwnerName.trim() : product?.soldOwnerName || '',
        soldOwnerDiscordId: canMarkSold && sold ? soldOwnerDiscordId.trim() : product?.soldOwnerDiscordId || '',
      });
    } catch (err) {
      console.error(err);
      setError(translateAppError(err, t, 'productSaveError'));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack-form">
      {error && <p className="form-error normal-case">{error}</p>}
      {showCategoryFields && (
      <div className="two-columns">
        <div className="field-label">
          {t('city')}
          <CitySelect
            cities={cities}
            value={cityId}
            onChange={(value) => {
              if (!canEditCategory) return;
              setCityId(value);
              setCategoryId(categories.find((category) => category.cityId === value)?.id || '');
            }}
          />
        </div>
        <div className="field-label">
          {t('category')}
          <CategorySelect categories={cityCategories} value={selectedCategoryValid ? categoryId : ''} onChange={(value) => {
            if (canEditCategory) setCategoryId(value);
          }} />
        </div>
      </div>
      )}
      {showNameField && (
      <div className="two-columns">
        <label className="field-label">
          {t('productName')}
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('productNamePlaceholder')} maxLength={120} disabled={!canEditName} />
          <small className="translation-helper">{t(product ? 'editLanguageHint' : 'autoTranslationHint')}</small>
        </label>
      </div>
      )}

      {showDescriptionField && (
      <div className="field-label">
        {t('description')}
        <div className="description-format-actions">
          <button type="button" className="secondary-button compact" onClick={formatMansionDescription} disabled={!canEditDescription}>
            Descrição Mansão
          </button>
        </div>
        <RichHtmlEditor value={descriptionHtml} onChange={(value) => {
          if (canEditDescription) setDescriptionHtml(value);
        }} />
      </div>
      )}

      {canMarkSold && (
        <div className="sold-editor">
          <label className="remember-row account-active-row">
            <input type="checkbox" checked={sold} onChange={(event) => setSold(event.target.checked)} />
            <span className="remember-dot" aria-hidden="true" />
            <span>{t('markAsSold')}</span>
          </label>
          {sold && (
            <div className="two-columns sold-owner-fields">
              <label className="field-label">
                {t('soldOwnerName')}
                <input value={soldOwnerName} onChange={(event) => setSoldOwnerName(event.target.value)} placeholder={t('soldOwnerNamePlaceholder')} maxLength={120} />
              </label>
              <label className="field-label">
                {t('soldOwnerDiscordId')}
                <input value={soldOwnerDiscordId} onChange={(event) => setSoldOwnerDiscordId(event.target.value)} placeholder="123456789012345678" maxLength={40} />
              </label>
            </div>
          )}
        </div>
      )}

      {showPriceEditor && (
      <div className="field-label price-editor">
        <span>{t('pricesByRegion')}</span>
        <div className="price-rows">
          {priceRows.map((row, index) => (
            <div className="price-row" key={row.key}>
              <input
                inputMode="decimal"
                value={row.amount}
                onChange={(event) => updatePriceAmount(row.key, event.target.value)}
                placeholder={locale === 'en-US' || locale === 'en-GB' ? '0.00' : '0,00'}
                aria-label={`${t('price')} ${index + 1}`}
                disabled={!canEditPrice}
              />
              <CurrencySelect
                value={row.currency}
                onChange={(currency) => {
                  if (canEditPrice) updatePriceCurrency(row.key, currency);
                }}
                excluded={usedCurrencies.filter((currency) => currency !== row.currency)}
              />
              {priceRows.length > 1 && (
                <button
                  type="button"
                  className="price-remove"
                  onClick={() => setPriceRows((current) => current.filter((item) => item.key !== row.key))}
                  disabled={!canEditPrice}
                  aria-label={t('removeCurrency')}
                  title={t('removeCurrency')}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
        {priceRows.length < CURRENCIES.length && (
          <button type="button" className="add-currency-button" onClick={addPriceRow} disabled={!canEditPrice}>
            <Plus size={16} /> {t('addAnotherCurrency')}
          </button>
        )}
        <small className="translation-helper">{t('priceRegionHint')}</small>
      </div>
      )}

      {showMediaEditor && (
      <div className="field-label">
        {t('productImages')}
        <div className="image-import-grid">
          <label className="upload-box">
            <Upload size={22} />
            <strong>{t('uploadImages')}</strong>
            <small>{t('imageLimits')}</small>
            <input type="file" accept="image/*" multiple onChange={addFiles} disabled={processing || saving || !canEditMedia} aria-label={t('uploadImages')} />
          </label>
          <div className="url-box">
            <Link2 size={20} />
            <strong>{t('importByLink')}</strong>
            <div><input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." disabled={!canEditMedia} /><button type="button" onClick={addUrl} disabled={!canEditMedia}><UploadCloud size={14} /> {t('add')}</button></div>
          </div>
        </div>
        <p className="helper-text"><ImagePlus size={14} /> {t('imageHelper')}</p>
      </div>
      )}

      {showMediaEditor && images.length > 0 && (
        <div className="draft-images">
          {images.map((image, index) => (
            <article key={image.key}>
              <DraftMediaPreview image={image} />
              <div><strong>{index + 1}. {image.label}</strong><small>{index === 0 ? (isVideoMedia(image.input) ? t('mainVideo') : t('mainImage')) : (isVideoMedia(image.input) ? t('additionalVideo') : t('additionalImage'))}</small></div>
              <div className="draft-image-actions">
                <button type="button" onClick={() => moveImage(index, -1)} disabled={index === 0 || !canEditMedia} title={t('moveUp')}><ArrowUp size={16} /></button>
                <button type="button" onClick={() => moveImage(index, 1)} disabled={index === images.length - 1 || !canEditMedia} title={t('moveDown')}><ArrowDown size={16} /></button>
                <button type="button" onClick={() => setImages((current) => current.filter((item) => item.key !== image.key))} disabled={!canEditMedia} title={t('remove')}><Trash2 size={16} /></button>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>{t('cancel')}</button>
        <button type="submit" className="primary-button" disabled={saving || processing || cityCategories.length === 0 || (!product && !canCreateProduct)}>
          {saving ? t('sendSave') : processing ? t('processingImages') : t('saveProduct')}
        </button>
      </div>
    </form>
  );
}
