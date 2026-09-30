import { OpsxError, defaultSchema } from "../../project.ts";
import { OpenSpecClient } from "../../../openspec/client.ts";
import { resolveRevision } from "../../../revisions/index.ts";
import {
  inspectCompoundAdapters,
  installCompoundAdapters,
  isSupportedCompoundAdapterBundleSource,
  listCompoundAdapterHosts,
  previewCompoundAdapterInstall,
} from "../../../adapters/index.ts";
import type { CompoundAdapterHost } from "../../../adapters/index.ts";
import { applyToken, flags, one, requireCount } from "../shared.ts";

function adapterHost(value: string | undefined): CompoundAdapterHost {
  if (
    !value ||
    !listCompoundAdapterHosts().includes(value as CompoundAdapterHost)
  )
    throw new OpsxError(
      "USAGE",
      `Adapter host must be one of: ${listCompoundAdapterHosts().join(", ")}.`,
    );
  return value as CompoundAdapterHost;
}

function projectScope(value: string | undefined): "project" {
  if (value !== "project")
    throw new OpsxError(
      "USAGE",
      "--scope project is required; user scope is not supported.",
    );
  return "project";
}

export async function commandAdapters(
  root: string,
  args: string[],
): Promise<unknown> {
  const [operation, ...rest] = args;
  if (operation !== "inspect" && operation !== "install")
    throw new OpsxError(
      "USAGE",
      "Usage: adapters <inspect|install> <host> --scope project ...",
    );
  const parsed = flags(
    rest,
    operation === "install"
      ? { "--scope": "one", "--schema": "one", "--apply-token": "one" }
      : { "--scope": "one", "--schema": "one" },
  );
  requireCount(
    parsed.positionals,
    1,
    1,
    `adapters ${operation} <host> --scope project [--schema <name>]${operation === "install" ? " [--apply-token <token>]" : ""}`,
  );
  const host = adapterHost(parsed.positionals[0]);
  const scope = projectScope(one(parsed, "--scope"));
  const selectedName = one(parsed, "--schema") ?? (await defaultSchema(root));
  const revision = await resolveRevision(
    new OpenSpecClient(root),
    selectedName,
  );
  if (revision.shadows.length)
    throw new OpsxError(
      "SCHEMA_AMBIGUOUS",
      `Selected adapter schema ${selectedName} has same-name shadows.`,
    );
  const bundleSource = revision.bundleSource;
  if (
    !bundleSource ||
    !(await isSupportedCompoundAdapterBundleSource(bundleSource))
  )
    throw new OpsxError(
      "COMPOUND_ADAPTER_BUNDLE_UNAVAILABLE",
      `Schema ${selectedName} does not provide a verified compound adapter bundle.`,
    );
  if (operation === "inspect")
    return {
      selectedSchema: revision,
      inspection: await inspectCompoundAdapters(
        root,
        revision.name,
        bundleSource,
        host,
        scope,
      ),
    };
  const plan = await previewCompoundAdapterInstall(
    root,
    revision.name,
    bundleSource,
    host,
    scope,
  );
  const binding = { root, selectedSchema: revision, host, scope, plan };
  const token = applyToken("adapters.install", binding);
  const supplied = one(parsed, "--apply-token");
  if (supplied !== undefined) {
    if (supplied !== token)
      throw new OpsxError(
        "APPLY_TOKEN_STALE",
        "The adapter install token is stale or belongs to another host, scope, or target; preview again.",
      );
    const currentRevision = await resolveRevision(
      new OpenSpecClient(root),
      selectedName,
    );
    if (
      currentRevision.shadows.length ||
      currentRevision.source !== revision.source ||
      currentRevision.digest !== revision.digest ||
      currentRevision.bundleSource?.digest !== bundleSource.digest
    )
      throw new OpsxError(
        "APPLY_TOKEN_STALE",
        "The selected adapter schema changed after preview; inspect it again.",
      );
    if (plan.action === "refuse")
      throw new OpsxError(
        "ADAPTER_COLLISION",
        plan.reason ?? "The adapter install preview is blocked.",
      );
    return {
      phase: "applied",
      selectedSchema: revision,
      target: plan.destination,
      result: await installCompoundAdapters(
        root,
        revision.name,
        bundleSource,
        host,
        scope,
        plan,
      ),
    };
  }
  return {
    phase: "preview",
    selectedSchema: revision,
    target: plan.destination,
    plan,
    confirmation: {
      exactTarget: `${host} project adapters from ${selectedName} at ${plan.destination}`,
      token,
    },
  };
}
