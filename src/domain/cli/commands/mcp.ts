import path from "node:path";
import { createInterface } from "node:readline/promises";
import { OpsxError, defaultSchema } from "../../project.ts";
import { OpenSpecClient } from "../../../openspec/client.ts";
import { inspectBundledSchema } from "../../../bundled/index.ts";
import { schema as resolveSchema } from "../../../catalog/schemas.ts";
import {
  inspectMcpProvider,
  installMcpProvider,
  listMcpCatalog,
  previewMcpInstall,
} from "../../../mcp/index.ts";
import type { McpHost, McpInstallPreview } from "../../../mcp/index.ts";
import { applyToken, flags, one, requireCount } from "../shared.ts";

async function mcpSchemaDir(
  root: string | null,
  schemaName: string | undefined,
): Promise<{ name: string; directory: string }> {
  const name = schemaName ?? (root ? await defaultSchema(root) : "spec-driven");
  if (root)
    return {
      name,
      directory: (await resolveSchema(new OpenSpecClient(root), name)).path,
    };
  const bundled = await inspectBundledSchema(name);
  return { name, directory: bundled.sourceDirectory };
}

function mcpHost(value: string | undefined): McpHost {
  if (
    value !== "atomic" &&
    value !== "omp" &&
    value !== "opencode" &&
    value !== "pi" &&
    value !== "senpi"
  )
    throw new OpsxError(
      "USAGE",
      "--host must be atomic, omp, opencode, pi, or senpi.",
    );
  return value;
}

async function promptMcpApproval(preview: McpInstallPreview): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new OpsxError(
      "MCP_TTY_REQUIRED",
      "MCP installation cannot be applied without both stdin and stdout attached to a TTY.",
    );
  process.stderr.write(
    [
      `Provider: ${preview.provider.name}`,
      `URL: ${preview.provider.url}`,
      `Permissions: ${JSON.stringify(preview.provider.permissions)}`,
      `Host: ${preview.host} (${preview.installMode})`,
      `Target: ${preview.hostPath}`,
      `Config: ${preview.configPath}`,
      `Exact diff: ${JSON.stringify(preview.diff, null, 2)}`,
    ].join("\n") + "\n",
  );
  const terminal = createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: true,
  });
  try {
    return (
      (await terminal.question(
        `Type yes to install ${preview.provider.name} for ${preview.host}: `,
      )) === "yes"
    );
  } finally {
    terminal.close();
  }
}

export async function commandMcp(
  root: string | null,
  args: string[],
): Promise<unknown> {
  const [operation, ...rest] = args;
  if (!operation)
    throw new OpsxError("USAGE", "Usage: mcp <list|inspect|install> ...");
  if (operation === "list") {
    const parsed = flags(rest, { "--schema": "one", "--target-dir": "one" });
    requireCount(
      parsed.positionals,
      0,
      0,
      "mcp list [--schema <name>] [--target-dir <dir>]",
    );
    const selected = await mcpSchemaDir(root, one(parsed, "--schema"));
    const targetDir = one(parsed, "--target-dir") ?? root;
    return listMcpCatalog({
      schemaDir: selected.directory,
      ...(targetDir ? { targetDir: path.resolve(targetDir) } : {}),
    });
  }
  if (operation === "inspect") {
    const parsed = flags(rest, { "--schema": "one", "--target-dir": "one" });
    requireCount(
      parsed.positionals,
      1,
      1,
      "mcp inspect <provider> [--schema <name>] [--target-dir <dir>]",
    );
    const selected = await mcpSchemaDir(root, one(parsed, "--schema"));
    const targetDir = one(parsed, "--target-dir") ?? root;
    return inspectMcpProvider({
      schemaDir: selected.directory,
      providerName: parsed.positionals[0]!,
      ...(targetDir ? { targetDir: path.resolve(targetDir) } : {}),
    });
  }
  if (operation === "install") {
    const parsed = flags(rest, {
      "--schema": "one",
      "--host": "one",
      "--target-dir": "one",
      "--apply-token": "one",
    });
    requireCount(
      parsed.positionals,
      1,
      1,
      "mcp install <provider> --host <host> [--schema <name>] [--target-dir <dir>] [--apply-token <token>]",
    );
    const host = mcpHost(one(parsed, "--host"));
    const selected = await mcpSchemaDir(root, one(parsed, "--schema"));
    const targetDir = one(parsed, "--target-dir") ?? root;
    if (!targetDir)
      throw new OpsxError(
        "USAGE",
        "mcp install requires --target-dir <dir> when no OpenSpec project is selected.",
      );
    const input = {
      schemaDir: selected.directory,
      targetDir: path.resolve(targetDir),
      host,
      providerName: parsed.positionals[0]!,
    };
    const plan = await previewMcpInstall(input);
    const binding = { input, preview: plan };
    const token = applyToken("mcp.install", binding);
    const supplied = one(parsed, "--apply-token");
    if (supplied !== undefined) {
      if (supplied !== token)
        throw new OpsxError(
          "APPLY_TOKEN_STALE",
          "The MCP install token is stale or belongs to another provider, host, target, or diff; preview again.",
        );
      if (!process.stdin.isTTY || !process.stdout.isTTY)
        throw new OpsxError(
          "MCP_TTY_REQUIRED",
          "MCP installation cannot be applied without both stdin and stdout attached to a TTY.",
        );
      const result = await installMcpProvider({
        ...input,
        approve: promptMcpApproval,
      });
      return {
        phase: "applied",
        target: {
          host,
          targetDir: input.targetDir,
          provider: input.providerName,
        },
        result,
      };
    }
    return {
      phase: "preview",
      target: {
        host,
        targetDir: input.targetDir,
        provider: input.providerName,
      },
      plan,
      confirmation: {
        exactTarget: `${plan.provider.name} -> ${plan.hostPath}`,
        token,
      },
    };
  }
  throw new OpsxError(
    "USAGE",
    `Unknown MCP operation ${operation}. Run opsx-schema --help for commands.`,
  );
}
