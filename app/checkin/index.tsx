import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CHECKIN_HEADER_HEIGHT, CheckinHeader } from '@/components/checkin/CheckinHeader';
import { FeverInput, type TempUnit, buildFeverComplaint } from '@/components/checkin/FeverInput';
import { SymptomTile } from '@/components/checkin/SymptomTile';
import { GradientButton } from '@/components/gradient-button';
import { Sprout } from '@/components/mascot/Sprout';
import { getTiles } from '@/components/checkin/symptomTiles';
import { AppColors, CanvasFade } from '@/constants/theme';
import { useChild } from '@/context/child';
import { typography } from '@/styles/global';

export default function CheckinEntryScreen() {
  const insets = useSafeAreaInsets();
  const { child, bracket } = useChild();
  const childName = child?.name ?? 'Child';

  const tiles = getTiles(bracket);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tempStr, setTempStr] = useState('');
  const [tempUnit, setTempUnit] = useState<TempUnit>('C');

  const hasFever = selected.has('Fever');
  const canContinue = selected.size > 0;

  function toggleTile(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function buildComplaint(): string {
    const parts = Array.from(selected);
    if (hasFever) {
      const feverWithTemp = buildFeverComplaint(tempStr, tempUnit);
      if (feverWithTemp) {
        const idx = parts.indexOf('Fever');
        parts[idx] = feverWithTemp;
      }
    }
    return parts.join(', ');
  }

  return (
    <View style={styles.root}>
      <CheckinHeader onBack={() => router.back()} showStatusDot />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + CHECKIN_HEADER_HEIGHT + 8, paddingBottom: 104 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroRow}>
          <View style={styles.heroText}>
            <Text style={typography.heading}>How is {childName} feeling today?</Text>
            <Text style={typography.bodySM}>Tap what&apos;s worrying you.</Text>
          </View>
          <Sprout mood="care" size={56} animated />
        </View>

        <View style={styles.grid}>
          {tiles.map((tile) => (
            <SymptomTile
              key={tile.key}
              tile={tile}
              active={selected.has(tile.key)}
              onToggle={toggleTile}
            />
          ))}
        </View>

        {hasFever ? (
          <FeverInput
            value={tempStr}
            unit={tempUnit}
            onValueChange={setTempStr}
            onUnitChange={setTempUnit}
          />
        ) : null}

        <Text style={[typography.caption, styles.disclaimer]}>
          Not a diagnosis. A pediatrician reviews your summary. In an emergency, call local medical services.
        </Text>
      </ScrollView>

      <View style={[styles.footerWrapper, { paddingBottom: insets.bottom }]} pointerEvents="box-none">
        <LinearGradient
          colors={[
            CanvasFade.a0,
            CanvasFade.a13,
            CanvasFade.a38,
            CanvasFade.a69,
            CanvasFade.a91,
            CanvasFade.solid,
            CanvasFade.solid,
          ]}
          locations={[0, 0.1, 0.22, 0.35, 0.5, 0.65, 1]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          pointerEvents="none"
        />
        <View style={styles.footer}>
          <GradientButton
            label={canContinue ? 'Start check-in' : 'Pick at least one'}
            disabled={!canContinue}
            onPress={() => router.push({ pathname: '/checkin/chat', params: { complaint: buildComplaint() } })}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AppColors.surface },
  scroll: { paddingHorizontal: 20, gap: 24 },

  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroText: { flex: 1, gap: 4 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },

  disclaimer: { textAlign: 'center', paddingHorizontal: 8 },

  footerWrapper: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10 },
  footer: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
});
