import { distanceForScore, formatDistance, medalFor, roundEnds } from "../round";
import { score } from "../../engine/physics";

describe("medalFor", () => {
  const passScore = 55;

  it("names a hole-out by the ball that made it", () => {
    expect(medalFor({ holed: true, attempt: 1, best: 100, passScore })).toBe("ace");
    expect(medalFor({ holed: true, attempt: 2, best: 100, passScore })).toBe("birdie");
    expect(medalFor({ holed: true, attempt: 3, best: 100, passScore })).toBe("par");
  });

  it("gives a bogey for passing without holing out", () => {
    expect(medalFor({ holed: false, attempt: 1, best: passScore, passScore })).toBe("bogey");
    expect(medalFor({ holed: false, attempt: 3, best: 79, passScore })).toBe("bogey");
  });

  it("gives no medal below the pass threshold", () => {
    expect(medalFor({ holed: false, attempt: 3, best: passScore - 1, passScore })).toBeNull();
    expect(medalFor({ holed: false, attempt: 1, best: 0, passScore })).toBeNull();
  });

  it("is driven by the attempt, not by how close the earlier balls were", () => {
    // a great-but-not-holed first ball then a hole-out on the third is still a Par
    expect(medalFor({ holed: true, attempt: 3, best: 100, passScore })).toBe("par");
  });
});

describe("distanceForScore", () => {
  // Every threshold the generator can produce: Math.round(55 + diff * 15), diff in 0..1.
  const thresholds = Array.from({ length: 16 }, (_, i) => 55 + i);

  it("round-trips through the real score() for every reachable pass threshold", () => {
    for (const points of thresholds) {
      const dist = distanceForScore(points);
      expect(score({ holed: false, dist })).toBe(points);
    }
  });

  it("agrees with the known reference points of the curve", () => {
    expect(distanceForScore(80)).toBeCloseTo(0, 10); // max proximity score is at the cup
    expect(distanceForScore(0)).toBeCloseTo(8, 10); // scoring runs out at 8 ft
    expect(distanceForScore(58)).toBeCloseTo(2.2, 10);
  });

  it("formats a distance the way finishing distances are already shown", () => {
    expect(formatDistance(2.2)).toBe("2.2 ft");
    expect(formatDistance(0.5)).toBe("6 in");
  });
});

describe("roundEnds", () => {
  it("ends a campaign round the moment a ball drops, with balls to spare", () => {
    expect(roundEnds({ mode: "play", holed: true, ballsLeft: 2 })).toBe(true);
    expect(roundEnds({ mode: "play", holed: true, ballsLeft: 1 })).toBe(true);
  });

  it("keeps a campaign round going while balls remain and nothing has dropped", () => {
    expect(roundEnds({ mode: "play", holed: false, ballsLeft: 2 })).toBe(false);
    expect(roundEnds({ mode: "play", holed: false, ballsLeft: 1 })).toBe(false);
    expect(roundEnds({ mode: "play", holed: false, ballsLeft: 0 })).toBe(true);
  });

  it("treats a custom green like a campaign round", () => {
    expect(roundEnds({ mode: "custom", holed: true, ballsLeft: 2 })).toBe(true);
  });

  // The daily sums all three balls out of 300, so a hole-out must NOT cut it short.
  it("never ends a daily early, even on a first-ball hole-out", () => {
    expect(roundEnds({ mode: "daily", holed: true, ballsLeft: 2 })).toBe(false);
    expect(roundEnds({ mode: "daily", holed: true, ballsLeft: 1 })).toBe(false);
    expect(roundEnds({ mode: "daily", holed: true, ballsLeft: 0 })).toBe(true);
    expect(roundEnds({ mode: "daily", holed: false, ballsLeft: 0 })).toBe(true);
  });
});
