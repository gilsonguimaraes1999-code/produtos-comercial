import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, CopyPlus, GripVertical, Pencil, Play, Trash2, Video } from 'lucide-react';
import { useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { formatLocalizedPrice, useTranslation } from '../../i18n';
import { localizedProductName, localizedProductPrice, normalizedPrices } from '../localization';
import { displayMediaUrl, isVideoMedia, MANSION_PLACEHOLDER_URL, mediaThumbUrl } from '../media';
import type { CurrencyCode, Product, ProductImage } from '../types';

export function formatPrice(product: Pick<Product, 'amount' | 'currency' | 'prices'>, locale = 'pt-BR', displayCurrency: CurrencyCode = 'BRL') {
  const prices = normalizedPrices(product);
  const hasKnownPrice = Object.values(prices).some((amount) => typeof amount === 'number' && Number.isFinite(amount) && amount > 0);
  if (!hasKnownPrice) {
    return '';
    const symbols: Record<CurrencyCode, string> = { BRL: 'R$', USD: '$', GBP: '£', EUR: '€' };
    return `${symbols[displayCurrency] || displayCurrency} ?`;
  }

  const price = localizedProductPrice(product, displayCurrency);
  if (price.amount === null || !Number.isFinite(Number(price.amount)) || Number(price.amount) <= 0) {
    return '';
    const symbols: Record<CurrencyCode, string> = { BRL: 'R$', USD: '$', GBP: '£', EUR: '€' };
    return `${symbols[price.currency] || price.currency} ?`;
  }
  return formatLocalizedPrice(price.amount, price.currency, locale);
}

export function ProductCard({
  product,
  owner,
  displayCurrency,
  isDragging = false,
  isDropTarget = false,
  sortStyle,
  cardRef,
  onOpen,
  onEdit,
  onClone,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
  canEdit = false,
  canClone = false,
  canDelete = false,
  showOrderActions = false,
  showMoveGrip = false,
  onMovePointerDown,
}: {
  product: Product;
  owner: boolean;
  displayCurrency: CurrencyCode;
  isDragging?: boolean;
  isDropTarget?: boolean;
  sortStyle?: CSSProperties | undefined;
  cardRef?: (node: HTMLElement | null) => void;
  onOpen: () => void;
  onEdit: () => void;
  onClone: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  canEdit?: boolean;
  canClone?: boolean;
  canDelete?: boolean;
  showOrderActions?: boolean;
  showMoveGrip?: boolean;
  onMovePointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
}) {
  const { language, locale, t } = useTranslation();
  const [imageIndex, setImageIndex] = useState(0);
  const images: ProductImage[] = product.images.length ? product.images : [{ id: 'empty', url: '', productId: product.id, order: 0 }];
  const image = images[Math.min(imageIndex, images.length - 1)];
  const productName = localizedProductName(product, language);
  const displayedPrice = formatPrice(product, locale, displayCurrency);
  const imageDisplayUrl = image?.url ? displayMediaUrl(image.url) : MANSION_PLACEHOLDER_URL;
  const isMansionPlaceholder = imageDisplayUrl === MANSION_PLACEHOLDER_URL;

  function changeImage(event: MouseEvent, direction: -1 | 1) {
    event.stopPropagation();
    setImageIndex((current) => (current + direction + images.length) % images.length);
  }

  return (
    <article
      ref={cardRef}
      className={`product-card${product.sold ? ' is-sold' : ''}${isDragging ? ' is-dragging' : ''}${isDropTarget ? ' is-drop-target' : ''}`}
      style={sortStyle}
      onClick={onOpen}
    >
      <div className={`product-image${isMansionPlaceholder ? ' is-mansion-placeholder' : ''}`}>
        {image?.url ? (
          isVideoMedia(image) ? (
            <div className="product-video-cover">
              {mediaThumbUrl(image) ? <img src={mediaThumbUrl(image)} alt={productName} referrerPolicy="no-referrer" loading="eager" decoding="async" fetchPriority="high" /> : <Video size={34} />}
              <span><Play size={16} fill="currentColor" /></span>
            </div>
          ) : (
            <img src={imageDisplayUrl} alt={productName} referrerPolicy="no-referrer" loading="eager" decoding="async" fetchPriority="high" />
          )
        ) : <img src={MANSION_PLACEHOLDER_URL} alt={productName} referrerPolicy="no-referrer" loading="eager" decoding="async" fetchPriority="high" />}
        {images.length > 1 && (
          <>
            <button type="button" className="carousel-arrow left" onClick={(event) => changeImage(event, -1)} aria-label={t('previousImage')} title={t('previousImage')}><ChevronLeft size={18} /></button>
            <button type="button" className="carousel-arrow right" onClick={(event) => changeImage(event, 1)} aria-label={t('nextImage')} title={t('nextImage')}><ChevronRight size={18} /></button>
            <span className="image-counter">{imageIndex + 1}/{images.length}</span>
          </>
        )}
        {product.sold && <span className="product-sold-stamp">{t('sold')}</span>}
      </div>
      <div className="product-info">
        <div>
          <h3>{productName}</h3>
          {displayedPrice ? (
            <strong className="price-gradient">{displayedPrice}</strong>
          ) : (
            <span className="product-price-spacer" aria-hidden="true" />
          )}
        </div>
        {owner && (
          <div className="product-action-menu" onClick={(event) => event.stopPropagation()}>
            {showOrderActions && (
              <>
                <button type="button" className="product-order-button" onClick={onMoveUp} disabled={!canMoveUp} aria-label={t('moveUp')} title={t('moveUp')}><ArrowUp size={16} /></button>
                <button type="button" className="product-order-button" onClick={onMoveDown} disabled={!canMoveDown} aria-label={t('moveDown')} title={t('moveDown')}><ArrowDown size={16} /></button>
              </>
            )}
            {canEdit && <button type="button" onClick={onEdit} aria-label={t('editProduct')} title={t('editProduct')}><Pencil size={16} /></button>}
            {canClone && <button type="button" onClick={onClone} aria-label={t('cloneProduct')} title={t('cloneProduct')}><CopyPlus size={16} /></button>}
            {canDelete && <button type="button" className="danger" onClick={onDelete} aria-label={t('delete')} title={t('delete')}><Trash2 size={16} /></button>}
          </div>
        )}
      </div>
      {owner && showMoveGrip && (
        <button
          type="button"
          className="drag-handle product-drag"
          onPointerDown={onMovePointerDown}
          onClick={(event) => event.stopPropagation()}
          title={t('moveProduct')}
          aria-label={t('moveProduct')}
        >
          <GripVertical size={18} />
        </button>
      )}
    </article>
  );
}
