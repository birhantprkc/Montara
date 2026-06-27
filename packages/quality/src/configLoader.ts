// File loader for the runtime configuration model.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createConfig, parseConfigText, type MontaraConfig } from "../../core/src/index";

export function loadConfig(configPath?: string, projectRoot = process.cwd()): MontaraConfig {
  const path = configPath ?? join(projectRoot, "config.yaml");
  if (!existsSync(path)) return createConfig();
  return parseConfigText(readFileSync(path, "utf8"));
}
