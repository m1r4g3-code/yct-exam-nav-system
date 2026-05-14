import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { PrismaClient, Semester, NodeType } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ── Types ──────────────────────────────────────────────────────────────────────
type CourseDef = { code: string; title: string; credits: number; sem: Semester };
type LevelCourses = { nd1: CourseDef[]; nd2: CourseDef[]; hnd1: CourseDef[]; hnd2: CourseDef[] };

// ── Helper ─────────────────────────────────────────────────────────────────────
async function createDept(
  name: string,
  code: string,
  schoolId: string,
  courses: LevelCourses,
) {
  const dept = await prisma.department.upsert({
    where: { code },
    update: {},
    create: { name, code, schoolId },
  });

  const nd = await prisma.programme.upsert({
    where: { departmentId_code: { departmentId: dept.id, code: "ND" } },
    update: {},
    create: { name: "National Diploma", code: "ND", departmentId: dept.id },
  });

  const hnd = await prisma.programme.upsert({
    where: { departmentId_code: { departmentId: dept.id, code: "HND" } },
    update: {},
    create: { name: "Higher National Diploma", code: "HND", departmentId: dept.id },
  });

  const nd1 = await prisma.level.upsert({
    where: { programmeId_year: { programmeId: nd.id, year: 1 } },
    update: {},
    create: { name: "ND 1", year: 1, programmeId: nd.id },
  });

  const nd2 = await prisma.level.upsert({
    where: { programmeId_year: { programmeId: nd.id, year: 2 } },
    update: {},
    create: { name: "ND 2", year: 2, programmeId: nd.id },
  });

  const hnd1 = await prisma.level.upsert({
    where: { programmeId_year: { programmeId: hnd.id, year: 1 } },
    update: {},
    create: { name: "HND 1", year: 1, programmeId: hnd.id },
  });

  const hnd2 = await prisma.level.upsert({
    where: { programmeId_year: { programmeId: hnd.id, year: 2 } },
    update: {},
    create: { name: "HND 2", year: 2, programmeId: hnd.id },
  });

  const levelMap = { nd1: nd1.id, nd2: nd2.id, hnd1: hnd1.id, hnd2: hnd2.id } as const;
  const allCourses = [
    ...courses.nd1.map((c) => ({ ...c, levelId: levelMap.nd1 })),
    ...courses.nd2.map((c) => ({ ...c, levelId: levelMap.nd2 })),
    ...courses.hnd1.map((c) => ({ ...c, levelId: levelMap.hnd1 })),
    ...courses.hnd2.map((c) => ({ ...c, levelId: levelMap.hnd2 })),
  ];

  const courseIds: Record<string, string> = {};
  for (const c of allCourses) {
    const course = await prisma.course.upsert({
      where: { code: c.code },
      update: {},
      create: { code: c.code, title: c.title, creditUnits: c.credits, semester: c.sem, levelId: c.levelId },
    });
    courseIds[c.code] = course.id;
  }

  return { dept, nd, hnd, nd1, nd2, hnd1, hnd2, courseIds } as const;
}

// ── Course definitions ─────────────────────────────────────────────────────────

const F = Semester.FIRST;
const S = Semester.SECOND;

// Computer Technology (CSC) — real NBTE COM-prefix codes
const cscCourses: LevelCourses = {
  nd1: [
    { code: "COM111", title: "Introduction to Computing", credits: 3, sem: F },
    { code: "COM112", title: "Introduction to Digital Electronics", credits: 3, sem: F },
    { code: "COM113", title: "Introduction to Computer Programming", credits: 3, sem: F },
    { code: "MTH111", title: "General Mathematics I", credits: 3, sem: F },
    { code: "GNS111", title: "Communication in English I", credits: 2, sem: F },
    { code: "STA111", title: "Descriptive Statistics", credits: 2, sem: F },
    { code: "COM121", title: "Introduction to Java Programming", credits: 3, sem: S },
    { code: "COM122", title: "Introduction to Internet", credits: 3, sem: S },
    { code: "COM123", title: "Computer Application Packages I", credits: 3, sem: S },
    { code: "COM124", title: "Data Structures and Algorithms", credits: 3, sem: S },
    { code: "COM125", title: "Systems Analysis and Design I", credits: 3, sem: S },
    { code: "COM126", title: "PC Upgrade and Maintenance", credits: 2, sem: S },
  ],
  nd2: [
    { code: "COM211", title: "Visual Basic Programming", credits: 3, sem: F },
    { code: "COM212", title: "Introduction to System Programming", credits: 3, sem: F },
    { code: "COM213", title: "Unified Modelling Language", credits: 3, sem: F },
    { code: "COM214", title: "File Organisation and Management", credits: 3, sem: F },
    { code: "COM215", title: "Computer Packages II", credits: 2, sem: F },
    { code: "COM216", title: "Computer Troubleshooting I", credits: 2, sem: F },
    { code: "BAM126", title: "Introduction to Entrepreneurship", credits: 2, sem: F },
    { code: "COM223", title: "Basic Hardware Maintenance", credits: 3, sem: S },
    { code: "COM224", title: "Management Information Systems", credits: 3, sem: S },
    { code: "COM225", title: "Web Technology", credits: 3, sem: S },
    { code: "COM226", title: "Computer Troubleshooting II", credits: 2, sem: S },
    { code: "BAM216", title: "Practice of Entrepreneurship", credits: 2, sem: S },
  ],
  hnd1: [
    { code: "COM311", title: "Operating Systems I", credits: 3, sem: F },
    { code: "COM312", title: "Database Design I", credits: 3, sem: F },
    { code: "COM313", title: "Systems Programming I", credits: 3, sem: F },
    { code: "COM314", title: "Visual Basic Programming II", credits: 3, sem: F },
    { code: "COM315", title: "Object-Oriented Programming", credits: 3, sem: F },
    { code: "COM321", title: "Operating Systems II", credits: 3, sem: S },
    { code: "COM322", title: "Database Design II", credits: 3, sem: S },
    { code: "COM323", title: "Computer Networks I", credits: 3, sem: S },
    { code: "COM324", title: "Software Engineering I", credits: 3, sem: S },
    { code: "COM325", title: "Web Design and Programming", credits: 3, sem: S },
  ],
  hnd2: [
    { code: "COM411", title: "Computer Networks II", credits: 3, sem: F },
    { code: "COM412", title: "Software Engineering II", credits: 3, sem: F },
    { code: "COM413", title: "Mobile Application Development", credits: 3, sem: F },
    { code: "COM414", title: "Distributed Computing", credits: 3, sem: F },
    { code: "COM415", title: "Information Security", credits: 3, sem: F },
    { code: "COM421", title: "Project Management", credits: 3, sem: S },
    { code: "COM422", title: "E-Commerce", credits: 3, sem: S },
    { code: "COM423", title: "Cloud Computing", credits: 3, sem: S },
    { code: "COM424", title: "Data Mining and Analytics", credits: 3, sem: S },
  ],
};

// Generic course builder: creates 5 courses per level (3 first + 2 second sem)
function makeCourses(p: string): LevelCourses {
  return {
    nd1: [
      { code: `${p}111`, title: "Technical Drawing and Graphics", credits: 3, sem: F },
      { code: `${p}112`, title: "Applied Mathematics I", credits: 3, sem: F },
      { code: `${p}113`, title: `Introduction to ${p} Technology`, credits: 3, sem: F },
      { code: `${p}114`, title: "Communication Skills I", credits: 2, sem: S },
      { code: `${p}115`, title: "Workshop/Laboratory Practice I", credits: 3, sem: S },
    ],
    nd2: [
      { code: `${p}211`, title: "Applied Mathematics II", credits: 3, sem: F },
      { code: `${p}212`, title: "Core Technology Practice I", credits: 3, sem: F },
      { code: `${p}213`, title: "Entrepreneurship I", credits: 2, sem: F },
      { code: `${p}214`, title: "Core Technology Practice II", credits: 3, sem: S },
      { code: `${p}215`, title: "Project Work and SIWES", credits: 3, sem: S },
    ],
    hnd1: [
      { code: `${p}311`, title: "Advanced Theory I", credits: 3, sem: F },
      { code: `${p}312`, title: "Advanced Laboratory/Studio I", credits: 3, sem: F },
      { code: `${p}313`, title: "Research Methods", credits: 2, sem: F },
      { code: `${p}314`, title: "Advanced Theory II", credits: 3, sem: S },
      { code: `${p}315`, title: "Advanced Laboratory/Studio II", credits: 3, sem: S },
    ],
    hnd2: [
      { code: `${p}411`, title: "Specialisation Seminar", credits: 3, sem: F },
      { code: `${p}412`, title: "Industrial Attachment", credits: 3, sem: F },
      { code: `${p}413`, title: "Project Management", credits: 2, sem: F },
      { code: `${p}414`, title: "Final Year Project I", credits: 3, sem: S },
      { code: `${p}415`, title: "Final Year Project II", credits: 3, sem: S },
    ],
  };
}

// Named course definitions for departments with distinct curricula
function makeEngCourses(p: string, intro: string, core1: string, core2: string, core3: string): LevelCourses {
  return {
    nd1: [
      { code: `${p}111`, title: "Technical Drawing", credits: 3, sem: F },
      { code: `${p}112`, title: "Engineering Mathematics I", credits: 3, sem: F },
      { code: `${p}113`, title: intro, credits: 3, sem: F },
      { code: `${p}114`, title: "Workshop Technology", credits: 3, sem: S },
      { code: `${p}115`, title: "Engineering Physics", credits: 3, sem: S },
      { code: `${p}116`, title: "Communication in English", credits: 2, sem: S },
    ],
    nd2: [
      { code: `${p}211`, title: core1, credits: 3, sem: F },
      { code: `${p}212`, title: "Engineering Mathematics II", credits: 3, sem: F },
      { code: `${p}213`, title: core2, credits: 3, sem: F },
      { code: `${p}214`, title: core3, credits: 3, sem: S },
      { code: `${p}215`, title: "Entrepreneurship Development", credits: 2, sem: S },
      { code: `${p}216`, title: "SIWES", credits: 3, sem: S },
    ],
    hnd1: [
      { code: `${p}311`, title: `Advanced ${intro}`, credits: 3, sem: F },
      { code: `${p}312`, title: `${core1} Advanced`, credits: 3, sem: F },
      { code: `${p}313`, title: "Computer-Aided Design", credits: 3, sem: F },
      { code: `${p}314`, title: `${core2} II`, credits: 3, sem: S },
      { code: `${p}315`, title: "Research Methodology", credits: 2, sem: S },
    ],
    hnd2: [
      { code: `${p}411`, title: "Industrial Management", credits: 2, sem: F },
      { code: `${p}412`, title: `${core3} Advanced`, credits: 3, sem: F },
      { code: `${p}413`, title: "Final Year Project I", credits: 3, sem: F },
      { code: `${p}414`, title: "Final Year Project II", credits: 4, sem: S },
      { code: `${p}415`, title: "Seminar and Technical Report Writing", credits: 2, sem: S },
    ],
  };
}

const eecCourses: LevelCourses = {
  nd1: [
    { code: "EEC111", title: "Electrical Graphics", credits: 3, sem: F },
    { code: "EEC112", title: "Introduction to Computer Software", credits: 2, sem: F },
    { code: "EEC113", title: "Electrical Engineering Science I", credits: 3, sem: F },
    { code: "EEC114", title: "Engineering Mathematics I", credits: 3, sem: F },
    { code: "EEC115", title: "Report Writing and Communication", credits: 2, sem: S },
    { code: "EEC116", title: "Computer Hardware", credits: 2, sem: S },
    { code: "EEC117", title: "Electrical Power I", credits: 3, sem: S },
  ],
  nd2: [
    { code: "EEC211", title: "Electrical Machine I", credits: 3, sem: F },
    { code: "EEC212", title: "Electronics I", credits: 3, sem: F },
    { code: "EEC213", title: "Electrical Engineering Science II", credits: 3, sem: F },
    { code: "EEC214", title: "Telecommunications I", credits: 3, sem: S },
    { code: "EEC215", title: "Electrical Installation", credits: 3, sem: S },
    { code: "EEC216", title: "Entrepreneurship", credits: 2, sem: S },
  ],
  hnd1: [
    { code: "EEC311", title: "Power Systems I", credits: 3, sem: F },
    { code: "EEC312", title: "Electronics II", credits: 3, sem: F },
    { code: "EEC313", title: "Control Systems I", credits: 3, sem: F },
    { code: "EEC314", title: "Power Systems II", credits: 3, sem: S },
    { code: "EEC315", title: "Telecommunications II", credits: 3, sem: S },
  ],
  hnd2: [
    { code: "EEC411", title: "High Voltage Engineering", credits: 3, sem: F },
    { code: "EEC412", title: "Industrial Electronics", credits: 3, sem: F },
    { code: "EEC413", title: "Control Systems II", credits: 3, sem: F },
    { code: "EEC414", title: "Final Year Project I", credits: 3, sem: S },
    { code: "EEC415", title: "Final Year Project II", credits: 4, sem: S },
  ],
};

const mecCourses: LevelCourses = {
  nd1: [
    { code: "MEC111", title: "Mechanical Engineering Science (Statics)", credits: 3, sem: F },
    { code: "MEC112", title: "Technical Drawing", credits: 3, sem: F },
    { code: "MEC113", title: "Engineering Mathematics I", credits: 3, sem: F },
    { code: "MEC114", title: "Workshop Technology I", credits: 3, sem: S },
    { code: "MEC115", title: "Thermodynamics I", credits: 3, sem: S },
    { code: "MEC116", title: "Communication in English", credits: 2, sem: S },
  ],
  nd2: [
    { code: "MEC211", title: "Mechanical Engineering Science (Dynamics)", credits: 3, sem: F },
    { code: "MEC212", title: "Machine Tools Technology", credits: 3, sem: F },
    { code: "MEC213", title: "Thermodynamics II", credits: 3, sem: F },
    { code: "MEC214", title: "Fluid Mechanics I", credits: 3, sem: S },
    { code: "MEC215", title: "Manufacturing Technology", credits: 3, sem: S },
    { code: "MEC216", title: "SIWES", credits: 3, sem: S },
  ],
  hnd1: [
    { code: "MEC311", title: "Theory of Machines I", credits: 3, sem: F },
    { code: "MEC312", title: "Strength of Materials I", credits: 3, sem: F },
    { code: "MEC313", title: "Heat Transfer", credits: 3, sem: F },
    { code: "MEC314", title: "Theory of Machines II", credits: 3, sem: S },
    { code: "MEC315", title: "Fluid Mechanics II", credits: 3, sem: S },
  ],
  hnd2: [
    { code: "MEC411", title: "Production Engineering", credits: 3, sem: F },
    { code: "MEC412", title: "Industrial Management", credits: 2, sem: F },
    { code: "MEC413", title: "Refrigeration and Air Conditioning", credits: 3, sem: F },
    { code: "MEC414", title: "Final Year Project I", credits: 3, sem: S },
    { code: "MEC415", title: "Final Year Project II", credits: 4, sem: S },
  ],
};

const civCourses: LevelCourses = {
  nd1: [
    { code: "CIV111", title: "Engineering Drawing", credits: 3, sem: F },
    { code: "CIV112", title: "Engineering Mathematics I", credits: 3, sem: F },
    { code: "CIV113", title: "Building Materials and Construction", credits: 3, sem: F },
    { code: "CIV114", title: "Surveying I", credits: 3, sem: S },
    { code: "CIV115", title: "Engineering Physics", credits: 3, sem: S },
    { code: "CIV116", title: "Communication in English", credits: 2, sem: S },
  ],
  nd2: [
    { code: "CIV211", title: "Structural Analysis I", credits: 3, sem: F },
    { code: "CIV212", title: "Soil Mechanics I", credits: 3, sem: F },
    { code: "CIV213", title: "Hydraulics I", credits: 3, sem: F },
    { code: "CIV214", title: "Concrete Technology", credits: 3, sem: S },
    { code: "CIV215", title: "Construction Technology", credits: 3, sem: S },
    { code: "CIV216", title: "SIWES", credits: 3, sem: S },
  ],
  hnd1: [
    { code: "CIV311", title: "Structural Analysis II", credits: 3, sem: F },
    { code: "CIV312", title: "Soil Mechanics II", credits: 3, sem: F },
    { code: "CIV313", title: "Highway Engineering", credits: 3, sem: F },
    { code: "CIV314", title: "Water Supply and Treatment", credits: 3, sem: S },
    { code: "CIV315", title: "Theory of Structures", credits: 3, sem: S },
  ],
  hnd2: [
    { code: "CIV411", title: "Foundation Engineering", credits: 3, sem: F },
    { code: "CIV412", title: "Project Planning and Management", credits: 3, sem: F },
    { code: "CIV413", title: "Environmental Engineering", credits: 3, sem: F },
    { code: "CIV414", title: "Final Year Project I", credits: 3, sem: S },
    { code: "CIV415", title: "Final Year Project II", credits: 4, sem: S },
  ],
};

const accCourses: LevelCourses = {
  nd1: [
    { code: "ACC111", title: "Principles of Accounting I", credits: 3, sem: F },
    { code: "ACC112", title: "Business Mathematics", credits: 3, sem: F },
    { code: "ACC113", title: "Introduction to Business", credits: 3, sem: F },
    { code: "ACC114", title: "Principles of Accounting II", credits: 3, sem: S },
    { code: "ACC115", title: "Communication Skills", credits: 2, sem: S },
    { code: "ACC116", title: "Economics I", credits: 3, sem: S },
  ],
  nd2: [
    { code: "ACC211", title: "Financial Accounting I", credits: 3, sem: F },
    { code: "ACC212", title: "Cost Accounting I", credits: 3, sem: F },
    { code: "ACC213", title: "Auditing I", credits: 3, sem: F },
    { code: "ACC214", title: "Financial Accounting II", credits: 3, sem: S },
    { code: "ACC215", title: "Business Law", credits: 3, sem: S },
    { code: "ACC216", title: "Taxation", credits: 3, sem: S },
  ],
  hnd1: [
    { code: "ACC311", title: "Advanced Financial Accounting", credits: 3, sem: F },
    { code: "ACC312", title: "Management Accounting", credits: 3, sem: F },
    { code: "ACC313", title: "Auditing and Assurance", credits: 3, sem: F },
    { code: "ACC314", title: "Company Law and Practice", credits: 3, sem: S },
    { code: "ACC315", title: "Advanced Cost Accounting", credits: 3, sem: S },
  ],
  hnd2: [
    { code: "ACC411", title: "Financial Management", credits: 3, sem: F },
    { code: "ACC412", title: "Advanced Taxation", credits: 3, sem: F },
    { code: "ACC413", title: "Public Sector Accounting", credits: 3, sem: F },
    { code: "ACC414", title: "Research Project I", credits: 3, sem: S },
    { code: "ACC415", title: "Research Project II", credits: 4, sem: S },
  ],
};

const bamCourses: LevelCourses = {
  nd1: [
    { code: "BAM111", title: "Principles of Management I", credits: 3, sem: F },
    { code: "BAM112", title: "Business Mathematics", credits: 3, sem: F },
    { code: "BAM113", title: "Introduction to Business", credits: 3, sem: F },
    { code: "BAM114", title: "Principles of Management II", credits: 3, sem: S },
    { code: "BAM115", title: "Business Communication", credits: 2, sem: S },
    { code: "BAM116", title: "Economics I", credits: 3, sem: S },
  ],
  nd2: [
    { code: "BAM211", title: "Organisational Behaviour", credits: 3, sem: F },
    { code: "BAM212", title: "Marketing Principles", credits: 3, sem: F },
    { code: "BAM213", title: "Financial Management I", credits: 3, sem: F },
    { code: "BAM214", title: "Human Resource Management", credits: 3, sem: S },
    { code: "BAM215", title: "Business Law", credits: 3, sem: S },
    { code: "BAM217", title: "Entrepreneurship Practice", credits: 2, sem: S },
  ],
  hnd1: [
    { code: "BAM311", title: "Strategic Management", credits: 3, sem: F },
    { code: "BAM312", title: "Operations Management", credits: 3, sem: F },
    { code: "BAM313", title: "Management Information Systems", credits: 3, sem: F },
    { code: "BAM314", title: "Corporate Governance", credits: 3, sem: S },
    { code: "BAM315", title: "International Business", credits: 3, sem: S },
  ],
  hnd2: [
    { code: "BAM411", title: "Business Policy and Strategy", credits: 3, sem: F },
    { code: "BAM412", title: "Change Management", credits: 3, sem: F },
    { code: "BAM413", title: "Seminar in Management", credits: 2, sem: F },
    { code: "BAM414", title: "Research Project I", credits: 3, sem: S },
    { code: "BAM415", title: "Research Project II", credits: 4, sem: S },
  ],
};

const mktCourses: LevelCourses = {
  nd1: [
    { code: "MKT111", title: "Principles of Marketing I", credits: 3, sem: F },
    { code: "MKT112", title: "Business Mathematics", credits: 3, sem: F },
    { code: "MKT113", title: "Introduction to Business", credits: 3, sem: F },
    { code: "MKT114", title: "Principles of Marketing II", credits: 3, sem: S },
    { code: "MKT115", title: "Consumer Behaviour", credits: 3, sem: S },
    { code: "MKT116", title: "Communication Skills", credits: 2, sem: S },
  ],
  nd2: [
    { code: "MKT211", title: "Marketing Research", credits: 3, sem: F },
    { code: "MKT212", title: "Sales Management", credits: 3, sem: F },
    { code: "MKT213", title: "Advertising and Promotion", credits: 3, sem: F },
    { code: "MKT214", title: "Distribution Management", credits: 3, sem: S },
    { code: "MKT215", title: "Marketing of Services", credits: 3, sem: S },
    { code: "MKT216", title: "Entrepreneurship", credits: 2, sem: S },
  ],
  hnd1: [
    { code: "MKT311", title: "Strategic Marketing", credits: 3, sem: F },
    { code: "MKT312", title: "Brand Management", credits: 3, sem: F },
    { code: "MKT313", title: "Digital Marketing", credits: 3, sem: F },
    { code: "MKT314", title: "International Marketing", credits: 3, sem: S },
    { code: "MKT315", title: "Marketing Analytics", credits: 3, sem: S },
  ],
  hnd2: [
    { code: "MKT411", title: "Marketing Management", credits: 3, sem: F },
    { code: "MKT412", title: "Retail Management", credits: 3, sem: F },
    { code: "MKT413", title: "New Product Development", credits: 3, sem: F },
    { code: "MKT414", title: "Research Project I", credits: 3, sem: S },
    { code: "MKT415", title: "Research Project II", credits: 4, sem: S },
  ],
};

const bfnCourses: LevelCourses = {
  nd1: [
    { code: "BFN111", title: "Elements of Banking I", credits: 3, sem: F },
    { code: "BFN112", title: "Business Mathematics", credits: 3, sem: F },
    { code: "BFN113", title: "Introduction to Economics", credits: 3, sem: F },
    { code: "BFN114", title: "Elements of Banking II", credits: 3, sem: S },
    { code: "BFN115", title: "Principles of Accounting", credits: 3, sem: S },
    { code: "BFN116", title: "Communication Skills", credits: 2, sem: S },
  ],
  nd2: [
    { code: "BFN211", title: "Financial Institutions", credits: 3, sem: F },
    { code: "BFN212", title: "Money and Capital Markets", credits: 3, sem: F },
    { code: "BFN213", title: "Credit Management", credits: 3, sem: F },
    { code: "BFN214", title: "Bank Operations", credits: 3, sem: S },
    { code: "BFN215", title: "Business Law", credits: 3, sem: S },
    { code: "BFN216", title: "Entrepreneurship", credits: 2, sem: S },
  ],
  hnd1: [
    { code: "BFN311", title: "Advanced Banking Operations", credits: 3, sem: F },
    { code: "BFN312", title: "International Finance", credits: 3, sem: F },
    { code: "BFN313", title: "Financial Analysis", credits: 3, sem: F },
    { code: "BFN314", title: "Risk Management", credits: 3, sem: S },
    { code: "BFN315", title: "Investment Analysis", credits: 3, sem: S },
  ],
  hnd2: [
    { code: "BFN411", title: "Financial Regulation", credits: 3, sem: F },
    { code: "BFN412", title: "Portfolio Management", credits: 3, sem: F },
    { code: "BFN413", title: "Central Banking", credits: 3, sem: F },
    { code: "BFN414", title: "Research Project I", credits: 3, sem: S },
    { code: "BFN415", title: "Research Project II", credits: 4, sem: S },
  ],
};

const mccCourses: LevelCourses = {
  nd1: [
    { code: "MCC111", title: "Introduction to Mass Communication", credits: 3, sem: F },
    { code: "MCC112", title: "Media Writing I", credits: 3, sem: F },
    { code: "MCC113", title: "History of Communication", credits: 2, sem: F },
    { code: "MCC114", title: "Media Writing II", credits: 3, sem: S },
    { code: "MCC115", title: "Introduction to Journalism", credits: 3, sem: S },
    { code: "MCC116", title: "Photography Basics", credits: 2, sem: S },
  ],
  nd2: [
    { code: "MCC211", title: "Broadcast Journalism", credits: 3, sem: F },
    { code: "MCC212", title: "Print Journalism", credits: 3, sem: F },
    { code: "MCC213", title: "Media Law and Ethics", credits: 3, sem: F },
    { code: "MCC214", title: "Public Relations", credits: 3, sem: S },
    { code: "MCC215", title: "Advertising", credits: 3, sem: S },
    { code: "MCC216", title: "Feature Writing", credits: 2, sem: S },
  ],
  hnd1: [
    { code: "MCC311", title: "Advanced Broadcast Journalism", credits: 3, sem: F },
    { code: "MCC312", title: "Digital Media Production", credits: 3, sem: F },
    { code: "MCC313", title: "Media Management", credits: 3, sem: F },
    { code: "MCC314", title: "Investigative Journalism", credits: 3, sem: S },
    { code: "MCC315", title: "Social Media Strategy", credits: 3, sem: S },
  ],
  hnd2: [
    { code: "MCC411", title: "Media Entrepreneurship", credits: 3, sem: F },
    { code: "MCC412", title: "Documentary Production", credits: 3, sem: F },
    { code: "MCC413", title: "Crisis Communication", credits: 3, sem: F },
    { code: "MCC414", title: "Research Project I", credits: 3, sem: S },
    { code: "MCC415", title: "Research Project II", credits: 4, sem: S },
  ],
};

const arcCourses: LevelCourses = {
  nd1: [
    { code: "ARC111", title: "Architectural Drawing I", credits: 3, sem: F },
    { code: "ARC112", title: "History of Architecture I", credits: 2, sem: F },
    { code: "ARC113", title: "Building Technology I", credits: 3, sem: F },
    { code: "ARC114", title: "Architectural Drawing II", credits: 3, sem: S },
    { code: "ARC115", title: "Mathematics for Architects", credits: 3, sem: S },
    { code: "ARC116", title: "Surveying for Architects", credits: 2, sem: S },
  ],
  nd2: [
    { code: "ARC211", title: "Architectural Design I", credits: 4, sem: F },
    { code: "ARC212", title: "Structural Systems I", credits: 3, sem: F },
    { code: "ARC213", title: "Environmental Studies", credits: 3, sem: F },
    { code: "ARC214", title: "Architectural Design II", credits: 4, sem: S },
    { code: "ARC215", title: "Building Services", credits: 3, sem: S },
    { code: "ARC216", title: "Theory of Architecture", credits: 2, sem: S },
  ],
  hnd1: [
    { code: "ARC311", title: "Architectural Design III", credits: 4, sem: F },
    { code: "ARC312", title: "Urban Design", credits: 3, sem: F },
    { code: "ARC313", title: "Structural Design", credits: 3, sem: F },
    { code: "ARC314", title: "Architectural Design IV", credits: 4, sem: S },
    { code: "ARC315", title: "Professional Practice", credits: 2, sem: S },
  ],
  hnd2: [
    { code: "ARC411", title: "Architectural Design V", credits: 4, sem: F },
    { code: "ARC412", title: "Landscape Architecture", credits: 3, sem: F },
    { code: "ARC413", title: "Project Management", credits: 2, sem: F },
    { code: "ARC414", title: "Thesis Project I", credits: 4, sem: S },
    { code: "ARC415", title: "Thesis Project II", credits: 4, sem: S },
  ],
};

async function main() {
  console.log("🌱 Seeding Yabatech database...\n");

  // ── Schools ────────────────────────────────────────────────────────────────
  const schoolDefs = [
    { code: "SOE",  name: "School of Engineering" },
    { code: "SADP", name: "School of Art, Design & Printing" },
    { code: "SOS",  name: "School of Science" },
    { code: "SOT",  name: "School of Technology" },
    { code: "SES",  name: "School of Environmental Studies" },
    { code: "SLS",  name: "School of Liberal Studies" },
    { code: "SMBS", name: "School of Management & Business Studies" },
    { code: "STE",  name: "School of Technical & Vocational Education" },
  ];

  const schoolIds: Record<string, string> = {};
  for (const s of schoolDefs) {
    const school = await prisma.school.upsert({
      where: { code: s.code },
      update: {},
      create: { name: s.name, code: s.code },
    });
    schoolIds[s.code] = school.id;
  }
  console.log(`✓ ${schoolDefs.length} schools created`);

  // ── Departments + Programmes + Levels + Courses ────────────────────────────

  // SOT — Computer Technology
  const { courseIds: cscCourseIds, nd1: cscNd1, nd2: cscNd2, hnd1: cscHnd1, hnd2: cscHnd2, nd: cscNd, hnd: cscHnd } =
    await createDept("Computer Technology", "CSC", schoolIds.SOT!, cscCourses);

  await createDept("Electrical/Electronics Engineering", "EEE", schoolIds.SOE!, eecCourses);
  await createDept("Mechanical Engineering", "MCE", schoolIds.SOE!, mecCourses);
  await createDept("Civil Engineering", "CIV", schoolIds.SOE!, civCourses);
  await createDept("Computer Engineering", "CPE", schoolIds.SOE!,
    makeEngCourses("CPE", "Computer Engineering Science", "Digital Logic Design", "Microprocessor Systems", "Embedded Systems"));
  await createDept("Chemical Engineering", "CHE", schoolIds.SOE!,
    makeEngCourses("CHE", "Chemical Engineering Principles", "Thermodynamics", "Heat and Mass Transfer", "Reaction Engineering"));
  await createDept("Agricultural & Bio-Environmental Engineering", "ABE", schoolIds.SOE!,
    makeEngCourses("ABE", "Agricultural Engineering Science", "Farm Power and Machinery", "Irrigation and Drainage", "Post-Harvest Technology"));
  await createDept("Marine Engineering", "MAE", schoolIds.SOE!,
    makeEngCourses("MAE", "Marine Engineering Science", "Marine Diesel Engines", "Naval Architecture Basics", "Ship Operations"));
  await createDept("Industrial Maintenance Engineering", "IME", schoolIds.SOE!,
    makeEngCourses("IME", "Maintenance Engineering Principles", "Preventive Maintenance", "Reliability Engineering", "Condition Monitoring"));
  await createDept("Mechatronics Engineering", "MCT", schoolIds.SOE!,
    makeEngCourses("MCT", "Mechatronics Principles", "Sensors and Actuators", "Robotics I", "Automation Systems"));
  await createDept("Metallurgical Engineering", "MTE", schoolIds.SOE!,
    makeEngCourses("MTE", "Materials Science", "Physical Metallurgy", "Corrosion Engineering", "Heat Treatment"));
  await createDept("Mineral & Petroleum Resources Engineering", "MPE", schoolIds.SOE!,
    makeEngCourses("MPE", "Petroleum Engineering Principles", "Reservoir Engineering", "Drilling Engineering", "Production Engineering"));
  await createDept("Welding & Fabrication Engineering", "WFE", schoolIds.SOE!,
    makeEngCourses("WFE", "Welding Science", "Arc Welding Technology", "Fabrication Technology", "Welding Inspection"));

  console.log("✓ School of Engineering: 12 departments");

  // SADP — School of Art, Design & Printing
  await createDept("Fine Art", "FAT", schoolIds.SADP!, makeCourses("FAT"));
  await createDept("Industrial Design", "IDS", schoolIds.SADP!, makeCourses("IDS"));
  await createDept("Printing Technology", "PRT", schoolIds.SADP!, makeCourses("PRT"));
  await createDept("Graphic Design", "GDT", schoolIds.SADP!, makeCourses("GDT"));
  console.log("✓ School of Art, Design & Printing: 4 departments");

  // SOS — School of Science
  await createDept("Biological Science", "BIO", schoolIds.SOS!, makeCourses("BIO"));
  await createDept("Chemical Science", "CHM", schoolIds.SOS!, makeCourses("CHM"));
  await createDept("Physical Science", "PHY", schoolIds.SOS!, makeCourses("PHY"));
  await createDept("Mathematics", "MTH", schoolIds.SOS!, makeCourses("MTH"));
  await createDept("Statistics", "STA", schoolIds.SOS!, makeCourses("STA"));
  console.log("✓ School of Science: 5 departments");

  // SOT — School of Technology (CSC already created above with fixed IDs)
  await createDept("Agricultural Technology", "AGT", schoolIds.SOT!, makeCourses("AGT"));
  await createDept("Food Technology", "FOT", schoolIds.SOT!, makeCourses("FOT"));
  await createDept("Hospitality Management", "HOM", schoolIds.SOT!, makeCourses("HOM"));
  await createDept("Leisure & Tourism Management", "LTM", schoolIds.SOT!, makeCourses("LTM"));
  await createDept("Nutrition & Dietetics", "NUT", schoolIds.SOT!, makeCourses("NUT"));
  await createDept("Polymer & Textile Technology", "POL", schoolIds.SOT!, makeCourses("POL"));
  console.log("✓ School of Technology: 7 departments");

  // SES — School of Environmental Studies
  await createDept("Architecture", "ARC", schoolIds.SES!, arcCourses);
  await createDept("Building Technology", "BLT", schoolIds.SES!, makeCourses("BLT"));
  await createDept("Estate Management & Valuation", "EMV", schoolIds.SES!, makeCourses("EMV"));
  await createDept("Quantity Surveying", "QUS", schoolIds.SES!, makeCourses("QUS"));
  await createDept("Surveying & Geo-Informatics", "SGI", schoolIds.SES!, makeCourses("SGI"));
  await createDept("Urban & Regional Planning", "URP", schoolIds.SES!, makeCourses("URP"));
  console.log("✓ School of Environmental Studies: 6 departments");

  // SLS — School of Liberal Studies
  await createDept("Languages", "LAN", schoolIds.SLS!, makeCourses("LAN"));
  await createDept("Mass Communication", "MCC", schoolIds.SLS!, mccCourses);
  await createDept("Social Science", "SSC", schoolIds.SLS!, makeCourses("SSC"));
  console.log("✓ School of Liberal Studies: 3 departments");

  // SMBS — School of Management & Business Studies
  await createDept("Accountancy", "ACC", schoolIds.SMBS!, accCourses);
  await createDept("Business Administration & Management", "BAM", schoolIds.SMBS!, bamCourses);
  await createDept("Office Technology & Management", "OTM", schoolIds.SMBS!, makeCourses("OTM"));
  await createDept("Marketing", "MKT", schoolIds.SMBS!, mktCourses);
  await createDept("Banking & Finance", "BFN", schoolIds.SMBS!, bfnCourses);
  await createDept("Public Administration", "PAD", schoolIds.SMBS!, makeCourses("PAD"));
  console.log("✓ School of Management & Business Studies: 6 departments");

  // STE — School of Technical & Vocational Education
  await createDept("Vocational Education", "VED", schoolIds.STE!, makeCourses("VED"));
  await createDept("Science Education", "SED", schoolIds.STE!, makeCourses("SED"));
  await createDept("Art Education", "AED", schoolIds.STE!, makeCourses("AED"));
  await createDept("Educational Foundation", "EDF", schoolIds.STE!, makeCourses("EDF"));
  console.log("✓ School of Technical & Vocational Education: 4 departments");

  console.log("\n✓ Total: 8 schools, 40 departments seeded\n");

  // ── Exam Halls ─────────────────────────────────────────────────────────────
  const hallDefs = [
    { id: "hall-cbt1",  code: "CBT1",  name: "CBT Centre 1",              capacity: 100, lat: 6.51810, lng: 3.36850 },
    { id: "hall-cbt2",  code: "CBT2",  name: "CBT Centre 2",              capacity: 100, lat: 6.51790, lng: 3.36900 },
    { id: "hall-mpha",  code: "MPHA",  name: "Multipurpose Hall A",        capacity: 200, lat: 6.51750, lng: 3.36780 },
    { id: "hall-mphb",  code: "MPHB",  name: "Multipurpose Hall B",        capacity: 200, lat: 6.51730, lng: 3.36820 },
    { id: "hall-bclh",  code: "BCLH",  name: "Block C Lecture Hall",       capacity:  80, lat: 6.51850, lng: 3.36750 },
    { id: "hall-bdlh",  code: "BDLH",  name: "Block D Lecture Hall",       capacity:  80, lat: 6.51830, lng: 3.36700 },
    { id: "hall-sota",  code: "SOTA",  name: "School of Tech Auditorium",  capacity: 300, lat: 6.51700, lng: 3.36950 },
  ];

  for (const h of hallDefs) {
    await prisma.examHall.upsert({
      where: { id: h.id },
      update: {},
      create: { id: h.id, name: h.name, code: h.code, capacity: h.capacity, latitude: h.lat, longitude: h.lng, isActive: true },
    });
  }
  console.log(`✓ ${hallDefs.length} exam halls created`);

  // ── Navigation Nodes ───────────────────────────────────────────────────────
  const nodeDefs = [
    { id: "node-main-gate",  label: "Main Gate",                   lat: 6.51900, lng: 3.36800, type: NodeType.ENTRY,    hallId: null },
    { id: "node-hostel",     label: "Hostel Area",                  lat: 6.51950, lng: 3.36950, type: NodeType.ENTRY,    hallId: null },
    { id: "node-admin-blk",  label: "Administrative Block",         lat: 6.51830, lng: 3.36830, type: NodeType.LANDMARK, hallId: null },
    { id: "node-library",    label: "Library",                      lat: 6.51800, lng: 3.36880, type: NodeType.LANDMARK, hallId: null },
    { id: "node-sot-blk",    label: "School of Technology Block",   lat: 6.51770, lng: 3.36850, type: NodeType.JUNCTION, hallId: null },
    { id: "node-jct-a",      label: "Junction A",                   lat: 6.51860, lng: 3.36810, type: NodeType.JUNCTION, hallId: null },
    { id: "node-jct-b",      label: "Junction B",                   lat: 6.51820, lng: 3.36800, type: NodeType.JUNCTION, hallId: null },
    { id: "node-jct-c",      label: "Junction C",                   lat: 6.51780, lng: 3.36820, type: NodeType.JUNCTION, hallId: null },
    { id: "node-hall-cbt1",  label: "CBT Centre 1",                 lat: 6.51810, lng: 3.36850, type: NodeType.HALL, hallId: "hall-cbt1" },
    { id: "node-hall-cbt2",  label: "CBT Centre 2",                 lat: 6.51790, lng: 3.36900, type: NodeType.HALL, hallId: "hall-cbt2" },
    { id: "node-hall-mpha",  label: "Multipurpose Hall A",          lat: 6.51750, lng: 3.36780, type: NodeType.HALL, hallId: "hall-mpha" },
    { id: "node-hall-mphb",  label: "Multipurpose Hall B",          lat: 6.51730, lng: 3.36820, type: NodeType.HALL, hallId: "hall-mphb" },
    { id: "node-hall-bclh",  label: "Block C Lecture Hall",         lat: 6.51850, lng: 3.36750, type: NodeType.HALL, hallId: "hall-bclh" },
    { id: "node-hall-bdlh",  label: "Block D Lecture Hall",         lat: 6.51830, lng: 3.36700, type: NodeType.HALL, hallId: "hall-bdlh" },
    { id: "node-hall-sota",  label: "School of Tech Auditorium",    lat: 6.51700, lng: 3.36950, type: NodeType.HALL, hallId: "hall-sota" },
  ];

  for (const n of nodeDefs) {
    await prisma.navigationNode.upsert({
      where: { id: n.id },
      update: {},
      create: { id: n.id, label: n.label, latitude: n.lat, longitude: n.lng, nodeType: n.type, examHallId: n.hallId ?? undefined },
    });
  }

  function dist(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  type PathDef = { id: string; from: string; to: string; fromLat: number; fromLng: number; toLat: number; toLng: number };
  const pathDefs: PathDef[] = [
    { id: "path-gate-jcta",   from: "node-main-gate",  to: "node-jct-a",      fromLat: 6.51900, fromLng: 3.36800, toLat: 6.51860, toLng: 3.36810 },
    { id: "path-hostel-admin",from: "node-hostel",     to: "node-admin-blk",  fromLat: 6.51950, fromLng: 3.36950, toLat: 6.51830, toLng: 3.36830 },
    { id: "path-admin-jcta",  from: "node-admin-blk",  to: "node-jct-a",      fromLat: 6.51830, fromLng: 3.36830, toLat: 6.51860, toLng: 3.36810 },
    { id: "path-jcta-jctb",   from: "node-jct-a",      to: "node-jct-b",      fromLat: 6.51860, fromLng: 3.36810, toLat: 6.51820, toLng: 3.36800 },
    { id: "path-jctb-lib",    from: "node-jct-b",      to: "node-library",    fromLat: 6.51820, fromLng: 3.36800, toLat: 6.51800, toLng: 3.36880 },
    { id: "path-jctb-jctc",   from: "node-jct-b",      to: "node-jct-c",      fromLat: 6.51820, fromLng: 3.36800, toLat: 6.51780, toLng: 3.36820 },
    { id: "path-jctc-sot",    from: "node-jct-c",      to: "node-sot-blk",    fromLat: 6.51780, fromLng: 3.36820, toLat: 6.51770, toLng: 3.36850 },
    { id: "path-sot-cbt1",    from: "node-sot-blk",    to: "node-hall-cbt1",  fromLat: 6.51770, fromLng: 3.36850, toLat: 6.51810, toLng: 3.36850 },
    { id: "path-sot-cbt2",    from: "node-sot-blk",    to: "node-hall-cbt2",  fromLat: 6.51770, fromLng: 3.36850, toLat: 6.51790, toLng: 3.36900 },
    { id: "path-sot-mpha",    from: "node-sot-blk",    to: "node-hall-mpha",  fromLat: 6.51770, fromLng: 3.36850, toLat: 6.51750, toLng: 3.36780 },
    { id: "path-sot-mphb",    from: "node-sot-blk",    to: "node-hall-mphb",  fromLat: 6.51770, fromLng: 3.36850, toLat: 6.51730, toLng: 3.36820 },
    { id: "path-sot-sota",    from: "node-sot-blk",    to: "node-hall-sota",  fromLat: 6.51770, fromLng: 3.36850, toLat: 6.51700, toLng: 3.36950 },
    { id: "path-jcta-bclh",   from: "node-jct-a",      to: "node-hall-bclh",  fromLat: 6.51860, fromLng: 3.36810, toLat: 6.51850, toLng: 3.36750 },
    { id: "path-jcta-bdlh",   from: "node-jct-a",      to: "node-hall-bdlh",  fromLat: 6.51860, fromLng: 3.36810, toLat: 6.51830, toLng: 3.36700 },
  ];

  for (const p of pathDefs) {
    const d = dist(p.fromLat, p.fromLng, p.toLat, p.toLng);
    await prisma.navigationPath.upsert({
      where: { id: p.id },
      update: {},
      create: { id: p.id, fromNodeId: p.from, toNodeId: p.to, distanceMeters: Math.round(d), pathCoordinates: [[p.fromLat, p.fromLng], [p.toLat, p.toLng]] },
    });
  }
  console.log(`✓ ${nodeDefs.length} navigation nodes + ${pathDefs.length} paths created`);

  // ── Superadmin ─────────────────────────────────────────────────────────────
  await prisma.admin.upsert({
    where: { email: "admin@yabatech-examportal.com" },
    update: {},
    create: { email: "admin@yabatech-examportal.com", fullName: "Super Admin", role: "SUPERADMIN" },
  });
  console.log("✓ Superadmin record created");

  // ── Demo Students (50 Computer Technology students) ────────────────────────
  const levelConfigs = [
    { levelId: cscNd1.id,  programmeId: cscNd.id,  prefix: "ND1",  programme: "ND",  count: 15,
      courseCodes: ["COM111","COM112","COM113","MTH111","GNS111"] },
    { levelId: cscNd2.id,  programmeId: cscNd.id,  prefix: "ND2",  programme: "ND",  count: 15,
      courseCodes: ["COM211","COM212","COM213","COM214","COM215"] },
    { levelId: cscHnd1.id, programmeId: cscHnd.id, prefix: "HND1", programme: "HND", count: 10,
      courseCodes: ["COM311","COM312","COM313","COM314","COM315"] },
    { levelId: cscHnd2.id, programmeId: cscHnd.id, prefix: "HND2", programme: "HND", count: 10,
      courseCodes: ["COM411","COM412","COM413","COM414","COM415"] },
  ];

  const SESSION = "2024/2025 First Semester";

  // Get CSC dept id
  const cscDept = await prisma.department.findUnique({ where: { code: "CSC" } });
  if (!cscDept) throw new Error("CSC dept not found");

  let seq = 1;
  for (const cfg of levelConfigs) {
    for (let i = 1; i <= cfg.count; i++) {
      const matric = `YCT/${cfg.programme}/COM/24/${String(seq).padStart(4, "0")}`;
      const student = await prisma.student.upsert({
        where: { matricNumber: matric },
        update: {},
        create: {
          matricNumber: matric,
          fullName: `Demo Student ${seq} (${cfg.prefix})`,
          email: `student${seq}@demo.yct.edu.ng`,
          levelId: cfg.levelId,
          departmentId: cscDept.id,
          programmeId: cfg.programmeId,
        },
      });
      for (const code of cfg.courseCodes) {
        const courseId = cscCourseIds[code];
        if (!courseId) continue;
        await prisma.studentCourse.upsert({
          where: { studentId_courseId_session: { studentId: student.id, courseId, session: SESSION } },
          update: {},
          create: { studentId: student.id, courseId, session: SESSION },
        });
      }
      seq++;
    }
  }
  console.log(`✓ 50 demo students created (Computer Technology, session: ${SESSION})`);

  console.log("\n🎉 Seed complete!");
  console.log("   8 schools · 40 departments · 40×ND+HND programmes · 160 levels · 700+ courses");
  console.log("   50 demo students enrolled in Computer Technology");
}

main()
  .catch((e) => { console.error("Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
