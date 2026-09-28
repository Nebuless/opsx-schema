import { afterEach, expect, test } from "bun:test";
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
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  inspectCompoundAdapters,
  isSupportedCompoundAdapterBundleSource,
  installCompoundAdapters,
  listCompoundAdapterBundleSources,
  listCompoundAdapterHosts,
  previewCompoundAdapterInstall,
} from "../../src/adapters/index.ts";

const hosts = ["atomic", "omp", "opencode", "pi", "senpi"] as const;
const bundleSource = {
  name: "compound-intent-driven",
  version: "1.8.1",
  revision: "2c1740206a4d1729b0285b07a5e79c181b12bf89",
  digest: "d25477a5c302ebfbd9202458ecc5c8d0c4c379a9be3e0332e516dfb5071645a1",
} as const;
const resources = {
  atomic: ".atomic/prompts",
  omp: ".omp/commands",
  opencode: ".opencode/commands",
  pi: ".pi/prompts",
  senpi: ".senpi/prompts",
} as const;
const files = [
  "opsx-ce-bulk-continue.md",
  "opsx-ce-compound.md",
  "opsx-ce-continue.md",
  "opsx-ce-debug.md",
  "opsx-ce-define.md",
  "opsx-ce-plan.md",
  "opsx-ce-review.md",
  "opsx-ce-validate.md",
  "opsx-ce-work.md",
];
const resourceRoot = path.resolve(import.meta.dir, "../../resources");
const adapterResourceRoot = path.join(
  resourceRoot,
  "openspec",
  "schemas",
  "compound-intent-driven",
  "adapters",
  "shared",
);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "opsx-adapters-"));
  roots.push(root);
  return root;
}

test("lists all exact hosts and installs resource adapter bytes only at their host targets", async () => {
  expect(listCompoundAdapterHosts()).toEqual([...hosts]);
  const manifest = JSON.parse(
    await readFile(
      path.resolve(import.meta.dir, "../../assets/adapters/manifest.json"),
      "utf8",
    ),
  ) as {
    source: {
      package: string;
      version: string;
      repository: string;
      revision: string;
      schema: string;
      directory: string;
    };
    digest: string;
  };
  expect(manifest.source).toMatchObject({
    package: "@nebulesstech/openspec-schemas",
    version: "1.8.1",
    repository: "https://github.com/Nebuless/openspec-schemas",
    revision: "2c1740206a4d1729b0285b07a5e79c181b12bf89",
    schema: "compound-intent-driven",
    directory: "openspec/schemas/compound-intent-driven/adapters/shared",
  });
  expect(manifest.digest).toBe(
    "822d28f8640456b8d91fd46879834fb25e2e0de934e965fffebfb76ebd70b9ed",
  );
  expect(await listCompoundAdapterBundleSources()).toEqual([bundleSource]);
  expect(await isSupportedCompoundAdapterBundleSource(bundleSource)).toBe(true);
  expect(await isSupportedCompoundAdapterBundleSource(null)).toBe(false);
  expect((await readdir(adapterResourceRoot)).sort()).toEqual(
    [...files].sort(),
  );
  for (const host of hosts) {
    const root = await project();
    const preview = await previewCompoundAdapterInstall(
      root,
      "compound-intent-driven",
      bundleSource,
      host,
      "project",
    );
    const destination = path.join(root, resources[host]);
    expect(preview).toMatchObject({
      schema: "compound-intent-driven",
      host,
      scope: "project",
      root,
      destination,
      status: "missing",
      action: "install",
      files,
      installedFiles: [],
      missingFiles: files,
    });
    expect(preview.digest).toBe(
      "822d28f8640456b8d91fd46879834fb25e2e0de934e965fffebfb76ebd70b9ed",
    );
    expect(await readdir(root)).toEqual([]);
    const result = await installCompoundAdapters(
      root,
      "compound-intent-driven",
      bundleSource,
      host,
      "project",
      preview,
    );
    expect(result).toMatchObject({
      status: "installed",
      destination,
      digest: preview.digest,
      installedFiles: files,
    });
    for (const file of files) {
      expect(await readFile(path.join(destination, file))).toEqual(
        await readFile(path.join(adapterResourceRoot, file)),
      );
    }
    const installed = await inspectCompoundAdapters(
      root,
      "compound-intent-driven",
      bundleSource,
      host,
      "project",
    );
    expect(installed).toMatchObject({
      status: "intact",
      files,
      installedFiles: files,
      missingFiles: [],
    });
    const repeatedPreview = await previewCompoundAdapterInstall(
      root,
      "compound-intent-driven",
      bundleSource,
      host,
      "project",
    );
    expect(repeatedPreview.action).toBe("unchanged");
    expect(
      await installCompoundAdapters(
        root,
        "compound-intent-driven",
        bundleSource,
        host,
        "project",
        repeatedPreview,
      ),
    ).toMatchObject({
      status: "intact",
      destination,
      digest: preview.digest,
      installedFiles: [],
    });
  }
});

test("rejects unlisted, modified, and symlinked resource adapter sources", async () => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), "opsx-adapter-source-drift-"),
  );
  roots.push(fixtureRoot);
  const moduleDirectory = path.join(fixtureRoot, "src", "adapters");
  const domainDirectory = path.join(fixtureRoot, "src", "domain");
  const assetDirectory = path.join(fixtureRoot, "assets", "adapters");
  const schemaAssetDirectory = path.join(fixtureRoot, "assets", "schemas");
  const resourceDirectory = path.join(fixtureRoot, "resources");
  const adapterSourceDirectory = path.join(
    resourceDirectory,
    "openspec",
    "schemas",
    "compound-intent-driven",
    "adapters",
    "shared",
  );
  await Promise.all([
    mkdir(moduleDirectory, { recursive: true }),
    mkdir(domainDirectory, { recursive: true }),
    mkdir(assetDirectory, { recursive: true }),
    mkdir(schemaAssetDirectory, { recursive: true }),
    mkdir(path.join(fixtureRoot, "node_modules"), { recursive: true }),
  ]);
  await Promise.all([
    copyFile(
      path.resolve(import.meta.dir, "../../src/adapters/index.ts"),
      path.join(moduleDirectory, "index.ts"),
    ),
    copyFile(
      path.resolve(import.meta.dir, "../../src/domain/project.ts"),
      path.join(domainDirectory, "project.ts"),
    ),
    copyFile(
      path.resolve(import.meta.dir, "../../assets/adapters/manifest.json"),
      path.join(assetDirectory, "manifest.json"),
    ),
    copyFile(
      path.resolve(import.meta.dir, "../../assets/schemas/manifest.json"),
      path.join(schemaAssetDirectory, "manifest.json"),
    ),
    cp(resourceRoot, resourceDirectory, { recursive: true }),
    symlink(
      path.resolve(import.meta.dir, "../../node_modules/yaml"),
      path.join(fixtureRoot, "node_modules", "yaml"),
      "dir",
    ),
  ]);

  const isolated = (await import(
    pathToFileURL(path.join(moduleDirectory, "index.ts")).href
  )) as {
    inspectCompoundAdapters(
      root: string,
      schema: string,
      source: typeof bundleSource,
      host: "opencode",
      scope: "project",
    ): Promise<unknown>;
  };
  const root = await project();
  const schemaManifestPath = path.join(schemaAssetDirectory, "manifest.json");
  const schemaManifestBytes = await readFile(schemaManifestPath);
  const changedManifest = JSON.parse(schemaManifestBytes.toString("utf8")) as {
    schemas: Record<string, { digest: string }>;
  };
  changedManifest.schemas[bundleSource.name].digest = "0".repeat(64);
  await writeFile(schemaManifestPath, JSON.stringify(changedManifest));
  await expect(
    isolated.inspectCompoundAdapters(
      root,
      "compound-intent-driven-r2",
      bundleSource,
      "opencode",
      "project",
    ),
  ).rejects.toMatchObject({ code: "COMPOUND_ADAPTER_SOURCE_DRIFT" });
  await writeFile(schemaManifestPath, schemaManifestBytes);

  const extraFile = path.join(adapterSourceDirectory, "unlisted.md");
  await writeFile(extraFile, "unlisted resource\n");
  await expect(
    isolated.inspectCompoundAdapters(
      root,
      "compound-intent-driven",
      bundleSource,
      "opencode",
      "project",
    ),
  ).rejects.toMatchObject({ code: "COMPOUND_ADAPTER_SOURCE_DRIFT" });
  await unlink(extraFile);

  const changedFile = path.join(adapterSourceDirectory, files[0]);
  const original = await readFile(changedFile);
  await writeFile(
    changedFile,
    Buffer.concat([original, Buffer.from("\n# unverified change\n")]),
  );
  await expect(
    isolated.inspectCompoundAdapters(
      root,
      "compound-intent-driven",
      bundleSource,
      "opencode",
      "project",
    ),
  ).rejects.toMatchObject({ code: "COMPOUND_ADAPTER_SOURCE_DRIFT" });

  await writeFile(changedFile, original);
  const openspecDirectory = path.join(resourceDirectory, "openspec");
  const openspecBackup = path.join(resourceDirectory, "openspec-source");
  await rename(openspecDirectory, openspecBackup);
  await symlink(openspecBackup, openspecDirectory, "dir");
  await expect(
    isolated.inspectCompoundAdapters(
      root,
      "compound-intent-driven",
      bundleSource,
      "opencode",
      "project",
    ),
  ).rejects.toMatchObject({ code: "COMPOUND_ADAPTER_SOURCE_DRIFT" });
});

test("preview and install refuse a target collision without changing any target file", async () => {
  const root = await project();
  const destination = path.join(root, resources.opencode);
  const collisionPath = path.join(destination, files[0]);
  const original = "project-owned command\n";
  await mkdir(destination, { recursive: true });
  await writeFile(collisionPath, original);
  const preview = await previewCompoundAdapterInstall(
    root,
    "compound-intent-driven",
    bundleSource,
    "opencode",
    "project",
  );
  expect(preview.status).toBe("collision");
  expect(preview.action).toBe("refuse");
  expect(preview.reason).toContain(collisionPath);
  await expect(
    installCompoundAdapters(
      root,
      "compound-intent-driven",
      bundleSource,
      "opencode",
      "project",
      preview,
    ),
  ).rejects.toMatchObject({ code: "COMPOUND_ADAPTER_COLLISION" });
  expect(await readdir(destination)).toEqual([files[0]]);
  expect(await readFile(collisionPath, "utf8")).toBe(original);
});

test("refuses symlinked target ancestors and never writes outside the supplied project root", async () => {
  const root = await project();
  const outside = await project();
  await symlink(outside, path.join(root, ".pi"), "dir");
  const preview = await previewCompoundAdapterInstall(
    root,
    "compound-intent-driven",
    bundleSource,
    "pi",
    "project",
  );
  expect(preview.status).toBe("collision");
  expect(preview.action).toBe("refuse");
  await expect(
    installCompoundAdapters(
      root,
      "compound-intent-driven",
      bundleSource,
      "pi",
      "project",
      preview,
    ),
  ).rejects.toMatchObject({ code: "COMPOUND_ADAPTER_COLLISION" });
  expect(await readdir(outside)).toEqual([]);
  expect(await readdir(root)).toEqual([".pi"]);
});

test("refuses a symlinked adapter file without modifying its external target", async () => {
  const root = await project();
  const outside = await project();
  const destination = path.join(root, resources.atomic);
  const outsideFile = path.join(outside, "owned.md");
  await mkdir(destination, { recursive: true });
  await writeFile(outsideFile, "outside-owned bytes\n");
  await symlink(outsideFile, path.join(destination, files[0]));
  const preview = await previewCompoundAdapterInstall(
    root,
    "compound-intent-driven",
    bundleSource,
    "atomic",
    "project",
  );
  expect(preview.status).toBe("collision");
  await expect(
    installCompoundAdapters(
      root,
      "compound-intent-driven",
      bundleSource,
      "atomic",
      "project",
      preview,
    ),
  ).rejects.toMatchObject({ code: "COMPOUND_ADAPTER_COLLISION" });
  expect(await readFile(outsideFile, "utf8")).toBe("outside-owned bytes\n");
  expect(await readdir(destination)).toEqual([files[0]]);
});

test("preserves unrelated files in the selected host directory", async () => {
  const root = await project();
  const destination = path.join(root, resources.senpi);
  const customFile = path.join(destination, "custom-prompt.md");
  await mkdir(destination, { recursive: true });
  await writeFile(customFile, "custom prompt bytes\n");
  const preview = await previewCompoundAdapterInstall(
    root,
    "compound-intent-driven",
    bundleSource,
    "senpi",
    "project",
  );
  expect(preview.status).toBe("missing");
  const result = await installCompoundAdapters(
    root,
    "compound-intent-driven",
    bundleSource,
    "senpi",
    "project",
    preview,
  );
  expect(result.status).toBe("installed");
  expect((await readdir(destination)).sort()).toEqual(
    ["custom-prompt.md", ...files].sort(),
  );
  expect(await readFile(customFile, "utf8")).toBe("custom prompt bytes\n");
});

test("rejects a stale preview instead of writing after a target appears", async () => {
  const root = await project();
  const preview = await previewCompoundAdapterInstall(
    root,
    "compound-intent-driven",
    bundleSource,
    "senpi",
    "project",
  );
  const collisionPath = path.join(root, resources.senpi, files[0]);
  await mkdir(path.dirname(collisionPath), { recursive: true });
  await writeFile(collisionPath, "late project-owned file\n");
  await expect(
    installCompoundAdapters(
      root,
      "compound-intent-driven",
      bundleSource,
      "senpi",
      "project",
      preview,
    ),
  ).rejects.toMatchObject({ code: "COMPOUND_ADAPTER_STALE_PREVIEW" });
  expect(await readdir(path.dirname(collisionPath))).toEqual([files[0]]);
  expect(await readFile(collisionPath, "utf8")).toBe(
    "late project-owned file\n",
  );
});

test("requires an existing non-symlink project root and exact supported scope", async () => {
  const root = await project();
  const rootLink = path.join(root, "project-link");
  await symlink(root, rootLink, "dir");
  await expect(
    previewCompoundAdapterInstall(
      rootLink,
      "compound-intent-driven",
      bundleSource,
      "opencode",
      "project",
    ),
  ).rejects.toMatchObject({ code: "COMPOUND_ADAPTER_PROJECT_ROOT" });
  await expect(
    previewCompoundAdapterInstall(
      root,
      "compound-intent-driven",
      bundleSource,
      "opencode",
      "user" as never,
    ),
  ).rejects.toMatchObject({ code: "COMPOUND_ADAPTER_SCOPE" });
  await expect(
    previewCompoundAdapterInstall(
      root,
      "compound-intent-driven",
      bundleSource,
      "not-a-host" as never,
      "project",
    ),
  ).rejects.toMatchObject({ code: "COMPOUND_ADAPTER_HOST" });
  await expect(
    previewCompoundAdapterInstall(
      root,
      "../intent-driven-design",
      bundleSource,
      "omp",
      "project",
    ),
  ).rejects.toMatchObject({ code: "COMPOUND_ADAPTER_SCHEMA_ID" });
  expect(await readdir(root)).toEqual(["project-link"]);
});

test("advertises and installs only verified schema adapter bundles", async () => {
  const root = await project();
  const unbundledSource = { ...bundleSource, name: "intent-driven-design" };
  const availableSources = await listCompoundAdapterBundleSources();
  expect(availableSources).toEqual([bundleSource]);
  expect(availableSources.map((source) => source.name)).not.toContain(
    unbundledSource.name,
  );
  expect(await isSupportedCompoundAdapterBundleSource(unbundledSource)).toBe(
    false,
  );
  await expect(
    previewCompoundAdapterInstall(
      root,
      "intent-driven-design",
      unbundledSource,
      "omp",
      "project",
    ),
  ).rejects.toMatchObject({ code: "COMPOUND_ADAPTER_BUNDLE_UNAVAILABLE" });
  expect(await readdir(root)).toEqual([]);
});
