/**
 * EnrollmentReview — Phase 19.6D5A + 19.6D5B + 19.6D5C
 *
 * Admin-only page at /admin/enrollment-review.
 *
 * ── Stage A ──────────────────────────────────────────────────────────────────
 * Read-only. Zero writes. 4 tabs, filters, group-by, suggestion chips.
 *
 * ── Stage B ──────────────────────────────────────────────────────────────────
 * Single-lesson actions:
 *   Link (via suggestion), Choose… (manual picker), Dismiss, Unlink
 * Writes ONLY lesson.enrollmentId via updateLessonEnrollmentLink().
 * In-memory undo with 10-second toast.
 *
 * ── Stage C ──────────────────────────────────────────────────────────────────
 * Row selection + sticky bottom bar + batch preview modal + chunked writes.
 * "Review suggested links" — batch link all selected rows to their top suggestion.
 * "Link all to…" — open enrollment picker, then batch link all selected to one enrollment.
 * Max 200 rows per batch preview. Undo restores all previous enrollmentIds.
 */

import React, { useMemo, useState, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Role,
  LessonStatus,
  Enrollment,
  EnrollmentStatus,
  getTodayISO,
  isCurrentEnrollment,
  getEnrollmentRemaining,
} from '../../types';
import {
  classifyAllLessons,
  ClassifiedLesson,
  LessonClassification,
  EnrollmentSuggestion,
} from '../../services/enrollmentReviewSuggestions';
import {
  EnrollmentReviewFilters,
  ReviewFilters,
  defaultFilters,
} from '../../components/enrollmentReview/EnrollmentReviewFilters';
import { EnrollmentReviewTable } from '../../components/enrollmentReview/EnrollmentReviewTable';
import { LinkPreviewModal } from '../../components/enrollmentReview/LinkPreviewModal';
import { ChooseEnrollmentModal } from '../../components/enrollmentReview/ChooseEnrollmentModal';
import { UnlinkPreviewModal } from '../../components/enrollmentReview/UnlinkPreviewModal';
import { BatchLinkPreviewModal, BatchLinkItem } from '../../components/enrollmentReview/BatchLinkPreviewModal';
import { matchesSearch } from '../../services/searchUtils';

// ─── Tab definition ───────────────────────────────────────────────────────────

type TabKey = 'unlinked' | 'orphaned' | 'out-of-range' | 'mismatch';

const TABS: Array<{ key: TabKey; label: string; description: string }> = [
  { key: 'unlinked',     label: 'Unlinked',     description: 'No enrollment linked' },
  { key: 'orphaned',     label: 'Orphaned',     description: 'Linked enrollment no longer exists' },
  { key: 'out-of-range', label: 'Out of range', description: 'Date outside enrollment period' },
  { key: 'mismatch',     label: 'Mismatch',     description: 'Instrument or teacher disagrees with linked enrollment' },
];

// ─── Undo stack entry ─────────────────────────────────────────────────────────

interface UndoEntry {
  label: string;
  undo: () => Promise<void>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const EnrollmentReview: React.FC = () => {
  const {
    currentUser,
    lessons,
    enrollments,
    schools,
    teachers,
    students,
    schoolEnrollmentPeriods,
    updateLessonEnrollmentLink,
    batchUpdateLessonEnrollmentLinks,
  } = useApp();

  if (currentUser?.role !== Role.ADMIN) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-400 text-sm">This page is only accessible to administrators.</p>
      </div>
    );
  }

  const today = getTodayISO();

  // ── State ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabKey>('unlinked');
  const [filters, setFilters] = useState<ReviewFilters>(defaultFilters());
  const [includeAtCapacity, setIncludeAtCapacity] = useState(false);

  // Stage B
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [showDismissed, setShowDismissed] = useState(false);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastTimer, setToastTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Stage B modals
  const [linkItem, setLinkItem] = useState<{ item: ClassifiedLesson; enrollment: Enrollment; suggestion?: EnrollmentSuggestion } | null>(null);
  const [chooseItem, setChooseItem] = useState<ClassifiedLesson | null>(null);
  const [unlinkItem, setUnlinkItem] = useState<ClassifiedLesson | null>(null);

  // Stage C
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchItems, setBatchItems] = useState<BatchLinkItem[] | null>(null);
  // "Link all to…" — first picks an enrollment via ChooseEnrollmentModal (reused), then opens batch preview
  const [batchChooseOpen, setBatchChooseOpen] = useState(false);

  // ── Classify all lessons ───────────────────────────────────────────────────
  const classified = useMemo(
    () => classifyAllLessons(lessons, enrollments, today, includeAtCapacity),
    [lessons, enrollments, today, includeAtCapacity]
  );

  // ── Tab counts ────────────────────────────────────────────────────────────
  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = { unlinked: 0, orphaned: 0, 'out-of-range': 0, mismatch: 0 };
    for (const c of classified) {
      if ((c.classification as string) in counts) {
        counts[c.classification as TabKey]++;
      }
    }
    return counts;
  }, [classified]);

  // ── Available instruments ─────────────────────────────────────────────────
  const availableInstruments = useMemo(() => {
    const set = new Set<string>();
    for (const c of classified) {
      const instrument = (c.lesson as any).instrument as string | undefined;
      if (instrument) set.add(instrument);
    }
    return Array.from(set).sort();
  }, [classified]);

  // ── Apply filters ─────────────────────────────────────────────────────────
  const filteredItems = useMemo((): ClassifiedLesson[] => {
    return classified.filter(item => {
      if ((item.classification as string) !== activeTab) return false;
      if (!filters.showCancelled && item.lesson.status === LessonStatus.CANCELLED) return false;
      if (filters.schoolId) {
        if (filters.schoolId === '__private__') {
          if (item.lesson.schoolId) return false;
        } else {
          if (item.lesson.schoolId !== filters.schoolId) return false;
        }
      }
      if (filters.teacherId && item.lesson.teacherId !== filters.teacherId) return false;
      if (filters.studentSearch.trim()) {
        if (!matchesSearch(filters.studentSearch, item.lesson.studentNames)) return false;
      }
      if (filters.instrument) {
        const li = ((item.lesson as any).instrument as string | undefined) ?? '';
        if (li.trim().toLowerCase() !== filters.instrument.trim().toLowerCase()) return false;
      }
      if (filters.dateFrom && item.lesson.date < filters.dateFrom) return false;
      if (filters.dateTo   && item.lesson.date > filters.dateTo)   return false;
      if (filters.onlyWithSuggestion && item.suggestions.length === 0) return false;
      // 19.6D5D — confidence filter
      if (filters.confidence !== 'any') {
        if (filters.confidence === 'none') {
          if (item.suggestions.length !== 0) return false;
        } else {
          const top = item.suggestions[0];
          if (!top) return false;
          if (top.confidence !== filters.confidence) return false;
        }
      }
      // Period filter: for linked lessons check the linked enrollment's schoolPeriodId;
      // for unlinked lessons check the top suggestion's enrollment's schoolPeriodId.
      if (filters.periodId) {
        const linkedPeriodId = item.linkedEnrollment?.schoolPeriodId;
        const topSuggestionPeriodId = item.suggestions[0]?.enrollment?.schoolPeriodId;
        const matchesPeriod = linkedPeriodId === filters.periodId || topSuggestionPeriodId === filters.periodId;
        if (!matchesPeriod) return false;
      }
      return true;
    });
  }, [classified, activeTab, filters]);

  // ── Toast helper ──────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer) clearTimeout(toastTimer);
    const t = setTimeout(() => { setToastMsg(null); setUndoStack([]); }, 10000);
    setToastTimer(t);
  }, [toastTimer]);

  const pushUndo = useCallback((label: string, undo: () => Promise<void>) => {
    setUndoStack(s => [...s, { label, undo }]);
    showToast(label);
  }, [showToast]);

  // ── Stage B: Link action ──────────────────────────────────────────────────
  const handleLink = useCallback((item: ClassifiedLesson) => {
    const top = item.suggestions[0];
    if (!top) return;
    setLinkItem({ item, enrollment: top.enrollment, suggestion: top });
  }, []);

  // ── Stage B: Choose… (open picker) ────────────────────────────────────────
  const handleChoose = useCallback((item: ClassifiedLesson) => {
    setChooseItem(item);
  }, []);

  const handleChooseSelect = useCallback((item: ClassifiedLesson, enrollment: Enrollment) => {
    setChooseItem(null);
    setLinkItem({ item, enrollment, suggestion: undefined });
  }, []);

  // ── Stage B: Dismiss ──────────────────────────────────────────────────────
  const handleDismiss = useCallback((item: ClassifiedLesson) => {
    const prev = new Set(dismissedIds);
    setDismissedIds(new Set([...prev, item.lesson.id]));
    pushUndo(
      `Dismissed: ${item.lesson.studentNames[0]} on ${item.lesson.date}`,
      async () => setDismissedIds(prev)
    );
  }, [dismissedIds, pushUndo]);

  // ── Stage B: Unlink ───────────────────────────────────────────────────────
  const handleUnlink = useCallback((item: ClassifiedLesson) => {
    setUnlinkItem(item);
  }, []);

  // ── Stage B: Confirm link write ────────────────────────────────────────────
  const handleConfirmLink = useCallback(async () => {
    if (!linkItem) return;
    const { item, enrollment } = linkItem;
    const previousEnrollmentId = item.lesson.enrollmentId ?? null;
    const result = await updateLessonEnrollmentLink(item.lesson.id, enrollment.id);
    if (!result.success) {
      alert(`Failed to link: ${result.message}`);
      setLinkItem(null);
      return;
    }
    setLinkItem(null);
    pushUndo(
      `Linked: ${item.lesson.studentNames[0]} on ${item.lesson.date} → ${enrollment.instrument}`,
      async () => {
        const r = await updateLessonEnrollmentLink(item.lesson.id, previousEnrollmentId);
        if (!r.success) alert(`Undo failed: ${r.message}`);
      }
    );
  }, [linkItem, updateLessonEnrollmentLink, pushUndo]);

  // ── Stage B: Confirm unlink write ─────────────────────────────────────────
  const handleConfirmUnlink = useCallback(async () => {
    if (!unlinkItem) return;
    const { lesson, linkedEnrollment } = unlinkItem;
    const previousEnrollmentId = lesson.enrollmentId ?? null;
    const result = await updateLessonEnrollmentLink(lesson.id, null);
    if (!result.success) {
      alert(`Failed to unlink: ${result.message}`);
      setUnlinkItem(null);
      return;
    }
    setUnlinkItem(null);
    pushUndo(
      `Unlinked: ${lesson.studentNames[0]} on ${lesson.date}`,
      async () => {
        if (!previousEnrollmentId) return;
        const r = await updateLessonEnrollmentLink(lesson.id, previousEnrollmentId);
        if (!r.success) alert(`Undo failed: ${r.message}`);
      }
    );
  }, [unlinkItem, updateLessonEnrollmentLink, pushUndo]);

  // ── Stage C: selection ─────────────────────────────────────────────────────
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);
  const handleToggleAll = useCallback((ids: string[]) => {
    setSelectedIds(prev => {
      const allSelected = ids.every(id => prev.has(id));
      const next = new Set(prev);
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  }, []);

  // ── Stage C: "Review suggested links" ────────────────────────────────────
  const handleBatchReviewSuggested = useCallback(() => {
    // Gather selected items that have a top suggestion
    const selected = filteredItems.filter(
      i => selectedIds.has(i.lesson.id) && i.suggestions.length > 0
    );
    // Enforce 200-row limit
    const capped = selected.slice(0, 200);
    if (capped.length === 0) return;

    const items: BatchLinkItem[] = capped.map(i => {
      const top = i.suggestions[0];
      const blockReason =
        top.enrollment.status === EnrollmentStatus.CANCELLED
          ? 'Cannot link to a cancelled enrollment.'
          : undefined;
      return {
        lesson: i.lesson,
        enrollment: top.enrollment,
        suggestion: top,
        blockReason,
      };
    });
    setBatchItems(items);
  }, [filteredItems, selectedIds]);

  // ── Stage C: "Link all to…" ───────────────────────────────────────────────
  const handleBatchLinkAllTo = useCallback(() => {
    setBatchChooseOpen(true);
  }, []);

  const handleBatchChooseSelect = useCallback((enrollment: Enrollment) => {
    setBatchChooseOpen(false);
    const selected = filteredItems.filter(i => selectedIds.has(i.lesson.id));
    const capped = selected.slice(0, 200);
    if (capped.length === 0) return;

    const blockReason =
      enrollment.status === EnrollmentStatus.CANCELLED
        ? 'Cannot link to a cancelled enrollment.'
        : undefined;

    const items: BatchLinkItem[] = capped.map(i => ({
      lesson: i.lesson,
      enrollment,
      suggestion: undefined,
      blockReason,
    }));
    setBatchItems(items);
  }, [filteredItems, selectedIds]);

  // ── Stage C: Confirm batch write ─────────────────────────────────────────
  const handleConfirmBatch = useCallback(async (
    pairs: Array<{ lessonId: string; enrollmentId: string }>
  ) => {
    // Save previous enrollmentIds for undo
    const previous = pairs.map(p => {
      const lesson = lessons.find(l => l.id === p.lessonId);
      return { lessonId: p.lessonId, enrollmentId: lesson?.enrollmentId ?? null };
    });

    const result = await batchUpdateLessonEnrollmentLinks(pairs);
    setBatchItems(null);
    setSelectedIds(new Set());

    if (!result.success) {
      showToast(`Batch failed: ${result.written} linked, ${result.failed} failed. ${result.message ?? ''}`);
      return;
    }

    pushUndo(
      `Batch linked ${result.written} lesson${result.written !== 1 ? 's' : ''}`,
      async () => {
        const undoPairs = previous.map(p => ({
          lessonId: p.lessonId,
          enrollmentId: p.enrollmentId,
        }));
        const r = await batchUpdateLessonEnrollmentLinks(undoPairs);
        if (!r.success) {
          alert(`Batch undo failed: ${r.written} reverted, ${r.failed} failed.`);
        }
      }
    );
  }, [lessons, batchUpdateLessonEnrollmentLinks, showToast, pushUndo]);

  // ── Compute warnings for link preview ────────────────────────────────────
  const linkWarnings = useMemo((): string[] => {
    if (!linkItem) return [];
    const w: string[] = [];
    const { item, enrollment, suggestion } = linkItem;
    if (suggestion) {
      if (suggestion.dateOutOfRange) {
        w.push('This lesson\'s date is outside the enrollment\'s period.');
      }
      if (suggestion.confidence === 'weak') {
        w.push('Low confidence match — please verify this is the correct enrollment.');
      }
    } else {
      // Manual pick — check for mismatches
      const lessonInstrument = ((item.lesson as any).instrument as string | undefined) ?? '';
      if (lessonInstrument && enrollment.instrument &&
          lessonInstrument.trim().toLowerCase() !== enrollment.instrument.trim().toLowerCase()) {
        w.push(`Instrument mismatch: lesson is "${lessonInstrument}", enrollment is "${enrollment.instrument}".`);
      }
      if (item.lesson.teacherId && enrollment.teacherId &&
          item.lesson.teacherId !== enrollment.teacherId) {
        w.push(`Teacher mismatch: different teacher on enrollment.`);
      }
      if (enrollment.startDate && item.lesson.date < enrollment.startDate) {
        w.push('Lesson date is before the enrollment start date.');
      }
      if (enrollment.endDate && item.lesson.date > enrollment.endDate) {
        w.push('Lesson date is after the enrollment end date.');
      }
    }
    return w;
  }, [linkItem]);

  const linkBlockReason = useMemo((): string | undefined => {
    if (!linkItem) return undefined;
    const { enrollment } = linkItem;
    if (enrollment.status === EnrollmentStatus.CANCELLED) {
      return 'Cannot link to a cancelled enrollment.';
    }
    return undefined;
  }, [linkItem]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Enrollment Review</h1>
        <p className="text-slate-500 text-sm mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
          <span>{tabCounts.unlinked} unlinked</span>
          <span className="text-slate-700">·</span>
          <span>{tabCounts.orphaned} orphaned</span>
          <span className="text-slate-700">·</span>
          <span>{tabCounts['out-of-range']} out of range</span>
          <span className="text-slate-700">·</span>
          <span>{tabCounts.mismatch} mismatch</span>
        </p>
        <div className="mt-3 bg-blue-500/10 ring-1 ring-blue-500/20 rounded-lg px-4 py-2.5 flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-blue-300">
            <strong>Review mode.</strong> Nothing is written automatically. Every action requires confirmation.
            Linking only modifies <code className="bg-slate-800 px-1 py-0.5 rounded text-[10px]">lesson.enrollmentId</code>.
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-900/60 ring-1 ring-white/5 rounded-xl p-1 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setSelectedIds(new Set()); }}
            title={tab.description}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-primary-600/90 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            {tab.label}
            {tabCounts[tab.key] > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-slate-700/60 text-slate-400'
              }`}>
                {tabCounts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Full-enrollments toggle */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="includeAtCapacity"
          checked={includeAtCapacity}
          onChange={e => setIncludeAtCapacity(e.target.checked)}
          className="w-3.5 h-3.5 rounded accent-primary-500"
        />
        <label htmlFor="includeAtCapacity" className="text-xs text-slate-400 cursor-pointer select-none">
          Show full enrollments as candidates (over-capacity suggestions marked with !)
        </label>
      </div>

      {/* Filters */}
      <EnrollmentReviewFilters
        filters={filters}
        onChange={setFilters}
        schools={schools}
        teachers={teachers}
        students={students}
        availableInstruments={availableInstruments}
        schoolEnrollmentPeriods={schoolEnrollmentPeriods}
        resultCount={filteredItems.filter(i => showDismissed || !dismissedIds.has(i.lesson.id)).length}
        totalCount={filteredItems.length}
      />

      {/* Dismissed toggle — 19.6D5D: always visible (placeholder when zero) */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="showDismissed"
          checked={showDismissed}
          onChange={e => setShowDismissed(e.target.checked)}
          disabled={dismissedIds.size === 0}
          className="w-3.5 h-3.5 rounded accent-primary-500 disabled:opacity-40 disabled:cursor-not-allowed"
        />
        <label
          htmlFor="showDismissed"
          className={`text-xs select-none ${
            dismissedIds.size === 0 ? 'text-slate-600 cursor-not-allowed' : 'text-slate-400 cursor-pointer'
          }`}
        >
          {dismissedIds.size === 0
            ? '0 dismissed'
            : `Show ${dismissedIds.size} dismissed lesson${dismissedIds.size !== 1 ? 's' : ''}`}
        </label>
      </div>

      {/* Table */}
      <EnrollmentReviewTable
        items={filteredItems}
        activeTab={activeTab}
        groupBy={filters.groupBy}
        dismissedIds={dismissedIds}
        showDismissed={showDismissed}
        selectedIds={selectedIds}
        schoolEnrollmentPeriods={schoolEnrollmentPeriods}
        onToggleSelect={handleToggleSelect}
        onToggleAll={handleToggleAll}
        onLink={handleLink}
        onChoose={handleChoose}
        onDismiss={handleDismiss}
        onUnlink={activeTab !== 'unlinked' ? handleUnlink : undefined}
      />

      {/* Stage B: Link preview modal */}
      {linkItem && (
        <LinkPreviewModal
          lesson={linkItem.item.lesson}
          targetEnrollment={linkItem.enrollment}
          suggestion={linkItem.suggestion}
          allLessons={lessons}
          blockReason={linkBlockReason}
          warnings={linkWarnings}
          onConfirm={handleConfirmLink}
          onCancel={() => setLinkItem(null)}
        />
      )}

      {/* Stage B: Choose enrollment modal */}
      {chooseItem && (
        <ChooseEnrollmentModal
          lesson={chooseItem.lesson}
          enrollments={enrollments}
          allLessons={lessons}
          onSelect={(enrollment) => handleChooseSelect(chooseItem, enrollment)}
          onClose={() => setChooseItem(null)}
        />
      )}

      {/* Stage B: Unlink preview modal */}
      {unlinkItem && (
        <UnlinkPreviewModal
          lesson={unlinkItem.lesson}
          currentEnrollment={unlinkItem.linkedEnrollment}
          onConfirm={handleConfirmUnlink}
          onCancel={() => setUnlinkItem(null)}
        />
      )}

      {/* Stage C: Sticky bottom bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-slate-900 ring-1 ring-white/15 rounded-2xl px-5 py-3 flex items-center gap-4 shadow-2xl">
            <span className="text-sm text-slate-300 font-medium">{selectedIds.size} selected</span>
            {(() => {
              const suggestedCount = filteredItems.filter(
                i => selectedIds.has(i.lesson.id) && i.suggestions.length > 0
              ).length;
              const capped = Math.min(suggestedCount, 200);
              return (
                <button
                  onClick={handleBatchReviewSuggested}
                  disabled={suggestedCount === 0}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={
                    suggestedCount === 0
                      ? 'No selected lessons have suggestions'
                      : suggestedCount > 200
                      ? `Preview first 200 of ${suggestedCount} suggested`
                      : `Review ${capped} suggested link${capped !== 1 ? 's' : ''}`
                  }
                >
                  Review suggested links
                  {suggestedCount > 0 && (
                    <span className="ml-1.5 text-[10px] bg-emerald-600/30 px-1 py-0.5 rounded-full">
                      {capped}{suggestedCount > 200 ? '+' : ''}
                    </span>
                  )}
                </button>
              );
            })()}
            <button
              onClick={handleBatchLinkAllTo}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all bg-slate-700/50 text-slate-300 hover:bg-slate-700"
              title={`Pick one enrollment and link all ${Math.min(selectedIds.size, 200)} selected lessons to it`}
            >
              Link all to…
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Stage C: Batch link preview modal */}
      {batchItems && (
        <BatchLinkPreviewModal
          items={batchItems}
          allLessons={lessons}
          onConfirm={handleConfirmBatch}
          onCancel={() => setBatchItems(null)}
        />
      )}

      {/* Stage C: "Link all to…" enrollment picker */}
      {batchChooseOpen && (() => {
        // Build a synthetic lesson that merges all selected lessons' studentIds + studentNames,
        // so ChooseEnrollmentModal shows enrollments for ALL students in the batch.
        const selectedItems = filteredItems.filter(i => selectedIds.has(i.lesson.id));
        if (selectedItems.length === 0) { setBatchChooseOpen(false); return null; }
        const mergedStudentIds = Array.from(
          new Set(selectedItems.flatMap(i => i.lesson.studentIds ?? []))
        );
        const mergedStudentNames = Array.from(
          new Set(selectedItems.flatMap(i => i.lesson.studentNames ?? []))
        );
        const syntheticLesson = {
          ...selectedItems[0].lesson,
          studentIds: mergedStudentIds,
          studentNames: mergedStudentNames,
          date: `${selectedItems.length} lessons selected`,
        };
        return (
          <ChooseEnrollmentModal
            lesson={syntheticLesson as any}
            enrollments={enrollments}
            allLessons={lessons}
            onSelect={handleBatchChooseSelect}
            onClose={() => setBatchChooseOpen(false)}
          />
        );
      })()}

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-800 ring-1 ring-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 shadow-2xl flex items-center gap-3 max-w-sm">
          <span className="flex-1 truncate">{toastMsg}</span>
          {undoStack.length > 0 && (
            <button
              onClick={async () => {
                const last = undoStack[undoStack.length - 1];
                if (last) {
                  await last.undo();
                  setUndoStack(s => s.slice(0, -1));
                }
                setToastMsg(null);
              }}
              className="shrink-0 text-primary-400 font-medium hover:text-primary-300"
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
};
