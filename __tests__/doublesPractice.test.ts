import { DOUBLES_SEQUENCE, nextRandomDouble, nextTargetForRound, pointsForDart } from "@/lib/doublesPractice";

describe("doubles practice", () => {
  it("rewards an earlier hit and gives nothing for a miss", () => {
    expect([1, 2, 3, 0, 4].map(pointsForDart)).toEqual([3, 2, 1, 0, 0]);
  });

  it("follows the fixed rotation, then switches to random doubles", () => {
    DOUBLES_SEQUENCE.forEach((target, round) => {
      expect(nextTargetForRound(round, 99)).toEqual({ target, phase: "sequence" });
    });
    const after = nextTargetForRound(DOUBLES_SEQUENCE.length, 6);
    expect(after.phase).toBe("random");
    expect(DOUBLES_SEQUENCE).toContain(after.target);
  });

  it("never serves the same random double twice running", () => {
    for (const current of DOUBLES_SEQUENCE) {
      for (let i = 0; i < 50; i++) {
        const next = nextRandomDouble(current);
        expect(next).not.toBe(current);
        expect(DOUBLES_SEQUENCE).toContain(next);
      }
    }
  });
});
