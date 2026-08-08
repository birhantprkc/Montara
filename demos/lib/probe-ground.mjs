// Sanity-check the silhouette tracker against a matte before wiring it into a shot.
import { groundTrack } from "./ground.mjs";

const [mattePath, to = "9"] = process.argv.slice(2);
const track = groundTrack(mattePath, { from: 0.3, to: Number(to), samples: 7 });
for (const s of track) {
  console.log(
    `t=${s.atSec.toFixed(2)}  cx=${s.centerX.toFixed(3)}  bottom=${s.bottom.toFixed(3)}  ` +
      `top=${s.top.toFixed(3)}  w=${s.width.toFixed(3)}  h=${s.height.toFixed(3)}`,
  );
}
