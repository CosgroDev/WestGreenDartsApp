import { safeLocalDestination } from "./localDestination";

describe("safeLocalDestination", () => {
  it("preserves the complete scoring destination", () => {
    expect(safeLocalDestination("/scoring?game=abc&fixture=def&home=1#summary")).toBe("/scoring?game=abc&fixture=def&home=1#summary");
  });
  it.each([null, undefined, "", "https://evil.example", "//evil.example/path", "/\\evil.example", "/pin?redirect=/scoring", "/pin/another", "/fixtures/../pin", "/\n/evil.example"])("rejects an unsafe or looping destination: %s", value => {
    expect(safeLocalDestination(value)).toBe("/dashboard");
  });
  it("allows normal app routes and query values containing external text", () => {
    expect(safeLocalDestination("/stats?view=players&season=all")).toBe("/stats?view=players&season=all");
    expect(safeLocalDestination("/fixtures?search=https%3A%2F%2Fexample.com")).toBe("/fixtures?search=https%3A%2F%2Fexample.com");
  });
});
