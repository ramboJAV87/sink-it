import React, { useEffect, useMemo, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RootStackParamList } from "../navigation/types";
import type { Level, SimResult } from "../engine/physics";
import { GreenCanvas } from "../render/GreenCanvas";
import type { BallOutcome } from "../render/GreenGame";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { colors } from "../theme/colors";
import { BALLS, starsFor, targets } from "../game/session";
import { campaignGreen, dailyGreen, prefetchCampaign } from "../game/greenCache";
import { getCampaignLevel, getDailyResult, recordGreenResult, saveDailyResult, setCampaignLevel } from "../db/db";

type Props = NativeStackScreenProps<RootStackParamList, "Play">;

interface Outcome {
  result: SimResult;
  points: number;
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
  const [showNext, setShowNext] = useState(false);
  const [showRetry, setShowRetry] = useState(false);
  const [showShare, setShowShare] = useState(false);

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
        setLevel(L);
        setBalls(BALLS);
      } else {
        if (cancelled) return;
        setLevel(route.params.level);
        setBalls(BALLS);
      }
      setBest(0);
      setOutcomes([]);
      setShowNext(false);
      setShowRetry(false);
      setShowShare(false);
      setResultLine(null);
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params]);

  const { t1, t2 } = useMemo(() => (level ? targets(level) : { t1: 55, t2: 73 }), [level]);

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
  }

  async function handleOutcome(o: BallOutcome, holed: boolean) {
    if (!level) return;
    const nextOutcomes = [...outcomes, { result: o.result, points: o.points }];
    setOutcomes(nextOutcomes);
    setBest(o.best);

    const dist = o.result.dist;
    const feet = dist < 1 ? `${Math.round(dist * 12)} in` : `${dist.toFixed(1)} ft`;
    const line = holed ? "In the cup · 100 pts" : `${feet} away · ${o.points} pts`;
    setResultLine(line);

    const n = starsFor(o.best, t1, t2);
    const starWord = ["no stars yet", "one star", "two stars", "three stars"][n];
    const nextGoal = n === 0 ? `${t1} for a star` : n === 1 ? `${t2} for two` : n === 2 ? "hole it for three" : "";
    const total = nextOutcomes.reduce((a, q) => a + q.points, 0);
    const done = mode === "daily" ? o.ballsLeft === 0 : o.ballsLeft === 0 || holed;

    if (mode === "daily" && dailyMeta) {
      if (done) {
        setMessage(`${total} out of 300 today. New green tomorrow.`);
        setShowShare(true);
        const drops = nextOutcomes.map((q) => [q.result.x, q.result.y] as [number, number]);
        const scores = nextOutcomes.map((q) => q.points);
        await saveDailyResult(dailyMeta.day, total, drops, scores);
      } else {
        setMessage(
          `${o.result.lipped ? "Too much pace. " : ""}${total} so far. ${o.ballsLeft} ball${o.ballsLeft > 1 ? "s" : ""} left — every ball counts today.`,
        );
      }
      return;
    }

    if (mode === "play") {
      await recordGreenResult(route.params.mode === "play" ? route.params.levelNo : 0, n, o.best);
    }

    if (n > 0) {
      setMessage(`Passed with ${starWord}.${o.ballsLeft > 0 && n < 3 ? ` Keep rolling — ${nextGoal}.` : ""}`);
      if (mode !== "custom") setShowNext(true);
      else setShowRetry(true);
      setShowShare(true);
      // The green is passed and they're reading the result — genuinely idle time, and the
      // most likely next tap is "Next green". Warm it now so that tap is instant.
      if (route.params.mode === "play") prefetchCampaign(route.params.levelNo + 1);
    } else if (o.ballsLeft > 0) {
      setMessage(
        o.result.lipped ? `Too much pace — it ran over the cup. ${o.ballsLeft} ball${o.ballsLeft > 1 ? "s" : ""} left, ${nextGoal}.` : `${o.ballsLeft} ball${o.ballsLeft > 1 ? "s" : ""} left — ${nextGoal}.`,
      );
    } else {
      setMessage(`Out of balls. You needed ${t1} to pass.`);
      setShowRetry(true);
    }
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
    setShowNext(false);
    setShowRetry(false);
    setShowShare(false);
    setResultLine(null);
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
        <Text style={styles.loadingText}>Reading the green…</Text>
      </View>
    );
  }

  const stars = starsFor(best, t1, t2);
  const title = mode === "daily" ? `Daily #${dailyMeta?.dailyN ?? ""}` : mode === "custom" ? "Your green" : `Green ${route.params.mode === "play" ? route.params.levelNo : ""}`;
  const sub = mode === "daily" ? new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }) : mode === "custom" ? "Custom green" : level.name;
  const locked = mode === "daily" && lockedTotal !== null;

  return (
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

      <View style={styles.statusRow}>
        <View style={styles.balls}>
          {Array.from({ length: BALLS }, (_, i) => (
            <View key={i} style={[styles.ball, i < BALLS - balls && styles.ballUsed]} />
          ))}
        </View>
        <View style={styles.bestRow}>
          <Text style={styles.bestLabel}>best</Text>
          <Text style={styles.bestValue}>{best}</Text>
          <Text style={styles.starsText}>
            {"★".repeat(stars)}
            <Text style={{ color: "rgba(245,241,228,0.18)" }}>{"★".repeat(3 - stars)}</Text>
          </Text>
        </View>
      </View>

      <View style={styles.goals}>
        {mode === "daily" ? (
          <View style={styles.goalPill}>
            <Text style={styles.goalKey}>TODAY</Text>
            <Text style={styles.goalVal}>All 3 balls count · max 300</Text>
          </View>
        ) : (
          [
            ["★", `${t1} pts`, stars >= 1],
            ["★★", `${t2} pts`, stars >= 2],
            ["★★★", "Hole it", stars >= 3],
          ].map(([k, v, hit], i) => (
            <View key={i} style={[styles.goalPill, hit && styles.goalHit]}>
              <Text style={styles.goalKey}>{k as string}</Text>
              <Text style={styles.goalVal}>{v as string}</Text>
            </View>
          ))
        )}
      </View>

      {!locked ? (
        <GreenCanvas
          level={level}
          mode={mode}
          ballsCount={balls}
          reduceMotion={reduceMotion}
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

      <View style={styles.actions}>
        {showNext && (
          <Pressable style={styles.btn} onPress={onNext}>
            <Text style={styles.btnText}>Next green</Text>
          </Pressable>
        )}
        {showRetry && (
          <Pressable style={[styles.btn, styles.btnQuiet]} onPress={onRetry}>
            <Text style={[styles.btnText, styles.btnTextQuiet]}>Try again</Text>
          </Pressable>
        )}
        {showShare && (
          <Pressable style={styles.btn} onPress={onShare}>
            <Text style={styles.btnText}>Share result</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.foot}>
        <Text style={styles.footChip}>Closer = more pts</Text>
        <Text style={[styles.footChip, { color: colors.pink }]}>Stimp {level.stimp}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  content: { padding: 14, paddingBottom: 24 },
  loading: { flex: 1, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  loadingText: { color: colors.lime, fontFamily: "Poppins_700Bold", fontSize: 18 },
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
  starsText: { color: colors.gold, fontSize: 16, letterSpacing: 1 },
  goals: { flexDirection: "row", gap: 6, marginBottom: 10 },
  goalPill: { flex: 1, alignItems: "center", paddingVertical: 7, paddingHorizontal: 4, borderRadius: 12, backgroundColor: colors.paperDeep },
  goalHit: { backgroundColor: "rgba(255,209,102,0.18)" },
  goalKey: { color: colors.gold, fontFamily: "Poppins_700Bold", fontSize: 11, letterSpacing: 1 },
  goalVal: { color: "rgba(255,255,255,0.85)", fontFamily: "Poppins_600SemiBold", fontSize: 12, marginTop: 2 },
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
  btnQuiet: { backgroundColor: colors.paperDeep },
  btnText: { fontFamily: "Poppins_700Bold", fontSize: 16, color: colors.ink },
  btnTextQuiet: { color: "#fff" },
  foot: { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  footChip: { fontFamily: "Poppins_700Bold", fontSize: 12, color: colors.cyan, backgroundColor: colors.paperDeep, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
});
