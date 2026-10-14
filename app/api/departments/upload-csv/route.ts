import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";
import { parseCsv, readCsvUpload, stripFormulaPrefix } from "@/lib/csv";
import { createDepartmentWithStructure } from "@/lib/departments";

// A large file over a slow connection can take a while to save.
export const maxDuration = 60;

/**
 * POST /api/departments/upload-csv
 *
 * CSV format (header row required):
 *   school_name,name,code
 *   School of Technology,Computer Science,CSC
 *
 * Each row creates a department + standard ND & HND programmes + 4 levels.
 * Rows whose department code already exists are skipped; rows that can't be
 * imported are reported with their line number and the reason.
 */
export const POST = withHandler(async (request: Request) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const upload = await readCsvUpload(await request.formData().catch(() => null));
  if ("error" in upload) return badRequest(upload.error);

  const { headers, rows } = parseCsv(upload.text);
  if (rows.length === 0) return badRequest("CSV must have a header row and at least one data row");

  const schoolCol = headers.indexOf("school_name");
  const nameCol = headers.indexOf("name");
  const codeCol = headers.indexOf("code");
  if (schoolCol === -1 || nameCol === -1 || codeCol === -1)
    return badRequest("CSV must have columns: school_name, name, code");

  const schools = await prisma.school.findMany({ select: { id: true, name: true } });
  const schoolByName = new Map(schools.map((s) => [s.name.trim().toLowerCase(), s]));

  let imported = 0;
  let skipped = 0;
  const errors: { row: number; reason: string }[] = [];

  for (const { line, cells } of rows) {
    const schoolName = cells[schoolCol] ?? "";
    const name = stripFormulaPrefix(cells[nameCol] ?? "");
    const code = (cells[codeCol] ?? "").trim().toUpperCase();

    if (!schoolName || !name || !code) {
      errors.push({ row: line, reason: "Missing required fields (school_name, name, code)" });
      continue;
    }
    if (name.length < 2 || name.length > 255 || code.length < 2 || code.length > 50) {
      errors.push({ row: line, reason: "Name must be 2–255 characters and code 2–50 characters" });
      continue;
    }

    const school = schoolByName.get(schoolName.toLowerCase());
    if (!school) {
      errors.push({ row: line, reason: `School "${schoolName}" not found — add it first` });
      continue;
    }

    try {
      await prisma.$transaction((tx) =>
        createDepartmentWithStructure(tx, { name, code, schoolId: school.id })
      );
      imported++;
    } catch (e: unknown) {
      if ((e as { code?: string }).code === "P2002") {
        skipped++;
      } else {
        console.error("[departments/upload-csv]", e);
        errors.push({ row: line, reason: "Could not be saved — please try this row again" });
      }
    }
  }

  return ok(
    { imported, skipped, errors },
    `Import complete: ${imported} imported, ${skipped} skipped, ${errors.length} rejected`
  );
});
