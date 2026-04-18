type Props = {
  values: ReadonlyArray<number>;
  min?: number;
  max?: number;
  width?: number;
  height?: number;
  color?: string;
  testId?: string;
  ariaLabel?: string;
};

// Sparkline SVG sin deps. Accepts array de números y los pinta como path.
// Si min/max no se pasan, se autocalcula. Ideal para mood/energy (fixed 1-10)
// o para series variables (balance diario).
export function Sparkline({
  values,
  min,
  max,
  width = 200,
  height = 40,
  color = 'currentColor',
  testId,
  ariaLabel,
}: Props) {
  if (values.length === 0) {
    return (
      <div
        data-testid={testId}
        className="flex items-center justify-center text-meta text-fg-dim"
        style={{ width, height }}
      >
        —
      </div>
    );
  }

  const lo = min ?? Math.min(...values);
  const hi = max ?? Math.max(...values);
  const range = hi === lo ? 1 : hi - lo;
  const step = values.length > 1 ? width / (values.length - 1) : 0;

  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - lo) / range) * height;
    return { x, y };
  });

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');

  const lastPoint = points[points.length - 1]!;

  return (
    <svg
      data-testid={testId}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel ?? `trend of ${values.length} points`}
      className="overflow-visible"
    >
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={lastPoint.x} cy={lastPoint.y} r="2.5" fill={color} />
    </svg>
  );
}
