/**
 * Permission Service — Phase 7
 *
 * Two-layer security model:
 *   Layer 1: Firestore rules = document-level guard (who can read/write which documents)
 *   Layer 2: This service = field-level guard (which fields are visible per role)
 *
 * This service handles Layer 2 — filtering sensitive fields from data
 * before it reaches the UI components.
 */

import { Role, Lesson, Teacher, School, Booking, DeliveryMode } from '../types';

// -------------------------------------------------------
// Resource access matrix
// -------------------------------------------------------

type Resource =
  | 'users'
  | 'schools'
  | 'teachers'
  | 'students'
  | 'lessons'
  | 'financials'
  | 'counters'
  | 'settings'
  | 'bookings'
  | 'timetableSlots';

const ACCESS_MATRIX: Record<Resource, Role[]> = {
  users:       [Role.ADMIN],
  schools:     [Role.ADMIN, Role.TEACHER, Role.SCHOOL_ADMIN],
  teachers:    [Role.ADMIN, Role.TEACHER],        // teacher sees only own
  students:    [Role.ADMIN, Role.TEACHER, Role.PARENT],
  lessons:     [Role.ADMIN, Role.TEACHER, Role.PARENT, Role.STUDENT],
  financials:  [Role.ADMIN, Role.TEACHER],         // teacher sees only own pay
  counters:    [Role.ADMIN, Role.TEACHER],
  settings:    [Role.ADMIN],
  bookings:    [Role.ADMIN, Role.TEACHER, Role.PARENT],  // Phase 14
  timetableSlots: [Role.ADMIN, Role.TEACHER],             // Phase 15
};

/**
 * Check if a role has access to a given resource.
 */
export function canAccess(role: Role | undefined, resource: Resource): boolean {
  if (!role) return false;
  return ACCESS_MATRIX[resource]?.includes(role) ?? false;
}

// -------------------------------------------------------
// Field filters — strip sensitive data per role
// -------------------------------------------------------

/**
 * Filter lesson fields based on role.
 * Teachers should NOT see schoolRate (revenue info).
 * Parents/students see limited fields.
 */
export function filterLessonFields(role: Role, lesson: Lesson): Partial<Lesson> {
  if (role === Role.ADMIN) return { ...lesson };

  if (role === Role.TEACHER) {
    // Teacher sees everything EXCEPT schoolRate (what the school is billed)
    const { schoolRate, ...rest } = lesson;
    return rest;
  }

  if (role === Role.PARENT || role === Role.STUDENT) {
    // Parents/students see basic lesson info + evaluation, NO financials, NO private notes.
    // DECISIONS.md: "notes field (Lesson): ADMIN and TEACHER only"
    // learning, interactivity, behavior ARE visible to parents/students.
    return {
      id: lesson.id,
      date: lesson.date,
      teacherName: lesson.teacherName,
      studentIds: lesson.studentIds,
      studentNames: lesson.studentNames,
      schoolName: lesson.schoolName,
      status: lesson.status,
      durationMinutes: lesson.durationMinutes,
      type: lesson.type,
      // notes intentionally excluded — private teacher notes
      learning: lesson.learning,
      interactivity: lesson.interactivity,
      behavior: lesson.behavior,
      // Phase 13: expanded evaluation fields — visible to parents/students
      overallGrade: lesson.overallGrade,
      repertoire: lesson.repertoire,
      practiceAssignment: lesson.practiceAssignment,
      examPrepStatus: lesson.examPrepStatus,
      // Phase 15: delivery mode
      deliveryMode: lesson.deliveryMode,
    };
  }

  if (role === Role.SCHOOL_ADMIN) {
    // School admin sees revenue side but not teacher pay
    const { teacherRate, ...rest } = lesson;
    return rest;
  }

  // Unknown role — return nothing sensitive
  return {
    id: lesson.id,
    date: lesson.date,
    status: lesson.status,
  };
}

/**
 * Filter teacher fields based on role.
 * Other teachers should NOT see another teacher's rates.
 * Parents/students see only name and instrument.
 */
export function filterTeacherFields(
  role: Role,
  teacher: Teacher,
  currentUserId?: string
): Partial<Teacher> {
  if (role === Role.ADMIN) return { ...teacher };

  if (role === Role.TEACHER) {
    // A teacher viewing their OWN record sees everything
    if (currentUserId && teacher.id === currentUserId) {
      return { ...teacher };
    }
    // A teacher viewing ANOTHER teacher's record (shouldn't happen,
    // but defense in depth) — only name and instrument
    return {
      id: teacher.id,
      name: teacher.name,
      instrument: teacher.instrument,
      code: teacher.code,
    };
  }

  // Parents, students, school admins — basic info only
  return {
    id: teacher.id,
    name: teacher.name,
    instrument: teacher.instrument,
  };
}

/**
 * Filter school fields based on role.
 * Teachers should NOT see school billing rates.
 */
export function filterSchoolFields(role: Role, school: School): Partial<School> {
  if (role === Role.ADMIN) return { ...school };

  if (role === Role.SCHOOL_ADMIN) {
    // School admin sees their school's data including rates
    return { ...school };
  }

  if (role === Role.TEACHER) {
    // Teacher sees school name and code, NOT billing rates
    return {
      id: school.id,
      name: school.name,
      code: school.code,
    };
  }

  // Parents, students — just name
  return {
    id: school.id,
    name: school.name,
  };
}

/**
 * Filter an array of lessons for a given role.
 */
export function filterLessons(role: Role, lessons: Lesson[]): Partial<Lesson>[] {
  return lessons.map(l => filterLessonFields(role, l));
}

/**
 * Filter an array of teachers for a given role.
 */
export function filterTeachers(
  role: Role,
  teachers: Teacher[],
  currentUserId?: string
): Partial<Teacher>[] {
  return teachers.map(t => filterTeacherFields(role, t, currentUserId));
}

/**
 * Filter an array of schools for a given role.
 */
export function filterSchools(role: Role, schools: School[]): Partial<School>[] {
  return schools.map(s => filterSchoolFields(role, s));
}

// -------------------------------------------------------
// Booking field filters (Phase 14)
// -------------------------------------------------------

/**
 * Filter booking fields based on role.
 * Parents see their own booking details but NOT adminNotes.
 * Teachers see bookings assigned to them but NOT adminNotes.
 */
export function filterBookingFields(role: Role, booking: Booking): Partial<Booking> {
  if (role === Role.ADMIN) return { ...booking };

  if (role === Role.TEACHER) {
    // Teacher sees booking details minus admin-internal notes
    const { adminNotes, ...rest } = booking;
    return rest;
  }

  if (role === Role.PARENT) {
    // Parent sees own booking minus admin-internal notes and reviewedBy details
    return {
      id: booking.id,
      requestedBy: booking.requestedBy,
      requestedByName: booking.requestedByName,
      requestedAt: booking.requestedAt,
      studentId: booking.studentId,
      studentName: booking.studentName,
      schoolName: booking.schoolName,
      teacherName: booking.teacherName,
      instrument: booking.instrument,
      type: booking.type,
      lessonType: booking.lessonType,
      durationMinutes: booking.durationMinutes,
      preferredDate: booking.preferredDate,
      notes: booking.notes,
      status: booking.status,
    };
  }

  // Default — minimal info
  return { id: booking.id, status: booking.status };
}
