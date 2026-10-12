import { Ionicons } from '@expo/vector-icons';
import { Card, PressableFeedback } from 'heroui-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppColors, Radius, softSurface } from '@/constants/theme';

export interface InsightCard {
  id: string;
  emoji: string;
  title: string;
  body: string;
  tag: string;
  tagColor: string;
}

// Bracket-keyed insight sets
const INSIGHTS_BY_BRACKET: Record<string, InsightCard[]> = {
  NEWBORN: [
    { id: 'n1', emoji: '👶', title: 'Tummy time at birth', body: 'Start with 2–3 min sessions on your chest to build neck strength safely.', tag: 'Development', tagColor: AppColors.primary },
    { id: 'n2', emoji: '🤱', title: 'Feeding cues to watch', body: 'Rooting, sucking hands, and turning the head signal hunger before crying starts.', tag: 'Feeding', tagColor: AppColors.accentBlue },
    { id: 'n3', emoji: '😴', title: 'Safe sleep basics', body: 'Back to sleep, firm flat surface, no loose bedding — every nap, every night.', tag: 'Sleep', tagColor: AppColors.secondary },
    { id: 'n4', emoji: '👁️', title: 'Visual development', body: 'Newborns focus best at 20–30 cm — your face is the perfect first toy.', tag: 'Milestones', tagColor: AppColors.orange },
    { id: 'n5', emoji: '🌡️', title: 'When to call the doctor', body: 'A rectal temp above 38°C in the first 3 months always needs same-day evaluation.', tag: 'Health', tagColor: AppColors.errorRed },
  ],
  EARLY_INFANT: [
    { id: 'ei1', emoji: '🧸', title: 'Sensory play starters', body: 'Introduce different textures through soft toys, crinkle books, and gentle touch.', tag: 'Play', tagColor: AppColors.primary },
    { id: 'ei2', emoji: '😊', title: 'Social smiles appear', body: 'The first intentional smiles emerge around 6–8 weeks — smile back to reinforce bonding.', tag: 'Milestones', tagColor: AppColors.orange },
    { id: 'ei3', emoji: '🍼', title: 'Feed on demand', body: 'Breastfed babies typically feed every 2–3 hrs — cluster feeding in evenings is normal.', tag: 'Feeding', tagColor: AppColors.accentBlue },
    { id: 'ei4', emoji: '🎵', title: 'Talk and sing often', body: 'Narrating your day builds language pathways even before baby understands words.', tag: 'Development', tagColor: AppColors.secondary },
    { id: 'ei5', emoji: '💧', title: 'Cradle cap care', body: 'Gentle massage with baby oil before bath and soft brushing usually clears it within weeks.', tag: 'Health', tagColor: AppColors.warningAmber },
  ],
  INFANT: [
    { id: 'i1', emoji: '🥄', title: 'Starting solids at 6M', body: 'Single-ingredient purees first — wait 3–5 days between new foods to spot allergies.', tag: 'Feeding', tagColor: AppColors.accentBlue },
    { id: 'i2', emoji: '🎯', title: 'Reaching & grasping', body: 'Offering toys at different angles strengthens hand-eye coordination and arm muscles.', tag: 'Development', tagColor: AppColors.primary },
    { id: 'i3', emoji: '🪥', title: 'First tooth care', body: 'Wipe erupting teeth with a damp cloth twice daily — start a tiny soft toothbrush now.', tag: 'Health', tagColor: AppColors.healthGreen },
    { id: 'i4', emoji: '📚', title: 'Board books every day', body: 'Pointing and naming objects in books accelerates vocabulary at this stage.', tag: 'Milestones', tagColor: AppColors.orange },
    { id: 'i5', emoji: '🌙', title: 'Sleep schedule settling', body: 'A consistent wind-down routine (bath, feed, song) trains the sleep clock by 6 months.', tag: 'Sleep', tagColor: AppColors.secondary },
    { id: 'i6', emoji: '🛡️', title: '6-month vaccines due', body: 'Check the schedule — rotavirus and IPV doses are typically due around this stage.', tag: 'Vaccine', tagColor: AppColors.errorRed },
  ],
  TODDLER_EARLY: [
    { id: 'te1', emoji: '🧱', title: 'Stacking for fine motor', body: 'Stacking and knocking over towers builds grip strength and cause-and-effect thinking.', tag: 'Play', tagColor: AppColors.primary },
    { id: 'te2', emoji: '🏃', title: 'Cruising to walking', body: 'Hold furniture-cruising hands, not wrists — it trains balance without creating dependency.', tag: 'Milestones', tagColor: AppColors.orange },
    { id: 'te3', emoji: '🍎', title: 'Finger foods variety', body: 'Offering 20+ foods in the first 2 years strongly reduces picky eating later.', tag: 'Feeding', tagColor: AppColors.accentBlue },
    { id: 'te4', emoji: '💬', title: 'First words milestone', body: 'Most toddlers say 1–3 words by 12M. Point to objects and label them constantly.', tag: 'Development', tagColor: AppColors.secondary },
    { id: 'te5', emoji: '😤', title: 'Managing separation anxiety', body: 'Short, predictable goodbyes beat lingering — consistency teaches safety and return.', tag: 'Wellbeing', tagColor: AppColors.warningAmber },
  ],
  TODDLER: [
    { id: 't1', emoji: '🔷', title: 'Shape sorting builds logic', body: 'Matching shapes and naming them lays the foundation for spatial reasoning.', tag: 'Play', tagColor: AppColors.primary },
    { id: 't2', emoji: '🎨', title: 'Scribbling is learning', body: 'Crayon scribbles at 18–24M build the hand control needed for writing years later.', tag: 'Development', tagColor: AppColors.secondary },
    { id: 't3', emoji: '🌙', title: 'Nap transition signs', body: 'Skipping naps 4+ days a week usually signals readiness to move to one longer nap.', tag: 'Sleep', tagColor: AppColors.accentBlue },
    { id: 't4', emoji: '🥦', title: 'Texture acceptance window', body: 'Between 18–24M is a key window — repeated exposure (10–15 times) increases acceptance.', tag: 'Feeding', tagColor: AppColors.healthGreen },
    { id: 't5', emoji: '🤝', title: 'Parallel play is normal', body: 'Toddlers play *beside* others, not *with* them — that\'s healthy social development.', tag: 'Milestones', tagColor: AppColors.orange },
    { id: 't6', emoji: '😭', title: 'Tantrums are brain growth', body: 'The prefrontal cortex can\'t override emotion yet — stay calm and name the feeling.', tag: 'Wellbeing', tagColor: AppColors.warningAmber },
  ],
  PRESCHOOL: [
    { id: 'p1', emoji: '🔢', title: 'Counting to 10 and beyond', body: 'Counting stairs, snacks, and toys turns everyday moments into maths foundations.', tag: 'Development', tagColor: AppColors.primary },
    { id: 'p2', emoji: '✂️', title: 'Scissors skills at 3–4', body: 'Child-safe scissors and playdough build the pincer grip needed for pencil control.', tag: 'Play', tagColor: AppColors.secondary },
    { id: 'p3', emoji: '🦷', title: 'Dental check reminder', body: 'First dental visit should happen by age 3 — early visits normalise the experience.', tag: 'Health', tagColor: AppColors.healthGreen },
    { id: 'p4', emoji: '📖', title: 'Storytime language boost', body: 'Ask "what do you think happens next?" — prediction questions triple vocabulary growth.', tag: 'Milestones', tagColor: AppColors.orange },
    { id: 'p5', emoji: '😓', title: 'Bedwetting is normal', body: 'Most children achieve full night dryness between 3–5 years — patience over pressure.', tag: 'Sleep', tagColor: AppColors.accentBlue },
  ],
  SCHOOL_EARLY: [
    { id: 'se1', emoji: '♟️', title: 'Chess basics for focus', body: 'Learning piece names and legal moves builds patience and forward-thinking skills.', tag: 'Play', tagColor: AppColors.primary },
    { id: 'se2', emoji: '📚', title: 'Reading aloud together', body: 'Reading with a child — even once they can read alone — deepens comprehension and bonding.', tag: 'Development', tagColor: AppColors.secondary },
    { id: 'se3', emoji: '🏅', title: 'Sports & coordination', body: 'Throwing, catching, and balancing activities peak in motor development at 6–8 years.', tag: 'Milestones', tagColor: AppColors.orange },
    { id: 'se4', emoji: '🥗', title: 'Packed lunch variety', body: 'Rotating proteins, grains, and colours prevents micronutrient gaps and boredom.', tag: 'Feeding', tagColor: AppColors.accentBlue },
    { id: 'se5', emoji: '😰', title: 'School anxiety signals', body: 'Frequent tummy aches or reluctance on school days can be anxiety — gentle talk first.', tag: 'Wellbeing', tagColor: AppColors.warningAmber },
  ],
  SCHOOL_MID: [
    { id: 'sm1', emoji: '🧩', title: 'Critical thinking games', body: 'Puzzles, strategy games, and riddles strengthen executive function in middle childhood.', tag: 'Play', tagColor: AppColors.primary },
    { id: 'sm2', emoji: '💪', title: 'Physical activity goal', body: 'WHO recommends 60 min of moderate activity daily at this age for healthy development.', tag: 'Health', tagColor: AppColors.healthGreen },
    { id: 'sm3', emoji: '📱', title: 'Screen time boundaries', body: 'Consistent limits + co-viewing (not just restricting) leads to healthier digital habits.', tag: 'Wellbeing', tagColor: AppColors.secondary },
    { id: 'sm4', emoji: '💤', title: '9–11 hours of sleep', body: 'Sleep deprivation impacts memory consolidation and emotional regulation more than grades.', tag: 'Sleep', tagColor: AppColors.accentBlue },
    { id: 'sm5', emoji: '🤝', title: 'Peer relationships matter', body: 'Friendships at this stage predict social confidence in adolescence — support them.', tag: 'Milestones', tagColor: AppColors.orange },
  ],
  ADOLESCENT: [
    { id: 'a1', emoji: '🧠', title: 'Teen brain is still growing', body: 'The prefrontal cortex — decision-making hub — completes development around age 25.', tag: 'Development', tagColor: AppColors.primary },
    { id: 'a2', emoji: '💬', title: 'Open-door communication', body: 'Teens who feel heard at home are more likely to disclose risk-taking behaviour.', tag: 'Wellbeing', tagColor: AppColors.secondary },
    { id: 'a3', emoji: '🏃', title: 'Sports reduce anxiety', body: 'Regular sport lowers cortisol and improves sleep quality — key for academic performance.', tag: 'Health', tagColor: AppColors.healthGreen },
    { id: 'a4', emoji: '😴', title: '8–10 hours critical', body: 'Circadian shifts push sleep later — fighting it backfires; later school starts help.', tag: 'Sleep', tagColor: AppColors.accentBlue },
    { id: 'a5', emoji: '🥗', title: 'Iron & calcium needs peak', body: 'Rapid growth means teens often under-consume iron (girls) and calcium — check diet.', tag: 'Feeding', tagColor: AppColors.warningAmber },
    { id: 'a6', emoji: '📱', title: 'Digital wellbeing', body: 'Agree on phone-free zones (meals, bedroom) rather than blanket bans for better outcomes.', tag: 'Milestones', tagColor: AppColors.orange },
  ],
};

const DEFAULT_INSIGHTS = INSIGHTS_BY_BRACKET.TODDLER;

// Ionicons per tag (no emoji icons, per DESIGN.md). Wells use friendly accents.
const TAG_ICON: Record<string, { icon: keyof typeof Ionicons.glyphMap; well: string }> = {
  Development: { icon: 'bulb-outline', well: AppColors.mintSurface },
  Feeding: { icon: 'nutrition-outline', well: AppColors.skySurface },
  Sleep: { icon: 'moon-outline', well: AppColors.skySurface },
  Milestones: { icon: 'flag-outline', well: AppColors.sunshineSurface },
  Health: { icon: 'medkit-outline', well: AppColors.peachSurface },
  Play: { icon: 'happy-outline', well: AppColors.sunshineSurface },
  Wellbeing: { icon: 'heart-outline', well: AppColors.peachSurface },
  Vaccine: { icon: 'shield-checkmark-outline', well: AppColors.mintSurface },
};

interface DailyInsightProps {
  bracket?: string;
  onViewAll?: () => void;
}

export function DailyInsight({ bracket, onViewAll }: DailyInsightProps) {
  const insights = (bracket && INSIGHTS_BY_BRACKET[bracket]) ? INSIGHTS_BY_BRACKET[bracket] : DEFAULT_INSIGHTS;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.heading}>Tips for this stage</Text>
        {onViewAll ? (
          <PressableFeedback onPress={onViewAll}>
            <Text style={styles.viewAll}>View all</Text>
          </PressableFeedback>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        decelerationRate="fast"
        snapToInterval={244}
        snapToAlignment="start"
      >
        {insights.map((item) => (
          <InsightCardView key={item.id} item={item} />
        ))}
      </ScrollView>
    </View>
  );
}

function InsightCardView({ item }: { item: InsightCard }) {
  return (
    <PressableFeedback>
      <Card style={styles.card} className="p-0 border-0 shadow-none">
        <Card.Header style={styles.cardHeader}>
          <View style={[styles.emojiWrap, { backgroundColor: (TAG_ICON[item.tag] ?? TAG_ICON.Development).well }]}>
            <Ionicons name={(TAG_ICON[item.tag] ?? TAG_ICON.Development).icon} size={24} color={AppColors.primary} />
          </View>
          <View style={[styles.tagPill, { backgroundColor: softSurface(item.tagColor) }]}>
            <Ionicons name="bookmark-outline" size={12} color={item.tagColor} />
            <Text style={[styles.tagText, { color: item.tagColor }]}>{item.tag}</Text>
          </View>
        </Card.Header>

        <Card.Body style={styles.cardBody}>
          <Card.Title style={styles.title} numberOfLines={2}>
            {item.title}
          </Card.Title>
          <Card.Description style={styles.body} numberOfLines={3}>
            {item.body}
          </Card.Description>
        </Card.Body>

        <Card.Footer style={styles.cardFooter}>
          <Text style={styles.readMoreText}>Read more</Text>
          <Ionicons name="arrow-forward" size={12} color={AppColors.primary} />
        </Card.Footer>
      </Card>
    </PressableFeedback>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: AppColors.onSurface,
    letterSpacing: -0.3,
  },
  viewAll: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: AppColors.primary,
  },
  scroll: {
    paddingRight: 24,
    gap: 12,
  },
  card: {
    width: 228,
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    overflow: 'hidden',
  },
  cardHeader: {
    padding: 16,
    paddingBottom: 10,
    gap: 10,
  },
  emojiWrap: {
    width: 52,
    height: 52,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  cardBody: {
    paddingHorizontal: 16,
    gap: 6,
    flex: 1,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: AppColors.onSurface,
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: AppColors.onSurfaceVariant,
    lineHeight: 19,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 16,
    paddingTop: 12,
  },
  readMoreText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: AppColors.secondary,
  },
});
