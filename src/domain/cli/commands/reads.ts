import {
  archivedFile,
  archivedRecord,
  listArchived,
  boundedFile,
  changeDirectory,
} from "../../../archive/index.ts";
import { changeHistory, readProvenance } from "../../../provenance/index.ts";
import { detailedChanges, projectSnapshot } from "../../snapshot.ts";
import { defaultSchema, OpsxError } from "../../project.ts";
import { OpenSpecClient } from "../../../openspec/client.ts";
import { resources } from "../../../catalog/schemas.ts";
import { requireCount } from "../shared.ts";

export async function commandReads(
  root: string,
  command: string,
  args: string[],
): Promise<unknown> {
  switch (command) {
    case "status":
      requireCount(args, 0, 0, "status");
      return projectSnapshot(root, new OpenSpecClient(root));
    case "changes": {
      requireCount(args, 0, 2, "changes [name] [file]");
      const active = await detailedChanges(root, new OpenSpecClient(root));
      if (!args[0]) return active;
      const selected = active.find((change) => change.name === args[0]);
      if (!selected)
        throw new OpsxError(
          "CHANGE_NOT_FOUND",
          `Active change ${args[0]} not found; use changes to list choices.`,
        );
      const directory = await changeDirectory(root, args[0]);
      return args[1]
        ? {
            name: args[0],
            file: args[1],
            ...(await boundedFile(directory, args[1])),
          }
        : {
            ...selected,
            selection: (await readProvenance(directory))?.association ?? null,
          };
    }
    case "archive": {
      requireCount(args, 0, 2, "archive [name] [file]");
      const entries = await listArchived(root);
      if (!args[0]) return entries;
      const selected = entries.find((entry) => entry.name === args[0]);
      if (!selected)
        throw new OpsxError(
          "ARCHIVE_NOT_FOUND",
          `Archived change ${args[0]} not found; use archive to list choices.`,
        );
      return args[1]
        ? {
            name: args[0],
            file: args[1],
            ...(await archivedFile(root, args[0], args[1])),
          }
        : {
            ...(await archivedRecord(root, args[0])),
            history: await changeHistory(root, args[0], true),
          };
    }
    case "resources":
      requireCount(args, 0, 1, "resources [schema]");
      return resources(
        new OpenSpecClient(root),
        args[0] ?? (await defaultSchema(root)),
      );
    default:
      throw new OpsxError("USAGE", `Unknown command ${command}.`);
  }
}
