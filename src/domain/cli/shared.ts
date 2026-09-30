import { createHash } from "node:crypto";
import { OpsxError, resolveProject } from "../project.ts";
import type { SkillBundle } from "../../resources/index.ts";

export type GlobalOptions = {
  json: boolean;
  help: boolean;
  project?: string;
  words: string[];
};
type FlagDefinition = "one" | "repeat";
type ParsedFlags = {
  positionals: string[];
  values: Record<string, string | string[]>;
};

export function globalOptions(argv: string[]): GlobalOptions {
  const parsed: GlobalOptions = { json: false, help: false, words: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--json") parsed.json = true;
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--project") {
      if (
        parsed.project !== undefined ||
        !argv[i + 1] ||
        argv[i + 1]!.startsWith("-")
      ) {
        throw new OpsxError(
          "USAGE",
          "--project needs one directory and may be supplied only once.",
        );
      }
      parsed.project = argv[++i]!;
    } else if (arg.startsWith("-") && !arg.startsWith("--"))
      throw new OpsxError("USAGE", `Unknown flag: ${arg}`);
    else parsed.words.push(arg);
  }
  return parsed;
}

export function flags(
  args: string[],
  definitions: Record<string, FlagDefinition>,
): ParsedFlags {
  const parsed: ParsedFlags = { positionals: [], values: {} };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!arg.startsWith("--")) {
      parsed.positionals.push(arg);
      continue;
    }
    const definition = definitions[arg];
    if (!definition) throw new OpsxError("USAGE", `Unknown flag: ${arg}`);
    const value = args[i + 1];
    if (!value || value.startsWith("--"))
      throw new OpsxError("USAGE", `${arg} needs a value.`);
    i++;
    if (definition === "repeat") {
      const current = parsed.values[arg];
      parsed.values[arg] =
        current === undefined ? [value] : [...(current as string[]), value];
    } else {
      if (parsed.values[arg] !== undefined)
        throw new OpsxError("USAGE", `${arg} may be supplied only once.`);
      parsed.values[arg] = value;
    }
  }
  return parsed;
}

export function one(parsed: ParsedFlags, flag: string): string | undefined {
  const value = parsed.values[flag];
  return typeof value === "string" ? value : undefined;
}

export function many(parsed: ParsedFlags, flag: string): string[] {
  const value = parsed.values[flag];
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

export function requireCount(
  values: string[],
  min: number,
  max: number,
  usage: string,
): void {
  if (values.length < min || values.length > max)
    throw new OpsxError("USAGE", `Usage: ${usage}`);
}

export async function projectRoot(options: GlobalOptions): Promise<string> {
  return resolveProject(
    options.project ?? process.cwd(),
    options.project !== undefined,
  );
}

export async function optionalProject(
  options: GlobalOptions,
): Promise<string | null> {
  if (options.project !== undefined) return projectRoot(options);
  try {
    return await resolveProject(process.cwd());
  } catch (error) {
    if (error instanceof OpsxError && error.code === "PROJECT_NOT_FOUND")
      return null;
    throw error;
  }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function applyToken(scope: string, binding: unknown): string {
  const encoded = Buffer.from(
    stable({ schemaVersion: 1, scope, binding }),
  ).toString("base64url");
  const digest = createHash("sha256").update(encoded).digest("hex");
  return `opsx-apply-v1.${encoded}.${digest}`;
}

export function validationPassed(result: unknown): boolean {
  if (!result || typeof result !== "object") return true;
  const record = result as Record<string, unknown>;
  if (record.ok === false || record.valid === false || record.isValid === false)
    return false;
  if (Array.isArray(record.errors) && record.errors.length > 0) return false;
  if (Array.isArray(record.issues) && record.issues.length > 0) return false;
  return true;
}

export function statusOf(
  command: string,
  data: unknown,
): { ok: boolean; error?: { code: string; message: string } } {
  if (!data || typeof data !== "object") return { ok: true };
  const record = data as Record<string, any>;
  if (
    record.ok === false &&
    record.error &&
    typeof record.error.message === "string"
  )
    return { ok: false, error: record.error };
  if (
    command === "change validate" &&
    record.ok &&
    record.data &&
    record.data.ok === false
  ) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: `Change ${record.data.change} could not be confirmed valid; see findings.`,
      },
    };
  }
  if (command === "schemas validate" && record.ok === false)
    return {
      ok: false,
      error: {
        code: "SCHEMA_INVALID",
        message: `Schema validation failed for ${String(record.schema ?? "selected schema")}.`,
      },
    };
  if (command === "verify" && record.ok === false)
    return {
      ok: false,
      error: {
        code: "VERIFY_FAILED",
        message: verificationFailureMessage(
          record.failures,
          record.separateChecks,
        ),
      },
    };
  if (command === "doctor" && record.ok === false)
    return {
      ok: false,
      error: {
        code: "DOCTOR_FAILED",
        message: "Project diagnostics found one or more blocking problems.",
      },
    };
  if (command === "skills doctor" && record.complete === false)
    return {
      ok: false,
      error: {
        code: "SKILLS_INCOMPLETE",
        message:
          "Managed skill health could not be proven complete; see diagnostics.",
      },
    };
  if (
    record.phase === "preview" &&
    (record.data?.ready === false ||
      record.plan?.canApply === false ||
      record.plan?.action === "refuse" ||
      record.plan?.status === "collision" ||
      record.plan?.status === "blocked")
  )
    return {
      ok: false,
      error: {
        code: "PREVIEW_BLOCKED",
        message: "The preview is blocked; see diagnostics for the reason.",
      },
    };
  const result =
    record.result && typeof record.result === "object"
      ? (record.result as Record<string, any>)
      : undefined;
  if (result?.ok === false)
    return {
      ok: false,
      error:
        result.error && typeof result.error.message === "string"
          ? result.error
          : {
              code: "OPERATION_NOT_APPLIED",
              message:
                "The requested operation returned an unsuccessful result; see diagnostics.",
            },
    };
  if (
    [
      record.phase,
      record.status,
      record.action,
      result?.phase,
      result?.status,
      result?.action,
    ].some(
      (status) =>
        status === "partial" ||
        status === "denied" ||
        status === "guided-only" ||
        status === "refuse" ||
        status === "failed" ||
        status === "error" ||
        status === "blocked",
    )
  )
    return {
      ok: false,
      error: {
        code: "OPERATION_NOT_APPLIED",
        message:
          "The requested operation could not be applied; see the returned status and diagnostics.",
      },
    };
  return { ok: true };
}

function verificationFailureMessage(
  failures: unknown,
  separateChecks: unknown,
): string {
  if (!Array.isArray(failures))
    return "One or more aggregate validation checks failed.";
  const labels = failures.flatMap((failure) => {
    if (!failure || typeof failure !== "object") return [];
    const item = failure as Record<string, unknown>;
    if (typeof item.name !== "string") return [];
    const issues = [
      ...(Array.isArray(item.findings) ? item.findings : []),
      ...(Array.isArray(item.diagnostics) ? item.diagnostics : []),
    ];
    const codes = issues.flatMap((finding) =>
      finding &&
      typeof finding === "object" &&
      typeof (finding as Record<string, unknown>).code === "string"
        ? [(finding as Record<string, string>).code]
        : [],
    );
    const uniqueCodes = [...new Set(codes)];
    const unknownHistory = uniqueCodes.includes("PROVENANCE_UNKNOWN")
      ? " — current-schema validation cannot prove its historical creation revision"
      : "";
    return [
      `${item.name}${uniqueCodes.length ? ` (${uniqueCodes.join(", ")})` : ""}${unknownHistory}`,
    ];
  });
  const separateCheckNames = Array.isArray(separateChecks)
    ? separateChecks.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const separateCheckHint = separateCheckNames.length
    ? ` Separate checks: ${separateCheckNames.join(", ")}.`
    : "";
  return labels.length
    ? `Aggregate verification failed for ${labels.join(", ")}; inspect component findings.${separateCheckHint}`
    : "One or more aggregate validation checks failed.";
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function skillBundle(value: string | undefined): SkillBundle {
  const selected = value ?? "default";
  if (
    selected !== "default" &&
    selected !== "recommended" &&
    selected !== "all"
  )
    throw new OpsxError(
      "USAGE",
      "--bundle must be default, recommended, or all.",
    );
  return selected;
}
