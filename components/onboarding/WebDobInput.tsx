import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppColors, FontFamily, Radius, Shadow } from '@/constants/theme';
import { parseDateOnly, toDateOnlyString } from '@/lib/date';

interface WebDobInputProps {
  /** Accessible name of the input (the visible label is drawn by the screen). */
  label: string;
  value: Date | null;
  /** Called with a parsed date once the typed date is complete, or null when cleared / incomplete. */
  onChange: (date: Date | null) => void;
  /** Inclusive bounds, 'YYYY-MM-DD'. */
  min?: string;
  max?: string;
}

/** A typed date is complete once the browser reports a 4-digit year from 1000 on. */
function parseComplete(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number(raw.slice(0, 4)) < 1000) return null;
  const d = parseDateOnly(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Web-only date-of-birth input (the browser's <input type="date">), styled
 * like TextInputField with the same focus ring.
 *
 * It keeps the raw string while the parent types and parses only a complete
 * date: typing a year sends "0002-05-01", "0020-05-01"… on every keystroke,
 * and parsing those turned the year into 1902 (R2-10). Same idea as
 * components/growth/DateField.tsx, which keeps the string too.
 */
export function WebDobInput({ label, value, onChange, min, max }: WebDobInputProps) {
  const valueStr = value ? toDateOnlyString(value) : '';
  const [raw, setRaw] = useState(valueStr);
  const [focused, setFocused] = useState(false);

  // A new value from outside (draft restored, picker elsewhere): show it.
  // Adjusted during render (not in an effect) so there is no stale frame.
  // A null value while typing is the incomplete date itself: keep the text.
  const [syncedValue, setSyncedValue] = useState(valueStr);
  if (valueStr !== syncedValue) {
    setSyncedValue(valueStr);
    const typed = parseComplete(raw);
    if (valueStr && (!typed || toDateOnlyString(typed) !== valueStr)) setRaw(valueStr);
  }

  return (
    <View style={[styles.field, focused && styles.fieldFocused]}>
      <input
        type="date"
        aria-label={label}
        max={max}
        min={min}
        value={raw}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e: { target: { value: string } }) => {
          const next = e.target.value;
          setRaw(next);
          onChange(parseComplete(next));
        }}
        style={{
          flex: 1,
          minHeight: 45,
          padding: '0 14px',
          border: 'none',
          // The token focus ring on the wrapper replaces the browser outline.
          outline: 'none',
          background: 'transparent',
          fontFamily: FontFamily.regular,
          fontSize: 16,
          color: raw ? AppColors.onSurface : AppColors.muted,
          cursor: 'pointer',
          minWidth: 0,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Matches TextInputField: white field, 1.5px fieldBorder, 10 radius, 48 high.
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.card,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    borderColor: AppColors.fieldBorder,
    minHeight: 48,
    minWidth: 0,
  },
  fieldFocused: {
    borderColor: AppColors.secondary,
    boxShadow: Shadow.focusRing,
  },
});
