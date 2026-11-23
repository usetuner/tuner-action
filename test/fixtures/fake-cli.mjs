// Stands in for the CLI: records every signal it gets, then exits like the CLI does on SIGINT.
import { appendFileSync } from "node:fs";

const log = process.env.FAKE_CLI_LOG;
let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    appendFileSync(log, `${sig}\n`);
    if (stopping) return;
    stopping = true;
    // Simulates the cancel call before exiting.
    setTimeout(() => {
      process.stdout.write(JSON.stringify({ schema_version: 1, exit_code: 130 }));
      process.exit(sig === "SIGINT" ? 130 : 143);
    }, 300);
  });
}
appendFileSync(log, "started\n");
setTimeout(() => process.exit(0), 30_000);
