import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { CatalogConflictError } from "../supabase/catalogMutations";
import { CatalogApp } from "./CatalogApp";

const mocks = vi.hoisted(() => ({
  saveCity: vi.fn(),
  saveCategory: vi.fn(),
  saveProduct: vi.fn(),
  reorderCategories: vi.fn(),
  reorderProducts: vi.fn(),
  busyEntityIds: new Set<string>(),
  catalog: {
    revision: 1,
    cities: [{ id: "city-1", name: "Cidade", order: 0, version: 1 }],
    categories: [{ id: "cat-1", cityId: "city-1", title: "Original", icon: "Box", order: 0, version: 4 }],
    products: [] as Array<{ id: string; categoryId: string; name: string; amount: number; currency: "BRL"; prices: { BRL: number }; order: number; images: []; version: number }>,
    descriptionTemplates: [],
  },
}));

vi.mock("../auth", () => ({
  useAuth: () => ({
    token: "token",
    user: { id: "owner-1", name: "Owner", username: "owner", role: "OWNER", status: "Ativo", allowedCityIds: [] },
    logout: vi.fn(),
  }),
}));

vi.mock("../catalog", () => ({
  useCatalog: () => ({
    catalog: mocks.catalog,
    loading: false,
    busyEntityIds: mocks.busyEntityIds,
    saveCity: mocks.saveCity, deleteCity: vi.fn(), reorderCities: vi.fn(),
    saveCategory: mocks.saveCategory, deleteCategory: vi.fn(), reorderCategories: mocks.reorderCategories,
    saveProduct: mocks.saveProduct, translateProductLanguage: vi.fn(), cloneProduct: vi.fn(), cloneCategory: vi.fn(),
    deleteProduct: vi.fn(), reorderProducts: mocks.reorderProducts,
    saveDescriptionTemplate: vi.fn(), deleteDescriptionTemplate: vi.fn(),
  }),
}));

describe("CatalogApp definitive edit integration", () => {
  beforeEach(() => {
    mocks.saveCity.mockReset();
    mocks.saveCategory.mockReset();
    mocks.saveProduct.mockReset();
    mocks.reorderCategories.mockReset();
    mocks.reorderProducts.mockReset();
    mocks.busyEntityIds = new Set<string>();
    mocks.catalog.revision = 1;
    mocks.catalog.cities = [{ id: "city-1", name: "Cidade", order: 0, version: 1 }];
    mocks.catalog.categories = [{ id: "cat-1", cityId: "city-1", title: "Original", icon: "Box", order: 0, version: 4 }];
    mocks.catalog.products = [];
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    });
  });

  it("keeps the editor open and renders its real conflict dialog instead of queueing the edit", async () => {
    mocks.saveCategory.mockRejectedValueOnce(new CatalogConflictError("entity"));
    render(<LanguageProvider><CatalogApp /></LanguageProvider>);

    fireEvent.click(await screen.findByRole("button", { name: /Editar categoria|Edit category/i }));
    const title = screen.getByDisplayValue("Original");
    fireEvent.change(title, { target: { value: "Meu rascunho" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar categoria|Save category/i }));

    await waitFor(() => expect(screen.getByRole("dialog", { name: /Conflito|Conflict/i })).toBeInTheDocument());
    expect(title).toHaveValue("Meu rascunho");
    expect(mocks.saveCategory).toHaveBeenCalledWith(expect.objectContaining({ id: "cat-1", version: 4, title: "Meu rascunho" }));
    expect(screen.queryByRole("status", { name: /Alterações pendentes|Pending changes/i })).not.toBeInTheDocument();
  });

  it("keeps a city editor draft open when the definitive app save conflicts", async () => {
    mocks.saveCity.mockRejectedValueOnce(new CatalogConflictError("entity"));
    render(<LanguageProvider><CatalogApp /></LanguageProvider>);

    fireEvent.click(await screen.findByRole("button", { name: /Adicionar cidade|Add city/i }));
    fireEvent.click(screen.getByRole("button", { name: /Editar cidade|Edit city/i }));
    const cityName = screen.getByDisplayValue("Cidade");
    fireEvent.change(cityName, { target: { value: "Meu rascunho cidade" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar cidade|Save city/i }));

    await waitFor(() => expect(screen.getByRole("dialog", { name: /Conflito|Conflict/i })).toBeInTheDocument());
    expect(cityName).toHaveValue("Meu rascunho cidade");
    expect(mocks.saveCity).toHaveBeenCalledWith(expect.objectContaining({ id: "city-1", version: 1 }));
  });

  it("keeps a product editor draft open when the definitive app save conflicts", async () => {
    mocks.catalog.products = [
      { id: "p1", categoryId: "cat-1", name: "Original product", amount: 1, currency: "BRL", prices: { BRL: 1 }, order: 0, images: [], version: 5 },
    ];
    mocks.saveProduct.mockRejectedValueOnce(new CatalogConflictError("entity"));
    render(<LanguageProvider><CatalogApp /></LanguageProvider>);

    fireEvent.click(await screen.findByRole("button", { name: /Editar produto|Edit product/i }));
    const productName = screen.getByDisplayValue("Original product");
    fireEvent.change(productName, { target: { value: "Meu rascunho produto" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar produto|Save product/i }));

    await waitFor(() => expect(screen.getByRole("dialog", { name: /Conflito|Conflict/i })).toBeInTheDocument());
    expect(productName).toHaveValue("Meu rascunho produto");
    expect(mocks.saveProduct).toHaveBeenCalledWith(expect.objectContaining({ id: "p1", version: 5 }));
  });

  it("sends the first-movement category baseline even after live data changes", async () => {
    mocks.catalog.categories = [
      { id: "cat-1", cityId: "city-1", title: "One", icon: "Box", order: 0, version: 1 },
      { id: "cat-2", cityId: "city-1", title: "Two", icon: "Box", order: 1, version: 1 },
    ];
    mocks.reorderCategories.mockResolvedValue(undefined);
    const view = render(<LanguageProvider><CatalogApp /></LanguageProvider>);

    fireEvent.click((await screen.findAllByRole("button", { name: /Mover para baixo|Move down/i }))[0]!);
    mocks.catalog.categories = [
      { id: "cat-2", cityId: "city-1", title: "Two", icon: "Box", order: 0, version: 2 },
      { id: "cat-1", cityId: "city-1", title: "One", icon: "Box", order: 1, version: 2 },
      { id: "cat-3", cityId: "city-1", title: "Three", icon: "Box", order: 2, version: 1 },
    ];
    view.rerender(<LanguageProvider><CatalogApp /></LanguageProvider>);
    fireEvent.click(screen.getByRole("button", { name: /Salvar alterações|Save changes/i }));

    await waitFor(() => expect(mocks.reorderCategories).toHaveBeenCalledWith(
      ["cat-2", "cat-1"],
      ["cat-1", "cat-2"],
    ));
  });

  it("keeps independent pending category-order drafts when switching cities", async () => {
    mocks.catalog.cities = [
      { id: "city-1", name: "City One", order: 0, version: 1 },
      { id: "city-2", name: "City Two", order: 1, version: 1 },
    ];
    mocks.catalog.categories = [
      { id: "cat-1", cityId: "city-1", title: "One A", icon: "Box", order: 0, version: 1 },
      { id: "cat-2", cityId: "city-1", title: "One B", icon: "Box", order: 1, version: 1 },
      { id: "cat-3", cityId: "city-2", title: "Two A", icon: "Box", order: 0, version: 1 },
      { id: "cat-4", cityId: "city-2", title: "Two B", icon: "Box", order: 1, version: 1 },
    ];
    mocks.reorderCategories.mockResolvedValue(undefined);
    render(<LanguageProvider><CatalogApp /></LanguageProvider>);

    fireEvent.click((await screen.findAllByRole("button", { name: /Mover para baixo|Move down/i }))[0]!);
    fireEvent.click(screen.getByRole("button", { name: /^Cidade$|^City$/i }));
    fireEvent.click(await screen.findByRole("option", { name: "City Two" }));
    fireEvent.click((await screen.findAllByRole("button", { name: /Mover para baixo|Move down/i }))[0]!);
    fireEvent.click(screen.getByRole("button", { name: /Salvar alterações|Save changes/i }));

    await waitFor(() => expect(mocks.reorderCategories).toHaveBeenCalledTimes(2));
    expect(mocks.reorderCategories).toHaveBeenNthCalledWith(1, ["cat-2", "cat-1"], ["cat-1", "cat-2"]);
    expect(mocks.reorderCategories).toHaveBeenNthCalledWith(2, ["cat-4", "cat-3"], ["cat-3", "cat-4"]);
  });

  it("disables only the busy catalog entity instead of globally blocking unrelated order controls", async () => {
    mocks.catalog.categories = [
      { id: "cat-1", cityId: "city-1", title: "One", icon: "Box", order: 0, version: 1 },
      { id: "cat-2", cityId: "city-1", title: "Two", icon: "Box", order: 1, version: 1 },
    ];
    mocks.busyEntityIds = new Set(["unrelated-product"]);
    const view = render(<LanguageProvider><CatalogApp /></LanguageProvider>);
    expect((await screen.findAllByRole("button", { name: /Mover para baixo|Move down/i }))[0]).toBeEnabled();

    mocks.busyEntityIds = new Set(["cat-1"]);
    view.rerender(<LanguageProvider><CatalogApp /></LanguageProvider>);
    expect((await screen.findAllByRole("button", { name: /Mover para baixo|Move down/i }))[0]).toBeDisabled();
  });

  it("sends the first-movement product baseline even after live data changes", async () => {
    mocks.catalog.products = [
      { id: "p1", categoryId: "cat-1", name: "One", amount: 1, currency: "BRL", prices: { BRL: 1 }, order: 0, images: [], version: 1 },
      { id: "p2", categoryId: "cat-1", name: "Two", amount: 2, currency: "BRL", prices: { BRL: 2 }, order: 1, images: [], version: 1 },
    ];
    mocks.reorderProducts.mockResolvedValue(undefined);
    const view = render(<LanguageProvider><CatalogApp /></LanguageProvider>);
    fireEvent.click(await screen.findByRole("button", { name: /Lista|List/i }));
    const moveDown = view.container.querySelector<HTMLButtonElement>('.product-card .product-order-button[aria-label="Move down"]');
    expect(moveDown).not.toBeNull();
    fireEvent.click(moveDown!);

    mocks.catalog.products = [
      { id: "p2", categoryId: "cat-1", name: "Two", amount: 2, currency: "BRL", prices: { BRL: 2 }, order: 0, images: [], version: 2 },
      { id: "p1", categoryId: "cat-1", name: "One", amount: 1, currency: "BRL", prices: { BRL: 1 }, order: 1, images: [], version: 2 },
      { id: "p3", categoryId: "cat-1", name: "Three", amount: 3, currency: "BRL", prices: { BRL: 3 }, order: 2, images: [], version: 1 },
    ];
    view.rerender(<LanguageProvider><CatalogApp /></LanguageProvider>);
    fireEvent.click(screen.getByRole("button", { name: /Salvar alterações|Save changes/i }));

    await waitFor(() => expect(mocks.reorderProducts).toHaveBeenCalledWith([{
      categoryId: "cat-1",
      productIds: ["p2", "p1"],
      expectedOrder: ["p1", "p2"],
    }]));
  });
});
