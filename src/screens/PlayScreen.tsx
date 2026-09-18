import React, { useEffect, useMemo, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RootStackParamList } from "../navigation/types";
import type { Level, SimResult } from "../engine/physics";
import { GreenCanvas } from "../render/GreenCanvas";
import { LoadingGreen } from "../render/LoadingGreen";
import type { BallOutcome } from "../render/GreenGame";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { colors } from "../theme/colors";
import { BALLS, starsFor, targets } from "../game/session";
import { MEDALS, distanceForScore, formatDistance, medalFor, roundEnds, type Medal } from "../game/round";
import { RoundOverlay } from "./RoundOverlay";
import { campaignGreen, dailyGreen, prefetchCampaign, setGenerationPaused } from "../game/greenCache";
import { getCampaignLevel, getDailyResult, recordGreenResult, saveDailyResult, setCampaignLevel } from "../db/db";

type Props = NativeStackScreenProps<RootStackParamList, "Play">;

interface Outcome {
  result: SimResult;
  points: number;
}

interface RoundResult {
  medal: Medal | null;
  missed?: boolean;
  headline: string;
  detail: string;
  note?: string;
}

function fmtDist(dist: number): string {
  return dist < 1 ? `${Math.round(dist * 12)} in` : `${dist.toFixed(1)} ft`;
}

export default function PlayScreen({ route, navigation }: Props) {
  const { mode } = route.params;
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();

  const [level, setLevel] = useState<Level | null>(null);
  const [dailyMeta, setDailyMeta] = useState<{ dailyN: number; day: string } | null>(null);
  const [lockedTotal, setLockedTotal] = useState<number | null>(null);

  const [balls, setBalls] = useState(BALLS);
  const [best, setBest] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [message, setMessage] = useState("");
  const [resultLine, setResultLine] = useState<string | null>(null);
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (route.params.mode === "daily") {
        const { level: L, dailyN, day } = await dailyGreen(new Date());
        const existing = await getDailyResult(day);
        if (cancelled) return;
        setLevel(L);
        setDailyMeta({ dailyN, day });
        if (existing) {
          setLockedTotal(existing.total);
          setBalls(0);
        } else {
          setLockedTotal(null);
          setBalls(BALLS);
        }
      } else if (route.params.mode === "play") {
        const L = await campaignGreen(route.params.levelNo);
        if (cancelled) return;
        // Warm the NEXT green as soon as this one is playable, not when the round ends. A
        // first-ball hole-out now ends a round in seconds, so waiting until the result screen
        // left almost no window; reading the brief and taking the first shot is the biggest
        // idle stretch available. It pauses itself while a ball is rolling.
        prefetchCampaign(route.params.levelNo + 1);
        setLevel(L);
        setBalls(BALLS);
      } else {
        if (cancelled) return;
        setLevel(route.params.level);
        setBalls(BALLS);
      }
      setBest(0);
      setOutcomes([]);
      setRoundResult(null);
      setResultLine(null);
    }
    load();
    return () => {
      cancelled = true;
      // leaving mid-roll must not strand background generation in the paused state
      setGenerationPaused(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params]);

  const { t1, t2 } = useMemo(() => (level ? targets(level) : { t1: 55, t2: 73 }), [level]);
  // the pass threshold expressed as a distance, which is the only version a player can act on
  const passDistance = useMemo(() => formatDistance(distanceForScore(t1)), [t1]);

  useEffect(() => {
    if (!level) return;
    if (mode === "daily") {
      setMessage(
        lockedTotal !== null
          ? `You already played today's green: ${lockedTotal} out of 300. Come back tomorrow for a new one.`
          : "One shot at today's green: three balls, all three count, up to 300. Closer = more points, in the cup = 100. Drag inside the zone to aim, let go to drop.",
      );
    } else {
      setMessage(`Closer to the cup = more points, up to 80. In the cup = 100. Best of ${BALLS} balls counts. Drag inside the zone to aim, let go to drop.`);
    }
  }, [level, mode, lockedTotal]);

  function handleZoneMiss() {
    setMessage("Start inside the drop zone, then drag to aim.");
  }

  function handleRollStart() {
    setMessage("Rolling…");
    setResultLine(null);
    // A solver candidate is a 15-85ms indivisible chunk; keep it out of the roll animation.
    setGenerationPaused(true);
  }

  async function handleOutcome(o: BallOutcome, holed: boolean) {
    setGenerationPaused(false); // ball has settled — background generation can resume
    if (!level) return;
    const attempt = outcomes.length + 1; // 1-based: the ball that produced this result
    const nextOutcomes = [...outcomes, { result: o.result, points: o.points }];
    setOutcomes(nextOutcomes);
    setBest(o.best);

    const dist = o.result.dist;
    const feet = fmtDist(dist);
    setResultLine(holed ? "In the cup · 100 pts" : `${feet} away · ${o.points} pts`);

    const total = nextOutcomes.reduce((a, q) => a + q.points, 0);
    const ended = roundEnds({ mode, holed, ballsLeft: o.ballsLeft });

    // Daily is untouched by the campaign rework: every ball counts toward a total out of 300,
    // and a hole-out does NOT end it early.
    if (mode === "daily" && dailyMeta) {
      if (ended) {
        setMessage(`${total} out of 300 today. New green tomorrow.`);
        const drops = nextOutcomes.map((q) => [q.result.x, q.result.y] as [number, number]);
        const scores = nextOutcomes.map((q) => q.points);
        await saveDailyResult(dailyMeta.day, total, drops, scores);
        setRoundResult({ medal: null, headline: `Daily #${dailyMeta.dailyN}`, detail: `${total} / 300` });
      } else {
        setMessage(
          `${o.result.lipped ? "Too much pace. " : ""}${total} so far. ${o.ballsLeft} ball${o.ballsLeft > 1 ? "s" : ""} left — every ball counts today.`,
        );
      }
      return;
    }

    if (mode === "play") {
      await recordGreenResult(route.params.mode === "play" ? route.params.levelNo : 0, starsFor(o.best, t1, t2), o.best);
    }

    if (!ended) {
      const need = `inside ${passDistance} to pass, hole it for a medal`;
      setMessage(
        o.result.lipped
          ? `Too much pace — it ran over the cup. ${o.ballsLeft} ball${o.ballsLeft > 1 ? "s" : ""} left, ${need}.`
          : `${o.ballsLeft} ball${o.ballsLeft > 1 ? "s" : ""} left — ${need}.`,
      );
      return;
    }

    const medal = medalFor({ holed, attempt, best: o.best, passScore: t1 });
    const closest = Math.min(...nextOutcomes.map((q) => q.result.dist));
    setRoundResult({
      medal,
      missed: !medal,
      headline: medal ? MEDALS[medal].label : "Not this time",
      detail: medal ? `${o.best} pts` : `Best ${fmtDist(closest)} away`,
      // "needed 58" means nothing on its own — say what that is in feet.
      note: medal ? undefined : `Needed ${t1} pts — inside ${passDistance}`,
    });
    setMessage(medal ? `${MEDALS[medal].label}! ${MEDALS[medal].blurb}.` : `Out of balls. You needed to finish inside ${passDistance}.`);
  }

  function onNext() {
    if (route.params.mode !== "play") return;
    const nextLevelNo = route.params.levelNo + 1;
    setCampaignLevel(nextLevelNo);
    navigation.replace("Play", { mode: "play", levelNo: nextLevelNo });
  }

  function onRetry() {
    if (!level) return;
    setLevel({ ...level });
    setBalls(BALLS);
    setBest(0);
    setOutcomes([]);
    setRoundResult(null);
    setResultLine(null);
    setMessage("");
  }

  function emoji(r: SimResult): string {
    return r.holed ? "⛳" : r.dist < 3 ? "🟢" : r.dist < 8 ? "🟡" : "⚫";
  }

  async function onShare() {
    if (!level) return;
    const line = outcomes.map((o) => emoji(o.result)).join("");
    const n = starsFor(best, t1, t2);
    const starsTxt = "★".repeat(n) + "☆".repeat(3 - n);
    const total = outcomes.reduce((a, q) => a + q.points, 0);
    let text: string;
    if (mode === "daily" && dailyMeta) text = `Sink It #${dailyMeta.dailyN}\n${line} · ${total}/300`;
    else if (mode === "custom") text = `Sink It · my green ${starsTxt}\n${line} · ${best} pts`;
    else text = `Sink It · Green ${route.params.mode === "play" ? route.params.levelNo : ""} ${starsTxt}\n${line} · ${best} pts`;
    try {
      await Share.share({ message: text });
    } catch {
      // user cancelled — nothing to do
    }
  }

  if (!level) {
    return (
      <View style={[styles.loading, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <LoadingGreen reduceMotion={reduceMotion} />
      </View>
    );
  }

  const title = mode === "daily" ? `Daily #${dailyMeta?.dailyN ?? ""}` : mode === "custom" ? "Your green" : `Green ${route.params.mode === "play" ? route.params.levelNo : ""}`;
  const sub = mode === "daily" ? new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }) : mode === "custom" ? "Custom green" : level.name;
  const dailyLocked = mode === "daily" && lockedTotal !== null;

  const overlayActions = [];
  if (roundResult) {
    if (mode === "daily") {
      overlayActions.push({ label: "Share result", onPress: onShare });
    } else if (roundResult.medal) {
      if (mode === "play") overlayActions.push({ label: "Next green", onPress: onNext });
      else overlayActions.push({ label: "Play again", onPress: onRetry });
      overlayActions.push({ label: "Share", onPress: onShare, quiet: true });
    } else {
      overlayActions.push({ label: "Try again", onPress: onRetry });
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 24 }]}
      >
        <Pressable onPress={() => navigation.navigate("Home")}>
          <Text style={styles.back}>← Home</Text>
        </Pressable>

        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.sub}>{sub}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.targetLabel}>{mode === "daily" ? "max today" : "to pass"}</Text>
            <Text style={styles.targetValue}>{mode === "daily" ? 300 : t1}</Text>
          </View>
        </View>

        {/* How scoring works, up top where it can't be missed — this used to be a couple of
            small chips at the very bottom of the scroll. */}
        <View style={styles.brief}>
          <Text style={styles.briefTitle}>
            {mode === "daily" ? "All 3 balls count · max 300" : `Hole it for a medal · finish inside ${passDistance} to pass`}
          </Text>
          <Text style={styles.briefBody}>
            {mode === "daily"
              ? "Closer to the cup = more points (max 80 each). In the cup = 100. Every ball adds to today's total."
              : "Closer to the cup = more points (max 80). In the cup = 100 and ends the round — ball 1 is an Ace, ball 2 a Birdie, ball 3 a Par."}
          </Text>
          <View style={styles.briefChips}>
            <Text style={styles.briefChip}>Stimp {level.stimp}</Text>
            <Text style={styles.briefChip}>Drag in the zone to aim</Text>
          </View>
        </View>

        <View style={styles.statusRow}>
          <View style={styles.balls}>
            {Array.from({ length: BALLS }, (_, i) => (
              <View key={i} style={[styles.ball, i < BALLS - balls && styles.ballUsed]} />
            ))}
          </View>
          <View style={styles.bestRow}>
            <Text style={styles.bestLabel}>best</Text>
            <Text style={styles.bestValue}>{best}</Text>
          </View>
        </View>

        {!dailyLocked ? (
          <GreenCanvas
            level={level}
            mode={mode}
            ballsCount={balls}
            reduceMotion={reduceMotion}
            locked={!!roundResult}
            callbacks={{
              onZoneMiss: handleZoneMiss,
              onRollStart: handleRollStart,
              onBallsChange: setBalls,
              onBallOutcome: (o) => handleOutcome(o, false),
              onHoled: (o) => handleOutcome(o, true),
            }}
          />
        ) : null}

        <View style={styles.msg}>
          {resultLine && <Text style={styles.resultPill}>{resultLine}</Text>}
          <Text style={styles.msgText}>{message}</Text>
        </View>

        {dailyLocked && (
          <View style={styles.actions}>
            <Pressable style={styles.btn} onPress={onShare}>
              <Text style={styles.btnText}>Share result</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {roundResult && (
        <RoundOverlay
          medal={roundResult.medal}
          missed={roundResult.missed}
          headline={roundResult.headline}
          detail={roundResult.detail}
          note={roundResult.note}
          actions={overlayActions}
          onHome={() => navigation.navigate("Home")}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  content: { padding: 14, paddingBottom: 24 },
  loading: { flex: 1, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  back: { color: colors.textSoft, fontFamily: "Poppins_600SemiBold", fontSize: 14, paddingVertical: 6 },
  header: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginTop: 4 },
  title: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 22 },
  sub: { color: colors.textSoft, fontFamily: "Poppins_500Medium", fontSize: 13, marginTop: 2 },
  targetLabel: { color: colors.textSoft, fontFamily: "Poppins_500Medium", fontSize: 12, textAlign: "right" },
  targetValue: { color: colors.lime, fontFamily: "Poppins_700Bold", fontSize: 28 },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10, marginBottom: 8 },
  balls: { flexDirection: "row", gap: 6 },
  ball: { width: 14, height: 14, borderRadius: 7, backgroundColor: "#fff" },
  ballUsed: { backgroundColor: "transparent", borderWidth: 2, borderColor: colors.textSoft, opacity: 0.5 },
  bestRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  bestLabel: { color: colors.textSoft, fontFamily: "Poppins_500Medium", fontSize: 13 },
  bestValue: { color: colors.gold, fontFamily: "Poppins_700Bold", fontSize: 17 },
  brief: { backgroundColor: colors.paperDeep, borderRadius: 16, padding: 12, marginTop: 12 },
  briefTitle: { color: colors.lime, fontFamily: "Poppins_700Bold", fontSize: 15 },
  briefBody: { color: "rgba(255,255,255,0.78)", fontFamily: "Poppins_500Medium", fontSize: 13, lineHeight: 18, marginTop: 4 },
  briefChips: { flexDirection: "row", gap: 8, marginTop: 8 },
  briefChip: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    color: colors.cyan,
    backgroundColor: "rgba(76,224,210,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  msg: { minHeight: 60, marginTop: 12 },
  resultPill: {
    alignSelf: "flex-start",
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: colors.ink,
    backgroundColor: colors.gold,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 6,
    overflow: "hidden",
  },
  msgText: { color: "rgba(255,255,255,0.85)", fontFamily: "Poppins_500Medium", fontSize: 15, lineHeight: 20 },
  actions: { flexDirection: "row", gap: 10, marginTop: 8 },
  btn: { flex: 1, backgroundColor: colors.lime, borderRadius: 999, paddingVertical: 15, alignItems: "center" },
  btnText: { fontFamily: "Poppins_700Bold", fontSize: 16, color: colors.ink },
});
