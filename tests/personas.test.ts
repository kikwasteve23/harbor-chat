import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  eligiblePoolRecords,
  parsePersonaWorkbook,
  pickUniquePersonas,
  toPoolRecords,
} from "../lib/services/persona-import";
import { assignPersonasToRoom } from "../lib/services/persona-assignment";
import { defaultSettings } from "../lib/types";

function workbook(rows: string[][]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "p");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

describe("excel parsing", () => {
  it("parses configured columns", () => {
    const buf = workbook([
      ["persona_id", "display_name", "region", "experience_level", "personality", "communication_style"],
      ["A1", "Nia Calder", "Lisbon", "beginner", "curious", "casual"],
      ["A2", "", "x", "x", "x", "x"],
    ]);
    const rows = parsePersonaWorkbook(buf);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.displayName).toBe("Nia Calder");
    expect(rows[0]?.sourcePersonaId).toBe("A1");
  });
});

describe("persona assignment", () => {
  const pool = toPoolRecords(
    [
      {
        sourcePersonaId: "1",
        displayName: "A",
        region: "r",
        experienceLevel: "e",
        personality: "p",
        communicationStyle: "c",
        knowledgeLevel: "k",
        activityLevel: "high",
        extra: {},
      },
      {
        sourcePersonaId: "2",
        displayName: "B",
        region: "r",
        experienceLevel: "e",
        personality: "p",
        communicationStyle: "c",
        knowledgeLevel: "k",
        activityLevel: "low",
        extra: {},
      },
      {
        sourcePersonaId: "3",
        displayName: "C",
        region: "r",
        experienceLevel: "e",
        personality: "p",
        communicationStyle: "c",
        knowledgeLevel: "k",
        activityLevel: "mid",
        extra: {},
      },
    ],
    "batch",
    new Date().toISOString(),
  );

  it("picks unique personas", () => {
    const picked = pickUniquePersonas(pool, 2, () => 0);
    expect(new Set(picked.map((p) => p.sourcePersonaId)).size).toBe(2);
  });

  it("avoids recently used source ids when possible", () => {
    const recent = [{ poolSourceId: "1", assignedAt: new Date().toISOString() }];
    const eligible = eligiblePoolRecords(pool, recent, 12);
    expect(eligible.map((p) => p.sourcePersonaId)).not.toContain("1");
  });

  it("does not over-assign a room", () => {
    const settings = defaultSettings();
    settings.maxActiveAiPerRoom = 2;
    const result = assignPersonasToRoom({
      roomId: "r1",
      pool,
      existing: [
        {
          id: "x",
          roomId: "r1",
          personaId: pool[0]!.id,
          assignedAt: new Date().toISOString(),
          activeUntil: null,
          activityState: "quiet",
          lastActiveAt: null,
          presence: "online",
          presenceJitter: 0,
        },
      ],
      settings,
      desired: 8,
      nowIso: new Date().toISOString(),
      rng: () => 0,
    });
    expect(result.needed).toBe(1);
    expect(result.created).toHaveLength(1);
  });
});
