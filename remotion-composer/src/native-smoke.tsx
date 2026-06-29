import React from "react";
import {
  AbsoluteFill,
  Composition,
  interpolate,
  registerRoot,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

type NativeSmokeProps = {
  title: string;
  caption: string;
  accent: string;
};

const NativeSmoke: React.FC<NativeSmokeProps> = ({
  title,
  caption,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 120, mass: 0.9 },
  });
  const captionIn = spring({
    frame: Math.max(0, frame - 24),
    fps,
    config: { damping: 20, stiffness: 90 },
  });
  const sweep = interpolate(frame, [0, 90], [-30, 110], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: "#0b1020",
        color: "white",
        fontFamily: "Arial, Helvetica, sans-serif",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(135deg, rgba(18,220,232,0.18), rgba(230,180,76,0.10) 45%, rgba(11,16,32,0) 70%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: `${sweep}%`,
          top: 0,
          width: "18%",
          height: "100%",
          background: `linear-gradient(90deg, transparent, ${accent}55, transparent)`,
          transform: "skewX(-14deg)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 64,
          right: 64,
          top: 86,
          transform: `translateY(${(1 - enter) * 28}px) scale(${0.92 + enter * 0.08})`,
          opacity: enter,
        }}
      >
        <div
          style={{
            height: 8,
            width: 180,
            background: accent,
            borderRadius: 999,
            marginBottom: 24,
          }}
        />
        <div
          style={{
            fontSize: 62,
            lineHeight: 1,
            fontWeight: 800,
            letterSpacing: 0,
          }}
        >
          {title}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 64,
          right: 64,
          bottom: 58,
          padding: "18px 22px",
          borderRadius: 8,
          background: "rgba(2, 6, 23, 0.72)",
          border: "1px solid rgba(255,255,255,0.18)",
          fontSize: 26,
          lineHeight: 1.25,
          opacity: captionIn,
          transform: `translateY(${(1 - captionIn) * 18}px)`,
        }}
      >
        {caption}
      </div>
    </AbsoluteFill>
  );
};

const NativeSmokeRoot: React.FC = () => (
  <Composition
    id="NativeSmoke"
    component={NativeSmoke}
    durationInFrames={90}
    fps={30}
    width={640}
    height={360}
    defaultProps={{
      title: "MONTARA",
      caption: "Native Remotion render: spring motion, caption layer, real MP4.",
      accent: "#12dce8",
    }}
  />
);

registerRoot(NativeSmokeRoot);
