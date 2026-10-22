import { afterEach, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { McpInstallPreview } from "../../src/mcp/index.ts";
import {
  inspectMcpProvider,
  installMcpProvider,
  listMcpCatalog,
  previewMcpInstall,
} from "../../src/mcp/index.ts";

const fixtures: string[] = [];
const catalogText = `version: 1
servers:
  - name: inspo
    url: https://inspomcp.dev/api/mcp
    readOnly: true
    auth: none
  - name: ui-skills
    url: https://www.ui-skills.com/mcp
    readOnly: true
    auth: none
`;

afterEach(async () => {
  await Promise.all(
    fixtures
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(config?: {
  relativePath: string;
  contents: string;
}): Promise<{
  root: string;
  schemaDir: string;
  targetDir: string;
  configPath?: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "opsx-mcp-fixture-"));
  fixtures.push(root);
  const schemaDir = path.join(root, "schema");
  const targetDir = path.join(root, "target");
  await mkdir(schemaDir);
  await mkdir(targetDir);
  await writeFile(path.join(schemaDir, "mcp.yaml"), catalogText);
  let configPath: string | undefined;
  if (config) {
    configPath = path.join(targetDir, config.relativePath);
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, config.contents);
  }
  return { root, schemaDir, targetDir, configPath };
}

async function withTTY<T>(tty: boolean, action: () => Promise<T>): Promise<T> {
  const streams = [process.stdin, process.stdout];
  const descriptors = streams.map((stream) =>
    Object.getOwnPropertyDescriptor(stream, "isTTY"),
  );
  for (const stream of streams)
    Object.defineProperty(stream, "isTTY", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: tty,
    });
  try {
    return await action();
  } finally {
    streams.forEach((stream, index) => {
      const descriptor = descriptors[index];
      if (descriptor) Object.defineProperty(stream, "isTTY", descriptor);
      else Reflect.deleteProperty(stream, "isTTY");
    });
  }
}

async function withPiAgentDir<T>(
  agentDir: string,
  action: () => Promise<T>,
): Promise<T> {
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    return await action();
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
  }
}

async function installMockPiAdapter(agentDir: string): Promise<void> {
  const packageRoot = path.join(
    agentDir,
    "npm",
    "node_modules",
    "pi-mcp-adapter",
  );
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    path.join(packageRoot, "package.json"),
    JSON.stringify({
      name: "pi-mcp-adapter",
      pi: { extensions: ["./index.ts"] },
    }),
  );
  await writeFile(path.join(packageRoot, "index.ts"), "export default {};\n");
  await mkdir(agentDir, { recursive: true });
  await writeFile(
    path.join(agentDir, "settings.json"),
    JSON.stringify({ packages: ["npm:pi-mcp-adapter"] }),
  );
}

test("catalog inspection returns exact declared provider metadata and host modes", async () => {
  const data = await fixture();
  const catalog = await listMcpCatalog({ schemaDir: data.schemaDir });
  expect(catalog.version).toBe(1);
  expect(catalog.providers).toEqual([
    {
      name: "inspo",
      url: "https://inspomcp.dev/api/mcp",
      permissions: { readOnly: true },
      auth: "none",
      supportedHosts: ["atomic", "omp", "opencode", "pi", "senpi", "omo"],
    },
    {
      name: "ui-skills",
      url: "https://www.ui-skills.com/mcp",
      permissions: { readOnly: true },
      auth: "none",
      supportedHosts: ["atomic", "omp", "opencode", "pi", "senpi", "omo"],
    },
  ]);
  expect(
    catalog.hosts.map(({ host, installMode }) => [host, installMode]),
  ).toEqual([
    ["atomic", "config"],
    ["omp", "config"],
    ["opencode", "config"],
    ["pi", "prerequisite-needed"],
    ["senpi", "config"],
    ["omo", "config"],
  ]);
  expect(catalog.hosts.find(({ host }) => host === "pi")).toMatchObject({
    prerequisite: "verified Pi MCP mode",
    diagnostic: { code: "MCP_PI_ADAPTER_UNVERIFIED" },
  });
  await expect(
    inspectMcpProvider({ schemaDir: data.schemaDir, providerName: "unknown" }),
  ).rejects.toMatchObject({ code: "MCP_PROVIDER_UNKNOWN" });
});

test("non-TTY flags cannot bypass install approval, and denial leaves JSONC unchanged", async () => {
  const original = `{
  // this unrelated setting must survive installation
  "mcpServers": {
    "existing": { "url": "https://example.com/mcp" },
  },
}
`;
  const data = await fixture({ relativePath: ".mcp.json", contents: original });
  const args = {
    schemaDir: data.schemaDir,
    targetDir: data.targetDir,
    host: "atomic" as const,
    providerName: "inspo",
    // These caller-supplied flags are deliberately not part of the API contract.
    approved: true,
    approvalToken: "approved",
    isTTY: true,
  };
  let approvalCalls = 0;
  await withTTY(false, async () => {
    await expect(
      installMcpProvider({
        ...args,
        approve: () => {
          approvalCalls++;
          return true;
        },
      }),
    ).rejects.toMatchObject({ code: "MCP_APPROVAL_TTY_REQUIRED" });
    expect(approvalCalls).toBe(0);
    expect(await readFile(data.configPath!, "utf8")).toBe(original);
  });

  await withTTY(true, async () => {
    await expect(
      installMcpProvider({
        ...args,
        approve: undefined as unknown as (
          preview: McpInstallPreview,
        ) => boolean,
      }),
    ).rejects.toMatchObject({ code: "MCP_APPROVAL_REQUIRED" });
    expect(await readFile(data.configPath!, "utf8")).toBe(original);

    const denied = await installMcpProvider({
      ...args,
      approve: async () => false,
    });
    expect(denied.status).toBe("denied");
    expect(denied.preview.configPath).toBe(data.configPath!);
    expect(denied.preview.provider.url).toBe("https://inspomcp.dev/api/mcp");
    expect(denied.preview.provider.permissions).toEqual({ readOnly: true });
    expect(denied.preview.provider.auth).toBe("none");
    expect(denied.preview.diff).toEqual([
      {
        operation: "add",
        path: "/mcpServers/inspo",
        before: null,
        after: { url: "https://inspomcp.dev/api/mcp" },
        configCreated: false,
      },
    ]);
    expect(await readFile(data.configPath!, "utf8")).toBe(original);

    let approvedPreview: McpInstallPreview | undefined;
    const applied = await installMcpProvider({
      ...args,
      approve: async (preview) => {
        approvedPreview = preview;
        return true;
      },
    });
    expect(applied.status).toBe("installed");
    expect(approvedPreview).toEqual(applied.preview);
    const installed = await readFile(data.configPath!, "utf8");
    expect(installed).toContain(
      "// this unrelated setting must survive installation",
    );
    expect(installed).toContain(
      '"existing": { "url": "https://example.com/mcp" }',
    );
    expect(installed).toContain(
      '"inspo": {"url":"https://inspomcp.dev/api/mcp"}',
    );

    const noOpPreview = await previewMcpInstall({
      schemaDir: data.schemaDir,
      targetDir: data.targetDir,
      host: "atomic",
      providerName: "inspo",
    });
    expect(noOpPreview.changed).toBe(false);
    expect(noOpPreview.diff).toEqual([]);
    let noOpApprovalCalls = 0;
    const noOp = await installMcpProvider({
      ...args,
      approve: () => {
        noOpApprovalCalls++;
        return true;
      },
    });
    expect(noOp.status).toBe("unchanged");
    expect(noOpApprovalCalls).toBe(1);
    expect(await readFile(data.configPath!, "utf8")).toBe(installed);
  });
});

test("Pi retains a globally registered adapter when project packages are empty", async () => {
  const data = await fixture();
  const agentDir = path.join(data.root, "pi-agent");
  await installMockPiAdapter(agentDir);
  await writeFile(
    path.join(agentDir, "settings.json"),
    JSON.stringify({
      packages: ["npm:pi-mcp-adapter"],
      lastChangelogVersion: "1.4.0",
    }),
  );
  await mkdir(path.join(data.targetDir, ".pi"));
  await writeFile(
    path.join(data.targetDir, ".pi/settings.json"),
    JSON.stringify({ packages: [] }),
  );
  const preview = await withPiAgentDir(agentDir, () =>
    previewMcpInstall({
      schemaDir: data.schemaDir,
      targetDir: data.targetDir,
      host: "pi",
      providerName: "inspo",
    }),
  );
  expect(preview.installMode).toBe("config");
  expect(preview.configPath).toBe(path.join(data.targetDir, ".mcp.json"));
});

test("Pi ignores adapter registrations with no enabled extensions", async () => {
  const data = await fixture();
  const agentDir = path.join(data.root, "pi-agent");
  await installMockPiAdapter(agentDir);
  const settingsPath = path.join(agentDir, "settings.json");
  const disabled = { source: "npm:pi-mcp-adapter", extensions: [] };
  const options = {
    schemaDir: data.schemaDir,
    targetDir: data.targetDir,
    host: "pi" as const,
    providerName: "inspo",
  };
  await withPiAgentDir(agentDir, async () => {
    await writeFile(settingsPath, JSON.stringify({ packages: [disabled] }));
    const unknown = await previewMcpInstall(options);
    expect(unknown.diagnostic?.code).toBe("MCP_PI_ADAPTER_UNKNOWN");
    expect(unknown.configPath).toBeNull();
    await writeFile(
      settingsPath,
      JSON.stringify({
        packages: [disabled],
        extensions: ["builtin:mcp"],
        defaultProjectTrust: "always",
      }),
    );
    expect((await previewMcpInstall(options)).configPath).toBe(
      path.join(data.targetDir, ".pi/mcp.json"),
    );
    await writeFile(
      settingsPath,
      JSON.stringify({
        packages: ["npm:pi-mcp-adapter"],
        defaultProjectTrust: "always",
      }),
    );
    await mkdir(path.join(data.targetDir, ".pi"));
    await writeFile(
      path.join(data.targetDir, ".pi/settings.json"),
      JSON.stringify({ packages: [disabled] }),
    );
    const shadowed = await previewMcpInstall(options);
    expect(shadowed.installMode).toBe("prerequisite-needed");
    expect(shadowed.diagnostic?.code).toBe("MCP_PI_ADAPTER_UNKNOWN");
    expect(shadowed.configPath).toBeNull();
    let approvals = 0;
    await withTTY(true, async () => {
      await expect(
        installMcpProvider({
          ...options,
          approve: () => {
            approvals++;
            return true;
          },
        }),
      ).rejects.toMatchObject({ code: "MCP_PI_ADAPTER_UNKNOWN" });
    });
    expect(approvals).toBe(0);
    for (const configPath of [".mcp.json", ".pi/mcp.json"]) {
      await expect(
        readFile(path.join(data.targetDir, configPath)),
      ).rejects.toMatchObject({ code: "ENOENT" });
    }
    await writeFile(
      path.join(data.targetDir, ".pi/settings.json"),
      JSON.stringify({ packages: [disabled], extensions: ["builtin:mcp"] }),
    );
    const native = await previewMcpInstall(options);
    expect(native.installMode).toBe("config");
    expect(native.configPath).toBe(path.join(data.targetDir, ".pi/mcp.json"));
    await writeFile(
      path.join(agentDir, "trust.json"),
      JSON.stringify({ [data.targetDir]: false }),
    );
    const legacy = await previewMcpInstall(options);
    expect(legacy.installMode).toBe("config");
    expect(legacy.configPath).toBe(path.join(data.targetDir, ".mcp.json"));
  });
});

test("Pi excludes untrusted project extensions from the active global mode", async () => {
  const data = await fixture();
  const agentDir = path.join(data.root, "pi-agent");
  await installMockPiAdapter(agentDir);
  const projectPiDir = path.join(data.targetDir, ".pi");
  await mkdir(path.join(projectPiDir, "extensions"), { recursive: true });
  await writeFile(
    path.join(projectPiDir, "extensions/custom.ts"),
    'pi.registerCommand("mcp", {});',
  );
  const settingsPath = path.join(projectPiDir, "settings.json");
  const options = {
    schemaDir: data.schemaDir,
    targetDir: data.targetDir,
    host: "pi" as const,
    providerName: "inspo",
  };
  await withPiAgentDir(agentDir, async () => {
    for (const settings of [
      {},
      { extensions: ["./custom.ts"] },
      { packages: ["npm:custom-mcp"] },
      { extensions: ["builtin:mcp"], packages: ["npm:pi-mcp-adapter"] },
    ]) {
      await writeFile(settingsPath, JSON.stringify(settings));
      const preview = await previewMcpInstall(options);
      expect(preview.installMode).toBe("config");
      expect(preview.configPath).toBe(path.join(data.targetDir, ".mcp.json"));
    }
    await writeFile(
      settingsPath,
      JSON.stringify({ extensions: ["./custom.ts"] }),
    );
    await withTTY(true, async () => {
      await expect(
        installMcpProvider({
          ...options,
          approve: async () => {
            await writeFile(
              path.join(agentDir, "trust.json"),
              JSON.stringify({ [data.targetDir]: true }),
            );
            return true;
          },
        }),
      ).rejects.toMatchObject({ code: "MCP_CONFIG_CHANGED" });
    });
    expect((await previewMcpInstall(options)).diagnostic?.code).toBe(
      "MCP_PI_ADAPTER_UNKNOWN",
    );
    await expect(
      readFile(path.join(data.targetDir, ".mcp.json")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

test.each([
  "{",
  "null",
  "[]",
  "true",
  '"settings"',
  "42",
])("Pi defers malformed project settings until trusted: %s", async (contents) => {
  const data = await fixture();
  const agentDir = path.join(data.root, "pi-agent");
  await installMockPiAdapter(agentDir);
  await mkdir(path.join(data.targetDir, ".pi"));
  const settingsPath = path.join(data.targetDir, ".pi/settings.json");
  await writeFile(settingsPath, contents);
  const options = {
    schemaDir: data.schemaDir,
    targetDir: data.targetDir,
    host: "pi" as const,
    providerName: "inspo",
  };
  await withPiAgentDir(agentDir, async () => {
    const legacy = await previewMcpInstall(options);
    expect(legacy.installMode).toBe("config");
    expect(legacy.configPath).toBe(path.join(data.targetDir, ".mcp.json"));
    await withTTY(true, async () => {
      await expect(
        installMcpProvider({
          ...options,
          approve: async () => {
            await writeFile(settingsPath, "{}");
            return true;
          },
        }),
      ).rejects.toMatchObject({ code: "MCP_CONFIG_CHANGED" });
      await writeFile(settingsPath, contents);
      await expect(
        installMcpProvider({
          ...options,
          approve: async () => {
            await writeFile(
              path.join(agentDir, "trust.json"),
              JSON.stringify({ [data.targetDir]: true }),
            );
            return true;
          },
        }),
      ).rejects.toMatchObject({ code: "MCP_CONFIG_CHANGED" });
      const trusted = await previewMcpInstall(options);
      expect(trusted.installMode).toBe("prerequisite-needed");
      expect(trusted.diagnostic?.code).toBe("MCP_PI_ADAPTER_UNKNOWN");
      let approvals = 0;
      await expect(
        installMcpProvider({
          ...options,
          approve: () => {
            approvals++;
            return true;
          },
        }),
      ).rejects.toMatchObject({ code: "MCP_PI_ADAPTER_UNKNOWN" });
      expect(approvals).toBe(0);
    });
    for (const configPath of [".mcp.json", ".pi/mcp.json"]) {
      await expect(
        readFile(path.join(data.targetDir, configPath)),
      ).rejects.toMatchObject({ code: "ENOENT" });
    }
  });
});

test("Pi preserves the verified legacy adapter and its project trust guard", async () => {
  const original =
    JSON.stringify(
      {
        mcpServers: { existing: { url: "https://existing.example/mcp" } },
      },
      null,
      2,
    ) + "\n";
  const data = await fixture({ relativePath: ".mcp.json", contents: original });
  const agentDir = path.join(data.root, "pi-agent");
  await withPiAgentDir(agentDir, async () => {
    const missing = await previewMcpInstall({
      schemaDir: data.schemaDir,
      targetDir: data.targetDir,
      host: "pi",
      providerName: "inspo",
    });
    expect(missing.installMode).toBe("prerequisite-needed");
    expect(missing.diagnostic?.code).toBe("MCP_PI_ADAPTER_UNKNOWN");
    expect(missing.configPath).toBeNull();

    let approvals = 0;
    await withTTY(true, async () => {
      await expect(
        installMcpProvider({
          schemaDir: data.schemaDir,
          targetDir: data.targetDir,
          host: "pi",
          providerName: "inspo",
          approve: () => {
            approvals++;
            return true;
          },
        }),
      ).rejects.toMatchObject({ code: "MCP_PI_ADAPTER_UNKNOWN" });
    });
    expect(approvals).toBe(0);
    expect(await readFile(data.configPath!, "utf8")).toBe(original);

    await installMockPiAdapter(agentDir);
    const projectPiDir = path.join(data.targetDir, ".pi");
    await mkdir(projectPiDir);
    await writeFile(
      path.join(agentDir, "settings.json"),
      JSON.stringify({ packages: [] }),
    );
    await writeFile(
      path.join(projectPiDir, "settings.json"),
      JSON.stringify({ packages: ["npm:pi-mcp-adapter"] }),
    );
    const untrusted = await listMcpCatalog({
      schemaDir: data.schemaDir,
      targetDir: data.targetDir,
    });
    expect(untrusted.hosts.find(({ host }) => host === "pi")).toMatchObject({
      installMode: "prerequisite-needed",
      diagnostic: { code: "MCP_PI_PROJECT_UNTRUSTED" },
    });
    let untrustedApprovals = 0;
    await withTTY(true, async () => {
      await expect(
        installMcpProvider({
          schemaDir: data.schemaDir,
          targetDir: data.targetDir,
          host: "pi",
          providerName: "inspo",
          approve: () => {
            untrustedApprovals++;
            return true;
          },
        }),
      ).rejects.toMatchObject({ code: "MCP_PI_PROJECT_UNTRUSTED" });
    });
    expect(untrustedApprovals).toBe(0);
    expect(await readFile(data.configPath!, "utf8")).toBe(original);

    // This is a disposable persisted trust decision, not simulated provider approval.
    await writeFile(
      path.join(agentDir, "settings.json"),
      JSON.stringify({
        packages: [],
        defaultProjectTrust: "always",
        lastChangelogVersion: "1.4.0",
      }),
    );
    await writeFile(
      path.join(agentDir, "trust.json"),
      JSON.stringify({ [data.targetDir]: false }),
    );
    const explicitlyDenied = await listMcpCatalog({
      schemaDir: data.schemaDir,
      targetDir: data.targetDir,
    });
    expect(
      explicitlyDenied.hosts.find(({ host }) => host === "pi"),
    ).toMatchObject({
      installMode: "prerequisite-needed",
      diagnostic: { code: "MCP_PI_PROJECT_UNTRUSTED" },
    });
    await writeFile(
      path.join(agentDir, "trust.json"),
      JSON.stringify({ [data.targetDir]: true }),
    );
    const catalog = await listMcpCatalog({
      schemaDir: data.schemaDir,
      targetDir: data.targetDir,
    });
    expect(catalog.hosts.find(({ host }) => host === "pi")?.installMode).toBe(
      "config",
    );
    const beforeInstall = await inspectMcpProvider({
      schemaDir: data.schemaDir,
      targetDir: data.targetDir,
      providerName: "inspo",
    });
    expect(
      beforeInstall.hostStatus?.find(({ host }) => host === "pi"),
    ).toMatchObject({
      status: "missing",
      configured: false,
      configPath: path.join(data.targetDir, ".mcp.json"),
    });

    const preview = await previewMcpInstall({
      schemaDir: data.schemaDir,
      targetDir: data.targetDir,
      host: "pi",
      providerName: "inspo",
    });
    expect(preview.installMode).toBe("config");
    expect(preview.hostPath).toBe(data.targetDir);
    expect(preview.configPath).toBe(path.join(data.targetDir, ".mcp.json"));
    expect(preview.diff).toEqual([
      {
        operation: "add",
        path: "/mcpServers/inspo",
        before: null,
        after: { url: "https://inspomcp.dev/api/mcp" },
        configCreated: false,
      },
    ]);

    // The callback/TTY are simulated only for this isolated temporary fixture.
    const applied = await withTTY(true, () =>
      installMcpProvider({
        schemaDir: data.schemaDir,
        targetDir: data.targetDir,
        host: "pi",
        providerName: "inspo",
        approve: () => true,
      }),
    );
    expect(applied.status).toBe("installed");
    const stored = JSON.parse(await readFile(data.configPath!, "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(stored.mcpServers).toEqual({
      existing: { url: "https://existing.example/mcp" },
      inspo: { url: "https://inspomcp.dev/api/mcp" },
    });
    const afterInstall = await inspectMcpProvider({
      schemaDir: data.schemaDir,
      targetDir: data.targetDir,
      providerName: "inspo",
    });
    expect(
      afterInstall.hostStatus?.find(({ host }) => host === "pi"),
    ).toMatchObject({ status: "configured", configured: true });
    expect(
      afterInstall.hostStatus?.find(({ host }) => host === "atomic"),
    ).toMatchObject({ status: "configured", configured: true });
  });
});

test("host adapters choose exact files and preserve JSONC", async () => {
  await withTTY(true, async () => {
    const omp = await fixture();
    const ompPreview = await previewMcpInstall({
      schemaDir: omp.schemaDir,
      targetDir: omp.targetDir,
      host: "omp",
      providerName: "inspo",
    });
    expect(ompPreview.configPath).toBe(
      path.join(omp.targetDir, ".omp", "mcp.json"),
    );
    const ompApplied = await installMcpProvider({
      schemaDir: omp.schemaDir,
      targetDir: omp.targetDir,
      host: "omp",
      providerName: "inspo",
      approve: () => true,
    });
    expect(ompApplied.status).toBe("installed");
    const ompConfig = JSON.parse(
      await readFile(ompPreview.configPath!, "utf8"),
    ) as { mcpServers: Record<string, unknown> };
    expect(ompConfig.mcpServers.inspo).toEqual({
      type: "http",
      url: "https://inspomcp.dev/api/mcp",
    });

    const openCode = await fixture({
      relativePath: path.join(".opencode", "opencode.jsonc"),
      contents: `{
  // retain the user's OpenCode comment
  "other": true,
}
`,
    });
    const openCodePreview = await previewMcpInstall({
      schemaDir: openCode.schemaDir,
      targetDir: openCode.targetDir,
      host: "opencode",
      providerName: "ui-skills",
    });
    expect(openCodePreview.configPath).toBe(openCode.configPath!);
    const openCodeApplied = await installMcpProvider({
      schemaDir: openCode.schemaDir,
      targetDir: openCode.targetDir,
      host: "opencode",
      providerName: "ui-skills",
      approve: () => true,
    });
    expect(openCodeApplied.status).toBe("installed");
    const openCodeConfig = await readFile(openCode.configPath!, "utf8");
    expect(openCodeConfig).toContain("// retain the user's OpenCode comment");
    expect(openCodeConfig).toContain(
      '"ui-skills":{"type":"remote","url":"https://www.ui-skills.com/mcp"}',
    );

    const atomic = await fixture();
    const atomicApplied = await installMcpProvider({
      schemaDir: atomic.schemaDir,
      targetDir: atomic.targetDir,
      host: "atomic",
      providerName: "inspo",
      approve: () => true,
    });
    expect(atomicApplied.preview.configPath).toBe(
      path.join(atomic.targetDir, ".mcp.json"),
    );
    expect(atomicApplied.status).toBe("installed");

    const senpi = await fixture();
    const senpiPreview = await previewMcpInstall({
      schemaDir: senpi.schemaDir,
      targetDir: senpi.targetDir,
      host: "senpi",
      providerName: "inspo",
    });
    expect(senpiPreview.configPath).toBe(
      path.join(senpi.targetDir, ".senpi", "mcp.json"),
    );
    expect(senpiPreview.diff).toEqual([
      {
        operation: "add",
        path: "/mcpServers",
        before: null,
        after: {
          inspo: {
            type: "http",
            url: "https://inspomcp.dev/api/mcp",
            auth: false,
          },
        },
        configCreated: true,
      },
    ]);
    const senpiApplied = await installMcpProvider({
      schemaDir: senpi.schemaDir,
      targetDir: senpi.targetDir,
      host: "senpi",
      providerName: "inspo",
      approve: () => true,
    });
    expect(senpiApplied.status).toBe("installed");
    expect(
      JSON.parse(await readFile(senpiPreview.configPath!, "utf8")),
    ).toEqual({
      mcpServers: {
        inspo: {
          type: "http",
          url: "https://inspomcp.dev/api/mcp",
          auth: false,
        },
      },
    });
  });
});

test("each declared provider and host pair needs its own fresh approval", async () => {
  const data = await fixture();
  const agentDir = path.join(data.root, "pi-agent");
  await installMockPiAdapter(agentDir);
  const hosts = ["atomic", "omp", "opencode", "pi", "senpi", "omo"] as const;
  const providers = ["inspo", "ui-skills"] as const;
  const confirmations: string[] = [];

  await withPiAgentDir(agentDir, () =>
    withTTY(true, async () => {
      for (const providerName of providers) {
        for (const host of hosts) {
          const options = {
            schemaDir: data.schemaDir,
            targetDir: data.targetDir,
            host,
            providerName,
          };
          const preview = await previewMcpInstall(options);
          // A prior pair's approval cannot authorize even a shared-file no-op.
          await expect(
            installMcpProvider({
              ...options,
              approve: undefined as unknown as (
                preview: McpInstallPreview,
              ) => boolean,
            }),
          ).rejects.toMatchObject({ code: "MCP_APPROVAL_REQUIRED" });
          const result = await installMcpProvider({
            ...options,
            approve: (current) => {
              expect(current).toEqual(preview);
              expect(current.provider).toMatchObject({
                name: providerName,
                permissions: { readOnly: true },
                auth: "none",
              });
              expect(current.host).toBe(host);
              confirmations.push(providerName + ":" + host);
              return true;
            },
          });
          expect(result.status).toBe(host === "pi" ? "unchanged" : "installed");
        }
      }
    }),
  );

  expect(confirmations).toEqual(
    providers.flatMap((provider) => hosts.map((host) => provider + ":" + host)),
  );
  for (const configPath of [
    ".mcp.json",
    ".omp/mcp.json",
    "opencode.jsonc",
    ".senpi/mcp.json",
    ".omo/mcp.json",
  ]) {
    const contents = await readFile(
      path.join(data.targetDir, configPath),
      "utf8",
    );
    expect(contents).toContain("inspo");
    expect(contents).toContain("ui-skills");
  }
});

test("native Pi installs into .pi/mcp.json without an adapter or root config migration", async () => {
  const original =
    '{"mcpServers":{"legacy":{"url":"https://legacy.example/mcp"}}}\n';
  const data = await fixture({ relativePath: ".mcp.json", contents: original });
  const agentDir = path.join(data.root, "pi-agent");
  await mkdir(agentDir);
  await writeFile(
    path.join(agentDir, "settings.json"),
    JSON.stringify({
      extensions: ["builtin:mcp"],
      defaultProjectTrust: "always",
    }),
  );
  await withPiAgentDir(agentDir, async () => {
    const options = {
      schemaDir: data.schemaDir,
      targetDir: data.targetDir,
      host: "pi" as const,
      providerName: "inspo",
    };
    const preview = await previewMcpInstall(options);
    expect(preview.installMode).toBe("config");
    expect(preview.prerequisite).toBeUndefined();
    expect(preview.hostPath).toBe(path.join(data.targetDir, ".pi"));
    expect(preview.configPath).toBe(
      path.join(data.targetDir, ".pi", "mcp.json"),
    );
    const denied = await withTTY(true, () =>
      installMcpProvider({ ...options, approve: () => false }),
    );
    expect(denied.status).toBe("denied");
    await expect(readFile(preview.configPath!)).rejects.toMatchObject({
      code: "ENOENT",
    });
    const installed = await withTTY(true, () =>
      installMcpProvider({ ...options, approve: () => true }),
    );
    expect(installed.status).toBe("installed");
    expect(JSON.parse(await readFile(preview.configPath!, "utf8"))).toEqual({
      mcpServers: { inspo: { url: "https://inspomcp.dev/api/mcp" } },
    });
    expect(await readFile(data.configPath!, "utf8")).toBe(original);
    expect(
      (await inspectMcpProvider(options)).hostStatus?.find(
        ({ host }) => host === "pi",
      ),
    ).toMatchObject({
      status: "configured",
      configured: true,
      configPath: preview.configPath,
    });
    expect((await previewMcpInstall(options)).changed).toBe(false);
  });
});

test("native Pi requires project trust and ignores an unregistered installed adapter", async () => {
  const data = await fixture();
  const agentDir = path.join(data.root, "pi-agent");
  await installMockPiAdapter(agentDir);
  await writeFile(
    path.join(agentDir, "settings.json"),
    JSON.stringify({ extensions: ["builtin:mcp"], packages: [] }),
  );
  await withPiAgentDir(agentDir, async () => {
    const options = {
      schemaDir: data.schemaDir,
      targetDir: data.targetDir,
      host: "pi" as const,
      providerName: "inspo",
    };
    const preview = await previewMcpInstall(options);
    expect(preview.configPath).toBe(
      path.join(data.targetDir, ".pi", "mcp.json"),
    );
    expect(preview.diagnostic?.code).toBe("MCP_PI_PROJECT_UNTRUSTED");
    let approvals = 0;
    await withTTY(true, async () => {
      await expect(
        installMcpProvider({
          ...options,
          approve: () => {
            approvals++;
            return true;
          },
        }),
      ).rejects.toMatchObject({ code: "MCP_PI_PROJECT_UNTRUSTED" });
    });
    expect(approvals).toBe(0);
    await writeFile(
      path.join(agentDir, "trust.json"),
      JSON.stringify({ [data.targetDir]: true }),
    );
    expect((await previewMcpInstall(options)).installMode).toBe("config");
  });
});

test("Pi refuses unknown modes and custom MCP extensions before approval", async () => {
  for (const settings of [
    {},
    { lastChangelogVersion: "0.98.0" },
    { lastChangelogVersion: "1.4.0" },
    { lastChangelogVersion: "99.0.0" },
    { lastChangelogVersion: "1.4.0", extensions: ["-builtin:mcp"] },
    { lastChangelogVersion: "1.4.0", extensions: ["!builtin:mcp"] },
    { lastChangelogVersion: "1.4.0", extensions: ["!builtin:*"] },
    { lastChangelogVersion: "1.4.0", extensions: ["./custom-mcp.ts"] },
    { lastChangelogVersion: "1.4.0", packages: ["npm:custom-mcp"] },
    {
      extensions: ["builtin:mcp"],
      packages: ["npm:innocent-name-with-command-override"],
    },
  ]) {
    const data = await fixture();
    const agentDir = path.join(data.root, "pi-agent");
    await mkdir(agentDir);
    await writeFile(
      path.join(agentDir, "settings.json"),
      JSON.stringify({ ...settings, defaultProjectTrust: "always" }),
    );
    await withPiAgentDir(agentDir, async () => {
      const options = {
        schemaDir: data.schemaDir,
        targetDir: data.targetDir,
        host: "pi" as const,
        providerName: "inspo",
      };
      expect((await previewMcpInstall(options)).diagnostic?.code).toBe(
        "MCP_PI_ADAPTER_UNKNOWN",
      );
      let approvals = 0;
      await withTTY(true, async () => {
        await expect(
          installMcpProvider({
            ...options,
            approve: () => {
              approvals++;
              return true;
            },
          }),
        ).rejects.toMatchObject({ code: "MCP_PI_ADAPTER_UNKNOWN" });
      });
      expect(approvals).toBe(0);
    });
  }
});

test("Pi honors global builtin exclusions and explicit project overrides", async () => {
  for (const selectors of [
    { global: ["-builtin:mcp", "+builtin:mcp"], project: [] },
    { global: ["-builtin:mcp"], project: ["builtin:mcp"] },
  ]) {
    const data = await fixture();
    const agentDir = path.join(data.root, "pi-agent");
    await mkdir(agentDir);
    await writeFile(
      path.join(agentDir, "settings.json"),
      JSON.stringify({
        extensions: selectors.global,
        defaultProjectTrust: "always",
      }),
    );
    await mkdir(path.join(data.targetDir, ".pi"));
    const projectSettingsPath = path.join(data.targetDir, ".pi/settings.json");
    await writeFile(
      projectSettingsPath,
      JSON.stringify({ extensions: selectors.project }),
    );
    await withPiAgentDir(agentDir, async () => {
      const options = {
        schemaDir: data.schemaDir,
        targetDir: data.targetDir,
        host: "pi" as const,
        providerName: "inspo",
      };
      expect((await previewMcpInstall(options)).diagnostic?.code).toBe(
        "MCP_PI_ADAPTER_UNKNOWN",
      );
      let approvals = 0;
      await withTTY(true, async () => {
        await expect(
          installMcpProvider({
            ...options,
            approve: () => {
              approvals++;
              return true;
            },
          }),
        ).rejects.toMatchObject({ code: "MCP_PI_ADAPTER_UNKNOWN" });
      });
      expect(approvals).toBe(0);
      await expect(
        readFile(path.join(data.targetDir, ".pi/mcp.json")),
      ).rejects.toMatchObject({ code: "ENOENT" });
      await writeFile(
        projectSettingsPath,
        JSON.stringify({ extensions: ["+builtin:mcp"] }),
      );
      expect((await previewMcpInstall(options)).installMode).toBe("config");
    });
  }
});

test("Pi detects auto-loaded extensions and mode changes during approval", async () => {
  const data = await fixture();
  const agentDir = path.join(data.root, "pi-agent");
  await mkdir(agentDir);
  const settingsPath = path.join(agentDir, "settings.json");
  await writeFile(
    settingsPath,
    JSON.stringify({
      extensions: ["builtin:mcp"],
      defaultProjectTrust: "always",
    }),
  );
  const options = {
    schemaDir: data.schemaDir,
    targetDir: data.targetDir,
    host: "pi" as const,
    providerName: "inspo",
  };
  await withPiAgentDir(agentDir, async () => {
    expect((await previewMcpInstall(options)).installMode).toBe("config");
    await withTTY(true, async () => {
      await expect(
        installMcpProvider({
          ...options,
          approve: async () => {
            await writeFile(
              settingsPath,
              JSON.stringify({
                lastChangelogVersion: "99.0.0",
                defaultProjectTrust: "always",
              }),
            );
            return true;
          },
        }),
      ).rejects.toMatchObject({ code: "MCP_CONFIG_CHANGED" });
    });
    await writeFile(
      settingsPath,
      JSON.stringify({
        extensions: ["builtin:mcp"],
        defaultProjectTrust: "always",
      }),
    );
    await withTTY(true, async () => {
      await expect(
        installMcpProvider({
          ...options,
          approve: async () => {
            await mkdir(path.join(agentDir, "extensions"));
            await writeFile(
              path.join(agentDir, "extensions", "unknown.ts"),
              'pi.registerCommand("mcp", {});',
            );
            return true;
          },
        }),
      ).rejects.toMatchObject({ code: "MCP_CONFIG_CHANGED" });
    });
    expect((await previewMcpInstall(options)).diagnostic?.code).toBe(
      "MCP_PI_ADAPTER_UNKNOWN",
    );
    await expect(
      readFile(path.join(data.targetDir, ".pi", "mcp.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});

test("Pi legacy entrypoint and native trust changes invalidate approval", async () => {
  const data = await fixture();
  const agentDir = path.join(data.root, "pi-agent");
  await installMockPiAdapter(agentDir);
  const options = {
    schemaDir: data.schemaDir,
    targetDir: data.targetDir,
    host: "pi" as const,
    providerName: "inspo",
  };
  await withPiAgentDir(agentDir, () =>
    withTTY(true, async () => {
      await expect(
        installMcpProvider({
          ...options,
          approve: async () => {
            await writeFile(
              path.join(
                agentDir,
                "npm",
                "node_modules",
                "pi-mcp-adapter",
                "index.ts",
              ),
              "export default { changed: true };\n",
            );
            return true;
          },
        }),
      ).rejects.toMatchObject({ code: "MCP_CONFIG_CHANGED" });
      await expect(
        readFile(path.join(data.targetDir, ".mcp.json")),
      ).rejects.toMatchObject({ code: "ENOENT" });
      await writeFile(
        path.join(agentDir, "settings.json"),
        JSON.stringify({
          extensions: ["builtin:mcp"],
          defaultProjectTrust: "always",
        }),
      );
      await expect(
        installMcpProvider({
          ...options,
          approve: async () => {
            await writeFile(
              path.join(agentDir, "trust.json"),
              JSON.stringify({ [data.targetDir]: false }),
            );
            return true;
          },
        }),
      ).rejects.toMatchObject({ code: "MCP_CONFIG_CHANGED" });
      await expect(
        readFile(path.join(data.targetDir, ".pi", "mcp.json")),
      ).rejects.toMatchObject({ code: "ENOENT" });
    }),
  );
});

test("OmO uses the Senpi HTTP entry format without touching standalone Senpi", async () => {
  const original =
    '{"mcpServers":{"standalone":{"url":"https://senpi.example/mcp"}}}\n';
  const data = await fixture({
    relativePath: ".senpi/mcp.json",
    contents: original,
  });
  const options = {
    schemaDir: data.schemaDir,
    targetDir: data.targetDir,
    host: "omo" as const,
    providerName: "inspo",
  };
  const preview = await previewMcpInstall(options);
  expect(preview.configPath).toBe(
    path.join(data.targetDir, ".omo", "mcp.json"),
  );
  const installed = await withTTY(true, () =>
    installMcpProvider({ ...options, approve: () => true }),
  );
  expect(installed.status).toBe("installed");
  expect(JSON.parse(await readFile(preview.configPath!, "utf8"))).toEqual({
    mcpServers: {
      inspo: { type: "http", url: "https://inspomcp.dev/api/mcp", auth: false },
    },
  });
  expect(await readFile(data.configPath!, "utf8")).toBe(original);
});

test("provider approval cannot apply after its target changes", async () => {
  const data = await fixture();
  const target = path.join(data.targetDir, ".omp", "mcp.json");
  const external = `{ "mcpServers": { "other": { "url": "https://other.example/mcp" } } }\n`;
  await withTTY(true, async () => {
    await expect(
      installMcpProvider({
        schemaDir: data.schemaDir,
        targetDir: data.targetDir,
        host: "omp",
        providerName: "inspo",
        approve: async () => {
          await mkdir(path.dirname(target), { recursive: true });
          await writeFile(target, external);
          return true;
        },
      }),
    ).rejects.toMatchObject({ code: "MCP_CONFIG_CHANGED" });
  });
  expect(await readFile(target, "utf8")).toBe(external);
});

test("unsafe catalogs, unsafe host files, unsupported hosts, and conflicts fail closed", async () => {
  const unsafe = await fixture();
  await writeFile(
    path.join(unsafe.schemaDir, "mcp.yaml"),
    `version: 1\nservers:\n  - name: inspo\n    url: http://inspomcp.dev/api/mcp\n    readOnly: true\n    auth: none\n`,
  );
  await expect(
    listMcpCatalog({ schemaDir: unsafe.schemaDir }),
  ).rejects.toMatchObject({ code: "MCP_CATALOG_UNSAFE" });

  const authenticated = await fixture();
  await writeFile(
    path.join(authenticated.schemaDir, "mcp.yaml"),
    [
      "version: 1",
      "servers:",
      "  - name: inspo",
      "    url: https://inspomcp.dev/api/mcp",
      "    readOnly: true",
      "    auth: bearer",
    ].join("\n"),
  );
  await expect(
    listMcpCatalog({ schemaDir: authenticated.schemaDir }),
  ).rejects.toMatchObject({ code: "MCP_CATALOG_UNSAFE" });

  const valid = await fixture();
  await expect(
    previewMcpInstall({
      schemaDir: valid.schemaDir,
      targetDir: valid.targetDir,
      host: "other" as "atomic",
      providerName: "inspo",
    }),
  ).rejects.toMatchObject({ code: "MCP_HOST_UNSUPPORTED" });

  const conflict = await fixture({
    relativePath: ".mcp.json",
    contents: `{"mcpServers":{"inspo":{"url":"https://other.example/mcp"}}}`,
  });
  const conflictingBytes = await readFile(conflict.configPath!);
  await expect(
    previewMcpInstall({
      schemaDir: conflict.schemaDir,
      targetDir: conflict.targetDir,
      host: "atomic",
      providerName: "inspo",
    }),
  ).rejects.toMatchObject({ code: "MCP_CONFIG_CONFLICT" });
  expect(await readFile(conflict.configPath!)).toEqual(conflictingBytes);

  const symlinked = await fixture();
  const outside = path.join(symlinked.root, "outside.json");
  await writeFile(outside, "{}\n");
  await symlink(outside, path.join(symlinked.targetDir, ".mcp.json"));
  await expect(
    previewMcpInstall({
      schemaDir: symlinked.schemaDir,
      targetDir: symlinked.targetDir,
      host: "atomic",
      providerName: "inspo",
    }),
  ).rejects.toMatchObject({ code: "MCP_HOST_UNSAFE" });
  const status = await inspectMcpProvider({
    schemaDir: symlinked.schemaDir,
    targetDir: symlinked.targetDir,
    providerName: "inspo",
  });
  expect(
    status.hostStatus?.find(({ host }) => host === "atomic"),
  ).toMatchObject({
    status: "unknown",
    configured: null,
    diagnostic: { code: "MCP_HOST_UNSAFE" },
  });
});
