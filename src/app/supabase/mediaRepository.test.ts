import { describe, expect, it, vi } from "vitest";

import {
  buildProductMediaPath,
  createMediaRepository,
  validateProductMedia,
} from "./mediaRepository";

describe("Supabase product media", () => {
  it("builds deterministic product-scoped paths", () => {
    expect(buildProductMediaPath("product-1", "media-1", "display", "webp"))
      .toBe("products/product-1/media-1/display.webp");
  });

  it("rejects unsupported or oversized files", () => {
    expect(() => validateProductMedia(new File(["x"], "x.svg", { type: "image/svg+xml" })))
      .toThrow("UNSUPPORTED_MEDIA_TYPE");
    expect(() => validateProductMedia({ type: "image/png", size: 10 * 1024 * 1024 + 1 } as File))
      .toThrow("MEDIA_TOO_LARGE");
  });

  it("uploads to the protected bucket and returns its public URL", async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: "stored" }, error: null });
    const getPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: `https://cdn/${path}` } }));
    const repository = createMediaRepository({
      storage: { from: vi.fn(() => ({ upload, getPublicUrl })) },
    } as never, () => "media-fixed");
    const file = new File(["content"], "photo.png", { type: "image/png" });

    const result = await repository.uploadProductMedia("product-1", file, 2);

    expect(upload).toHaveBeenCalledWith(
      "products/product-1/media-fixed/original.png",
      file,
      expect.objectContaining({ contentType: "image/png", upsert: false }),
    );
    expect(result).toMatchObject({ id: "media-fixed", order: 2, mediaType: "image" });
    expect(result.url).toContain("products/product-1/media-fixed/original.png");
  });
});
