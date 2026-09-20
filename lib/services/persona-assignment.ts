import type { PersonaAssignment, PersonaPoolRecord, PlatformSettings } from "../types";
import { eligiblePoolRecords, pickUniquePersonas } from "./persona-import";

export function shouldAvoidRepeat(
  roomId: string,
  sourcePersonaId: string,
  assignments: Array<PersonaAssignment & { sourcePersonaId?: string }>,
  hours: number,
  now = Date.now(),
) {
  return assignments.some(
    (a) =>
      a.roomId === roomId &&
      a.sourcePersonaId === sourcePersonaId &&
      now - new Date(a.assignedAt).getTime() < hours * 3600_000,
  );
}

export function assignPersonasToRoom(opts: {
  roomId: string;
  pool: PersonaPoolRecord[];
  existing: PersonaAssignment[];
  settings: PlatformSettings;
  desired: number;
  nowIso: string;
  rng?: () => number;
}) {
  const { roomId, pool, existing, settings, desired, nowIso, rng } = opts;
  const active = existing.filter((a) => a.roomId === roomId && !a.activeUntil);
  const needed = Math.max(0, Math.min(settings.maxActiveAiPerRoom, desired) - active.length);
  if (needed === 0) return { created: [] as PersonaPoolRecord[], needed: 0 };

  const recent = existing.map((a) => ({
    poolSourceId: a.personaId,
    assignedAt: a.assignedAt,
  }));

  // Prefer avoiding source ids recently used in this room. Persona ids here may be assignment persona ids;
  // callers should pass pool records and a lookup. Fall back to unique random picks.
  const eligible = eligiblePoolRecords(
    pool.filter((p) => !active.some((a) => a.personaId === p.id)),
    recent,
    settings.personaReassignmentHours,
  );
  const created = pickUniquePersonas(eligible, needed, rng);
  return { created, needed };
}
