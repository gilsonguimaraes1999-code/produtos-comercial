import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { DescriptionTemplatesPage } from "./DescriptionTemplatesPage";

vi.mock("./RichHtmlEditor", () => ({
  RichHtmlEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea aria-label="rich editor" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

describe("DescriptionTemplatesPage version adoption", () => {
  it("uses the confirmed version on a second save without reopening the editor", async () => {
    const onSave = vi.fn()
      .mockResolvedValueOnce({ id: "template-1", version: 8 })
      .mockResolvedValueOnce({ id: "template-1", version: 9 });
    render(
      <LanguageProvider><DescriptionTemplatesPage
        categories={[{ id: "cat-1", cityId: "city-1", title: "Cat", icon: "Box", order: 0, version: 1 }]}
        templates={[{
          id: "template-1", categoryId: "cat-1", title: "Modelo", order: 0, active: true,
          htmlBR: "", htmlEN: "", htmlES: "", version: 7,
        }]}
        onSave={onSave}
        onDelete={vi.fn()}
      /></LanguageProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Modelo/i }));
    const saveButton = screen.getByRole("button", { name: /Salvar modelo|Save template/i });
    fireEvent.click(saveButton);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    fireEvent.click(saveButton);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));

    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ id: "template-1", version: 7 });
    expect(onSave.mock.calls[1]?.[0]).toMatchObject({ id: "template-1", version: 8 });
  });
});
