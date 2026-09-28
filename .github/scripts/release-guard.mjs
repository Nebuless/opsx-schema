import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const REQUIRED_CHECKS = [
  "Commit history",
  "Quality",
  "Application tests",
  "Resource checks",
  "Package distribution smoke",
];

const CI_WORKFLOW_PATH = ".github/workflows/ci.yml";
const TRUSTED_APP = "github-actions";
const PROTECTED_BRANCH = "main";
const COMPLETED = "completed";
const SUCCESS = "success";
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const PACKAGE_NAME = "opsx-schema";
const REQUIRED_PACKED_FILES = [
  "package.json",
  "LICENSE",
  "src/domain/cli.ts",
  "assets/schemas/manifest.json",
  "assets/adapters/manifest.json",
  "resources/openspec/schemas/intent-driven-design/schema.yaml",
];
const FORBIDDEN_PACKED_PATHS = [
  "CHANGELOG.md",
  "openspec/changes",
  "resources/openspec/changes",
  "resources/openspec/specs",
];
const PROVENANCE_TYPE = "https://slsa.dev/provenance/v1";
const PUBLISH_TYPE = "https://github.com/npm/attestation/tree/main/specs/publish/v0.1";
const SOURCE_REPOSITORY = "https://github.com/Nebuless/opsx-schema";
const RELEASE_WORKFLOW = ".github/workflows/release.yml";

export function assertCurrentProtectedMain(branch, releaseSha) {
  if (!SHA_PATTERN.test(releaseSha)) {
    throw new Error("Release SHA must be an exact 40-character commit ID");
  }
  if (
    branch.name !== PROTECTED_BRANCH ||
    branch.protected !== true ||
    branch.commit?.sha !== releaseSha
  ) {
    throw new Error("Release commit must be the current protected main tip");
  }
}

function latestAttempt(attempts, startedField) {
  return attempts
    .map((record) => {
      const started = record[startedField] ?? record.created_at;
      const timestamp = Date.parse(started);
      if (!Number.isFinite(timestamp) || !Number.isInteger(record.id)) {
        throw new Error("CI attempt has an invalid start time or run ID");
      }
      return { record, timestamp };
    })
    .toSorted(
      (left, right) =>
        right.timestamp - left.timestamp ||
        (right.record.run_attempt ?? 0) - (left.record.run_attempt ?? 0) ||
        right.record.id - left.record.id,
    )[0].record;
}

export function assertRequiredChecks(checkPages, workflowPages, releaseSha) {
  const trustedRuns = workflowPages
    .flatMap((page) => page.workflow_runs)
    .filter(
      (run) =>
        run.path?.split("@")[0] === CI_WORKFLOW_PATH &&
        run.head_sha === releaseSha &&
        run.head_branch === PROTECTED_BRANCH &&
        run.event === "push",
    );
  if (trustedRuns.length === 0) {
    throw new Error("No trusted CI workflow run exists for the release commit");
  }
  const latestWorkflow = latestAttempt(trustedRuns, "run_started_at");
  if (
    latestWorkflow.status !== COMPLETED ||
    latestWorkflow.conclusion !== SUCCESS ||
    !Number.isInteger(latestWorkflow.check_suite_id)
  ) {
    throw new Error("Latest trusted CI workflow attempt did not succeed");
  }

  const trustedChecks = checkPages
    .flatMap((page) => page.check_runs)
    .filter(
      (check) =>
        check.head_sha === releaseSha &&
        check.app?.slug === TRUSTED_APP &&
        check.check_suite?.id === latestWorkflow.check_suite_id,
    );
  for (const name of REQUIRED_CHECKS) {
    const attempts = trustedChecks.filter((check) => check.name === name);
    if (attempts.length === 0) {
      throw new Error(`Missing trusted required CI check: ${name}`);
    }
    const latest = latestAttempt(attempts, "started_at");
    if (latest.status !== COMPLETED || latest.conclusion !== SUCCESS) {
      throw new Error(`Latest required CI check did not succeed: ${name}`);
    }
  }
}

export function assertProtectedReleaseEnvironment(environment) {
  const requiredReviewers = environment.protection_rules?.find(
    (rule) => rule.type === "required_reviewers" && rule.reviewers?.length > 0,
  );
  if (
    environment.name !== "npm-release" ||
    environment.deployment_branch_policy?.protected_branches !== true ||
    environment.deployment_branch_policy?.custom_branch_policies !== false ||
    !requiredReviewers
  ) {
    throw new Error("npm-release environment needs required reviewers and protected-branch deployment");
  }
}

export function assertReleaseMetadata(environment, packageManifest, changelog) {
  const version = environment.EXPECTED_VERSION;
  if (!VERSION_PATTERN.test(version)) {
    throw new Error("Expected version must be an exact semantic version");
  }
  if (environment.RELEASE_BRANCH !== PROTECTED_BRANCH) {
    throw new Error("Release must run from protected main");
  }
  if (environment.REQUESTED_TAG !== `v${version}`) {
    throw new Error("Requested tag must match the expected version");
  }
  if (packageManifest.name !== PACKAGE_NAME || packageManifest.version !== version) {
    throw new Error("Package name and version must match the requested release");
  }

  const visibleChangelog = changelog.replace(/<!--[\s\S]*?(?:-->|$)/g, "");
  const headings = [...visibleChangelog.matchAll(/^## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})\s*$/gm)];
  const matching = headings.filter((heading) => heading[1] === version);
  if (matching.length !== 1) {
    throw new Error("CHANGELOG.md needs exactly one dated matching version entry");
  }
  const heading = matching[0];
  const date = heading[2];
  if (Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new Error("CHANGELOG.md version entry has an invalid ISO date");
  }
  const sectionStart = heading.index + heading[0].length;
  const nextHeading = visibleChangelog.slice(sectionStart).search(/^## /m);
  const section = visibleChangelog.slice(
    sectionStart,
    nextHeading === -1 ? undefined : sectionStart + nextHeading,
  );
  const hasNote = section.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    if (!trimmed || /^#{1,6}\s/.test(trimmed)) {
      return false;
    }
    const listText = trimmed.replace(/^(?:[-*+]\s*|\d+\.\s*)/, "").trim();
    if (/^\[ \](?:\s|$)/.test(listText)) {
      return false;
    }
    const note = listText.replace(/^\[[xX]\]\s*/, "").trim();
    return Boolean(note && !/^#{1,6}\s/.test(note) && !/^(?:TODO|TBD|TBA|placeholder|coming soon|none|n\/a)\b/i.test(note));
  });
  if (!hasNote) {
    throw new Error("CHANGELOG.md version entry needs substantive release notes");
  }
}

export function assertTagUnused(remoteTags, requestedTag) {
  if (remoteTags.trim()) {
    throw new Error(`Release tag already exists: ${requestedTag}`);
  }
}

export function assertRegistryVersionUnused(registryLookup, version) {
  if (registryLookup.status === 0) {
    throw new Error(`Package version already exists on npm: ${version}`);
  }
  if (/^npm error code E404\s*$/m.test(registryLookup.stderr)) {
    return;
  }
  throw new Error(`npm registry lookup failed for ${version}; availability is unverified`);
}

export function assertPackedFiles(packages, version) {
  const entries = Array.isArray(packages) ? packages : [packages?.[PACKAGE_NAME]];
  if (
    entries.length !== 1 ||
    entries[0]?.name !== PACKAGE_NAME ||
    entries[0]?.version !== version ||
    !Array.isArray(entries[0]?.files)
  ) {
    throw new Error("Packed package name, version, or inventory is invalid");
  }
  const files = new Set(entries[0].files.map((file) => file.path));
  for (const required of REQUIRED_PACKED_FILES) {
    if (!files.has(required)) {
      throw new Error(`Missing packed file: ${required}`);
    }
  }
  for (const forbidden of FORBIDDEN_PACKED_PATHS) {
    if ([...files].some((file) => file === forbidden || file.startsWith(`${forbidden}/`))) {
      throw new Error(`Unexpected packed file: ${forbidden}`);
    }
  }
}

export function assertPublishedVersion(registryVersion, expectedVersion) {
  const versions = Array.isArray(registryVersion) ? registryVersion : [registryVersion];
  if (versions.length !== 1 || versions[0] !== expectedVersion) {
    throw new Error(`Published npm version did not match ${expectedVersion}`);
  }
}

export function assertVerifiedProvenance(audit, expectedVersion, releaseSha) {
  if (!SHA_PATTERN.test(releaseSha)) {
    throw new Error("Provenance verification needs an exact release SHA");
  }
  const verified = audit.verified?.find(
    (entry) =>
      entry.name === PACKAGE_NAME &&
      entry.version === expectedVersion &&
      entry.registry === "https://registry.npmjs.org/",
  );
  const bundles = verified?.attestationBundles;
  if (!Array.isArray(bundles)) {
    throw new Error("Published package has no verified npm attestations");
  }
  const provenance = bundles.find((entry) => entry.predicateType === PROVENANCE_TYPE);
  const publication = bundles.find((entry) => entry.predicateType === PUBLISH_TYPE);
  if (!provenance || !publication) {
    throw new Error("Published package lacks verified provenance or publish attestation");
  }

  const statement = JSON.parse(
    Buffer.from(provenance.bundle.dsseEnvelope.payload, "base64").toString("utf8"),
  );
  const workflow = statement.predicate?.buildDefinition?.externalParameters?.workflow;
  const dependencies = statement.predicate?.buildDefinition?.resolvedDependencies;
  if (
    statement.predicateType !== PROVENANCE_TYPE ||
    !statement.subject?.some((subject) => subject.name === `pkg:npm/${PACKAGE_NAME}@${expectedVersion}`) ||
    workflow?.repository !== SOURCE_REPOSITORY ||
    workflow?.path !== RELEASE_WORKFLOW ||
    workflow?.ref !== "refs/heads/main" ||
    !Array.isArray(dependencies) ||
    !dependencies.some(
      (dependency) =>
        dependency.uri === `git+${SOURCE_REPOSITORY}@refs/heads/main` &&
        dependency.digest?.gitCommit === releaseSha,
    ) ||
    statement.predicate?.runDetails?.builder?.id !== "https://github.com/actions/runner/github-hosted"
  ) {
    throw new Error("Verified provenance does not identify this release workflow and commit");
  }
  const publishStatement = JSON.parse(
    Buffer.from(publication.bundle.dsseEnvelope.payload, "base64").toString("utf8"),
  );
  if (
    publishStatement.predicateType !== PUBLISH_TYPE ||
    publishStatement.predicate?.name !== PACKAGE_NAME ||
    publishStatement.predicate?.version !== expectedVersion
  ) {
    throw new Error("Verified publish attestation does not identify this package version");
  }
}

export async function createVerifiedMarker(markerPath, releaseSha) {
  if (!markerPath || !SHA_PATTERN.test(releaseSha)) {
    throw new Error("Verification marker needs a path and exact release SHA");
  }
  await writeFile(markerPath, `${releaseSha}\n`, { flag: "wx" });
}

export async function assertTagAuthorized(environment) {
  if (environment.DRY_RUN !== "false") {
    throw new Error("Tag creation is disabled during dry runs");
  }
  const version = environment.EXPECTED_VERSION;
  const releaseSha = environment.RELEASE_SHA;
  if (
    !VERSION_PATTERN.test(version) ||
    !SHA_PATTERN.test(releaseSha) ||
    environment.REQUESTED_TAG !== `v${version}` ||
    !environment.PROVENANCE_MARKER
  ) {
    throw new Error("Tagging requires exact verified release metadata");
  }
  let verifiedSha;
  try {
    verifiedSha = (await readFile(environment.PROVENANCE_MARKER, "utf8")).trim();
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error("Provenance verification did not complete");
    }
    throw error;
  }
  if (verifiedSha !== releaseSha) {
    throw new Error("Provenance was not verified for the release SHA");
  }
}

function command(binary, args) {
  const invocation = spawnSync(binary, args, { encoding: "utf8" });
  if (invocation.error || invocation.status === null) {
    throw new Error(`${binary} preflight command failed`, { cause: invocation.error });
  }
  return invocation;
}

async function main() {
  const action = process.argv[2];
  if (action === "checks") {
    const [branch, checkPages, workflowPages] = await Promise.all([
      readFile(process.env.BRANCH_JSON, "utf8").then(JSON.parse),
      readFile(process.env.CHECK_RUNS_JSON, "utf8").then(JSON.parse),
      readFile(process.env.CI_RUNS_JSON, "utf8").then(JSON.parse),
    ]);
    assertCurrentProtectedMain(branch, process.env.RELEASE_SHA);
    assertRequiredChecks(checkPages, workflowPages, process.env.RELEASE_SHA);
    return;
  }
  if (action === "environment") {
    const environment = JSON.parse(
      await readFile(process.env.ENVIRONMENT_JSON, "utf8"),
    );
    assertProtectedReleaseEnvironment(environment);
    return;
  }
  if (action === "metadata") {
    const [packageManifest, changelog] = await Promise.all([
      readFile("package.json", "utf8").then(JSON.parse),
      readFile("CHANGELOG.md", "utf8"),
    ]);
    assertReleaseMetadata(process.env, packageManifest, changelog);
    const tagLookup = command("git", [
      "ls-remote",
      "--tags",
      "--refs",
      "origin",
      `refs/tags/${process.env.REQUESTED_TAG}`,
    ]);
    if (tagLookup.status !== 0) {
      throw new Error("Remote tag lookup failed; availability is unverified");
    }
    assertTagUnused(tagLookup.stdout, process.env.REQUESTED_TAG);
    assertRegistryVersionUnused(
      command("npm", ["view", `${PACKAGE_NAME}@${process.env.EXPECTED_VERSION}`, "version", "--json"]),
      process.env.EXPECTED_VERSION,
    );
    return;
  }
  if (action === "packed") {
    const packages = JSON.parse(await readFile(process.env.PACK_JSON, "utf8"));
    assertPackedFiles(packages, process.env.EXPECTED_VERSION);
    return;
  }
  if (action === "verify") {
    const [version, audit] = await Promise.all([
      readFile(process.env.VERSION_JSON, "utf8").then(JSON.parse),
      readFile(process.env.AUDIT_JSON, "utf8").then(JSON.parse),
    ]);
    assertPublishedVersion(version, process.env.EXPECTED_VERSION);
    assertVerifiedProvenance(audit, process.env.EXPECTED_VERSION, process.env.RELEASE_SHA);
    await createVerifiedMarker(process.env.PROVENANCE_MARKER, process.env.RELEASE_SHA);
    return;
  }
  if (action === "tag") {
    await assertTagAuthorized(process.env);
    const tag = process.env.REQUESTED_TAG;
    for (const args of [
      ["tag", tag, process.env.RELEASE_SHA],
      ["push", "origin", `refs/tags/${tag}`],
    ]) {
      if (command("git", args).status !== 0) {
        throw new Error(`git ${args[0]} failed; investigate the published version`);
      }
    }
    return;
  }
  throw new Error("Expected checks, environment, metadata, packed, verify, or tag command");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
