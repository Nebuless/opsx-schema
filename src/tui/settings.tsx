import path from "node:path";
import { Fragment, useEffect, useRef, useState } from "react";
import {
  useKeyboard,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react";
import { TextRenderable } from "@opentui/core";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { ChangeSummary, ProjectSnapshot } from "../domain/snapshot.ts";
import { inspectBundledSchema, listBundledSchemas } from "../bundled/index.ts";
import { schema as resolveSchema } from "../catalog/schemas.ts";
import { OpenSpecClient } from "../openspec/client.ts";
import { OpsxError } from "../domain/project.ts";
import {
  ActionHint,
  ReviewPanel,
  SectionHeading,
  SectionPanel,
  SelectableRow,
  ViewHeading,
} from "./presentation.tsx";
import { tuiTextColor } from "./theme.tsx";
import {
  discoverSkillInstallHosts,
  isSkillInstallHostId,
  loadAgentProfiles,
  skillInstallHostLabel,
  SKILL_INSTALL_HOST_IDS,
} from "../resources/index.ts";
import type {
  AgentProfile,
  SkillInstallHostDescriptor,
  SkillInstallHostId,
} from "../resources/index.ts";
import { apply, inspectRecovery, preview } from "../switch/index.ts";
import type {
  SwitchApplyResult,
  SwitchPreview,
  SwitchRecovery,
} from "../switch/index.ts";
import {
  installMcpProvider,
  listMcpCatalog,
  previewMcpInstall,
} from "../mcp/index.ts";
import type { McpHost, McpInstallPreview } from "../mcp/index.ts";

type Row = {
  kind: "schema" | "profile" | "change" | "skill-host" | "provider" | "host";
  id: string;
  label: string;
};
type Screen =
  | "stage"
  | "staged-review"
  | "schema-preview"
  | "apply-confirm"
  | "result"
  | "mcp-preview"
  | "provider-approval";

const GROUP_NAMES: Record<Row["kind"], string> = {
  schema: "DEFAULT SCHEMA",
  profile: "AGENT PROFILES",
  change: "CHANGE MIGRATIONS",
  "skill-host": "SKILL INSTALL HOSTS (NOT AGENT PROFILES)",
  provider: "MCP PROVIDERS (SEPARATE APPROVAL)",
  host: "MCP HOSTS (SEPARATE APPROVAL)",
};

const INITIAL_STAGE_NOTICE =
  "Stage selections, then preview. Staging does not write to the project.";

const REVIEW_SURFACES: Record<
  Exclude<Screen, "stage">,
  { title: string; state: string; tone: "accent" | "pending" }
> = {
  "staged-review": {
    title: "STAGED SELECTIONS",
    state: "STAGED ONLY · no writes",
    tone: "pending",
  },
  "schema-preview": {
    title: "EXACT EFFECTS PREVIEW",
    state: "READ ONLY",
    tone: "accent",
  },
  "apply-confirm": {
    title: "APPLY CONFIRMATION",
    state: "PENDING CONSENT",
    tone: "pending",
  },
  result: { title: "APPLY RESULT", state: "RESULT EVIDENCE", tone: "accent" },
  "mcp-preview": {
    title: "MCP PROVIDER REVIEW",
    state: "READ ONLY · separate approval",
    tone: "accent",
  },
  "provider-approval": {
    title: "MCP PROVIDER APPROVAL",
    state: "SEPARATE INTERACTIVE CONSENT",
    tone: "pending",
  },
};

function resultLines(
  result: SwitchApplyResult | null,
  recovery: SwitchRecovery | null,
): string[] {
  if (result?.status === "unchanged")
    return ["Overall: Unchanged", "No targets were written by this Apply."];
  if (!recovery)
    return [
      "Recovery evidence unavailable. Inspect the project switch journal before retrying.",
    ];
  const actions = recovery.journal?.actions ?? [];
  const needsRecovery =
    recovery.status !== "complete" || result?.status === "partial";
  let changedTarget = false;
  const rows = actions.flatMap((action) =>
    action.targets.map((target) => {
      const observed = recovery.writes.find(
        (write) => write.action === action.kind && write.target === target,
      );
      const state = observed?.state ?? "unknown";
      const label =
        state === "complete"
          ? "Applied"
          : state === "unchanged"
            ? "Unchanged"
            : action.status === "complete" &&
                !observed &&
                (action.kind === "schema.validate" ||
                  action.kind === "postflight")
              ? "Verified at Apply"
              : action.status === "failed" && !observed
                ? "Blocked"
                : needsRecovery
                  ? "Recovery Needed"
                  : result
                    ? "Verification Needed"
                    : "Changed Since Apply";
      if (
        label === "Verification Needed" ||
        label === "Changed Since Apply" ||
        (label === "Blocked" && !needsRecovery)
      )
        changedTarget = true;
      return `${label} | ${action.kind} | ${target}${action.error ? ` | ${action.error.code}: ${action.error.message}` : ""}`;
    }),
  );
  const nextActions = changedTarget
    ? [
        "No interrupted switch to recover. Inspect changed targets and obtain a fresh preview before another Apply.",
      ]
    : recovery.nextActions;
  return [
    `Overall: ${needsRecovery ? "Recovery Needed" : changedTarget ? (result ? "Verification Needed" : "Completed previously; current targets differ") : "Applied"}`,
    ...(rows.length
      ? rows
      : [
          "No journal target writes recorded; inspect the recovery state before retrying.",
        ]),
    ...(nextActions.length
      ? ["NEXT ACTIONS", ...nextActions.map((item) => `- ${item}`)]
      : []),
  ];
}

function revisionName(revision: { name: string } | string | null): string {
  if (revision === null) return "unknown";
  return typeof revision === "string" ? revision : revision.name;
}

function switchPreviewLines(
  plan: SwitchPreview,
  profiles: readonly AgentProfile[],
): string[] {
  const selectedProfiles = plan.request.profiles.map((id) => {
    const profile = profiles.find((item) => item.id === id);
    return profile
      ? `- ${profile.label} (${id}) → ${profile.target}`
      : `- ${id} (profile target unavailable)`;
  });
  const skillTargets = plan.profiles.targets.map(
    (target) =>
      `- ${target.action.toUpperCase()} ${target.skill} → ${target.relativeTarget}; profiles ${target.profiles.join(", ")}; state ${target.state}${target.reason ? `; ${target.reason}` : ""}`,
  );
  const hostEffects = plan.skillHosts.flatMap((host) => [
    `${host.label} (${host.host.toUpperCase()}): ${host.action.toUpperCase()} ${host.destination ?? "unverified destination"}; discovery ${host.discoverability}; state ${host.state}; trust ${host.trust}${host.trustNote ? `; ${host.trustNote}` : ""}${host.reason ? `; ${host.reason}` : ""}`,
    ...(host.targets.length
      ? host.targets.map(
          (target) =>
            `- ${target.action.toUpperCase()} ${target.skill} → ${target.absoluteTarget}; state ${target.state}${target.reason ? `; ${target.reason}` : ""}`,
        )
      : ["- no skill artifacts selected for this host"]),
  ]);
  const selectedMigrations = plan.request.migrations.map((name) => {
    const migration = plan.migrations.find((item) => item.change === name);
    if (!migration) return `- ${name}: no migration preview is available.`;
    const paths =
      migration.noOp || !migration.ready
        ? "no migration files will be written"
        : `writes ${path.join(plan.root, "openspec", "changes", name, ".openspec.yaml")} and ${path.join(plan.root, "openspec", "changes", name, ".opsx-provenance.json")}`;
    return `- ${name}: ${revisionName(migration.from)} → ${revisionName(migration.to)}; ready ${migration.ready ? "yes" : "no"}; no-op ${migration.noOp ? "yes" : "no"}; ${paths}`;
  });
  const legacyPins = plan.legacyPins.map(
    (pin) =>
      `- ${pin.change}: ${revisionName(pin.from)} → ${pin.target}; selected migration ${pin.selectedMigration ? "yes" : "no"}; retain current revision ${pin.retained ? "yes" : "no"}; writes ${path.join(plan.root, "openspec", "changes", pin.change, ".openspec.yaml")} and ${path.join(plan.root, "openspec", "changes", pin.change, ".opsx-provenance.json")}`,
  );
  return [
    `Project root: ${plan.root}`,
    `Default schema: ${plan.default.current} → ${plan.default.target}`,
    ...(plan.default.current === plan.default.target
      ? []
      : [`Default config: ${path.join(plan.root, "openspec", "config.yaml")}`]),
    `Schema: ${plan.schema.status} at ${plan.schema.destination}`,
    `Can apply: ${plan.canApply ? "yes" : "no"}; no-op: ${plan.noOp ? "yes" : "no"}`,
    "Selected agent profiles:",
    ...(selectedProfiles.length ? selectedProfiles : ["- none"]),
    "Exact skill target effects:",
    ...(skillTargets.length ? skillTargets : ["- no skill target changes"]),
    "Skill-install host effects (independent from agent profiles):",
    ...(hostEffects.length ? hostEffects : ["- no verified skill hosts"]),
    ...(plan.profiles.sharedTargets.length
      ? [
          "Shared targets:",
          ...plan.profiles.sharedTargets.map(
            (target) => `- ${target.target}: ${target.profiles.join(", ")}`,
          ),
        ]
      : []),
    "Selected migrations:",
    ...(selectedMigrations.length ? selectedMigrations : ["- none"]),
    "Other legacy pin effects:",
    ...(legacyPins.length ? legacyPins : ["- none"]),
    "Diagnostics:",
    ...(plan.diagnostics.length
      ? plan.diagnostics.map(
          (item) =>
            `- ${(item.severity ?? "info").toUpperCase()} ${item.code}: ${item.message}`,
        )
      : ["- none"]),
  ];
}

function mcpPreviewLines(preview: McpInstallPreview, root: string): string[] {
  const diff = preview.diff.flatMap((entry, index) => [
    `Diff ${index + 1}: ${entry.operation.toUpperCase()} ${entry.path}`,
    `Before: ${entry.before === null ? "(absent)" : JSON.stringify(entry.before)}`,
    `After: ${JSON.stringify(entry.after)}`,
    `Creates config file: ${entry.configCreated ? "yes" : "no"}`,
  ]);
  return [
    `Provider: ${preview.provider.name}`,
    `URL: ${preview.provider.url}`,
    `Host: ${preview.host} (${preview.installMode})`,
    ...(preview.prerequisite
      ? [`Host prerequisite: ${preview.prerequisite}`]
      : []),
    ...(preview.diagnostic
      ? [
          `Host diagnostic: ${preview.diagnostic.code}: ${preview.diagnostic.message}`,
        ]
      : []),
    `Target project: ${root}`,
    `Host path: ${preview.hostPath}`,
    `Config path: ${preview.configPath ?? "guided setup only"}`,
    `Authentication: ${preview.provider.auth}`,
    `Permissions: ${preview.provider.permissions.readOnly ? "read-only" : "write access"}`,
    `Supported hosts: ${preview.provider.supportedHosts.join(", ")}`,
    `Catalog: ${preview.catalogPath}`,
    `Change required: ${preview.changed ? "yes" : "no"}`,
    `Can install now: ${preview.installMode === "config" ? "yes, after separate approval" : "no, host setup is required"}`,
    "Proposed config diff:",
    ...(diff.length ? diff : ["(no config diff)"]),
  ];
}

function wrappedRows(lines: readonly string[], width: number): number {
  const lineWidth = Math.max(1, width);
  return lines.reduce(
    (total, line) => total + Math.max(1, Math.ceil(line.length / lineWidth)),
    0,
  );
}

// Percentage text widths can retain a pre-scrollbar column outside the clip.
// Fit only this review's native leaves after layout, preserving native resize
// callbacks and scroll-range ownership.
function fitReviewText(scroll: ScrollBoxRenderable | null) {
  if (!scroll || scroll.viewport.width < 1) return;
  const right = scroll.viewport.x + scroll.viewport.width;
  for (const child of scroll.getChildren()) {
    if (!(child instanceof TextRenderable)) continue;
    const available = Math.max(1, right - child.x);
    if (child.width !== available) child.width = available;
  }
}

export function Settings({
  root,
  snapshot,
  onRefresh,
  active = true,
}: {
  root: string;
  snapshot: Pick<ProjectSnapshot, "defaultSchema" | "schemas"> & {
    changes: readonly ChangeSummary[];
  };
  onRefresh: () => void;
  active?: boolean;
}) {
  const { width: terminalWidth, height: terminalHeight } =
    useTerminalDimensions();
  const renderer = useRenderer();
  const schemaNames = [
    ...new Set([
      ...listBundledSchemas(),
      ...snapshot.schemas.map((entry) => entry.name),
      snapshot.defaultSchema,
    ]),
  ].sort();
  const initialCursorKey = schemaNames[0] ? `schema:${schemaNames[0]}` : null;
  const [schema, setSchema] = useState(snapshot.defaultSchema);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [skillHostCatalog, setSkillHostCatalog] = useState<
    SkillInstallHostDescriptor[]
  >([]);
  const [checkedProfiles, setCheckedProfiles] = useState<string[]>([]);
  const [checkedChanges, setCheckedChanges] = useState<string[]>([]);
  const [checkedSkillHosts, setCheckedSkillHosts] = useState<
    SkillInstallHostId[]
  >([]);
  const [cursorKey, setCursorKey] = useState<string | null>(initialCursorKey);
  const [screen, setScreen] = useState<Screen>("stage");
  const [plan, setPlan] = useState<SwitchPreview | null>(null);
  const [applyResult, setApplyResult] = useState<SwitchApplyResult | null>(
    null,
  );
  const [recovery, setRecovery] = useState<SwitchRecovery | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(INITIAL_STAGE_NOTICE);
  const [catalog, setCatalog] = useState<Awaited<
    ReturnType<typeof listMcpCatalog>
  > | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [host, setHost] = useState<McpHost | null>(null);
  const [mcpPlan, setMcpPlan] = useState<McpInstallPreview | null>(null);
  const [mcpConfirm, setMcpConfirm] = useState<McpInstallPreview | null>(null);
  const approval = useRef<((approved: boolean) => void) | null>(null);
  const approvalOutcome = useRef<"approved" | "denied" | "canceled" | null>(
    null,
  );
  const activeRef = useRef(active);
  const cursorKeyRef = useRef<string | null>(initialCursorKey);
  const rowsViewport = useRef<ScrollBoxRenderable>(null);
  const reviewViewport = useRef<ScrollBoxRenderable>(null);
  activeRef.current = active;
  cursorKeyRef.current = cursorKey;
  const rows: Row[] = [
    ...schemaNames.map((id) => ({
      kind: "schema" as const,
      id,
      label: `Schema ${id}`,
    })),
    ...profiles.map(({ id, label }) => ({
      kind: "profile" as const,
      id,
      label: "Agent " + label + " (" + id + ")",
    })),
    ...snapshot.changes.map(({ name, schema: pinned }) => ({
      kind: "change" as const,
      id: name,
      label: "Migrate " + name + " (" + pinned + ")",
    })),
    ...SKILL_INSTALL_HOST_IDS.map((id) => ({
      kind: "skill-host" as const,
      id,
      label: `${skillInstallHostLabel(id)} skills`,
    })),
    ...(catalog?.providers ?? []).map(({ name }) => ({
      kind: "provider" as const,
      id: name,
      label: "MCP provider " + name,
    })),
    ...(catalog?.hosts ?? []).map(({ host: id }) => ({
      kind: "host" as const,
      id,
      label: "MCP host " + id,
    })),
  ];
  const foundCursor = rows.findIndex(
    (row) => `${row.kind}:${row.id}` === cursorKey,
  );
  const cursor = rows.length === 0 ? -1 : Math.max(0, foundCursor);
  const selectedRowLabel = rows[cursor]?.label ?? "";
  const focusedRow = rows[cursor];
  const selectedTarget = (() => {
    if (!focusedRow)
      return {
        identity: "No available choice",
        staging: "Not staged",
        action: "Wait for choices to load",
        destinations: ["Unavailable"] as string[],
        status: undefined as string | undefined,
      };
    const staged = (value: boolean) =>
      value ? "Staged for preview" : "Not staged";
    switch (focusedRow.kind) {
      case "schema": {
        const isCurrent = focusedRow.id === snapshot.defaultSchema;
        return {
          identity: focusedRow.label,
          staging: isCurrent
            ? "Selected · matches current default"
            : focusedRow.id === schema
              ? "Staged as default schema"
              : "Not staged",
          action: isCurrent
            ? "Keep the current default schema"
            : "Set default schema to " + focusedRow.id,
          destinations: [path.join(root, "openspec", "config.yaml")],
          status: undefined,
        };
      }
      case "profile": {
        const profile = profiles.find((item) => item.id === focusedRow.id);
        return {
          identity: focusedRow.label,
          staging: staged(checkedProfiles.includes(focusedRow.id)),
          action: profile
            ? "Preview installing this agent profile's skills"
            : "Load profile metadata before preview",
          destinations: [
            profile
              ? path.resolve(root, profile.target)
              : "Profile target unavailable",
          ],
          status: undefined,
        };
      }
      case "change":
        return {
          identity: focusedRow.label,
          staging: staged(checkedChanges.includes(focusedRow.id)),
          action:
            "Preview migration of " + focusedRow.id + " using schema " + schema,
          destinations: [
            path.join(
              root,
              "openspec",
              "changes",
              focusedRow.id,
              ".openspec.yaml",
            ),
            path.join(
              root,
              "openspec",
              "changes",
              focusedRow.id,
              ".opsx-provenance.json",
            ),
          ],
          status: undefined,
        };
      case "skill-host": {
        const descriptor = skillHostCatalog.find(
          (item) => item.host === focusedRow.id,
        );
        return {
          identity: focusedRow.label,
          staging: staged(
            isSkillInstallHostId(focusedRow.id) &&
              checkedSkillHosts.includes(focusedRow.id),
          ),
          action: descriptor
            ? descriptor.action + " skills for this host"
            : "Wait for host discovery before preview",
          destinations: [descriptor?.destination ?? "Unverified destination"],
          status: descriptor
            ? `${descriptor.discoverability} · ${descriptor.state} · trust ${descriptor.trust}${descriptor.trustNote ? ` · ${descriptor.trustNote}` : ""}${descriptor.reason ? ` · ${descriptor.reason}` : ""}`
            : "Discovery pending",
        };
      }
      case "provider": {
        const item = catalog?.providers.find(
          (entry) => entry.name === focusedRow.id,
        );
        return {
          identity: item ? item.name + " · " + item.url : focusedRow.label,
          staging: "Preview selection only",
          action:
            "Preview provider settings; installation needs separate approval",
          destinations: ["Resolved by the selected MCP host during preview"],
          status: item
            ? (item.permissions.readOnly ? "Read-only" : "Write access") +
              " · approval remains separate"
            : "Provider metadata unavailable",
        };
      }
      case "host": {
        const item = catalog?.hosts.find(
          (entry) => entry.host === focusedRow.id,
        );
        return {
          identity: focusedRow.label,
          staging: "Preview selection only",
          action: "Preview this host; installation needs separate approval",
          destinations: [
            "Resolved by the selected MCP provider during preview",
          ],
          status: item
            ? `${item.installMode}${item.prerequisite ? ` · needs ${item.prerequisite}` : ""}${item.diagnostic ? ` · ${item.diagnostic.message}` : ""} · approval remains separate`
            : "Host metadata unavailable",
        };
      }
    }
  })();

  useEffect(() => {
    if (rows.length > 0 && (cursorKey === null || foundCursor < 0)) {
      const first = rows[0]!;
      const key = `${first.kind}:${first.id}`;
      cursorKeyRef.current = key;
      setCursorKey(key);
    }
  }, [rows.length, cursorKey, foundCursor]);

  useEffect(() => {
    if (screen !== "stage" || !active) return;
    if (!rows[cursor]) return;
    const rowId = "settings-row-" + cursor;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const keepSelectedRowVisible = () => {
      const viewport = rowsViewport.current;
      const child = viewport?.content.findDescendantById(rowId);
      if (viewport && child) viewport.scrollChildIntoView(rowId);
      if (++attempt < 5) timer = setTimeout(keepSelectedRowVisible, 16);
    };
    keepSelectedRowVisible();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [
    active,
    cursor,
    rows.length,
    screen,
    selectedRowLabel,
    selectedTarget.action,
    selectedTarget.destinations.join("\n"),
    selectedTarget.staging,
    selectedTarget.status,
    terminalHeight,
    terminalWidth,
  ]);

  useEffect(() => {
    reviewViewport.current?.scrollTo({ x: 0, y: 0 });
  }, [screen]);

  useEffect(() => {
    if (!active || screen === "stage") return;
    const settleReview = () => fitReviewText(reviewViewport.current);
    settleReview();
    renderer.on("frame", settleReview);
    return () => {
      renderer.off("frame", settleReview);
    };
  }, [active, renderer, screen]);

  useEffect(() => {
    let alive = true;
    loadAgentProfiles()
      .then((loaded) => {
        if (alive) setProfiles(loaded);
      })
      .catch((error) => {
        if (alive)
          setNotice(error instanceof Error ? error.message : String(error));
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    discoverSkillInstallHosts(root)
      .then((found) => {
        if (alive) setSkillHostCatalog([...found]);
      })
      .catch((error) => {
        if (alive)
          setNotice(
            `Skill host discovery failed: ${error instanceof Error ? error.message : String(error)}`,
          );
      });
    return () => {
      alive = false;
    };
  }, [root]);

  useEffect(() => {
    let alive = true;
    inspectRecovery(root)
      .then((found) => {
        if (!alive || found.status === "none") return;
        setRecovery(found);
        setScreen("result");
      })
      .catch((error) => {
        if (alive)
          setNotice(
            `Recovery inspection failed: ${error instanceof Error ? error.message : String(error)}`,
          );
      });
    return () => {
      alive = false;
    };
  }, [root]);

  useEffect(() => {
    let alive = true;
    setCatalog(null);
    setProvider(null);
    setHost(null);
    setMcpPlan(null);
    const installed = snapshot.schemas.find((entry) => entry.name === schema);
    const source = installed
      ? resolveSchema(new OpenSpecClient(root), schema).then(
          (entry) => entry.path,
        )
      : inspectBundledSchema(schema).then((entry) => entry.sourceDirectory);
    source
      .then((schemaDir) => listMcpCatalog({ schemaDir, targetDir: root }))
      .then((found) => {
        if (alive) setCatalog(found);
      })
      .catch((error) => {
        if (alive)
          setNotice(
            error instanceof OpsxError && error.code === "MCP_CATALOG_NOT_FOUND"
              ? "This schema declares no MCP provider catalog."
              : `MCP catalog: ${error instanceof Error ? error.message : String(error)}`,
          );
      });
    return () => {
      alive = false;
    };
  }, [root, schema, snapshot.schemas]);

  useEffect(() => {
    if (active) return;
    if (approval.current) {
      approvalOutcome.current = "canceled";
      approval.current(false);
      approval.current = null;
    }
    setMcpConfirm(null);
    setScreen("stage");
  }, [active]);

  useEffect(
    () => () => {
      if (approval.current) {
        approvalOutcome.current = "canceled";
        approval.current(false);
        approval.current = null;
      }
    },
    [],
  );

  function invalidate() {
    setPlan(null);
    setMcpPlan(null);
    setScreen("stage");
    setNotice("Selection changed; preview again before any Apply.");
  }

  function toggle() {
    const key = cursorKeyRef.current;
    if (!key) return;
    const separator = key.indexOf(":");
    if (separator < 0) return;
    const kind = key.slice(0, separator);
    const id = key.slice(separator + 1);
    invalidate();
    if (kind === "schema") setSchema(id);
    if (kind === "profile")
      setCheckedProfiles((current) =>
        current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id],
      );
    if (kind === "change")
      setCheckedChanges((current) =>
        current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id],
      );
    if (kind === "skill-host" && isSkillInstallHostId(id))
      setCheckedSkillHosts((current) =>
        current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id],
      );
    if (kind === "provider") setProvider(id);
    if (kind === "host") setHost(id as McpHost);
  }

  function request() {
    return {
      schema,
      profiles: checkedProfiles,
      migrations: checkedChanges,
      skillHosts: checkedSkillHosts,
    };
  }

  async function inspect() {
    const staged = request();
    setBusy(true);
    setPlan(null);
    setScreen("schema-preview");
    setNotice("Building a read-only schema preview...");
    try {
      const result = await preview(root, staged);
      setPlan(result);
      setNotice(
        result.noOp
          ? "No pending changes; Apply is disabled."
          : result.canApply
            ? "Preview ready; review exact effects, then press a for separate Apply confirmation."
            : "Preview refused; resolve the listed diagnostics before applying.",
      );
    } catch (error) {
      setPlan(null);
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!plan || !plan.canApply || plan.noOp) return;
    const reviewed = plan;
    setBusy(true);
    setNotice("Applying the reviewed selection...");
    try {
      const result = await apply(root, reviewed.request, reviewed.token);
      setApplyResult(result);
      setRecovery(result.recovery);
      setPlan(null);
      setScreen("result");
      setNotice(
        result.status === "partial"
          ? "Apply stopped before completion; inspect each target and recovery steps."
          : "Observed Apply results by target. Esc returns to selections.",
      );
      onRefresh();
    } catch (error) {
      setPlan(null);
      setApplyResult(null);
      setScreen("result");
      setNotice(
        `Apply did not complete: ${error instanceof Error ? error.message : String(error)}`,
      );
      try {
        const found = await inspectRecovery(root);
        setRecovery(found.status === "complete" ? null : found);
      } catch {
        setRecovery(null);
      }
      onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function providerOptions() {
    const installed = snapshot.schemas.find((entry) => entry.name === schema);
    const schemaDir = installed
      ? (await resolveSchema(new OpenSpecClient(root), schema)).path
      : (await inspectBundledSchema(schema)).sourceDirectory;
    if (!provider || !host)
      throw new Error("Select one declared MCP provider and host first.");
    return { schemaDir, providerName: provider, host, targetDir: root };
  }

  async function inspectProvider() {
    setBusy(true);
    setMcpPlan(null);
    setScreen("mcp-preview");
    setNotice("Building a read-only MCP provider preview...");
    try {
      const result = await previewMcpInstall(await providerOptions());
      setMcpPlan(result);
      setNotice(
        result.installMode !== "config"
          ? "This host needs its prerequisite or guided setup; no automatic install is available."
          : result.changed
            ? "MCP preview ready; press i to request separate interactive provider approval."
            : "Provider is already installed; no write is needed.",
      );
    } catch (error) {
      setMcpPlan(null);
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function commitProvider() {
    const reviewed = mcpPlan;
    if (!reviewed || !reviewed.changed || reviewed.installMode !== "config")
      return;
    let stale = false;
    approvalOutcome.current = null;
    setBusy(true);
    setNotice(
      "Waiting for the install operation to re-check the exact preview...",
    );
    try {
      const result = await installMcpProvider({
        ...(await providerOptions()),
        approve: (fresh) => {
          if (JSON.stringify(fresh) !== JSON.stringify(reviewed)) {
            stale = true;
            return false;
          }
          return new Promise<boolean>((resolve) => {
            approval.current = resolve;
            setMcpConfirm(fresh);
            if (activeRef.current) setScreen("provider-approval");
          });
        },
      });
      setMcpPlan(null);
      if (stale) {
        setNotice(
          "Provider target changed after preview; review a new preview before approving.",
        );
        if (activeRef.current) setScreen("mcp-preview");
      } else if (result.status === "denied") {
        setNotice(
          approvalOutcome.current === "canceled"
            ? "MCP install canceled; no changes made."
            : "MCP install denied; no changes made.",
        );
        if (activeRef.current) setScreen("stage");
      } else {
        setNotice(
          `MCP install ${result.status}: ${result.preview.provider.name} for ${result.preview.host} at ${result.preview.configPath ?? result.preview.hostPath}.`,
        );
        if (activeRef.current) setScreen("stage");
      }
      onRefresh();
    } catch (error) {
      setMcpPlan(null);
      setNotice(error instanceof Error ? error.message : String(error));
      if (activeRef.current) setScreen("stage");
    } finally {
      setBusy(false);
      setMcpConfirm(null);
      approval.current = null;
      approvalOutcome.current = null;
    }
  }

  function stagedReviewLines(): string[] {
    const profileLines = checkedProfiles.map((id) => {
      const selected = profiles.find((item) => item.id === id);
      return selected
        ? `- ${selected.label} (${id}) → ${selected.target}`
        : `- ${id} (profile target unavailable)`;
    });
    const selectedProvider = catalog?.providers.find(
      (item) => item.name === provider,
    );
    const selectedHost = catalog?.hosts.find((item) => item.host === host);
    return [
      "Staged selections only; no project changes have been written.",
      `Default schema target: ${schema}`,
      "Agent profiles:",
      ...(profileLines.length ? profileLines : ["- none"]),
      "Migrations:",
      ...(checkedChanges.length
        ? checkedChanges.map((name) => `- ${name}`)
        : ["- none"]),
      "Skill-install hosts (separate from agent profiles):",
      ...(checkedSkillHosts.length
        ? checkedSkillHosts.map((id) => {
            const target = skillHostCatalog.find((entry) => entry.host === id);
            return `- ${id.toUpperCase()}: ${target?.destination ?? "unverified destination"}; ${target?.discoverability ?? "discovery pending"}; ${target?.action ?? "blocked"}; trust ${target?.trust ?? "unknown"}${target?.trustNote ? `; ${target.trustNote}` : ""}${target?.reason ? ` (${target.reason})` : ""}`;
          })
        : ["- none"]),
      `MCP provider: ${selectedProvider ? `${selectedProvider.name} (${selectedProvider.url})` : "none"}`,
      `MCP host: ${selectedHost ? `${selectedHost.host} (${selectedHost.installMode})` : "none"}`,
      "MCP selection is for preview only; installation needs a separate provider approval.",
    ];
  }

  function reviewLines(): string[] {
    if (screen === "result") return resultLines(applyResult, recovery);
    if (screen === "staged-review") return stagedReviewLines();
    if (screen === "schema-preview" || screen === "apply-confirm") {
      return plan
        ? [
            ...(screen === "apply-confirm"
              ? ["Apply confirmation — exact effects to write:"]
              : ["Schema preview — read only:"]),
            ...switchPreviewLines(plan, profiles),
            ...(screen === "apply-confirm"
              ? [
                  "Press y only after reviewing this exact plan; n or Esc makes no changes.",
                ]
              : []),
          ]
        : ["No schema preview is available."];
    }
    if (screen === "mcp-preview" || screen === "provider-approval") {
      const reviewed = screen === "provider-approval" ? mcpConfirm : mcpPlan;
      return reviewed
        ? [
            ...(screen === "provider-approval"
              ? [
                  "PROVIDER APPROVAL — this is a distinct, interactive consent step.",
                ]
              : ["MCP provider preview — read only:"]),
            ...mcpPreviewLines(reviewed, root),
            ...(screen === "provider-approval"
              ? [
                  "Press y to approve this exact provider change; n or Esc denies without writing.",
                ]
              : []),
          ]
        : ["No MCP preview is available."];
    }
    return [];
  }

  function scrollReview(amount: number) {
    const viewport = reviewViewport.current;
    if (!viewport) return;
    viewport.scrollBy({ x: 0, y: amount });
  }

  useKeyboard((event) => {
    if (!active) return;

    if (screen === "provider-approval") {
      if (event.name === "y" || event.name === "n" || event.name === "escape") {
        const approved = event.name === "y";
        approvalOutcome.current = approved
          ? "approved"
          : event.name === "escape"
            ? "canceled"
            : "denied";
        approval.current?.(approved);
        approval.current = null;
        setMcpConfirm(null);
        setScreen("mcp-preview");
      } else if (event.name === "up" || event.name === "k") scrollReview(-1);
      else if (event.name === "down" || event.name === "j") scrollReview(1);
      else if (event.name === "pageup")
        scrollReview(
          -Math.max(1, reviewViewport.current?.viewport.height ?? 1),
        );
      else if (event.name === "pagedown")
        scrollReview(Math.max(1, reviewViewport.current?.viewport.height ?? 1));
      return;
    }
    if (busy) return;
    if (screen === "result") {
      if (event.name === "escape") setScreen("stage");
      else if (event.name === "up" || event.name === "k") scrollReview(-1);
      else if (event.name === "down" || event.name === "j") scrollReview(1);
      else if (event.name === "pageup")
        scrollReview(
          -Math.max(1, reviewViewport.current?.viewport.height ?? 1),
        );
      else if (event.name === "pagedown")
        scrollReview(Math.max(1, reviewViewport.current?.viewport.height ?? 1));
      return;
    }
    if (screen === "apply-confirm") {
      if (event.name === "y") void commit();
      else if (event.name === "n" || event.name === "escape") {
        setScreen("schema-preview");
        setNotice("Apply canceled; no changes made.");
      } else if (event.name === "up" || event.name === "k") scrollReview(-1);
      else if (event.name === "down" || event.name === "j") scrollReview(1);
      else if (event.name === "pageup")
        scrollReview(
          -Math.max(1, reviewViewport.current?.viewport.height ?? 1),
        );
      else if (event.name === "pagedown")
        scrollReview(Math.max(1, reviewViewport.current?.viewport.height ?? 1));
      return;
    }
    if (screen === "schema-preview") {
      if (event.name === "a" && plan?.canApply && !plan.noOp)
        setScreen("apply-confirm");
      else if (event.name === "escape") setScreen("stage");
      else if (event.name === "up" || event.name === "k") scrollReview(-1);
      else if (event.name === "down" || event.name === "j") scrollReview(1);
      else if (event.name === "pageup")
        scrollReview(
          -Math.max(1, reviewViewport.current?.viewport.height ?? 1),
        );
      else if (event.name === "pagedown")
        scrollReview(Math.max(1, reviewViewport.current?.viewport.height ?? 1));
      return;
    }
    if (screen === "mcp-preview") {
      if (
        event.name === "i" &&
        mcpPlan?.changed &&
        mcpPlan.installMode === "config"
      )
        void commitProvider();
      else if (event.name === "escape") setScreen("stage");
      else if (event.name === "up" || event.name === "k") scrollReview(-1);
      else if (event.name === "down" || event.name === "j") scrollReview(1);
      else if (event.name === "pageup")
        scrollReview(
          -Math.max(1, reviewViewport.current?.viewport.height ?? 1),
        );
      else if (event.name === "pagedown")
        scrollReview(Math.max(1, reviewViewport.current?.viewport.height ?? 1));
      return;
    }
    if (screen === "staged-review") {
      if (event.name === "escape") setScreen("stage");
      else if (event.name === "up" || event.name === "k") scrollReview(-1);
      else if (event.name === "down" || event.name === "j") scrollReview(1);
      else if (event.name === "pageup")
        scrollReview(
          -Math.max(1, reviewViewport.current?.viewport.height ?? 1),
        );
      else if (event.name === "pagedown")
        scrollReview(Math.max(1, reviewViewport.current?.viewport.height ?? 1));
      return;
    }
    if (event.name === "up" || event.name === "k") {
      const found = rows.findIndex(
        (row) => `${row.kind}:${row.id}` === cursorKeyRef.current,
      );
      const row = rows[Math.max(0, (found < 0 ? cursor : found) - 1)];
      if (row) {
        const key = `${row.kind}:${row.id}`;
        cursorKeyRef.current = key;
        setCursorKey(key);
      }
    } else if (event.name === "down" || event.name === "j") {
      const found = rows.findIndex(
        (row) => `${row.kind}:${row.id}` === cursorKeyRef.current,
      );
      const row =
        rows[Math.min(rows.length - 1, (found < 0 ? cursor : found) + 1)];
      if (row) {
        const key = `${row.kind}:${row.id}`;
        cursorKeyRef.current = key;
        setCursorKey(key);
      }
    } else if (
      event.name === "space" ||
      event.name === "return" ||
      event.name === "enter"
    )
      toggle();
    else if (event.name === "r") setScreen("staged-review");
    else if (event.name === "p") void inspect();
    else if (event.name === "m") void inspectProvider();
  });

  const hints: Record<Screen, string> = {
    stage:
      "Up/Down or j/k move · Space/Enter stage · r review · p preview · m MCP preview",
    "staged-review": "Up/Down scroll · Esc back to selections",
    "schema-preview":
      plan?.canApply && !plan.noOp
        ? "Up/Down scroll · a review Apply confirmation · Esc back"
        : "Up/Down scroll · Esc back to selections",
    "apply-confirm": "y apply · n/Esc cancel without writing · Up/Down scroll",
    result: "Up/Down scroll observed targets · Esc back to selections",
    "mcp-preview":
      mcpPlan?.changed && mcpPlan.installMode === "config"
        ? "Up/Down scroll · i request separate provider approval · Esc back"
        : "Up/Down scroll · Esc back to selections",
    "provider-approval":
      "y approve exact MCP write · n/Esc deny without writing · Up/Down scroll",
  };
  const content = reviewLines();
  const currentHint =
    terminalWidth < 75
      ? (
          {
            stage: "j/k select · Space stage · r review · p preview · m MCP",
            "staged-review": "j/k scroll · Esc selections",
            "schema-preview":
              plan?.canApply && !plan.noOp
                ? "j/k scroll · a confirm · Esc back"
                : "j/k scroll · Esc back",
            "apply-confirm": "y Apply · n/Esc cancel · j/k scroll",
            result: "j/k scroll targets · Esc selections",
            "mcp-preview": "j/k scroll · i provider approval · Esc back",
            "provider-approval": "y approve provider · n/Esc deny · j/k scroll",
          } satisfies Record<Screen, string>
        )[screen]
      : hints[screen];

  const reviewSurface = screen === "stage" ? null : REVIEW_SURFACES[screen];
  const wide = terminalWidth >= 90;
  const headingContext =
    reviewSurface?.title ?? (wide ? "STAGE · schema " + schema : "STAGE");
  const stageSummary =
    "P " +
    checkedProfiles.length +
    " · Migrations " +
    checkedChanges.length +
    " · H " +
    checkedSkillHosts.length;
  const compactStaging = selectedTarget.staging
    .replace("Staged for preview", "Staged")
    .replace("Staged as default schema", "Staged")
    .replace("Selected · matches current default", "Current default");
  const compactIdentity =
    focusedRow?.kind === "change"
      ? "Migrate " + focusedRow.id
      : focusedRow?.kind === "provider"
        ? "MCP " + focusedRow.id
        : focusedRow?.kind === "host"
          ? "MCP host " + focusedRow.id
          : (focusedRow?.label ?? "none");
  const compactAction =
    focusedRow?.kind === "schema"
      ? focusedRow.id === snapshot.defaultSchema
        ? "keep schema"
        : "set schema"
      : focusedRow?.kind === "profile"
        ? "profile preview"
        : focusedRow?.kind === "change"
          ? "migrate"
          : focusedRow?.kind === "skill-host"
            ? (skillHostCatalog.find((item) => item.host === focusedRow.id)
                ?.action ?? "discover") + " host"
            : focusedRow?.kind === "provider"
              ? "MCP preview"
              : focusedRow?.kind === "host"
                ? "host preview"
                : "wait for choices";
  const routineNarrowPreviewNotice =
    terminalWidth < 75 &&
    (screen === "schema-preview" || screen === "mcp-preview") &&
    [
      "Preview ready;",
      "No pending changes;",
      "MCP preview ready;",
      "Provider is already installed;",
    ].some((prefix) => notice.startsWith(prefix));
  const staleConfirmationNotice =
    screen === "apply-confirm" && notice.startsWith("Preview ready;");
  const showNotice =
    notice !== INITIAL_STAGE_NOTICE &&
    !routineNarrowPreviewNotice &&
    !staleConfirmationNotice;
  const noticeText =
    screen === "staged-review" && notice.startsWith("Preview ready;")
      ? "Esc to selections, then p for exact effects; a opens Apply confirmation from preview."
      : notice;
  const compactWidth = Math.max(1, terminalWidth - 4);
  const reviewWidth = Math.max(1, terminalWidth - 8);
  const hintRows = wrappedRows([currentHint], compactWidth);
  const noticeRows = showNotice ? wrappedRows([noticeText], compactWidth) : 0;
  const maxReviewHeight = Math.max(
    5,
    terminalHeight -
      (terminalWidth < 75 ? 7 : 8) -
      2 -
      1 -
      hintRows -
      noticeRows,
  );
  const resultSummary = screen === "result" ? content[0] : undefined;
  const reviewBody = screen === "result" ? content.slice(1) : content;
  const naturalReviewHeight = 3 + wrappedRows(content, reviewWidth);
  const reviewIsBounded =
    screen === "result" || naturalReviewHeight <= maxReviewHeight;
  const reviewPanelHeight =
    screen === "result"
      ? Math.min(
          maxReviewHeight,
          3 +
            wrappedRows(resultSummary ? [resultSummary] : [], reviewWidth) +
            Math.max(1, wrappedRows(reviewBody, reviewWidth)),
        )
      : naturalReviewHeight;
  const targetContextLines = [
    "Focused: " + selectedTarget.identity,
    "STAGING",
    selectedTarget.staging,
    ...(selectedTarget.status ? ["Status: " + selectedTarget.status] : []),
    "ACTION",
    selectedTarget.action,
    "DESTINATION",
    ...selectedTarget.destinations,
  ];
  const targetContextWidth = Math.max(1, Math.floor(terminalWidth * 0.43) - 4);
  const targetContextHeight =
    3 + wrappedRows(targetContextLines, targetContextWidth);

  return (
    <box
      flexDirection="column"
      width="100%"
      flexBasis={0}
      flexGrow={1}
      minHeight={0}
      padding={wide ? 1 : 0}
    >
      <ViewHeading title="SETTINGS" context={headingContext} />
      {screen === "stage" &&
        (wide ? (
          <box
            flexDirection="row"
            gap={1}
            width="100%"
            flexBasis={0}
            flexGrow={1}
            flexShrink={1}
            minHeight={0}
          >
            <box
              flexBasis={0}
              flexGrow={55}
              flexShrink={1}
              minWidth={0}
              minHeight={0}
            >
              <SectionPanel
                title="CHOICES"
                state={stageSummary}
                tone="accent"
                grow
              >
                <scrollbox
                  id="settings-rows"
                  ref={rowsViewport}
                  width="100%"
                  flexBasis={0}
                  flexGrow={1}
                  flexShrink={1}
                  minHeight={0}
                  viewportCulling={false}
                >
                  {rows.map((row, index) => {
                    const selected =
                      row.kind === "schema"
                        ? schema === row.id
                        : row.kind === "profile"
                          ? checkedProfiles.includes(row.id)
                          : row.kind === "change"
                            ? checkedChanges.includes(row.id)
                            : row.kind === "skill-host"
                              ? isSkillInstallHostId(row.id) &&
                                checkedSkillHosts.includes(row.id)
                              : row.kind === "provider"
                                ? provider === row.id
                                : host === row.id;
                    return (
                      <Fragment key={row.kind + ":" + row.id}>
                        {(index === 0 ||
                          rows[index - 1]?.kind !== row.kind) && (
                          <SectionHeading title={GROUP_NAMES[row.kind]} />
                        )}
                        <SelectableRow
                          id={"settings-row-" + index}
                          label={row.label}
                          focused={index === cursor}
                          selected={selected}
                        />
                      </Fragment>
                    );
                  })}
                </scrollbox>
              </SectionPanel>
            </box>
            <box
              flexBasis={0}
              flexGrow={43}
              flexShrink={1}
              minWidth={0}
              minHeight={0}
            >
              <SectionPanel
                title="SELECTED TARGET"
                state="NO WRITES"
                tone="accent"
                height={targetContextHeight}
              >
                <text
                  flexShrink={0}
                  id="settings-focused-row"
                  wrapMode="word"
                  content={"Focused: " + (focusedRow?.label ?? "none")}
                />
                <SectionHeading title="STAGING" />
                <text
                  flexShrink={0}
                  wrapMode="word"
                  content={selectedTarget.staging}
                />
                {selectedTarget.status && (
                  <text
                    flexShrink={0}
                    wrapMode="word"
                    content={"Status: " + selectedTarget.status}
                  />
                )}
                <SectionHeading title="ACTION" />
                <text
                  flexShrink={0}
                  wrapMode="word"
                  content={selectedTarget.action}
                />
                <SectionHeading title="DESTINATION" />
                {selectedTarget.destinations.map((destination, index) => (
                  <text
                    key={index}
                    width="100%"
                    flexShrink={0}
                    wrapMode="char"
                    content={destination}
                  />
                ))}
              </SectionPanel>
            </box>
          </box>
        ) : (
          <>
            <text
              flexShrink={0}
              id="settings-focused-row"
              wrapMode="word"
              content={
                (focusedRow?.kind === "skill-host" ? "Focused: " : "") +
                compactIdentity
              }
            />
            <text
              flexShrink={0}
              wrapMode="word"
              content={
                compactStaging + " · " + compactAction + " · p for exact paths"
              }
            />
            <SectionPanel
              title="CHOICES"
              state={
                "STAGED · Migrations " + checkedChanges.length + " · NO WRITES"
              }
              tone="accent"
              grow
            >
              <scrollbox
                id="settings-rows"
                ref={rowsViewport}
                width="100%"
                flexBasis={0}
                flexGrow={1}
                flexShrink={1}
                minHeight={0}
                viewportCulling={false}
              >
                {rows.map((row, index) => {
                  const selected =
                    row.kind === "schema"
                      ? schema === row.id
                      : row.kind === "profile"
                        ? checkedProfiles.includes(row.id)
                        : row.kind === "change"
                          ? checkedChanges.includes(row.id)
                          : row.kind === "skill-host"
                            ? isSkillInstallHostId(row.id) &&
                              checkedSkillHosts.includes(row.id)
                            : row.kind === "provider"
                              ? provider === row.id
                              : host === row.id;
                  return (
                    <Fragment key={row.kind + ":" + row.id}>
                      {(index === 0 || rows[index - 1]?.kind !== row.kind) && (
                        <SectionHeading title={GROUP_NAMES[row.kind]} />
                      )}
                      <SelectableRow
                        id={"settings-row-" + index}
                        label={row.label}
                        focused={index === cursor}
                        selected={selected}
                      />
                    </Fragment>
                  );
                })}
              </scrollbox>
            </SectionPanel>
          </>
        ))}
      {screen !== "stage" && reviewSurface && (
        <box
          width="100%"
          height={reviewIsBounded ? reviewPanelHeight : undefined}
          flexBasis={reviewIsBounded ? undefined : 0}
          flexGrow={reviewIsBounded ? 0 : 1}
          flexShrink={reviewIsBounded ? 0 : 1}
          minHeight={0}
        >
          <ReviewPanel
            title={reviewSurface.title}
            state={reviewSurface.state}
            tone={reviewSurface.tone}
          >
            {resultSummary !== undefined && (
              <text
                width="100%"
                flexShrink={0}
                wrapMode="word"
                fg={tuiTextColor("accent")}
                content={resultSummary}
              />
            )}
            <scrollbox
              ref={reviewViewport}
              width="100%"
              flexBasis={0}
              flexGrow={1}
              flexShrink={1}
              minHeight={0}
            >
              {reviewBody.map((line, index) => (
                <text
                  key={index}
                  width="100%"
                  wrapMode="word"
                  fg={
                    line.startsWith("Applied |")
                      ? tuiTextColor("success")
                      : line.startsWith("Blocked |") ||
                          line.startsWith("Recovery Needed |")
                        ? tuiTextColor("error")
                        : line.startsWith("Changed Since Apply |") ||
                            line.startsWith("Verification Needed |")
                          ? tuiTextColor("pending")
                          : line.endsWith(":") ||
                              line.startsWith("Overall:") ||
                              line.startsWith("NEXT ACTIONS")
                            ? tuiTextColor("accent")
                            : undefined
                  }
                  content={line}
                />
              ))}
            </scrollbox>
          </ReviewPanel>
        </box>
      )}
      {showNotice && (
        <text flexShrink={0} wrapMode="word" content={noticeText} />
      )}
      <ActionHint>{currentHint}</ActionHint>
    </box>
  );
}
