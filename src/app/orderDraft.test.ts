import { describe, expect, it } from "vitest";

import { continueOrderDraft } from "./orderDraft";

describe("continueOrderDraft", () => {
  it("keeps the baseline captured by the first movement when live data changes", () => {
    const first = continueOrderDraft(null, ["a", "b", "c"], ["b", "a", "c"]);
    const continued = continueOrderDraft(first, ["x", "b", "a", "c"], ["b", "a", "x", "c"]);

    expect(continued).toEqual({
      expectedOrder: ["a", "b", "c"],
      requestedOrder: ["b", "a", "x", "c"],
    });
  });
});
