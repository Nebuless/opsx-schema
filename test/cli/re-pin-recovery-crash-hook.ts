const fs = require("node:fs/promises") as typeof import("node:fs/promises");
const path = require("node:path") as typeof import("node:path");
const args = process.argv;
const boundaryIndex = args.indexOf("--test-repin-boundary");
const markerIndex = args.indexOf("--test-repin-marker");
const boundary = boundaryIndex >= 0 ? args[boundaryIndex + 1] : undefined;
const marker = markerIndex >= 0 ? args[markerIndex + 1] : undefined;
if (boundaryIndex >= 0) args.splice(boundaryIndex, 2);
if (markerIndex >= 0)
  args.splice(markerIndex > boundaryIndex ? markerIndex - 2 : markerIndex, 2);

if (boundary && marker) {
  const projectIndex = args.indexOf("--project");
  const commandIndex = args.indexOf("change");
  const root = projectIndex >= 0 ? args[projectIndex + 1] : undefined;
  const change = commandIndex >= 0 ? args[commandIndex + 2] : undefined;
  if (!root || !change)
    throw new Error("Crash harness needs an exact project and change.");
  const journalFile = path.join(root, "openspec/.opsx/re-pin-journal.json");
  const journalDirectory = path.dirname(journalFile);
  const receiptFile = path.join(
    root,
    "openspec/changes",
    change,
    ".opsx-provenance.json",
  );
  const changeDirectory = path.dirname(receiptFile);
  let preparedJournalActivated = false;
  let receiptActivated = false;
  let completeJournalActivated = false;
  let stageOperationId = "";

  const crash = async (): Promise<never> => {
    await fs.writeFile(marker, boundary);
    process.kill(process.pid, "SIGKILL");
    throw new Error("Crash signal did not terminate the process.");
  };
  const journalState = async (file: string): Promise<string | null> => {
    try {
      const value = JSON.parse(await fs.readFile(file, "utf8")) as {
        state?: unknown;
        operationId?: unknown;
      };
      if (typeof value.operationId === "string")
        stageOperationId = value.operationId;
      return typeof value.state === "string" ? value.state : null;
    } catch {
      return null;
    }
  };
  const originalOpen = fs.open;
  fs.open = async (...openArgs: Parameters<typeof fs.open>) => {
    const handle = await originalOpen(...openArgs);
    const file = String(openArgs[0]);
    const originalSync = handle.sync.bind(handle);
    handle.sync = async () => {
      const result = await originalSync();
      if (
        boundary === "receipt-stage-sync" &&
        file.includes("..opsx-provenance.json.") &&
        file.endsWith(".tmp")
      )
        await crash();
      if (
        boundary === "completion-stage-sync" &&
        receiptActivated &&
        file.includes(".re-pin-journal.json.") &&
        file.endsWith(".tmp")
      )
        await crash();
      if (
        boundary === "receipt-parent-sync" &&
        receiptActivated &&
        file === changeDirectory
      )
        await crash();
      if (
        boundary === "prepared-journal-parent-sync" &&
        preparedJournalActivated &&
        file === journalDirectory
      )
        await crash();
      if (
        boundary === "completion-parent-sync" &&
        completeJournalActivated &&
        file === journalDirectory
      )
        await crash();
      return result;
    };
    return handle;
  };
  const originalLink = fs.link;
  fs.link = async (...linkArgs: Parameters<typeof fs.link>) => {
    const result = await originalLink(...linkArgs);
    if (
      String(linkArgs[1]) === journalFile &&
      (await journalState(journalFile)) === "prepared"
    )
      preparedJournalActivated = true;
    return result;
  };
  const originalRename = fs.rename;
  fs.rename = async (...renameArgs: Parameters<typeof fs.rename>) => {
    const source = String(renameArgs[0]);
    const destination = String(renameArgs[1]);
    const result = await originalRename(...renameArgs);
    if (destination === receiptFile) receiptActivated = true;
    if (
      destination === journalFile &&
      source ===
        path.join(
          journalDirectory,
          `.re-pin-journal.json.${stageOperationId}.tmp`,
        ) &&
      (await journalState(journalFile)) === "complete"
    ) {
      completeJournalActivated = true;
      if (boundary === "completion-activation") await crash();
    }
    if (boundary === "receipt-activation" && destination === receiptFile)
      await crash();
    return result;
  };
}
