"use client";

/* Gráficos em SVG puro — sem dependências externas. */

export interface Series {
  name: string;
  color: string;
  points: number[];
}

export function LineChart({
  labels,
  series,
  height = 260,
  format = (n: number) => n.toLocaleString("pt-BR"),
}: {
  labels: string[];
  series: Series[];
  height?: number;
  format?: (n: number) => string;
}) {
  const W = 760;
  const H = height;
  const padL = 56, padR = 16, padT = 16, padB = 34;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const allVals = series.flatMap((s) => s.points);
  const maxV = Math.max(1, ...allVals);
  const niceMax = Math.ceil(maxV / 4) * 4 || 4;
  const n = Math.max(1, labels.length - 1);

  const x = (i: number) => padL + (innerW * i) / n;
  const y = (v: number) => padT + innerH - (innerH * v) / niceMax;

  const gridLines = [0, 1, 2, 3, 4].map((k) => (niceMax / 4) * k);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" style={{ display: "block" }}>
      {gridLines.map((gv, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(gv)} y2={y(gv)} stroke="var(--border-color)" strokeWidth={1} />
          <text x={padL - 8} y={y(gv) + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)">
            {format(gv)}
          </text>
        </g>
      ))}
      {labels.map((lb, i) => (
        <text key={i} x={x(i)} y={H - 12} textAnchor="middle" fontSize="11" fill="var(--text-muted)">
          {lb}
        </text>
      ))}
      {series.map((s, si) => {
        const d = s.points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p)}`).join(" ");
        return (
          <g key={si}>
            <path d={d} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {s.points.map((p, i) => (
              <circle key={i} cx={x(i)} cy={y(p)} r={3} fill="#fff" stroke={s.color} strokeWidth={2} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export interface Slice {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({ data, size = 200 }: { data: Slice[]; size?: number }) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  const r = size / 2;
  const stroke = 26;
  const radius = r - stroke / 2 - 2;
  const circ = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", flexWrap: "wrap" }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" style={{ flexShrink: 0 }}>
        <g transform={`rotate(-90 ${r} ${r})`}>
          {data.map((d, i) => {
            const frac = d.value / total;
            const dash = frac * circ;
            const seg = (
              <circle
                key={i}
                cx={r}
                cy={r}
                r={radius}
                fill="none"
                stroke={d.color}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return seg;
          })}
        </g>
        <text x={r} y={r - 4} textAnchor="middle" fontSize="26" fontWeight="700" fill="var(--text-primary)">
          {total}
        </text>
        <text x={r} y={r + 16} textAnchor="middle" fontSize="12" fill="var(--text-muted)">
          leads
        </text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {data.map((d, i) => (
          <div key={i} className="legend-item">
            <span className="legend-swatch" style={{ background: d.color }} />
            <span style={{ minWidth: 120, display: "inline-block" }}>{d.label}</span>
            <b style={{ color: "var(--text-primary)" }}>{d.value}</b>
            <span className="muted" style={{ fontSize: "0.75rem" }}>
              ({Math.round((d.value / total) * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
