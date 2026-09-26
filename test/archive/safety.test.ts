import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { archivedFile, archivedRecord, boundedFile, changeDirectory } from "../../src/archive/index.ts";

test("archive browsing refuses traversal, links, binary and oversized content", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "opsx-archive-"));
  try {
    const archive = path.join(root, "openspec", "changes", "archive");
    const record = path.join(archive, "2026-09-23-known");
    await mkdir(record, { recursive: true });
    await writeFile(path.join(record, "proposal.md"), "# archived\n");
    await writeFile(path.join(record, "binary"), Buffer.from([65, 0, 66]));
    await writeFile(path.join(record, "large"), Buffer.alloc(1024 * 1024 + 1, 65));
    await symlink("/etc/passwd", path.join(record, "outside"));
    expect((await archivedRecord(root, "2026-09-23-known")).files).toEqual(["binary", "large", "proposal.md"]);
    expect((await archivedFile(root, "2026-09-23-known", "proposal.md")).content).toBe("# archived\n");
    await expect(archivedFile(root, "2026-09-23-known", "../known/proposal.md")).rejects.toMatchObject({ code: "UNSAFE_PATH" });
    await expect(archivedFile(root, "2026-09-23-known", "outside")).rejects.toMatchObject({ code: "UNSAFE_PATH" });
    await expect(archivedFile(root, "2026-09-23-known", "binary")).rejects.toMatchObject({ code: "FILE_NOT_TEXT" });
    await expect(archivedFile(root, "2026-09-23-known", "large")).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    await expect(changeDirectory(root, "../unsafe", true)).rejects.toMatchObject({ code: "UNSAFE_PATH" });
    await expect(boundedFile(record, "/etc/passwd")).rejects.toMatchObject({ code: "UNSAFE_PATH" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
