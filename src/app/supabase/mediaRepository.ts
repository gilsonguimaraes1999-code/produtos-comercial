import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import type { ProductImage } from "../types";

const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const extensionsByMime: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function buildProductMediaPath(
  productId: string,
  mediaId: string,
  variant: "original" | "display" | "thumbnail",
  extension: string,
): string {
  return `products/${productId}/${mediaId}/${variant}.${extension}`;
}

export function validateProductMedia(file: File): string {
  const extension = extensionsByMime[file.type];
  if (!extension) throw new Error("UNSUPPORTED_MEDIA_TYPE");
  if (file.size > MAX_MEDIA_BYTES) throw new Error("MEDIA_TOO_LARGE");
  if (file.size <= 0) throw new Error("INVALID_IMAGE_CONTENT");
  return extension;
}

export function createMediaRepository(
  client: SupabaseClient,
  createId: () => string = () => crypto.randomUUID(),
) {
  return {
    async uploadProductMedia(productId: string, file: File, order: number): Promise<ProductImage> {
      const extension = validateProductMedia(file);
      const mediaId = createId();
      const path = buildProductMediaPath(productId, mediaId, "original", extension);
      const bucket = client.storage.from("product-media");
      const result = await bucket.upload(path, file, {
        contentType: file.type,
        cacheControl: "31536000",
        upsert: false,
      });
      if (result.error) throw new Error(result.error.message || "UPLOAD_FAILED");
      return {
        id: mediaId,
        productId,
        url: bucket.getPublicUrl(path).data.publicUrl,
        order,
        mediaType: "image",
      };
    },

    async removeProductMedia(paths: string[]): Promise<void> {
      if (!paths.length) return;
      const result = await client.storage.from("product-media").remove(paths);
      if (result.error) throw new Error(result.error.message || "MEDIA_DELETE_FAILED");
    },
  };
}

export function getMediaRepository() {
  return createMediaRepository(getSupabaseBrowserClient());
}
