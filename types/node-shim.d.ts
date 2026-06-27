declare const process: {
  argv: string[];
  cwd(): string;
  env: Record<string, string | undefined>;
  exit(code?: number): never;
  exitCode?: number;
  platform: string;
  version: string;
};

interface FetchResponse {
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

declare function fetch(
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<FetchResponse>;

declare module "node:child_process" {
  export interface SpawnSyncResult {
    status: number | null;
    stdout?: string;
    stderr?: string;
    error?: Error;
  }

  export function spawnSync(command: string, args?: string[], options?: Record<string, unknown>): SpawnSyncResult;
}

declare module "node:fs" {
  export interface Dirent {
    name: string;
    isDirectory(): boolean;
  }

  export interface Stats {
    size: number;
    isDirectory(): boolean;
    isFile(): boolean;
  }

  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function readdirSync(path: string, options: { withFileTypes: true }): Dirent[];
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  export function statSync(path: string): Stats;
  export function writeFileSync(path: string, data: string | Uint8Array): void;
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function join(...parts: string[]): string;
}
