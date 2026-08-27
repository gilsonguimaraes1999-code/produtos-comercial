import type { DraftImageInput, ProductImage, VideoProvider } from './types';
import { MANSION_PLACEHOLDER_IMAGE_URL } from './mansionPlaceholderImage';

const DIRECT_VIDEO_PATTERN = /\.(mp4|webm|ogg|ogv|mov|m4v)(\?.*)?$/i;
const DIRECT_IMAGE_HOSTS = new Set(['i.ibb.co', 'ibb.co']);
const DIRECT_IMAGE_PATTERN = /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i;

export const MANSION_PLACEHOLDER_URL = MANSION_PLACEHOLDER_IMAGE_URL;

function parsedUrl(rawUrl?: string) {
  try {
    return rawUrl ? new URL(rawUrl.trim()) : null;
  } catch {
    return null;
  }
}

function inferVideoProvider(rawUrl?: string): VideoProvider | '' {
  const url = parsedUrl(rawUrl);
  if (!url) return '';
  if (youtubeIdFromUrl(url)) return 'youtube';
  if (driveIdFromUrl(url)) return 'drive';
  if (DIRECT_VIDEO_PATTERN.test(url.href)) return 'direct';
  return '';
}

export function isVideoMedia(media?: Pick<ProductImage | DraftImageInput, 'mediaType' | 'url'>) {
  return media?.mediaType === 'video' || Boolean(inferVideoProvider(media?.url));
}

export function playableMediaUrl(media: Pick<ProductImage | DraftImageInput, 'url' | 'mediaType' | 'videoProvider'>) {
  if (!isVideoMedia(media)) return media.url || '';
  const normalized = normalizeMediaLink(media.url || '');
  return normalized?.url || media.url || '';
}

export function previewFrameUrl(media: Pick<ProductImage | DraftImageInput, 'url' | 'mediaType' | 'videoProvider'>) {
  if (!isVideoMedia(media) || isDirectVideo(media)) return '';
  return playableMediaUrl(media);
}

export function mediaThumbUrl(media: Pick<ProductImage | DraftImageInput, 'url' | 'thumbnailUrl' | 'mediaType'>) {
  if (!isVideoMedia(media)) return displayMediaUrl(media.url || '');
  if (media.thumbnailUrl) return publicDriveImageUrl(media.thumbnailUrl);

  const url = parsedUrl(media.url);
  const youtubeId = url ? youtubeIdFromUrl(url) : '';
  if (youtubeId) return `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;

  const driveId = url ? driveIdFromUrl(url) : '';
  if (driveId) return publicDriveImageUrl(media.url || '');

  return '';
}

export function displayMediaUrl(rawUrl: string) {
  if (!rawUrl || rawUrl === '/mansion-placeholder.png') return MANSION_PLACEHOLDER_URL;
  if (rawUrl === MANSION_PLACEHOLDER_URL) return rawUrl;
  if (!/^data:image\/svg\+xml/i.test(rawUrl)) return publicDriveImageUrl(rawUrl);

  const marker = 'IMAGEM EM BREVE';
  const mansionMarker = 'MANSION_PLACEHOLDER';
  let decoded = '';
  try {
    decoded = decodeURIComponent(rawUrl);
  } catch {
    decoded = rawUrl;
  }

  if (decoded.includes(mansionMarker) || decoded.includes(marker)) return MANSION_PLACEHOLDER_URL;

  const cleanedSvg = decoded
    .replace(/<text\b[^>]*>\s*IMAGEM EM BREVE\s*<\/text>/i, '')
    .replace(/IMAGEM EM BREVE/g, '');

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(cleanedSvg.replace(/^data:image\/svg\+xml(?:;charset=[^,]+)?,/i, ''))}`;
}

function youtubeIdFromUrl(url: URL) {
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || '';
  if (!host.endsWith('youtube.com')) return '';

  if (url.pathname === '/watch') return url.searchParams.get('v') || '';

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') return parts[1] || '';
  return '';
}

function driveIdFromUrl(url: URL) {
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (host === 'lh3.googleusercontent.com') {
    return url.pathname.match(/^\/d\/([^/=]+)/i)?.[1] || '';
  }
  if (!host.endsWith('drive.google.com')) return '';

  const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/i);
  if (fileMatch?.[1]) return fileMatch[1];

  return url.searchParams.get('id') || '';
}

function publicDriveImageUrl(rawUrl: string, size = 480) {
  const url = parsedUrl(rawUrl);
  const driveId = url ? driveIdFromUrl(url) : '';
  if (!driveId) return rawUrl;

  // The Drive thumbnail endpoint attempts to use third-party storage, which
  // Edge Tracking Prevention blocks once per image. Google's public image CDN
  // serves the shared asset without that storage dependency.
  return `https://lh3.googleusercontent.com/d/${encodeURIComponent(driveId)}=w${size}`;
}

export function normalizeMediaLink(rawUrl: string): DraftImageInput | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  const youtubeId = youtubeIdFromUrl(parsed);
  if (youtubeId) {
    return {
      url: `https://www.youtube.com/embed/${youtubeId}`,
      mediaType: 'video',
      videoProvider: 'youtube',
      thumbnailUrl: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
      name: 'video-youtube',
    };
  }

  const driveId = driveIdFromUrl(parsed);
  if (driveId) {
    return {
      url: `https://drive.google.com/file/d/${driveId}/preview`,
      mediaType: 'video',
      videoProvider: 'drive',
      thumbnailUrl: publicDriveImageUrl(parsed.href),
      name: 'video-drive',
    };
  }

  if (DIRECT_VIDEO_PATTERN.test(parsed.href)) {
    return {
      url: parsed.href,
      mediaType: 'video',
      videoProvider: 'direct',
      name: 'video-link',
    };
  }

  if (DIRECT_IMAGE_HOSTS.has(parsed.hostname.toLowerCase()) || DIRECT_IMAGE_PATTERN.test(parsed.href)) {
    return {
      url: parsed.href,
      mediaType: 'image',
      name: 'imagem-link',
    };
  }

  return {
    sourceType: 'url',
    source: parsed.href,
    mediaType: 'image',
    name: 'imagem-link',
  };
}

export function shouldRenderVideoFrame(media: Pick<ProductImage | DraftImageInput, 'mediaType' | 'videoProvider' | 'url'>) {
  const provider = media.videoProvider || inferVideoProvider(media.url);
  return isVideoMedia(media) && provider !== 'direct';
}

export function isDirectVideo(media: Pick<ProductImage | DraftImageInput, 'mediaType' | 'videoProvider' | 'url'>) {
  const provider = media.videoProvider || inferVideoProvider(media.url);
  return isVideoMedia(media) && provider === 'direct';
}

export function videoProviderName(provider?: VideoProvider) {
  if (provider === 'youtube') return 'YouTube';
  if (provider === 'drive') return 'Drive';
  return 'Video';
}
