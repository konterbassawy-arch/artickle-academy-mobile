/**
 * EnrollmentReviewTable — Phase 19.6D5A
 *
 * Renders the lesson table (flat or grouped) for the Enrollment Review page.
 *
 * Stage A: READ-ONLY. All action buttons are rendered disabled.
 * Stage B will receive: onLink, onChoose, onDismiss, onUnlink callbacks.
 * Stage C will receive: selectedIds, onToggleSelect, onToggleAll.
 */

import React, { useState } from 'react';
import { Lesson, LessonStatus, Enrollment, SchoolEnrollmentPeriod } from '../../types';
import { ClassifiedLesson, LessonClassification } from '../../services/enrollmentReviewSuggestions';
import { EnrollmentSuggestionChip } from './EnrollmentSuggestionChip';
import { ReviewFilters } from './EnrollmentReviewFilters';

// ─── Props ────────────────────────────────────────────────────────────────────

interface ActionCallbacks {
  /** Stage B */
  onLink?: (item: ClassifiedLesson) => void;
  onChoose?: (item: ClassifiedLesson) => void;
  onDismiss?: (item: ClassifiedLesson) => void;
  onUnlink?: (item: ClassifiedLesson) => void;
  /** Stage C */
  selectedIds?: Set<string>;
  onToggleSelect?: (lessonId: string) => void;
  onToggleAll?: (ids: string[]) => void;
}

interface Props extends ActionCallbacks {
  items: ClassifiedLesson[];
  activeTab: LessonClassification | 'unlinked' | 'orphaned' | 'out-of-range' | 'mismatch';
  groupBy: ReviewFilters['groupBy'];
  /** Dismissed lesson IDs (in-memory, Stage B) */
  dismissedIds?: Set<string>;
  showDismissed?: boolean;
  /** School enrollment periods — for showing period name in expanded rows */
  schoolEnrollmentPeriods?: SchoolEnrollmentPeriod[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function statusPill(status: LessonStatus) {
  const cls =
    status === LessonStatus.PRESENT || status === LessonStatus.TAUGHT
      ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20'
      : status === LessonStatus.CANCELLED
      ? 'bg-red-500/15 text-red-400 ring-red-500/20'
      : status === LessonStatus.ABSENT_EXCUSED
      ? 'bg-blue-500/15 text-blue-400 ring-blue-500/20'
      : 'bg-amber-500/15 text-amber-400 ring-amber-500/20';
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ring-1 ${cls} whitespace-nowrap`}>
      {status}
    </span>
  );
}

function enrollmentPill(e: Enrollment | null, classification: LessonClassification) {
  if (!e) {
    if (classification === 'orphaned') {
      return <span className="text-[10px] text-red-400 font-mono">Orphaned</span>;
    }
    return <span className="text-[11px] text-slate-600">—</span>;
  }
  const cls =
    classification === 'out-of-range'
      ? 'text-amber-400'
      : classification === 'mismatch'
      ? 'text-orange-400'
      : 'text-slate-400';
  return (
    <span className={`text-[10px] font-mono ${cls}`}>{e.id.slice(0, 16)}…</span>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

const LessonRow: React.FC<{
  item: ClassifiedLesson;
  showSelect: boolean;
  isSelected: boolean;
  schoolEnrollmentPeriods?: SchoolEnrollmentPeriod[];
  onToggleSelect?: (id: string) => void;
  onLink?: (item: ClassifiedLesson) => void;
  onChoose?: (item: ClassifiedLesson) => void;
  onDismiss?: (item: ClassifiedLesson) => void;
  onUnlink?: (item: ClassifiedLesson) => void;
}> = ({ item, showSelect, isSelected, schoolEnrollmentPeriods = [], onToggleSelect, onLink, onChoose, onDismiss, onUnlink }) => {
  const { lesson, classification, linkedEnrollment, suggestions } = item;
  const [expanded, setExpanded] = useState(false);

  // Find the school period for the linked enrollment (if any)
  const linkedPeriod = linkedEnrollment?.schoolPeriodId
    ? schoolEnrollmentPeriods.find(p => p.id === linkedEnrollment.schoolPeriodId)
    : undefined;

  const isGroup = (lesson.studentIds?.length ?? 0) > 1;

  const canLink = onLink !== undefined && suggestions.length > 0;
  const canChoose = onChoose !== undefined;
  const canDismiss = onDismiss !== undefined && classification === 'unlinked';
  const canUnlink = onUnlink !== undefined &&
    (classification === 'orphaned' || classification === 'out-of-range' || classification === 'mismatch');

  // 19.6D5D: subtle row tint by top-suggestion confidence (unlinked only)
  const topConfidence = suggestions[0]?.confidence;
  const confidenceTint =
    classification === 'unlinked'
      ? topConfidence === 'high'
        ? 'bg-emerald-500/[0.03]'
        : topConfidence === 'possible'
        ? 'bg-amber-500/[0.03]'
        : ''
      : '';
  const rowBg = isSelected ? 'bg-primary-500/5' : confidenceTint;
  const hoverBg = 'hover:bg-slate-800/30';

  return (
    <>
      <tr
        className={`transition-colors cursor-pointer ${rowBg} ${hoverBg}`}
        onClick={() => setExpanded(e => !e)}
      >
        {/* Checkbox (Stage C — always rendered, disabled in A+B) */}
        {showSelect && (
          <td className="pl-4 pr-2 py-3" onClick={e => { e.stopPropagation(); onToggleSelect?.(lesson.id); }}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect?.(lesson.id)}
              disabled={!onToggleSelect}
              className="rounded accent-primary-500 disabled:opacity-30"
            />
          </td>
        )}

        {/* Date */}
        <td className="px-4 py-3 text-sm text-white tabular-nums whitespace-nowrap">
          {fmtDate(lesson.date)}
        </td>

        {/* Student */}
        <td className="px-4 py-3 text-sm text-slate-300 max-w-[140px]">
          <div className="truncate">
            {lesson.studentNames.join(', ')}
          </div>
          {isGroup && (
            <span
              className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/20 font-medium mt-0.5 cursor-help"
              title={`Group lesson · ${lesson.studentIds.length} students share a single enrollmentId. A suggestion is only offered when every student in the group has the same top candidate; otherwise use Choose… to pick manually.`}
            >
              ⓘ Group · {lesson.studentIds.length}
            </span>
          )}
        </td>

        {/* Teacher */}
        <td className="px-4 py-3 text-sm text-slate-400 max-w-[110px]">
          <span className="truncate block">{lesson.teacherName}</span>
        </td>

        {/* Instrument (from lesson — may not be set on old lessons) */}
        <td className="px-4 py-3 text-sm text-slate-400 whitespace-nowrap">
          {(lesson as any).instrument ?? <span className="text-slate-600">—</span>}
        </td>

        {/* Status */}
        <td className="px-4 py-3">{statusPill(lesson.status)}</td>

        {/* Duration */}
        <td className="px-4 py-3 text-sm text-slate-400 text-right tabular-nums whitespace-nowrap">
          {lesson.durationMinutes}min
        </td>

        {/* Enrollment ID */}
        <td className="px-4 py-3 text-left">
          {enrollmentPill(linkedEnrollment, classification)}
        </td>

        {/* Suggestion chip */}
        <td className="px-4 py-3">
          {classification === 'unlinked' && (
            <EnrollmentSuggestionChip
              suggestions={suggestions}
              onApply={canLink ? s => onLink?.({ ...item, suggestions: [s, ...suggestions.filter(x => x !== s)] }) : undefined}
            />
          )}
          {classification === 'orphaned' && (
            <span className="text-[10px] text-slate-600">Enrollment deleted</span>
          )}
          {classification === 'out-of-range' && (
            <span className="text-[10px] text-amber-500/70">Date outside period</span>
          )}
          {classification === 'mismatch' && (
            <span className="text-[10px] text-orange-500/70">
              {lesson.teacherId !== linkedEnrollment?.teacherId
                ? 'Teacher mismatch'
                : 'Instrument mismatch'}
            </span>
          )}
        </td>

        {/* Actions */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2 whitespace-nowrap" onClick={e => e.stopPropagation()}>
            {/* Link button */}
            {(classification === 'unlinked' || classification === 'orphaned') && (
              <button
                disabled={!canLink}
                onClick={() => onLink?.(item)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-30 disabled:cursor-not-allowed"
                title={!canLink ? 'No suggestion available — use Choose… to pick manually' : 'Link to suggested enrollment'}
              >
                Link
              </button>
            )}

            {/* Choose button */}
            <button
              disabled={!canChoose}
              onClick={() => onChoose?.(item)}
              className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all bg-slate-700/50 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Choose…
            </button>

            {/* Dismiss (unlinked only) */}
            {canDismiss && (
              <button
                onClick={() => onDismiss?.(item)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-500 hover:text-slate-300 transition-colors"
              >
                Dismiss
              </button>
            )}

            {/* Unlink (orphaned/out-of-range/mismatch) */}
            {canUnlink && (
              <button
                onClick={() => onUnlink?.(item)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-red-400/70 hover:text-red-400 transition-colors"
              >
                Unlink
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Expanded row */}
      {expanded && (
        <tr className="bg-slate-900/30">
          <td colSpan={showSelect ? 10 : 9} className="px-8 py-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Lesson ID</p>
                <p className="text-slate-300 font-mono">{lesson.id}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">School</p>
                <p className="text-slate-300">{lesson.schoolName || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Type</p>
                <p className="text-slate-300">{lesson.type}</p>
              </div>
              {/* School Period info for linked enrollment */}
              {linkedEnrollment && (
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Linked Period</p>
                  {linkedPeriod ? (
                    <p className="text-slate-300">
                      {linkedPeriod.name}
                      {linkedPeriod.term ? <span className="text-slate-500 ml-1">· {linkedPeriod.term}</span> : null}
                      <span className="text-slate-600 ml-1">({linkedPeriod.academicYear})</span>
                      {linkedPeriod.status === 'archived' && (
                        <span className="ml-1 text-[9px] text-amber-500 bg-amber-500/10 ring-1 ring-amber-500/20 px-1.5 py-0.5 rounded-full">archived</span>
                      )}
                    </p>
                  ) : linkedEnrollment.schoolPeriodId ? (
                    <p className="text-slate-500 font-mono text-[10px]">
                      Period: {linkedEnrollment.schoolPeriodId.slice(0, 20)}… (not loaded)
                    </p>
                  ) : (
                    <p className="text-slate-600">Custom dates (no period)</p>
                  )}
                </div>
              )}
              {lesson.notes && (
                <div className="col-span-full">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Notes</p>
                  <p className="text-slate-400 line-clamp-2">{lesson.notes}</p>
                </div>
              )}
              {/* All suggestion candidates */}
              {classification === 'unlinked' && suggestions.length > 0 && (
                <div className="col-span-full">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                    All candidates ({suggestions.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.map((s, i) => (
                      <span
                        key={s.enrollment.id}
                        className="text-[10px] text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded-full ring-1 ring-white/5"
                      >
                        #{i + 1} {s.enrollment.instrument} · {s.enrollment.teacherName} · score {s.score}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 19.6D5D: Why no suggestion? */}
              {classification === 'unlinked' && suggestions.length === 0 && (
                <div className="col-span-full bg-slate-800/40 ring-1 ring-white/5 rounded-lg p-2.5">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">
                    Why no suggestion?
                  </p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    A suggestion requires a non-cancelled enrollment that matches the lesson's <strong>student</strong> and <strong>instrument</strong>.
                    {!((lesson as any).instrument) && ' This lesson has no instrument set.'}
                    {isGroup && ' Group lessons also require every student in the group to share the same top candidate.'}
                  </p>
                  <ul className="text-[11px] text-slate-500 mt-1.5 list-disc list-inside space-y-0.5">
                    <li>Create an enrollment for {lesson.studentNames[0]}{(lesson as any).instrument ? ` / ${(lesson as any).instrument}` : ''}, then return here.</li>
                    <li>Or use <strong className="text-slate-300">Choose…</strong> to link manually.</li>
                    <li>Or <strong className="text-slate-300">Dismiss</strong> if this lesson should stay unlinked.</li>
                  </ul>
                </div>
              )}
              {/* Group lesson warning */}
              {isGroup && (
                <div className="col-span-full">
                  <p className="text-[10px] text-amber-500/70">
                    ⚠ Group lesson — single enrollmentId covers all {lesson.studentIds.length} students.
                    Suggestions shown only when all students share a common top candidate.
                  </p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

// ─── Group header ─────────────────────────────────────────────────────────────

const GroupHeader: React.FC<{
  label: string;
  count: number;
  showSelect: boolean;
  allIds: string[];
  selectedIds?: Set<string>;
  onToggleAll?: (ids: string[]) => void;
  /** Stage C batch action — disabled in A+B */
  onGroupLink?: (ids: string[]) => void;
}> = ({ label, count, showSelect, allIds, selectedIds, onToggleAll, onGroupLink }) => {
  const allSelected = allIds.length > 0 && allIds.every(id => selectedIds?.has(id));
  return (
    <tr className="bg-slate-800/30">
      {showSelect && (
        <td className="pl-4 pr-2 py-2">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => onToggleAll?.(allIds)}
            disabled={!onToggleAll}
            className="rounded accent-primary-500 disabled:opacity-30"
          />
        </td>
      )}
      <td colSpan={showSelect ? 9 : 8} className="px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">{label}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700/60 text-slate-400 ring-1 ring-white/5">
              {count} lesson{count !== 1 ? 's' : ''}
            </span>
          </div>
          {onGroupLink && (
            <button
              disabled
              className="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-600/20 text-emerald-400/50 font-medium cursor-not-allowed"
            >
              Link all to…
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};

// ─── Main table ───────────────────────────────────────────────────────────────

export const EnrollmentReviewTable: React.FC<Props> = ({
  items,
  activeTab,
  groupBy,
  dismissedIds = new Set(),
  showDismissed = false,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onLink,
  onChoose,
  onDismiss,
  onUnlink,
  schoolEnrollmentPeriods = [],
}) => {
  const showSelect = Boolean(onToggleSelect);

  // Filter out dismissed rows
  const visible = items.filter(
    item => showDismissed || !dismissedIds.has(item.lesson.id)
  );

  if (visible.length === 0) {
    // 19.6D5D: per-tab empty state copy
    const emptyCopy: Record<string, { title: string; hint: string }> = {
      unlinked:       { title: 'All lessons are linked.',          hint: 'Nothing needs review in this tab.' },
      orphaned:       { title: 'No orphaned lessons.',              hint: 'Every linked lesson points to an existing enrollment.' },
      'out-of-range': { title: 'No out-of-range lessons.',          hint: 'Every linked lesson falls inside its enrollment period.' },
      mismatch:       { title: 'No instrument or teacher mismatches.', hint: 'Every linked lesson matches its enrollment.' },
    };
    const copy = emptyCopy[activeTab as string] ?? { title: 'No lessons in this category.', hint: '' };
    const isFiltered = items.length > visible.length || (items.length === 0 && dismissedIds.size > 0);
    return (
      <div className="bg-slate-900/40 ring-1 ring-white/5 rounded-xl p-12 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-800/60 mb-3">
          <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-slate-300 font-medium">{copy.title}</p>
        {copy.hint && <p className="text-slate-500 text-xs mt-1">{copy.hint}</p>}
        {isFiltered && (
          <p className="text-slate-600 text-[11px] mt-2">
            {dismissedIds.size > 0 && !showDismissed
              ? `${dismissedIds.size} dismissed lesson${dismissedIds.size !== 1 ? 's' : ''} hidden.`
              : 'Some rows are hidden by the current filters.'}
          </p>
        )}
      </div>
    );
  }

  // Build groups
  type Group = { key: string; label: string; items: ClassifiedLesson[] };
  const groups: Group[] = [];

  if (groupBy === 'lesson') {
    groups.push({ key: '__all__', label: '', items: visible });
  } else {
    const map = new Map<string, ClassifiedLesson[]>();
    for (const item of visible) {
      const key =
        groupBy === 'student'
          ? item.lesson.studentNames[0] ?? item.lesson.studentIds[0]
          : `${item.lesson.studentNames[0] ?? item.lesson.studentIds[0]} · ${(item.lesson as any).instrument ?? '?'}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    for (const [key, items] of map) {
      groups.push({ key, label: key, items });
    }
    groups.sort((a, b) => a.label.localeCompare(b.label));
  }

  const allVisibleIds = visible.map(i => i.lesson.id);

  return (
    <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-800/40 text-[10px] text-slate-500 uppercase tracking-wider">
              {showSelect && (
                <th className="pl-4 pr-2 py-3">
                  <input
                    type="checkbox"
                    checked={allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds?.has(id))}
                    onChange={() => onToggleAll?.(allVisibleIds)}
                    disabled={!onToggleAll}
                    className="rounded accent-primary-500 disabled:opacity-30"
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">Student</th>
              <th className="px-4 py-3 text-left font-medium">Teacher</th>
              <th className="px-4 py-3 text-left font-medium">Instrument</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Duration</th>
              <th className="px-4 py-3 text-left font-medium">Enrollment</th>
              <th className="px-4 py-3 text-left font-medium">Suggested</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {groups.map(group => (
              <React.Fragment key={group.key}>
                {groupBy !== 'lesson' && (
                  <GroupHeader
                    label={group.label}
                    count={group.items.length}
                    showSelect={showSelect}
                    allIds={group.items.map(i => i.lesson.id)}
                    selectedIds={selectedIds}
                    onToggleAll={onToggleAll}
                    onGroupLink={onLink ? () => {} : undefined}
                  />
                )}
                {group.items.map(item => (
                  <LessonRow
                    key={item.lesson.id}
                    item={item}
                    showSelect={showSelect}
                    isSelected={selectedIds?.has(item.lesson.id) ?? false}
                    schoolEnrollmentPeriods={schoolEnrollmentPeriods}
                    onToggleSelect={onToggleSelect}
                    onLink={onLink}
                    onChoose={onChoose}
                    onDismiss={onDismiss}
                    onUnlink={onUnlink}
                  />
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
