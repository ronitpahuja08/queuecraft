import { describe, expect, it } from "vitest";

import { QUEUECRAFT_VERSION } from "../src/index.js";

describe("QueueCraft package", () => {
  it("exposes a semantic version", () => {
    expect(QUEUECRAFT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
