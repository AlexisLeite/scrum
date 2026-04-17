import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

export function synthesizeSpeechWav(text: string): Uint8Array {
  const outputPath = join(
    tmpdir(),
    `apia-ai-test-${Date.now()}-${Math.random().toString(16).slice(2)}.wav`,
  );

  const command = [
    "Add-Type -AssemblyName System.Speech",
    "$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer",
    `$speaker.SetOutputToWaveFile('${escapePowerShellString(outputPath)}')`,
    `$speaker.Speak('${escapePowerShellString(text)}')`,
    "$speaker.Dispose()",
  ].join("; ");

  try {
    execFileSync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", command],
      {
        stdio: "pipe",
      },
    );

    if (!existsSync(outputPath)) {
      throw new Error("Speech synthesis did not create the expected WAV file.");
    }

    return new Uint8Array(readFileSync(outputPath));
  } finally {
    if (existsSync(outputPath)) {
      unlinkSync(outputPath);
    }
  }
}

function escapePowerShellString(value: string): string {
  return value.replaceAll("'", "''");
}
