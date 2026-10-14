import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseCsvRecords, stripFormulaPrefix } from "../lib/csv";

test("headers are normalised and rows keep their line numbers", () => {
  const { headers, rows } = parseCsv("School Name,Name, Code \nSchool of Technology,Computer Technology,CSC\n");
  assert.deepEqual(headers, ["school_name", "name", "code"]);
  assert.deepEqual(rows, [{ line: 2, cells: ["School of Technology", "Computer Technology", "CSC"] }]);
});

test("quoted fields may contain commas, doubled quotes and line breaks", () => {
  const records = parseCsvRecords('a,"b, with comma","say ""hi"""\r\nx,"two\nlines",z\r\n');
  assert.deepEqual(records[0].cells, ["a", "b, with comma", 'say "hi"']);
  assert.deepEqual(records[1].cells, ["x", "two\nlines", "z"]);
  assert.equal(records[1].line, 2);
});

test("blank lines and a byte-order mark are ignored", () => {
  const { headers, rows } = parseCsv("﻿code,title\n\nCOM111,Intro\n\n");
  assert.deepEqual(headers, ["code", "title"]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].line, 3);
});

test("spreadsheet formula prefixes are removed from text values", () => {
  assert.equal(stripFormulaPrefix("=HYPERLINK(x)"), "HYPERLINK(x)");
  assert.equal(stripFormulaPrefix("  @SUM"), "SUM");
  assert.equal(stripFormulaPrefix("Introduction to Computing"), "Introduction to Computing");
});
