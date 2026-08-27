import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const MAX_BYTES = 10 * 1024 * 1024;
const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function migrateOne(client, media) {
  if (media.mediaType === "video") return { id: media.id, status: "skipped-video" };
  const response = await fetch(media.url, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`DOWNLOAD_${response.status}`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_BYTES) throw new Error("MEDIA_TOO_LARGE");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error("MEDIA_SIZE_INVALID");
  const mime = String(response.headers.get("content-type") || "").split(";")[0].toLowerCase();
  const extension = extensions[mime];
  if (!extension) throw new Error(`UNSUPPORTED_MEDIA_TYPE:${mime || "unknown"}`);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const path = `products/${media.productId}/${media.id}/original.${extension}`;
  const bucket = client.storage.from("product-media");
  const upload = await bucket.upload(path, bytes, { contentType: mime, cacheControl: "31536000", upsert: true });
  if (upload.error) throw upload.error;
  const publicUrl = bucket.getPublicUrl(path).data.publicUrl;
  const update = await client.from("product_media").update({ storage_path: path, public_url: publicUrl }).eq("id", media.id);
  if (update.error) throw update.error;
  return { id: media.id, status: "migrated", path, sha256, bytes: bytes.length };
}

export async function migrateMedia(client, mediaRows, concurrency = 5) {
  const results = new Array(mediaRows.length);
  let cursor = 0;
  async function worker() {
    while (cursor < mediaRows.length) {
      const index = cursor++;
      try {
        results[index] = await migrateOne(client, mediaRows[index]);
      } catch (error) {
        results[index] = {
          id: mediaRows[index].id,
          status: "failed",
          error: error instanceof Error ? error.message : "MEDIA_MIGRATION_FAILED",
        };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, mediaRows.length || 1) }, worker));
  return {
    results,
    migrated: results.filter((item) => item.status === "migrated").length,
    failed: results.filter((item) => item.status === "failed").length,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const normalizedPath = process.argv[2];
  if (!normalizedPath) throw new Error("Usage: migrate-media.mjs NORMALIZED.json");
  const snapshot = JSON.parse(await readFile(normalizedPath, "utf8"));
  const client = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const report = await migrateMedia(client, snapshot.productMedia || []);
  const reportPath = process.env.MEDIA_REPORT_OUTPUT || "work/migration/media-report.json";
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify({ migrated: report.migrated, failed: report.failed }, null, 2)}\n`);
  if (report.failed) process.exitCode = 1;
}
