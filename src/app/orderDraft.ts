export interface CatalogOrderDraft {
  requestedOrder: string[];
  expectedOrder: string[];
}

export function continueOrderDraft(
  current: CatalogOrderDraft | null | undefined,
  baseline: string[],
  requestedOrder: string[],
): CatalogOrderDraft {
  return {
    expectedOrder: [...(current?.expectedOrder || baseline)],
    requestedOrder: [...requestedOrder],
  };
}
