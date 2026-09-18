import { medalFor, roundEnds } from "../round";

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
