#!/usr/bin/env node

const net = require("node:net");
const { spawn } = require("node:child_process");
const { resolve } = require("node:path");

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 7777;
const DEFAULT_READ_LINES = 10;
const HISTORY_LIMIT = 100;

function printUsage() {
  console.error(
    [
      "Usage:",
      "  node scripts/run_bash.js [--port <number>] [--host <host>] [--cwd <path>] -- <command> [args...]",
      "  node scripts/run_bash.js [--port <number>] [--host <host>] [--cwd <path>] <command> [args...]",
      "",
      "TCP protocol:",
      `  - TCP is enabled by default on ${DEFAULT_HOST}:${DEFAULT_PORT}.`,
      `  - Connect to the configured port and send 'read()' or 'read(<n>)' followed by a newline.`,
      `  - 'read()' returns the last ${DEFAULT_READ_LINES} lines.`,
      `  - The in-memory history keeps at most the last ${HISTORY_LIMIT} lines.`,
      "",
      "Examples:",
      "  node scripts/run_bash.js -- pnpm dev",
      `  printf 'read(25)\\n' | nc ${DEFAULT_HOST} ${DEFAULT_PORT}`,
      "  node scripts/run_bash.js --port 4010 -- pnpm dev"
    ].join("\n")
  );
}

function parsePositiveInteger(value, flagName) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid value for ${flagName}: ${value}`);
  }
  return parsed;
}

function parseArgs(argv) {
  const options = {
    host: DEFAULT_HOST,
    cwd: process.cwd(),
    port: DEFAULT_PORT
  };

  const command = [];
  let parsingFlags = true;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (parsingFlags && token === "--") {
      parsingFlags = false;
      continue;
    }

    if (parsingFlags && token === "--help") {
      options.help = true;
      continue;
    }

    if (parsingFlags && token.startsWith("--port=")) {
      options.port = parsePositiveInteger(token.slice("--port=".length), "--port");
      continue;
    }

    if (parsingFlags && token === "--port") {
      index += 1;
      if (index >= argv.length) {
        throw new Error("Missing value for --port");
      }
      options.port = parsePositiveInteger(argv[index], "--port");
      continue;
    }

    if (parsingFlags && token.startsWith("--host=")) {
      options.host = token.slice("--host=".length) || DEFAULT_HOST;
      continue;
    }

    if (parsingFlags && token === "--host") {
      index += 1;
      if (index >= argv.length) {
        throw new Error("Missing value for --host");
      }
      options.host = argv[index] || DEFAULT_HOST;
      continue;
    }

    if (parsingFlags && token.startsWith("--cwd=")) {
      options.cwd = resolve(token.slice("--cwd=".length));
      continue;
    }

    if (parsingFlags && token === "--cwd") {
      index += 1;
      if (index >= argv.length) {
        throw new Error("Missing value for --cwd");
      }
      options.cwd = resolve(argv[index]);
      continue;
    }

    command.push(token);
  }

  return {
    options,
    command
  };
}

function sendJson(socket, payload) {
  try {
    socket.write(`${JSON.stringify(payload)}\n`);
  } catch (error) {
    socket.destroy(error);
  }
}

function clampReadAmount(requested) {
  return Math.min(Math.max(requested, 0), HISTORY_LIMIT);
}

function parseReadRequest(rawRequest) {
  const request = rawRequest.trim();

  if (!request) {
    return null;
  }

  if (request.startsWith("{")) {
    const parsed = JSON.parse(request);
    if (parsed?.method !== "read") {
      throw new Error("Unsupported JSON method");
    }

    if (parsed.offset == null) {
      return DEFAULT_READ_LINES;
    }

    return clampReadAmount(parsePositiveInteger(parsed.offset, "offset"));
  }

  const match = /^read(?:\((\d*)\))?$/.exec(request);
  if (!match) {
    throw new Error("Unsupported command. Use read() or read(<n>)");
  }

  if (match[1] == null || match[1] === "") {
    return DEFAULT_READ_LINES;
  }

  return clampReadAmount(parsePositiveInteger(match[1], "offset"));
}

function createHistoryWindow() {
  const lines = [];

  return {
    push(entry) {
      lines.push(entry);
      if (lines.length > HISTORY_LIMIT) {
        lines.splice(0, lines.length - HISTORY_LIMIT);
      }
    },
    read(count) {
      return lines.slice(-count);
    },
    size() {
      return lines.length;
    }
  };
}

function consumeBufferedText(buffer, chunk, onLine) {
  const combined = buffer + chunk;
  const parts = combined.split(/\r\n|[\n\r]/);
  const endsWithLineBreak = /(?:\r\n|[\n\r])$/.test(combined);
  const completeLineCount = parts.length - 1;

  for (let index = 0; index < completeLineCount; index += 1) {
    onLine(parts[index]);
  }

  return endsWithLineBreak ? "" : parts[parts.length - 1];
}

function main() {
  let parsed;

  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[run_bash] ${error.message}`);
    printUsage();
    process.exit(1);
  }

  if (parsed.options.help) {
    printUsage();
    process.exit(0);
  }

  if (parsed.command.length === 0) {
    console.error("[run_bash] Missing command");
    printUsage();
    process.exit(1);
  }

  const [command, ...args] = parsed.command;
  const history = createHistoryWindow();
  const tcpClients = new Set();
  const streamBuffers = {
    stdout: "",
    stderr: ""
  };
  const configuredPort = parsed.options.port;
  const configuredHost = parsed.options.host;
  const child = spawn(command, args, {
    cwd: parsed.options.cwd,
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
    shell: process.platform === "win32"
  });

  let server = null;

  function broadcast(payload) {
    for (const socket of tcpClients) {
      sendJson(socket, payload);
    }
  }

  function rememberLine(source, line) {
    history.push({
      source,
      line
    });
  }

  function handleChunk(source, chunk) {
    const text = chunk.toString("utf8");
    const target = source === "stdout" ? process.stdout : process.stderr;

    target.write(text);
    streamBuffers[source] = consumeBufferedText(streamBuffers[source], text, (line) => {
      rememberLine(source, line);
    });
    broadcast({
      type: "chunk",
      source,
      data: text
    });
  }

  function flushPartialLines() {
    for (const source of Object.keys(streamBuffers)) {
      const remainder = streamBuffers[source];
      if (!remainder) {
        continue;
      }

      rememberLine(source, remainder);
      streamBuffers[source] = "";
    }
  }

  function closeServerAndClients() {
    for (const socket of tcpClients) {
      socket.end();
      socket.destroy();
    }
    tcpClients.clear();

    if (server) {
      server.close();
      server = null;
    }
  }

  if (child.stdout) {
    child.stdout.on("data", (chunk) => {
      handleChunk("stdout", chunk);
    });
  }

  if (child.stderr) {
    child.stderr.on("data", (chunk) => {
      handleChunk("stderr", chunk);
    });
  }

  child.on("error", (error) => {
    console.error(`[run_bash] Failed to start child process: ${error.message}`);
    closeServerAndClients();
    process.exit(1);
  });

  server = net.createServer((socket) => {
    tcpClients.add(socket);
    socket.setEncoding("utf8");

    sendJson(socket, {
      type: "ready",
      pid: child.pid,
      historyLimit: HISTORY_LIMIT,
      defaultReadLines: DEFAULT_READ_LINES,
      command,
      args
    });

    let requestBuffer = "";

    socket.on("data", (chunk) => {
      requestBuffer += chunk;

      let newlineIndex = requestBuffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const rawRequest = requestBuffer.slice(0, newlineIndex);
        requestBuffer = requestBuffer.slice(newlineIndex + 1);

        try {
          const amount = parseReadRequest(rawRequest);
          if (amount === null) {
            newlineIndex = requestBuffer.indexOf("\n");
            continue;
          }

          sendJson(socket, {
            type: "read",
            requested: amount,
            returned: Math.min(amount, history.size()),
            lines: history.read(amount)
          });
        } catch (error) {
          sendJson(socket, {
            type: "error",
            message: error.message
          });
        }

        newlineIndex = requestBuffer.indexOf("\n");
      }
    });

    socket.on("end", () => {
      if (requestBuffer.trim()) {
        try {
          const amount = parseReadRequest(requestBuffer);
          if (amount !== null) {
            sendJson(socket, {
              type: "read",
              requested: amount,
              returned: Math.min(amount, history.size()),
              lines: history.read(amount)
            });
          }
        } catch (error) {
          sendJson(socket, {
            type: "error",
            message: error.message
          });
        }
      }
    });

    socket.on("close", () => {
      tcpClients.delete(socket);
    });

    socket.on("error", () => {
      tcpClients.delete(socket);
    });
  });

  server.on("error", (error) => {
    if (error?.code === "EADDRINUSE") {
      console.error(`[run_bash] TCP port ${configuredPort} on ${configuredHost} is already in use`);
    } else {
      console.error(`[run_bash] TCP server error on ${configuredHost}:${configuredPort}: ${error.message}`);
    }
    child.kill("SIGTERM");
    closeServerAndClients();
    process.exit(1);
  });

  server.listen(configuredPort, configuredHost, () => {
    const address = server.address();
    if (address && typeof address === "object") {
      console.error(`[run_bash] TCP listening on ${address.address}:${address.port} (configured ${configuredHost}:${configuredPort})`);
    }
  });

  function forwardSignal(signal) {
    if (!child.killed) {
      child.kill(signal);
    }
  }

  process.on("SIGINT", () => {
    forwardSignal("SIGINT");
  });

  process.on("SIGTERM", () => {
    forwardSignal("SIGTERM");
  });

  child.on("exit", (code, signal) => {
    flushPartialLines();
    broadcast({
      type: "exit",
      code,
      signal
    });
    closeServerAndClients();

    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });
}

main();
