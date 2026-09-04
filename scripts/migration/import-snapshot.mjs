import { randomBytes, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { normalizeSnapshot } from "./normalize-snapshot.mjs";

const TECHNICAL_EMAIL_DOMAIN = "users.comercial-produtos.app";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function technicalEmail(username) {
  const normalized = username.trim().toLocaleLowerCase("en-US");
  const asciiLocalPart = encodeURIComponent(normalized)
    .replaceAll("%", "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
  if (!asciiLocalPart) throw new Error("USERNAME_INVALID");
  return `${asciiLocalPart}@${TECHNICAL_EMAIL_DOMAIN}`;
}

async function upsertRows(client, table, rows, onConflict) {
  for (let start = 0; start < rows.length; start += 200) {
    const query = client.from(table).upsert(rows.slice(start, start + 200), {
      ...(onConflict ? { onConflict } : {}),
    });
    const result = await query;
    if (result.error) throw new Error(`${table}: ${result.error.message}`);
  }
}

function permissionRows(profile) {
  const permissions = profile.permissions?.product || {};
  return {
    profile_id: profile.id,
    create_product: permissions.createProduct === true,
    edit_product_category: permissions.editProductCategory === true,
    edit_product_name: permissions.editProductName === true,
    edit_product_price: permissions.editProductPrice === true,
    edit_product_description: permissions.editProductDescription === true,
    edit_product_media: permissions.editProductMedia === true,
    mark_product_sold: permissions.markProductSold === true,
    view_owner_discord_id: permissions.viewSoldDiscordId === true,
    clone_product: permissions.cloneProduct === true,
    clone_category: permissions.cloneCategory === true,
    delete_product: permissions.deleteProduct === true,
    move_product: permissions.moveProduct === true,
  };
}

export async function importSnapshot(client, input, idempotencyKey) {
  const snapshot = input.schemaVersion ? input : normalizeSnapshot(input);
  const existingRun = await client.from("migration_runs").select("id, status").eq("idempotency_key", idempotencyKey).maybeSingle();
  if (existingRun.error) throw existingRun.error;
  if (existingRun.data?.status === "completed") {
    return { migrationRunId: existingRun.data.id, alreadyCompleted: true };
  }
  const runResult = await client.from("migration_runs").upsert({
    ...(existingRun.data?.id ? { id: existingRun.data.id } : {}),
    idempotency_key: idempotencyKey,
    stage: "snapshot-import",
    status: "running",
    started_at: new Date().toISOString(),
  }, { onConflict: "idempotency_key" }).select("id").single();
  if (runResult.error) throw runResult.error;
  const migrationRunId = runResult.data.id;

  try {
    await upsertRows(client, "cities", snapshot.cities.map((row) => ({
      id: row.id, name: row.name, position: row.position,
      ...(row.createdAt ? { created_at: row.createdAt } : {}),
      ...(row.updatedAt ? { updated_at: row.updatedAt } : {}),
    })), "id");
    await upsertRows(client, "categories", snapshot.categories.map((row) => ({
      id: row.id, city_id: row.cityId, icon: row.icon, position: row.position,
      ...(row.createdAt ? { created_at: row.createdAt } : {}),
      ...(row.updatedAt ? { updated_at: row.updatedAt } : {}),
    })), "id");
    await upsertRows(client, "category_translations", snapshot.categoryTranslations.map((row) => ({
      category_id: row.categoryId, language: row.language, title: row.title, is_source: row.isSource,
    })), "category_id,language");
    await upsertRows(client, "products", snapshot.products.map((row) => ({
      id: row.id, category_id: row.categoryId, import_key: row.importKey,
      coordinates: row.coordinates, storage_weight: row.storageWeight,
      sold: row.sold, buyer_name: row.buyerName, buyer_discord_id: row.buyerDiscordId,
      position: row.position,
      ...(row.createdAt ? { created_at: row.createdAt } : {}),
      ...(row.updatedAt ? { updated_at: row.updatedAt } : {}),
    })), "id");
    await upsertRows(client, "product_translations", snapshot.productTranslations.map((row) => ({
      product_id: row.productId, language: row.language, name: row.name,
      description_html: row.descriptionHtml, is_source: row.isSource,
      translation_status: row.translationStatus,
    })), "product_id,language");
    await upsertRows(client, "product_prices", snapshot.productPrices.map((row) => ({
      product_id: row.productId, currency: row.currency, amount: row.amount,
    })), "product_id,currency");
    await upsertRows(client, "product_media", snapshot.productMedia.map((row) => ({
      id: row.id, product_id: row.productId, media_type: row.mediaType,
      public_url: row.url, thumbnail_url: row.thumbnailUrl,
      video_provider: row.videoProvider, position: row.position,
    })), "id");

    await upsertRows(client, "description_templates", snapshot.descriptionTemplates.map((row) => ({
      id: row.id, category_id: row.categoryId, name: row.name,
      position: row.position, is_active: row.active,
    })), "id");
    await upsertRows(client, "description_template_translations", snapshot.descriptionTemplates.flatMap((row) =>
      Object.entries(row.translations).map(([language, html]) => ({
        template_id: row.id, language, html,
      }))), "template_id,language");

    const listedUsers = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listedUsers.error) throw listedUsers.error;
    const authUsers = new Map(listedUsers.data.users.map((user) => [user.email, user]));
    const ownerPassword = requiredEnv("MIGRATION_OWNER_PASSWORD");
    for (const profile of snapshot.profiles) {
      const email = technicalEmail(profile.username);
      const password = profile.role === "owner" ? ownerPassword : randomBytes(32).toString("base64url");
      let authUser = authUsers.get(email);
      if (!authUser) {
        const created = await client.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { username: profile.username },
        });
        if (created.error) throw created.error;
        authUser = created.data.user;
        authUsers.set(email, authUser);
      } else if (profile.role === "owner") {
        const updated = await client.auth.admin.updateUserById(authUser.id, { password });
        if (updated.error) throw updated.error;
      }
      await upsertRows(client, "profiles", [{
        id: profile.id,
        auth_user_id: authUser.id,
        username: profile.username,
        display_name: profile.displayName,
        role: profile.role,
        status: profile.role === "owner" ? "active" : "disabled",
        ...(profile.createdAt ? { created_at: profile.createdAt } : {}),
        ...(profile.updatedAt ? { updated_at: profile.updatedAt } : {}),
      }], "id");
      await upsertRows(client, "user_product_permissions", [permissionRows(profile)], "profile_id");
      await upsertRows(client, "user_access_permissions", [{
        profile_id: profile.id,
        manage_requests_for_assigned_cities: profile.permissions?.accessRequests?.manageAssignedCities === true,
      }], "profile_id");

    }
    await upsertRows(client, "user_cities", snapshot.userCities.map((row) => ({
      profile_id: row.profileId, city_id: row.cityId,
    })), "profile_id,city_id");

    await upsertRows(client, "access_requests", snapshot.accessRequests.map((row) => ({
      id: row.id, display_name: row.displayName, username: row.username, status: row.status,
    })), "id");
    await upsertRows(client, "access_request_cities", snapshot.accessRequests.flatMap((row) =>
      row.requestedCityIds.map((cityId) => ({ access_request_id: row.id, city_id: cityId }))),
    "access_request_id,city_id");
    await upsertRows(client, "site_settings", snapshot.settings.map((row) => ({
      key: row.key, value: row.value,
    })), "key");

    const counts = Object.fromEntries(Object.entries(snapshot)
      .filter(([, value]) => Array.isArray(value))
      .map(([key, value]) => [key, value.length]));
    const finish = await client.from("migration_runs").update({
      status: "completed", counts, finished_at: new Date().toISOString(),
    }).eq("id", migrationRunId);
    if (finish.error) throw finish.error;
    return { migrationRunId, alreadyCompleted: false, counts };
  } catch (error) {
    await client.from("migration_runs").update({
      status: "failed",
      errors: [{ message: error instanceof Error ? error.message : "IMPORT_FAILED" }],
      finished_at: new Date().toISOString(),
    }).eq("id", migrationRunId);
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error("Usage: import-snapshot.mjs SNAPSHOT.json");
  const raw = JSON.parse(await readFile(inputPath, "utf8"));
  const normalized = raw.schemaVersion ? raw : normalizeSnapshot(raw);
  const client = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const key = process.env.MIGRATION_IDEMPOTENCY_KEY || `snapshot:${createHash("sha256").update(JSON.stringify(normalized)).digest("hex")}`;
  const result = await importSnapshot(client, normalized, key);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
