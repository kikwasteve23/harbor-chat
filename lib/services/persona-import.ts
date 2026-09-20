import * as XLSX from "xlsx";
import { z } from "zod";
import type { PersonaPoolRecord, PlatformSettings } from "../types";

export const DEFAULT_COLUMNS = [
  "persona_id",
  "display_name",
  "region",
  "experience_level",
  "personality",
  "communication_style",
  "knowledge_level",
  "activity_level",
] as const;

const rowSchema = z.record(z.string(), z.unknown());

export interface ParsedPersonaRow {
  sourcePersonaId: string;
  displayName: string;
  region: string;
  experienceLevel: string;
  personality: string;
  communicationStyle: string;
  knowledgeLevel: string;
  activityLevel: string;
  extra: Record<string, string>;
}

function cell(v: unknown) {
  if (v == null) return "";
  return String(v).trim();
}

function mapped(row: Record<string, unknown>, map: Record<string, string>, key: string) {
  const source = map[key] || key;
  const direct = row[source] ?? row[key];
  if (direct != null) return cell(direct);
  const lower = Object.fromEntries(Object.entries(row).map(([k, val]) => [k.toLowerCase().trim(), val]));
  return cell(lower[source.toLowerCase()] ?? lower[key]);
}

export function parsePersonaWorkbook(
  buffer: ArrayBuffer | Buffer,
  columnMap: PlatformSettings["columnMap"] = {},
): ParsedPersonaRow[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Excel file has no sheets");
  const sheet = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const rows: ParsedPersonaRow[] = [];
  json.forEach((raw, idx) => {
    const row = rowSchema.parse(raw);
    const displayName = mapped(row, columnMap, "display_name");
    if (!displayName) return;
    const extra: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      extra[k] = cell(v);
    }
    rows.push({
      sourcePersonaId: mapped(row, columnMap, "persona_id") || `row-${idx + 2}`,
      displayName,
      region: mapped(row, columnMap, "region") || "unspecified",
      experienceLevel: mapped(row, columnMap, "experience_level") || "intermediate",
      personality: mapped(row, columnMap, "personality") || "practical",
      communicationStyle: mapped(row, columnMap, "communication_style") || "conversational",
      knowledgeLevel: mapped(row, columnMap, "knowledge_level") || "general",
      activityLevel: mapped(row, columnMap, "activity_level") || "moderate",
      extra,
    });
  });
  return rows;
}

export function toPoolRecords(rows: ParsedPersonaRow[], batchId: string, now: string): PersonaPoolRecord[] {
  return rows.map((row) => ({
    id: crypto.randomUUID(),
    sourcePersonaId: row.sourcePersonaId,
    displayName: row.displayName,
    region: row.region,
    experienceLevel: row.experienceLevel,
    personality: row.personality,
    communicationStyle: row.communicationStyle,
    knowledgeLevel: row.knowledgeLevel,
    activityLevel: row.activityLevel,
    extra: row.extra,
    importedAt: now,
    importBatchId: batchId,
  }));
}

export function eligiblePoolRecords(
  pool: PersonaPoolRecord[],
  recentAssignments: { poolSourceId: string; assignedAt: string }[],
  reassignmentHours: number,
  now = Date.now(),
) {
  const blocked = new Set(
    recentAssignments
      .filter((a) => now - new Date(a.assignedAt).getTime() < reassignmentHours * 3600_000)
      .map((a) => a.poolSourceId),
  );
  const eligible = pool.filter((p) => !blocked.has(p.sourcePersonaId));
  return eligible.length > 0 ? eligible : pool;
}

export function pickUniquePersonas(
  pool: PersonaPoolRecord[],
  count: number,
  rng: () => number = Math.random,
) {
  const copy = [...pool];
  const selected: PersonaPoolRecord[] = [];
  while (copy.length && selected.length < count) {
    const i = Math.floor(rng() * copy.length);
    selected.push(copy.splice(i, 1)[0]!);
  }
  return selected;
}
