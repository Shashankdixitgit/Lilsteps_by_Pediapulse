import { useMemo } from 'react';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { AppColors } from '@/constants/theme';
import type { GrowthRow } from '@/hooks/useGrowth';

import {
  ChartTab,
  REFERENCE_AGES,
  TimeFilter,
  WHO_BANDS,
  getXAxisRange,
  interpolate,
  monthsBetween,
} from './whoData';

// Two colours only: the child's line is forest green, everything WHO is blue.
const CHILD = AppColors.primary;
const WHO = AppColors.info;
const WHO_FILL = AppColors.infoSurface;

const CHART_H = 252;
const PAD = { top: 30, right: 40, bottom: 30, left: 36 };
const SAMPLE_COUNT = 40;
const FONT = 'Inter_500Medium';

export const UNIT: Record<ChartTab, string> = { weight: 'kg', height: 'cm', bmi: '' };

function bmiOf(m: GrowthRow): number | null {
  if (!m.weight || !m.height) return null;
  const heightM = m.height / 100;
  if (heightM <= 0) return null;
  return m.weight / (heightM * heightM);
}

export function valueForTab(m: GrowthRow, tab: ChartTab): number | null {
  if (tab === 'weight') return m.weight ?? null;
  if (tab === 'height') return m.height ?? null;
  return bmiOf(m);
}

/** Round step for ~`count` intervals: 1, 2, 2.5 or 5 × 10^n. */
function niceStep(range: number, count: number): number {
  const raw = range / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

/** Age ticks on whole months/years so labels read "6 mo", "1 yr", "2½ yr". */
function ageTicks(xMin: number, xMax: number): number[] {
  const span = xMax - xMin;
  const step = [1, 2, 3, 6, 12, 24, 36].find((s) => span / s <= 5) ?? 48;
  const ticks: number[] = [];
  for (let m = Math.ceil(xMin / step) * step; m <= xMax + 0.01; m += step) ticks.push(m);
  return ticks;
}

function formatAge(months: number): string {
  const m = Math.round(months);
  if (m === 0) return 'Birth';
  if (m < 24) return `${m} mo`;
  const years = Math.floor(m / 12);
  const rest = m % 12;
  if (rest === 0) return `${years} yr`;
  if (rest === 6) return `${years}½ yr`;
  return `${years}y ${rest}m`;
}

export interface GrowthChartProps {
  tab: ChartTab;
  measurements: GrowthRow[];
  dob: Date;
  timeFilter: TimeFilter;
  width: number;
  childName: string;
}

export function GrowthChart({ tab, measurements, dob, timeFilter, width, childName }: GrowthChartProps) {
  const plotW = width - PAD.left - PAD.right;
  const plotH = CHART_H - PAD.top - PAD.bottom;
  const currentAgeMonths = monthsBetween(dob, new Date());
  const [xMin, xMax] = getXAxisRange(timeFilter, currentAgeMonths);
  const bands = WHO_BANDS[tab];
  const unit = UNIT[tab];

  const ages = useMemo(
    () => Array.from({ length: SAMPLE_COUNT }, (_, i) => xMin + (i / (SAMPLE_COUNT - 1)) * (xMax - xMin)),
    [xMin, xMax],
  );
  const who = useMemo(() => ({
    p3: ages.map((a) => interpolate(REFERENCE_AGES, bands.p3, a)),
    p50: ages.map((a) => interpolate(REFERENCE_AGES, bands.p50, a)),
    p97: ages.map((a) => interpolate(REFERENCE_AGES, bands.p97, a)),
  }), [ages, bands]);

  const points: [number, number][] = useMemo(() => measurements
    .map((m) => {
      const age = monthsBetween(dob, new Date(m.measured_at));
      const val = valueForTab(m, tab);
      if (val == null || age < xMin - 0.5 || age > xMax + 0.5) return null;
      return [age, val] as [number, number];
    })
    .filter((p): p is [number, number] => p !== null)
    .sort((a, b) => a[0] - b[0]),
    [measurements, dob, tab, xMin, xMax],
  );

  // Y range covers the WHO 3rd–97th corridor plus every child point, on round ticks.
  const ys = [...who.p3, ...who.p97, ...points.map(([, v]) => v)];
  const rawMin = Math.min(...ys);
  const rawMax = Math.max(...ys);
  const step = niceStep(Math.max(rawMax - rawMin, 1), 4);
  const minY = Math.floor(rawMin / step) * step;
  const maxY = Math.ceil(rawMax / step) * step;
  const yTicks: number[] = [];
  for (let v = minY; v <= maxY + step / 2; v += step) yTicks.push(+v.toFixed(2));

  const x = (a: number) => PAD.left + ((a - xMin) / (xMax - xMin || 1)) * plotW;
  const y = (v: number) => PAD.top + plotH - ((v - minY) / (maxY - minY || 1)) * plotH;

  const line = (vals: number[]) => ages.map((a, i) => `${i ? 'L' : 'M'}${x(a).toFixed(1)},${y(vals[i]).toFixed(1)}`).join(' ');
  const corridor =
    ages.map((a, i) => `${i ? 'L' : 'M'}${x(a).toFixed(1)},${y(who.p97[i]).toFixed(1)}`).join(' ') +
    ' ' +
    [...ages].reverse().map((a, i) => `L${x(a).toFixed(1)},${y(who.p3[ages.length - 1 - i]).toFixed(1)}`).join(' ') +
    ' Z';
  const childPath = points.map(([a, v], i) => `${i ? 'L' : 'M'}${x(a).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  // Right-edge percentile labels, nudged apart so they never overlap.
  const last = ages.length - 1;
  const labels = [
    { text: '97th', y: y(who.p97[last]) },
    { text: '50th', y: y(who.p50[last]) },
    { text: '3rd', y: y(who.p3[last]) },
  ];
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].y - labels[i - 1].y < 13) labels[i].y = labels[i - 1].y + 13;
  }

  const latest = points[points.length - 1];
  const callout = latest ? `${latest[1].toFixed(1)}${unit ? ` ${unit}` : ''}` : '';
  const calloutW = callout.length * 7 + 16;
  const calloutX = latest ? Math.min(Math.max(x(latest[0]) - calloutW / 2, PAD.left), PAD.left + plotW - calloutW) : 0;
  const calloutAbove = latest ? y(latest[1]) - 34 > PAD.top - 6 : true;
  const calloutY = latest ? (calloutAbove ? y(latest[1]) - 34 : y(latest[1]) + 12) : 0;

  const a11y = latest
    ? `${tab} chart. ${childName}'s latest ${tab} is ${callout}. Blue shading shows the WHO range from the 3rd to the 97th percentile.`
    : `${tab} chart showing the WHO range. No measurements logged yet.`;

  return (
    <Svg width={width} height={CHART_H} accessible accessibilityLabel={a11y}>
      {/* Grid + Y axis */}
      {yTicks.map((v) => (
        <G key={v}>
          <Line x1={PAD.left} x2={PAD.left + plotW} y1={y(v)} y2={y(v)} stroke={AppColors.border} strokeWidth={1} />
          <SvgText x={PAD.left - 8} y={y(v) + 4} fontSize={11} fontFamily={FONT} fill={AppColors.muted} textAnchor="end">
            {Number.isInteger(v) ? v : v.toFixed(1)}
          </SvgText>
        </G>
      ))}
      {unit ? (
        <SvgText x={PAD.left - 8} y={PAD.top - 16} fontSize={11} fontFamily={FONT} fill={AppColors.muted} textAnchor="end">
          {unit}
        </SvgText>
      ) : null}

      {/* X axis */}
      {ageTicks(xMin, xMax).map((m) => (
        <SvgText key={m} x={x(m)} y={CHART_H - 8} fontSize={11} fontFamily={FONT} fill={AppColors.muted} textAnchor="middle">
          {formatAge(m)}
        </SvgText>
      ))}

      {/* WHO: shaded 3rd–97th corridor, thin edges, dashed 50th */}
      <Path d={corridor} fill={WHO_FILL} />
      <Path d={line(who.p97)} stroke={WHO} strokeOpacity={0.45} strokeWidth={1} fill="none" />
      <Path d={line(who.p3)} stroke={WHO} strokeOpacity={0.45} strokeWidth={1} fill="none" />
      <Path d={line(who.p50)} stroke={WHO} strokeWidth={1.5} strokeDasharray="5 4" fill="none" />
      {labels.map((l) => (
        <SvgText key={l.text} x={PAD.left + plotW + 6} y={l.y + 4} fontSize={10} fontFamily={FONT} fill={WHO}>
          {l.text}
        </SvgText>
      ))}

      {/* Child: one solid green line */}
      {points.length > 1 ? (
        <Path d={childPath} stroke={CHILD} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
      {points.map(([a, v], i) => (
        <Circle
          key={i}
          cx={x(a)}
          cy={y(v)}
          r={i === points.length - 1 ? 6 : 4}
          fill={CHILD}
          stroke={AppColors.card}
          strokeWidth={2}
        />
      ))}
      {latest ? (
        <G>
          <Rect x={calloutX} y={calloutY} width={calloutW} height={22} rx={11} fill={CHILD} />
          <SvgText
            x={calloutX + calloutW / 2}
            y={calloutY + 15}
            fontSize={12}
            fontFamily="Inter_700Bold"
            fill={AppColors.onPrimary}
            textAnchor="middle"
          >
            {callout}
          </SvgText>
        </G>
      ) : null}
    </Svg>
  );
}
