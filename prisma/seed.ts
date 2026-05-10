import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { PrismaClient, Semester, NodeType } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  // ── School & Department Hierarchy ──────────────────────────────────────────

  const school = await prisma.school.upsert({
    where: { code: "SOT" },
    update: {},
    create: { name: "School of Technology", code: "SOT" },
  });

  const department = await prisma.department.upsert({
    where: { code: "CSC" },
    update: {},
    create: { name: "Computer Science", code: "CSC", schoolId: school.id },
  });

  const ndProgramme = await prisma.programme.upsert({
    where: { id: "prog-nd-csc" },
    update: {},
    create: {
      id: "prog-nd-csc",
      name: "National Diploma",
      code: "ND",
      departmentId: department.id,
    },
  });

  const hndProgramme = await prisma.programme.upsert({
    where: { id: "prog-hnd-csc" },
    update: {},
    create: {
      id: "prog-hnd-csc",
      name: "Higher National Diploma",
      code: "HND",
      departmentId: department.id,
    },
  });

  const nd1 = await prisma.level.upsert({
    where: { id: "level-nd1" },
    update: {},
    create: { id: "level-nd1", name: "ND1", year: 1, programmeId: ndProgramme.id },
  });

  const nd2 = await prisma.level.upsert({
    where: { id: "level-nd2" },
    update: {},
    create: { id: "level-nd2", name: "ND2", year: 2, programmeId: ndProgramme.id },
  });

  const hnd1 = await prisma.level.upsert({
    where: { id: "level-hnd1" },
    update: {},
    create: { id: "level-hnd1", name: "HND1", year: 1, programmeId: hndProgramme.id },
  });

  const hnd2 = await prisma.level.upsert({
    where: { id: "level-hnd2" },
    update: {},
    create: { id: "level-hnd2", name: "HND2", year: 2, programmeId: hndProgramme.id },
  });

  console.log("✓ School structure created");

  // ── Courses ────────────────────────────────────────────────────────────────

  const courseDefs = [
    // ND1
    { code: "CSC101", title: "Introduction to Computing", credits: 3, sem: Semester.FIRST, levelId: nd1.id },
    { code: "CSC102", title: "Computer Programming I", credits: 3, sem: Semester.FIRST, levelId: nd1.id },
    { code: "MTH101", title: "Mathematics I", credits: 3, sem: Semester.FIRST, levelId: nd1.id },
    { code: "GNS101", title: "Use of English", credits: 2, sem: Semester.FIRST, levelId: nd1.id },
    { code: "EEC101", title: "Basic Electronics", credits: 2, sem: Semester.FIRST, levelId: nd1.id },
    { code: "CSC103", title: "Logic and Critical Thinking", credits: 2, sem: Semester.FIRST, levelId: nd1.id },
    // ND2
    { code: "CSC201", title: "Data Structures", credits: 3, sem: Semester.FIRST, levelId: nd2.id },
    { code: "CSC202", title: "Computer Programming II", credits: 3, sem: Semester.FIRST, levelId: nd2.id },
    { code: "CSC203", title: "Database Management Systems", credits: 3, sem: Semester.FIRST, levelId: nd2.id },
    { code: "MTH201", title: "Mathematics II", credits: 3, sem: Semester.FIRST, levelId: nd2.id },
    { code: "CSC204", title: "Systems Analysis and Design", credits: 2, sem: Semester.FIRST, levelId: nd2.id },
    { code: "ENT201", title: "Entrepreneurship", credits: 2, sem: Semester.FIRST, levelId: nd2.id },
    // HND1
    { code: "CSC301", title: "Advanced Programming", credits: 3, sem: Semester.FIRST, levelId: hnd1.id },
    { code: "CSC302", title: "Computer Networks", credits: 3, sem: Semester.FIRST, levelId: hnd1.id },
    { code: "CSC303", title: "Software Engineering", credits: 3, sem: Semester.FIRST, levelId: hnd1.id },
    { code: "CSC304", title: "Operating Systems", credits: 3, sem: Semester.FIRST, levelId: hnd1.id },
    { code: "STA301", title: "Statistics for Computing", credits: 2, sem: Semester.FIRST, levelId: hnd1.id },
    { code: "CSC305", title: "Human-Computer Interaction", credits: 2, sem: Semester.FIRST, levelId: hnd1.id },
    // HND2
    { code: "CSC401", title: "Project Management", credits: 3, sem: Semester.FIRST, levelId: hnd2.id },
    { code: "CSC402", title: "Artificial Intelligence", credits: 3, sem: Semester.FIRST, levelId: hnd2.id },
    { code: "CSC403", title: "Mobile Application Development", credits: 3, sem: Semester.FIRST, levelId: hnd2.id },
    { code: "CSC404", title: "Distributed Systems", credits: 3, sem: Semester.FIRST, levelId: hnd2.id },
    { code: "CSC405", title: "Research Methods", credits: 2, sem: Semester.FIRST, levelId: hnd2.id },
    { code: "CSC406", title: "Information Security", credits: 2, sem: Semester.FIRST, levelId: hnd2.id },
  ];

  const courses: Record<string, string> = {};
  for (const c of courseDefs) {
    const course = await prisma.course.upsert({
      where: { code: c.code },
      update: {},
      create: {
        code: c.code,
        title: c.title,
        creditUnits: c.credits,
        semester: c.sem,
        levelId: c.levelId,
      },
    });
    courses[c.code] = course.id;
  }

  console.log(`✓ ${courseDefs.length} courses created`);

  // ── Exam Halls ─────────────────────────────────────────────────────────────

  const hallDefs = [
    { id: "hall-cbt1",  code: "CBT1",  name: "CBT Centre 1",             capacity: 100, lat: 6.51810, lng: 3.36850 },
    { id: "hall-cbt2",  code: "CBT2",  name: "CBT Centre 2",             capacity: 100, lat: 6.51790, lng: 3.36900 },
    { id: "hall-mpha",  code: "MPHA",  name: "Multipurpose Hall A",       capacity: 200, lat: 6.51750, lng: 3.36780 },
    { id: "hall-mphb",  code: "MPHB",  name: "Multipurpose Hall B",       capacity: 200, lat: 6.51730, lng: 3.36820 },
    { id: "hall-bclh",  code: "BCLH",  name: "Block C Lecture Hall",      capacity:  80, lat: 6.51850, lng: 3.36750 },
    { id: "hall-bdlh",  code: "BDLH",  name: "Block D Lecture Hall",      capacity:  80, lat: 6.51830, lng: 3.36700 },
    { id: "hall-sota",  code: "SOTA",  name: "School of Tech Auditorium", capacity: 300, lat: 6.51700, lng: 3.36950 },
  ];

  for (const h of hallDefs) {
    await prisma.examHall.upsert({
      where: { id: h.id },
      update: {},
      create: {
        id: h.id,
        name: h.name,
        code: h.code,
        capacity: h.capacity,
        latitude: h.lat,
        longitude: h.lng,
        isActive: true,
      },
    });
  }

  console.log(`✓ ${hallDefs.length} exam halls created`);

  // ── Navigation Nodes ───────────────────────────────────────────────────────

  const nodeDefs = [
    { id: "node-main-gate",   label: "Main Gate",                    lat: 6.51900, lng: 3.36800, type: NodeType.ENTRY,    hallId: null },
    { id: "node-hostel",      label: "Hostel Area",                  lat: 6.51950, lng: 3.36950, type: NodeType.ENTRY,    hallId: null },
    { id: "node-admin-blk",   label: "Administrative Block",         lat: 6.51830, lng: 3.36830, type: NodeType.LANDMARK, hallId: null },
    { id: "node-library",     label: "Library",                      lat: 6.51800, lng: 3.36880, type: NodeType.LANDMARK, hallId: null },
    { id: "node-sot-blk",     label: "School of Technology Block",   lat: 6.51770, lng: 3.36850, type: NodeType.JUNCTION, hallId: null },
    { id: "node-jct-a",       label: "Junction A",                   lat: 6.51860, lng: 3.36810, type: NodeType.JUNCTION, hallId: null },
    { id: "node-jct-b",       label: "Junction B",                   lat: 6.51820, lng: 3.36800, type: NodeType.JUNCTION, hallId: null },
    { id: "node-jct-c",       label: "Junction C",                   lat: 6.51780, lng: 3.36820, type: NodeType.JUNCTION, hallId: null },
    // Hall nodes (one per hall)
    { id: "node-hall-cbt1",  label: "CBT Centre 1",             lat: 6.51810, lng: 3.36850, type: NodeType.HALL, hallId: "hall-cbt1" },
    { id: "node-hall-cbt2",  label: "CBT Centre 2",             lat: 6.51790, lng: 3.36900, type: NodeType.HALL, hallId: "hall-cbt2" },
    { id: "node-hall-mpha",  label: "Multipurpose Hall A",       lat: 6.51750, lng: 3.36780, type: NodeType.HALL, hallId: "hall-mpha" },
    { id: "node-hall-mphb",  label: "Multipurpose Hall B",       lat: 6.51730, lng: 3.36820, type: NodeType.HALL, hallId: "hall-mphb" },
    { id: "node-hall-bclh",  label: "Block C Lecture Hall",      lat: 6.51850, lng: 3.36750, type: NodeType.HALL, hallId: "hall-bclh" },
    { id: "node-hall-bdlh",  label: "Block D Lecture Hall",      lat: 6.51830, lng: 3.36700, type: NodeType.HALL, hallId: "hall-bdlh" },
    { id: "node-hall-sota",  label: "School of Tech Auditorium", lat: 6.51700, lng: 3.36950, type: NodeType.HALL, hallId: "hall-sota" },
  ];

  for (const n of nodeDefs) {
    await prisma.navigationNode.upsert({
      where: { id: n.id },
      update: {},
      create: {
        id: n.id,
        label: n.label,
        latitude: n.lat,
        longitude: n.lng,
        nodeType: n.type,
        examHallId: n.hallId ?? undefined,
      },
    });
  }

  // ── Navigation Paths (A→B only — bidirectionality handled in Dijkstra code) ─

  function dist(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  type PathDef = { id: string; from: string; to: string; fromLat: number; fromLng: number; toLat: number; toLng: number };

  const pathDefs: PathDef[] = [
    // Main campus arteries
    { id: "path-gate-jcta",   from: "node-main-gate",  to: "node-jct-a",      fromLat: 6.51900, fromLng: 3.36800, toLat: 6.51860, toLng: 3.36810 },
    { id: "path-hostel-admin", from: "node-hostel",    to: "node-admin-blk",  fromLat: 6.51950, fromLng: 3.36950, toLat: 6.51830, toLng: 3.36830 },
    { id: "path-admin-jcta",  from: "node-admin-blk",  to: "node-jct-a",      fromLat: 6.51830, fromLng: 3.36830, toLat: 6.51860, toLng: 3.36810 },
    { id: "path-jcta-jctb",   from: "node-jct-a",      to: "node-jct-b",      fromLat: 6.51860, fromLng: 3.36810, toLat: 6.51820, toLng: 3.36800 },
    { id: "path-jctb-lib",    from: "node-jct-b",      to: "node-library",    fromLat: 6.51820, fromLng: 3.36800, toLat: 6.51800, toLng: 3.36880 },
    { id: "path-jctb-jctc",   from: "node-jct-b",      to: "node-jct-c",      fromLat: 6.51820, fromLng: 3.36800, toLat: 6.51780, toLng: 3.36820 },
    { id: "path-jctc-sot",    from: "node-jct-c",      to: "node-sot-blk",    fromLat: 6.51780, fromLng: 3.36820, toLat: 6.51770, toLng: 3.36850 },
    // Halls from SOT Block
    { id: "path-sot-cbt1",   from: "node-sot-blk",    to: "node-hall-cbt1",  fromLat: 6.51770, fromLng: 3.36850, toLat: 6.51810, toLng: 3.36850 },
    { id: "path-sot-cbt2",   from: "node-sot-blk",    to: "node-hall-cbt2",  fromLat: 6.51770, fromLng: 3.36850, toLat: 6.51790, toLng: 3.36900 },
    { id: "path-sot-mpha",   from: "node-sot-blk",    to: "node-hall-mpha",  fromLat: 6.51770, fromLng: 3.36850, toLat: 6.51750, toLng: 3.36780 },
    { id: "path-sot-mphb",   from: "node-sot-blk",    to: "node-hall-mphb",  fromLat: 6.51770, fromLng: 3.36850, toLat: 6.51730, toLng: 3.36820 },
    { id: "path-sot-sota",   from: "node-sot-blk",    to: "node-hall-sota",  fromLat: 6.51770, fromLng: 3.36850, toLat: 6.51700, toLng: 3.36950 },
    // Halls reachable from Junction A
    { id: "path-jcta-bclh",  from: "node-jct-a",      to: "node-hall-bclh",  fromLat: 6.51860, fromLng: 3.36810, toLat: 6.51850, toLng: 3.36750 },
    { id: "path-jcta-bdlh",  from: "node-jct-a",      to: "node-hall-bdlh",  fromLat: 6.51860, fromLng: 3.36810, toLat: 6.51830, toLng: 3.36700 },
  ];

  for (const p of pathDefs) {
    const d = dist(p.fromLat, p.fromLng, p.toLat, p.toLng);
    await prisma.navigationPath.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        fromNodeId: p.from,
        toNodeId: p.to,
        distanceMeters: Math.round(d),
        pathCoordinates: [
          [p.fromLat, p.fromLng],
          [p.toLat, p.toLng],
        ],
      },
    });
  }

  console.log(`✓ ${nodeDefs.length} navigation nodes + ${pathDefs.length} paths created`);

  // ── Superadmin ─────────────────────────────────────────────────────────────

  await prisma.admin.upsert({
    where: { email: "admin@yabatech-examportal.com" },
    update: {},
    create: {
      email: "admin@yabatech-examportal.com",
      fullName: "Super Admin",
      role: "SUPERADMIN",
    },
  });

  console.log("✓ Superadmin record created (link Supabase Auth user via /api/admin/setup)");

  // ── Demo Students (50) ─────────────────────────────────────────────────────

  type LevelConfig = {
    levelId: string;
    programmeId: string;
    prefix: string;
    programme: string;
    count: number;
    courseCodes: string[];
  };

  const levelConfigs: LevelConfig[] = [
    {
      levelId: nd1.id,
      programmeId: ndProgramme.id,
      prefix: "ND1",
      programme: "ND",
      count: 15,
      courseCodes: ["CSC101", "CSC102", "MTH101", "GNS101", "EEC101", "CSC103"],
    },
    {
      levelId: nd2.id,
      programmeId: ndProgramme.id,
      prefix: "ND2",
      programme: "ND",
      count: 15,
      courseCodes: ["CSC201", "CSC202", "CSC203", "MTH201", "CSC204", "ENT201"],
    },
    {
      levelId: hnd1.id,
      programmeId: hndProgramme.id,
      prefix: "HND1",
      programme: "HND",
      count: 10,
      courseCodes: ["CSC301", "CSC302", "CSC303", "CSC304", "STA301", "CSC305"],
    },
    {
      levelId: hnd2.id,
      programmeId: hndProgramme.id,
      prefix: "HND2",
      programme: "HND",
      count: 10,
      courseCodes: ["CSC401", "CSC402", "CSC403", "CSC404", "CSC405", "CSC406"],
    },
  ];

  const SESSION = "2024/2025 First Semester";
  let studentSeq = 1;

  for (const cfg of levelConfigs) {
    for (let i = 1; i <= cfg.count; i++) {
      const seq = String(studentSeq).padStart(4, "0");
      const matric = `YCT/${cfg.programme}/COM/24/${seq}`;
      const email = `student${studentSeq}@demo.yct.edu.ng`;

      const student = await prisma.student.upsert({
        where: { matricNumber: matric },
        update: {},
        create: {
          matricNumber: matric,
          fullName: `Demo Student ${studentSeq} (${cfg.prefix})`,
          email,
          levelId: cfg.levelId,
          departmentId: department.id,
          programmeId: cfg.programmeId,
        },
      });

      // Each student enrolls in 5 of their 6 level courses (deliberate overlap — all 15 ND1 students share CSC101-CSC103+MTH101+GNS101)
      const enrollCodes = cfg.courseCodes.slice(0, 5);
      for (const code of enrollCodes) {
        await prisma.studentCourse.upsert({
          where: {
            studentId_courseId_session: {
              studentId: student.id,
              courseId: courses[code]!,
              session: SESSION,
            },
          },
          update: {},
          create: {
            studentId: student.id,
            courseId: courses[code]!,
            session: SESSION,
          },
        });
      }

      studentSeq++;
    }
  }

  console.log(`✓ 50 demo students created with enrollments for session "${SESSION}"`);
  console.log("");
  console.log("🎉 Seed complete!");
  console.log("");
  console.log("Next steps:");
  console.log("  1. Add your Supabase credentials to .env.local");
  console.log("  2. Run: npx prisma migrate dev --name init");
  console.log("  3. Run: npx prisma db seed");
  console.log("  4. Create superadmin auth user at: POST /api/admin/setup");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
