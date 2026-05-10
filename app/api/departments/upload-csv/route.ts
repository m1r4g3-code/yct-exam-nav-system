import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest } from "@/lib/api-response";

/**
 * POST /api/departments/upload-csv
 *
 * CSV format (header row required):
 *   school_name,name,code
 *   School of Technology,Computer Science,CSC
 *
 * Each row creates a department + standard ND & HND programmes + 4 levels.
 * Rows with duplicate department codes are skipped (not an error).
 */
export async function POST(request: Request) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file") as File | null;
  if (!file) return badRequest("No file uploaded");

  const text = await file.text();
  const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);

  if (lines.length < 2)
    return badRequest("CSV must have a header row and at least one data row");

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const schoolCol = headers.indexOf("school_name");
  const nameCol = headers.indexOf("name");
  const codeCol = headers.indexOf("code");

  if (schoolCol === -1 || nameCol === -1 || codeCol === -1)
    return badRequest('CSV must have columns: school_name, name, code');

  const schools = await prisma.school.findMany({ select: { id: true, name: true } });
  const schoolByName = new Map(schools.map((s) => [s.name.toLowerCase(), s]));

  let imported = 0;
  let skipped = 0;
  const errors: { row: number; reason: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const schoolName = cols[schoolCol];
    const name = cols[nameCol];
    const code = cols[codeCol]?.toUpperCase();

    if (!schoolName || !name || !code) {
      errors.push({ row: i + 1, reason: "Missing required fields (school_name, name, code)" });
      continue;
    }

    const school = schoolByName.get(schoolName.toLowerCase());
    if (!school) {
      errors.push({ row: i + 1, reason: `School "${schoolName}" not found — add it first` });
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const dept = await tx.department.create({
          data: { name, code, schoolId: school.id },
        });

        const nd = await tx.programme.create({
          data: { name: "National Diploma (ND)", code: "ND", departmentId: dept.id },
        });
        const hnd = await tx.programme.create({
          data: { name: "Higher National Diploma (HND)", code: "HND", departmentId: dept.id },
        });

        await tx.level.createMany({
          data: [
            { name: "ND 1", year: 1, programmeId: nd.id },
            { name: "ND 2", year: 2, programmeId: nd.id },
            { name: "HND 1", year: 1, programmeId: hnd.id },
            { name: "HND 2", year: 2, programmeId: hnd.id },
          ],
        });
      });
      imported++;
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "P2002") {
        skipped++;
      } else {
        errors.push({ row: i + 1, reason: "Unexpected error — check department code for duplicates" });
      }
    }
  }

  return ok(
    { imported, skipped, errors },
    `Import complete: ${imported} imported, ${skipped} skipped`
  );
}
