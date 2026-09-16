import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";
import { dailyNumber, dayKey } from "../game/session";
import { getCampaignLevel, getDailyResult, getStreak } from "../db/db";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

export default function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [dailyN, setDailyN] = useState(0);
  const [streak, setStreak] = useState(0);
  const [dailyDone, setDailyDone] = useState(false);
  const [campaignLevel, setCampaignLevelState] = useState(1);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        const today = new Date();
        const n = dailyNumber(today);
        const [streakInfo, existing, level] = await Promise.all([getStreak(), getDailyResult(dayKey(today)), getCampaignLevel()]);
        if (cancelled) return;
        setDailyN(n);
        setStreak(streakInfo.current);
        setDailyDone(!!existing);
        setCampaignLevelState(level);
      }
      load();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 14 }]}>
      <View style={styles.hero}>
        <Text style={styles.wordmark}>
          Sink<Text style={{ color: colors.cyan }}>It</Text>
        </Text>
        <Text style={styles.tag}>Read the green. Drop the ball. Watch it break.</Text>
        {streak > 0 && <Text style={styles.streak}>🔥 {streak}-day streak</Text>}
      </View>

      <View style={styles.menu}>
        <Pressable style={styles.menuBtn} onPress={() => navigation.navigate("Play", { mode: "daily" })}>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuTitle}>Today's green</Text>
            <Text style={styles.menuSub}>{dailyDone ? "Played today — come back tomorrow" : "One green, three balls, everyone plays the same one"}</Text>
          </View>
          <Text style={styles.menuN}>#{dailyN}</Text>
        </Pressable>

        <Pressable style={[styles.menuBtn, styles.menuQuiet]} onPress={() => navigation.navigate("Play", { mode: "play", levelNo: campaignLevel })}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.menuTitle, styles.menuTitleQuiet]}>Play</Text>
            <Text style={[styles.menuSub, styles.menuSubQuiet]}>Endless greens, each a little harder</Text>
          </View>
          <Text style={[styles.menuN, styles.menuTitleQuiet]}>{campaignLevel > 1 ? `#${campaignLevel}` : ""}</Text>
        </Pressable>

        <Pressable style={[styles.menuBtn, styles.menuQuiet]} onPress={() => navigation.navigate("Create", undefined)}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.menuTitle, styles.menuTitleQuiet]}>Create a green</Text>
            <Text style={[styles.menuSub, styles.menuSubQuiet]}>Shape it, test it, send it to a friend</Text>
          </View>
          <Text style={[styles.menuN, styles.menuTitleQuiet]}>✎</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink, padding: 14 },
  hero: { marginTop: "16%", alignItems: "center" },
  wordmark: { fontFamily: "Poppins_800ExtraBold", fontSize: 46, color: colors.lime, letterSpacing: -1 },
  tag: { color: colors.textSoft, fontFamily: "Poppins_500Medium", fontSize: 15, marginTop: 8, textAlign: "center" },
  streak: { color: colors.gold, fontFamily: "Poppins_600SemiBold", fontSize: 14, marginTop: 14 },
  menu: { marginTop: 36, gap: 12 },
  menuBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderRadius: 24,
    backgroundColor: colors.lime,
  },
  menuQuiet: { backgroundColor: colors.paperDeep },
  menuTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: colors.ink },
  menuSub: { fontFamily: "Poppins_500Medium", fontSize: 13, color: "rgba(11,20,16,0.7)", marginTop: 3 },
  menuN: { fontFamily: "Poppins_800ExtraBold", fontSize: 20, color: colors.ink, opacity: 0.9, marginLeft: 8 },
  menuTitleQuiet: { color: "#fff" },
  menuSubQuiet: { color: colors.textSoft },
});
