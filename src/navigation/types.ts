import type { Level } from "../engine/physics";

export type PlayParams =
  | { mode: "daily" }
  | { mode: "play"; levelNo: number }
  | { mode: "custom"; level: Level; editorState?: string };

export type RootStackParamList = {
  Home: undefined;
  Play: PlayParams;
  Create: { loadCode?: string } | undefined;
};
