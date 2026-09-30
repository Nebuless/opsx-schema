import { OpenSpecClient } from "../openspec/client.ts";
import type { ValidationResult } from "../validation/index.ts";
import type { ActionResult, ActionTarget, LifecycleAction } from "./shared.ts";
import {
  activeDirectory,
  fail,
  projectRoot,
  runValidation,
  safeIdentifier,
  statusFor,
  success,
} from "./shared.ts";

export async function getChangeStatus(
  rootInput: string,
  changeInput: string,
): Promise<ActionResult<unknown>> {
  const action: LifecycleAction = "change.status";
  let target: ActionTarget | undefined;
  try {
    const root = await projectRoot(rootInput);
    const change = safeIdentifier(changeInput, "change name");
    target = { root, change };
    await activeDirectory(root, change);
    return success(
      action,
      "read",
      target,
      await statusFor(new OpenSpecClient(root), change),
    );
  } catch (error) {
    return fail(action, error, target);
  }
}

export async function getArtifactInstructions(
  rootInput: string,
  changeInput: string,
  artifactInput: string,
): Promise<ActionResult<unknown>> {
  const action: LifecycleAction = "change.instructions";
  let target: ActionTarget | undefined;
  try {
    const root = await projectRoot(rootInput);
    const change = safeIdentifier(changeInput, "change name");
    const artifact = safeIdentifier(artifactInput, "artifact name");
    target = { root, change, artifact };
    await activeDirectory(root, change);
    const instructions = await new OpenSpecClient(root).json(
      "instructions",
      artifact,
      "--change",
      change,
    );
    return success(action, "read", target, instructions);
  } catch (error) {
    return fail(action, error, target);
  }
}

export async function validateChangeAction(
  rootInput: string,
  changeInput: string,
): Promise<ActionResult<ValidationResult>> {
  const action: LifecycleAction = "change.validate";
  let target: ActionTarget | undefined;
  try {
    const root = await projectRoot(rootInput);
    const change = safeIdentifier(changeInput, "change name");
    target = { root, change };
    await activeDirectory(root, change);
    return success(action, "read", target, await runValidation(root, change));
  } catch (error) {
    return fail(action, error, target);
  }
}
