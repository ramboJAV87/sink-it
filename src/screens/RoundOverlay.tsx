import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MedalBadge } from "../render/MedalBadge";
import { MEDALS, type Medal } from "../game/round";
import { colors } from "../theme/colors";

interface Action {
  label: string;
  onPress: () => void;
  quiet?: boolean;
}

interface Props {
  medal: Medal | null;
  /** true when the round failed — shows a muted placeholder instead of a badge */
  missed?: boolean;
  headline: string;
  detail: string;
  /** secondary line under the score — e.g. what the pass threshold meant in feet */
  note?: string;
  actions: Action[];
  onHome: () => void;
}

/**
 * Centred result card shown over the green the moment a round ends. Deliberately an overlay
 * and not part of the scrolling page — testers were finishing rounds without realising,
 * because the result and its buttons sat below the fold.
 */
export function RoundOverlay({ medal, missed, headline, detail, note, actions, onHome }: Props) {
  return (
    <View style={styles.scrim}>
      <View style={styles.card}>
        {medal ? (
          <MedalBadge medal={medal} size={148} />
        ) : missed ? (
          <View style={styles.missed}>
            <Text style={styles.missedMark}>—</Text>
          </View>
        ) : null}

        <Text style={styles.headline}>{headline}</Text>
        <Text style={styles.detail}>{detail}</Text>
        {medal && <Text style={styles.blurb}>{MEDALS[medal].blurb}</Text>}
        {note && <Text style={styles.blurb}>{note}</Text>}

        <View style={styles.actions}>
          {actions.map((a) => (
            <Pressable key={a.label} style={[styles.btn, a.quiet && styles.btnQuiet]} onPress={a.onPress}>
              <Text style={[styles.btnText, a.quiet && styles.btnTextQuiet]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* the overlay covers the header's back link, so it has to offer its own way out */}
        <Pressable onPress={onHome} hitSlop={12}>
          <Text style={styles.home}>← Home</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(6,12,9,0.82)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    backgroundColor: colors.paperDeep,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 20,
  },
  missed: {
    width: 148,
    height: 148,
    alignItems: "center",
    justifyContent: "center",
  },
  missedMark: {
    fontFamily: "Poppins_700Bold",
    fontSize: 56,
    color: "rgba(245,241,228,0.25)",
  },
  headline: {
    fontFamily: "Poppins_800ExtraBold",
    fontSize: 34,
    color: "#fff",
    letterSpacing: -1,
    marginTop: 2,
    textAlign: "center",
  },
  detail: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: colors.gold,
    marginTop: 6,
    textAlign: "center",
  },
  blurb: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: colors.textSoft,
    marginTop: 6,
    textAlign: "center",
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 20, alignSelf: "stretch" },
  btn: { flex: 1, backgroundColor: colors.lime, borderRadius: 999, paddingVertical: 15, alignItems: "center" },
  btnQuiet: { backgroundColor: "rgba(245,241,228,0.12)" },
  btnText: { fontFamily: "Poppins_700Bold", fontSize: 16, color: colors.ink },
  btnTextQuiet: { color: "#fff" },
  home: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: colors.textSoft, marginTop: 14 },
});
