import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { OpenSpecClient } from "../../src/openspec/client.ts";
import {
  readProvenance,
  recordCreation,
  revisionRef,
} from "../../src/provenance/index.ts";
import { resolveRevision, retainRevision } from "../../src/revisions/index.ts";
import {
  loadAgentProfileDigest,
  loadSkillBundles,
} from "../../src/resources/index.ts";

export async function linkedFixture(roots: string[], associated = false) {
  const base = await mkdtemp(path.join(os.tmpdir(), "opsx-portable-consumer-"));
  roots.push(base);
  const linked = path.join(base, "main");
  const original = path.join(base, "former");
  const schema = "portable";
  const source = path.join(linked, "openspec", "schemas", schema);
  await mkdir(path.dirname(source), { recursive: true });
  await writeFile(
    path.join(linked, "openspec", "config.yaml"),
    `schema: ${schema}\n`,
  );
  const builtin = await resolveRevision(
    new OpenSpecClient(linked),
    "spec-driven",
  );
  await cp(builtin.source, source, { recursive: true });
  const schemaFile = path.join(source, "schema.yaml");
  const schemaYaml = YAML.parse(await readFile(schemaFile, "utf8"));
  schemaYaml.name = schema;
  await writeFile(schemaFile, YAML.stringify(schemaYaml));
  execFileSync("git", ["init", "--quiet", "-b", "main"], { cwd: linked });
  execFileSync(
    "git",
    ["add", "openspec/schemas/portable", "openspec/config.yaml"],
    { cwd: linked },
  );
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "commit",
      "--quiet",
      "-m",
      "fixture",
    ],
    { cwd: linked },
  );
  execFileSync(
    "git",
    ["worktree", "add", "--quiet", "-b", "former", original],
    { cwd: linked },
  );
  const originalRevision = await resolveRevision(
    new OpenSpecClient(original),
    schema,
  );
  const change = path.join(original, "openspec", "changes", "sample");
  await mkdir(change, { recursive: true });
  await writeFile(path.join(change, ".openspec.yaml"), `schema: ${schema}\n`);
  await retainRevision(original, originalRevision);
  const catalog = associated
    ? await loadSkillBundles(originalRevision.source)
    : null;
  const association = catalog
    ? {
        version: 1 as const,
        effectiveRevision: revisionRef(originalRevision),
        profiles: [],
        skillHosts: [],
        skillBundle: "default" as const,
        manifestDigests: {
          agentProfiles: await loadAgentProfileDigest(),
          schemaSkills: catalog.manifestDigests.skills,
          skillBundles: catalog.manifestDigests.profiles,
        },
      }
    : undefined;
  await recordCreation(original, "sample", originalRevision, association);
  await cp(
    path.join(original, "openspec", "changes"),
    path.join(linked, "openspec", "changes"),
    { recursive: true },
  );
  await cp(
    path.join(original, "openspec", ".opsx"),
    path.join(linked, "openspec", ".opsx"),
    { recursive: true },
  );
  const current = await resolveRevision(new OpenSpecClient(linked), schema);
  return { original, linked, current, change: "sample" };
}

export async function recordFinalRePin(
  fixture: Awaited<ReturnType<typeof linkedFixture>>,
) {
  const file = path.join(
    fixture.linked,
    "openspec",
    "changes",
    fixture.change,
    ".opsx-provenance.json",
  );
  const provenance = await readProvenance(path.dirname(file));
  if (!provenance?.created) throw new Error("Missing fixture provenance");
  const from = provenance.created;
  const to = revisionRef(fixture.current);
  await writeFile(
    file,
    JSON.stringify({
      ...provenance,
      version: 2,
      migrations: [{ from, to: from, at: "2026-10-07T00:00:00Z" }],
      rePins: [
        {
          operationId: "final-pin",
          at: "2026-10-07T00:00:01Z",
          afterMigrationCount: 1,
          from,
          to,
          associationBefore: null,
          associationAfter: null,
        },
      ],
      establishments: [],
    }) + "\n",
  );
  return { file, to };
}
