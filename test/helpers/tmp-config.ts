import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type TmpConfig = {
  dir: string;
  restore: () => void;
};

export function useTmpConfigDir(): TmpConfig {
  const prior = process.env.LLMS_CONFIG_DIR;
  const dir = mkdtempSync(join(tmpdir(), "llms-test-"));
  process.env.LLMS_CONFIG_DIR = dir;
  return {
    dir,
    restore: () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
      if (prior === undefined) delete process.env.LLMS_CONFIG_DIR;
      else process.env.LLMS_CONFIG_DIR = prior;
    },
  };
}
