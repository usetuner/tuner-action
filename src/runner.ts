import { spawn } from "node:child_process";
import type { EventEmitter } from "node:events";

export interface RunResult {
  exitCode: number;
  stdout: string;
  /** The signal the job sent the action, if any. */
  signal: NodeJS.Signals | null;
}

export interface RunOptions {
  /** Script run with `node`: the vendored CLI's `main.js`. */
  script: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  /** Where job signals arrive; `process` in production. */
  signals: EventEmitter;
  nodePath?: string;
}

const SIGNAL_EXIT: Record<string, number> = { SIGINT: 130, SIGTERM: 143 };

/**
 * Runs the CLI as a child process with no shell. stdout (the JSON document) is collected;
 * stderr streams to the job log. The first SIGINT or SIGTERM is forwarded once so the CLI can
 * cancel the run; later ones are ignored, since a second signal makes the CLI stop waiting.
 */
export function runCli(opts: RunOptions): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(opts.nodePath ?? process.execPath, [opts.script, ...opts.args], {
      env: opts.env,
      stdio: ["ignore", "pipe", "inherit"],
    });
    let stdout = "";
    let received: NodeJS.Signals | null = null;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));

    const onSignal = (signal: NodeJS.Signals) => {
      if (received) return;
      received = signal;
      child.kill(signal);
    };
    const onInt = () => onSignal("SIGINT");
    const onTerm = () => onSignal("SIGTERM");
    opts.signals.on("SIGINT", onInt);
    opts.signals.on("SIGTERM", onTerm);
    const cleanup = () => {
      opts.signals.off("SIGINT", onInt);
      opts.signals.off("SIGTERM", onTerm);
    };

    child.on("error", (err) => {
      cleanup();
      reject(err);
    });
    child.on("close", (code, signal) => {
      cleanup();
      const exitCode = code ?? (signal ? (SIGNAL_EXIT[signal] ?? 1) : 1);
      resolve({ exitCode, stdout, signal: received });
    });
  });
}
