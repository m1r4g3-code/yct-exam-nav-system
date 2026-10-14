import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidMatric, normaliseMatric } from "../lib/matric";
import { compareSessionsNewestFirst, isValidSessionName, sessionSemester } from "../lib/sessions";

test("matric numbers are normalised to upper case without spaces", () => {
  assert.equal(normaliseMatric("  f/nd/24/3210001 "), "F/ND/24/3210001");
  assert.equal(normaliseMatric("F / HD / 21 / 3210001"), "F/HD/21/3210001");
});

test("Yabatech-style matric numbers are accepted, malformed ones rejected", () => {
  for (const ok of ["F/ND/24/3210001", "F/HD/21/3210001", "YCT/ND/COM/24/0001", "p/nd/22/1234"]) {
    assert.equal(isValidMatric(ok), true, ok);
  }
  for (const bad of ["ABC", "F//24/1", "F/ND", "F/ND/24/32 10?01", ""]) {
    assert.equal(isValidMatric(bad), false, bad);
  }
});

test("the semester is read from the session name", () => {
  assert.equal(sessionSemester("2025/2026 First Semester"), "FIRST");
  assert.equal(sessionSemester("2025/2026 Second Semester"), "SECOND");
  assert.equal(sessionSemester("2025/2026 Third Term"), null);
});

test("session names need the standard format and consecutive years", () => {
  assert.equal(isValidSessionName("2025/2026 First Semester"), true);
  assert.equal(isValidSessionName("2025/2027 First Semester"), false);
  assert.equal(isValidSessionName("2025-2026 First Semester"), false);
});

test("sessions sort newest first, Second Semester before First within a year", () => {
  const names = [
    "2024/2025 First Semester",
    "2025/2026 First Semester",
    "2024/2025 Second Semester",
    "2025/2026 Second Semester",
  ];
  assert.deepEqual([...names].sort(compareSessionsNewestFirst), [
    "2025/2026 Second Semester",
    "2025/2026 First Semester",
    "2024/2025 Second Semester",
    "2024/2025 First Semester",
  ]);
});
