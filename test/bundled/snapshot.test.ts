import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  inspectBundledSchema,
  installBundledSchema,
  identifyBundledSchemaSource,
  listBundledSchemas,
  prepareBundledSchema,
} from "../../src/bundled/index.ts";

const expectedSchemas = [
  "behaviour-driven",
  "compound-intent-driven",
  "event-driven",
  "intent-driven",
  "intent-driven-design",
  "intent-driven-engineering",
  "intent-driven-superpowers",
  "minimalist",
  "spec-driven-with-adr",
];
const expectedSchemaDigests: Record<string, string> = {
  "behaviour-driven":
    "802643e6013b2764bf7653433352cd8d3578f162a1911da49abd75b0d1bca49f",
  "compound-intent-driven":
    "d25477a5c302ebfbd9202458ecc5c8d0c4c379a9be3e0332e516dfb5071645a1",
  "event-driven":
    "6223c6b7d8bd5ec4d43238d9eb23aa4b818ce0c7ed94db7f35c86ef93f914fb5",
  "intent-driven":
    "f4fdbd2c742fe0e7b4486811d1a58c74fb47dd4586f2586828a0a6245d4d613b",
  "intent-driven-design":
    "af3c600af0815002f67b786ad5636edf75037e61f334572eb88fe224d2b2f953",
  "intent-driven-engineering":
    "0f20756a95a216fcd25873b305bfeb0782c942b2109dee5ba49d71679a4184dd",
  "intent-driven-superpowers":
    "fd02f4387c9fe25c6567e94d8741477346d5066fd1b8a967402b4001e1f60150",
  minimalist:
    "2e703074385ae1460c7848f1aa032b6a832e86ac0147338f77673d17c983b8ba",
  "spec-driven-with-adr":
    "80b3e662a3a87aea4334126a9f60a3dc8eada02561ef9d25c830dd1f534c7e05",
};
const resourceRoot = path.resolve(import.meta.dir, "../../resources");
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

test("exposes the complete verified OpenSpec schemas 1.8.1 snapshot from resources", async () => {
  expect(listBundledSchemas()).toEqual(expectedSchemas);
  const assetRoot = path.resolve(import.meta.dir, "../../assets/schemas");
  const manifest = JSON.parse(
    await readFile(path.join(assetRoot, "manifest.json"), "utf8"),
  ) as {
    source: {
      package: string;
      version: string;
      repository: string;
      revision: string;
      licenseFile: string;
      licenseSha256: string;
    };
    schemas: Record<
      string,
      { digest: string; files: Array<{ path: string; sha256: string }> }
    >;
  };
  expect(manifest.source).toMatchObject({
    package: "@nebulesstech/openspec-schemas",
    version: "1.8.1",
    repository: "https://github.com/Nebuless/openspec-schemas",
    revision: "2c1740206a4d1729b0285b07a5e79c181b12bf89",
  });
  expect(manifest.source.version).toBe("1.8.1");
  const license = await readFile(
    path.join(resourceRoot, manifest.source.licenseFile),
  );
  expect(createHash("sha256").update(license).digest("hex")).toBe(
    manifest.source.licenseSha256,
  );
  let totalFileCount = 0;
  for (const name of expectedSchemas) {
    const schema = await inspectBundledSchema(name);
    expect(schema.version).toBe("1.8.1");
    expect(schema.repository).toBe(
      "https://github.com/Nebuless/openspec-schemas",
    );
    expect(schema.revision).toBe("2c1740206a4d1729b0285b07a5e79c181b12bf89");
    expect(schema.license).toBe("MIT");
    expect(schema.fileCount).toBe(schema.files.length);
    totalFileCount += schema.fileCount;
    expect(schema.files).toContain("README.md");
    expect(schema.files).toContain("schema.yaml");
    expect(
      schema.files.filter((file) => path.posix.basename(file) === "AGENTS.md"),
    ).toEqual([]);
    expect(schema.sourceDirectory).toBe(
      path.join(resourceRoot, "openspec", "schemas", name),
    );
    expect(schema.digest).toBe(expectedSchemaDigests[name]);
    const record = manifest.schemas[name];
    expect(record.digest).toBe(expectedSchemaDigests[name]);
    expect(record.files.map((file) => file.path)).toEqual(schema.files);
    for (const file of record.files) {
      const bytes = await readFile(
        path.join(schema.sourceDirectory, ...file.path.split("/")),
      );
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        file.sha256,
      );
    }
  }
  expect(totalFileCount).toBe(80);
  const compound = await inspectBundledSchema("compound-intent-driven");
  expect(compound.files).toContain("skills.txt");
  expect(compound.adapters).toContain("adapters/shared/opsx-ce-work.md");
  const mcpSchema = await inspectBundledSchema("intent-driven-design");
  expect(mcpSchema.files).toContain("mcp.yaml");
  expect(mcpSchema.hasMcp).toBe(true);
  expect(mcpSchema.files).toContain("templates/journey.md");
});

test("rejects tampered resource files, licenses, and symlinked source roots", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "opsx-schema-source-drift-"));
  temporaryRoots.push(root);
  const moduleDirectory = path.join(root, "src", "bundled");
  const domainDirectory = path.join(root, "src", "domain");
  const catalogDirectory = path.join(root, "src", "catalog");
  const openspecDirectory = path.join(root, "src", "openspec");
  const assetDirectory = path.join(root, "assets", "schemas");
  const resourceDirectory = path.join(root, "resources");
  await Promise.all([
    mkdir(moduleDirectory, { recursive: true }),
    mkdir(domainDirectory, { recursive: true }),
    mkdir(catalogDirectory, { recursive: true }),
    mkdir(openspecDirectory, { recursive: true }),
    mkdir(assetDirectory, { recursive: true }),
    mkdir(path.join(root, "node_modules"), { recursive: true }),
  ]);
  await Promise.all([
    copyFile(
      path.resolve(import.meta.dir, "../../src/bundled/index.ts"),
      path.join(moduleDirectory, "index.ts"),
    ),
    copyFile(
      path.resolve(import.meta.dir, "../../src/domain/project.ts"),
      path.join(domainDirectory, "project.ts"),
    ),
    copyFile(
      path.resolve(import.meta.dir, "../../src/catalog/schemas.ts"),
      path.join(catalogDirectory, "schemas.ts"),
    ),
    copyFile(
      path.resolve(import.meta.dir, "../../src/openspec/client.ts"),
      path.join(openspecDirectory, "client.ts"),
    ),
    copyFile(
      path.join(
        path.resolve(import.meta.dir, "../../assets/schemas"),
        "manifest.json",
      ),
      path.join(assetDirectory, "manifest.json"),
    ),
    cp(resourceRoot, resourceDirectory, { recursive: true }),
    symlink(
      path.resolve(import.meta.dir, "../../node_modules/yaml"),
      path.join(root, "node_modules", "yaml"),
      "dir",
    ),
  ]);

  const isolated = (await import(
    pathToFileURL(path.join(moduleDirectory, "index.ts")).href
  )) as {
    inspectBundledSchema(name: string): Promise<unknown>;
    prepareBundledSchema(
      root: string,
      name: string,
    ): Promise<{ status: string }>;
    installBundledSchema(
      root: string,
      name: string,
      plan: unknown,
    ): Promise<unknown>;
  };
  const projectRoot = path.join(root, "project");
  await mkdir(projectRoot);
  const preview = await isolated.prepareBundledSchema(
    projectRoot,
    "intent-driven",
  );
  expect(preview.status).toBe("missing");

  const schemaPath = path.join(
    resourceDirectory,
    "openspec",
    "schemas",
    "intent-driven",
    "schema.yaml",
  );
  const original = await readFile(schemaPath);
  await writeFile(
    schemaPath,
    Buffer.concat([original, Buffer.from("\n# unverified change\n")]),
  );
  await expect(
    isolated.inspectBundledSchema("intent-driven"),
  ).rejects.toMatchObject({ code: "BUNDLED_SCHEMA_SOURCE_DRIFT" });
  await expect(
    isolated.installBundledSchema(projectRoot, "intent-driven", preview),
  ).rejects.toMatchObject({ code: "BUNDLED_SCHEMA_SOURCE_DRIFT" });
  expect(await readdir(projectRoot)).toEqual([]);

  await writeFile(schemaPath, original);
  const licensePath = path.join(resourceDirectory, "LICENSE");
  const license = await readFile(licensePath);
  await writeFile(
    licensePath,
    Buffer.concat([license, Buffer.from("\nmodified\n")]),
  );
  await expect(
    isolated.inspectBundledSchema("intent-driven"),
  ).rejects.toMatchObject({ code: "BUNDLED_SCHEMA_SOURCE_DRIFT" });

  await writeFile(licensePath, license);
  const resourceBackup = path.join(root, "resource-source");
  await rename(resourceDirectory, resourceBackup);
  await symlink(resourceBackup, resourceDirectory, "dir");
  await expect(
    isolated.inspectBundledSchema("intent-driven"),
  ).rejects.toMatchObject({ code: "BUNDLED_SCHEMA_SOURCE_DRIFT" });
});

test("every bundled schema passes native OpenSpec validation in an isolated project", async () => {
  for (const name of expectedSchemas) {
    const root = await mkdtemp(path.join(tmpdir(), "opsx-native-schema-"));
    temporaryRoots.push(root);
    const plan = await prepareBundledSchema(root, name);
    expect(plan.status).toBe("missing");
    await installBundledSchema(root, name, plan);

    const output = execFileSync(
      "openspec",
      ["schema", "validate", name, "--json"],
      { cwd: root, encoding: "utf8" },
    );
    const jsonStart = output.indexOf("{");
    expect(jsonStart).toBeGreaterThanOrEqual(0);
    expect(JSON.parse(output.slice(jsonStart))).toMatchObject({
      name,
      valid: true,
      issues: [],
    });
  }
});

test("preview is read-only, installs only at the exact target, and repeats as a no-op", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "opsx-bundled-schema-"));
  temporaryRoots.push(root);
  const name = "intent-driven";
  const plan = await prepareBundledSchema(root, name);
  const destination = path.join(root, "openspec", "schemas", name);
  expect(plan.status).toBe("missing");
  expect(plan.destination).toBe(destination);
  expect(await readdir(root)).not.toContain("openspec");

  const installed = await installBundledSchema(root, name, plan);
  expect(installed).toMatchObject({
    status: "installed",
    destination,
    sourceName: name,
    destinationName: name,
    sourceDigest: plan.sourceDigest,
    installedDigest: plan.installedDigest,
    digest: plan.digest,
  });
  const intact = await prepareBundledSchema(root, name);
  expect(intact.status).toBe("intact");
  expect(await installBundledSchema(root, name, intact)).toMatchObject({
    status: "intact",
    destination,
    sourceName: name,
    destinationName: name,
    sourceDigest: intact.sourceDigest,
    installedDigest: intact.installedDigest,
    digest: intact.digest,
  });
  expect(
    await readFile(path.join(destination, "schema.yaml"), "utf8"),
  ).toContain("name: intent-driven");
});

test(
  "installs an explicit bundled alias without changing the source, and treats an identical alias as a no-op",
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), "opsx-schema-alias-"));
    temporaryRoots.push(root);
    const sourceName = "intent-driven-design";
    const destinationName = "intent-driven-design-next";
    await mkdir(path.join(root, "openspec"), { recursive: true });
    await writeFile(
      path.join(root, "openspec", "config.yaml"),
      "schema: " + sourceName + "\n",
    );

    const originalPlan = await prepareBundledSchema(root, sourceName);
    await installBundledSchema(root, sourceName, originalPlan);
    const originalPath = path.join(root, "openspec", "schemas", sourceName);
    const originalSchema = await readFile(
      path.join(originalPath, "schema.yaml"),
      "utf8",
    );
    const configBefore = await readFile(
      path.join(root, "openspec", "config.yaml"),
      "utf8",
    );

    const plan = await prepareBundledSchema(root, sourceName, destinationName);
    const destination = path.join(root, "openspec", "schemas", destinationName);
    expect(plan).toMatchObject({
      name: sourceName,
      sourceName,
      destinationName,
      destination,
      status: "missing",
      sourceDigest: originalPlan.sourceDigest,
    });
    expect(plan.installedDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(await readdir(path.join(root, "openspec", "schemas"))).toEqual([
      sourceName,
    ]);

    const installed = await installBundledSchema(root, sourceName, plan);
    expect(installed).toMatchObject({
      status: "installed",
      sourceName,
      destinationName,
      destination,
      sourceDigest: plan.sourceDigest,
      installedDigest: plan.installedDigest,
    });
    const aliasSchema = await readFile(
      path.join(destination, "schema.yaml"),
      "utf8",
    );
    expect(aliasSchema).toBe(
      originalSchema.replace("name: " + sourceName, "name: " + destinationName),
    );
    expect(await readFile(path.join(originalPath, "schema.yaml"), "utf8")).toBe(
      originalSchema,
    );
    expect(
      await readFile(path.join(root, "openspec", "config.yaml"), "utf8"),
    ).toBe(configBefore);
    const sourceIdentity = await identifyBundledSchemaSource(
      destinationName,
      destination,
    );
    expect(sourceIdentity).toMatchObject({
      name: sourceName,
      version: plan.sourceVersion,
      revision: plan.sourceRevision,
      digest: plan.sourceDigest,
      installedDigest: plan.installedDigest,
    });

    const output = execFileSync(
      "openspec",
      ["schema", "validate", destinationName, "--json"],
      { cwd: root, encoding: "utf8" },
    );
    const jsonStart = output.indexOf("{");
    expect(jsonStart).toBeGreaterThanOrEqual(0);
    expect(JSON.parse(output.slice(jsonStart))).toMatchObject({
      name: destinationName,
      valid: true,
      issues: [],
    });

    const repeated = await prepareBundledSchema(
      root,
      sourceName,
      destinationName,
    );
    expect(repeated.status).toBe("intact");
    expect(repeated.installedDigest).toBe(plan.installedDigest);
    expect(
      await installBundledSchema(root, sourceName, repeated),
    ).toMatchObject({
      status: "intact",
      destinationName,
      installedDigest: plan.installedDigest,
    });
  },
  { timeout: 30_000 },
);

test("rejects invalid and conflicting bundle alias names without touching project data", async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), "opsx-schema-alias-collision-"),
  );
  temporaryRoots.push(root);
  const sourceName = "intent-driven";
  await expect(
    prepareBundledSchema(root, sourceName, "../escape"),
  ).rejects.toMatchObject({ code: "BUNDLED_SCHEMA_ALIAS_INVALID" });
  await expect(
    prepareBundledSchema(root, sourceName, sourceName),
  ).rejects.toMatchObject({ code: "BUNDLED_SCHEMA_ALIAS_INVALID" });
  await expect(
    prepareBundledSchema(root, sourceName, "minimalist"),
  ).rejects.toMatchObject({ code: "BUNDLED_SCHEMA_ALIAS_INVALID" });
  expect(await readdir(root)).toEqual([]);

  const destinationName = "intent-driven-local";
  const destination = path.join(root, "openspec", "schemas", destinationName);
  const ownedContent = "name: intent-driven-local\nprojectOwned: true\n";
  await mkdir(destination, { recursive: true });
  await writeFile(path.join(destination, "schema.yaml"), ownedContent);
  const plan = await prepareBundledSchema(root, sourceName, destinationName);
  expect(plan.status).toBe("collision");
  await expect(
    installBundledSchema(root, sourceName, plan),
  ).rejects.toMatchObject({ code: "BUNDLED_SCHEMA_COLLISION" });
  expect(await readFile(path.join(destination, "schema.yaml"), "utf8")).toBe(
    ownedContent,
  );
});

test("refuses to overwrite a project-local schema collision", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "opsx-schema-collision-"));
  temporaryRoots.push(root);
  const name = "spec-driven-with-adr";
  const destination = path.join(root, "openspec", "schemas", name);
  const localSchema = "name: local-project-schema\n";
  await mkdir(destination, { recursive: true });
  await writeFile(path.join(destination, "schema.yaml"), localSchema);
  await writeFile(
    path.join(destination, "project-owned.txt"),
    "keep this file\n",
  );

  const plan = await prepareBundledSchema(root, name);
  expect(plan.status).toBe("collision");
  expect(plan.destination).toBe(destination);
  await expect(installBundledSchema(root, name, plan)).rejects.toMatchObject({
    code: "BUNDLED_SCHEMA_COLLISION",
  });
  expect(await readFile(path.join(destination, "schema.yaml"), "utf8")).toBe(
    localSchema,
  );
  expect(
    await readFile(path.join(destination, "project-owned.txt"), "utf8"),
  ).toBe("keep this file\n");
});

test("rejects a stale missing-target preview when a local schema appears", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "opsx-schema-stale-"));
  temporaryRoots.push(root);
  const name = "behaviour-driven";
  const plan = await prepareBundledSchema(root, name);
  const destination = path.join(root, "openspec", "schemas", name);
  await mkdir(destination, { recursive: true });
  await writeFile(path.join(destination, "schema.yaml"), "name: local\n");
  await expect(installBundledSchema(root, name, plan)).rejects.toMatchObject({
    code: "BUNDLED_SCHEMA_STALE_PLAN",
  });
  expect(await readFile(path.join(destination, "schema.yaml"), "utf8")).toBe(
    "name: local\n",
  );
});

test("refuses schema targets redirected through a project symlink", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "opsx-schema-link-"));
  const outside = await mkdtemp(path.join(tmpdir(), "opsx-schema-outside-"));
  temporaryRoots.push(root, outside);
  await mkdir(path.join(root, "openspec"));
  await symlink(outside, path.join(root, "openspec", "schemas"), "dir");

  const plan = await prepareBundledSchema(root, "intent-driven");
  expect(plan.status).toBe("collision");
  expect(plan.destination).toBe(
    path.join(root, "openspec", "schemas", "intent-driven"),
  );
  await expect(
    installBundledSchema(root, "intent-driven", plan),
  ).rejects.toMatchObject({ code: "BUNDLED_SCHEMA_COLLISION" });
  expect(await readdir(outside)).toEqual([]);
});
