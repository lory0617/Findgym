import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { enrichGymsFromCurated, parsePricingFromFeeText } from "../src/curated-gym-source.js";

const execFileAsync = promisify(execFile);

const csvHeader =
  "序號,資料查核日,縣市,行政區,場館類型,品牌/系統,場館/分店,地址,收費方式,免綁約,可用狀態,收費明確度,備註,來源網址,保留原因";

test("parsePricingFromFeeText extracts single-entry, hourly, and monthly prices", () => {
  const single = parsePricingFromFeeText("免綁約；單次計費150元", "2026-07-07");
  assert.equal(single[0].type, "single_entry");
  assert.equal(single[0].amountTwd, 150);
  assert.equal(single[0].unit, "per_entry");
  assert.equal(single[0].sourceNote, "免綁約；單次計費150元");

  const multi = parsePricingFromFeeText("分鐘制：1分鐘1.2點起；單次通行券：200元/次；月訂閱980元/月（免長約）", "2026-07-07");
  const types = multi.map((price) => price.type);
  assert.equal(types.includes("single_entry"), true);
  assert.equal(types.includes("monthly_no_contract"), true);
  assert.equal(multi.find((price) => price.type === "single_entry").amountTwd, 200);
  assert.equal(multi.find((price) => price.type === "monthly_no_contract").amountTwd, 980);

  const hourly = parsePricingFromFeeText("體適能中心50元/小時", "2026-07-07");
  assert.equal(hourly[0].type, "hourly");
  assert.equal(hourly[0].amountTwd, 50);
  assert.equal(hourly[0].unit, "per_hour");

  const unparsed = parsePricingFromFeeText("平日17:00前150元/次、17:00後350元/次", "2026-07-07");
  assert.equal(unparsed[0].amountTwd, null);
  assert.equal(unparsed[0].sourceNote, "平日17:00前150元/次、17:00後350元/次");

  const hourlyWorded = parsePricingFromFeeText("體適能中心單次全票常見50元/小時；各館依公告", "2026-07-07");
  assert.deepEqual(hourlyWorded.map((price) => price.type), ["hourly"]);
  assert.equal(hourlyWorded[0].amountTwd, 50);
});

test("parsePricingFromFeeText preserves amountless single-entry and timed pricing mentions", () => {
  const prices = parsePricingFromFeeText(
    "官方社群與 Linkgoods 標示單次、分鐘制計費、月費、年費；實際金額需洽官方 LINE 或館方公告",
    "2026-07-07"
  );

  assert.deepEqual(
    prices.map((price) => [price.type, price.amountTwd, price.unit]),
    [
      ["single_entry", null, "per_entry"],
      ["hourly", null, "custom"]
    ]
  );
});

test("enrichGymsFromCurated updates matching gyms with curated pricing and access", () => {
  const csv = `${csvHeader}
1,2026-07-07,高雄市,大寮區,公立運動中心體適能中心,高雄市運動中心,大寮運動中心,高雄市大寮區進學路151號 （輔英科技大學體育館）,體適能中心50元/小時,是,營運中,官方費率,備註,https://example.org/daliao,保留
2,2026-07-07,臺北市,信義區,民營單次健身房,體育客 1ST Fitness,和平店,臺北市信義區和平東路三段333號,單次入場300元,是,營運中,官方明確,備註,https://example.org/tiyuke,保留
3,2026-07-07,臺北市,中山區,民營單次健身房,無對應健身房,無對應店,臺北市中山區不存在路999號,單次250元,是,營運中,官方明確,備註,https://example.org/none,保留
`;
  const gyms = [
    {
      id: "kh-1",
      name: "高雄市大寮運動中心",
      city: "高雄市",
      district: "大寮區",
      address: "高雄市大寮區進學路151號",
      access: { supportsSingleEntry: true, contractNote: "政府運動設施普查標示付費對外開放；單次入場方式與價格需以官方管道複查。" },
      pricing: [{ type: "single_entry", amountTwd: null, unit: "per_entry", timeLimitMinutes: null, sourceNote: "價格需查證", lastVerifiedAt: "2026-07-07" }],
      verification: { confidenceLevel: "unverified", verificationSource: "government_open_data", verifiedAt: "2026-07-07" }
    },
    {
      id: "tp-1",
      name: "體育客",
      city: "台北市",
      district: "信義區",
      address: "台北市信義區和平東路3段333號B1",
      access: { supportsSingleEntry: true, contractNote: "待查" },
      pricing: [{ type: "single_entry", amountTwd: null, unit: "per_entry", timeLimitMinutes: null, sourceNote: "價格需查證", lastVerifiedAt: "2026-07-07" }],
      verification: { confidenceLevel: "unverified", verificationSource: "government_open_data", verifiedAt: "2026-07-07" }
    }
  ];

  const result = enrichGymsFromCurated(gyms, csv, { fetchedAt: "2026-07-07" });

  assert.equal(result.enriched.length, 2);
  assert.equal(result.unmatched.length, 1);
  assert.equal(result.unmatched[0].name, "無對應健身房 無對應店");

  const daliao = result.gyms.find((gym) => gym.id === "kh-1");
  assert.equal(daliao.pricing[0].type, "hourly");
  assert.equal(daliao.pricing[0].amountTwd, 50);
  assert.equal(daliao.access.contractNote, "體適能中心50元/小時");
  assert.equal(daliao.access.supportsSingleEntry, true);
  assert.equal(daliao.verification.confidenceLevel, "verified");
  assert.equal(daliao.verification.verificationSource, "manual_research");

  const tiyuke = result.gyms.find((gym) => gym.id === "tp-1");
  assert.equal(tiyuke.pricing[0].amountTwd, 300);
  assert.equal(tiyuke.pricing[0].sourceNote, "單次入場300元");
  assert.equal(tiyuke.verification.confidenceLevel, "verified");
});

test("enrichGymsFromCurated hides curated membership-only matches", () => {
  const csv = `${csvHeader}
1,2026-07-07,臺北市,中山區,飯店附設健身房,大倉久和大飯店附設健身房,大倉久和大飯店附設健身房,臺北市中山區南京東路一段9號,大倉健身俱樂部採會員制：個人卡一年會籍入會費NT$100000+月費NT$5000；未公開單次入場費用；住客免費使用,否,營運中,官方明確,會員制,https://example.org/okura,排除
`;
  const gyms = [
    {
      id: "tp-okura",
      name: "大倉久和大飯店附設健身房",
      city: "台北市",
      district: "中山區",
      address: "台北市中山區南京東路一段9號",
      isHiddenByDefault: false,
      access: { supportsSingleEntry: true, supportsNoContractMonthly: true, supportsTrial: true, contractNote: "政府運動設施普查標示付費對外開放" },
      pricing: [{ type: "single_entry", amountTwd: null, unit: "per_entry", timeLimitMinutes: null, sourceNote: "價格需查證", lastVerifiedAt: "2026-07-07" }]
    }
  ];

  const result = enrichGymsFromCurated(gyms, csv, { fetchedAt: "2026-07-07" });

  assert.equal(result.enriched.length, 1);
  assert.equal(result.gyms[0].isHiddenByDefault, true);
  assert.equal(result.gyms[0].access.supportsSingleEntry, false);
  assert.equal(result.gyms[0].access.supportsNoContractMonthly, false);
  assert.equal(result.gyms[0].access.supportsTrial, false);
  assert.equal(result.gyms[0].pricing[0].type, "other");
  assert.equal(result.gyms[0].pricing[0].amountTwd, null);
});

test("enrich CLI updates the dataset file in place", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "findgym-enrich-"));
  const csvPath = join(tempDir, "curated.csv");
  const gymsPath = join(tempDir, "gyms.json");

  await writeFile(
    csvPath,
    `${csvHeader}
1,2026-07-07,臺北市,中山區,民營單次健身房,測試健身房,測試健身房,臺北市中山區測試路1號,單次計費180元,是,營運中,官方明確,備註,https://example.org/test,保留
`
  );
  await writeFile(
    gymsPath,
    JSON.stringify([
      {
        id: "tp-test",
        name: "測試健身房",
        brandName: "",
        branchName: "",
        city: "台北市",
        district: "中山區",
        address: "台北市中山區測試路1號",
        latitude: 25.05,
        longitude: 121.52,
        status: "open",
        isLargeContractFirstChain: false,
        isHiddenByDefault: false,
        access: {
          supportsSingleEntry: false,
          supportsNoContractMonthly: false,
          supportsTrial: false,
          requiresMembershipCard: false,
          requiresReservation: false,
          contractNote: "待查"
        },
        pricing: [{ type: "other", amountTwd: 0, unit: "custom", timeLimitMinutes: null, sourceNote: "待查", lastVerifiedAt: "2026-07-07" }],
        facilities: {
          hasFreeWeights: true,
          hasSquatRack: false,
          hasPowerRack: false,
          hasBenchPress: false,
          hasDeadliftPlatform: false,
          hasCableMachine: false,
          hasCardio: false,
          hasGroupClasses: false,
          hasPersonalTraining: false,
          hasShower: false,
          hasLocker: false,
          hasParking: false,
          is24Hours: false
        },
        openingHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opensAt: "00:00", closesAt: "00:00", isClosed: true })),
        rating: { externalRating: null, externalRatingCount: 0, externalSource: "none", summaryTags: [] },
        verification: { confidenceLevel: "unverified", verificationSource: "manual_research", verifiedAt: "2026-07-07" },
        contact: { phone: "", website: "", mapUrl: "" }
      }
    ])
  );

  const { stdout } = await execFileAsync("node", [
    "scripts/enrich-gyms-from-curated.mjs",
    gymsPath,
    csvPath,
    "--output",
    gymsPath
  ]);
  const gyms = JSON.parse(await readFile(gymsPath, "utf8"));

  assert.equal(stdout.includes("Findgym curated enrichment"), true);
  assert.equal(gyms[0].pricing[0].amountTwd, 180);
  assert.equal(gyms[0].access.supportsSingleEntry, true);
});
