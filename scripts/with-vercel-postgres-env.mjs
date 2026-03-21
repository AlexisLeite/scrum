import { spawn } from "node:child_process";

process.env.DATABASE_URL ||= process.env.POSTGRES_PRISMA_URL ?? process.env.POSTGRES_URL;
process.env.DIRECT_URL ||= process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL ?? process.env.DATABASE_URL;

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error("Missing command");
  process.exit(1);
}

const child = spawn(command, args, {
  env: process.env,
  stdio: "inherit",
  shell: process.platform === "win32"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
