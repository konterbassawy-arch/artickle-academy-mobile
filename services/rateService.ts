/**
 * rateService.ts — Phase 17.1
 *
 * Centralized rate resolution for teacher pay and school billing.
 * Called ONLY at lesson creation time (or admin status-change recalc).
 * Result is snapshotted into the lesson — never re-resolved for past lessons.
 *
 * Both functions return an HOURLY rate. Callers multiply by duration and
 * student count as appropriate.
 */

import { Teacher, School, DeliveryMode, GuaranteeConfig, GuaranteeAppliesTo } from '../types';

/**
 * Resolve the teacher's hourly rate for a lesson.
 *
 * Uses sequential-assignment pattern (NOT early returns) to match the original
 * inline logic where Group rates OVERRIDE school-specific rates.
 *
 * IN-PERSON Individual:
 *   baseRate → ratesBySchool[schoolId]              (school override wins)
 *
 * IN-PERSON Group:
 *   baseRate → ratesBySchool[schoolId] → baseGroupRate  (group rate is FINAL override)
 *
 * ONLINE Individual:
 *   Start with in-person result, then:
 *   → onlineRate → onlineRatesBySchool[schoolId]    (school override wins)
 *
 * ONLINE Group:
 *   Start with in-person result, then:
 *   → onlineRate → onlineRatesBySchool[schoolId] → onlineGroupRate  (group is FINAL)
 */
export function resolveTeacherRate(
  teacher: Teacher,
  schoolId: string,
  lessonType: 'Individual' | 'Group',
  deliveryMode: DeliveryMode
): number {
  // --- In-person chain (sequential assignment, group overrides school) ---
  let rate = teacher.baseRate || 0;

  if (schoolId && teacher.ratesBySchool?.[schoolId]) {
    rate = teacher.ratesBySchool[schoolId];
  }

  // Group rate is the FINAL override — wins over school-specific rate
  if (lessonType === 'Group' && teacher.baseGroupRate) {
    rate = teacher.baseGroupRate;
  }

  // --- Online chain (same sequential pattern, then falls back to in-person result) ---
  if (deliveryMode === DeliveryMode.ONLINE) {
    // Start from in-person result as fallback, then layer online overrides
    if (teacher.onlineRate) {
      rate = teacher.onlineRate;
    }
    if (schoolId && teacher.onlineRatesBySchool?.[schoolId]) {
      rate = teacher.onlineRatesBySchool[schoolId];
    }
    // Online group rate is the FINAL override
    if (lessonType === 'Group' && teacher.onlineGroupRate) {
      rate = teacher.onlineGroupRate;
    }
  }

  return rate;
}

/**
 * Resolve the school's hourly billing rate for a lesson.
 *
 * Uses sequential-assignment pattern to match original inline logic.
 * Key behavioral rule: teacherRates only apply to Individual lessons (not Group).
 * This matches old LessonLog code:
 *   if (effectiveType === 'Individual' && teacher && school.teacherRates?.[teacher.id]) { ... }
 *
 * IN-PERSON Individual:
 *   defaultRate → instrumentRates[instrument] → teacherRates[teacherId]
 *
 * IN-PERSON Group:
 *   defaultRate → instrumentRates[instrument] → defaultGroupRate
 *   (teacherRates NOT checked for Group)
 *
 * ONLINE Individual:
 *   Start with in-person result, then:
 *   → defaultOnlineRate → onlineInstrumentRates[instrument] → onlineTeacherRates[teacherId]
 *
 * ONLINE Group:
 *   Start with in-person result, then:
 *   → defaultOnlineRate → onlineInstrumentRates[instrument] → defaultOnlineGroupRate
 *   (onlineTeacherRates NOT checked for Group)
 */
export function resolveSchoolRate(
  school: School,
  teacherId: string,
  instrument: string,
  lessonType: 'Individual' | 'Group',
  deliveryMode: DeliveryMode
): number {
  const instrumentLower = (instrument || '').toLowerCase();

  // Helper: case-insensitive instrument lookup
  const findInstrumentRate = (rates?: Record<string, number>): number | undefined => {
    if (!rates) return undefined;
    const key = Object.keys(rates).find(k => k.toLowerCase() === instrumentLower);
    return key !== undefined ? rates[key] : undefined;
  };

  // --- In-person chain (sequential assignment) ---
  let rate = school.defaultRate || 0;

  const instrRate = findInstrumentRate(school.instrumentRates);
  if (instrRate !== undefined) {
    rate = instrRate;
  }

  // teacherRates only apply to Individual lessons (old LessonLog behavior)
  if (lessonType === 'Individual' && teacherId && school.teacherRates?.[teacherId]) {
    rate = school.teacherRates[teacherId];
  }

  // Group: defaultGroupRate is the FINAL override (wins over instrument rate)
  if (lessonType === 'Group' && school.defaultGroupRate) {
    rate = school.defaultGroupRate;
  }

  // --- Online chain (same sequential pattern, falls back to in-person result) ---
  if (deliveryMode === DeliveryMode.ONLINE) {
    if (school.defaultOnlineRate) {
      rate = school.defaultOnlineRate;
    }

    const onlineInstrRate = findInstrumentRate(school.onlineInstrumentRates);
    if (onlineInstrRate !== undefined) {
      rate = onlineInstrRate;
    }

    // onlineTeacherRates only for Individual (matching in-person pattern)
    if (lessonType === 'Individual' && teacherId && school.onlineTeacherRates?.[teacherId]) {
      rate = school.onlineTeacherRates[teacherId];
    }

    // Online group rate is the FINAL override
    if (lessonType === 'Group' && school.defaultOnlineGroupRate) {
      rate = school.defaultOnlineGroupRate;
    }
  }

  return rate;
}

// ---------------------------------------------------------------------------
// Phase 17.G: Guarantee resolution
// ---------------------------------------------------------------------------

/** Normalize instrument key: lowercase + trimmed. All guarantee/rate lookups use this. */
export const normalizeInstrument = (s: string): string => (s || '').trim().toLowerCase();

/**
 * Check if a guarantee's appliesTo matches a lesson's deliveryMode.
 * 'both' matches everything; 'in_person_only' / 'online_only' match their respective mode.
 */
export function matchesDeliveryMode(appliesTo: GuaranteeAppliesTo, deliveryMode: DeliveryMode): boolean {
  if (appliesTo === 'both') return true;
  if (appliesTo === 'in_person_only' && deliveryMode === DeliveryMode.IN_PERSON) return true;
  if (appliesTo === 'online_only' && deliveryMode === DeliveryMode.ONLINE) return true;
  return false;
}

/**
 * Case-insensitive lookup helper for Record<string, T>.
 * Keys are compared via normalizeInstrument.
 */
function findByInstrument<T>(map: Record<string, T> | undefined, instrument: string): T | undefined {
  if (!map) return undefined;
  const norm = normalizeInstrument(instrument);
  // Try exact normalized match first (fast path)
  if (map[norm] !== undefined) return map[norm];
  // Fall back to scanning keys (handles mixed-case keys in legacy data)
  const key = Object.keys(map).find(k => normalizeInstrument(k) === norm);
  return key !== undefined ? map[key] : undefined;
}

/**
 * Resolve school guarantee for a given instrument.
 * Affects INVOICES only. Always billed if enabled.
 *
 * Checks new field (guaranteesByInstrument) first, falls back to legacy
 * (minimumDailyHoursByInstrument) for un-migrated data.
 *
 * Returns { minHours, appliesTo } if a guarantee applies, or null.
 */
export function resolveSchoolGuarantee(
  school: School,
  instrument: string
): { minHours: number; appliesTo: GuaranteeAppliesTo } | null {
  // --- New field (source of truth) ---
  const newConfig = findByInstrument(school.guaranteesByInstrument, instrument);
  if (newConfig) {
    if (!newConfig.enabled) return null;
    return { minHours: newConfig.minHours, appliesTo: newConfig.appliesTo };
  }

  // --- Legacy fallback (read-only) ---
  const legacyConfig = findByInstrument(school.minimumDailyHoursByInstrument, instrument);
  if (legacyConfig && legacyConfig.guaranteed) {
    // Legacy data has no appliesTo — treat as 'both' for backward compatibility
    return { minHours: legacyConfig.minHours, appliesTo: 'both' };
  }

  return null;
}

/**
 * Resolve teacher guarantee for a given school + instrument.
 * Affects PAYROLL only. Activates only if ≥1 counted lesson that day.
 *
 * Checks new field (guaranteesBySchool[schoolId][instrument]) first,
 * falls back to legacy (minimumDailyHoursByInstrument[instrument]) for
 * un-migrated data — legacy applies to ALL schools (old behavior).
 *
 * Returns { minHours, appliesTo } if a guarantee applies, or null.
 */
export function resolveTeacherGuarantee(
  teacher: Teacher,
  schoolId: string,
  instrument: string
): { minHours: number; appliesTo: GuaranteeAppliesTo } | null {
  // --- New field (source of truth) ---
  const schoolConfig = teacher.guaranteesBySchool?.[schoolId];
  if (schoolConfig) {
    const newConfig = findByInstrument(schoolConfig, instrument);
    if (newConfig) {
      if (!newConfig.enabled) return null;
      return { minHours: newConfig.minHours, appliesTo: newConfig.appliesTo };
    }
    // schoolId exists in guaranteesBySchool but instrument not found — no guarantee
    // (Do NOT fall back to legacy if new structure exists for this school)
    return null;
  }

  // If guaranteesBySchool has ANY entries (meaning teacher has been migrated),
  // absence of this schoolId means no guarantee for this school — do NOT fall back.
  if (teacher.guaranteesBySchool && Object.keys(teacher.guaranteesBySchool).length > 0) {
    return null;
  }

  // --- Legacy fallback (read-only, applies to ALL schools — old behavior) ---
  const legacyConfig = findByInstrument(teacher.minimumDailyHoursByInstrument, instrument);
  if (legacyConfig && legacyConfig.guaranteed) {
    return { minHours: legacyConfig.minHours, appliesTo: 'both' };
  }

  return null;
}
