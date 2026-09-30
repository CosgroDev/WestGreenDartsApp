import { isPeaCelebration, getLegCelebration } from "../src/lib/scoringCelebration";

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

describe("log celebration", () => {
  const leg = (darts: number) => [
    ...Array.from({ length: Math.floor((darts - 1) / 3) }, () => ({ darts: 3, isCheckout: false })),
    { darts: (darts - 1) % 3 + 1, isCheckout: true }
  ];

  it.each([20, 21, 22, 23, 24, 25])("shows the log for a %i-dart West Green leg", (darts) => {
    expect(getLegCelebration("completed", "west_green", leg(darts))).toBe("log");
    expect(isPeaCelebration("completed", "west_green", leg(darts))).toBe(false);
  });
  it("keeps peas for 19 darts and shows nothing for 26", () => {
    expect(getLegCelebration("completed", "west_green", leg(19))).toBe("peas");
    expect(getLegCelebration("completed", "west_green", leg(26))).toBeNull();
  });
  it("excludes opponent wins, incomplete legs and missing checkouts", () => {
    expect(getLegCelebration("completed", "opponent", leg(22))).toBeNull();
    expect(getLegCelebration("in_progress", "west_green", leg(22))).toBeNull();
    expect(getLegCelebration("completed", "west_green", leg(22).map(v => ({ ...v, isCheckout: false })))).toBeNull();
  });
});
