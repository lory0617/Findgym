import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { mergeGymDatasets } from "../src/gym-data-merge.js";

const execFileAsync = promisify(execFile);

test("mergeGymDatasets appends new gyms and skips duplicate venues", () => {
  const existing = [
    {
      id: "existing",
      name: "中山運動中心",
      city: "台北市",
      district: "中山區",
      address: "台北市中山區中山北路二段44巷2號"
    }
  ];
  const incoming = [
    {
      id: "duplicate",
      name: "中山運動中心",
      city: "台北市",
      district: "中山區",
      address: "台北市中山區中山北路二段44巷2號"
    },
    {
      id: "new",
      name: "信義運動中心",
      city: "台北市",
      district: "信義區",
      address: "台北市信義區松勤街100號"
    }
  ];

  const result = mergeGymDatasets(existing, incoming);

  assert.deepEqual(result.merged.map((gym) => gym.id), ["existing", "new"]);
  assert.deepEqual(result.added.map((gym) => gym.id), ["new"]);
  assert.equal(result.skipped[0].reason, "duplicate_existing");
});

test("merge import candidates CLI writes a validated merged dataset", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "findgym-merge-"));
  const existingPath = join(tempDir, "gyms.json");
  const candidatesPath = join(tempDir, "candidates.json");
  const outputPath = join(tempDir, "merged.json");
  const currentGyms = JSON.parse(await readFile(new URL("../data/gyms.json", import.meta.url), "utf8"));
  const duplicate = currentGyms[0];
  const newGym = {
    ...currentGyms[0],
    id: "taipei-xinyi-merge-test",
    name: "信義運動中心",
    district: "信義區",
    address: "台北市信義區松勤街100號",
    latitude: 25.0317,
    longitude: 121.5668
  };

  await writeFile(existingPath, `${JSON.stringify([duplicate], null, 2)}\n`);
  await writeFile(candidatesPath, `${JSON.stringify([duplicate, newGym], null, 2)}\n`);

  const { stdout } = await execFileAsync("node", [
    "scripts/merge-import-candidates.mjs",
    existingPath,
    candidatesPath,
    "--output",
    outputPath
  ]);
  const merged = JSON.parse(await readFile(outputPath, "utf8"));

  assert.equal(stdout.includes("Findgym candidate merge"), true);
  assert.equal(stdout.includes("Added: 1"), true);
  assert.equal(stdout.includes("Skipped: 1"), true);
  assert.equal(merged.length, 2);
});
