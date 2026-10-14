/**
 * Growth reference bands, by sex (G1), at REFERENCE_AGES (0–180 months).
 *
 * Sources: WHO Child Growth Standards 2006 (0–60 months) and WHO Growth
 * Reference 2007 (5–19 years) for boys and girls, read at these ages and
 * rounded to one decimal. WHO publishes no weight-for-age after 10 years, so
 * the 144 and 180-month weights follow IAP 2015 / CDC values. Between the
 * reference ages the bands are interpolated linearly, so they are an
 * approximation for parent-facing charts, not a clinical tool.
 * PENDING DOCTOR REVIEW (see GROWTH_REFERENCE_REVIEW_STATUS).
 */
export const GROWTH_REFERENCE_REVIEW_STATUS = 'pending doctor review' as const;

export const REFERENCE_AGES = [0, 6, 12, 24, 36, 60, 96, 144, 180] as const;

export type ChartTab = 'weight' | 'height' | 'bmi';

/** children.sex; null / unknown uses the average of both tables. */
export type GrowthSex = 'male' | 'female' | null | undefined;

export interface PercentileBands {
  p3: number[];
  p15: number[];
  p50: number[];
  p85: number[];
  p97: number[];
}

export const WHO_BANDS_BY_SEX: Record<'male' | 'female', Record<ChartTab, PercentileBands>> = {
  male: {
    weight: {
      p3:  [2.5, 6.4, 7.8, 9.8,  11.4, 14.6, 20.2, 29.5, 42.0],
      p15: [2.9, 7.1, 8.6, 10.8, 12.7, 16.0, 22.3, 33.5, 47.5],
      p50: [3.3, 7.9, 9.6, 12.2, 14.3, 18.3, 25.4, 40.5, 56.0],
      p85: [3.9, 8.8, 10.8, 13.7, 16.2, 20.9, 29.4, 49.0, 66.0],
      p97: [4.3, 9.8, 11.8, 15.1, 17.9, 23.3, 33.5, 57.0, 77.0],
    },
    height: {
      p3:  [46.3, 63.6, 71.3, 82.1, 89.1,  101.2, 116.4, 134.8, 155.1],
      p15: [47.9, 65.5, 73.4, 84.4, 92.2,  105.1, 121.3, 141.2, 161.3],
      p50: [49.9, 67.6, 75.7, 87.1, 96.1,  110.0, 127.3, 149.1, 169.0],
      p85: [51.8, 69.8, 78.1, 89.9, 99.9,  114.9, 133.3, 157.0, 176.7],
      p97: [53.4, 71.6, 80.2, 92.1, 103.1, 118.8, 138.2, 163.4, 182.9],
    },
    bmi: {
      p3:  [11.3, 15.0, 14.7, 14.1, 13.8, 13.4, 13.6, 14.8, 16.4],
      p15: [12.4, 16.1, 15.7, 15.0, 14.6, 14.2, 14.5, 15.9, 17.8],
      p50: [13.4, 17.3, 16.8, 16.0, 15.6, 15.2, 15.7, 17.5, 19.8],
      p85: [14.6, 18.6, 18.1, 17.3, 16.8, 16.4, 17.3, 19.9, 22.4],
      p97: [15.9, 19.8, 19.3, 18.4, 17.9, 17.6, 19.0, 22.5, 25.0],
    },
  },
  female: {
    weight: {
      p3:  [2.4, 5.8, 7.1, 9.2,  10.8, 14.0, 19.6, 29.5, 40.0],
      p15: [2.8, 6.4, 7.9, 10.2, 12.0, 15.7, 21.8, 34.0, 44.5],
      p50: [3.2, 7.3, 8.9, 11.5, 13.9, 18.2, 25.0, 41.5, 52.0],
      p85: [3.7, 8.2, 10.1, 13.0, 15.8, 21.2, 29.4, 50.0, 61.0],
      p97: [4.2, 9.2, 11.3, 14.6, 17.8, 24.0, 34.0, 58.0, 71.0],
    },
    height: {
      p3:  [45.6, 61.5, 69.2, 80.0, 88.3,  100.5, 115.5, 137.6, 149.7],
      p15: [47.2, 63.6, 71.3, 82.5, 91.4,  104.3, 120.5, 143.7, 155.1],
      p50: [49.1, 65.7, 74.0, 85.7, 95.1,  109.4, 126.6, 151.2, 161.7],
      p85: [51.1, 67.8, 76.7, 88.9, 98.8,  114.4, 132.7, 158.7, 168.3],
      p97: [52.7, 69.8, 78.9, 91.4, 102.0, 118.4, 137.7, 164.7, 173.7],
    },
    bmi: {
      p3:  [11.1, 14.6, 14.2, 13.8, 13.5, 13.2, 13.3, 14.8, 16.2],
      p15: [12.2, 15.7, 15.2, 14.7, 14.4, 14.0, 14.3, 16.1, 17.8],
      p50: [13.3, 16.9, 16.4, 15.7, 15.4, 15.2, 15.7, 18.0, 20.2],
      p85: [14.6, 18.3, 17.7, 17.0, 16.7, 16.6, 17.6, 20.6, 23.0],
      p97: [15.9, 19.6, 19.0, 18.1, 17.9, 18.0, 19.7, 23.4, 26.0],
    },
  },
};

function averageBands(a: PercentileBands, b: PercentileBands): PercentileBands {
  const avg = (x: number[], y: number[]) => x.map((v, i) => Math.round(((v + y[i]) / 2) * 10) / 10);
  return { p3: avg(a.p3, b.p3), p15: avg(a.p15, b.p15), p50: avg(a.p50, b.p50), p85: avg(a.p85, b.p85), p97: avg(a.p97, b.p97) };
}

/** Average of the boys and girls tables: only for a child with no sex recorded. */
export const WHO_BANDS: Record<ChartTab, PercentileBands> = {
  weight: averageBands(WHO_BANDS_BY_SEX.male.weight, WHO_BANDS_BY_SEX.female.weight),
  height: averageBands(WHO_BANDS_BY_SEX.male.height, WHO_BANDS_BY_SEX.female.height),
  bmi: averageBands(WHO_BANDS_BY_SEX.male.bmi, WHO_BANDS_BY_SEX.female.bmi),
};

/** The bands for this child: the boys or girls table, else the average. */
export function bandsFor(tab: ChartTab, sex?: GrowthSex): PercentileBands {
  return sex === 'male' || sex === 'female' ? WHO_BANDS_BY_SEX[sex][tab] : WHO_BANDS[tab];
}

/** Short label for the reference used, e.g. under the chart. */
export function referenceLabel(sex?: GrowthSex): string {
  return sex === 'male' ? 'WHO reference for boys' : sex === 'female' ? 'WHO reference for girls' : 'WHO reference (boys and girls averaged)';
}

export type TimeFilter = '3M' | '6M' | '1Y' | 'All';

export function monthsBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24 * 30.4375));
}

export function interpolate(xs: readonly number[], ys: number[], target: number): number {
  if (target <= xs[0]) return ys[0];
  if (target >= xs[xs.length - 1]) return ys[ys.length - 1];
  for (let i = 0; i < xs.length - 1; i++) {
    if (target >= xs[i] && target <= xs[i + 1]) {
      const t = (target - xs[i]) / (xs[i + 1] - xs[i]);
      return ys[i] + t * (ys[i + 1] - ys[i]);
    }
  }
  return ys[ys.length - 1];
}

export function getXAxisRange(filter: TimeFilter, currentAgeMonths: number): [number, number] {
  const minSpan = 6;
  const span =
    filter === '3M' ? Math.max(3, minSpan) :
    filter === '6M' ? 6 :
    filter === '1Y' ? 12 :
    Math.max(currentAgeMonths, minSpan);
  const xMin = Math.max(0, currentAgeMonths - span);
  const xMax = Math.max(currentAgeMonths, xMin + minSpan);
  return [xMin, xMax];
}

export function computePercentile(value: number, ageMonths: number, tab: ChartTab, sex?: GrowthSex): number {
  const b = bandsFor(tab, sex);
  const v3  = interpolate(REFERENCE_AGES, b.p3,  ageMonths);
  const v15 = interpolate(REFERENCE_AGES, b.p15, ageMonths);
  const v50 = interpolate(REFERENCE_AGES, b.p50, ageMonths);
  const v85 = interpolate(REFERENCE_AGES, b.p85, ageMonths);
  const v97 = interpolate(REFERENCE_AGES, b.p97, ageMonths);
  if (value <= v3)  return 3;
  if (value <= v15) return 3  + ((value - v3)  / (v15 - v3))  * 12;
  if (value <= v50) return 15 + ((value - v15) / (v50 - v15)) * 35;
  if (value <= v85) return 50 + ((value - v50) / (v85 - v50)) * 35;
  if (value <= v97) return 85 + ((value - v85) / (v97 - v85)) * 12;
  return 97;
}

/** 'above' past the 97th, 'below' under the 3rd, else null (inside the
 *  reference). computePercentile clamps to 3 / 97, so "about the 97th" would
 *  understate a value far above it (R3-21). */
export function outsideReference(
  value: number,
  ageMonths: number,
  tab: ChartTab,
  sex?: GrowthSex,
): 'above' | 'below' | null {
  const b = bandsFor(tab, sex);
  if (value > interpolate(REFERENCE_AGES, b.p97, ageMonths)) return 'above';
  if (value < interpolate(REFERENCE_AGES, b.p3, ageMonths)) return 'below';
  return null;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
