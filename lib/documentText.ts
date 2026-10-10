// Plain text out of a dropped-in document, for the cover-letter prompt.
// PDF via unpdf (PDF.js), Word via mammoth; .md/.txt are read as-is.
// A scanned PDF has no text layer and comes back empty — the Settings page
// shows that per file.

import path from "node:path";
import { extractText } from "unpdf";
import mammoth from "mammoth";

export async function documentText(filename: string, bytes: Buffer): Promise<string> {
  switch (path.extname(filename).toLowerCase()) {
    case ".pdf": {
      const { text } = await extractText(new Uint8Array(bytes), { mergePages: true });
      return tidy(text);
    }
    case ".docx": {
      const { value } = await mammoth.extractRawText({ buffer: bytes });
      return tidy(value);
    }
    default:
      return bytes.toString("utf8").trim();
  }
}

// Extracted text tends to carry runs of spaces and blank lines from layout.
function tidy(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Checks the file is what its extension says before it's saved, so a renamed
// file fails at upload instead of at generation time.
export function looksLike(filename: string, bytes: Buffer): boolean {
  switch (path.extname(filename).toLowerCase()) {
    case ".pdf":
      return bytes.subarray(0, 5).toString("latin1") === "%PDF-";
    case ".docx":
      return bytes[0] === 0x50 && bytes[1] === 0x4b; // zip ("PK")
    default:
      return !bytes.includes(0); // text, not binary
  }
}
