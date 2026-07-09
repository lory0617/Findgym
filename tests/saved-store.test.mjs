import test from "node:test";
import assert from "node:assert/strict";
import { mergeSavedIds } from "../src/saved-store.js";

test("mergeSavedIds unions local and cloud without duplicates, local order first", () => {
  assert.deepEqual(mergeSavedIds(["a", "b"], ["b", "c"]), ["a", "b", "c"]);
  assert.deepEqual(mergeSavedIds([], ["x"]), ["x"]);
  assert.deepEqual(mergeSavedIds(["y"], []), ["y"]);
  assert.deepEqual(mergeSavedIds(undefined, undefined), []);
  assert.deepEqual(mergeSavedIds(["a", null, "a"], ["", "b"]), ["a", "b"]);
});
