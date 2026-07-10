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

test("mergeSavedIds drops excluded ids from both local and cloud sources", () => {
  // cloud tries to re-add a just-removed id -> excluded
  assert.deepEqual(mergeSavedIds(["a"], ["b", "c"], ["b"]), ["a", "c"]);
  // exclusion also removes a local id
  assert.deepEqual(mergeSavedIds(["a", "b"], ["c"], ["a"]), ["b", "c"]);
  // default excluded [] preserves existing behavior
  assert.deepEqual(mergeSavedIds(["a", "b"], ["b", "c"]), ["a", "b", "c"]);
});
