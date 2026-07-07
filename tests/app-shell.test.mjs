import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("app shell exposes a global missing-gym report action", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.equal(html.includes('data-action="open-report"'), true);
  assert.equal(html.includes("新增據點"), true);
});
