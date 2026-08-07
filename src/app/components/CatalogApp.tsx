import {
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  DatabaseBackup,
  FileText,
  GripVertical,
  ImageUp,
  Languages,
  LayoutGrid,
  List,
  LogOut,
  Menu,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  User as UserIcon,
  Users,
  Video,
  Wand2,
  X,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { translateAppError, useTranslation, type Language } from '../../i18n';
import { useAuth } from '../auth';
import { useCatalog } from '../catalog';
import { CatalogIcon } from '../icons';
import { contentLanguageFor, defaultCurrencyByLanguage, languageByCurrency, localizedCategoryTitle, localizedProductDescription, localizedProductName, localizedProductPrice, normalizedPrices } from '../localization';
import { knownMansionCoordinatesForProduct, mansionNumberForProduct, normalizeMansionDescriptionCoordinates } from '../mansionData';
import { isVideoMedia, mediaThumbUrl } from '../media';
import { hasAnyProductPermission, hasProductPermission, PRODUCT_PERMISSIONS } from '../permissions';
import type { Category, City, CurrencyCode, DescriptionTemplate, DraftImageInput, Product, ProductPermission } from '../types';
import { BackupDialog } from './BackupDialog';
import { CategoryForm } from './CategoryForm';
import { CityForm } from './CityForm';
import { CitySelect } from './CitySelect';
import { CloneCategoryDialog, CloneProductDialog } from './CloneDialog';
import { CurrencySelect } from './CurrencySelect';
import { DescriptionTemplatesPage } from './DescriptionTemplatesPage';
import { ConfirmDialog, type ConfirmOptions } from './ConfirmDialog';
import { Modal } from './Modal';
import { formatPrice, ProductCard } from './ProductCard';
import { ProductDetails } from './ProductDetails';
import { ProductForm } from './ProductForm';
import { Toast, type ToastState } from './Toast';
import { UserManagement } from './UserManagement';

interface DragState {
  type: 'category' | 'product';
  id: string;
}

interface DragPreview {
  productId: string;
  targetCategoryId: string;
  targetProductId?: string;
  insertPosition?: 'before' | 'after';
}

interface ProductPointerDrag {
  productId: string;
  sourceCategoryId: string;
  targetCategoryId: string;
  targetProductId?: string;
  insertPosition?: 'before' | 'after';
  pointerX: number;
  pointerY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  originLeft: number;
  containerLeft: number;
  containerTop: number;
  containerRight: number;
  containerBottom: number;
}

interface CategoryPointerDrag {
  categoryId: string;
  targetCategoryId?: string;
  pointerX: number;
  pointerY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

interface PendingConfirm extends ConfirmOptions {
  run: () => Promise<void>;
  successMessage: string;
}

interface BusyProgressState {
  done: number;
  total: number;
  currentName?: string;
  errors: Array<{ name: string; reason: string }>;
  finished?: boolean;
}

type ProductsPerPage = '10' | 'all';
type ProductSortMode = 'manual' | 'priceAsc' | 'priceDesc';
type ProductViewMode = 'grid' | 'list';

function CatalogControlSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) || options[0];

  return (
    <div className={`catalog-control-select${open ? ' open' : ''}`} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <span>{label}</span>
      <button type="button" onClick={() => setOpen((current) => !current)} aria-haspopup="listbox" aria-expanded={open}>
        <strong>{selected?.label || ''}</strong>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="catalog-control-menu" role="listbox">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={option.value === value ? 'selected' : ''}
              role="option"
              aria-selected={option.value === value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function clamp(value: number, minimum: number, maximum: number) {
  if (maximum < minimum) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

function swapById<T extends { id: string }>(items: T[], sourceId: string, targetId?: string) {
  if (!targetId || sourceId === targetId) return items;
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return items;
  const next = [...items];
  [next[sourceIndex], next[targetIndex]] = [next[targetIndex]!, next[sourceIndex]!];
  return next;
}

function insertById<T extends { id: string }>(items: T[], sourceId: string, targetId?: string, position: 'before' | 'after' = 'before') {
  if (!targetId || sourceId === targetId) return items;
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return items;
  const next = [...items];
  const [moved] = next.splice(sourceIndex, 1);
  if (!moved) return items;
  const nextTargetIndex = next.findIndex((item) => item.id === targetId);
  if (nextTargetIndex < 0) return items;
  next.splice(position === 'after' ? nextTargetIndex + 1 : nextTargetIndex, 0, moved);
  return next;
}

function orderByIds<T extends { id: string }>(items: T[], ids?: string[] | null) {
  if (!ids?.length) return items;
  const indexById = new Map(ids.map((id, index) => [id, index]));
  return [...items].sort((first, second) => {
    const firstIndex = indexById.get(first.id);
    const secondIndex = indexById.get(second.id);
    if (firstIndex === undefined && secondIndex === undefined) return 0;
    if (firstIndex === undefined) return 1;
    if (secondIndex === undefined) return -1;
    return firstIndex - secondIndex;
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textFromHtml(html = '') {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mansionStorage(product: Product) {
  if (product.storageWeight) return String(product.storageWeight).trim();
  const match = textFromHtml(product.descriptionHtml).match(/(?:Ba[u\u00fa]|Ba\u00fal|Storage|Armazenamento|Almacenamiento):\s*([0-9]+\s*T|SKORPION)/i);
  return match?.[1] ? match[1].trim().toUpperCase().replace(/\s+/g, '') : '';
}

function mansionCoordinates(product: Product) {
  const knownCoordinates = knownMansionCoordinatesForProduct(product);
  if (knownCoordinates) return knownCoordinates;
  if (product.coordinates) return String(product.coordinates).trim();
  const match = textFromHtml(product.descriptionHtml).match(/(?:CDS|Coordinates|Coordenadas):\s*([-0-9.,\s]+)/i);
  return match?.[1] ? match[1].trim().replace(/\s+/g, '') : '';
}

function standardMansionDescription(name: string, storage: string, coordinates: string) {
  return [
    '<p>' + escapeHtml(name) + '</p>',
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
    '<p>\u279d Armazenamento: ' + escapeHtml(storage) + '</p>',
    '',
    '<p>\u279d CDS: ' + escapeHtml(coordinates) + '</p>',
  ].join('\n');
}

function localizedStandardMansionDescription(name: string, storage: string, coordinates: string, language: Language) {
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

function canonicalDescriptionHtml(html = '') {
  if (typeof document === 'undefined') {
    return html.replace(/\s+/g, ' ').trim();
  }
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.innerHTML
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();
}

function isStandardMansionDescription(product: Product, language: Language) {
  const expected = localizedStandardMansionDescription(
    localizedProductName(product, language),
    mansionStorage(product),
    mansionCoordinates(product),
    language,
  );
  return canonicalDescriptionHtml(localizedProductDescription(product, language)) === canonicalDescriptionHtml(expected);
}

function templateHtmlForLanguage(template: DescriptionTemplate, language: Language) {
  if (language === 'en') return template.htmlEN || '';
  if (language === 'es') return template.htmlES || '';
  return template.htmlBR || '';
}

function applyProductDescriptionTemplate(templateHtml: string, product: Product, language: Language) {
  const replacements: Record<string, string> = {
    nome: localizedProductName(product, language),
    name: localizedProductName(product, language),
    armazenamento: mansionStorage(product),
    storage: mansionStorage(product),
    bau: mansionStorage(product),
    'baú': mansionStorage(product),
    cds: mansionCoordinates(product),
    coordinates: mansionCoordinates(product),
    coordenadas: mansionCoordinates(product),
  };

  return templateHtml.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, key: string) => (
    escapeHtml(replacements[String(key || '').trim().toLowerCase()] || '')
  ));
}

function productDescriptionTranslations(product: Product, template?: DescriptionTemplate) {
  const storage = mansionStorage(product);
  const coordinates = mansionCoordinates(product);
  const translations: Record<Language, string> = {
    pt: '',
    en: '',
    es: '',
  };

  (Object.keys(translations) as Language[]).forEach((itemLanguage) => {
    const templateHtml = template ? templateHtmlForLanguage(template, itemLanguage) : '';
    translations[itemLanguage] = templateHtml
      ? applyProductDescriptionTemplate(templateHtml, product, itemLanguage)
      : localizedStandardMansionDescription(
        localizedProductName(product, itemLanguage),
        storage,
        coordinates,
        itemLanguage,
      );
    translations[itemLanguage] = normalizeMansionDescriptionCoordinates(translations[itemLanguage], product);
  });

  return translations;
}

export function CatalogApp() {
  const { user, token, logout } = useAuth();
  const { language, locale, setLanguage, t } = useTranslation();
  const {
    catalog,
    loading,
    saveCity,
    deleteCity,
    saveCategory,
    deleteCategory,
    reorderCategories,
    saveProduct,
    translateProductLanguage,
    cloneProduct,
    cloneCategory,
    deleteProduct,
    reorderProducts,
    saveDescriptionTemplate,
    deleteDescriptionTemplate,
  } = useCatalog();
  const owner = user?.role === 'OWNER';
  const productPermissions = Object.fromEntries(
    PRODUCT_PERMISSIONS.map((permission) => [permission, hasProductPermission(user, permission)]),
  ) as Record<ProductPermission, boolean>;
  const canCreateProduct = productPermissions.createProduct === true;
  const canEditProduct = (
    productPermissions.editProductCategory ||
    productPermissions.editProductName ||
    productPermissions.editProductPrice ||
    productPermissions.editProductDescription ||
    productPermissions.editProductMedia ||
    productPermissions.markProductSold
  );
  const canCloneProduct = productPermissions.cloneProduct === true;
  const canDeleteProduct = productPermissions.deleteProduct === true;
  const canMoveProduct = productPermissions.moveProduct === true;
  const canShowProductActions = Boolean(canEditProduct || canCloneProduct || canDeleteProduct || canMoveProduct);
  const [productQuery, setProductQuery] = useState('');
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>(() => {
    if (typeof window === 'undefined') return defaultCurrencyByLanguage[language];
    const saved = window.localStorage.getItem('sg-display-currency');
    const valid: CurrencyCode | null = saved === 'BRL' || saved === 'USD' || saved === 'GBP' || saved === 'EUR' ? saved : null;
    return valid && languageByCurrency[valid] === language ? valid : defaultCurrencyByLanguage[language];
  });

  const [activeCityId, setActiveCityId] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cityModalOpen, setCityModalOpen] = useState(false);
  const [categoryModal, setCategoryModal] = useState<Category | 'new' | null>(null);
  const [productModal, setProductModal] = useState<Product | 'new' | null>(null);
  const [cloneProductModal, setCloneProductModal] = useState<Product | null>(null);
  const [cloneCategoryModal, setCloneCategoryModal] = useState<Category | null>(null);
  const [defaultCityId, setDefaultCityId] = useState<string | undefined>();
  const [defaultCategoryId, setDefaultCategoryId] = useState<string | undefined>();
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [usersOpen, setUsersOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [descriptionTemplatesOpen, setDescriptionTemplatesOpen] = useState(false);
  const [busyMessage, setBusyMessage] = useState('');
  const [busyProgress, setBusyProgress] = useState<BusyProgressState | null>(null);
  const [page, setPage] = useState(1);
  const [productsPerPage, setProductsPerPage] = useState<ProductsPerPage>('10');
  const [productSortMode, setProductSortMode] = useState<ProductSortMode>('manual');
  const [productViewMode, setProductViewMode] = useState<ProductViewMode>('grid');
  const [pendingCategoryIds, setPendingCategoryIds] = useState<string[] | null>(null);
  const [pendingProductOrders, setPendingProductOrders] = useState<Record<string, string[]>>({});
  const [confirmState, setConfirmState] = useState<PendingConfirm | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [productPointerDrag, setProductPointerDrag] = useState<ProductPointerDrag | null>(null);
  const [categoryPointerDrag, setCategoryPointerDrag] = useState<CategoryPointerDrag | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === 'undefined') return 320;
    const saved = Number(window.localStorage.getItem('sg-sidebar-width'));
    return Number.isFinite(saved) ? Math.min(460, Math.max(260, saved)) : 320;
  });
  const dragRef = useRef<DragState | null>(null);
  const categoryRefs = useRef(new Map<string, HTMLElement>());
  const categoryRectsRef = useRef(new Map<string, DOMRect>());
  const categoryPointerDragRef = useRef<CategoryPointerDrag | null>(null);
  const productCardRefs = useRef(new Map<string, HTMLElement>());
  const productRectsRef = useRef(new Map<string, DOMRect>());
  const productAnimationsRef = useRef(new Map<string, Animation>());
  const productPointerDragRef = useRef<ProductPointerDrag | null>(null);
  const productGridRef = useRef<HTMLDivElement | null>(null);
  const mansionPhotoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 2000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const orderedCategories = useMemo(
    () => orderByIds(catalog.categories, pendingCategoryIds),
    [catalog.categories, pendingCategoryIds],
  );
  const hasPendingOrderChanges = Boolean(pendingCategoryIds) || Object.keys(pendingProductOrders).length > 0;

  function productsFor(categoryId: string) {
    const orderedProducts = orderByIds(
      catalog.products.filter((product) => product.categoryId === categoryId),
      pendingProductOrders[categoryId],
    );
    if (pendingProductOrders[categoryId]) return orderedProducts;

    return [...orderedProducts].sort((first, second) => {
      const firstMansionNumber = mansionNumberForProduct(first);
      const secondMansionNumber = mansionNumberForProduct(second);
      if (firstMansionNumber && secondMansionNumber) {
        return Number(firstMansionNumber) - Number(secondMansionNumber);
      }
      if (firstMansionNumber) return -1;
      if (secondMansionNumber) return 1;
      return Number(first.order || 0) - Number(second.order || 0);
    });
  }

  function imagesForSave(product: Product): DraftImageInput[] {
    return product.images.map((image) => ({
      id: image.id,
      url: image.url,
      mediaType: image.mediaType || 'image',
      videoProvider: image.videoProvider,
      thumbnailUrl: image.thumbnailUrl,
    }));
  }

  function productHasRealImage(product: Product) {
    return product.images.some((image) => {
      const url = String(image.url || '').trim();
      if (!url) return false;
      if (url === '/mansion-placeholder.png') return false;
      if (/^data:image\/svg\+xml/i.test(url)) return false;
      if (/^data:image\//i.test(url)) return false;
      return true;
    });
  }

  function mansionNumberFromFileName(fileName: string) {
    const normalized = fileName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const match = normalized.match(/mansao\s*0*([0-9]+)/i);
    return match?.[1] ? match[1].padStart(2, '0') : '';
  }

  function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error(t('importAttachmentError')));
      reader.readAsDataURL(file);
    });
  }

  async function importMansionPhotos(files: FileList | null) {
    if (!activeCategory || !files?.length) return;
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (!imageFiles.length) return;

    const filesByMansion = new Map<string, File>();
    imageFiles.forEach((file) => {
      const mansionNumber = mansionNumberFromFileName(file.name);
      if (mansionNumber) filesByMansion.set(mansionNumber, file);
    });

    const products = productsFor(activeCategory.id);
    const pendingProducts = products.filter((product) => {
      const mansionNumber = mansionNumberForProduct(product);
      return mansionNumber && filesByMansion.has(mansionNumber) && !productHasRealImage(product);
    });

    if (!pendingProducts.length) {
      setToast({ kind: 'success', message: t('mansionPhotosAlreadyUpdated') });
      return;
    }

    const errors: Array<{ name: string; reason: string }> = [];
    setBusyMessage(t('updatingMansionPhotos'));
    setBusyProgress({
      done: 0,
      total: pendingProducts.length,
      currentName: localizedProductName(pendingProducts[0]!, language),
      errors,
    });

    try {
      for (let index = 0; index < pendingProducts.length; index += 1) {
        const product = pendingProducts[index]!;
        const productName = localizedProductName(product, language);
        const mansionNumber = mansionNumberForProduct(product);
        const file = filesByMansion.get(mansionNumber);
        setBusyProgress({ done: index, total: pendingProducts.length, currentName: productName, errors: [...errors] });

        try {
          if (!file) throw new Error(t('notImage', { name: productName }));
          const source = await readFileAsDataUrl(file);
          await saveProduct({
            id: product.id,
            categoryId: product.categoryId,
            coordinates: mansionCoordinates(product) || product.coordinates,
            storageWeight: mansionStorage(product) || product.storageWeight,
            name: product.name,
            descriptionHtml: product.descriptionHtml || localizedProductDescription(product, language),
            descriptionTranslations: product.descriptionTranslations,
            sourceLanguage: 'pt',
            autoTranslate: true,
            autoTranslateDescription: true,
            syncNameAcrossLanguages: false,
            sold: product.sold,
            soldOwnerName: product.soldOwnerName,
            soldOwnerDiscordId: product.soldOwnerDiscordId,
            order: product.order,
            prices: normalizedPrices(product),
            amount: product.amount,
            currency: product.currency,
            images: [{
              ...(product.images[0]?.id ? { id: product.images[0].id } : {}),
              sourceType: 'base64',
              source,
              name: file.name.replace(/\.[^.]+$/, ''),
              mediaType: 'image',
            }],
          });
        } catch (err) {
          console.error(err);
          errors.push({
            name: productName,
            reason: err instanceof Error ? err.message : translateAppError(err, t, 'genericActionError'),
          });
        }

        setBusyProgress({ done: index + 1, total: pendingProducts.length, currentName: productName, errors: [...errors] });
      }

      if (errors.length) {
        setBusyMessage(`${t('updatingMansionPhotos')} ${errors.length} erro(s).`);
        setBusyProgress({ done: pendingProducts.length, total: pendingProducts.length, errors, finished: true });
        setToast({ kind: 'error', message: `${errors.length} foto(s) n\u00e3o foram atualizadas. Veja os detalhes no modal.` });
        return;
      }

      setToast({ kind: 'success', message: t('mansionPhotosUpdated') });
    } finally {
      if (!errors.length) {
        setBusyMessage('');
        setBusyProgress(null);
      }
    }
  }

  async function standardizeActiveCategoryDescriptions() {
    if (!activeCategory) return;
    const products = productsFor(activeCategory.id);
    if (!products.length) return;
    const activeTemplate = (catalog.descriptionTemplates || [])
      .filter((template) => template.categoryId === activeCategory.id && template.active)
      .sort((first, second) => Number(first.order || 0) - Number(second.order || 0))[0];
    const templateHtml = activeTemplate ? templateHtmlForLanguage(activeTemplate, language) : '';
    const expectedDescriptionFor = (product: Product) => {
      return productDescriptionTranslations(product, activeTemplate)[language];
    };
    const pendingProducts = products.filter((product) => {
      if (!templateHtml) return !isStandardMansionDescription(product, language);
      return canonicalDescriptionHtml(localizedProductDescription(product, language)) !== canonicalDescriptionHtml(expectedDescriptionFor(product));
    });
    if (!pendingProducts.length) {
      setToast({ kind: 'success', message: 'Todas as descrições já estão no padrão.' });
      window.setTimeout(() => setToast(null), 2000);
      return;
    }

    const errors: Array<{ name: string; reason: string }> = [];
    const firstProductName = pendingProducts[0] ? localizedProductName(pendingProducts[0], language) : '';
    setBusyMessage('Padronizando descrições...');
    setBusyProgress({
      done: 0,
      total: pendingProducts.length,
      ...(firstProductName ? { currentName: firstProductName } : {}),
      errors,
    });
    try {
      for (let index = 0; index < pendingProducts.length; index += 1) {
        const product = pendingProducts[index]!;
        const productName = localizedProductName(product, language);
        setBusyProgress({ done: index, total: pendingProducts.length, currentName: productName, errors: [...errors] });
        try {
          const storage = mansionStorage(product);
          const coordinates = mansionCoordinates(product);
          if (!templateHtml && (!storage || !coordinates)) throw new Error('Produto sem baú ou CDS para montar a descrição.');
          const descriptions = productDescriptionTranslations(product, activeTemplate);
          const prices = normalizedPrices(product);
          const images: DraftImageInput[] = product.images.map((image) => ({
            id: image.id,
            url: image.url,
            mediaType: image.mediaType || 'image',
            videoProvider: image.videoProvider,
            thumbnailUrl: image.thumbnailUrl,
          }));
          await saveProduct({
            id: product.id,
            categoryId: product.categoryId,
            name: product.name,
            coordinates,
            storageWeight: storage,
            descriptionHtml: descriptions[language],
            descriptionTranslations: descriptions,
            sourceLanguage: contentLanguageFor(language),
            autoTranslate: true,
            autoTranslateDescription: true,
            syncNameAcrossLanguages: false,
            prices,
            amount: product.amount,
            currency: product.currency,
            images,
          });
        } catch (err) {
          console.error(err);
          errors.push({
            name: productName,
            reason: err instanceof Error ? err.message : translateAppError(err, t, 'genericActionError'),
          });
        }
        setBusyProgress({ done: index + 1, total: pendingProducts.length, currentName: productName, errors: [...errors] });
      }
      if (errors.length) {
        setBusyMessage('Padronização concluída com erros.');
        setBusyProgress({ done: pendingProducts.length, total: pendingProducts.length, errors, finished: true });
        setToast({ kind: 'error', message: `${errors.length} produto(s) não foram padronizados. Veja os detalhes no modal.` });
        return;
      }
      setToast({ kind: 'success', message: 'Descrições padronizadas com sucesso.' });
    } catch (err) {
      console.error(err);
      errors.push({ name: 'Processamento', reason: translateAppError(err, t, 'genericActionError') });
      setBusyMessage('Padronização interrompida.');
      setBusyProgress({
        done: Math.min(pendingProducts.length, errors.length),
        total: pendingProducts.length,
        errors: [...errors],
        finished: true,
      });
      setToast({ kind: 'error', message: translateAppError(err, t, 'genericActionError') });
    } finally {
      if (!errors.length) {
        setBusyMessage('');
        setBusyProgress(null);
      }
    }
  }

  async function translateActiveCategoryProducts() {
    if (!activeCategory) return;
    const products = productsFor(activeCategory.id);
    if (!products.length) return;

    const targetLanguage = contentLanguageFor(language);
    const errors: Array<{ name: string; reason: string }> = [];
    const firstProductName = products[0] ? localizedProductName(products[0], language) : '';

    setBusyMessage(t('translatingProducts'));
    setBusyProgress({
      done: 0,
      total: products.length,
      ...(firstProductName ? { currentName: firstProductName } : {}),
      errors,
    });

    try {
      for (let index = 0; index < products.length; index += 1) {
        const product = products[index]!;
        const productName = localizedProductName(product, language);
        setBusyProgress({ done: index, total: products.length, currentName: productName, errors: [...errors] });

        try {
          await translateProductLanguage(product.id, targetLanguage);
        } catch (err) {
          console.error(err);
          errors.push({
            name: productName,
            reason: err instanceof Error ? err.message : translateAppError(err, t, 'genericActionError'),
          });
        }

        setBusyProgress({ done: index + 1, total: products.length, currentName: productName, errors: [...errors] });
      }

      if (errors.length) {
        setBusyMessage(`${t('translatingProducts')} ${errors.length} erro(s).`);
        setBusyProgress({ done: products.length, total: products.length, errors, finished: true });
        setToast({ kind: 'error', message: `${errors.length} produto(s) nÃ£o foram traduzidos. Veja os detalhes no modal.` });
        return;
      }

      setToast({ kind: 'success', message: t('productsTranslated') });
    } catch (err) {
      console.error(err);
      errors.push({ name: 'Processamento', reason: translateAppError(err, t, 'genericActionError') });
      setBusyMessage(t('requestFailed'));
      setBusyProgress({ done: Math.min(products.length, errors.length), total: products.length, errors: [...errors], finished: true });
      setToast({ kind: 'error', message: translateAppError(err, t, 'genericActionError') });
    } finally {
      if (!errors.length) {
        setBusyMessage('');
        setBusyProgress(null);
      }
    }
  }

  const visibleCities = useMemo(() => catalog.cities, [catalog.cities]);
  const visibleCategories = useMemo(
    () => orderedCategories.filter((category) => !activeCityId || category.cityId === activeCityId),
    [activeCityId, orderedCategories],
  );
  const previewedVisibleCategories = useMemo(() => (
    categoryPointerDrag
      ? swapById(visibleCategories, categoryPointerDrag.categoryId, categoryPointerDrag.targetCategoryId)
      : visibleCategories
  ), [categoryPointerDrag, visibleCategories]);

  useEffect(() => {
    if (!catalog.cities.length) {
      setActiveCityId(null);
      setActiveCategoryId(null);
      return;
    }
    if (!activeCityId || !catalog.cities.some((city) => city.id === activeCityId)) {
      setActiveCityId(catalog.cities[0]!.id);
      return;
    }
    if (!visibleCategories.length) {
      setActiveCategoryId(null);
      return;
    }
    if (!activeCategoryId || !visibleCategories.some((category) => category.id === activeCategoryId)) {
      setActiveCategoryId(visibleCategories[0]!.id);
    }
  }, [activeCategoryId, activeCityId, catalog.categories, catalog.cities, visibleCategories]);

  const productFilter = productQuery.trim().toLowerCase();
  const activeCategory = catalog.categories.find((category) => category.id === activeCategoryId) ?? null;
  const activeCity = catalog.cities.find((city) => city.id === activeCityId) ?? null;
  const activeProducts = activeCategory
    ? productsFor(activeCategory.id)
        .filter((product) => !productFilter || localizedProductName(product, language).toLowerCase().includes(productFilter))
    : [];
  const sortedActiveProducts = useMemo(() => {
    if (productSortMode === 'manual') return activeProducts;
    return [...activeProducts].sort((first, second) => {
      const firstPrice = localizedProductPrice(first, displayCurrency).amount;
      const secondPrice = localizedProductPrice(second, displayCurrency).amount;
      const firstKnown = typeof firstPrice === 'number' && Number.isFinite(firstPrice);
      const secondKnown = typeof secondPrice === 'number' && Number.isFinite(secondPrice);
      if (firstKnown && secondKnown) {
        return productSortMode === 'priceAsc' ? firstPrice - secondPrice : secondPrice - firstPrice;
      }
      if (firstKnown) return -1;
      if (secondKnown) return 1;
      return 0;
    });
  }, [activeProducts, displayCurrency, productSortMode]);
  const previewedActiveProducts = useMemo(() => {
    if (!activeCategory || !dragPreview || dragPreview.targetCategoryId !== activeCategory.id) return sortedActiveProducts;
    const draggedProduct = catalog.products.find((product) => product.id === dragPreview.productId);
    if (!draggedProduct) return sortedActiveProducts;
    if (productFilter && !localizedProductName(draggedProduct, language).toLowerCase().includes(productFilter)) {
      return sortedActiveProducts.filter((product) => product.id !== draggedProduct.id);
    }
    return productSortMode === 'manual'
      ? insertById(sortedActiveProducts, draggedProduct.id, dragPreview.targetProductId, dragPreview.insertPosition)
      : sortedActiveProducts;
  }, [activeCategory, catalog.products, dragPreview, language, productFilter, productSortMode, productViewMode, sortedActiveProducts]);

  const pageSize = productsPerPage === 'all' ? Math.max(1, previewedActiveProducts.length) : 10;
  const totalPages = Math.max(1, Math.ceil(previewedActiveProducts.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = productsPerPage === 'all' ? 0 : (currentPage - 1) * pageSize;
  const pagedProducts = productsPerPage === 'all' ? previewedActiveProducts : previewedActiveProducts.slice(pageStart, pageStart + pageSize);
  const draggedProduct = productPointerDrag
    ? catalog.products.find((product) => product.id === productPointerDrag.productId) || null
    : null;
  const draggedProductMedia = draggedProduct?.images[0];
  const draggedProductThumb = draggedProductMedia ? mediaThumbUrl(draggedProductMedia) : '';
  const draggedCategory = categoryPointerDrag
    ? catalog.categories.find((category) => category.id === categoryPointerDrag.categoryId) || null
    : null;
  const activeProductDragId = productPointerDrag?.productId || null;
  function productListSortStyle(product: Product): CSSProperties | undefined {
    void product;
    return undefined;
  }
  const floatingProductLeft = productPointerDrag
    ? productViewMode === 'list'
      ? productPointerDrag.originLeft
      : clamp(
          productPointerDrag.pointerX - productPointerDrag.offsetX,
          productPointerDrag.containerLeft,
          productPointerDrag.containerRight - productPointerDrag.width,
        )
    : 0;
  const floatingProductTop = productPointerDrag
    ? clamp(
        productPointerDrag.pointerY - productPointerDrag.offsetY,
        productPointerDrag.containerTop,
        productPointerDrag.containerBottom - productPointerDrag.height,
      )
    : 0;

  useEffect(() => { setPage(1); }, [activeCategoryId, productFilter, productSortMode, productsPerPage]);
  useEffect(() => { setProductQuery(''); }, [activeCategoryId]);
  useEffect(() => { window.localStorage.setItem('sg-display-currency', displayCurrency); }, [displayCurrency]);
  useEffect(() => {
    productPointerDragRef.current = productPointerDrag;
  }, [productPointerDrag]);
  useEffect(() => {
    categoryPointerDragRef.current = categoryPointerDrag;
  }, [categoryPointerDrag]);
  useEffect(() => {
    if (!categoryPointerDrag) return;

    function onPointerMove(event: PointerEvent) {
      const current = categoryPointerDragRef.current;
      if (!current) return;
      event.preventDefault();
      autoScrollNearPointer(event.clientX, event.clientY);

      const targetCategoryId = categoryTargetFromPoint(event.clientX, event.clientY, current.categoryId);
      const { targetCategoryId: _previousTargetCategoryId, ...dragWithoutTarget } = current;
      const nextDrag: CategoryPointerDrag = targetCategoryId
        ? { ...dragWithoutTarget, pointerX: event.clientX, pointerY: event.clientY, targetCategoryId }
        : { ...dragWithoutTarget, pointerX: event.clientX, pointerY: event.clientY };

      categoryPointerDragRef.current = nextDrag;
      setCategoryPointerDrag(nextDrag);
    }

    function onPointerUp() {
      const current = categoryPointerDragRef.current;
      if (!current) return;
      void moveCategorySwap(current.targetCategoryId, current.categoryId);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      dragRef.current = null;
      setCategoryPointerDrag(null);
    }

    document.body.classList.add('product-sort-active');
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp, { once: true });
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.classList.remove('product-sort-active');
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [categoryPointerDrag, previewedVisibleCategories]);
  useEffect(() => {
    if (!activeProductDragId || !activeCategory) return;

    function onPointerMove(event: PointerEvent) {
      const current = productPointerDragRef.current;
      if (!current || !activeCategory) return;
      event.preventDefault();
      // A página fica travada durante o arrasto: só a sidebar rola sozinha.
      autoScrollSidebar(event.clientX, event.clientY);

      const containerRect = productGridRef.current?.getBoundingClientRect();
      const target = productTargetFromPoint(event.clientX, event.clientY, current.productId);
      const nextDrag: ProductPointerDrag = {
        ...current,
        pointerX: event.clientX,
        pointerY: event.clientY,
        targetCategoryId: activeCategory.id,
        ...(containerRect
          ? {
              containerLeft: containerRect.left,
              containerTop: containerRect.top,
              containerRight: containerRect.right,
              containerBottom: containerRect.bottom,
            }
          : {}),
        ...(target
          ? { targetProductId: target.productId, insertPosition: target.position }
          : {}),
      };

      productPointerDragRef.current = nextDrag;
      setProductPointerDrag(nextDrag);
      if (target) previewProductInsert(activeCategory.id, target.productId, target.position);
    }

    function onPointerUp() {
      const current = productPointerDragRef.current;
      if (!current) return;
      void moveProductInsert(current.targetCategoryId, current.targetProductId, current.insertPosition, current.productId);
    }

    function cancelPointerDrag() {
      dragRef.current = null;
      clearProductPreview();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') cancelPointerDrag();
    }

    function syncFloatingToViewport() {
      const current = productPointerDragRef.current;
      if (!current) return;
      const containerRect = productGridRef.current?.getBoundingClientRect();
      if (!containerRect) return;
      const nextDrag: ProductPointerDrag = {
        ...current,
        containerLeft: containerRect.left,
        containerTop: containerRect.top,
        containerRight: containerRect.right,
        containerBottom: containerRect.bottom,
      };
      productPointerDragRef.current = nextDrag;
      setProductPointerDrag(nextDrag);
    }

    // Trava a rolagem do documento para que os cards fiquem estáticos.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPadding = document.body.style.paddingRight;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

    document.body.classList.add('product-sort-active');
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp, { once: true });
    window.addEventListener('pointercancel', cancelPointerDrag, { once: true });
    window.addEventListener('blur', cancelPointerDrag, { once: true });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', syncFloatingToViewport, true);
    window.addEventListener('resize', syncFloatingToViewport);

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.paddingRight = previousBodyPadding;
      document.body.classList.remove('product-sort-active');
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', cancelPointerDrag);
      window.removeEventListener('blur', cancelPointerDrag);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', syncFloatingToViewport, true);
      window.removeEventListener('resize', syncFloatingToViewport);
    };
  }, [activeCategory?.id, activeProductDragId, productViewMode]);
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nextRects = new Map<string, DOMRect>();

    for (const animation of productAnimationsRef.current.values()) animation.cancel();
    productAnimationsRef.current.clear();

    for (const product of pagedProducts) {
      const element = productCardRefs.current.get(product.id);
      if (!element) continue;
      const nextRect = element.getBoundingClientRect();
      const previousRect = productRectsRef.current.get(product.id);
      nextRects.set(product.id, nextRect);

      if (!previousRect || prefersReducedMotion) continue;
      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) continue;

      const duration = dragPreview ? 210 : 260;
      const easing = 'cubic-bezier(.2, .8, .2, 1)';
      if (typeof element.animate === 'function') {
        const animation = element.animate(
          [
            { transform: `translate(${deltaX}px, ${deltaY}px)` },
            { transform: 'translate(0, 0)' },
          ],
          { duration, easing },
        );
        productAnimationsRef.current.set(product.id, animation);
        animation.onfinish = () => {
          if (productAnimationsRef.current.get(product.id) === animation) {
            productAnimationsRef.current.delete(product.id);
          }
        };
      } else {
        element.style.transition = 'none';
        element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        window.requestAnimationFrame(() => {
          element.style.transition = `transform ${duration}ms ${easing}`;
          element.style.transform = 'translate(0, 0)';
        });
        window.setTimeout(() => {
          element.style.transition = '';
          element.style.transform = '';
        }, duration + 40);
      }
    }

    productRectsRef.current = nextRects;
  }, [dragPreview, pagedProducts]);
  useEffect(() => () => {
    for (const animation of productAnimationsRef.current.values()) animation.cancel();
    productAnimationsRef.current.clear();
  }, []);
  // Rolagem muda o retângulo dos cards; rebaseia as medidas do FLIP para que
  // nenhum card anime por causa do scroll.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    function rebaseRects() {
      for (const [id, element] of productCardRefs.current) {
        productRectsRef.current.set(id, element.getBoundingClientRect());
      }
      for (const [id, element] of categoryRefs.current) {
        categoryRectsRef.current.set(id, element.getBoundingClientRect());
      }
    }
    window.addEventListener('scroll', rebaseRects, true);
    window.addEventListener('resize', rebaseRects);
    return () => {
      window.removeEventListener('scroll', rebaseRects, true);
      window.removeEventListener('resize', rebaseRects);
    };
  }, []);
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nextRects = new Map<string, DOMRect>();

    for (const category of previewedVisibleCategories) {
      const element = categoryRefs.current.get(category.id);
      if (!element) continue;
      const nextRect = element.getBoundingClientRect();
      const previousRect = categoryRectsRef.current.get(category.id);
      nextRects.set(category.id, nextRect);

      if (!previousRect || prefersReducedMotion) continue;
      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) continue;

      const duration = categoryPointerDrag ? 210 : 260;
      const easing = 'cubic-bezier(.2, .8, .2, 1)';
      if (typeof element.animate === 'function') {
        element.animate(
          [
            { transform: `translate(${deltaX}px, ${deltaY}px)` },
            { transform: 'translate(0, 0)' },
          ],
          { duration, easing },
        );
      } else {
        element.style.transition = 'none';
        element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        window.requestAnimationFrame(() => {
          element.style.transition = `transform ${duration}ms ${easing}`;
          element.style.transform = 'translate(0, 0)';
        });
        window.setTimeout(() => {
          element.style.transition = '';
          element.style.transform = '';
        }, duration + 40);
      }
    }

    categoryRectsRef.current = nextRects;
  }, [categoryPointerDrag, previewedVisibleCategories]);
  useEffect(() => {
    const onLanguageSelected = (event: Event) => {
      const selected = (event as CustomEvent<string>).detail;
      if (selected === 'pt' || selected === 'en' || selected === 'es') {
        setDisplayCurrency(defaultCurrencyByLanguage[selected]);
      }
    };

    window.addEventListener('sg-language-selected', onLanguageSelected);
    return () => window.removeEventListener('sg-language-selected', onLanguageSelected);
  }, []);

  function changeDisplayCurrency(currency: CurrencyCode) {
    setDisplayCurrency(currency);
    const nextLanguage = languageByCurrency[currency];
    if (nextLanguage !== language) setLanguage(nextLanguage);
  }

  function selectCity(cityId: string) {
    const cityCategories = catalog.categories.filter((category) => category.cityId === cityId);
    setActiveCityId(cityId);
    setActiveCategoryId(cityCategories[0]?.id || null);
    setBackupOpen(false);
    setDescriptionTemplatesOpen(false);
  }

  function previewProductInsert(targetCategoryId: string, targetProductId?: string, insertPosition: 'before' | 'after' = 'before') {
    const drag = dragRef.current;
    if (!owner || drag?.type !== 'product') return;
    if (targetProductId === drag.id) return;
    setDragPreview((current) => {
      if (
        current?.productId === drag.id &&
        current.targetCategoryId === targetCategoryId &&
        current.targetProductId === targetProductId &&
        current.insertPosition === insertPosition
      ) return current;
      return targetProductId ? { productId: drag.id, targetCategoryId, targetProductId, insertPosition } : { productId: drag.id, targetCategoryId };
    });
  }

  function clearProductPreview() {
    productPointerDragRef.current = null;
    setDragPreview(null);
    setProductPointerDrag(null);
  }

  function autoScrollNearPointer(clientX: number, clientY: number) {
    const margin = 72;
    const maxStep = 18;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let scrollX = 0;
    let scrollY = 0;

    if (clientY < margin) scrollY = -Math.ceil(((margin - clientY) / margin) * maxStep);
    else if (clientY > viewportHeight - margin) scrollY = Math.ceil(((clientY - (viewportHeight - margin)) / margin) * maxStep);

    if (clientX < margin) scrollX = -Math.ceil(((margin - clientX) / margin) * maxStep);
    else if (clientX > viewportWidth - margin) scrollX = Math.ceil(((clientX - (viewportWidth - margin)) / margin) * maxStep);

    if (scrollX || scrollY) window.scrollBy({ left: scrollX, top: scrollY, behavior: 'auto' });

    autoScrollSidebar(clientX, clientY);
  }

  function autoScrollSidebar(clientX: number, clientY: number) {
    const margin = 72;
    const maxStep = 18;
    const sidebar = document.querySelector<HTMLElement>('.shop-sidebar');
    if (!sidebar) return;
    const rect = sidebar.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;
    if (clientY < rect.top + margin) sidebar.scrollTop -= Math.ceil(((rect.top + margin - clientY) / margin) * maxStep);
    else if (clientY > rect.bottom - margin) sidebar.scrollTop += Math.ceil(((clientY - (rect.bottom - margin)) / margin) * maxStep);
  }

  function categoryTargetFromPoint(clientX: number, clientY: number, draggedCategoryId: string) {
    const entries = previewedVisibleCategories
      .filter((category) => category.id !== draggedCategoryId)
      .map((category) => {
        const element = categoryRefs.current.get(category.id);
        return element ? { category, rect: element.getBoundingClientRect() } : null;
      })
      .filter((entry): entry is { category: Category; rect: DOMRect } => Boolean(entry));

    const containing = entries.find((entry) =>
      clientX >= entry.rect.left &&
      clientX <= entry.rect.right &&
      clientY >= entry.rect.top &&
      clientY <= entry.rect.bottom
    );
    if (containing) return containing.category.id;

    let nearest: { category: Category; distance: number } | null = null;
    for (const entry of entries) {
      const centerX = entry.rect.left + entry.rect.width / 2;
      const centerY = entry.rect.top + entry.rect.height / 2;
      const distance = Math.hypot(clientX - centerX, clientY - centerY);
      if (distance > Math.max(entry.rect.width, entry.rect.height)) continue;
      if (!nearest || distance < nearest.distance) nearest = { category: entry.category, distance };
    }
    return nearest?.category.id;
  }

  function productInsertFromRect(rect: DOMRect, clientX: number, clientY: number): 'before' | 'after' {
    if (productViewMode === 'list') return clientY > rect.top + rect.height / 2 ? 'after' : 'before';
    const horizontal = clientX > rect.left + rect.width / 2;
    const vertical = clientY > rect.top + rect.height / 2;
    return horizontal || vertical ? 'after' : 'before';
  }

  function productTargetFromPoint(clientX: number, clientY: number, draggedProductId: string) {
    const entries = pagedProducts
      .filter((product) => product.id !== draggedProductId)
      .map((product) => {
        const element = productCardRefs.current.get(product.id);
        return element ? { product, rect: element.getBoundingClientRect() } : null;
      })
      .filter((entry): entry is { product: Product; rect: DOMRect } => Boolean(entry));

    if (!entries.length) return undefined;

    if (productViewMode === 'list') {
      const orderedEntries = [...entries].sort((first, second) => first.rect.top - second.rect.top);
      const firstEntry = orderedEntries[0]!;
      const lastEntry = orderedEntries[orderedEntries.length - 1]!;

      if (clientY <= firstEntry.rect.top + firstEntry.rect.height / 2) {
        return { productId: firstEntry.product.id, position: 'before' as const };
      }
      if (clientY >= lastEntry.rect.top + lastEntry.rect.height / 2) {
        return { productId: lastEntry.product.id, position: 'after' as const };
      }

      const nearest = orderedEntries.reduce((best, entry) => {
        const distance = Math.abs(clientY - (entry.rect.top + entry.rect.height / 2));
        return !best || distance < best.distance ? { entry, distance } : best;
      }, null as { entry: { product: Product; rect: DOMRect }; distance: number } | null);

      return nearest
        ? { productId: nearest.entry.product.id, position: productInsertFromRect(nearest.entry.rect, clientX, clientY) }
        : undefined;
    }

    const containerRect = productGridRef.current?.getBoundingClientRect();
    const targetX = containerRect ? clamp(clientX, containerRect.left, containerRect.right) : clientX;
    const targetY = containerRect ? clamp(clientY, containerRect.top, containerRect.bottom) : clientY;

    const containing = entries.find((entry) =>
      targetX >= entry.rect.left &&
      targetX <= entry.rect.right &&
      targetY >= entry.rect.top &&
      targetY <= entry.rect.bottom
    );
    if (containing) return { productId: containing.product.id, position: productInsertFromRect(containing.rect, targetX, targetY) };

    const orderedEntries = [...entries].sort((first, second) => (
      Math.abs(first.rect.top - second.rect.top) > 8
        ? first.rect.top - second.rect.top
        : first.rect.left - second.rect.left
    ));
    const firstEntry = orderedEntries[0];
    const lastEntry = orderedEntries[orderedEntries.length - 1];
    if (firstEntry && targetY < firstEntry.rect.top) return { productId: firstEntry.product.id, position: 'before' as const };
    if (lastEntry && targetY > lastEntry.rect.bottom) return { productId: lastEntry.product.id, position: 'after' as const };

    let nearest: { product: Product; rect: DOMRect; distance: number } | null = null;
    for (const entry of entries) {
      const centerX = entry.rect.left + entry.rect.width / 2;
      const centerY = entry.rect.top + entry.rect.height / 2;
      const distance = Math.hypot(targetX - centerX, targetY - centerY);
      if (!nearest || distance < nearest.distance) nearest = { product: entry.product, rect: entry.rect, distance };
    }
    return nearest ? { productId: nearest.product.id, position: productInsertFromRect(nearest.rect, targetX, targetY) } : undefined;
  }

  function startCategoryPointerDrag(category: Category, event: ReactPointerEvent<HTMLElement>) {
    if (!owner) return;
    const element = categoryRefs.current.get(category.id);
    if (!element) return;

    event.preventDefault();
    event.stopPropagation();

    const rect = element.getBoundingClientRect();
    const nextDrag: CategoryPointerDrag = {
      categoryId: category.id,
      pointerX: event.clientX,
      pointerY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    };

    dragRef.current = { type: 'category', id: category.id };
    categoryPointerDragRef.current = nextDrag;
    setCategoryPointerDrag(nextDrag);
  }

  function startProductPointerDrag(product: Product, event: ReactPointerEvent<HTMLButtonElement>) {
    if (!owner || !activeCategory) return;
    if (productSortMode !== 'manual') return;
    if (event.button !== 0 || productPointerDragRef.current) return;
    const element = productCardRefs.current.get(product.id);
    if (!element) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const rect = element.getBoundingClientRect();
    const containerRect = productGridRef.current?.getBoundingClientRect() || rect;
    const nextDrag: ProductPointerDrag = {
      productId: product.id,
      sourceCategoryId: product.categoryId,
      targetCategoryId: activeCategory.id,
      pointerX: event.clientX,
      pointerY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      originLeft: rect.left,
      containerLeft: containerRect.left,
      containerTop: containerRect.top,
      containerRight: containerRect.right,
      containerBottom: containerRect.bottom,
    };

    dragRef.current = { type: 'product', id: product.id };
    productPointerDragRef.current = nextDrag;
    setProductPointerDrag(nextDrag);
    setDragPreview(null);
  }


  function pageItems(): Array<number | 'gap'> {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const items: Array<number | 'gap'> = [1];
    const from = Math.max(2, currentPage - 1);
    const to = Math.min(totalPages - 1, currentPage + 1);
    if (from > 2) items.push('gap');
    for (let i = from; i <= to; i += 1) items.push(i);
    if (to < totalPages - 1) items.push('gap');
    items.push(totalPages);
    return items;
  }

  async function runBusy(message: string, task: () => Promise<void>) {
    setBusyMessage(message);
    try {
      await task();
    } catch (err) {
      setToast({ kind: 'error', message: translateAppError(err, t, 'genericActionError') });
    } finally {
      setBusyMessage('');
    }
  }

  async function confirmAndRun() {
    if (!confirmState) return;
    const { run, successMessage } = confirmState;
    try {
      await run();
      setConfirmState(null);
      setToast({ kind: 'success', message: successMessage });
    } catch (err) {
      setConfirmState(null);
      setToast({ kind: 'error', message: translateAppError(err, t, 'genericDeleteError') });
    }
  }

  function startSidebarResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;

    function onMove(moveEvent: PointerEvent) {
      const next = Math.min(460, Math.max(260, startWidth + moveEvent.clientX - startX));
      setSidebarWidth(next);
      window.localStorage.setItem('sg-sidebar-width', String(Math.round(next)));
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }


  function moveCategorySwap(targetId?: string, explicitCategoryId?: string) {
    const drag = dragRef.current;
    const categoryId = explicitCategoryId || (drag?.type === 'category' ? drag.id : '');
    setCategoryPointerDrag(null);
    if (!owner || !categoryId || !targetId || categoryId === targetId) {
      dragRef.current = null;
      return;
    }
    const ids = swapById(orderedCategories, categoryId, targetId).map((category) => category.id);
    dragRef.current = null;
    setPendingCategoryIds(ids);
  }

  function moveProductInsert(targetCategoryId: string, targetProductId?: string, insertPosition: 'before' | 'after' = 'before', explicitProductId?: string) {
    const drag = dragRef.current;
    const productId = explicitProductId || (drag?.type === 'product' ? drag.id : '');
    clearProductPreview();
    if (!owner || !productId) return;
    if (!targetProductId || targetProductId === productId) {
      dragRef.current = null;
      return;
    }
    const product = productsFor(targetCategoryId).find((item) => item.id === productId);
    const targetProduct = productsFor(targetCategoryId).find((item) => item.id === targetProductId);
    if (!product || !targetProduct || targetProduct.categoryId !== targetCategoryId || product.categoryId !== targetCategoryId) {
      dragRef.current = null;
      return;
    }

    dragRef.current = null;
    const nextProducts = insertById(productsFor(targetCategoryId), productId, targetProductId, insertPosition);
    setPendingProductOrders((current) => ({
      ...current,
      [targetCategoryId]: nextProducts.map((item) => item.id),
    }));
  }

  function moveProductStep(product: Product, direction: -1 | 1) {
    if (!owner || productSortMode !== 'manual') return;
    const categoryProducts = productsFor(product.categoryId);
    const currentIndex = categoryProducts.findIndex((item) => item.id === product.id);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= categoryProducts.length) return;

    const nextProducts = [...categoryProducts];
    [nextProducts[currentIndex], nextProducts[targetIndex]] = [nextProducts[targetIndex]!, nextProducts[currentIndex]!];
    setPendingProductOrders((current) => ({
      ...current,
      [product.categoryId]: nextProducts.map((item) => item.id),
    }));
  }

  async function savePendingOrderChanges() {
    if (!hasPendingOrderChanges) return;
    const categoryIds = pendingCategoryIds;
    const productOrders = Object.entries(pendingProductOrders).map(([categoryId, productIds]) => ({ categoryId, productIds }));

    await runBusy(t('savingChanges'), async () => {
      if (categoryIds) await reorderCategories(categoryIds);
      if (productOrders.length) await reorderProducts(productOrders);
      setPendingCategoryIds(null);
      setPendingProductOrders({});
      setToast({ kind: 'success', message: t('changesSaved') });
    });
  }

  function discardPendingOrderChanges() {
    setPendingCategoryIds(null);
    setPendingProductOrders({});
    clearProductPreview();
    dragRef.current = null;
  }

  return (
    <div className="app-shell" style={{ '--sidebar-width': `${sidebarWidth}px` } as CSSProperties}>
      <div className="site-background" aria-hidden="true" />
      <div className="shop-layout" style={{ '--sidebar-width': `${sidebarWidth}px` } as CSSProperties}>
        {menuOpen && <div className="shop-backdrop" onClick={() => setMenuOpen(false)} />}

        <aside className={`shop-sidebar${menuOpen ? ' open' : ''}`}>
          <button type="button" className="sidebar-resizer" onPointerDown={startSidebarResize} aria-label={t('resizeSidebar')} title={t('resizeSidebar')} />
          <div className="shop-sidebar-head">
            <img src="/alpha-logo.png" alt={t('siteName')} />
            <div>
              <h2>{t('siteName')}</h2>
              <p>{t('appTitle')}</p>
            </div>
          </div>


          <nav className="shop-nav">
            <h3>{t('categories')}</h3>
            {visibleCities.length > 0 && (
              <div className="sidebar-city-picker">
                <CitySelect cities={visibleCities} value={activeCityId || visibleCities[0]?.id || ''} onChange={selectCity} compact />
              </div>
            )}
            <div className="shop-category-menu">
              {previewedVisibleCategories.map((category) => {
                const products = productsFor(category.id);
                const isActive = category.id === activeCategoryId;
              return (
                <section
                  key={category.id}
                  ref={(node) => {
                    if (node) categoryRefs.current.set(category.id, node);
                    else categoryRefs.current.delete(category.id);
                  }}
                  className={`shop-accordion${isActive && !backupOpen && !descriptionTemplatesOpen ? ' active' : ''}${categoryPointerDrag?.categoryId === category.id ? ' is-dragging' : ''}${categoryPointerDrag?.targetCategoryId === category.id ? ' is-drop-target' : ''}`}
                >
                  <button
                    type="button"
                    className="shop-accordion-head"
                    onClick={() => {
                      setActiveCategoryId(category.id);
                      setBackupOpen(false);
                      setDescriptionTemplatesOpen(false);
                      setMenuOpen(false);
                    }}
                  >
                    {owner && (
                      <span
                        className="sidebar-drag-handle"
                        onPointerDown={(event) => startCategoryPointerDrag(category, event)}
                        onClick={(event) => event.stopPropagation()}
                        title={t('moveCategory')} aria-label={t('moveCategory')}
                      >
                        <GripVertical size={15} />
                      </span>
                    )}
                    <CatalogIcon name={category.icon} size={17} />
                    <span className="label">{localizedCategoryTitle(category, language)}</span>
                    <small>{products.length}</small>
                  </button>
                </section>
              );
            })}
            </div>
            {!visibleCities.length && !loading && (
              <p style={{ padding: '0 10px', color: 'rgba(255,255,255,.35)', fontSize: 12 }}>{t('noCategoryFound')}</p>
            )}
          </nav>

          <div className="shop-sidebar-foot">
            {owner && (
              <div className="shop-owner-actions">
                <button type="button" className="shop-menu-item users-button" onClick={() => setUsersOpen(true)}><Users size={17} /> <span className="users-label-gradient">{t('users')}</span></button>
                <button type="button" className="shop-menu-item" onClick={() => setCityModalOpen(true)}><Plus size={17} /> {t('addCity')}</button>
                <button type="button" className="shop-menu-item" onClick={() => { setDefaultCityId(activeCityId || undefined); setCategoryModal('new'); }}><Plus size={17} /> {t('category')}</button>
                <button
                  type="button"
                  className={`shop-menu-item${descriptionTemplatesOpen ? ' active' : ''}`}
                  onClick={() => {
                    setDescriptionTemplatesOpen(true);
                    setBackupOpen(false);
                    setMenuOpen(false);
                  }}
                >
                  <FileText size={17} /> Descrição Padrão
                </button>
                <button
                  type="button"
                  className={`shop-menu-item backup-button${backupOpen ? ' active' : ''}`}
                  onClick={() => {
                    setBackupOpen(true);
                    setDescriptionTemplatesOpen(false);
                    setMenuOpen(false);
                  }}
                >
                  <DatabaseBackup size={17} /> {t('backup')}
                </button>
              </div>

            )}
            <div className="shop-user">
              <div><UserIcon size={19} /></div>
              <div>
                <p>{user?.name}</p>
                <small>{owner ? t('owner') : t('commercial')}</small>
              </div>
              <button type="button" className="logout" onClick={() => void logout()} title={t('logout')} aria-label={t('logout')}><LogOut size={16} /></button>
            </div>
          </div>
        </aside>

        <main className="shop-main">
          <div className="shop-topline">
            <button type="button" className="mobile-menu-toggle" onClick={() => setMenuOpen((value) => !value)} aria-label={t('menu')} title={t('menu')}>
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="catalog-currency-control">
              <span>{t('currency')}</span>
              <CurrencySelect value={displayCurrency} onChange={changeDisplayCurrency} />
            </div>
          </div>


          {descriptionTemplatesOpen ? (
            <DescriptionTemplatesPage
              categories={catalog.categories}
              templates={catalog.descriptionTemplates || []}
              onSave={saveDescriptionTemplate}
              onDelete={deleteDescriptionTemplate}
            />
          ) : backupOpen ? (
            <BackupDialog token={token} />
          ) : loading ? (
            <div className="center-message large"><span className="spinner" /> {t('loadingCatalog')}</div>
          ) : !activeCategory ? (
            <section className="empty-state">
              <Boxes size={46} />
              <h2>{t('noCategoryCreated')}</h2>
              <p>{activeCity ? t('ownerCreateFirst') : t('ownerCreateFirstCity')}</p>
              {owner && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    if (activeCity) {
                      setDefaultCityId(activeCity.id);
                      setCategoryModal('new');
                    } else setCityModalOpen(true);
                  }}
                >
                  <Plus size={17} /> {activeCity ? t('createFirstCategory') : t('addCity')}
                </button>
              )}
            </section>
          ) : (
            <>
              <div className="shop-head">
                <span>{t('catalogCityBreadcrumb', { city: activeCity?.name || '', category: localizedCategoryTitle(activeCategory, language) })}</span>
                <h1>{localizedCategoryTitle(activeCategory, language)}</h1>
                <p>{t(activeProducts.length === 1 ? 'availableOne' : 'availableMany', { count: activeProducts.length })}</p>
              </div>

              <div className="category-filter">
                <Search size={16} />
                <input
                  value={productQuery}
                  onChange={(event) => setProductQuery(event.target.value)}
                  placeholder={t('searchProductIn', { category: localizedCategoryTitle(activeCategory, language) })}
                />
                {productQuery && (
                  <button type="button" onClick={() => setProductQuery('')} aria-label={t('clearSearch')} title={t('clearSearch')}><X size={15} /></button>
                )}
              </div>

              <div className="catalog-list-controls" aria-label={t('productFilters')}>
                <CatalogControlSelect<ProductsPerPage>
                  label={t('show')}
                  value={productsPerPage}
                  onChange={setProductsPerPage}
                  options={[
                    { value: '10', label: t('tenPerPage') },
                    { value: 'all', label: t('allProducts') },
                  ]}
                />
                <CatalogControlSelect<ProductSortMode>
                  label={t('sort')}
                  value={productSortMode}
                  onChange={setProductSortMode}
                  options={[
                    { value: 'manual', label: t('defaultOrder') },
                    { value: 'priceAsc', label: t('priceLowToHigh') },
                    { value: 'priceDesc', label: t('priceHighToLow') },
                  ]}
                />
                <div className="view-mode-toggle" role="group" aria-label={t('productFilters')}>
                  <button type="button" className={productViewMode === 'grid' ? 'active' : ''} onClick={() => setProductViewMode('grid')} title={t('showGridView')}>
                    <LayoutGrid size={15} /> {t('gridView')}
                  </button>
                  <button type="button" className={productViewMode === 'list' ? 'active' : ''} onClick={() => setProductViewMode('list')} title={t('showListView')}>
                    <List size={15} /> {t('listView')}
                  </button>
                </div>
              </div>


              {(owner || canCreateProduct) && (
                <div className="owner-actions" style={{ justifyContent: 'flex-start', margin: '18px 0 24px' }}>
                  {canCreateProduct && <button type="button" className="secondary-button" onClick={() => { setDefaultCategoryId(activeCategory.id); setProductModal('new'); }}><Plus size={16} /> {t('product')}</button>}
                  {owner && <button type="button" className="secondary-button" onClick={() => setCategoryModal(activeCategory)}><Pencil size={16} /> {t('editCategory')}</button>}
                  {owner && <button type="button" className="secondary-button" onClick={() => setCloneCategoryModal(activeCategory)}><CopyPlus size={16} /> {t('cloneCategory')}</button>}
                  {owner && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        setConfirmState({
                          title: t('deleteCategory'),
                          message: t('deleteCategoryMessage', { name: localizedCategoryTitle(activeCategory, language) }),
                          warning: t('deleteCategoryWarning'),
                          confirmLabel: t('deleteCategory'),
                          successMessage: t('categoryDeleted'),
                          run: () => deleteCategory(activeCategory.id),
                        })
                      }
                    >
                      <Trash2 size={16} /> {t('delete')}
                    </button>
                  )}
                  {productPermissions.editProductDescription && (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={!activeProducts.length || Boolean(busyMessage)}
                      onClick={() => void standardizeActiveCategoryDescriptions()}
                    >
                      <Wand2 size={16} /> {t('standardizeDescriptions')}
                    </button>
                  )}
                  {owner && (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={!activeProducts.length || Boolean(busyMessage)}
                      onClick={() => void translateActiveCategoryProducts()}
                    >
                      <Languages size={16} /> {t('translateProducts')}
                    </button>
                  )}
                  {productPermissions.editProductMedia && (
                    <>
                      <input
                        ref={mansionPhotoInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        style={{ display: 'none' }}
                        onChange={(event) => {
                          void importMansionPhotos(event.currentTarget.files);
                          event.currentTarget.value = '';
                        }}
                      />
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={!activeProducts.length || Boolean(busyMessage)}
                        onClick={() => mansionPhotoInputRef.current?.click()}
                      >
                        <ImageUp size={16} /> {t('updateMansionPhotos')}
                      </button>
                    </>
                  )}
                </div>
              )}

              {activeProducts.length ? (
                <div
                  ref={productGridRef}
                  className={`products-grid ${productViewMode === 'list' ? 'is-list' : 'is-grid'}${activeProductDragId ? ' is-sorting' : ''}`}
                >
                  {pagedProducts.map((product) => {
                    const categoryProducts = productsFor(product.categoryId);
                    const productOrderIndex = categoryProducts.findIndex((item) => item.id === product.id);
                    return (
                      <ProductCard
                        key={product.id}
                        product={product}
                        owner={canShowProductActions}
                        displayCurrency={displayCurrency}
                        isDragging={activeProductDragId === product.id}
                        isDropTarget={dragPreview?.targetCategoryId === activeCategory.id && dragPreview?.targetProductId === product.id}
                        sortStyle={productListSortStyle(product)}
                        cardRef={(node) => {
                          if (node) productCardRefs.current.set(product.id, node);
                          else productCardRefs.current.delete(product.id);
                        }}
                        onOpen={() => setDetailProduct(product)}
                        onEdit={() => setProductModal(product)}
                        onClone={() => setCloneProductModal(product)}
                        onDelete={() =>
                          setConfirmState({
                            title: t('deleteProduct'),
                            message: t('deleteProductMessage', { name: localizedProductName(product, language) }),
                            warning: t('irreversible'),
                            confirmLabel: t('deleteProduct'),
                            successMessage: t('productDeleted'),
                            run: () => deleteProduct(product.id),
                          })
                        }
                        onMoveUp={() => void moveProductStep(product, -1)}
                        onMoveDown={() => void moveProductStep(product, 1)}
                        canEdit={canEditProduct}
                        canClone={canCloneProduct}
                        canDelete={canDeleteProduct}
                        canMoveUp={canMoveProduct && productSortMode === 'manual' && productOrderIndex > 0 && !busyMessage}
                        canMoveDown={canMoveProduct && productSortMode === 'manual' && productOrderIndex >= 0 && productOrderIndex < categoryProducts.length - 1 && !busyMessage}
                        showOrderActions={canMoveProduct && productViewMode === 'list'}
                        showMoveGrip={canMoveProduct && productViewMode === 'list' && productSortMode === 'manual'}
                        onMovePointerDown={(event) => startProductPointerDrag(product, event)}
                      />
                    );
                  })}
                </div>
              ) : (
                <div
                  className="category-empty"
                >
                  {t('emptyCategory')}{canCreateProduct && ` ${t('emptyCategoryOwnerHint')}`}
                </div>
              )}

              {productsPerPage !== 'all' && previewedActiveProducts.length > pageSize && (
                <nav className="pager" aria-label={t('paginationLabel')}>
                  <p className="pager-info">
                    {t('paginationInfo', { from: pageStart + 1, to: Math.min(pageStart + pageSize, previewedActiveProducts.length), total: previewedActiveProducts.length, page: currentPage, pages: totalPages })}
                  </p>
                  <button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1} aria-label={t('previousPage')} title={t('previousPage')}>
                    <ChevronLeft size={16} />
                  </button>
                  {pageItems().map((item, index) =>
                    item === 'gap' ? (
                      <span key={`gap-${index}`} className="pager-gap">…</span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        className={item === currentPage ? 'active' : ''}
                        onClick={() => setPage(item)}
                        aria-current={item === currentPage ? 'page' : undefined}
                        aria-label={t('pageNumber', { page: item })}
                        title={t('pageNumber', { page: item })}
                      >
                        {item}
                      </button>
                    ),
                  )}
                  <button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= totalPages} aria-label={t('nextPage')} title={t('nextPage')}>
                    <ChevronRight size={16} />
                  </button>
                </nav>
              )}
            </>
          )}
        </main>
      </div>

      {owner && hasPendingOrderChanges && (
        <div className="pending-save-bar" role="status" aria-label={t('pendingChanges')}>
          <span>{t('pendingChanges')}</span>
          <button type="button" className="secondary-button" disabled={Boolean(busyMessage)} onClick={discardPendingOrderChanges}>
            <X size={16} /> {t('discardChanges')}
          </button>
          <button type="button" className="primary-button" disabled={Boolean(busyMessage)} onClick={() => void savePendingOrderChanges()}>
            <Save size={16} /> {t('saveChanges')}
          </button>
        </div>
      )}

      {productPointerDrag && draggedProduct && (
        <div
          className={`product-sort-floating ${productViewMode === 'list' ? 'is-list' : 'is-grid'}`}
          style={{
            left: floatingProductLeft,
            top: floatingProductTop,
            width: productPointerDrag.width,
            height: productPointerDrag.height,
          }}
          aria-hidden="true"
        >
          <div className="product-sort-floating-image">
            {draggedProductThumb ? <img src={draggedProductThumb} alt="" /> : isVideoMedia(draggedProductMedia) ? <Video size={30} /> : null}
          </div>
          <div className="product-sort-floating-info">
            <strong>{localizedProductName(draggedProduct, language)}</strong>
            <span>{formatPrice(draggedProduct, locale, displayCurrency)}</span>
          </div>
          <GripVertical size={18} />
        </div>
      )}

      {categoryPointerDrag && draggedCategory && (
        <div
          className="category-sort-floating"
          style={{
            left: categoryPointerDrag.pointerX - categoryPointerDrag.offsetX,
            top: categoryPointerDrag.pointerY - categoryPointerDrag.offsetY,
            width: categoryPointerDrag.width,
            height: categoryPointerDrag.height,
          }}
          aria-hidden="true"
        >
          <GripVertical size={15} />
          <CatalogIcon name={draggedCategory.icon} size={17} />
          <span>{localizedCategoryTitle(draggedCategory, language)}</span>
          <small>{productsFor(draggedCategory.id).length}</small>
          <ChevronDown size={17} />
        </div>
      )}

      {categoryModal && (
        <Modal title={categoryModal === 'new' ? t('newCategory') : t('editCategory')} onClose={() => setCategoryModal(null)}>
          <CategoryForm
            category={categoryModal === 'new' ? undefined : categoryModal}
            cities={catalog.cities}
            defaultCityId={defaultCityId || activeCityId || undefined}
            onCancel={() => setCategoryModal(null)}
            onSave={async (data) => { await saveCategory(data); setCategoryModal(null); }}
          />
        </Modal>
      )}

      {cityModalOpen && (
        <Modal title={t('addCity')} onClose={() => setCityModalOpen(false)} wide>
          <CityForm
            cities={catalog.cities}
            categories={catalog.categories}
            products={catalog.products}
            onCancel={() => setCityModalOpen(false)}
            onSave={saveCity}
            onDelete={(city: City) =>
              setConfirmState({
                title: t('deleteCity'),
                message: t('deleteCityMessage', { name: city.name }),
                warning: t('deleteCityWarning'),
                confirmLabel: t('deleteCity'),
                successMessage: t('cityDeleted'),
                run: () => deleteCity(city.id),
              })
            }
          />
        </Modal>
      )}

      {productModal && (
        <Modal title={productModal === 'new' ? t('newProduct') : t('editProduct')} onClose={() => setProductModal(null)} wide>
          <ProductForm
            product={productModal === 'new' ? undefined : productModal}
            cities={catalog.cities}
            categories={catalog.categories}
            descriptionTemplates={catalog.descriptionTemplates || []}
            defaultCategoryId={defaultCategoryId}
            permissions={productPermissions}
            onCancel={() => setProductModal(null)}
            onSave={async (data) => { await saveProduct(data); setProductModal(null); }}
          />
        </Modal>
      )}

      {cloneProductModal && (
        <Modal title={t('cloneProduct')} onClose={() => setCloneProductModal(null)}>
          <CloneProductDialog
            cities={catalog.cities}
            categories={catalog.categories}
            sourceCategoryId={cloneProductModal.categoryId}
            onCancel={() => setCloneProductModal(null)}
            onConfirm={async (targetCategoryId) => {
              await cloneProduct({ productId: cloneProductModal.id, targetCategoryId });
              setCloneProductModal(null);
              setToast({ kind: 'success', message: t('productCloned') });
            }}
          />
        </Modal>
      )}

      {cloneCategoryModal && (
        <Modal title={t('cloneCategory')} onClose={() => setCloneCategoryModal(null)}>
          <CloneCategoryDialog
            cities={catalog.cities.filter((city) => city.id !== cloneCategoryModal.cityId)}
            onCancel={() => setCloneCategoryModal(null)}
            onConfirm={async (targetCityId) => {
              await cloneCategory({ categoryId: cloneCategoryModal.id, targetCityId });
              setCloneCategoryModal(null);
              setToast({ kind: 'success', message: t('categoryCloned') });
            }}
          />
        </Modal>
      )}

      {detailProduct && <Modal title={t('productDetails')} onClose={() => setDetailProduct(null)} wide hideEyebrow><ProductDetails product={detailProduct} displayCurrency={displayCurrency} /></Modal>}
      {usersOpen && <Modal title={t('usersPermissions')} onClose={() => setUsersOpen(false)} wide><UserManagement onClose={() => setUsersOpen(false)} /></Modal>}

      {confirmState && (
        <ConfirmDialog
          options={confirmState}
          onCancel={() => setConfirmState(null)}
          onConfirm={confirmAndRun}
        />
      )}

      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}

      {busyMessage && (
        <div className="busy-overlay">
          <div className="busy-card">
            {!busyProgress?.finished && <span className="spinner" />}
            <div className="busy-copy">
              <strong>{busyMessage}</strong>
              {busyProgress && (
                <>
                  <small>{busyProgress.done} de {busyProgress.total} produtos</small>
                  <span className="busy-progress" aria-hidden="true">
                    <i style={{ width: `${busyProgress.total ? Math.round((busyProgress.done / busyProgress.total) * 100) : 0}%` }} />
                  </span>
                  {busyProgress.currentName && !busyProgress.finished && (
                    <span className="busy-current">Atual: {busyProgress.currentName}</span>
                  )}
                  {busyProgress.errors.length > 0 && (
                    <div className="busy-errors">
                      <span>Nao foram padronizados:</span>
                      {busyProgress.errors.map((error) => (
                        <p key={`${error.name}-${error.reason}`}>
                          <strong>{error.name}</strong>
                          <small>{error.reason}</small>
                        </p>
                      ))}
                    </div>
                  )}
                  {busyProgress.finished && (
                    <button type="button" className="busy-close" onClick={() => { setBusyMessage(''); setBusyProgress(null); }}>
                      Fechar
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
