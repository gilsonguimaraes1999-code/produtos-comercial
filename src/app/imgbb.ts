import { ApiError } from './api';
/**
 * Upload reutilizável de imagens para o ImgBB.
 * Use `uploadImageToImgbb` sempre que uma nova imagem precisar ser hospedada.
 */
const IMGBB_KEY = 'fc7a049d22afc785b615ecde51392119';
const ENDPOINT = 'https://api.imgbb.com/1/upload';

export interface ImgbbResult {
  url: string;
  deleteUrl?: string;
  thumbUrl?: string;
}

function blobToBase64(blob: Blob, label = 'image'): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]+;base64,/, ''));
    reader.onerror = () => reject(new ApiError('INVALID_IMAGE_CONTENT', `Could not read ${label}.`));
    reader.readAsDataURL(blob);
  });
}

function toBase64(file: File): Promise<string> {
  return blobToBase64(file, file.name);
}

async function stringSourceToBase64(source: string) {
  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(source)) {
    return source.replace(/^data:[^;]+;base64,/, '');
  }

  if (/^(https?:\/\/|\/)/i.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new ApiError('INVALID_IMAGE_CONTENT', `Could not read ${source}.`);
    return blobToBase64(await response.blob(), source);
  }

  return source;
}

export async function uploadImageToImgbb(source: File | string, name?: string): Promise<ImgbbResult> {
  const body = new FormData();
  body.append('key', IMGBB_KEY);
  if (name) body.append('name', name);
  body.append(
    'image',
    typeof source === 'string' ? await stringSourceToBase64(source) : await toBase64(source),
  );

  const response = await fetch(ENDPOINT, { method: 'POST', body });
  const payload = (await response.json()) as {
    success?: boolean;
    data?: { url?: string; delete_url?: string; thumb?: { url?: string } };
    error?: { message?: string };
  };

  if (!response.ok || !payload.success || !payload.data?.url) {
    throw new ApiError('UPLOAD_FAILED', payload.error?.message || 'ImgBB upload failed.');
  }

  return {
    url: payload.data.url,
    ...(payload.data.delete_url ? { deleteUrl: payload.data.delete_url } : {}),
    ...(payload.data.thumb?.url ? { thumbUrl: payload.data.thumb.url } : {}),
  };
}
