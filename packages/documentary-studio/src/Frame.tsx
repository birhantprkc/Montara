import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { colors, inter, mono } from "./theme";

const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.05 }) => {
  const frame = useCurrentFrame();
  const shift = (frame % 6) * 13;
  return (
    <AbsoluteFill
      style={{
        opacity,
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        backgroundPosition: `${shift}px ${-shift}px`,
        mixBlendMode: "overlay",
        pointerEvents: "none",
      }}
    />
  );
};

export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.7 }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse 75% 70% at 50% 48%, transparent 45%, rgba(0,0,0,${strength}) 100%)`,
      pointerEvents: "none",
    }}
  />
);

/** Persistent branded HUD overlay — Montara documentary studio frame. */
export const StudioFrame: React.FC<{ section?: string; chapter?: string; brand?: string }> = ({
  section,
  chapter,
  brand = "MONTARA",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin((frame / fps) * 3.4));

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, ${colors.accent}, transparent 60%)`,
          opacity: 0.5,
        }}
      />
      <div style={{ position: "absolute", top: 38, left: 54, display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 16,
            height: 16,
            background: colors.accent,
            borderRadius: 3,
            boxShadow: `0 0 14px ${colors.accent}`,
          }}
        />
        <span style={{ fontFamily: inter, fontWeight: 800, letterSpacing: 4, fontSize: 22, color: colors.text }}>
          {brand}
        </span>
      </div>
      <div style={{ position: "absolute", top: 40, right: 54, display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: colors.alert,
            opacity: pulse,
            boxShadow: `0 0 10px ${colors.alert}`,
          }}
        />
        <span style={{ fontFamily: mono, fontWeight: 500, letterSpacing: 2, fontSize: 12.5, color: colors.muted }}>
          DOCUMENTARY STUDIO
        </span>
      </div>
      {(section || chapter) && (
        <div style={{ position: "absolute", bottom: 40, left: 54, display: "flex", alignItems: "center", gap: 12 }}>
          {section && (
            <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 13, color: colors.accent, letterSpacing: 2 }}>
              {section}
            </span>
          )}
          {chapter && (
            <span
              style={{
                fontFamily: inter,
                fontWeight: 600,
                fontSize: 13,
                color: colors.muted,
                letterSpacing: 3,
                textTransform: "uppercase",
              }}
            >
              {chapter}
            </span>
          )}
        </div>
      )}
      <div
        style={{
          position: "absolute",
          bottom: 40,
          right: 54,
          fontFamily: mono,
          fontSize: 12.5,
          color: colors.dim,
          letterSpacing: 2,
        }}
      >
        montara.studio
      </div>
      <Vignette strength={0.6} />
      <Grain opacity={0.045} />
    </AbsoluteFill>
  );
};