import * as XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";

const rows = [
  ["persona_id", "display_name", "region", "experience_level", "personality", "communication_style", "knowledge_level", "activity_level"],
  ["P-1001", "Nia Calder", "Lisbon", "beginner", "curious", "questions-first", "general", "moderate"],
  ["P-1002", "Omar Voss", "Toronto", "experienced", "practical", "concise", "procedural", "high"],
  ["P-1003", "Sable Wren", "Nairobi", "intermediate", "analytical", "compare-and-cite", "docs-first", "moderate"],
  ["P-1004", "Jun Park", "Seoul", "experienced", "calm", "plain-language", "policy", "low"],
  ["P-1005", "Mira Solis", "Mexico City", "beginner", "enthusiastic", "warm", "overview", "high"],
  ["P-1006", "Theo Brandt", "Berlin", "intermediate", "skeptical", "precise", "constraints", "low"],
  ["P-1007", "Asha Reddy", "Hyderabad", "experienced", "practical", "stepwise", "procedures", "moderate"],
  ["P-1008", "Lina Höck", "Vienna", "beginner", "curious", "casual", "faq", "moderate"],
  ["P-1009", "Chris Adeyemi", "Lagos", "intermediate", "supportive", "conversational", "onboarding", "high"],
  ["P-1010", "Elena Rossi", "Milan", "experienced", "analytical", "structured", "terminology", "low"],
  ["P-1011", "Quinn Hale", "Austin", "beginner", "playful", "short-messages", "community", "moderate"],
  ["P-1012", "Priya Menon", "Singapore", "experienced", "reserved", "careful", "safety", "low"],
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(rows);
XLSX.utils.book_append_sheet(wb, ws, "personas");
const out = path.join(process.cwd(), "seed", "personas.xlsx");
fs.mkdirSync(path.dirname(out), { recursive: true });
XLSX.writeFile(wb, out);
console.log("wrote", out, "rows", rows.length - 1);
