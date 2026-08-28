import { act, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    fetchCatalogSnapshot: vi.fn(),
    saveProduct: vi.fn(),
    reorderProducts: vi.fn(),
    fetchProduct: vi.fn(),
    realtimeHandler: null as null | ((event: { entity: "product"; id: string; deleted: boolean }) => void),
    subscribeToCatalog: vi.fn(),
    auth: {
    token: "token",
    user: { id: "user-1", role: "OWNER", allowedCityIds: [] as string[] },
    bootstrapCatalog: {
      revision: 1,
      cities: [{ id: "city-1", name: "Nobre", order: 0, version: 1 }],
      categories: [{ id: "cat-1", cityId: "city-1", title: "Produtos", icon: "Box", order: 0, version: 1 }],
      products: [{ id: "p1", categoryId: "cat-1", name: "Antigo", amount: 10, currency: "BRL", prices: { BRL: 10 }, order: 0, images: [], version: 7 }],
      descriptionTemplates: [],
    },
    },
  };
  state.subscribeToCatalog.mockImplementation((_client, handler) => {
    state.realtimeHandler = handler;
    return vi.fn();
  });
  return state;
});

vi.mock("./auth", () => ({
  useAuth: () => mocks.auth,
}));
vi.mock("../i18n", () => ({ useTranslation: () => ({ language: "pt" }) }));
vi.mock("./imagePreload", () => ({ scheduleCatalogImagePreload: vi.fn() }));
vi.mock("./supabase/catalogSnapshot", () => ({ fetchCatalogSnapshot: mocks.fetchCatalogSnapshot }));
vi.mock("./supabase/catalogMutations", () => ({
  getCatalogMutations: () => ({
    saveProduct: mocks.saveProduct,
    saveCity: vi.fn(), deleteCity: vi.fn(), reorderCities: vi.fn(),
    saveCategory: vi.fn(), deleteCategory: vi.fn(), reorderCategories: vi.fn(),
    translateProductLanguage: vi.fn(), cloneProduct: vi.fn(), cloneCategory: vi.fn(),
    deleteProduct: vi.fn(), reorderProducts: mocks.reorderProducts,
    saveDescriptionTemplate: vi.fn(), deleteDescriptionTemplate: vi.fn(),
  }),
}));
vi.mock("./supabase/catalogEntityRepository", () => ({
  getCatalogEntityRepository: () => ({
    fetchProduct: mocks.fetchProduct,
    fetchCity: vi.fn(), fetchCategory: vi.fn(), fetchDescriptionTemplate: vi.fn(),
  }),
}));
vi.mock("./supabase/realtime", () => ({ subscribeToCatalog: mocks.subscribeToCatalog }));
vi.mock("./supabase/catalogRepository", () => ({ getCatalogRepository: () => ({}) }));
vi.mock("./supabase/mediaRepository", () => ({ getMediaRepository: () => ({ uploadProductMedia: vi.fn() }) }));
vi.mock("../lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
  }),
}));

import { CatalogProvider, useCatalog } from "./catalog";

describe("CatalogProvider granular updates", () => {
  it("updates one product without fetching the full catalog", async () => {
    mocks.fetchCatalogSnapshot.mockResolvedValue({ revision: 2, cities: [], categories: [], products: [], descriptionTemplates: [] });
    mocks.saveProduct.mockResolvedValue({ id: "p1", version: 8 });
    mocks.fetchProduct.mockResolvedValue({
      id: "p1", categoryId: "cat-1", name: "Alterado", amount: 15, currency: "BRL",
      prices: { BRL: 15 }, order: 0, images: [], version: 8,
    });
    let context: ReturnType<typeof useCatalog> | null = null;
    function Probe({ children }: { children?: ReactNode }) {
      context = useCatalog();
      return <>{children}</>;
    }

    render(<CatalogProvider><Probe /></CatalogProvider>);
    await waitFor(() => expect(context).not.toBeNull());
    await waitFor(() => expect(mocks.fetchCatalogSnapshot).toHaveBeenCalled());
    mocks.fetchCatalogSnapshot.mockClear();

    await act(async () => {
      await context!.saveProduct({
        id: "p1", version: 7, categoryId: "cat-1", name: "Alterado",
        sourceLanguage: "pt", currency: "BRL", prices: { BRL: 15 }, images: [],
      });
    });

    expect(mocks.saveProduct).toHaveBeenCalledTimes(1);
    expect(mocks.fetchProduct).toHaveBeenCalledWith("p1", "pt", "BRL");
    expect(mocks.fetchCatalogSnapshot).not.toHaveBeenCalled();
    expect(context!.catalog.products.find((product) => product.id === "p1")).toMatchObject({ name: "Alterado", version: 8 });
    expect(context!.busyEntityIds.has("p1")).toBe(false);

    const confirmedRevision = context!.catalog.revision;
    const confirmedProduct = context!.catalog.products.find((product) => product.id === "p1");
    await act(async () => {
      mocks.realtimeHandler?.({ entity: "product", id: "p1", deleted: false });
      await Promise.resolve();
    });
    await waitFor(() => expect(mocks.fetchProduct).toHaveBeenCalledTimes(2));
    expect(context!.catalog.revision).toBe(confirmedRevision);
    expect(context!.catalog.products.find((product) => product.id === "p1")).toBe(confirmedProduct);
  });

  it("uses the draft baseline and reloads reordered entities before resolving", async () => {
    mocks.reorderProducts.mockResolvedValue(undefined);
    mocks.fetchProduct
      .mockResolvedValueOnce({
        id: "p1", categoryId: "cat-1", name: "Antigo", amount: 10, currency: "BRL",
        prices: { BRL: 10 }, order: 1, images: [], version: 8,
      });
    let context: ReturnType<typeof useCatalog> | null = null;
    function Probe() {
      context = useCatalog();
      return null;
    }

    render(<CatalogProvider><Probe /></CatalogProvider>);
    await waitFor(() => expect(context).not.toBeNull());

    await act(async () => {
      await context!.reorderProducts([{
        categoryId: "cat-1",
        productIds: ["p1"],
        expectedOrder: ["p1", "p2-that-arrived-later"],
      }]);
    });

    expect(mocks.reorderProducts).toHaveBeenCalledWith(
      "cat-1",
      ["p1"],
      ["p1", "p2-that-arrived-later"],
    );
    expect(context!.catalog.products.find((product) => product.id === "p1")).toMatchObject({ order: 1, version: 8 });
  });
});
