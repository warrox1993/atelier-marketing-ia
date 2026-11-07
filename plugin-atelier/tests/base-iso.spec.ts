import { describe, expect, it } from "vitest";
import { iso } from "../src/serveur/base.js";

describe("iso", () => {
  it("lit une date seule sans prendre le jour pour un fuseau", () => {
    expect(iso("2026-11-05")).toBe("2026-11-05T00:00:00.000Z");
    expect(iso("2026-11-05 10:00:00+01")).toBe("2026-11-05T09:00:00.000Z");
    expect(iso("2026-11-05T10:00:00-05")).toBe("2026-11-05T15:00:00.000Z");
  });
});
