import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useAuth } from '@/context/auth';
import { type CarePlan, getMyCarePlan, refreshCarePlan, takePendingCarePlan } from '@/lib/carePlan';

/**
 * The parent's Care Plan (get_my_care_plan, 0053), loaded each time the
 * screen comes into focus. `check: true` (the Care Plan screen) asks the
 * server to check with Razorpay first, so a late webhook never leaves the
 * screen behind; booking screens use the stored row (fast).
 * A failed load leaves `plan` null: booking then simply offers ₹449.
 */
export function useCarePlan({ check = false }: { check?: boolean } = {}) {
  const { user } = useAuth();
  const userId = user?.id;
  const [plan, setPlan] = useState<CarePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setPlan(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Back from Razorpay's page on web: always ask the server to check.
      const fresh = check || takePendingCarePlan();
      setPlan(fresh ? await refreshCarePlan() : await getMyCarePlan());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your Care Plan.");
      if (check) {
        // Show what is stored if the check failed.
        setPlan(await getMyCarePlan().catch(() => null));
      }
    } finally {
      setLoading(false);
    }
  }, [userId, check]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return { plan, setPlan, loading, error, reload: load };
}
