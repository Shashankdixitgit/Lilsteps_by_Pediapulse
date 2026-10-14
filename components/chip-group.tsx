import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { haptic } from '@/components/ui/useMotion';
import { AppColors, FontFamily, Radius } from '@/constants/theme';

interface ChipGroupProps {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  multiSelect?: boolean;
  /** When this value is selected, all others deselect; when others selected, this deselects */
  noneValue?: string;
  /** The question the chips answer (usually the visible label above them),
   *  so a screen reader names the group, not just each chip (R3-21). */
  label?: string;
}

export function ChipGroup({
  options,
  selected,
  onChange,
  multiSelect = false,
  noneValue,
  label,
}: ChipGroupProps) {
  const handlePress = (option: string) => {
    if (!multiSelect) {
      haptic('selection');
      onChange([option]);
      return;
    }

    // Multi-select logic
    if (noneValue && option === noneValue) {
      // Selecting "None" clears everything else
      onChange(selected.includes(noneValue) ? [] : [noneValue]);
      return;
    }

    // Selecting a non-None option
    const withoutNone = selected.filter((s) => s !== noneValue);
    if (withoutNone.includes(option)) {
      onChange(withoutNone.filter((s) => s !== option));
    } else {
      onChange([...withoutNone, option]);
    }
  };

  return (
    <View
      style={styles.container}
      accessibilityRole={multiSelect ? undefined : 'radiogroup'}
      accessibilityLabel={label}
      // Web: name the group (a multi-select is a plain group of checkboxes).
      {...(Platform.OS === 'web' && label ? { role: multiSelect ? ('group' as const) : ('radiogroup' as const), 'aria-label': label } : null)}
    >
      {options.map((option) => {
        const isSelected = selected.includes(option);
        // Web: react-native-web only presses on Space for role=button, but a
        // checkbox / radio must toggle on Space too.
        const webKeys =
          Platform.OS === 'web'
            ? {
                onKeyDown: (e: { key: string; preventDefault: () => void }) => {
                  if (e.key === ' ' || e.key === 'Spacebar') {
                    e.preventDefault();
                    handlePress(option);
                  }
                },
              }
            : null;
        return (
          <Pressable
            key={option}
            onPress={() => handlePress(option)}
            {...webKeys}
            accessibilityRole={multiSelect ? 'checkbox' : 'radio'}
            accessibilityLabel={option}
            accessibilityState={{ checked: isSelected, selected: isSelected }}
            aria-checked={isSelected}
            style={({ pressed }) => [styles.chip, isSelected && styles.chipSelected, pressed && !isSelected && styles.chipPressed]}
          >
            {isSelected ? (
              <Animated.View entering={FadeIn.duration(150)}>
                <Ionicons name="checkmark" size={14} color={AppColors.primary} />
              </Animated.View>
            ) : null}
            <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    // 44 = minimum touch target (DESIGN.md / WCAG 2.5.5).
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.full,
    backgroundColor: AppColors.card,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  chipSelected: {
    backgroundColor: AppColors.mintSurface,
    borderColor: AppColors.mintBorder,
    paddingLeft: 10,
  },
  chipPressed: {
    backgroundColor: AppColors.surfaceContainer,
  },
  chipText: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.onSurfaceVariant,
  },
  chipTextSelected: {
    fontFamily: FontFamily.semibold,
    color: AppColors.primary,
  },
});
