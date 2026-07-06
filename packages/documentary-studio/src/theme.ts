import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadJetBrainsMono } from "@remotion/google-fonts/JetBrainsMono";

export const { fontFamily: inter } = loadInter("normal", {
  weights: ["400", "500", "600", "700", "800", "900"],
  subsets: ["latin"],
});

export const { fontFamily: mono } = loadJetBrainsMono("normal", {
  weights: ["400", "500", "700"],
  subsets: ["latin"],
});

/** Montara documentary palette — forked from Warfront engine, rebranded for open studio use. */
export const colors = {
  bg: "#070a0f",
  surface: "#111827",
  surface2: "#1a2332",
  border: "#2c333d",
  text: "#f8fafc",
  muted: "#94a3b8",
  dim: "#64748b",
  accent: "#12dce8",
  alert: "#f59e0b",
} as const;

export const springConfig = { damping: 14, mass: 0.7, stiffness: 110 } as const;