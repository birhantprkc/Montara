import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

type EngineVisual =
  | "ffmpeg"
  | "remotion"
  | "hyperframes"
  | "blender"
  | "three"
  | "manim"
  | "revideo"
  | "motion-canvas"
  | "playwright";

type EngineChapter = {
  name: string;
  tag: string;
  role: string;
  status: string;
  proof: string;
  accent: string;
  visual: EngineVisual;
  bullets: string[];
};

const FPS = 30;
const INTRO_FRAMES = FPS * 4;
const CHAPTER_FRAMES = FPS * 6;
const OUTRO_FRAMES = FPS * 5;

const engines: EngineChapter[] = [
  {
    name: "FFmpeg",
    tag: "working local floor",
    role: "assembly, encode, probe, audio, thumbnails, shorts",
    status: "Native MP4 path is shipped",
    proof: "verify + validate render real files through this floor",
    accent: "#2dd4bf",
    visual: "ffmpeg",
    bullets: ["Timeline IR", "H.264/AAC", "ffprobe QA"],
  },
  {
    name: "Remotion",
    tag: "native composer",
    role: "React motion graphics, explainers, documentary UI",
    status: "Native smoke is validate-gated",
    proof: "REMOTION_ENABLED=1 opts make/render into native when installed",
    accent: "#60a5fa",
    visual: "remotion",
    bullets: ["React scenes", "spring timing", "typed props"],
  },
  {
    name: "HyperFrames",
    tag: "HTML/CSS/GSAP rig path",
    role: "kinetic typography and character SVG rigs",
    status: "Validate-gated when npx hyperframes resolves",
    proof: "strict kinetic smoke plus character final MP4 when present",
    accent: "#f97316",
    visual: "hyperframes",
    bullets: ["DOM layers", "GSAP motion", "SVG rig"],
  },
  {
    name: "Blender",
    tag: "external 3D runtime",
    role: "headless 3D render adapter",
    status: "Adapter shipped, native render when installed",
    proof: "blender/montara_intro.py plus availability gates",
    accent: "#fb7185",
    visual: "blender",
    bullets: ["scene script", "headless CLI", "GPL hygiene"],
  },
  {
    name: "Three.js",
    tag: "WebGL 3D proof",
    role: "headless browser 3D scenes and titles",
    status: "Native/fallback adapter is validate-gated",
    proof: "render-three returns three-webgl or honest ffmpeg fallback",
    accent: "#a78bfa",
    visual: "three",
    bullets: ["WebGL orbit", "browser probe", "fallback MP4"],
  },
  {
    name: "Manim",
    tag: "math animation slot",
    role: "educational diagrams and equation scenes",
    status: "Adapter shipped, binary optional",
    proof: "MANIM_BIN controls native proof path",
    accent: "#facc15",
    visual: "manim",
    bullets: ["axes", "graphs", "diagram slots"],
  },
  {
    name: "Revideo",
    tag: "MIT composition fallback",
    role: "license-safe explainer and caption target",
    status: "Selector/probe shipped",
    proof: "installed-runtime MP4 proof pending",
    accent: "#34d399",
    visual: "revideo",
    bullets: ["MIT route", "scene graph", "caption lanes"],
  },
  {
    name: "Motion Canvas",
    tag: "kinetic typography target",
    role: "vector motion and canvas-style text animation",
    status: "Adapter/probe shipped",
    proof: "installed-runtime MP4 proof pending",
    accent: "#f472b6",
    visual: "motion-canvas",
    bullets: ["vector paths", "timeline code", "text motion"],
  },
  {
    name: "Playwright",
    tag: "browser capture surface",
    role: "web capture, login storageState, product demos",
    status: "CLI and tests shipped; live browser runtime-gated",
    proof: "capture setup/recommend/pick-latest covered by gates",
    accent: "#22c55e",
    visual: "playwright",
    bullets: ["record tab", "auth state", "MP4 pickup"],
  },
];

export const ENGINE_MATRIX_FRAMES =
  INTRO_FRAMES + engines.length * CHAPTER_FRAMES + OUTRO_FRAMES;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const fade = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

const font = "Inter, Segoe UI, Arial, sans-serif";
const mono = "JetBrains Mono, Consolas, monospace";

const Shell: React.FC<{ children: React.ReactNode; accent?: string }> = ({
  children,
  accent = "#2dd4bf",
}) => {
  const frame = useCurrentFrame();
  const scan = (frame % 150) / 150;
  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(135deg, #07080b 0%, #101014 42%, #07080b 100%)",
        color: "#f8fafc",
        fontFamily: font,
        overflow: "hidden",
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          opacity: 0.42,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 65% 55% at 58% 45%, rgba(255,255,255,0.07), transparent 62%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: `${scan * 100}%`,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${accent}88, transparent)`,
          opacity: 0.55,
        }}
      />
      {children}
    </AbsoluteFill>
  );
};

const Hud: React.FC<{ accent: string }> = ({ accent }) => {
  const frame = useCurrentFrame();
  const pulse = 0.55 + 0.45 * Math.sin(frame / 18);
  return (
    <>
      <div
        style={{
          position: "absolute",
          top: 36,
          left: 54,
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            background: accent,
            boxShadow: `0 0 18px ${accent}`,
          }}
        />
        <div style={{ fontWeight: 900, fontSize: 24, letterSpacing: 5 }}>
          MONTARA
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          top: 42,
          right: 54,
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontFamily: mono,
          fontSize: 13,
          color: "#a7b0bd",
          letterSpacing: 2,
          textTransform: "uppercase",
        }}
      >
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: accent,
            opacity: pulse,
            boxShadow: `0 0 10px ${accent}`,
          }}
        />
        one timeline / all render paths
      </div>
    </>
  );
};

const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({
    frame,
    fps,
    durationInFrames: 42,
    config: { damping: 22, stiffness: 110 },
  });
  return (
    <Shell accent="#2dd4bf">
      <Hud accent="#2dd4bf" />
      <div
        style={{
          position: "absolute",
          left: 120,
          right: 120,
          top: 210,
          display: "grid",
          gridTemplateColumns: "1.05fr 0.95fr",
          gap: 72,
          alignItems: "center",
        }}
      >
        <div
          style={{
            transform: `translateY(${interpolate(rise, [0, 1], [38, 0])}px)`,
            opacity: rise,
          }}
        >
          <div
            style={{
              fontFamily: mono,
              fontSize: 18,
              letterSpacing: 4,
              color: "#2dd4bf",
              marginBottom: 24,
              textTransform: "uppercase",
            }}
          >
            public engine demo
          </div>
          <div
            style={{
              fontSize: 88,
              lineHeight: 0.96,
              fontWeight: 950,
              letterSpacing: -1,
              maxWidth: 880,
            }}
          >
            Every shipped render surface, shown honestly.
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 27,
              lineHeight: 1.42,
              color: "#cbd5e1",
              maxWidth: 820,
            }}
          >
            Montara keeps one Timeline IR, then routes to FFmpeg, native
            composers, browser capture, and runtime-gated adapters without
            hiding fallbacks.
          </div>
        </div>
        <EngineNetwork frame={frame} />
      </div>
      <TimelineRail activeIndex={-1} />
    </Shell>
  );
};

const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const local = frame - INTRO_FRAMES - engines.length * CHAPTER_FRAMES;
  const enter = fade(local, 0, 36);
  return (
    <Shell accent="#facc15">
      <Hud accent="#facc15" />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          opacity: enter,
          transform: `translateY(${interpolate(enter, [0, 1], [30, 0])}px)`,
        }}
      >
        <div
          style={{
            fontFamily: mono,
            color: "#facc15",
            letterSpacing: 5,
            fontSize: 18,
            textTransform: "uppercase",
            marginBottom: 28,
          }}
        >
          local first / provider ready / runtime honest
        </div>
        <div style={{ fontSize: 86, fontWeight: 950, lineHeight: 1.02 }}>
          One IR. Many engines. Real MP4s.
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 26,
            color: "#cbd5e1",
            maxWidth: 980,
            lineHeight: 1.42,
          }}
        >
          The same project can become a short, explainer, documentary segment,
          browser demo, math scene, or 3D shot as runtimes are installed.
        </div>
      </div>
      <TimelineRail activeIndex={engines.length} />
    </Shell>
  );
};

export const EngineMatrix: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < INTRO_FRAMES) return <Intro />;
  if (frame >= INTRO_FRAMES + engines.length * CHAPTER_FRAMES) return <Outro />;

  const chapterCursor = frame - INTRO_FRAMES;
  const activeIndex = clamp(
    Math.floor(chapterCursor / CHAPTER_FRAMES),
    0,
    engines.length - 1
  );
  const localFrame = chapterCursor - activeIndex * CHAPTER_FRAMES;
  const engine = engines[activeIndex];

  return (
    <Shell accent={engine.accent}>
      <Hud accent={engine.accent} />
      <EngineChapterView engine={engine} localFrame={localFrame} index={activeIndex} />
      <TimelineRail activeIndex={activeIndex} />
    </Shell>
  );
};

const EngineChapterView: React.FC<{
  engine: EngineChapter;
  localFrame: number;
  index: number;
}> = ({ engine, localFrame, index }) => {
  const { fps } = useVideoConfig();
  const intro = spring({
    frame: localFrame,
    fps,
    durationInFrames: 32,
    config: { damping: 18, stiffness: 95 },
  });
  const body = fade(localFrame, 12, 42);

  return (
    <>
      <div
        style={{
          position: "absolute",
          top: 126,
          left: 78,
          right: 78,
          bottom: 126,
          display: "grid",
          gridTemplateColumns: "0.9fr 1.18fr",
          gap: 54,
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.14)",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.032))",
            borderRadius: 16,
            padding: 46,
            boxShadow: "0 30px 90px rgba(0,0,0,0.34)",
            transform: `translateX(${interpolate(intro, [0, 1], [-38, 0])}px)`,
            opacity: intro,
          }}
        >
          <div
            style={{
              fontFamily: mono,
              color: engine.accent,
              letterSpacing: 3,
              fontSize: 14,
              textTransform: "uppercase",
              marginBottom: 20,
            }}
          >
            {String(index + 1).padStart(2, "0")} / 09 / {engine.tag}
          </div>
          <div
            style={{
              fontSize: 78,
              lineHeight: 0.95,
              fontWeight: 950,
              letterSpacing: -0.4,
            }}
          >
            {engine.name}
          </div>
          <div
            style={{
              marginTop: 22,
              fontSize: 28,
              lineHeight: 1.28,
              color: "#dbe5f0",
              fontWeight: 650,
            }}
          >
            {engine.role}
          </div>
          <div
            style={{
              marginTop: 32,
              display: "flex",
              flexDirection: "column",
              gap: 14,
              opacity: body,
            }}
          >
            <FactRow label="Status" value={engine.status} accent={engine.accent} />
            <FactRow label="Proof" value={engine.proof} accent={engine.accent} />
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              marginTop: 34,
              opacity: body,
            }}
          >
            {engine.bullets.map((item) => (
              <span
                key={item}
                style={{
                  fontFamily: mono,
                  fontSize: 14,
                  color: "#e2e8f0",
                  border: `1px solid ${engine.accent}66`,
                  background: `${engine.accent}18`,
                  borderRadius: 5,
                  padding: "9px 12px",
                  textTransform: "uppercase",
                  letterSpacing: 1.2,
                }}
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <div
          style={{
            border: `1px solid ${engine.accent}55`,
            borderRadius: 18,
            background:
              "linear-gradient(180deg, rgba(8,10,14,0.92), rgba(12,14,18,0.82))",
            boxShadow: `0 0 90px ${engine.accent}18, 0 30px 90px rgba(0,0,0,0.45)`,
            overflow: "hidden",
            position: "relative",
            transform: `translateX(${interpolate(intro, [0, 1], [46, 0])}px)`,
            opacity: intro,
          }}
        >
          <VisualHeader engine={engine} />
          <EngineVisualFrame engine={engine} frame={localFrame} />
        </div>
      </div>
    </>
  );
};

const FactRow: React.FC<{ label: string; value: string; accent: string }> = ({
  label,
  value,
  accent,
}) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "118px 1fr",
      gap: 16,
      alignItems: "start",
    }}
  >
    <div
      style={{
        fontFamily: mono,
        color: accent,
        fontSize: 13,
        letterSpacing: 2,
        textTransform: "uppercase",
        paddingTop: 4,
      }}
    >
      {label}
    </div>
    <div style={{ color: "#cbd5e1", fontSize: 21, lineHeight: 1.34 }}>{value}</div>
  </div>
);

const VisualHeader: React.FC<{ engine: EngineChapter }> = ({ engine }) => (
  <div
    style={{
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 62,
      borderBottom: "1px solid rgba(255,255,255,0.09)",
      display: "flex",
      alignItems: "center",
      padding: "0 24px",
      gap: 10,
      zIndex: 5,
      background: "rgba(8,10,14,0.78)",
    }}
  >
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        style={{
          width: 11,
          height: 11,
          borderRadius: "50%",
          background: i === 0 ? "#ef4444" : i === 1 ? "#f59e0b" : "#22c55e",
          opacity: 0.88,
        }}
      />
    ))}
    <div
      style={{
        marginLeft: 14,
        fontFamily: mono,
        color: "#94a3b8",
        fontSize: 13,
        letterSpacing: 2,
        textTransform: "uppercase",
      }}
    >
      render surface / {engine.name}
    </div>
  </div>
);

const TimelineRail: React.FC<{ activeIndex: number }> = ({ activeIndex }) => (
  <div
    style={{
      position: "absolute",
      left: 78,
      right: 78,
      bottom: 48,
      display: "grid",
      gridTemplateColumns: `repeat(${engines.length}, 1fr)`,
      gap: 8,
    }}
  >
    {engines.map((engine, i) => {
      const active = i === activeIndex;
      const passed = i < activeIndex;
      return (
        <div
          key={engine.name}
          style={{
            height: 10,
            borderRadius: 99,
            background: active || passed ? engine.accent : "rgba(255,255,255,0.14)",
            opacity: active ? 1 : passed ? 0.58 : 0.32,
            boxShadow: active ? `0 0 22px ${engine.accent}` : undefined,
          }}
        />
      );
    })}
  </div>
);

const EngineNetwork: React.FC<{ frame: number }> = ({ frame }) => {
  const nodes = engines.map((engine, i) => {
    const angle = (Math.PI * 2 * i) / engines.length + frame / 170;
    const x = 430 + Math.cos(angle) * 250;
    const y = 330 + Math.sin(angle) * 215;
    return { ...engine, x, y };
  });

  return (
    <div
      style={{
        width: 860,
        height: 660,
        position: "relative",
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: 24,
        background: "rgba(255,255,255,0.04)",
        overflow: "hidden",
      }}
    >
      <svg width={860} height={660} viewBox="0 0 860 660">
        {nodes.map((node) => (
          <line
            key={`line-${node.name}`}
            x1={430}
            y1={330}
            x2={node.x}
            y2={node.y}
            stroke={node.accent}
            strokeWidth={2}
            opacity={0.24}
          />
        ))}
        <circle cx={430} cy={330} r={82} fill="#0b1118" stroke="#2dd4bf" strokeWidth={2} />
        <text
          x={430}
          y={318}
          textAnchor="middle"
          fontFamily={font}
          fontSize={28}
          fontWeight={900}
          fill="#f8fafc"
        >
          Timeline
        </text>
        <text x={430} y={350} textAnchor="middle" fontFamily={mono} fontSize={16} fill="#2dd4bf">
          IR
        </text>
        {nodes.map((node) => (
          <g key={node.name}>
            <circle cx={node.x} cy={node.y} r={46} fill="#0b1118" stroke={node.accent} strokeWidth={3} />
            <text
              x={node.x}
              y={node.y + 5}
              textAnchor="middle"
              fontFamily={mono}
              fontSize={13}
              fontWeight={700}
              fill="#f8fafc"
            >
              {node.name.replace("Motion Canvas", "Motion")}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};

const EngineVisualFrame: React.FC<{ engine: EngineChapter; frame: number }> = ({
  engine,
  frame,
}) => {
  const common = { frame, accent: engine.accent };
  switch (engine.visual) {
    case "ffmpeg":
      return <FfmpegVisual {...common} />;
    case "remotion":
      return <RemotionVisual {...common} />;
    case "hyperframes":
      return <HyperFramesVisual {...common} />;
    case "blender":
      return <BlenderVisual {...common} />;
    case "three":
      return <ThreeVisual {...common} />;
    case "manim":
      return <ManimVisual {...common} />;
    case "revideo":
      return <RevideoVisual {...common} />;
    case "motion-canvas":
      return <MotionCanvasVisual {...common} />;
    case "playwright":
      return <PlaywrightVisual {...common} />;
    default:
      return null;
  }
};

type VisualProps = { frame: number; accent: string };

const FfmpegVisual: React.FC<VisualProps> = ({ frame, accent }) => {
  const p = fade(frame, 0, 130);
  const cursor = interpolate(frame % 150, [0, 149], [80, 820]);
  return (
    <AbsoluteFill style={{ paddingTop: 84 }}>
      <div style={{ position: "absolute", left: 72, top: 120, right: 72 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 18 }}>
          {Array.from({ length: 10 }, (_, i) => (
            <div
              key={i}
              style={{
                height: 118,
                borderRadius: 10,
                border: `1px solid ${accent}55`,
                background: `linear-gradient(135deg, ${accent}${i % 2 ? "26" : "14"}, rgba(255,255,255,0.03))`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#e2e8f0",
                fontFamily: mono,
                fontSize: 18,
                transform: `translateY(${Math.sin((frame + i * 7) / 13) * 5}px)`,
              }}
            >
              F{i + 1}
            </div>
          ))}
        </div>
      </div>
      <svg width="100%" height="100%" viewBox="0 0 960 650" style={{ position: "absolute", inset: 0 }}>
        <line x1={80} x2={880} y1={515} y2={515} stroke={accent} strokeWidth={3} opacity={0.8} />
        <line x1={cursor} x2={cursor} y1={180} y2={560} stroke="#fff" strokeWidth={2} opacity={0.65} />
        {Array.from({ length: 44 }, (_, i) => {
          const h = 18 + Math.abs(Math.sin((frame + i * 4) / 11)) * 80;
          const x = 92 + i * 18;
          return <rect key={i} x={x} y={515 - h / 2} width={8} height={h} rx={4} fill={accent} opacity={0.7 + 0.3 * p} />;
        })}
      </svg>
      <TerminalLines
        accent={accent}
        lines={["montara render timeline.json", "ffmpeg encode h264/aac", "ffprobe duration + streams", "poster + shorts outputs"]}
      />
    </AbsoluteFill>
  );
};

const RemotionVisual: React.FC<VisualProps> = ({ frame, accent }) => {
  const nodes = [
    ["Root", 420, 124],
    ["Composition", 252, 256],
    ["Sequence", 588, 256],
    ["Motion", 202, 408],
    ["Audio", 420, 408],
    ["Captions", 638, 408],
  ];
  return (
    <AbsoluteFill style={{ paddingTop: 84 }}>
      <svg width="100%" height="100%" viewBox="0 0 960 650">
        {nodes.slice(1).map((n) => (
          <line key={`l-${n[0]}`} x1={420} y1={156} x2={Number(n[1])} y2={Number(n[2])} stroke={accent} strokeWidth={2} opacity={0.35} />
        ))}
        {nodes.map((n, i) => {
          const s = spring({ frame: frame - i * 8, fps: FPS, config: { damping: 18, stiffness: 120 } });
          return (
            <g key={n[0]} transform={`translate(${n[1]}, ${n[2]}) scale(${0.82 + s * 0.18})`}>
              <rect x={-110} y={-38} width={220} height={76} rx={14} fill="#0b1118" stroke={accent} strokeWidth={2.5} />
              <text x={0} y={8} textAnchor="middle" fill="#f8fafc" fontFamily={font} fontSize={25} fontWeight={800}>
                {n[0]}
              </text>
            </g>
          );
        })}
      </svg>
      <CodePanel
        accent={accent}
        lines={["<Composition id=\"DocumentaryColdOpen\" />", "spring({ frame, fps })", "Timeline IR -> Remotion props"]}
      />
    </AbsoluteFill>
  );
};

const HyperFramesVisual: React.FC<VisualProps> = ({ frame, accent }) => {
  const rig = fade(frame, 12, 74);
  return (
    <AbsoluteFill style={{ paddingTop: 84 }}>
      <div
        style={{
          position: "absolute",
          left: 86,
          top: 128,
          width: 410,
          height: 300,
          border: `2px solid ${accent}`,
          borderRadius: 14,
          background: "rgba(255,255,255,0.04)",
          padding: 24,
        }}
      >
        {["html", "css", "svg", "gsap"].map((label, i) => (
          <div
            key={label}
            style={{
              height: 42,
              marginBottom: 18,
              borderRadius: 7,
              background: i % 2 ? `${accent}22` : "rgba(255,255,255,0.08)",
              transform: `translateX(${Math.sin((frame + i * 11) / 18) * 22}px)`,
              display: "flex",
              alignItems: "center",
              paddingLeft: 18,
              fontFamily: mono,
              textTransform: "uppercase",
              letterSpacing: 2,
            }}
          >
            {label}
          </div>
        ))}
      </div>
      <svg width="100%" height="100%" viewBox="0 0 960 650">
        <g transform={`translate(682 318) scale(${0.78 + rig * 0.22})`}>
          <circle cx={0} cy={-100} r={42} fill="none" stroke={accent} strokeWidth={5} />
          <line x1={0} y1={-58} x2={0} y2={82} stroke={accent} strokeWidth={7} strokeLinecap="round" />
          <line x1={0} y1={-20} x2={-78 + Math.sin(frame / 12) * 16} y2={30} stroke={accent} strokeWidth={7} strokeLinecap="round" />
          <line x1={0} y1={-20} x2={78 - Math.sin(frame / 12) * 16} y2={30} stroke={accent} strokeWidth={7} strokeLinecap="round" />
          <line x1={0} y1={82} x2={-58} y2={176} stroke={accent} strokeWidth={7} strokeLinecap="round" />
          <line x1={0} y1={82} x2={58} y2={176} stroke={accent} strokeWidth={7} strokeLinecap="round" />
          {[[0, -100], [0, -20], [0, 82], [-78, 30], [78, 30], [-58, 176], [58, 176]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={9} fill="#07080b" stroke="#fff" strokeWidth={3} />
          ))}
        </g>
      </svg>
      <TerminalLines accent={accent} lines={["hyperframes lint", "validate DOM timeline", "render character rig"]} />
    </AbsoluteFill>
  );
};

const BlenderVisual: React.FC<VisualProps> = ({ frame, accent }) => {
  const rot = frame * 1.9;
  return (
    <AbsoluteFill style={{ paddingTop: 84 }}>
      <svg width="100%" height="100%" viewBox="0 0 960 650">
        <defs>
          <linearGradient id="blend-face" x1="0" x2="1">
            <stop offset="0" stopColor={accent} stopOpacity="0.45" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        <g transform={`translate(500 320) rotate(${rot})`}>
          <polygon points="-150,-80 40,-160 178,-50 -15,32" fill="url(#blend-face)" stroke={accent} strokeWidth={4} />
          <polygon points="-15,32 178,-50 154,132 -30,208" fill={`${accent}22`} stroke={accent} strokeWidth={4} />
          <polygon points="-150,-80 -15,32 -30,208 -164,74" fill="rgba(255,255,255,0.04)" stroke={accent} strokeWidth={4} />
          <line x1="-150" y1="-80" x2="-164" y2="74" stroke="#fff" strokeOpacity={0.25} strokeWidth={2} />
          <line x1="40" y1="-160" x2="154" y2="132" stroke="#fff" strokeOpacity={0.25} strokeWidth={2} />
        </g>
        {Array.from({ length: 18 }, (_, i) => (
          <circle
            key={i}
            cx={145 + i * 38}
            cy={540 + Math.sin((frame + i * 9) / 10) * 18}
            r={4}
            fill={accent}
            opacity={0.35 + (i % 3) * 0.18}
          />
        ))}
      </svg>
      <CodePanel accent={accent} lines={["blender --background", "montara_intro.py", "external GPL runtime"]} />
    </AbsoluteFill>
  );
};

const ThreeVisual: React.FC<VisualProps> = ({ frame, accent }) => (
  <AbsoluteFill style={{ paddingTop: 84 }}>
    <svg width="100%" height="100%" viewBox="0 0 960 650">
      {Array.from({ length: 90 }, (_, i) => {
        const ring = i % 3;
        const angle = frame / (42 + ring * 10) + i * 0.55;
        const radius = 92 + ring * 78 + Math.sin(frame / 20 + i) * 10;
        const x = 500 + Math.cos(angle) * radius;
        const y = 315 + Math.sin(angle) * radius * 0.55;
        return <circle key={i} cx={x} cy={y} r={ring + 2.5} fill={accent} opacity={0.25 + ring * 0.18} />;
      })}
      <ellipse cx={500} cy={315} rx={320} ry={178} fill="none" stroke={accent} strokeOpacity={0.35} strokeWidth={2} />
      <ellipse cx={500} cy={315} rx={220} ry={120} fill="none" stroke={accent} strokeOpacity={0.25} strokeWidth={2} />
      <circle cx={500} cy={315} r={56} fill="#0b1118" stroke={accent} strokeWidth={4} />
      <text x={500} y={324} textAnchor="middle" fontFamily={mono} fontSize={18} fontWeight={700} fill="#fff">
        WebGL
      </text>
    </svg>
    <TerminalLines accent={accent} lines={["browser + three probe", "renderThreeScene()", "native or ffmpeg fallback"]} />
  </AbsoluteFill>
);

const ManimVisual: React.FC<VisualProps> = ({ frame, accent }) => {
  const draw = fade(frame, 10, 120);
  const points = Array.from({ length: 60 }, (_, i) => {
    const t = -1.9 + (i / 59) * 3.8;
    const x = 170 + ((t + 2) / 4) * 560;
    const y = 460 - (t * t) * 72;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).slice(0, Math.max(2, Math.floor(60 * draw))).join(" ");
  return (
    <AbsoluteFill style={{ paddingTop: 84 }}>
      <svg width="100%" height="100%" viewBox="0 0 960 650">
        <line x1={160} x2={800} y1={460} y2={460} stroke="#ffffff" strokeOpacity={0.28} strokeWidth={2} />
        <line x1={480} x2={480} y1={120} y2={520} stroke="#ffffff" strokeOpacity={0.28} strokeWidth={2} />
        <polyline points={points} fill="none" stroke={accent} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
        <text x={620} y={170} fontFamily={font} fontSize={58} fontWeight={900} fill="#f8fafc">
          y = x^2
        </text>
        <text x={620} y={220} fontFamily={mono} fontSize={18} fill={accent}>
          {"diagram slot -> native Manim when MANIM_BIN is set"}
        </text>
      </svg>
      <CodePanel accent={accent} lines={["Scene()", "MathTex('y=x^2')", "Timeline IR scene type: math"]} />
    </AbsoluteFill>
  );
};

const RevideoVisual: React.FC<VisualProps> = ({ frame, accent }) => (
  <AbsoluteFill style={{ paddingTop: 84 }}>
    <div style={{ position: "absolute", left: 84, right: 84, top: 154 }}>
      {["scene", "caption", "audio", "safe MIT route"].map((label, row) => (
        <div key={label} style={{ display: "flex", alignItems: "center", marginBottom: 26 }}>
          <div style={{ width: 130, fontFamily: mono, color: "#94a3b8", textTransform: "uppercase", fontSize: 15 }}>
            {label}
          </div>
          <div style={{ flex: 1, height: 52, borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", position: "relative" }}>
            {Array.from({ length: 4 }, (_, i) => {
              const width = 90 + ((i + row) % 3) * 54;
              const x = 22 + i * 160 + Math.sin((frame + row * 12) / 24) * 10;
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: x,
                    top: 9,
                    width,
                    height: 34,
                    borderRadius: 6,
                    background: `${accent}${row === 3 ? "55" : "34"}`,
                    border: `1px solid ${accent}77`,
                  }}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
    <TerminalLines accent={accent} lines={["selectCompositionEngine()", "Remotion -> Revideo when license demands", "native proof pending"]} />
  </AbsoluteFill>
);

const MotionCanvasVisual: React.FC<VisualProps> = ({ frame, accent }) => {
  const pathProgress = fade(frame, 12, 120);
  return (
    <AbsoluteFill style={{ paddingTop: 84 }}>
      <svg width="100%" height="100%" viewBox="0 0 960 650">
        <path
          d="M140 450 C260 130, 420 530, 555 230 S760 110, 835 382"
          fill="none"
          stroke={accent}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={`${pathProgress * 1150} 1150`}
        />
        {["K", "I", "N", "E", "T", "I", "C"].map((letter, i) => (
          <text
            key={`${letter}-${i}`}
            x={175 + i * 86}
            y={310 + Math.sin((frame + i * 8) / 12) * 58}
            fontFamily={font}
            fontSize={78}
            fontWeight={950}
            fill={i % 2 ? "#fff" : accent}
            opacity={0.9}
          >
            {letter}
          </text>
        ))}
      </svg>
      <CodePanel accent={accent} lines={["vector canvas", "kinetic typography", "adapter/probe shipped"]} />
    </AbsoluteFill>
  );
};

const PlaywrightVisual: React.FC<VisualProps> = ({ frame, accent }) => {
  const x = interpolate(frame % 150, [0, 50, 100, 149], [170, 650, 560, 750], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame % 150, [0, 50, 100, 149], [210, 250, 390, 455], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ paddingTop: 84 }}>
      <div
        style={{
          position: "absolute",
          left: 94,
          top: 130,
          right: 94,
          bottom: 104,
          border: `2px solid ${accent}66`,
          borderRadius: 16,
          background: "#f8fafc",
          overflow: "hidden",
          color: "#0f172a",
        }}
      >
        <div style={{ height: 52, background: "#e2e8f0", display: "flex", alignItems: "center", padding: "0 20px", gap: 12 }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#ef4444" }} />
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#f59e0b" }} />
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#22c55e" }} />
          <div style={{ marginLeft: 22, fontFamily: mono, fontSize: 14, color: "#334155" }}>https://local-product-demo.test</div>
        </div>
        <div style={{ padding: 44 }}>
          <div style={{ width: 330, height: 46, background: "#0f172a", borderRadius: 7, marginBottom: 38 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 26 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ height: 115, borderRadius: 12, background: i === 0 ? `${accent}88` : "#dbeafe" }} />
            ))}
          </div>
          <div style={{ marginTop: 34, height: 120, borderRadius: 12, border: "2px dashed #94a3b8" }} />
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: 0,
          height: 0,
          borderLeft: "18px solid white",
          borderTop: "28px solid white",
          borderRight: "10px solid transparent",
          filter: "drop-shadow(0 8px 10px rgba(0,0,0,0.45))",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 116,
          right: 118,
          background: "#ef4444",
          color: "#fff",
          fontFamily: mono,
          fontWeight: 800,
          borderRadius: 99,
          padding: "8px 14px",
          letterSpacing: 2,
        }}
      >
        REC
      </div>
      <TerminalLines accent={accent} lines={["capture login", "storageState auth", "pick-latest -> mp4"]} />
    </AbsoluteFill>
  );
};

const TerminalLines: React.FC<{ accent: string; lines: string[] }> = ({ accent, lines }) => (
  <div
    style={{
      position: "absolute",
      left: 74,
      right: 74,
      bottom: 44,
      display: "grid",
      gridTemplateColumns: `repeat(${lines.length}, 1fr)`,
      gap: 14,
    }}
  >
    {lines.map((line) => (
      <div
        key={line}
        style={{
          fontFamily: mono,
          color: "#dbeafe",
          fontSize: 14,
          lineHeight: 1.25,
          border: "1px solid rgba(255,255,255,0.12)",
          borderLeft: `4px solid ${accent}`,
          background: "rgba(0,0,0,0.34)",
          borderRadius: 6,
          padding: "12px 14px",
        }}
      >
        {line}
      </div>
    ))}
  </div>
);

const CodePanel: React.FC<{ accent: string; lines: string[] }> = ({ accent, lines }) => (
  <div
    style={{
      position: "absolute",
      left: 70,
      bottom: 48,
      width: 392,
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(0,0,0,0.45)",
      padding: 20,
      fontFamily: mono,
      fontSize: 17,
      color: "#dbeafe",
      lineHeight: 1.75,
    }}
  >
    {lines.map((line) => (
      <div key={line}>
        <span style={{ color: accent }}>$</span> {line}
      </div>
    ))}
  </div>
);
