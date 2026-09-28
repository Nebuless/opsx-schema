import { execFile } from "node:child_process";
import { OpsxError } from "../domain/project.ts";

export interface OpenSpecCommandResult {
  status: number;
  stdout: string;
  stderr: string;
  errorMessage?: string;
}

const OPENSPEC_URL = "https://github.com/Fission-AI/OpenSpec";
const VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function unsupportedVersion(
  version: string,
  problem: string,
  guidance: string,
): OpsxError {
  const reported = version ? JSON.stringify(version) : "empty output";
  return new OpsxError(
    "OPENSPEC_UNSUPPORTED",
    problem +
      " (OpenSpec --version reported " +
      reported +
      "). " +
      guidance +
      " Official OpenSpec project: " +
      OPENSPEC_URL +
      ".",
  );
}

export class OpenSpecClient {
  private supportCheck?: Promise<void>;

  constructor(
    private readonly root: string,
    private readonly executable = "openspec",
  ) {}

  private execute(args: string[]): Promise<OpenSpecCommandResult> {
    const { promise, resolve, reject } =
      Promise.withResolvers<OpenSpecCommandResult>();
    execFile(
      this.executable,
      args,
      {
        cwd: this.root,
        env: { ...process.env, PWD: this.root },
        encoding: "utf8",
        timeout: 30_000,
        maxBuffer: 8 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const result = { stdout, stderr };
        if (!error) {
          resolve({ status: 0, ...result });
          return;
        }
        const failure = error as Error & { code?: number | string };
        if (typeof failure.code === "number") {
          resolve({
            status: failure.code,
            ...result,
            errorMessage: failure.message,
          });
          return;
        }
        const detail =
          result.stdout.trim() || result.stderr.trim() || failure.message;
        reject(
          new OpsxError(
            "OPENSPEC_FAILED",
            `openspec ${args.join(" ")} failed: ${detail}`,
          ),
        );
      },
    );
    return promise;
  }

  private commandFailure(
    args: string[],
    result: OpenSpecCommandResult,
  ): OpsxError {
    const detail =
      result.stdout.trim() ||
      result.stderr.trim() ||
      result.errorMessage ||
      `exit code ${result.status}`;
    return new OpsxError(
      "OPENSPEC_FAILED",
      `openspec ${args.join(" ")} failed: ${detail}`,
    );
  }

  private async checkSupported(): Promise<void> {
    const result = await this.execute(["--version"]);
    if (result.status !== 0) throw this.commandFailure(["--version"], result);
    const version = result.stdout.trim();
    const parsed = VERSION_PATTERN.exec(version);
    if (!parsed)
      throw unsupportedVersion(
        version,
        "Malformed OpenSpec version string.",
        "Install or select a stable OpenSpec 1.x release >=1.12.0 before retrying.",
      );
    if (parsed[4] !== undefined)
      throw unsupportedVersion(
        version,
        "Pre-release OpenSpec versions are not supported.",
        "Switch to a stable OpenSpec 1.x release >=1.12.0 before retrying.",
      );
    if (parsed[1] === "0")
      throw unsupportedVersion(
        version,
        "OpenSpec " + version + " is older than the supported minimum 1.12.0.",
        "Upgrade OpenSpec to 1.12.0 or newer stable 1.x.",
      );
    if (parsed[1] !== "1")
      throw unsupportedVersion(
        version,
        "OpenSpec major version " + parsed[1] + " is not supported.",
        "Switch to a stable OpenSpec 1.x release >=1.12.0, or use an opsx-schema build compatible with OpenSpec major version " +
          parsed[1] +
          ".",
      );

    const minor = parsed[2];
    if (minor.length < 2 || (minor.length === 2 && minor < "12"))
      throw unsupportedVersion(
        version,
        "OpenSpec " + version + " is older than the supported minimum 1.12.0.",
        "Upgrade OpenSpec to 1.12.0 or newer stable 1.x.",
      );
  }

  async ensureSupported(): Promise<void> {
    if (!this.supportCheck) {
      const pending = this.checkSupported();
      this.supportCheck = pending;
      try {
        await pending;
      } catch (error) {
        if (this.supportCheck === pending) this.supportCheck = undefined;
        throw error;
      }
      return;
    }
    await this.supportCheck;
  }

  /** Run one OpenSpec command, preserving nonzero exits for validation findings. */
  async commandResult(...args: string[]): Promise<OpenSpecCommandResult> {
    await this.ensureSupported();
    return this.execute(args);
  }

  async command(...args: string[]): Promise<string> {
    const result = await this.commandResult(...args);
    if (result.status !== 0) throw this.commandFailure(args, result);
    return result.stdout;
  }

  async json<T>(...args: string[]): Promise<T> {
    const text = await this.command(...args, "--json");
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new OpsxError(
        "OPENSPEC_RESPONSE",
        `OpenSpec returned invalid JSON for: ${args.join(" ")}`,
      );
    }
  }
}
