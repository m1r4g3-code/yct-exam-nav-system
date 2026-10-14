import { test } from "node:test";
import assert from "node:assert/strict";
import {
  examWeekdays,
  examWindow,
  occupancyBySlot,
  planExamSlots,
  slotsOverlap,
  withoutOverlaps,
} from "../lib/services/exam-slots";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const isoTime = (d: Date) => d.toISOString().slice(11, 16);

test("2026-10-19 is a Monday (fixture sanity check)", () => {
  assert.equal(new Date("2026-10-19T00:00:00Z").getUTCDay(), 1);
});

test("a two-week exam period has 10 weekdays and 20 slots, never at weekends", () => {
  const slots = planExamSlots("2026-10-19", 2);
  assert.equal(slots.length, 20);
  assert.equal(new Set(slots.map((s) => isoDay(s.date))).size, 10);
  for (const slot of slots) {
    const dow = slot.date.getUTCDay();
    assert.ok(dow >= 1 && dow <= 5, `${isoDay(slot.date)} is a weekend`);
  }
});

test("each exam day has a morning (08:00–10:00) and an afternoon (12:00–14:00) slot", () => {
  const [morning, afternoon] = planExamSlots("2026-10-19", 1);
  assert.deepEqual([isoTime(morning.startTime), isoTime(morning.endTime)], ["08:00", "10:00"]);
  assert.deepEqual([isoTime(afternoon.startTime), isoTime(afternoon.endTime)], ["12:00", "14:00"]);
  assert.match(morning.label, /Morning$/);
  assert.match(afternoon.label, /Afternoon$/);
});

test("a period that starts at the weekend begins on the following Monday", () => {
  const days = examWeekdays("2026-10-17", 1); // Saturday
  assert.equal(days.length, 5);
  assert.equal(isoDay(days[0]), "2026-10-19");
  assert.equal(isoDay(days[4]), "2026-10-23");
});

test("the exam window runs from the start date to the last exam day", () => {
  const { from, to } = examWindow("2026-10-19", 2);
  assert.equal(isoDay(from), "2026-10-19");
  assert.equal(isoDay(to), "2026-10-30");
});

test("invalid start dates are rejected", () => {
  assert.throws(() => planExamSlots("19/10/2026", 2));
  assert.throws(() => planExamSlots("2026-13-40", 2));
});

const slot = (id: string, day: string, start: string, end: string) => ({
  id,
  date: new Date(`${day}T00:00:00Z`),
  startTime: new Date(`1970-01-01T${start}:00Z`),
  endTime: new Date(`1970-01-01T${end}:00Z`),
});

test("slots overlap only on the same day with overlapping times", () => {
  const morning = slot("m", "2026-10-19", "08:00", "10:00");
  assert.equal(slotsOverlap(morning, slot("x", "2026-10-19", "09:00", "11:00")), true);
  assert.equal(slotsOverlap(morning, slot("y", "2026-10-19", "10:00", "12:00")), false, "back-to-back is fine");
  assert.equal(slotsOverlap(morning, slot("z", "2026-10-20", "08:00", "10:00")), false, "different day");
});

test("a hand-made slot overlapping a standard slot is left out of scheduling", () => {
  const kept = withoutOverlaps([
    slot("manual", "2026-10-19", "09:00", "11:00"),
    slot("am", "2026-10-19", "08:00", "10:00"),
    slot("pm", "2026-10-19", "12:00", "14:00"),
  ]);
  assert.deepEqual(kept.map((s) => s.id), ["am", "pm"]);
});

test("a hall booked in an overlapping slot counts as booked in the kept slot", () => {
  const am = slot("am", "2026-10-19", "08:00", "10:00");
  const manual = slot("manual", "2026-10-19", "09:00", "11:00");
  const pm = slot("pm", "2026-10-19", "12:00", "14:00");
  const occupied = occupancyBySlot([am, pm], [am, manual, pm], [{ slotId: "manual", hallId: "MPHA" }]);
  assert.deepEqual([...(occupied.get("am") ?? [])], ["MPHA"]);
  assert.equal(occupied.has("pm"), false);
});
