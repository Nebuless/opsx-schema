import { afterEach, expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../../src/domain/cli.ts", import.meta.url));
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

for (const event of [
  "acquisition",
  "schema-activation",
  "unsafe-rollback",
  "success",
] as const) {
  test(`schema race at ${event} rolls back exact skills or reports retained state`, async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "opsx-schema-install-race-"),
    );
    roots.push(root);
    const bin = path.join(root, "bin");
    await mkdir(bin);
    await mkdir(path.join(root, "openspec"));
    await writeFile(
      path.join(root, "openspec/config.yaml"),
      "schema: spec-driven\n",
    );
    const destination = path.join(
      root,
      "openspec/schemas/intent-driven-design",
    );
    await writeFile(
      path.join(bin, "openspec"),
      `#!/bin/sh
set -eu
count=0
if [ -f '${root}/schema-checks' ]; then read -r count < '${root}/schema-checks'; fi
count=$((count + 1))
printf '%s\\n' "$count" > '${root}/schema-checks'
if { [ '${event}' = schema-activation ] || [ '${event}' = unsafe-rollback ]; } && [ "$count" = 3 ]; then
  test -f '${root}/.agents/skills/impeccable/SKILL.md'
  test -f '${root}/.openspec/opsx-schema/managed-resources.json'
  mkdir -p '${destination}'
  printf '%s\\n' 'external schema' > '${destination}/schema.yaml'
  printf '%s\\n' 'schema-activation' > '${root}/hook-fired'
  if [ '${event}' = unsafe-rollback ]; then
    printf '%s\\n' 'external skill edit' > '${root}/.agents/skills/impeccable/SKILL.md'
  fi
fi
echo 1.12.0
`,
    );
    await writeFile(
      path.join(bin, "git"),
      `#!/bin/sh
set -eu
if [ "$1" != clone ]; then exit 0; fi
case "$6" in
  *pbakaus*)
    count=0
    if [ -f '${root}/acquisitions' ]; then read -r count < '${root}/acquisitions'; fi
    count=$((count + 1))
    printf '%s\\n' "$count" > '${root}/acquisitions'
    # The third clone is Apply's acquisition, after both reviewed previews.
    if [ '${event}' = acquisition ] && [ "$count" = 3 ]; then
      mkdir -p '${destination}'
      printf '%s\\n' 'external schema' > '${destination}/schema.yaml'
      printf '%s\\n' 'apply-acquisition' > '${root}/hook-fired'
    fi
    mkdir -p "$7/.agents/skills/impeccable"
    printf '%s\\n' '# Impeccable' > "$7/.agents/skills/impeccable/SKILL.md"
    ;;
  *mattpocock*)
    for item in productivity/grill-me engineering/grill-with-docs productivity/grilling engineering/domain-modeling; do
      mkdir -p "$7/skills/$item"
      printf '%s\\n' "# $item" > "$7/skills/$item/SKILL.md"
    done
    ;;
  *) exit 99 ;;
esac
`,
    );
    await Promise.all(
      ["openspec", "git"].map((name) => chmod(path.join(bin, name), 0o755)),
    );
    const invoke = (extra: string[]) => {
      const result = Bun.spawnSync({
        cmd: [
          process.execPath,
          cli,
          "schemas",
          "install",
          "intent-driven-design",
          "--project",
          root,
          "--json",
          ...extra,
        ],
        env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` },
        stdout: "pipe",
        stderr: "pipe",
      });
      return {
        code: result.exitCode,
        body: JSON.parse(new TextDecoder().decode(result.stdout)),
      };
    };
    const preview = invoke([]);
    expect(preview.code).toBe(0);
    expect(preview.body.data.plan.status).toBe("missing");
    expect(
      preview.body.data.skills.targets.some(
        (target: { action: string }) => target.action === "install",
      ),
    ).toBe(true);
    const applied = invoke([
      "--apply-token",
      preview.body.data.confirmation.token,
    ]);
    if (event === "success") {
      expect(applied.code).toBe(0);
      expect(applied.body.data.result.status).toBe("installed");
      expect(applied.body.data.skills.installedTargets).toHaveLength(5);
      const intact = invoke([]);
      expect(intact.code).toBe(0);
      const repeated = invoke([
        "--apply-token",
        intact.body.data.confirmation.token,
      ]);
      expect(repeated.code).toBe(0);
      expect(repeated.body.data.result.status).toBe("intact");
      expect(repeated.body.data.skills).toMatchObject({
        applied: false,
        installedTargets: [],
      });
      expect(repeated.body.data.skills.unchangedTargets).toHaveLength(5);
      return;
    }
    expect(await readFile(path.join(root, "hook-fired"), "utf8")).toBe(
      event === "acquisition" ? "apply-acquisition\n" : "schema-activation\n",
    );
    expect(applied.code).toBe(1);
    expect(await readFile(path.join(destination, "schema.yaml"), "utf8")).toBe(
      "external schema\n",
    );
    if (event === "unsafe-rollback") {
      expect(applied.body.error.code).toBe("RESOURCE_PARTIAL");
      for (const target of preview.body.data.skills.targets) {
        expect(applied.body.error.message).toContain(target.relativeTarget);
      }
      expect(applied.body.error.message).toContain("BUNDLED_SCHEMA_STALE_PLAN");
      expect(applied.body.error.message).toContain(
        "preview again before Apply",
      );
      expect(applied.body.error.message).toContain("managed-resources.json");
      expect(await readdir(path.join(root, ".agents/skills"))).toEqual([
        "impeccable",
      ]);
      expect(
        await readFile(
          path.join(root, ".agents/skills/impeccable/SKILL.md"),
          "utf8",
        ),
      ).toBe("external skill edit\n");
      expect(
        JSON.parse(
          await readFile(
            path.join(root, ".openspec/opsx-schema/managed-resources.json"),
            "utf8",
          ),
        ).resources[".agents/skills/impeccable"],
      ).toBeDefined();
      return;
    }
    expect(applied.body.error.code).toBe("BUNDLED_SCHEMA_STALE_PLAN");
    expect(await readdir(path.join(root, ".agents/skills"))).toEqual([]);
    await expect(
      readFile(path.join(root, ".openspec/opsx-schema/managed-resources.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
}
