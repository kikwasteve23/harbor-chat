import fs from "node:fs";
import path from "node:path";
import { defaultSettings, type StoreShape } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

function emptyStore(): StoreShape {
  return {
    profiles: [],
    rooms: [],
    members: [],
    messages: [],
    personaPool: [],
    aiPersonas: [],
    assignments: [],
    documents: [],
    chunks: [],
    topics: [],
    conversation: [],
    botEvents: [],
    moderationEvents: [],
    reports: [],
    tokenUsage: [],
    settings: defaultSettings(),
    personaMemory: [],
    typing: [],
    analytics: [],
    seeded: false,
  };
}

let memory: StoreShape | null = null;
let writeChain: Promise<void> = Promise.resolve();
let initPromise: Promise<void> | null = null;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const uploads = path.join(DATA_DIR, "uploads");
  if (!fs.existsSync(uploads)) fs.mkdirSync(uploads, { recursive: true });
}

export async function initStore() {
  if (!initPromise) {
    initPromise = (async () => {
      const { usesPostgres, migratePostgres, loadFromPostgres } = await import("./db/postgres");
      if (usesPostgres()) {
        await migratePostgres();
        const fromDb = await loadFromPostgres();
        memory = fromDb ?? emptyStore();
        return;
      }
      ensureDir();
      if (fs.existsSync(STORE_PATH)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) as StoreShape;
          memory = { ...emptyStore(), ...parsed, settings: { ...defaultSettings(), ...parsed.settings } };
          return;
        } catch {
          memory = emptyStore();
          return;
        }
      }
      memory = emptyStore();
    })();
  }
  await initPromise;
}

export function loadStore(): StoreShape {
  if (memory) return memory;
  ensureDir();
  if (fs.existsSync(STORE_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) as StoreShape;
      memory = { ...emptyStore(), ...parsed, settings: { ...defaultSettings(), ...parsed.settings } };
      return memory;
    } catch {
      memory = emptyStore();
      return memory;
    }
  }
  memory = emptyStore();
  return memory;
}

export function saveStore(next?: StoreShape) {
  if (next) memory = next;
  const snapshot = loadStore();
  ensureDir();
  writeChain = writeChain.then(async () => {
    const { usesPostgres, saveToPostgres } = await import("./db/postgres");
    if (usesPostgres()) {
      await saveToPostgres(snapshot);
      return;
    }
    await fs.promises.writeFile(STORE_PATH, JSON.stringify(snapshot, null, 2));
  });
  return writeChain;
}

export function mutateStore<T>(fn: (store: StoreShape) => T): T {
  const store = loadStore();
  const result = fn(store);
  void saveStore(store);
  return result;
}

export function uploadsDir() {
  ensureDir();
  return path.join(DATA_DIR, "uploads");
}
