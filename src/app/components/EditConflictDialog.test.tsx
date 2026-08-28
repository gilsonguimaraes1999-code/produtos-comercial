import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { CatalogConflictError } from "../supabase/catalogMutations";
import { EditConflictDialog } from "./EditConflictDialog";
import { CategoryForm } from "./CategoryForm";
import { CityForm } from "./CityForm";
import { DescriptionTemplatesPage } from "./DescriptionTemplatesPage";
import { ProductForm } from "./ProductForm";

function translated(children: ReactNode) {
  return render(<LanguageProvider>{children}</LanguageProvider>);
}

describe("catalog edit conflicts", () => {
  it("keeps the product draft open when the server reports EDIT_CONFLICT", async () => {
    const onSave = vi.fn().mockRejectedValue(new CatalogConflictError("entity"));
    translated(<ProductForm
      product={{
        id: "p1", version: 7, categoryId: "cat1", name: "Original", amount: 10,
        currency: "BRL", prices: { BRL: 10 }, order: 0, images: [],
      }}
      cities={[{ id: "city1", name: "Nobre", order: 0, version: 1 }]}
      categories={[{ id: "cat1", cityId: "city1", title: "Produtos", icon: "Box", order: 0, version: 1 }]}
      permissions={{ editProductName: true, editProductPrice: true, editProductDescription: true, editProductMedia: true }}
      onSave={onSave}
      onCancel={vi.fn()}
    />);

    const name = screen.getByLabelText(/nome do produto|product name/i);
    fireEvent.change(name, { target: { value: "Meu rascunho" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar produto|save product/i }));

    await screen.findByRole("dialog", { name: /conflito|conflict/i });
    expect(screen.getByDisplayValue("Meu rascunho")).toBeInTheDocument();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: "p1", version: 7, name: "Meu rascunho" }));
  });

  it("offers reload, copy and keep-editing as independent actions", async () => {
    const onReload = vi.fn().mockResolvedValue(undefined);
    const onCopy = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    translated(<EditConflictDialog entityName="Produto" onReload={onReload} onCopy={onCopy} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: /carregar.*recente|load latest/i }));
    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /copiar|copy/i }));
    await waitFor(() => expect(onCopy).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /continuar editando|keep editing/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("keeps a city draft and its opened version after a conflict", async () => {
    const onSave = vi.fn().mockRejectedValue(new CatalogConflictError("entity"));
    translated(<CityForm
      cities={[{ id: "city1", name: "Original", order: 0, version: 5 }]}
      categories={[]}
      products={[]}
      onSave={onSave}
      onDelete={vi.fn()}
      onReorder={vi.fn()}
      onCancel={vi.fn()}
    />);
    fireEvent.click(screen.getByRole("button", { name: /edit city|editar cidade/i }));
    const input = screen.getByDisplayValue("Original");
    fireEvent.change(input, { target: { value: "Meu rascunho" } });
    fireEvent.click(screen.getByRole("button", { name: /save city|salvar cidade/i }));

    await screen.findByRole("dialog", { name: /conflito|conflict/i });
    expect(screen.getByDisplayValue("Meu rascunho")).toBeInTheDocument();
    expect(onSave).toHaveBeenCalledWith({ id: "city1", name: "Meu rascunho", version: 5 });
  });

  it("keeps a category draft and its opened version after a conflict", async () => {
    const onSave = vi.fn().mockRejectedValue(new CatalogConflictError("entity"));
    translated(<CategoryForm
      category={{ id: "cat1", cityId: "city1", title: "Original", icon: "Box", order: 0, version: 3 }}
      cities={[{ id: "city1", name: "Nobre", order: 0, version: 1 }]}
      onSave={onSave}
      onCancel={vi.fn()}
    />);
    const input = screen.getByDisplayValue("Original");
    fireEvent.change(input, { target: { value: "Meu rascunho" } });
    fireEvent.click(screen.getByRole("button", { name: /save category|salvar categoria/i }));

    await screen.findByRole("dialog", { name: /conflito|conflict/i });
    expect(screen.getByDisplayValue("Meu rascunho")).toBeInTheDocument();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: "cat1", title: "Meu rascunho", version: 3 }));
  });

  it("keeps a description-template draft and its opened version after a conflict", async () => {
    const onSave = vi.fn().mockRejectedValue(new CatalogConflictError("entity"));
    translated(<DescriptionTemplatesPage
      categories={[{ id: "cat1", cityId: "city1", title: "Produtos", icon: "Box", order: 0, version: 1 }]}
      templates={[{ id: "tpl1", categoryId: "cat1", title: "Original", order: 0, active: true, htmlBR: "", htmlEN: "", htmlES: "", version: 4 }]}
      onSave={onSave}
      onDelete={vi.fn()}
    />);
    fireEvent.click(screen.getByRole("button", { name: /original/i }));
    const input = screen.getByDisplayValue("Original");
    fireEvent.change(input, { target: { value: "Meu rascunho" } });
    fireEvent.click(screen.getByRole("button", { name: /save template|salvar modelo|salvar template/i }));

    await screen.findByRole("dialog", { name: /conflito|conflict/i });
    expect(screen.getByDisplayValue("Meu rascunho")).toBeInTheDocument();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: "tpl1", title: "Meu rascunho", version: 4 }));
  });
});
