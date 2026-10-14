import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateHalls, packSlot, slotFits, sortHalls, spareCapacity } from "../lib/services/hall-packing";

const halls = [
  { id: "C", capacity: 80 },
  { id: "A", capacity: 300 },
  { id: "B", capacity: 200 },
];

test("halls are ordered largest first", () => {
  assert.deepEqual(sortHalls(halls).map((h) => h.id), ["A", "B", "C"]);
});

test("best fit: a class takes the smallest hall that seats everyone", () => {
  const free = sortHalls(halls);
  const result = allocateHalls(70, free);
  assert.deepEqual(result, { allocations: [{ hallId: "C", seats: 70 }], unseated: 0 });
  assert.deepEqual(free.map((h) => h.id), ["A", "B"], "the chosen hall is no longer free");
});

test("a class too big for one hall fills the largest hall, then the best fit for the rest", () => {
  const result = allocateHalls(450, sortHalls(halls));
  assert.deepEqual(result.allocations, [
    { hallId: "A", seats: 300 },
    { hallId: "B", seats: 150 },
  ]);
  assert.equal(result.unseated, 0);
});

test("students who cannot be seated are reported", () => {
  const result = allocateHalls(700, sortHalls(halls));
  assert.equal(result.allocations.length, 3);
  assert.equal(result.unseated, 120);
});

test("within a slot, larger classes choose first and each hall holds one course", () => {
  const result = packSlot(
    [
      { id: "small", headcount: 50 },
      { id: "big", headcount: 250 },
    ],
    halls
  );
  assert.deepEqual(result.get("big")?.allocations, [{ hallId: "A", seats: 250 }]);
  assert.deepEqual(result.get("small")?.allocations, [{ hallId: "C", seats: 50 }]);
});

test("low-priority classes are seated last, so they never push out a class that fits", () => {
  const result = packSlot(
    [
      { id: "huge", headcount: 1000, lowPriority: true },
      { id: "normal", headcount: 100 },
    ],
    halls
  );
  assert.deepEqual(result.get("normal")?.allocations, [{ hallId: "B", seats: 100 }]);
  assert.equal(result.get("huge")?.unseated, 620);
});

test("slotFits and spareCapacity", () => {
  const fits = [
    { id: "x", headcount: 300 },
    { id: "y", headcount: 200 },
    { id: "z", headcount: 80 },
  ];
  assert.equal(slotFits(fits, halls), true);
  assert.equal(slotFits([...fits.slice(0, 2), { id: "z", headcount: 81 }], halls), false);
  assert.equal(spareCapacity([{ id: "x", headcount: 300 }], halls), 280);
});
