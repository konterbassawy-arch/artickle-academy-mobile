/**
 * MinutesProgressCircle — Phase 19.6 Reset
 *
 * Pure SVG circular progress indicator. No external deps.
 *
 * Used for school-period progress (minutes as primary metric).
 * Center text shows "current / total", label below (e.g. "minutes taught").
 *
 * Tone drives the stroke color:
 *   - neutral     → emerald  (< 80%)
 *   - approaching → amber    (80–89%)
 *   - almost      → red      (>= 90%)
 */

import React from 'react';

type Size = 'xs' | 'sm' | 'md' | 'lg';
type Tone = 'neutral' | 'approaching' | 'almost';

interface MinutesProgressCircleProps {
  current: number;
  total: number;
  label?: string;
  size?: Size;
  tone?: Tone;
  /** Optional right-corner indicator text, e.g. "90%" (defaults to auto) */
  showPercent?: boolean;
}

const SIZE_TOKENS: Record<Size, {
  px: number;        // outer SVG size in px
  stroke: number;    // stroke width
  textCenter: string; // tailwind classes for center number
  textLabel: string;  // tailwind classes for label below
}> = {
  xs: { px: 36,  stroke: 4, textCenter: 'text-[9px] font-semibold', textLabel: '' },
  sm: { px: 56,  stroke: 5, textCenter: 'text-[11px] font-semibold', textLabel: 'text-[10px]' },
  md: { px: 96,  stroke: 8, textCenter: 'text-sm font-bold',         textLabel: 'text-[11px]' },
  lg: { px: 140, stroke: 10, textCenter: 'text-base font-bold',      textLabel: 'text-xs' },
};

const TONE_COLORS: Record<Tone, { track: string; stroke: string; text: string }> = {
  neutral:     { track: '#334155',  stroke: '#10b981', text: 'text-emerald-300' },  // slate-700 / emerald-500
  approaching: { track: '#334155',  stroke: '#f59e0b', text: 'text-amber-300' },    // amber-500
  almost:      { track: '#334155',  stroke: '#ef4444', text: 'text-red-300' },      // red-500
};

export const MinutesProgressCircle: React.FC<MinutesProgressCircleProps> = ({
  current,
  total,
  label,
  size = 'md',
  tone = 'neutral',
  showPercent = false,
}) => {
  const { px, stroke, textCenter, textLabel } = SIZE_TOKENS[size];
  const { track, stroke: strokeColor, text: textColor } = TONE_COLORS[tone];

  const radius = (px - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  // Clamp percent for the visual fill (overshoot stays honest in raw numbers)
  const rawPct = total > 0 ? (current / total) * 100 : 0;
  const pct = Math.max(0, Math.min(100, rawPct));
  const dashOffset = circumference - (pct / 100) * circumference;

  const centerX = px / 2;
  const centerY = px / 2;

  return (
    <div className="inline-flex flex-col items-center gap-1 shrink-0">
      <div className="relative" style={{ width: px, height: px }}>
        <svg width={px} height={px} className="-rotate-90">
          {/* Background track */}
          <circle
            cx={centerX}
            cy={centerY}
            r={radius}
            fill="none"
            stroke={track}
            strokeWidth={stroke}
          />
          {/* Progress arc */}
          <circle
            cx={centerX}
            cy={centerY}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 400ms ease-out' }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-tight">
          <span className={`${textCenter} ${textColor} tabular-nums`}>
            {current}
            <span className="text-slate-500 mx-0.5">/</span>
            {total}
          </span>
          {showPercent && size !== 'xs' && (
            <span className="text-[9px] text-slate-500 tabular-nums">{Math.round(rawPct)}%</span>
          )}
        </div>
      </div>
      {label && size !== 'xs' && (
        <span className={`${textLabel} text-slate-500 whitespace-nowrap`}>{label}</span>
      )}
    </div>
  );
};

export default MinutesProgressCircle;
