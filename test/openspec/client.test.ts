import { afterEach, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { OpenSpecClient } from "../../src/openspec/client.ts";

const fixtures: string[] = [];
const openspecUrl = "https://github.com/Fission-AI/OpenSpec";

afterEach(async () => {
  await Promise.all(
    fixtures
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fakeOpenSpec(version: string): Promise<{
  client: OpenSpecClient;
  callsFile: string;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "opsx-openspec-client-"));
  fixtures.push(root);
  const executable = path.join(root, "openspec");
  const callsFile = executable + ".calls";
  const script = [
    "#!/bin/sh",
    'printf \'%s\n\' "$*" >> "$0.calls"',
    'if [ "$1" = "--version" ]; then',
    "  printf '%s\n' '" + version + "'",
    "  exit 0",
    "fi",
    "printf 'executed:%s\n' \"$*\"",
  ].join("\n");
  await writeFile(executable, script, "utf8");
  await chmod(executable, 0o755);
  return { client: new OpenSpecClient(root, executable), callsFile };
}

async function callsFrom(callsFile: string): Promise<string[]> {
  return (await readFile(callsFile, "utf8")).trim().split("\n");
}

test("accepts stable OpenSpec 1.x versions from 1.12.0 onward", async () => {
  for (const version of [
    "1.12.0",
    "1.13.2",
    "1.99.9",
    "1.100.0",
    "1.12.0+build.4",
  ]) {
    const { client, callsFile } = await fakeOpenSpec(version);
    expect(await client.command("schema", "validate")).toBe(
      "executed:schema validate\n",
    );
    expect(await callsFrom(callsFile)).toEqual([
      "--version",
      "schema validate",
    ]);
  }
});

test("rejects OpenSpec versions outside the supported stable 1.x range before commands run", async () => {
  const cases = [
    { version: "0.99.0", kind: "older" },
    { version: "1.11.9", kind: "older" },
    { version: "1.12.0-rc.1", kind: "prerelease" },
    { version: "2.0.0", kind: "major" },
    { version: "v1.13.2", kind: "malformed" },
    { version: "1.13", kind: "malformed" },
    { version: "01.13.2", kind: "malformed" },
  ] as const;

  for (const { version, kind } of cases) {
    const { client, callsFile } = await fakeOpenSpec(version);
    const result = await client.command("schema", "validate").then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(result).toBeInstanceOf(Error);
    const error = result as Error & { code?: string };
    expect(error.code).toBe("OPENSPEC_UNSUPPORTED");
    expect(error.message).toContain("1.x");
    expect(error.message).toContain(openspecUrl);
    expect(await callsFrom(callsFile)).toEqual(["--version"]);

    if (kind === "older") {
      expect(error.message).toContain(
        "Upgrade OpenSpec to 1.12.0 or newer stable 1.x",
      );
    } else if (kind === "prerelease") {
      expect(error.message).toContain("Pre-release");
      expect(error.message).toContain("Switch to a stable OpenSpec");
    } else if (kind === "major") {
      expect(error.message).toContain("major version 2");
      expect(error.message).toContain("opsx-schema build compatible");
      expect(error.message).not.toContain("Upgrade OpenSpec");
    } else {
      expect(error.message).toContain("Malformed OpenSpec version string");
      expect(error.message).toContain(JSON.stringify(version));
    }
  }
});
