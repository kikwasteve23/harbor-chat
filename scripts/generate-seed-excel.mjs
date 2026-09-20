import * as XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";

const first = [
  "Nia", "Omar", "Sable", "Jun", "Mira", "Theo", "Asha", "Lina", "Chris", "Elena",
  "Quinn", "Priya", "Mateo", "Hana", "Ibrahim", "Sofia", "Leo", "Amara", "Diego", "Yara",
  "Noah", "Leila", "Kenji", "Freya", "Ravi", "Ines", "Malik", "Clara", "Hassan", "June",
  "Andre", "Noor", "Felix", "Zara", "Hugo", "Mei", "Samir", "Iris", "Pavel", "Amina",
  "Jonah", "Lucia", "Tariq", "Eva", "Nico", "Sana", "Owen", "Dalia", "Marco", "Keiko",
  "Adrian", "Nora", "Yusuf", "Greta", "Ilan", "Rosa", "Kofi", "Anika", "Seth", "Lara",
  "Bruno", "Nadia", "Elias", "Tessa", "Omar", "Vera", "Jamal", "Cora", "Rafa", "Mina",
];
const last = [
  "Calder", "Voss", "Wren", "Park", "Solis", "Brandt", "Reddy", "Hock", "Adeyemi", "Rossi",
  "Hale", "Menon", "Alvarez", "Okada", "Diallo", "Berg", "Khan", "Duarte", "Nilsen", "Cho",
  "Silva", "Novak", "Ibrahim", "Moreau", "Patel", "Costa", "Rahman", "Keller", "Okafor", "Lind",
  "Santos", "Bauer", "Farouk", "Nguyen", "Petrov", "Jensen", "Mwangi", "Kaur", "Romano", "Frost",
];
const regions = [
  "Lisbon", "Toronto", "Nairobi", "Seoul", "Mexico City", "Berlin", "Hyderabad", "Vienna",
  "Lagos", "Milan", "Austin", "Singapore", "São Paulo", "Osaka", "Cairo", "Stockholm",
  "London", "Accra", "Chicago", "Madrid",
];
const personalities = ["curious", "practical", "analytical", "calm", "enthusiastic", "skeptical", "supportive", "reserved", "playful"];
const styles = ["casual", "concise", "conversational", "plain-language", "warm", "precise"];
const experience = ["beginner", "intermediate", "experienced"];
const knowledge = ["general", "procedural", "community", "onboarding", "faq"];
const activity = ["low", "moderate", "high"];

const rows = [
  ["persona_id", "display_name", "region", "experience_level", "personality", "communication_style", "knowledge_level", "activity_level"],
];

const used = new Set();
let n = 0;
while (rows.length < 86) {
  const f = first[n % first.length];
  const l = last[(n * 7) % last.length];
  const name = `${f} ${l}`;
  if (used.has(name)) {
    n += 1;
    continue;
  }
  used.add(name);
  const id = `P-${1001 + rows.length - 1}`;
  rows.push([
    id,
    name,
    regions[n % regions.length],
    experience[n % experience.length],
    personalities[n % personalities.length],
    styles[n % styles.length],
    knowledge[n % knowledge.length],
    activity[n % activity.length],
  ]);
  n += 1;
}

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(rows);
XLSX.utils.book_append_sheet(wb, ws, "personas");
const out = path.join(process.cwd(), "seed", "personas.xlsx");
fs.mkdirSync(path.dirname(out), { recursive: true });
XLSX.writeFile(wb, out);
console.log("wrote", out, "rows", rows.length - 1);
