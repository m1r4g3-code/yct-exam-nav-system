import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLevelConflictGraphSync } from "../lib/services/graph-builder";
import { runDsatur } from "../lib/services/timetable-generator";
import { planHallAssignments } from "../lib/services/hall-assigner";

/** n chronological slots: two per day (08:00 and 12:00). */
function makeSlots(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${String(i).padStart(2, "0")}`,
    date: new Date(Date.UTC(2026, 9, 19 + Math.floor(i / 2))),
    startTime: new Date(Date.UTC(1970, 0, 1, i % 2 === 0 ? 8 : 12)),
  }));
}

// The worked example from the documentation: three levels, ten courses.
const courses = [
  ...["a1", "a2", "a3", "a4"].map((id) => ({ id, levelId: "ND1" })),
  ...["b1", "b2", "b3"].map((id) => ({ id, levelId: "ND2" })),
  ...["c1", "c2", "c3"].map((id) => ({ id, levelId: "HND1" })),
];
const levelOf = new Map(courses.map((c) => [c.id, c.levelId]));

function slotsInUse(assignments: Map<string, string>) {
  const bySlot = new Map<string, string[]>();
  for (const [courseId, slotId] of assignments) {
    bySlot.set(slotId, [...(bySlot.get(slotId) ?? []), courseId]);
  }
  return bySlot;
}

test("the conflict graph joins every pair of courses in the same level, and nothing else", () => {
  const graph = buildLevelConflictGraphSync(courses);
  assert.ok(graph.adjacency.get("a1")?.has("a4"));
  assert.ok(!graph.adjacency.get("a1")?.has("b1"));
  assert.equal(graph.degree.get("a1"), 3);
  assert.equal(graph.degree.get("b2"), 2);
});

test("no level ever has two papers in the same slot", () => {
  const { assignments, unresolved } = runDsatur(buildLevelConflictGraphSync(courses), makeSlots(10));
  assert.equal(unresolved.length, 0);
  assert.equal(assignments.size, courses.length);
  for (const ids of slotsInUse(assignments).values()) {
    const levels = ids.map((id) => levelOf.get(id));
    assert.equal(new Set(levels).size, levels.length, `same-level clash in ${ids.join(", ")}`);
  }
});

test("with two halls, no slot holds more exams than there are halls", () => {
  const headcount = new Map(courses.map((c) => [c.id, 40]));
  const halls = [
    { id: "H1", capacity: 100 },
    { id: "H2", capacity: 60 },
  ];
  const { assignments, unresolved, overflow } = runDsatur(buildLevelConflictGraphSync(courses), makeSlots(10), {
    headcount,
    halls,
  });
  assert.equal(unresolved.length, 0);
  assert.equal(overflow.length, 0);
  assert.equal(assignments.size, courses.length);
  for (const ids of slotsInUse(assignments).values()) {
    assert.ok(ids.length <= halls.length, `${ids.length} exams share one slot`);
    const levels = ids.map((id) => levelOf.get(id));
    assert.equal(new Set(levels).size, levels.length);
  }

  // The hall plan agrees: every course gets a hall and every hall is used once per slot.
  const plan = planHallAssignments(assignments, halls, new Map(), headcount, "2026/2027 First Semester");
  assert.equal(plan.overflowCourseIds.length, 0);
  const entrySlot = new Map(plan.timetableEntries.map((e) => [e.id, e.timeSlotId]));
  const seen = new Set<string>();
  for (const h of plan.hallAssignments) {
    const key = `${entrySlot.get(h.timetableEntryId)}|${h.examHallId}`;
    assert.ok(!seen.has(key), `hall ${h.examHallId} double-booked`);
    seen.add(key);
  }
});

test("halls already booked by another timetable are never reused", () => {
  const two = [
    { id: "x", levelId: "L1" },
    { id: "y", levelId: "L2" },
  ];
  const headcount = new Map([
    ["x", 50],
    ["y", 50],
  ]);
  const halls = [
    { id: "H1", capacity: 100 },
    { id: "H2", capacity: 60 },
  ];
  const occupied = new Map([["s00", new Set(["H1"])]]);
  const { assignments } = runDsatur(buildLevelConflictGraphSync(two), makeSlots(4), { headcount, halls, occupied });
  assert.equal(assignments.get("x"), "s00");
  assert.equal(assignments.get("y"), "s01", "only one hall was free in the first slot");

  const plan = planHallAssignments(assignments, halls, new Map(), headcount, "S", { occupied });
  const xEntry = plan.timetableEntries.find((e) => e.courseId === "x")!;
  const xHalls = plan.hallAssignments.filter((h) => h.timetableEntryId === xEntry.id).map((h) => h.examHallId);
  assert.deepEqual(xHalls, ["H2"]);
});

test("courses that can't get a clash-free slot are reported as unresolved", () => {
  const level = ["p", "q", "r"].map((id) => ({ id, levelId: "L" }));
  const { assignments, unresolved } = runDsatur(buildLevelConflictGraphSync(level), makeSlots(2));
  assert.equal(assignments.size, 2);
  assert.equal(unresolved.length, 1);
});

test("a class larger than every hall is scheduled and reported as overflow", () => {
  const one = [{ id: "z", levelId: "L" }];
  const headcount = new Map([["z", 500]]);
  const halls = [
    { id: "H1", capacity: 100 },
    { id: "H2", capacity: 60 },
  ];
  const { assignments, overflow } = runDsatur(buildLevelConflictGraphSync(one), makeSlots(2), { headcount, halls });
  assert.equal(assignments.has("z"), true);
  assert.deepEqual(overflow, ["z"]);
  const plan = planHallAssignments(assignments, halls, new Map(), headcount, "S", { lowPriority: new Set(overflow) });
  assert.deepEqual(plan.overflowCourseIds, ["z"]);
});

test("the same input always produces the same timetable", () => {
  const headcount = new Map(courses.map((c, i) => [c.id, 20 + i * 7]));
  const halls = [
    { id: "H1", capacity: 120 },
    { id: "H2", capacity: 90 },
  ];
  const run = () =>
    [...runDsatur(buildLevelConflictGraphSync(courses), makeSlots(12), { headcount, halls }).assignments].sort();
  assert.deepEqual(run(), run());
});

test("seats are numbered from 1 in each hall, in matric-number order", () => {
  const students = ["M1", "M2", "M3", "M4", "M5"].map((m) => ({ studentId: `id-${m}`, matricNumber: m }));
  const plan = planHallAssignments(
    new Map([["c1", "s00"]]),
    [
      { id: "H1", capacity: 3 },
      { id: "H2", capacity: 2 },
    ],
    new Map([["c1", students]]),
    new Map([["c1", 5]]),
    "S"
  );
  assert.deepEqual(
    plan.hallAssignments.map((h) => [h.examHallId, h.seatEnd]),
    [
      ["H1", 3],
      ["H2", 2],
    ]
  );
  assert.deepEqual(
    plan.studentAssignments.map((s) => [s.studentId, s.examHallId, s.seatNumber]),
    [
      ["id-M1", "H1", 1],
      ["id-M2", "H1", 2],
      ["id-M3", "H1", 3],
      ["id-M4", "H2", 1],
      ["id-M5", "H2", 2],
    ]
  );
  assert.equal(plan.overflowCourseIds.length, 0);
});

test("the planner flags a course whose students don't all get a seat", () => {
  const students = ["M1", "M2", "M3"].map((m) => ({ studentId: m, matricNumber: m }));
  const plan = planHallAssignments(
    new Map([["c1", "s00"]]),
    [{ id: "H1", capacity: 2 }],
    new Map([["c1", students]]),
    new Map([["c1", 3]]),
    "S"
  );
  assert.equal(plan.studentAssignments.length, 2);
  assert.deepEqual(plan.overflowCourseIds, ["c1"]);
});
