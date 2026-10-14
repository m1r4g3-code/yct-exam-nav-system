import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Creates a department together with Yabatech's standard structure: the
 * National Diploma (ND) and Higher National Diploma (HND) programmes and the
 * levels ND 1, ND 2, HND 1 and HND 2. Run inside a transaction.
 */
export async function createDepartmentWithStructure(
  tx: Prisma.TransactionClient,
  data: { name: string; code: string; schoolId: string }
) {
  const department = await tx.department.create({ data });

  const nd = await tx.programme.create({
    data: { name: "National Diploma (ND)", code: "ND", departmentId: department.id },
  });
  const hnd = await tx.programme.create({
    data: { name: "Higher National Diploma (HND)", code: "HND", departmentId: department.id },
  });

  await tx.level.createMany({
    data: [
      { name: "ND 1", year: 1, programmeId: nd.id },
      { name: "ND 2", year: 2, programmeId: nd.id },
      { name: "HND 1", year: 1, programmeId: hnd.id },
      { name: "HND 2", year: 2, programmeId: hnd.id },
    ],
  });

  return department;
}
