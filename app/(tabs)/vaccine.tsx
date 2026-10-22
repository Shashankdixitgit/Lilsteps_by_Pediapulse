import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { memo, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Celebrate, type CelebrateHandle } from '@/components/celebrate/Celebrate';
import { ChipGroup } from '@/components/chip-group';
import { GradientButton, TextButton } from '@/components/gradient-button';
import { confirmAsync } from '@/components/growth/confirm';
import { DateField } from '@/components/growth/DateField';
import { Sheet } from '@/components/growth/Sheet';
import { Sprout } from '@/components/mascot/Sprout';
import { TabScreenLayout } from '@/components/TabScreenLayout';
import { useTabBarSpace } from '@/components/home/tabBarSpace';
import { AnimatedProgress } from '@/components/ui/AnimatedProgress';
import { HeroCard } from '@/components/ui/HeroCard';
import { PressableScale } from '@/components/ui/PressableScale';
import { StatusPill, type StatusTone } from '@/components/ui/StatusPill';
import { Sticker } from '@/components/ui/Sticker';
import { BRACKET_LABELS } from '@/constants/bracketConfig';
import {
  ANNUAL_VACCINE_NAMES,
  FEVER_TIP_AFTER_VACCINE,
  FEVER_TIP_OLDER,
  FEVER_TIP_UNDER_3_MONTHS,
} from '@/constants/vaccineQuestions';
import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';
import { HeaderChildAvatar } from '@/components/HeaderChildAvatar';
import { useChild } from '@/context/child';
import { istTodayDateOnly } from '@/hooks/useGrowth';
import { useVaccinations, type VaccinationRow, type VaccinationStatus } from '@/hooks/useVaccinations';
import { getAgeParts } from '@/lib/age';
import { addCalendar, formatDate, parseDateOnly, toDateOnlyString } from '@/lib/date';
import { typography } from '@/styles/global';

/** "Due now" only for a dose in the next few days (same as the Home card). */
const DUE_NOW_DAYS = 3;

export default function VaccineScreen() {
  // Room for the floating tab bar + AI button (R2-17).
  const tabBarSpace = useTabBarSpace();
  const { bracket, child } = useChild();
  const {
    vaccinations: rows,
    loading,
    error: loadError,
    refetch,
    markDone,
    markNotGiven,
    markNotSure,
  } = useVaccinations(child?.id ?? null);
  // The yearly flu shot is one schedule row at 6 months: never "Overdue, due
  // 2013" (O2). Not given yet = a yearly dose to ask about, shown as upcoming.
  // It goes after the dated doses, and never counts as the "next" dose.
  const today = istTodayDateOnly();
  const yearlyPast = (v: VaccinationRow) => isYearly(v) && v.status !== 'done' && v.scheduled_date < today;
  const mapped = rows.map(asYearly);
  const vaccinations = [...mapped.filter((v) => !yearlyPast(v)), ...mapped.filter(yearlyPast)];
  // The dose whose "Mark given" / "Given" sheet is open.
  const [selected, setSelected] = useState<VaccinationRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // New key per opening, so the sheet's fields start fresh each time.
  const [sheetKey, setSheetKey] = useState(0);
  // The "to check with your doctor" group starts short (C3: an older child
  // can have ~30 early doses there).
  const [showAllUnknown, setShowAllUnknown] = useState(false);

  // Web: the row that opened the sheet gets keyboard focus back when it
  // closes (R3-21 "sheet focus"), instead of focus landing at the page top.
  const openerRef = useRef<HTMLElement | null>(null);

  function openDose(v: VaccinationRow) {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    setSelected(v);
    setSheetKey((k) => k + 1);
    setSheetOpen(true);
  }

  function closeDose() {
    setSheetOpen(false);
    const opener = openerRef.current;
    openerRef.current = null;
    if (Platform.OS !== 'web' || !opener) return;
    // After the modal unmounts (and a save's refetch re-renders the list).
    setTimeout(() => {
      if (opener.isConnected) opener.focus();
    }, 50);
  }
  const celebrateRef = useRef<CelebrateHandle>(null);
  // One-shot per session (no persistence; UI-only).
  const celebratedCaughtUp = useRef(false);

  const bracketLabel = bracket ? BRACKET_LABELS[bracket] : '';
  const childName = child?.name ?? 'Your child';
  const ageParts = child ? getAgeParts(child.dob) : null;
  const ageYears = ageParts?.years ?? 0;
  const showInfantTip = ageYears < 5;
  // Pending C5 sign-off (see FEVER_TIP_PENDING_SIGN_OFF): 100.4°F under 3 months.
  const underThreeMonths = (ageParts?.totalMonths ?? 0) < 3;

  const doneCount = vaccinations.filter((v) => v.status === 'done').length;
  const total = vaccinations.length;
  const progress = total > 0 ? doneCount / total : 0;
  const progressPct = Math.round(progress * 100);

  // Statuses come from the hook already worked out against today's date, and
  // the list is in date order, so the first upcoming row is the next dose.
  const nextDue = vaccinations.find((v) => v.status === 'due_soon');
  const dueNowUntil = toDateOnlyString(addCalendar(parseDateOnly(today), { days: DUE_NOW_DAYS }));
  const nextUpcoming = vaccinations.find((v) => v.status === 'upcoming' && !yearlyPast(v));
  const overdueCount = vaccinations.filter((v) => v.status === 'overdue').length;
  const unknownCount = vaccinations.filter((v) => v.status === 'unknown').length;
  const caughtUp = total > 0 && !nextDue && overdueCount === 0 && unknownCount === 0;

  // One calm stats line (absorbs the old Next dose / Status bento cards).
  const statsLine = [
    overdueCount > 0 ? `${overdueCount} overdue` : null,
    unknownCount > 0 ? `${unknownCount} to check with your doctor` : null,
    nextDue
      ? // "Due now" only within a few days; later in the 14-day window is "due soon" (R3-21).
        `${nextDue.scheduled_date <= dueNowUntil ? 'due now' : 'due soon'}: ${doseName(nextDue)}, ${formatDate(nextDue.scheduled_date)}`
      : nextUpcoming
        ? `next: ${doseName(nextUpcoming)}, ${formatDate(nextUpcoming.scheduled_date)}`
        : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const statsText = statsLine
    ? statsLine.charAt(0).toUpperCase() + statsLine.slice(1)
    : total > 0
      ? 'All done for now'
      : '';

  // Doses nobody is sure were given (answered "Not sure", or the baby
  // vaccines were not completed) get their own calm group, not the schedule.
  const unknownRows = vaccinations.filter((v) => v.status === 'unknown');
  const scheduleRows = vaccinations.filter((v) => v.status !== 'unknown');
  const unknownShown = showAllUnknown ? unknownRows : unknownRows.slice(0, UNKNOWN_PREVIEW);

  /** Throws on failure; the sheet stays open and shows the message. */
  async function handleMarkGiven(id: string, date: string | null) {
    const wasDone = vaccinations.find((v) => v.id === id)?.status === 'done';
    // "Caught up" = no due, overdue or unsure rows remain after this mark.
    const remaining = vaccinations.filter(
      (v) => v.id !== id && (v.status === 'due_soon' || v.status === 'overdue' || v.status === 'unknown'),
    ).length;
    await markDone(id, date);
    // Changing the date of a dose already given is not a new milestone.
    if (wasDone) return;
    if (remaining === 0 && !celebratedCaughtUp.current) {
      celebratedCaughtUp.current = true;
      celebrateRef.current?.fire({
        big: true,
        title: 'All caught up for now',
        body: `${childName} has every due dose recorded.`,
      });
    } else {
      celebrateRef.current?.fire({
        title: 'Dose recorded',
        body: `Saved for ${childName}. Tap the dose to change or undo it.`,
      });
    }
  }

  // Full-screen spinner only on the very first load: refetches after
  // "mark as given" keep the list (and the celebration) mounted.
  if (loading && vaccinations.length === 0) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={AppColors.secondary} />
      </View>
    );
  }

  const headerContent = (
    <>
      <Text style={typography.heading}>Vaccines</Text>
      <View style={styles.headerRight}>
        <HeaderChildAvatar />
      </View>
    </>
  );

  return (
    <View style={styles.screen}>
      <TabScreenLayout headerContent={headerContent} scrollContentStyle={{ paddingBottom: tabBarSpace }}>
        {/* Never "0 of 0 given" as if nothing were due: a failed or empty
            load says so, with Retry (R3-11, R3-12). */}
        {total === 0 || loadError ? (
          <View style={styles.loadNotice} accessibilityRole={loadError ? 'alert' : undefined}>
            <Ionicons name="cloud-offline-outline" size={16} color={AppColors.onSurfaceVariant} />
            <Text style={[typography.bodySM, styles.loadNoticeText]}>
              {loadError
                ? total === 0
                  ? "Couldn't load the vaccine schedule. Check your connection and try again."
                  : "Couldn't refresh. Showing the last loaded schedule."
                : `${childName}'s vaccine schedule isn't ready yet.`}
            </Text>
            <TextButton label="Retry" onPress={() => { void refetch(); }} accessibilityLabel="Retry loading vaccines" />
          </View>
        ) : null}

        {/* Lavender glass hero */}
        <HeroCard style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroTitleCol}>
              {bracketLabel ? <Text style={typography.eyebrow}>{bracketLabel}</Text> : null}
              <Text style={styles.heroTitle}>Vaccination progress</Text>
            </View>
            {caughtUp ? <Sprout mood="cheer" size={56} /> : null}
          </View>

          <View style={styles.heroMetricRow}>
            <Text style={typography.number}>
              {doneCount}
              <Text style={typography.unit}> of {total} given</Text>
            </Text>
            {caughtUp ? (
              <View style={styles.caughtUpSticker}>
                <Sticker icon="star" size={24} />
                <Text style={styles.caughtUpText}>Caught up</Text>
              </View>
            ) : null}
          </View>

          <AnimatedProgress
            value={progress}
            trackColor={AppColors.heroTrack}
            fillColor={AppColors.primary}
            thumb
            thumbRing={AppColors.primary}
            accessibilityLabel={`${progressPct}% of vaccines given`}
          />

          {statsText ? <Text style={typography.bodySM}>{statsText}</Text> : null}

          {/* Upload certificate: a slim ghost row inside the hero */}
          <PressableScale
            style={styles.uploadRow}
            scaleTo={0.99}
            onPress={() =>
              router.push({
                pathname: '/records/upload',
                params: { category: 'vaccination', title: 'Vaccination certificate' },
              })
            }
            accessibilityLabel="Upload vaccination certificate"
          >
            <Ionicons name="cloud-upload-outline" size={Size.iconRow} color={AppColors.secondary} />
            <Text style={styles.uploadTitle}>Upload certificate</Text>
            <Ionicons name="chevron-forward" size={14} color={AppColors.secondary} />
          </PressableScale>
        </HeroCard>

        {/* Doses to check with the doctor (catch-up), kept apart from the schedule */}
        {unknownRows.length > 0 ? (
          <View style={styles.listSection}>
            <Text style={typography.headingSM}>To check with your doctor</Text>
            <Text style={typography.bodySM}>
              We don&apos;t know if these earlier doses were given. Check {childName}&apos;s vaccination card, or ask
              your doctor at the next visit which catch-up doses, if any, are needed.
            </Text>
            <View style={styles.listGroup}>
              {unknownShown.map((vaccine, index) => (
                <VaccineListItem key={vaccine.id} vaccine={vaccine} onOpen={openDose} isFirst={index === 0} />
              ))}
            </View>
            {unknownRows.length > UNKNOWN_PREVIEW ? (
              <TextButton
                label={showAllUnknown ? 'Show fewer' : `Show all ${unknownRows.length}`}
                onPress={() => setShowAllUnknown((v) => !v)}
                style={styles.undoBtn}
              />
            ) : null}
          </View>
        ) : null}

        {/* Vaccination list */}
        <View style={styles.listSection}>
          <Text style={typography.headingSM}>Schedule</Text>
          {scheduleRows.length > 0 ? (
            <View style={styles.listGroup}>
              {scheduleRows.map((vaccine, index) => (
                <VaccineListItem
                  key={vaccine.id}
                  vaccine={vaccine}
                  onOpen={openDose}
                  isFirst={index === 0}
                />
              ))}
            </View>
          ) : null}
          {/* Infant-dose aftercare: not shown from age 5 (R2-25). */}
          {showInfantTip ? (
            <Text style={[typography.meta, styles.note]}>
              {FEVER_TIP_AFTER_VACCINE} {underThreeMonths ? FEVER_TIP_UNDER_3_MONTHS : FEVER_TIP_OLDER}
            </Text>
          ) : null}
        </View>
      </TabScreenLayout>

      <DoseSheet
        key={sheetKey}
        visible={sheetOpen}
        dose={selected}
        childName={childName}
        dob={child?.dob ?? null}
        onClose={closeDose}
        onMarkGiven={handleMarkGiven}
        onMarkNotGiven={markNotGiven}
        onMarkNotSure={markNotSure}
      />

      {/* Mounted outside the scroll + loading branch so it survives refetches. */}
      <Celebrate ref={celebrateRef} bottomOffset={tabBarSpace - 16} />
    </View>
  );
}

/** Rows shown in "To check with your doctor" before "Show all". */
const UNKNOWN_PREVIEW = 3;

const STATUS_UI: Record<VaccinationStatus, { tone: StatusTone; label: string }> = {
  done: { tone: 'success', label: 'Given' },
  due_soon: { tone: 'warning', label: 'Due now' },
  overdue: { tone: 'danger', label: 'Overdue' },
  upcoming: { tone: 'neutral', label: 'Upcoming' },
  unknown: { tone: 'info', label: 'Not sure' },
};

function isYearly(v: Pick<VaccinationRow, 'vaccine_name'>) {
  return ANNUAL_VACCINE_NAMES.has(v.vaccine_name);
}

function asYearly(v: VaccinationRow): VaccinationRow {
  return isYearly(v) && (v.status === 'overdue' || v.status === 'unknown') ? { ...v, status: 'upcoming' } : v;
}

function doseName(v: Pick<VaccinationRow, 'vaccine_name' | 'dose_label'>) {
  return v.dose_label ? `${v.vaccine_name} (${v.dose_label})` : v.vaccine_name;
}

/** "Given 13 Oct 2026" / "Given, date not recorded" / "Due 13 Oct". */
function doseMeta(v: VaccinationRow) {
  if (v.status === 'done') {
    // Doses ticked during onboarding are saved with no date: show "Given"
    // without inventing one.
    const givenStr = formatDate(v.administered_date, { year: 'always' });
    return givenStr ? `Given ${givenStr}` : 'Given, date not recorded';
  }
  // A yearly dose that is past its first due date: no old date to show.
  if (isYearly(v) && v.scheduled_date < istTodayDateOnly()) return 'Every year, ask at the next visit';
  // "13 Oct" this year, "13 Oct 2014" otherwise, so an old due date never
  // reads like today.
  return `${v.status === 'unknown' ? 'Was due' : 'Due'} ${formatDate(v.scheduled_date)}`;
}

const VaccineListItem = memo(function VaccineListItem({
  vaccine,
  onOpen,
  isFirst,
}: {
  vaccine: VaccinationRow;
  onOpen: (v: VaccinationRow) => void;
  isFirst: boolean;
}) {
  const { status } = vaccine;
  const displayName = doseName(vaccine);
  const ui = STATUS_UI[status];
  const isDone = status === 'done';
  const metaStr = doseMeta(vaccine);

  // Every row opens its sheet: "Mark given" (any dose not yet given, with a
  // date or "date not known") or, for a given dose, change the date / undo.
  return (
    <Pressable
      onPress={() => onOpen(vaccine)}
      accessibilityRole="button"
      accessibilityLabel={
        isDone
          ? `${displayName}, ${metaStr}. Change or undo`
          : `${displayName}, ${ui.label}, ${metaStr}. Mark as given`
      }
      style={({ pressed }) => [styles.listItem, !isFirst && styles.listItemDivider, pressed && styles.listItemPressed]}
    >
      <View style={styles.listItemContent}>
        <Text style={[styles.listItemTitle, isDone && styles.listItemTitleDone]}>{displayName}</Text>
        <View style={styles.metaRow}>
          {isDone ? null : <StatusPill dot tone={ui.tone} label={ui.label} />}
          <Text style={typography.meta}>{metaStr}</Text>
        </View>
      </View>
      {isDone ? (
        <View style={styles.statusWrap}>
          <StatusPill dot tone={ui.tone} label={ui.label} />
        </View>
      ) : (
        <View style={styles.markPill}>
          <Text style={styles.markPillText}>Mark given</Text>
        </View>
      )}
    </Pressable>
  );
});

const DATE_KNOWN = 'On a date';
const DATE_UNKNOWN = 'Date not known';

/**
 * One dose's sheet. Not yet given: pick the date it was given or "Date not
 * known", then save. Today is pre-filled only for a dose due today or later;
 * for a dose due in the past (BCG at birth…) nothing is pre-filled, so one
 * tap can't record it as given today (R2-14). Already given: change the
 * date, or "Mark as not given" to undo.
 */
function DoseSheet({
  visible,
  dose,
  childName,
  dob,
  onClose,
  onMarkGiven,
  onMarkNotGiven,
  onMarkNotSure,
}: {
  visible: boolean;
  dose: VaccinationRow | null;
  childName: string;
  dob: string | null;
  onClose: () => void;
  onMarkGiven: (id: string, date: string | null) => Promise<void>;
  onMarkNotGiven: (id: string) => Promise<void>;
  onMarkNotSure: (id: string) => Promise<void>;
}) {
  // Starts from the dose; the caller remounts the sheet (new key) per opening.
  const today = istTodayDateOnly();
  const isDone = dose?.status === 'done';
  const pastDue = !isDone && !!dose && dose.scheduled_date < today;
  const [date, setDate] = useState(dose?.administered_date ?? (pastDue ? '' : today));
  // null = not chosen yet (a past-due dose must be answered first).
  const [dateKnown, setDateKnown] = useState<boolean | null>(
    isDone ? !!dose?.administered_date : pastDue ? null : true,
  );
  const [busy, setBusy] = useState<'save' | 'undo' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canSaveDate = dateKnown === false || (dateKnown === true && !!date);
  // Given more than 2 weeks before the due date is unusual (often the wrong
  // dose was tapped): warn, and ask once more on save (R3-21). With the date
  // not known, the latest it could have been given is today.
  const earliestUsual = dose
    ? toDateOnlyString(addCalendar(parseDateOnly(dose.scheduled_date), { weeks: -2 }))
    : '';
  const givenOn = dateKnown ? date : dateKnown === false ? today : '';
  const tooEarly = !!dose && !!givenOn && givenOn < earliestUsual;
  // A given-date can't be before birth or in the future (R3-21). The picker
  // limits it too, but a typed or older saved date can still be out of range.
  const dateProblem =
    dateKnown && date
      ? !/^\d{4}-\d{2}-\d{2}$/.test(date)
        ? 'Please choose a valid date.'
        : dob && date < dob
          ? `This date is before ${childName}'s date of birth (${formatDate(dob, { year: 'always' })}). Please check it.`
          : date > today
            ? 'This date is in the future. Choose the day it was given, or "Date not known".'
            : null
      : null;

  const canSave = canSaveDate && !dateProblem;

  // Web: the scrim (a full-screen "Close" button rendered before the sheet)
  // was the first Tab stop. Take it out of the Tab order and start keyboard
  // focus on the sheet's own Close button. Mouse / touch still close on tap.
  // TODO: move into components/growth/Sheet.tsx (shared) when that file is free.
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible || !dose || typeof document === 'undefined') return;
    const t = setTimeout(() => {
      const dialogs = document.querySelectorAll('[aria-modal="true"]');
      const dialog = dialogs[dialogs.length - 1];
      if (!dialog) return;
      const closes = dialog.querySelectorAll<HTMLElement>('[aria-label="Close"]');
      if (closes.length < 2) return;
      closes[0].setAttribute('tabindex', '-1');
      closes[1].focus();
    }, 50);
    return () => clearTimeout(t);
  }, [visible, dose]);

  async function handleSave() {
    if (!dose || !canSave) return;
    if (tooEarly) {
      const ok = await confirmAsync(
        'Given this early?',
        `${doseName(dose)} is due ${formatDate(dose.scheduled_date, { year: 'always' })}. Please check ${childName}'s vaccination card before marking it given.`,
        { confirmLabel: 'Mark as given' },
      );
      if (!ok) return;
    }
    await run('save', () => onMarkGiven(dose.id, dateKnown ? date : null));
  }

  async function run(kind: 'save' | 'undo', action: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await action();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.');
      setBusy(null);
    }
  }

  // "It was not given" moves the dose into the schedule as due / overdue:
  // ask first, so one stray tap can't do it (R2-20). It can be undone with
  // "Not sure if it was given".
  async function handleNotGiven() {
    if (!dose) return;
    const ok = await confirmAsync(
      'It was not given?',
      `${doseName(dose)} will move to ${childName}'s schedule as a dose to give. You can change this later.`,
      { confirmLabel: 'It was not given' },
    );
    if (ok) await run('undo', () => onMarkNotGiven(dose.id));
  }

  async function handleUndo() {
    if (!dose) return;
    const ok = await confirmAsync(
      'Mark as not given?',
      `${doseName(dose)} will go back to ${childName}'s list of doses to give.`,
      { confirmLabel: 'Mark not given', destructive: true },
    );
    if (ok) await run('undo', () => onMarkNotGiven(dose.id));
  }

  return (
    <Sheet
      visible={visible && !!dose}
      onClose={onClose}
      title={dose ? doseName(dose) : ''}
      subtitle={dose ? `${childName} · ${doseMeta(dose)}` : undefined}
      footer={
        dose ? (
          <>
            {error ? <Text style={[styles.sheetError]} accessibilityLiveRegion="polite">{error}</Text> : null}
            <GradientButton
              label={isDone ? 'Save date' : 'Mark as given'}
              onPress={() => { void handleSave(); }}
              loading={busy === 'save'}
              disabled={busy === 'undo' || !canSave}
              showArrow={false}
            />
            {isDone ? (
              <TextButton
                label={busy === 'undo' ? 'Saving…' : 'Mark as not given'}
                tone="danger"
                onPress={handleUndo}
                disabled={!!busy}
                style={styles.undoBtn}
              />
            ) : dose.status === 'unknown' ? (
              // A dose the parent wasn't sure about can be settled either way:
              // "Not given" puts it back on the list as due / overdue.
              <TextButton
                label={busy === 'undo' ? 'Saving…' : 'It was not given'}
                onPress={() => { void handleNotGiven(); }}
                disabled={!!busy}
                style={styles.undoBtn}
              />
            ) : pastDue && !ANNUAL_VACCINE_NAMES.has(dose.vaccine_name) ? (
              // Undo for "It was not given" (or any past dose): back to the
              // calm "To check with your doctor" group.
              <TextButton
                label={busy === 'undo' ? 'Saving…' : 'Not sure if it was given'}
                onPress={() => { void run('undo', () => onMarkNotSure(dose.id)); }}
                disabled={!!busy}
                style={styles.undoBtn}
              />
            ) : null}
          </>
        ) : null
      }
    >
      {dose?.status === 'unknown' ? (
        <Text style={typography.bodySM}>
          We don&apos;t know if this dose was given. Check {childName}&apos;s vaccination card, then mark it as
          given, or choose &quot;It was not given&quot; to add it back to the doses to give. Your doctor can
          advise on any catch-up dose.
        </Text>
      ) : null}
      <View style={styles.sheetField}>
        <Text style={typography.sectionLabel}>When was it given?</Text>
        <ChipGroup
          label="When was it given?"
          options={[DATE_KNOWN, DATE_UNKNOWN]}
          selected={dateKnown === null ? [] : [dateKnown ? DATE_KNOWN : DATE_UNKNOWN]}
          onChange={(sel) => setDateKnown(sel[0] === undefined ? null : sel[0] !== DATE_UNKNOWN)}
        />
        {pastDue && !canSaveDate ? (
          <Text style={typography.caption}>
            Check the date on {childName}&apos;s vaccination card, or choose {DATE_UNKNOWN}.
          </Text>
        ) : null}
      </View>
      {dateKnown ? (
        <DateField
          label="Date given"
          value={date}
          onChange={setDate}
          min={dob ?? undefined}
          max={today}
          placeholder="Choose the date given"
        />
      ) : null}
      {dateProblem ? (
        <View style={styles.earlyWarn} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle-outline" size={16} color={AppColors.danger} />
          <Text style={[typography.bodySM, styles.earlyWarnText, styles.dateProblemText]}>{dateProblem}</Text>
        </View>
      ) : null}
      {tooEarly && dose && !dateProblem ? (
        <View style={styles.earlyWarn} accessibilityLiveRegion="polite">
          <Ionicons name="warning-outline" size={16} color={AppColors.warning} />
          <Text style={[typography.bodySM, styles.earlyWarnText]}>
            This dose is not due until {formatDate(dose.scheduled_date, { year: 'always' })}. Check {childName}&apos;s
            vaccination card that it is the right dose.
          </Text>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: AppColors.surface,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: AppColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  hero: {
    gap: 12,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroTitleCol: {
    flex: 1,
    gap: 4,
  },
  heroTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: -0.2,
    color: AppColors.forestDeep,
  },
  heroMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  caughtUpSticker: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  caughtUpText: {
    fontFamily: FontFamily.semibold,
    fontSize: 13,
    color: AppColors.secondary,
  },
  uploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    minHeight: 44,
  },
  uploadTitle: {
    fontFamily: FontFamily.semibold,
    fontSize: 15,
    color: AppColors.secondary,
  },

  listSection: { gap: 8 },
  listGroup: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: AppColors.border,
    borderCurve: 'continuous',
  },
  // The pill wraps under the text when the row is narrow (200% zoom, large
  // text), so the name never breaks one letter per line (R2-05).
  listItem: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  listItemDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
  },
  statusWrap: {
    alignSelf: 'center',
  },
  listItemPressed: {
    backgroundColor: AppColors.surfaceContainerLow,
  },
  listItemContent: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 160,
    minWidth: 0,
    gap: 4,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  sheetField: { gap: 8 },
  sheetError: { ...typography.caption, color: AppColors.danger, textAlign: 'center' },
  undoBtn: { alignSelf: 'center' },
  earlyWarn: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  earlyWarnText: { flex: 1 },
  loadNotice: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    backgroundColor: AppColors.card,
  },
  loadNoticeText: { flex: 1, minWidth: 160 },
  dateProblemText: { color: AppColors.danger },
  listItemTitle: {
    fontFamily: FontFamily.semibold,
    fontSize: 15,
    lineHeight: 22,
    color: AppColors.onSurface,
  },
  listItemTitleDone: {
    color: AppColors.onSurfaceVariant,
  },
  markPill: {
    minHeight: Size.buttonSmall,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: AppColors.borderStrong,
  },
  markPillText: {
    fontFamily: FontFamily.semibold,
    fontSize: 13,
    color: AppColors.primary,
  },
  note: {
    paddingHorizontal: 4,
    marginTop: 4,
  },
});
