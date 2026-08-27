import { describe, expect, it, vi } from "vitest";
import { translateContent } from "./free-translate";

function okTranslation(translatedText: string): Response {
  return new Response(JSON.stringify({
    responseData: { translatedText },
    responseStatus: 200,
    matches: [],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("free translation provider", () => {
  it("preserves HTML tags while translating visible text", async () => {
    const translations = new Map([
      ["Olá ", "Hello "],
      ["mundo", "world"],
      [".", "."],
    ]);
    const fetcher = vi.fn(async (url: string | URL) => {
      const source = new URL(String(url)).searchParams.get("q") || "";
      return okTranslation(translations.get(source) || source);
    });

    const result = await translateContent({
      text: "<p>Olá <strong>mundo</strong>.</p>",
      sourceLanguage: "pt",
      targetLanguage: "en",
      mimeType: "text/html",
    }, { fetcher });

    expect(result).toBe("<p>Hello <strong>world</strong>.</p>");
  });

  it("splits long content without exceeding the provider's 500-byte limit", async () => {
    const fetcher = vi.fn(async (url: string | URL) => {
      const source = new URL(String(url)).searchParams.get("q") || "";
      expect(new TextEncoder().encode(source).byteLength).toBeLessThanOrEqual(450);
      return okTranslation(source);
    });
    const text = "produto muito especial ".repeat(60);

    const result = await translateContent({
      text,
      sourceLanguage: "pt",
      targetLanguage: "es",
      mimeType: "text/plain",
    }, { fetcher });

    expect(result).toBe(text);
    expect(fetcher.mock.calls.length).toBeGreaterThan(1);
  });

  it("retries temporary failures and surfaces a recoverable error", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      responseStatus: 429,
      responseDetails: "Daily Limit Exceeded",
    }), { status: 429, headers: { "Content-Type": "application/json" } }));

    await expect(translateContent({
      text: "Produto",
      sourceLanguage: "pt",
      targetLanguage: "en",
      mimeType: "text/plain",
    }, { fetcher, retryDelayMs: 0 })).rejects.toThrow("MYMEMORY_TRANSLATION_429");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
