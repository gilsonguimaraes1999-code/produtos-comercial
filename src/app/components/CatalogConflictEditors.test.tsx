import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { CatalogConflictError } from "../supabase/catalogMutations";
import { CategoryForm } from "./CategoryForm";
import { CityForm } from "./CityForm";

describe("catalog editor conflict integration", () => {
  it("keeps the city order baseline captured by the first movement", async () => {
    const onReorder = vi.fn().mockResolvedValue(undefined);
    const props = {
      categories: [], products: [], onSave: vi.fn(), onDelete: vi.fn(), onReorder, onCancel: vi.fn(),
    };
    const view = render(
      <LanguageProvider><CityForm
        {...props}
        cities={[
          { id: "city-1", name: "One", order: 0, version: 1 },
          { id: "city-2", name: "Two", order: 1, version: 1 },
        ]}
      /></LanguageProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mover One para baixo" }));
    view.rerender(
      <LanguageProvider><CityForm
        {...props}
        cities={[
          { id: "city-2", name: "Two", order: 0, version: 2 },
          { id: "city-1", name: "One", order: 1, version: 2 },
          { id: "city-3", name: "Three", order: 2, version: 1 },
        ]}
      /></LanguageProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Salvar alterações|Save changes/i }));

    await waitFor(() => expect(onReorder).toHaveBeenCalledWith(
      ["city-2", "city-1"],
      ["city-1", "city-2"],
    ));
  });

  it("keeps the category draft visible and offers reload/copy/keep actions", async () => {
    const onSave = vi.fn().mockRejectedValue(new CatalogConflictError("entity"));
    render(
      <LanguageProvider><CategoryForm
        category={{ id: "cat-1", cityId: "city-1", title: "Original", icon: "Box", order: 0, version: 4 }}
        cities={[{ id: "city-1", name: "Cidade", order: 0, version: 1 }]}
        onSave={onSave}
        onCancel={vi.fn()}
      /></LanguageProvider>,
    );

    const title = screen.getByDisplayValue("Original");
    fireEvent.change(title, { target: { value: "Meu rascunho" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar categoria|Save category/i }));

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(title).toHaveValue("Meu rascunho");
    expect(screen.getByRole("button", { name: /Copiar minhas alterações|Copy my changes/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continuar editando|Keep editing/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Carregar versão mais recente|Load latest version/i })).toBeInTheDocument();
  });

  it("keeps the city draft visible when the definitive save conflicts", async () => {
    const onSave = vi.fn().mockRejectedValue(new CatalogConflictError("entity"));
    render(
      <LanguageProvider><CityForm
        cities={[{ id: "city-1", name: "Original", order: 0, version: 2 }]}
        categories={[]}
        products={[]}
        onSave={onSave}
        onDelete={vi.fn()}
        onReorder={vi.fn()}
        onCancel={vi.fn()}
      /></LanguageProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Editar cidade|Edit city/i }));
    const input = screen.getByDisplayValue("Original");
    fireEvent.change(input, { target: { value: "Meu rascunho" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar cidade|Save city/i }));

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(input).toHaveValue("Meu rascunho");
  });
});
