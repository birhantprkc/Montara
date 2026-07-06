import React from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";
import { StudioFrame } from "./Frame";
import { Arc, ISO, Marker, PT, WorldMap } from "./WorldMap";
import { IntelBrief, Lower3, SourceChip, Stamp } from "./ui";
import { colors } from "./theme";

export type DocumentaryColdOpenProps = {
  topic?: string;
  kicker?: string;
  lines?: string[];
};

/** ~42s geopolitical cold-open demo - proves the Warfront engine fork inside Montara. */
export const DocumentaryColdOpen: React.FC<DocumentaryColdOpenProps> = ({
  topic = "Why chokepoints still shape global trade",
  kicker = "GEOPOLITICS",
  lines = [
    "Twenty percent of world oil still moves through narrow sea lanes.",
    "One disruption reroutes supply chains across three continents.",
    "Montara turns verified sources into documentary-grade motion.",
  ],
}) => {
  const frame = useCurrentFrame();
  const mapScale = interpolate(frame, [0, 90], [420, 680], { extrapolateRight: "clamp" });
  const mapCenterLon = interpolate(frame, [0, 120], [45, 62], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={150}>
        <IntelBrief lines={lines} kicker={`MONTARA / ${kicker}`} />
        <StudioFrame section="01" chapter="cold open" />
      </Sequence>

      <Sequence from={150} durationInFrames={210}>
        <WorldMap
          center={[mapCenterLon, 28]}
          scale={mapScale}
          highlights={{ [ISO.IR]: colors.accent, [ISO.AE]: "#f59e0b88", [ISO.IN]: "#64748b" }}
          glow={ISO.IR}
        >
          {(project) => (
            <>
              <Arc project={project} from={PT.hormuz} to={PT.singapore} at={20} color={colors.accent} dur={50} />
              <Marker project={project} pos={PT.hormuz} label="CHOKEPOINT" sub="strait of hormuz" at={12} />
              <Marker project={project} pos={PT.singapore} label="HUB" at={55} side="left" />
            </>
          )}
        </WorldMap>
        <Lower3
          kicker={kicker}
          title={topic}
          sub="Evidence-led montage / d3-geo maps / Remotion studio engine"
          at={18}
        />
        <SourceChip text="OPEN STOCK + TIMELINE IR" at={30} />
        <StudioFrame section="02" chapter="the map" />
      </Sequence>

      <Sequence from={360} durationInFrames={150}>
        <AbsoluteFill style={{ backgroundColor: colors.bg }} />
        <Stamp text="ONE TIMELINE.\nANY FORMAT." sub="REELS / SHORTS / DOCUMENTARY" at={8} />
        <StudioFrame section="03" chapter="studio os" />
      </Sequence>

      <Sequence from={510} durationInFrames={150}>
        <WorldMap center={[121, 24]} scale={2200} highlights={{ [ISO.CN]: colors.accent, [ISO.JP]: "#64748b" }}>
          {(project) => (
            <>
              <Arc project={project} from={PT.beijing} to={PT.taiwan} at={10} color={colors.alert} dur={45} />
              <Marker project={project} pos={PT.taiwan} label="FOCUS" at={8} />
            </>
          )}
        </WorldMap>
        <Lower3
          kicker="NICHE READY"
          title="Pick your niche. Montara routes the pipeline."
          sub="Technology / geopolitics / science / product demos"
          at={14}
          align="center"
        />
        <StudioFrame section="04" chapter="your niche" />
      </Sequence>
    </AbsoluteFill>
  );
};
