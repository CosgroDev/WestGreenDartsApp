import { isPeaCelebration } from "../src/lib/scoringCelebration";

const visits = (checkoutDarts: number) => [
  ...Array.from({ length: 6 }, () => ({ darts: 3, isCheckout: false })),
  { darts: checkoutDarts, isCheckout: true }
];

describe("garden pea celebration", () => {
  it("celebrates a confirmed West Green 19-dart leg", () => {
    expect(isPeaCelebration("completed", "west_green", visits(1))).toBe(true);
  });
  it("excludes 20 and 21 darts including the final visit", () => {
    expect(isPeaCelebration("completed", "west_green", visits(2))).toBe(false);
    expect(isPeaCelebration("completed", "west_green", visits(3))).toBe(false);
  });
  it("excludes opponent wins and incomplete legs", () => {
    expect(isPeaCelebration("completed", "opponent", visits(1))).toBe(false);
    expect(isPeaCelebration("in_progress", "west_green", visits(1))).toBe(false);
  });
  it("requires checkout evidence", () => {
    expect(isPeaCelebration("completed", "west_green", [])).toBe(false);
    expect(isPeaCelebration("completed", "west_green", [{ darts: 3, isCheckout: false }])).toBe(false);
  });
});
