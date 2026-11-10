import { dateField, intField, isSeasonName, isUuid, textField, uuidField } from "@/lib/validation";

const form = (values: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.append(k, v);
  return f;
};

describe("validation", () => {
  it("accepts only well-formed UUIDs", () => {
    expect(isUuid("3f2b8c1e-9d4a-4b6f-8a2e-1c5d7e9f0a3b")).toBe(true);
    expect(isUuid("3f2b8c1e-9d4a-4b6f-8a2e-1c5d7e9f0a3b; drop table")).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(uuidField(form({ id: "nope" }), "id")).toBeNull();
  });

  it("trims, collapses whitespace and enforces a length limit", () => {
    expect(textField(form({ n: "  Ben   Hughes " }), "n")).toBe("Ben Hughes");
    expect(textField(form({ n: "   " }), "n")).toBeNull();
    expect(textField(form({ n: "x".repeat(61) }), "n", 60)).toBeNull();
    expect(textField(form({}), "n")).toBeNull();
  });

  it("bounds integers", () => {
    expect(intField(form({ s: "180" }), "s", 0, 180)).toBe(180);
    expect(intField(form({ s: "181" }), "s", 0, 180)).toBeNull();
    expect(intField(form({ s: "1.5" }), "s", 0, 180)).toBeNull();
    expect(intField(form({ s: "abc" }), "s", 0, 180)).toBeNull();
  });

  it("checks dates and season names", () => {
    expect(dateField(form({ d: "2026-11-10T19:30" }), "d")).toBe("2026-11-10T19:30");
    expect(dateField(form({ d: "next tuesday" }), "d")).toBeNull();
    expect(isSeasonName("25/26")).toBe(true);
    expect(isSeasonName("2025/26")).toBe(false);
  });
});
