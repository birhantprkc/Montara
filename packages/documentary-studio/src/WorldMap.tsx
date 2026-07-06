import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { geoMercator, geoPath, geoInterpolate } from "d3-geo";
import { feature } from "topojson-client";
import worldData from "world-atlas/countries-110m.json";
import { colors, mono } from "./theme";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const world: any = feature(worldData as any, (worldData as any).objects.countries);

export const ISO = {
  CN: "156",
  IN: "356",
  JP: "392",
  US: "840",
  RU: "643",
  IR: "364",
  AE: "784",
} as const;

export const PT = {
  taiwan: [121.0, 23.7],
  beijing: [116.4, 39.9],
  delhi: [77.2, 28.6],
  tokyo: [139.7, 35.7],
  washington: [-77.0, 38.9],
  hormuz: [56.4, 26.6],
  singapore: [103.8, 1.35],
} as const;

export type Proj = (lonlat: readonly [number, number]) => [number, number];

export const WorldMap: React.FC<{
  center: [number, number];
  scale: number;
  highlights?: Record<string, string>;
  glow?: string;
  children?: (project: Proj) => React.ReactNode;
}> = ({ center, scale, highlights = {}, glow, children }) => {
  const W = 1920;
  const H = 1080;
  const projection = geoMercator().center(center).scale(scale).translate([W / 2, H / 2]);
  const path = geoPath(projection);
  const project: Proj = (ll) => (projection(ll as [number, number]) as [number, number]) ?? [-9999, -9999];

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${colors.border}22 1px, transparent 1px), linear-gradient(90deg, ${colors.border}22 1px, transparent 1px)`,
          backgroundSize: "70px 70px",
          opacity: 0.4,
        }}
      />
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <filter id="cglow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="10" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {world.features.map((f: { id: string | number }, i: number) => {
          const id = String(f.id);
          const hl = highlights[id];
          return (
            <path
              key={i}
              d={path(f as never) || undefined}
              fill={hl || "#161b23"}
              stroke={hl ? "#7c8694" : "#2c333d"}
              strokeWidth={hl ? 1.3 : 0.7}
              opacity={hl ? 1 : 0.95}
              filter={glow && id === glow ? "url(#cglow)" : undefined}
            />
          );
        })}
        {children?.(project)}
      </svg>
    </AbsoluteFill>
  );
};

export const Arc: React.FC<{
  project: Proj;
  from: readonly [number, number];
  to: readonly [number, number];
  at?: number;
  color?: string;
  width?: number;
  dur?: number;
  dot?: boolean;
}> = ({ project, from, to, at = 0, color = colors.accent, width = 3, dur = 40, dot = true }) => {
  const frame = useCurrentFrame();
  const interp = geoInterpolate(from as [number, number], to as [number, number]);
  const N = 48;
  const prog = interpolate(frame - at, [0, dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * prog;
    pts.push(project(interp(t)));
  }
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const head = pts[pts.length - 1] ?? pts[0] ?? [0, 0];
  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        opacity={0.92}
        style={{ filter: `drop-shadow(0 0 6px ${color})` }}
      />
      {dot && prog > 0.02 && prog < 0.999 && (
        <circle cx={head[0]} cy={head[1]} r={width + 2.5} fill={color} style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
      )}
    </g>
  );
};

export const Marker: React.FC<{
  project: Proj;
  at?: number;
  pos: readonly [number, number];
  label?: string;
  color?: string;
  sub?: string;
  side?: "left" | "right" | "top";
}> = ({ project, pos, label, color = colors.alert, sub, at = 0, side = "right" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ fps, frame: frame - at, config: { damping: 12, mass: 0.6, stiffness: 120 } });
  const [x, y] = project(pos);
  const pulse = (frame % 60) / 60;
  const dx = side === "left" ? -16 : 16;
  const anchor = side === "left" ? "end" : "start";
  return (
    <g opacity={s}>
      <circle
        cx={x}
        cy={y}
        r={interpolate(pulse, [0, 1], [4, 26])}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        opacity={interpolate(pulse, [0, 1], [0.7, 0])}
      />
      <circle cx={x} cy={y} r={6 * s} fill={color} style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
      {label && (
        <text
          x={x + (side === "top" ? 0 : dx)}
          y={y + (side === "top" ? -22 : 5)}
          textAnchor={side === "top" ? "middle" : anchor}
          fontFamily={mono}
          fontWeight={700}
          fontSize={22}
          fill={colors.text}
          style={{ paintOrder: "stroke", stroke: "#000", strokeWidth: 4 }}
        >
          {label}
        </text>
      )}
      {sub && (
        <text
          x={x + (side === "top" ? 0 : dx)}
          y={y + (side === "top" ? -2 : 30)}
          textAnchor={side === "top" ? "middle" : anchor}
          fontFamily={mono}
          fontSize={15}
          fill={color}
          style={{ paintOrder: "stroke", stroke: "#000", strokeWidth: 3 }}
        >
          {sub}
        </text>
      )}
    </g>
  );
};
