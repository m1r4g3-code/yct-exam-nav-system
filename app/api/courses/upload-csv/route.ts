import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, serverError } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";
import { parseCsv, readCsvUpload, stripFormulaPrefix } from "@/lib/csv";

type ValidRow = {
  code: string;
  title: string;
  creditUnits: number;
  semester: "FIRST" | "SECOND";
  levelId: string;
};

const REQUIRED = ["course_code", "course_title", "level_name", "credit_units", "semester"] as const;

// A large file over a slow connection can take a while to save.
export const maxDuration = 60;

/**
 * POST /api/courses/upload-csv
 *
 * CSV format (header row required; department_code is optional but needed when
 * several departments have a level with the same name, e.g. "ND 1"):
 *   course_code,course_title,department_code,level_name,credit_units,semester
 *   COM111,Introduction to Computing,CSC,ND 1,3,first
 *
 * Every row is validated first; all valid rows are then saved in one transaction
 * (new codes are created, existing codes updated). Rejected rows are reported
 * with their line number and the reason.
 */
export const POST = withHandler(async (request: Request) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const upload = await readCsvUpload(await request.formData().catch(() => null));
  if ("error" in upload) return badRequest(upload.error);

  const { headers, rows } = parseCsv(upload.text);
  if (rows.length === 0) return badRequest("CSV is empty or missing header row");

  const missing = REQUIRED.filter((h) => !headers.includes(h));
  if (missing.length) return badRequest(`Missing CSV columns: ${missing.join(", ")}`);
  const col = (name: string) => headers.indexOf(name);
  const deptCol = col("department_code");

  // Levels keyed by "DEPT|level name" and by level name alone
  const levels = await prisma.level.findMany({
    select: { id: true, name: true, programme: { select: { department: { select: { code: true } } } } },
  });
  const byDeptAndName = new Map<string, string[]>();
  const byName = new Map<string, string[]>();
  for (const l of levels) {
    const name = l.name.trim().toLowerCase();
    const key = `${l.programme.department.code.toUpperCase()}|${name}`;
    byDeptAndName.set(key, [...(byDeptAndName.get(key) ?? []), l.id]);
    byName.set(name, [...(byName.get(name) ?? []), l.id]);
  }

  const errors: { row: number; reason: string }[] = [];
  const validRows: ValidRow[] = [];
  const firstLineForCode = new Map<string, number>();

  for (const { line, cells } of rows) {
    const get = (name: string) => (col(name) === -1 ? "" : (cells[col(name)] ?? "").trim());
    const code = get("course_code").toUpperCase();
    const title = stripFormulaPrefix(get("course_title"));
    const levelName = get("level_name");
    const deptCode = deptCol === -1 ? "" : get("department_code").toUpperCase();

    if (!code || !title || !levelName) {
      errors.push({ row: line, reason: "Missing required fields (course_code, course_title, level_name)" });
      continue;
    }
    if (code.length < 2 || code.length > 20 || title.length < 2 || title.length > 255) {
      errors.push({ row: line, reason: "course_code must be 2–20 characters and course_title 2–255" });
      continue;
    }
    if (firstLineForCode.has(code)) {
      errors.push({ row: line, reason: `Duplicate course_code ${code} (first seen on line ${firstLineForCode.get(code)})` });
      continue;
    }

    let levelId: string | undefined;
    if (deptCode) {
      const matches = byDeptAndName.get(`${deptCode}|${levelName.toLowerCase()}`) ?? [];
      if (matches.length === 0) {
        errors.push({ row: line, reason: `No level "${levelName}" in department ${deptCode}` });
        continue;
      }
      if (matches.length > 1) {
        errors.push({ row: line, reason: `Level "${levelName}" exists in more than one programme of ${deptCode}` });
        continue;
      }
      levelId = matches[0];
    } else {
      const matches = byName.get(levelName.toLowerCase()) ?? [];
      if (matches.length === 0) {
        errors.push({ row: line, reason: `Unknown level: "${levelName}"` });
        continue;
      }
      if (matches.length > 1) {
        errors.push({
          row: line,
          reason: `Level "${levelName}" exists in several departments — add a department_code column`,
        });
        continue;
      }
      levelId = matches[0];
    }

    const creditText = get("credit_units");
    const credits = Number(creditText);
    if (!/^\d+$/.test(creditText) || credits < 1 || credits > 6) {
      errors.push({ row: line, reason: "credit_units must be a whole number from 1 to 6" });
      continue;
    }

    const sem = get("semester").toLowerCase();
    if (sem !== "first" && sem !== "second") {
      errors.push({ row: line, reason: `Invalid semester: "${get("semester")}" (must be "first" or "second")` });
      continue;
    }

    firstLineForCode.set(code, line);
    validRows.push({ code, title, creditUnits: credits, semester: sem === "first" ? "FIRST" : "SECOND", levelId });
  }

  // Existing courses on a published timetable keep their semester and level.
  const existing = validRows.length
    ? await prisma.course.findMany({
        where: { code: { in: validRows.map((r) => r.code) } },
        select: {
          code: true,
          semester: true,
          levelId: true,
          timetableEntries: { where: { status: "PUBLISHED" }, select: { id: true }, take: 1 },
        },
      })
    : [];
  const existingByCode = new Map(existing.map((c) => [c.code, c]));
  const toSave = validRows.filter((r) => {
    const current = existingByCode.get(r.code);
    if (
      current &&
      current.timetableEntries.length > 0 &&
      (current.semester !== r.semester || current.levelId !== r.levelId)
    ) {
      errors.push({
        row: firstLineForCode.get(r.code) ?? 0,
        reason: `${r.code} is on a published timetable — its semester and level can't change`,
      });
      return false;
    }
    return true;
  });

  if (toSave.length > 0) {
    // New courses go in with one insert; only existing codes need one update each.
    const newRows = toSave.filter((r) => !existingByCode.has(r.code));
    const changedRows = toSave.filter((r) => existingByCode.has(r.code));
    try {
      await prisma.$transaction(
        async (tx) => {
          if (newRows.length > 0) await tx.course.createMany({ data: newRows });
          for (const r of changedRows) {
            await tx.course.update({
              where: { code: r.code },
              data: { title: r.title, creditUnits: r.creditUnits, semester: r.semester, levelId: r.levelId },
            });
          }
        },
        { maxWait: 10_000, timeout: 55_000 }
      );
    } catch (e) {
      console.error("[courses/upload-csv]", e);
      return serverError("The import could not be saved — no courses were changed. Please try again.");
    }
  }

  const updated = toSave.filter((r) => existingByCode.has(r.code)).length;
  const imported = toSave.length - updated;
  errors.sort((a, b) => a.row - b.row);

  return ok(
    { imported, updated, skipped: errors.length, errors },
    `Import complete: ${imported} new, ${updated} updated, ${errors.length} rejected`
  );
});
