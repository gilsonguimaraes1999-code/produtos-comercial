type TranslationInput = {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  mimeType: "text/plain" | "text/html";
};

type TranslationOptions = {
  fetcher?: typeof fetch;
  retryDelayMs?: number;
  contactEmail?: string;
};

type MyMemoryPayload = {
  responseData?: { translatedText?: string };
  responseStatus?: number | string;
  responseDetails?: string;
};

const maxChunkBytes = 450;
const languageCodes: Record<string, string> = {
  pt: "pt-BR",
  en: "en-US",
  es: "es-ES",
};

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function splitTextByUtf8Bytes(text: string, maxBytes = maxChunkBytes): string[] {
  if (!text || byteLength(text) <= maxBytes) return text ? [text] : [];

  const tokens = text.match(/\S+\s*|\s+/gu) || [text];
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current) chunks.push(current);
    current = "";
  };

  for (const token of tokens) {
    if (byteLength(current + token) <= maxBytes) {
      current += token;
      continue;
    }

    flush();
    if (byteLength(token) <= maxBytes) {
      current = token;
      continue;
    }

    for (const character of token) {
      if (byteLength(current + character) > maxBytes) flush();
      current += character;
    }
  }

  flush();
  return chunks;
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function translateChunk(
  text: string,
  input: TranslationInput,
  options: Required<Pick<TranslationOptions, "fetcher" | "retryDelayMs">> & Pick<TranslationOptions, "contactEmail">,
): Promise<string> {
  const endpoint = new URL("https://api.mymemory.translated.net/get");
  endpoint.searchParams.set("q", text);
  endpoint.searchParams.set(
    "langpair",
    `${languageCodes[input.sourceLanguage] || input.sourceLanguage}|${languageCodes[input.targetLanguage] || input.targetLanguage}`,
  );
  endpoint.searchParams.set("mt", "1");
  if (options.contactEmail) endpoint.searchParams.set("de", options.contactEmail);

  let lastStatus = 500;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await options.fetcher(endpoint, {
      headers: { Accept: "application/json" },
    });
    const payload = await response.json() as MyMemoryPayload;
    const providerStatus = Number(payload.responseStatus || response.status);
    lastStatus = response.ok ? providerStatus : response.status;
    const translated = payload.responseData?.translatedText;

    if (response.ok && providerStatus < 400 && typeof translated === "string") {
      return translated;
    }

    const retryable = lastStatus === 429 || lastStatus >= 500;
    if (!retryable || attempt === 2) break;
    await delay(options.retryDelayMs * (2 ** attempt));
  }

  throw new Error(`MYMEMORY_TRANSLATION_${lastStatus}`);
}

async function translateTextSegment(
  text: string,
  input: TranslationInput,
  options: Required<Pick<TranslationOptions, "fetcher" | "retryDelayMs">> & Pick<TranslationOptions, "contactEmail">,
): Promise<string> {
  if (!/[\p{L}\p{N}]/u.test(text)) return text;
  const chunks = splitTextByUtf8Bytes(text);
  const translated: string[] = [];
  for (const chunk of chunks) translated.push(await translateChunk(chunk, input, options));
  return translated.join("");
}

export async function translateContent(
  input: TranslationInput,
  suppliedOptions: TranslationOptions = {},
): Promise<string> {
  if (!input.text || input.sourceLanguage === input.targetLanguage) return input.text;
  const options = {
    fetcher: suppliedOptions.fetcher || fetch,
    retryDelayMs: suppliedOptions.retryDelayMs ?? 300,
    contactEmail: suppliedOptions.contactEmail,
  };

  if (input.mimeType === "text/plain") {
    return translateTextSegment(input.text, input, options);
  }

  const segments = input.text.split(/(<[^>]+>)/g);
  const translated: string[] = [];
  for (const segment of segments) {
    translated.push(segment.startsWith("<") && segment.endsWith(">")
      ? segment
      : await translateTextSegment(segment, input, options));
  }
  return translated.join("");
}
