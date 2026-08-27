import { ChevronLeft, ChevronRight, Play, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n';
import { localizedProductDescription, localizedProductName } from '../localization';
import { preloadImage } from '../imagePreload';
import { displayMediaUrl, isDirectVideo, isVideoMedia, MANSION_PLACEHOLDER_URL, mediaThumbUrl, playableMediaUrl, previewFrameUrl, shouldRenderVideoFrame } from '../media';
import type { CurrencyCode, Product } from '../types';
import { formatPrice } from './ProductCard';
import { sanitizeHtml } from '../html';

export function ProductDetails({ product, displayCurrency }: { product: Product; displayCurrency: CurrencyCode }) {
  const { language, locale, t } = useTranslation();
  const [index, setIndex] = useState(0);
  const images = product.images;
  const current = images[index];
  const currentUrl = current ? playableMediaUrl(current) : '';
  const currentDisplayUrl = current ? displayMediaUrl(current.url) : MANSION_PLACEHOLDER_URL;
  const currentIsVideo = Boolean(current && isVideoMedia(current));
  const currentIsPlaceholder = currentDisplayUrl === MANSION_PLACEHOLDER_URL;
  const productName = localizedProductName(product, language);
  const descriptionHtml = sanitizeHtml(localizedProductDescription(product, language));
  const displayedPrice = formatPrice(product, locale, displayCurrency);

  useEffect(() => {
    images.forEach((image) => {
      const thumb = mediaThumbUrl(image);
      if (thumb) void preloadImage(thumb);
    });
  }, [images]);

  return (
    <div className="product-details">
      <div className="details-copy">
        {product.sold && <span className="sold-badge details-sold-badge">{t('sold')}</span>}
        <h2>{productName}</h2>
        {displayedPrice && <strong className="price-gradient">{displayedPrice}</strong>}
        {product.sold && product.soldOwnerName && (
          <div className="sold-owner-panel">
            <span>{t('soldOwner')}</span>
            <strong>{product.soldOwnerName}</strong>
            {product.soldOwnerDiscordId && <small>{t('soldOwnerDiscordId')}: {product.soldOwnerDiscordId}</small>}
          </div>
        )}
        {descriptionHtml && (
          <div className="rich-content product-description" dangerouslySetInnerHTML={{ __html: descriptionHtml }} />
        )}
      </div>
      <div className={`details-gallery ${currentIsVideo ? 'is-video' : 'is-image'}${currentIsPlaceholder ? ' is-mansion-placeholder' : ''}`}>
        {current ? (
          isDirectVideo(current) ? (
            <video src={currentUrl} controls playsInline />
          ) : shouldRenderVideoFrame(current) ? (
            <iframe
              src={currentUrl}
              title={`${productName} ${index + 1}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <img src={currentDisplayUrl} alt={`${productName} ${index + 1}`} referrerPolicy="no-referrer" loading="eager" decoding="async" fetchPriority="high" />
          )
        ) : <img src={MANSION_PLACEHOLDER_URL} alt={productName} referrerPolicy="no-referrer" loading="eager" decoding="async" fetchPriority="high" />}
        {images.length > 1 && (
          <>
            <button type="button" className="carousel-arrow left" onClick={() => setIndex((index - 1 + images.length) % images.length)} aria-label={t('previousImage')} title={t('previousImage')}><ChevronLeft /></button>
            <button type="button" className="carousel-arrow right" onClick={() => setIndex((index + 1) % images.length)} aria-label={t('nextImage')} title={t('nextImage')}><ChevronRight /></button>
            <span className="image-counter">{index + 1}/{images.length}</span>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="details-thumbs">
          {images.map((image, imageIndex) => (
            <button
              key={image.id}
              type="button"
              className={index === imageIndex ? 'active' : ''}
              onClick={() => setIndex(imageIndex)}
              aria-label={t('imageThumbnail', { index: imageIndex + 1 })}
              title={t('imageThumbnail', { index: imageIndex + 1 })}
            >
              {isVideoMedia(image) ? (
                <span className="details-video-thumb">
                  {mediaThumbUrl(image) ? (
                    <img src={mediaThumbUrl(image)} alt={`${productName} ${imageIndex + 1}`} referrerPolicy="no-referrer" loading="lazy" decoding="async" />
                  ) : isDirectVideo(image) ? (
                    <video src={playableMediaUrl(image)} muted playsInline preload="metadata" />
                  ) : previewFrameUrl(image) ? (
                    <iframe
                      src={previewFrameUrl(image)}
                      title={`${productName} ${imageIndex + 1}`}
                      loading="lazy"
                      allow="encrypted-media; picture-in-picture"
                    />
                  ) : (
                    <Video size={18} />
                  )}
                  <Play size={10} fill="currentColor" />
                </span>
              ) : (
                <img src={displayMediaUrl(image.url)} alt={`${productName} ${imageIndex + 1}`} referrerPolicy="no-referrer" loading="lazy" decoding="async" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
