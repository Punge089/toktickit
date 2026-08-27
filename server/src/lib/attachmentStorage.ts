import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Issue 26/31 — local disk storage under server/uploads/ (gitignored).
// specification.md §11: acceptable for a course lab; a production system
// would use object storage, explicitly out of scope here.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = path.resolve(__dirname, "../../uploads");

export async function saveAttachmentFile(storedFilename: string, buffer: Buffer): Promise<void> {
  await mkdir(UPLOADS_DIR, { recursive: true });
  await writeFile(path.join(UPLOADS_DIR, storedFilename), buffer);
}

export function attachmentFilePath(storedFilename: string): string {
  return path.join(UPLOADS_DIR, storedFilename);
}
