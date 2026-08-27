import { describe, it, expect } from "vitest";
import { checkAttachmentFile, generateStoredFilename, MAX_ATTACHMENT_BYTES } from "../../src/lib/attachmentRules.js";

// UNIT-03, UNIT-04 in tests.md.
describe("checkAttachmentFile", () => {
  it("accepts jpg/jpeg/png/webp/pdf", () => {
    expect(checkAttachmentFile("a.jpg", "image/jpeg", 100).ok).toBe(true);
    expect(checkAttachmentFile("a.jpeg", "image/jpeg", 100).ok).toBe(true);
    expect(checkAttachmentFile("a.png", "image/png", 100).ok).toBe(true);
    expect(checkAttachmentFile("a.webp", "image/webp", 100).ok).toBe(true);
    expect(checkAttachmentFile("a.pdf", "application/pdf", 100).ok).toBe(true);
  });

  it("rejects gif/exe/txt", () => {
    expect(checkAttachmentFile("a.gif", "image/gif", 100).ok).toBe(false);
    expect(checkAttachmentFile("a.exe", "application/octet-stream", 100).ok).toBe(false);
    expect(checkAttachmentFile("a.txt", "text/plain", 100).ok).toBe(false);
  });

  it("rejects a mismatched extension/mimetype pair (BR-20: both must match)", () => {
    const result = checkAttachmentFile("a.jpg", "application/pdf", 100);
    expect(result.ok).toBe(false);
  });

  it("exactly 5MB passes; 5MB + 1 byte is rejected as SIZE", () => {
    expect(checkAttachmentFile("a.jpg", "image/jpeg", MAX_ATTACHMENT_BYTES).ok).toBe(true);
    const rejected = checkAttachmentFile("a.jpg", "image/jpeg", MAX_ATTACHMENT_BYTES + 1);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.reason).toBe("SIZE");
  });
});

// UNIT-05 in tests.md.
describe("generateStoredFilename", () => {
  it("output is a UUID + validated extension, never the original filename", () => {
    const stored = generateStoredFilename("my secret resume.pdf");
    expect(stored).not.toContain("secret");
    expect(stored).not.toContain("resume");
    expect(stored).toMatch(/^[0-9a-f-]{36}\.pdf$/);
  });

  it("two calls for the same original filename produce different stored names", () => {
    const a = generateStoredFilename("photo.jpg");
    const b = generateStoredFilename("photo.jpg");
    expect(a).not.toBe(b);
  });
});
