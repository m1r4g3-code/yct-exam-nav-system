import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest } from "@/lib/api-response";

type CsvRow = {
  course_code?: string;
  course_title?: string;
  level_name?: string;
  credit_units?: string;
  semester?: string;
};

/**
 * RED-3: RFC 4180-compliant CSV field splitter.
 * Handles quoted fields containing commas and escaped quotes ("").
 * Does not handle multi-line field values (newlines inside quotes) since
 * course data split by line first; newlines in course titles are unrealistic.
 */
function splitCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

export async function POST(request: Request) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return badRequest("No file provided");
  if (!file.name.endsWith(".csv")) return badRequest("File must be a CSV");
  if (file.size > 5 * 1024 * 1024) return badRequest("File exceeds 5MB limit");

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return badRequest("CSV is empty or missing header row");

  const headers = splitCSVLine(lines[0]).map((h) => h.toLowerCase());
  const requiredHeaders = ["course_code", "course_title", "level_name", "credit_units", "semester"];
  const missing = requiredHeaders.filter((h) => !headers.includes(h));
  if (missing.length) return badRequest(`Missing CSV columns: ${missing.join(", ")}`);

  // Pre-load all levels for lookup
  const levels = await prisma.level.findMany({ select: { id: true, name: true } });
  const levelMap = new Map(levels.map((l) => [l.name.toLowerCase(), l.id]));

  let imported = 0;
  let skipped = 0;
  const errors: { row: number; reason: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i]);
    const row: CsvRow = {};
    headers.forEach((h, idx) => { (row as Record<string, string>)[h] = values[idx] ?? ""; });

    const rowNum = i + 1;
    const { course_code, course_title, level_name, credit_units, semester } = row;

    if (!course_code || !course_title || !level_name) {
      errors.push({ row: rowNum, reason: "Missing required fields" });
      skipped++;
      continue;
    }

    const levelId = levelMap.get(level_name.toLowerCase());
    if (!levelId) {
      errors.push({ row: rowNum, reason: `Unknown level: "${level_name}"` });
      skipped++;
      continue;
    }

    const credits = parseInt(credit_units ?? "0", 10);
    if (!credits || credits < 1) {
      errors.push({ row: rowNum, reason: "Invalid credit_units" });
      skipped++;
      continue;
    }

    const sem = (semester ?? "").toLowerCase();
    if (sem !== "first" && sem !== "second") {
      errors.push({ row: rowNum, reason: `Invalid semester: "${semester}" (must be "first" or "second")` });
      skipped++;
      continue;
    }

    try {
      await prisma.course.upsert({
        where: { code: course_code.toUpperCase() },
        update: { title: course_title, creditUnits: credits, semester: sem === "first" ? "FIRST" : "SECOND", levelId },
        create: { code: course_code.toUpperCase(), title: course_title, creditUnits: credits, semester: sem === "first" ? "FIRST" : "SECOND", levelId },
      });
      imported++;
    } catch {
      errors.push({ row: rowNum, reason: "Database error — check course code format" });
      skipped++;
    }
  }

  return ok({ imported, skipped, errors });
}
