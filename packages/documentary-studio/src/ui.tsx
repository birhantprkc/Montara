import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { colors, inter, mono, springConfig } from "./theme";

export const Rise: React.FC<{ at?: number; y?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  at = 0,
  y = 22,
  children,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ fps, frame: frame - at, config: springConfig });
  return (
    <div style={{ opacity: s, transform: `translateY(${interpolate(s, [0, 1], [y, 0])}px)`, ...style }}>
      {children}
    </div>
  );
};

export const SourceChip: React.FC<{ text: string; at?: number }> = ({ text, at = 0 }) => (
  <div style={{ position: "absolute", left: 54, bottom: 86 }}>
    <Rise at={at}>
      <span
        style={{
          fontFamily: mono,
          fontSize: 12.5,
          color: colors.dim,
          letterSpacing: 1,
          border: `1px solid ${colors.border}`,
          borderRadius: 4,
          padding: "4px 9px",
          background: "#0d0d0dcc",
        }}
      >
        SOURCE · {text}
      </span>
    </Rise>
  </div>
);

export const Lower3: React.FC<{
  kicker?: string;
  title: string;
  sub?: string;
  at?: number;
  align?: "left" | "center";
}> = ({ kicker, title, sub, at = 0, align = "left" }) => (
  <div
    style={{
      position: "absolute",
      left: align === "center" ? 0 : 90,
      right: align === "center" ? 0 : undefined,
      bottom: 140,
      textAlign: align,
      display: "flex",
      flexDirection: "column",
      alignItems: align === "center" ? "center" : "flex-start",
    }}
  >
    {kicker && (
      <Rise at={at}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ width: 26, height: 3, background: colors.accent }} />
          <span style={{ fontFamily: mono, fontSize: 15, letterSpacing: 3, color: colors.accent, fontWeight: 700 }}>
            {kicker}
          </span>
        </div>
      </Rise>
    )}
    <Rise at={at + 4}>
      <div
        style={{
          fontFamily: inter,
          fontWeight: 800,
          fontSize: 52,
          color: colors.text,
          lineHeight: 1.04,
          maxWidth: 1180,
          textShadow: "0 4px 30px rgba(0,0,0,0.6)",
        }}
      >
        {title}
      </div>
    </Rise>
    {sub && (
      <Rise at={at + 9}>
        <div
          style={{
            fontFamily: inter,
            fontWeight: 500,
            fontSize: 24,
            color: colors.muted,
            marginTop: 14,
            maxWidth: 1040,
            lineHeight: 1.3,
          }}
        >
          {sub}
        </div>
      </Rise>
    )}
  </div>
);

export const IntelBrief: React.FC<{ lines: string[]; kicker?: string }> = ({
  lines,
  kicker = "MONTARA · INTELLIGENCE BRIEF",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scan = interpolate(frame % 90, [0, 90], [0, 1]);
  return (
    <AbsoluteFill style={{ backgroundColor: "#08080a", justifyContent: "center", alignItems: "center" }}>
      <AbsoluteFill
        style={{
          background: `repeating-linear-gradient(0deg, ${colors.accent}07 0px, ${colors.accent}07 1px, transparent 2px, transparent 5px)`,
          opacity: 0.5,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: `${scan * 100}%`,
          left: 0,
          right: 0,
          height: 2,
          background: `${colors.accent}55`,
        }}
      />
      <div
        style={{
          width: 1180,
          border: `1px solid ${colors.accent}55`,
          borderRadius: 10,
          padding: "54px 64px",
          background: "linear-gradient(180deg,#0e0f12,#0a0a0c)",
          boxShadow: `0 0 80px ${colors.accent}18`,
        }}
      >
        <Rise at={0}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 30 }}>
            <div
              style={{
                width: 12,
                height: 12,
                background: colors.alert,
                borderRadius: "50%",
                boxShadow: `0 0 12px ${colors.alert}`,
                opacity: 0.5 + 0.5 * Math.sin((frame / fps) * 4),
              }}
            />
            <span style={{ fontFamily: mono, fontWeight: 700, letterSpacing: 4, fontSize: 18, color: colors.accent }}>
              {kicker}
            </span>
          </div>
        </Rise>
        {lines.map((l, i) => (
          <Rise key={i} at={10 + i * 12}>
            <div
              style={{
                fontFamily: inter,
                fontWeight: 800,
                fontSize: 40,
                color: colors.text,
                lineHeight: 1.28,
                marginBottom: 6,
              }}
            >
              {l}
            </div>
          </Rise>
        ))}
      </div>
    </AbsoluteFill>
  );
};

export const Stamp: React.FC<{ text: string; sub?: string; at?: number }> = ({ text, sub, at = 0 }) => (
  <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 160 }}>
    <Rise at={at}>
      <div
        style={{
          fontFamily: inter,
          fontWeight: 900,
          fontSize: 70,
          color: colors.text,
          textAlign: "center",
          lineHeight: 1.1,
          letterSpacing: -1,
          whiteSpace: "pre-line",
          textShadow: "0 6px 40px rgba(0,0,0,0.6)",
        }}
      >
        {text}
      </div>
    </Rise>
    {sub && (
      <Rise at={at + 8}>
        <div
          style={{
            fontFamily: mono,
            fontSize: 20,
            color: "#a5f3fc",
            marginTop: 22,
            letterSpacing: 2,
            background: "rgba(8,9,12,0.66)",
            border: `1px solid ${colors.accent}66`,
            borderRadius: 6,
            padding: "9px 18px",
            textShadow: "0 2px 8px #000",
          }}
        >
          {sub}
        </div>
      </Rise>
    )}
  </AbsoluteFill>
);