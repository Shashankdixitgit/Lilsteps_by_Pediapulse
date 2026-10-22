import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { doctorInitial } from '@/components/consult/appointmentFormat';
import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';
import { doctorHasVideoLink, type DoctorRow } from '@/hooks/useDoctors';
import { supabase } from '@/lib/supabase';

import { spaceSelects } from './spaceKey';

/** Joins label parts into sentences without doubling a full stop ("Dr.." / "Pediatrician.."). */
function sentences(parts: (string | null | undefined)[]): string {
  return parts
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .map((p) => (/[.!?]$/.test(p) ? p : `${p}.`))
    .join(' ');
}

/**
 * R3-10: test doctors carry "Test profile · qualifications to be added".
 * That (or an empty value) is never shown to a parent.
 */
export function isPlaceholderQualification(q: string | null | undefined): boolean {
  const t = (q ?? '').trim();
  return !t || /test profile|to be added/i.test(t);
}

/**
 * qualifications for the listed doctors (a column parents may read). Read
 * here so the shared doctor query stays as it is; empty while loading.
 */
function useQualifications(ids: string[]): Map<string, string> {
  const key = ids.join(',');
  const [map, setMap] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('doctors').select('id, qualifications').in('id', key.split(','));
      if (cancelled || !data) return;
      const next = new Map<string, string>();
      for (const row of data as { id: string; qualifications: string | null }[]) {
        if (row.qualifications && !isPlaceholderQualification(row.qualifications)) {
          next.set(row.id, row.qualifications.trim());
        }
      }
      setMap(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);
  return map;
}

export interface DoctorPickerProps {
  doctors: DoctorRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Each doctor's next free time as a phrase ("Today · 4:30 PM"); missing = none open. */
  nextFree?: Map<string, string>;
  /** False while the next-free lookup runs, so "No free time" is not shown too early. */
  nextFreeLoaded?: boolean;
}

/**
 * Doctor choice as rows inside one hairline card (no card per doctor).
 * Selected row: greenWash (lavender) fill + primary check. Avatar 36, name 15, spec 13.
 * Each row shows qualifications, the next free time and, when the doctor
 * has no video link yet, that the consult is chat only for now (R2-04/R2-18).
 */
export function DoctorPicker({ doctors, selectedId, onSelect, nextFree, nextFreeLoaded = true }: DoctorPickerProps) {
  const qualifications = useQualifications(doctors.map((d) => d.id));
  return (
    <View style={styles.list}>
      {doctors.map((doc, i) => {
        const active = selectedId === doc.id;
        const quals = qualifications.get(doc.id) ?? null;
        const hasVideo = doctorHasVideoLink(doc);
        const next = nextFree?.get(doc.id) ?? null;
        const nextText = next ? `Next free: ${next}` : nextFree && nextFreeLoaded ? 'No free time open right now' : null;
        const linkText = hasVideo ? null : 'Video link pending, chat only for now';
        return (
          <Pressable
            key={doc.id}
            onPress={() => onSelect(doc.id)}
            {...spaceSelects(() => onSelect(doc.id))}
            accessibilityRole="radio"
            accessibilityState={{ checked: active, selected: active }}
            aria-checked={active}
            accessibilityLabel={sentences([doc.name, doc.specialisation, quals, nextText, linkText])}
            style={({ pressed }) => [
              styles.row,
              i > 0 && styles.divider,
              active && styles.rowActive,
              pressed && !active && styles.rowPressed,
            ]}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{doctorInitial(doc.name)}</Text>
            </View>
            <View style={styles.info}>
              {/* No numberOfLines: names wrap at 200% zoom instead of being cut. */}
              <Text style={styles.name}>{doc.name}</Text>
              <Text style={styles.spec}>{doc.specialisation}</Text>
              {quals ? <Text style={styles.meta}>{quals}</Text> : null}
              {nextText ? (
                <View style={styles.metaRow}>
                  <Ionicons name="time-outline" size={13} color={AppColors.secondary} style={styles.metaIcon} />
                  <Text style={[styles.meta, styles.metaFlex, next ? styles.metaStrong : null]}>{nextText}</Text>
                </View>
              ) : null}
              {linkText ? (
                <View style={styles.metaRow}>
                  <Ionicons name="chatbubble-ellipses-outline" size={13} color={AppColors.warning} style={styles.metaIcon} />
                  <Text style={[styles.meta, styles.metaFlex, styles.warningText]}>{linkText}</Text>
                </View>
              ) : null}
            </View>
            {active ? (
              <Ionicons name="checkmark-circle" size={22} color={AppColors.primary} />
            ) : (
              <View style={styles.radio} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 16, paddingVertical: 12 },
  rowActive: { backgroundColor: AppColors.greenWash },
  rowPressed: { backgroundColor: AppColors.surfaceContainerLow },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: AppColors.border },
  avatar: {
    width: Size.iconWell,
    height: Size.iconWell,
    borderRadius: Size.iconWell / 2,
    backgroundColor: AppColors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: FontFamily.semibold, fontSize: 15, color: AppColors.primary },
  info: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontFamily: FontFamily.semibold, fontSize: 15, lineHeight: 20, color: AppColors.onSurface },
  spec: { fontFamily: FontFamily.regular, fontSize: 13, lineHeight: 18, color: AppColors.muted },
  meta: { fontFamily: FontFamily.regular, fontSize: 12, lineHeight: 16, color: AppColors.muted },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 2 },
  metaIcon: { marginTop: 1 },
  metaFlex: { flex: 1, minWidth: 0 },
  metaStrong: { fontFamily: FontFamily.medium, color: AppColors.secondary },
  warningText: { color: AppColors.warning },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: AppColors.fieldBorder, margin: 1 },
});
