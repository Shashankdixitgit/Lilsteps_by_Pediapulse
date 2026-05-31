import { Ionicons } from '@expo/vector-icons';
import { Card, PressableFeedback } from 'heroui-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppColors } from '@/constants/theme';
import { typography } from '@/styles/global';

export interface CareProvider {
  id: string;
  name: string;
  role: string;
  initial: string;
}

interface CareTeamProps {
  providers: CareProvider[];
  onAddProvider?: () => void;
  onProviderPress?: (providerId: string) => void;
}

export function CareTeam({ providers, onAddProvider, onProviderPress }: CareTeamProps) {
  return (
    <View style={styles.section}>
      <Text style={[typography.headingMD, styles.heading]}>Care Team</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {providers.map((p) => (
          <PressableFeedback key={p.id} onPress={() => onProviderPress?.(p.id)}>
            <Card style={styles.card} className="p-0 border-0 shadow-none">
              <Card.Header style={styles.cardHeader}>
                <View style={styles.avatarContainer}>
                  <View style={styles.avatarRing}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{p.initial}</Text>
                    </View>
                  </View>
                </View>
              </Card.Header>
              <Card.Body style={styles.cardBody}>
                <Card.Title style={styles.name} numberOfLines={2}>
                  {p.name}
                </Card.Title>
                <Card.Description style={styles.role} numberOfLines={2}>
                  {p.role}
                </Card.Description>
              </Card.Body>
            </Card>
          </PressableFeedback>
        ))}

        <PressableFeedback onPress={onAddProvider}>
          <View style={styles.addCard}>
            <View style={styles.addIconCircle}>
              <Ionicons name="add" size={22} color={AppColors.primary} />
            </View>
            <Text style={styles.addLabel}>Add{'\n'}Provider</Text>
          </View>
        </PressableFeedback>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 16,
  },
  heading: {
    paddingHorizontal: 0,
  },
  scroll: {
    gap: 12,
    paddingRight: 8,
  },
  card: {
    width: 120,
    height: 170,
    backgroundColor: AppColors.surfaceContainerLowest,
    borderRadius: 20,
    overflow: 'hidden',
  },
  cardHeader: {
    paddingTop: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  avatarContainer: {
    alignItems: 'center',
  },
  avatarRing: {
    padding: 4,
    borderRadius: 40,
    backgroundColor: `${AppColors.primaryContainer}25`,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: `${AppColors.primaryContainer}50`,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: `${AppColors.primary}20`,
  },
  avatarText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
    color: AppColors.primary,
  },
  cardBody: {
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 16,
    alignItems: 'center',
    gap: 4,
  },
  name: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: AppColors.onSurface,
    textAlign: 'center',
    lineHeight: 16,
  },
  role: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 9,
    color: AppColors.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
    lineHeight: 12,
  },
  addCard: {
    width: 120,
    height: 170,
    backgroundColor: `${AppColors.surfaceContainer}30`,
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: `${AppColors.outlineVariant}35`,
  },
  addIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: `${AppColors.primaryContainer}35`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    color: AppColors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 14,
  },
});
