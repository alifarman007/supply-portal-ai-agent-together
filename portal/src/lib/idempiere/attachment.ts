"use client";

import { ATTACHMENT_MIME_TYPES, type AttachmentMimeType } from "./types";

/**
 * Turning a picked file into the string API 4 wants.
 *
 * §4.6 accepts `data:<MIME>;base64,<DATA>` and recommends it over bare base64
 * "because it identifies the attachment type". The catch is §4.6.4: the ERP
 * decodes the bytes, works out what the file really is, and rejects the
 * submission if that disagrees with the MIME the data URI declared —
 *
 *   "Attachment MIME type does not match actual file type.
 *    MIME Type: image/png, Detected Type: PDF"
 *
 * `File.type` is the obvious source for that MIME and the wrong one. Browsers
 * derive it from the filename extension (on Windows, via the registry), so it
 * describes what the file is *called*, not what it *contains*. A PDF saved as
 * `scan.png` — routine when someone renames an attachment — would declare
 * image/png and be rejected by the ERP after a full upload.
 *
 * So the MIME is read from the file's magic bytes instead, and `File.type` is
 * used only as a tie-breaker for JPEG/JFIF variants. That way the declared type
 * agrees with the bytes by construction, and the ERP's check can only fail if
 * our sniffing is wrong rather than because a user renamed something.
 */

/** §4.6.4's table, keyed by the leading bytes that actually identify each format. */
const MAGIC: { mime: AttachmentMimeType; bytes: number[] }[] = [
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF8(7a|9a)
];

/**
 * The ERP holds the whole decoded file in memory while it checks the type, and
 * base64 inflates by a third on the way there. 5 MB of source is already ~6.7 MB
 * on the wire; beyond that this stops being a scanned invoice and starts being
 * a problem for every hop in between.
 */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export type AttachmentError =
  | { kind: "empty" }
  | { kind: "too_large"; bytes: number; limit: number }
  | { kind: "unsupported"; detected: string | null };

export class AttachmentRejected extends Error {
  constructor(readonly reason: AttachmentError) {
    super(`attachment rejected: ${reason.kind}`);
    this.name = "AttachmentRejected";
  }
}

/** Identify a file from its leading bytes. Returns null for anything unsupported. */
export function sniffMimeType(head: Uint8Array, declared?: string): AttachmentMimeType | null {
  for (const { mime, bytes } of MAGIC) {
    if (head.length < bytes.length) continue;
    if (bytes.every((byte, i) => head[i] === byte)) {
      // JPEG has several fourth bytes (E0 JFIF, E1 Exif, DB raw). All are
      // image/jpeg, so the magic above is deliberately only three bytes and
      // the declared type is never needed to disambiguate — but honour it if
      // it already agrees, so an odd variant keeps the browser's own view.
      if (mime === "image/jpeg" && declared === "image/jpeg") return "image/jpeg";
      return mime;
    }
  }
  return null;
}

/**
 * Read a picked file into the `data:<MIME>;base64,<DATA>` string API 4 expects.
 *
 * Uses FileReader.readAsDataURL rather than btoa. The tempting
 * `btoa(String.fromCharCode(...new Uint8Array(buffer)))` spreads one argument
 * per byte and throws "Maximum call stack size exceeded" on any real invoice —
 * it only looks fine on the tiny fixtures people test with. readAsDataURL emits
 * exactly the documented shape: the `data:` prefix, the MIME, `;base64,`, then
 * unbroken standard-alphabet base64.
 *
 * The MIME the browser puts in that prefix is `File.type`, so where sniffing
 * disagrees the prefix is rewritten to the sniffed type before returning.
 */
export async function fileToErpAttachment(file: File): Promise<{
  dataUri: string;
  mimeType: AttachmentMimeType;
  bytes: number;
}> {
  if (file.size === 0) {
    throw new AttachmentRejected({ kind: "empty" });
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentRejected({
      kind: "too_large",
      bytes: file.size,
      limit: MAX_ATTACHMENT_BYTES,
    });
  }

  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const mimeType = sniffMimeType(head, file.type);
  if (!mimeType) {
    throw new AttachmentRejected({ kind: "unsupported", detected: file.type || null });
  }

  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("could not read the file"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });

  // Replace whatever MIME the browser wrote with the one the bytes support.
  // §4.6.5 is emphatic that there is no backslash before the colon, which is
  // what building the prefix here rather than patching a string guarantees.
  const base64 = raw.slice(raw.indexOf(",") + 1);
  return { dataUri: `data:${mimeType};base64,${base64}`, mimeType, bytes: file.size };
}

/** The file-picker `accept` string, derived from the types API 4 actually takes. */
export const ATTACHMENT_ACCEPT = ATTACHMENT_MIME_TYPES.join(",");
