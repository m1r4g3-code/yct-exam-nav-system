/**
 * Small RFC 4180-style CSV reader for the admin import endpoints.
 * Handles quoted fields containing commas, line breaks and doubled quotes (""),
 * CRLF or LF line endings and a leading byte-order mark.
 */

export interface CsvRow {
  /** 1-based line number of the row in the file (the header is line 1). */
  line: number;
  cells: string[];
}

export interface ParsedCsv {
  /** Header names, lower-cased with spaces turned into underscores. */
  headers: string[];
  rows: CsvRow[];
}

export function normaliseHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, "_");
}

/** Splits CSV text into records of trimmed fields. Blank lines are skipped. */
export function parseCsvRecords(text: string): CsvRow[] {
  const input = text.replace(/^﻿/, "");
  const records: CsvRow[] = [];
  let fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let line = 1;
  let recordStart = 1;

  const endRecord = () => {
    fields.push(current.trim());
    if (fields.some((f) => f !== "")) records.push({ line: recordStart, cells: fields });
    fields = [];
    current = "";
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === "\n") line++;
        current += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current.trim());
      current = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      endRecord();
      line++;
      recordStart = line;
    } else {
      current += ch;
    }
  }
  if (current !== "" || fields.length > 0) endRecord();

  return records;
}

/** Parses CSV text with a header row. */
export function parseCsv(text: string): ParsedCsv {
  const [header, ...rows] = parseCsvRecords(text);
  return { headers: header ? header.cells.map(normaliseHeader) : [], rows };
}

/** MIME types browsers commonly report for .csv files (some report none at all). */
export const CSV_MIME_TYPES = new Set([
  "",
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "text/plain",
  "application/octet-stream",
]);

export const MAX_CSV_BYTES = 5 * 1024 * 1024;

/** Validates an uploaded file and returns its text, or an error message. */
export async function readCsvUpload(
  formData: FormData | null
): Promise<{ text: string } | { error: string }> {
  const file = formData?.get("file");
  if (!file || typeof file === "string") return { error: "No file uploaded" };
  if (!file.name.toLowerCase().endsWith(".csv")) return { error: "File must be a .csv file" };
  if (!CSV_MIME_TYPES.has(file.type)) return { error: "File must be a CSV file" };
  if (file.size > MAX_CSV_BYTES) return { error: "File exceeds 5 MB limit" };
  return { text: await file.text() };
}

/** Removes characters that spreadsheet programs treat as the start of a formula. */
export function stripFormulaPrefix(value: string): string {
  return value.replace(/^[\s=+\-@]+/, "").trim();
}
