import { useMemo } from 'react';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { AppColors } from '@/constants/theme';
import type { GrowthRow } from '@/hooks/useGrowth';
import { parseDateOnly } from '@/lib/date';

import {
  ChartTab,
  GrowthSex,
  REFERENCE_AGES,
  TimeFilter,
  bandsFor,
  getXAxisRange,
  interpolate,
  monthsBetween,
} from './whoData';
import { formatWeightValue } from './format';

// Two colours only: the child's line is deep purple, everything WHO is blue.
const CHILD = AppColors.primary;
const WHO = AppColors.info;
const WHO_FILL = AppColors.infoSurface;

const CHART_H = 252;
const PAD = { top: 30, right: 40, bottom: 30, left: 36 };
const SAMPLE_COUNT = 40;
const FONT = 'Inter_500Medium';
const LABEL_GAP = 13;
const CALLOUT_H = 22;

/**
 * Places the latest-value pill near its dot without covering the WHO 3rd /
 * 50th / 97th lines. Tries positions above and below the dot, nearest first
 * (above wins a tie), and takes the first that clears every line by 3px. If
 * none does, it takes the one that crosses the fewest line samples.
 * `curvesAt(px)` returns the y of each WHO line at that x.
 */
function placeCallout(
  px: number,
  py: number,
  w: number,
  curvesAt: (px: number) => number[],
  plotW: number,
): { x: number; y: number } {
  const left = Math.min(Math.max(px - w / 2, PAD.left), PAD.left + plotW - w);
  const plotBottom = CHART_H - PAD.bottom;
  const samples: number[][] = [];
  for (let sx = left; sx <= left + w; sx += 4) samples.push(curvesAt(sx));

  const crossings = (top: number) => {
    let n = 0;
    for (const ys of samples) for (const cy of ys) if (cy >= top - 3 && cy <= top + CALLOUT_H + 3) n++;
    return n;
  };

  let best: { y: number; n: number } | null = null;
  for (let d = 12; d <= 120; d += 4) {
    for (const top of [py - d - CALLOUT_H, py + d]) {
      if (top < 2 || top + CALLOUT_H > plotBottom) continue;
      const n = crossings(top);
      if (n === 0) return { x: left, y: top };
      if (!best || n < best.n) best = { y: top, n };
    }
  }
  return { x: left, y: best?.y ?? Math.max(2, py - 12 - CALLOUT_H) };
}

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

/** Tick spacing in months for an age span: at most ~5 intervals. */
function ageTickStep(span: number): number {
  return [1, 2, 3, 6, 12, 24, 36].find((s) => span / s <= 5) ?? 48;
}

/** Age ticks on whole months/years so labels read "6 mo", "1 yr", "2½ yr". */
function ageTicks(xMin: number, xMax: number, step: number): number[] {
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
  /** What the tab is called for this child ("length" under 2, "height" after). */
  label?: string;
  /** Picks the boys or girls table; unknown sex uses the averaged one (G1). */
  sex?: GrowthSex;
}

export function GrowthChart({ tab, measurements, dob, timeFilter, width, childName, label, sex }: GrowthChartProps) {
  const plotW = width - PAD.left - PAD.right;
  const plotH = CHART_H - PAD.top - PAD.bottom;
  const currentAgeMonths = monthsBetween(dob, new Date());
  const [xMin, rawXMax] = getXAxisRange(timeFilter, currentAgeMonths);
  // Extend the axis to the next whole tick so the last label always sits at
  // (or past) the child's current age: a 14-year-old's chart ends at "15 yr",
  // not at an unlabelled edge after "12 yr".
  const tickStep = ageTickStep(rawXMax - xMin);
  // A few days past a tick (e.g. on the 12th birthday) stays on that tick.
  const xMax = Math.max(tickStep, Math.ceil((rawXMax - 0.25) / tickStep) * tickStep);
  const bands = bandsFor(tab, sex);
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

  // `measurements` is newest first; walk it oldest first so that, after the
  // stable sort by age, the newest of several same-day entries is the last
  // point (the one the "latest" pill labels).
  const points: [number, number][] = useMemo(() => [...measurements]
    .reverse()
    .map((m) => {
      const age = monthsBetween(dob, parseDateOnly(m.measured_at));
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

  // Right-edge percentile labels, nudged apart so they never overlap, and kept
  // inside the plot so they never run into the x-axis labels (a newborn chart
  // with a far-off point squeezes all three lines onto the bottom gridline).
  const last = ages.length - 1;
  const plotBottom = PAD.top + plotH;
  const labels = [
    { text: '97th', y: y(who.p97[last]) },
    { text: '50th', y: y(who.p50[last]) },
    { text: '3rd', y: y(who.p3[last]) },
  ];
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].y - labels[i - 1].y < LABEL_GAP) labels[i].y = labels[i - 1].y + LABEL_GAP;
  }
  labels[labels.length - 1].y = Math.min(labels[labels.length - 1].y, plotBottom - 4);
  for (let i = labels.length - 2; i >= 0; i--) {
    labels[i].y = Math.min(labels[i].y, labels[i + 1].y - LABEL_GAP);
  }

  const latest = points[points.length - 1];
  const callout = latest
    ? `${tab === 'weight' ? formatWeightValue(latest[1]) : latest[1].toFixed(1)}${unit ? ` ${unit}` : ''}`
    : '';
  const calloutW = callout.length * 7 + 16;
  const dotX = latest ? x(latest[0]) : 0;
  const dotY = latest ? y(latest[1]) : 0;
  const { x: calloutX, y: calloutY } = latest
    ? placeCallout(dotX, dotY, calloutW, (px) => {
        const age = xMin + ((px - PAD.left) / (plotW || 1)) * (xMax - xMin);
        return [bands.p3, bands.p50, bands.p97].map((b) => y(interpolate(REFERENCE_AGES, b, age)));
      }, plotW)
    : { x: 0, y: 0 };

  const name = label ?? (tab === 'bmi' ? 'BMI' : tab);
  const a11y = latest
    ? `${name} chart. ${childName}'s latest ${name} is ${callout}. Blue shading shows the approximate typical range, 3rd to 97th percentile.`
    : `${name} chart showing the approximate typical range. No measurements logged yet.`;

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
      {ageTicks(xMin, xMax, tickStep).map((m) => (
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

      {/* Child: one solid purple line */}
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
          {/* Leader from the dot to the pill when the pill had to move clear of the WHO lines. */}
          {Math.abs(calloutY + CALLOUT_H / 2 - dotY) > CALLOUT_H / 2 + 14 ? (
            <Line
              x1={dotX}
              y1={calloutY > dotY ? dotY + 6 : dotY - 6}
              x2={Math.min(Math.max(dotX, calloutX + CALLOUT_H / 2), calloutX + calloutW - CALLOUT_H / 2)}
              y2={calloutY > dotY ? calloutY : calloutY + CALLOUT_H}
              stroke={CHILD}
              strokeWidth={1.5}
            />
          ) : null}
          <Rect x={calloutX} y={calloutY} width={calloutW} height={CALLOUT_H} rx={CALLOUT_H / 2} fill={CHILD} />
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
