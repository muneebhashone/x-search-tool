const CTRL_C = "\x03";
const DEL = "\x7f";
const BS = "\b";

export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export async function readLine(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  return new Promise<string>((resolve, reject) => {
    let buf = "";
    const onData = (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      for (const ch of text) {
        if (ch === "\n" || ch === "\r") {
          process.stdin.off("data", onData);
          process.stdin.off("error", onErr);
          process.stdout.write("\n");
          resolve(buf.trim());
          return;
        }
        if (ch === CTRL_C) {
          process.stdin.off("data", onData);
          process.stdin.off("error", onErr);
          process.stdout.write("\n");
          reject(new Error("cancelled"));
          return;
        }
        buf += ch;
      }
    };
    const onErr = (err: Error) => {
      process.stdin.off("data", onData);
      process.stdin.off("error", onErr);
      reject(err);
    };
    process.stdin.on("data", onData);
    process.stdin.on("error", onErr);
    if (typeof process.stdin.resume === "function") process.stdin.resume();
  });
}

export async function readHidden(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  const wasRaw = process.stdin.isRaw === true;
  const canRaw = typeof process.stdin.setRawMode === "function";
  if (canRaw) process.stdin.setRawMode(true);

  return new Promise<string>((resolve, reject) => {
    let buf = "";
    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.off("error", onErr);
      if (canRaw) process.stdin.setRawMode(wasRaw);
    };
    const onData = (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      for (const ch of text) {
        if (ch === "\n" || ch === "\r") {
          cleanup();
          process.stdout.write("\n");
          resolve(buf.trim());
          return;
        }
        if (ch === CTRL_C) {
          cleanup();
          process.stdout.write("\n");
          reject(new Error("cancelled"));
          return;
        }
        if (ch === DEL || ch === BS) {
          if (buf.length > 0) buf = buf.slice(0, -1);
          continue;
        }
        buf += ch;
      }
    };
    const onErr = (err: Error) => {
      cleanup();
      reject(err);
    };
    process.stdin.on("data", onData);
    process.stdin.on("error", onErr);
    if (typeof process.stdin.resume === "function") process.stdin.resume();
  });
}
