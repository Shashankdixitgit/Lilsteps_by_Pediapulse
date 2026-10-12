import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { ChildAvatar, childColorIndex } from '@/components/ChildAvatar';
import { useChild } from '@/context/child';

/** Active child's avatar for the top-right of tab headers; opens the profile. */
export function HeaderChildAvatar({ size = 36 }: { size?: number }) {
  const { child, children } = useChild();
  return (
    <Pressable
      onPress={() => router.push('/profile')}
      accessibilityRole="button"
      accessibilityLabel={child?.name ? `${child.name}'s profile` : 'Child profile'}
      hitSlop={6}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <ChildAvatar name={child?.name} id={child?.id} colorIndex={childColorIndex(children, child?.id)} size={size} />
    </Pressable>
  );
}
