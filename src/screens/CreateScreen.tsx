import React, { useMemo, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Slider from "@react-native-community/slider";
import * as Clipboard from "expo-clipboard";
import type { RootStackParamList } from "../navigation/types";
import { colors } from "../theme/colors";
import { GreenCanvas } from "../render/GreenCanvas";
import { P } from "../game/session";
import { assemble, decodeCode, edCode, editTap, newEditorState, runCheck, type EditorState, type EditTool } from "../game/editor";
import { inside } from "../engine/physics";
import { saveCustomGreen } from "../db/db";
import { useReduceMotion } from "../hooks/useReduceMotion";

type Props = NativeStackScreenProps<RootStackParamList, "Create">;

const TOOLS: { key: EditTool; label: string }[] = [
  { key: "mound", label: "Mound" },
  { key: "dip", label: "Dip" },
  { key: "cup", label: "Cup" },
  { key: "zone", label: "Zone" },
];

export default function CreateScreen({ route, navigation }: Props) {
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  const [ed, setEd] = useState<EditorState>(() => (route.params?.loadCode ? decodeCode(route.params.loadCode) : newEditorState()));
  const [tool, setTool] = useState<EditTool>("mound");
  const [verdict, setVerdict] = useState("—");
  const [cmsg, setCmsg] = useState("Mounds push the ball away, dips pull it in. Place a few, move the cup and the drop zone, then check it.");
  const [history, setHistory] = useState<EditorState[]>([]);
  const [showLoad, setShowLoad] = useState(false);
  const [loadText, setLoadText] = useState("");

  const level = useMemo(() => assemble(ed), [ed]);

  function snap() {
    setHistory((h) => [...h.slice(-29), ed]);
  }

  function onUndo() {
    if (!history.length) {
      setCmsg("Nothing to undo.");
      return;
    }
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setEd(prev);
    setVerdict("—");
    setCmsg("Undone.");
  }

  function toolSub(t: EditTool): string {
    return {
      mound: "Tap to add a mound (pushes the ball away). Tap one to remove it.",
      dip: "Tap to add a dip (pulls the ball in). Tap one to remove it.",
      cup: "Tap where the cup goes",
      zone: "Tap where the drop zone goes",
    }[t];
  }

  function onEditTap(x: number, y: number) {
    const result = editTap(ed, level, inside, tool, x, y);
    if (result.changed) {
      snap();
      setEd(result.ed);
      setVerdict("—");
    }
    setCmsg(result.message);
  }

  function onCheck(): boolean {
    const res = runCheck(ed, level, P);
    setVerdict(res.verdict);
    setCmsg(res.message);
    return res.playable;
  }

  function onReshape() {
    snap();
    setEd({ ...ed, seed: Math.floor(Math.random() * 1e9) });
    setVerdict("—");
  }

  function onPlayIt() {
    if (!onCheck()) {
      setCmsg((m) => m + " Fix that before playing.");
      return;
    }
    navigation.navigate("Play", { mode: "custom", level: assemble(ed) });
  }

  async function onCopyCode() {
    if (!onCheck()) {
      setCmsg((m) => m + " Fix that before sharing.");
      return;
    }
    const code = edCode(ed);
    await saveCustomGreen(code, "Your green", JSON.stringify(ed));
    await Clipboard.setStringAsync(code);
    try {
      await Share.share({ message: `Beat my green in Sink It: ${code}` });
    } catch {
      // ignored — code is already on the clipboard
    }
  }

  function onLoadCode() {
    if (!loadText.trim()) return;
    try {
      const loaded = decodeCode(loadText);
      setEd(loaded);
      setHistory([]);
      setVerdict("—");
      setCmsg("Loaded.");
      setShowLoad(false);
      setLoadText("");
    } catch {
      setCmsg("That code did not work.");
    }
  }

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
          <Text style={styles.title}>Your green</Text>
          <Text style={styles.sub}>{toolSub(tool)}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.targetLabel}>verdict</Text>
          <Text style={styles.verdict}>{verdict}</Text>
        </View>
      </View>

      <View style={styles.tools}>
        {TOOLS.map((t) => (
          <Pressable key={t.key} style={[styles.toolBtn, tool === t.key && styles.toolBtnOn]} onPress={() => setTool(t.key)}>
            <Text style={[styles.toolText, tool === t.key && styles.toolTextOn]}>{t.label}</Text>
          </Pressable>
        ))}
        <Pressable style={styles.toolBtn} onPress={onUndo}>
          <Text style={styles.toolText}>Undo</Text>
        </Pressable>
      </View>

      <View style={styles.sliders}>
        <View style={styles.sliderRow}>
          <Text style={styles.sliderLabel}>Tier drop</Text>
          <Slider
            style={{ flex: 1 }}
            minimumValue={1.2}
            maximumValue={2.8}
            step={0.1}
            value={ed.drop}
            minimumTrackTintColor={colors.lime}
            onSlidingStart={snap}
            onValueChange={(v) => setEd((e) => ({ ...e, drop: v }))}
          />
          <Text style={styles.sliderValue}>{ed.drop.toFixed(1)} ft</Text>
        </View>
        <View style={styles.sliderRow}>
          <Text style={styles.sliderLabel}>Speed</Text>
          <Slider
            style={{ flex: 1 }}
            minimumValue={9}
            maximumValue={14}
            step={0.5}
            value={ed.stimp}
            minimumTrackTintColor={colors.lime}
            onSlidingStart={snap}
            onValueChange={(v) => setEd((e) => ({ ...e, stimp: v }))}
          />
          <Text style={styles.sliderValue}>{ed.stimp}</Text>
        </View>
      </View>

      <GreenCanvas
        level={level}
        mode="custom"
        ballsCount={0}
        reduceMotion={reduceMotion}
        onEditTap={onEditTap}
        editMarkers={ed.f}
      />

      <Text style={styles.msg}>{cmsg}</Text>

      <View style={styles.actions}>
        <Pressable style={[styles.btn, styles.btnQuiet]} onPress={onCheck}>
          <Text style={[styles.btnText, styles.btnTextQuiet]}>Check it</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={onPlayIt}>
          <Text style={styles.btnText}>Play it</Text>
        </Pressable>
      </View>
      <View style={styles.actions}>
        <Pressable style={[styles.btn, styles.btnQuiet]} onPress={onReshape}>
          <Text style={[styles.btnText, styles.btnTextQuiet]}>New shape</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnQuiet]} onPress={onCopyCode}>
          <Text style={[styles.btnText, styles.btnTextQuiet]}>Copy code</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnQuiet]} onPress={() => setShowLoad((v) => !v)}>
          <Text style={[styles.btnText, styles.btnTextQuiet]}>Load code</Text>
        </Pressable>
      </View>

      {showLoad && (
        <View style={styles.loadRow}>
          <TextInput
            style={styles.loadInput}
            placeholder="Paste a green code"
            placeholderTextColor={colors.textSofter}
            value={loadText}
            onChangeText={setLoadText}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable style={[styles.btn, { flex: 0, paddingHorizontal: 20 }]} onPress={onLoadCode}>
            <Text style={styles.btnText}>Load</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  content: { padding: 14, paddingBottom: 24 },
  back: { color: colors.textSoft, fontFamily: "Poppins_600SemiBold", fontSize: 14, paddingVertical: 6 },
  header: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginTop: 4 },
  title: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 22 },
  sub: { color: colors.textSoft, fontFamily: "Poppins_500Medium", fontSize: 13, marginTop: 2, maxWidth: 220 },
  targetLabel: { color: colors.textSoft, fontFamily: "Poppins_500Medium", fontSize: 12 },
  verdict: { color: colors.lime, fontFamily: "Poppins_700Bold", fontSize: 20 },
  tools: { flexDirection: "row", gap: 6, marginVertical: 10 },
  toolBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.paperDeep, alignItems: "center" },
  toolBtnOn: { backgroundColor: colors.lime },
  toolText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  toolTextOn: { color: colors.ink },
  sliders: { gap: 8, marginBottom: 10 },
  sliderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sliderLabel: { color: colors.textSoft, fontFamily: "Poppins_600SemiBold", fontSize: 13, width: 70 },
  sliderValue: { color: colors.gold, fontFamily: "Poppins_700Bold", fontSize: 13, minWidth: 44, textAlign: "right" },
  msg: { color: "rgba(255,255,255,0.85)", fontFamily: "Poppins_500Medium", fontSize: 14, lineHeight: 20, marginTop: 12, minHeight: 40 },
  actions: { flexDirection: "row", gap: 10, marginTop: 8 },
  btn: { flex: 1, backgroundColor: colors.lime, borderRadius: 999, paddingVertical: 14, alignItems: "center" },
  btnQuiet: { backgroundColor: colors.paperDeep },
  btnText: { fontFamily: "Poppins_700Bold", fontSize: 15, color: colors.ink },
  btnTextQuiet: { color: "#fff" },
  loadRow: { flexDirection: "row", gap: 8, marginTop: 10, alignItems: "center" },
  loadInput: {
    flex: 1,
    backgroundColor: colors.paperDeep,
    color: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Poppins_500Medium",
  },
});
