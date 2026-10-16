'use client';

import { GRID, TILE_W, TILE_H, STYLES, COLORS, CENTER, lotKey, isCenter } from '../lib/city';

const W2 = TILE_W / 2;
const H2 = TILE_H / 2;

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = v => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  r = f(r); g = f(g); b = f(b);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

const pts = arr => arr.map(p => p.join(',')).join(' ');

function center(r, c) {
  return [(c - r) * W2, (c + r) * H2];
}

function diamond(cx, cy, s = 1) {
  return pts([[cx, cy - H2 * s], [cx + W2 * s, cy], [cx, cy + H2 * s], [cx - W2 * s, cy]]);
}

// Iso box faces. a/b = half-diagonals of footprint, z0 = base lift, h = height.
function box(cx, cy, a, b, h, z0 = 0) {
  const y = cy - z0;
  return {
    top: pts([[cx, y - b - h], [cx + a, y - h], [cx, y + b - h], [cx - a, y - h]]),
    left: pts([[cx - a, y - h], [cx, y + b - h], [cx, y + b], [cx - a, y]]),
    right: pts([[cx, y + b - h], [cx + a, y - h], [cx + a, y], [cx, y + b]]),
  };
}

function Box({ cx, cy, a, b, h, z0 = 0, color, stroke = true }) {
  const f = box(cx, cy, a, b, h, z0);
  const s = stroke ? shade(color, -0.45) : 'none';
  return (
    <g strokeWidth="0.6" stroke={s} strokeLinejoin="round">
      <polygon points={f.left} fill={color} />
      <polygon points={f.right} fill={shade(color, -0.22)} />
      <polygon points={f.top} fill={shade(color, 0.22)} />
    </g>
  );
}

// Windows on the two visible faces.
function Windows({ cx, cy, a, b, h, z0 = 0, rows, cols, glow, seed = 0, inset = 8 }) {
  const out = [];
  const usable = h - inset * 1.6;
  if (usable <= 6) return null;
  const rowH = usable / rows;
  const wh = Math.min(rowH * 0.55, 9);
  let i = seed;
  for (let face = 0; face < 2; face++) {
    for (let r = 0; r < rows; r++) {
      const z1 = z0 + inset + r * rowH;
      const z2 = z1 + wh;
      for (let k = 0; k < cols; k++) {
        const t1 = (k + 0.25) / cols;
        const t2 = (k + 0.75) / cols;
        let p;
        if (face === 0) {
          const P = (t, z) => [cx - a + t * a, cy + t * b - z];
          p = [P(t1, z1), P(t2, z1), P(t2, z2), P(t1, z2)];
        } else {
          const P = (t, z) => [cx + t * a, cy + b - t * b - z];
          p = [P(t1, z1), P(t2, z1), P(t2, z2), P(t1, z2)];
        }
        i++;
        const lit = glow ? (i * 7919) % 5 !== 0 : (i * 7919) % 3 === 0;
        out.push(
          <polygon key={`${face}-${r}-${k}`} points={pts(p)}
            fill={lit ? '#ffe2a3' : '#22303f'} opacity={lit ? (face ? 0.82 : 0.95) : 0.55} />
        );
      }
    }
  }
  return <g>{out}</g>;
}

function Tree({ x, y, s = 1, tone = 0 }) {
  const leaf = tone ? '#4f9a5a' : '#3d7f4b';
  return (
    <g>
      <ellipse cx={x} cy={y + 1} rx={7 * s} ry={3 * s} fill="#000" opacity="0.12" />
      <rect x={x - 1.2 * s} y={y - 7 * s} width={2.4 * s} height={7 * s} fill="#6b4a32" />
      <circle cx={x} cy={y - 12 * s} r={7.5 * s} fill={leaf} />
      <circle cx={x - 2.5 * s} cy={y - 14 * s} r={3.5 * s} fill={shade(leaf, 0.18)} />
    </g>
  );
}

function Park({ cx, cy, r, c, onAdd, interactive, dim }) {
  const seed = r * 5 + c;
  const walkPath = `M ${cx - 30} ${cy} L ${cx} ${cy - 15} L ${cx + 30} ${cy} L ${cx} ${cy + 15} Z`;
  return (
    <g>
      <polygon points={diamond(cx, cy, 0.86)} fill="#86b86c" />
      <polygon points={diamond(cx, cy, 0.86)} fill="none" stroke="#6c9c56" strokeWidth="1" />
      {/* footpath loop */}
      <path d={walkPath} fill="none" stroke="#d9ceb0" strokeWidth="4" strokeLinejoin="round" opacity="0.9" />
      <Tree x={cx - 34} y={cy - 4} s={0.9} tone={seed % 2} />
      <Tree x={cx + 4} y={cy - 20} s={0.8} tone={(seed + 1) % 2} />
      <Tree x={cx + 36} y={cy + 4} s={0.85} tone={seed % 2} />
      {seed % 3 !== 0 && <Tree x={cx - 2} y={cy + 24} s={0.7} tone={1} />}
      {/* walkers */}
      {[0, 1].map(i => (
        <circle key={i} r="2.4" fill={['#e0644f', '#3e6fa8', '#f0c445'][(seed + i) % 3]}>
          <animateMotion dur={`${9 + ((seed + i * 3) % 6)}s`} repeatCount="indefinite"
            begin={`${-(seed * 1.7 + i * 4)}s`} path={walkPath} />
        </circle>
      ))}
      {interactive && (
        <g className={`plus ${dim ? 'dim' : ''}`} onClick={onAdd} role="button" aria-label="Add an agent to this lot" tabIndex={0}
           onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onAdd()}>
          <g className="plus-bob" style={{ animationDelay: `${-(seed % 7) * 0.3}s` }}>
            <ellipse cx={cx} cy={cy + 2} rx="12" ry="5" fill="#000" opacity="0.15" />
            <circle cx={cx} cy={cy - 16} r="13" fill="#ffffff" stroke="#2c3440" strokeWidth="1.6" />
            <path d={`M ${cx - 6} ${cy - 16} H ${cx + 6} M ${cx} ${cy - 22} V ${cy - 10}`}
              stroke="#2c3440" strokeWidth="2.6" strokeLinecap="round" />
          </g>
        </g>
      )}
    </g>
  );
}

function Building({ cx, cy, agent, status, onOpen }) {
  const st = STYLES[agent.style] || STYLES.office;
  const color = (COLORS.find(c => c.id === agent.color) || COLORS[1]).base;
  const a = W2 * st.footprint;
  const b = H2 * st.footprint;
  const h = st.height;
  const busy = status === 'busy';
  const parts = [];

  // lot pad
  parts.push(<polygon key="pad" points={diamond(cx, cy, 0.86)} fill="#cfc8b6" />);
  parts.push(<polygon key="shadow" points={diamond(cx + 8, cy + 3, st.footprint * 0.98)} fill="#000" opacity="0.13" />);
  parts.push(<Box key="body" cx={cx} cy={cy} a={a} b={b} h={h} color={color} />);

  const winRows = Math.max(1, Math.floor(h / 18));
  if (agent.style !== 'house') {
    parts.push(<Windows key="win" cx={cx} cy={cy} a={a} b={b} h={h} rows={winRows}
      cols={agent.style === 'tower' ? 3 : 4} glow={busy} seed={agent.name.length} />);
  }

  if (agent.style === 'tower') {
    parts.push(<Box key="crown" cx={cx} cy={cy} a={a * 0.6} b={b * 0.6} h={16} z0={h} color={shade(color, 0.1)} />);
    parts.push(<line key="ant" x1={cx} y1={cy - h - 16} x2={cx} y2={cy - h - 46} stroke="#3a3f47" strokeWidth="2" />);
    parts.push(<circle key="antl" cx={cx} cy={cy - h - 46} r="2.6" fill="#ff5a4a" className="blink" />);
  }
  if (agent.style === 'office') {
    parts.push(<Box key="rim" cx={cx} cy={cy} a={a * 1.03} b={b * 1.03} h={4} z0={h} color={shade(color, -0.3)} />);
  }
  if (agent.style === 'shop') {
    const P = (t, z) => [cx - a + t * a, cy + t * b - z];
    const Q = (t, z) => [cx + t * a, cy + b - t * b - z];
    parts.push(<polygon key="awnL" points={pts([P(0, 30), P(1, 30), P(1.06, 22), P(0.06, 22)])} fill="#f2efe6" stroke={shade(color, -0.4)} strokeWidth="0.6" />);
    parts.push(<polygon key="awnR" points={pts([Q(0, 30), Q(1, 30), Q(0.94, 22), Q(-0.06, 22)])} fill={shade(color, 0.35)} stroke={shade(color, -0.4)} strokeWidth="0.6" />);
  }
  if (agent.style === 'house') {
    const ap = [cx, cy - h - 30];
    parts.push(<polygon key="roofL" points={pts([ap, [cx - a, cy - h], [cx, cy + b - h]])} fill={shade(color, -0.35)} stroke={shade(color, -0.55)} strokeWidth="0.6" />);
    parts.push(<polygon key="roofR" points={pts([ap, [cx, cy + b - h], [cx + a, cy - h]])} fill={shade(color, -0.5)} stroke={shade(color, -0.6)} strokeWidth="0.6" />);
    parts.push(<polygon key="door" points={pts([[cx + a * 0.35, cy + b * 0.65], [cx + a * 0.55, cy + b * 0.45], [cx + a * 0.55, cy + b * 0.45 - 16], [cx + a * 0.35, cy + b * 0.65 - 16]])} fill="#3b2a20" />);
    parts.push(<polygon key="hwin" points={pts([[cx - a * 0.7, cy + b * 0.3 - 10], [cx - a * 0.4, cy + b * 0.6 - 10], [cx - a * 0.4, cy + b * 0.6 - 20], [cx - a * 0.7, cy + b * 0.3 - 20]])} fill={busy ? '#ffe2a3' : '#9cc3d9'} />);
  }
  if (agent.style === 'factory') {
    [[-0.35, 0], [0.25, -0.2]].forEach(([dx, dy], i) => {
      const sx = cx + dx * a, sy = cy + dy * b;
      parts.push(<Box key={`stk${i}`} cx={sx} cy={sy} a={6} b={3} h={34} z0={h} color="#7b5d4c" />);
      parts.push(
        <g key={`puff${i}`} className="puff" style={{ animationDelay: `${i * 1.3}s` }}>
          <circle cx={sx} cy={sy - h - 42} r="6" fill="#e9e6df" opacity="0.8" />
          <circle cx={sx + 6} cy={sy - h - 50} r="5" fill="#e9e6df" opacity="0.6" />
        </g>
      );
    });
  }
  if (agent.style === 'lab') {
    const r = a * 0.55;
    parts.push(<path key="dome" d={`M ${cx - r} ${cy - h} A ${r} ${r * 0.9} 0 0 1 ${cx + r} ${cy - h} A ${r} ${r * 0.45} 0 0 1 ${cx - r} ${cy - h} Z`} fill="#dfe8ee" stroke="#8aa1b1" strokeWidth="0.8" />);
    parts.push(<path key="slit" d={`M ${cx + r * 0.1} ${cy - h - r * 0.85} L ${cx + r * 0.3} ${cy - h + 2}`} stroke="#566c7c" strokeWidth="2.4" />);
  }

  const topY = cy - h - (agent.style === 'tower' ? 50 : agent.style === 'house' ? 34 : agent.style === 'factory' ? 56 : agent.style === 'lab' ? a * 0.55 : 6);

  return (
    <g className="bldg" onClick={onOpen} role="button" tabIndex={0} aria-label={`Open ${agent.name}`}
       onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onOpen()}>
      {parts}
      {busy && <circle cx={cx} cy={topY - 6} r="9" fill="none" stroke="#ffd36b" strokeWidth="2.4" className="pulse" />}
      {status === 'error' && <circle cx={cx + 12} cy={topY - 8} r="5" fill="#e0483a" stroke="#fff" strokeWidth="1.4" />}
      {agent.unread > 0 && !busy && (
        <g className="bubble-bob">
          <rect x={cx - 12} y={topY - 30} width="24" height="18" rx="9" fill="#fff" stroke="#2c3440" strokeWidth="1.4" />
          <path d={`M ${cx - 3} ${topY - 12.6} L ${cx} ${topY - 7} L ${cx + 3} ${topY - 12.6}`} fill="#fff" stroke="#2c3440" strokeWidth="1.4" strokeLinejoin="round" />
          <rect x={cx - 3.5} y={topY - 13.5} width="7" height="2" fill="#fff" />
          <text x={cx} y={topY - 17} textAnchor="middle" fontSize="10" fontWeight="700" fill="#2c3440">{agent.unread > 9 ? '9+' : agent.unread}</text>
        </g>
      )}
    </g>
  );
}

function CentralStation({ cx, cy, onOpen, attention }) {
  const stone = '#d9cdae';
  const a = W2 * 0.86, b = H2 * 0.86, h = 52;
  const P = (t, z) => [cx - a + t * a, cy + t * b - z];
  const Q = (t, z) => [cx + t * a, cy + b - t * b - z];
  const arches = [];
  [0.2, 0.5, 0.8].forEach((t, i) => {
    const w = 0.11;
    const lp = [P(t - w, 8), P(t + w, 8), P(t + w, 30), P(t, 38), P(t - w, 30)];
    const rp = [Q(t - w, 8), Q(t + w, 8), Q(t + w, 30), Q(t, 38), Q(t - w, 30)];
    arches.push(<polygon key={`la${i}`} points={pts(lp)} fill="#ffe2a3" opacity="0.92" />);
    arches.push(<polygon key={`ra${i}`} points={pts(rp)} fill="#ffe2a3" opacity="0.78" />);
  });
  const [kx, ky] = Q(0.5, 44);
  return (
    <g className="bldg" onClick={onOpen} role="button" tabIndex={0} aria-label="Open Central Station"
       onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onOpen()}>
      <polygon points={diamond(cx, cy, 0.96)} fill="#b9ad92" />
      <polygon points={diamond(cx + 10, cy + 4, 0.88)} fill="#000" opacity="0.14" />
      <Box cx={cx} cy={cy} a={a} b={b} h={h} color={stone} />
      {arches}
      <Box cx={cx} cy={cy} a={a * 1.02} b={b * 1.02} h={5} z0={h} color={shade(stone, -0.18)} />
      <Box cx={cx} cy={cy} a={a * 0.48} b={b * 0.48} h={24} z0={h + 5} color={shade(stone, 0.05)} />
      <circle cx={kx} cy={ky} r="8.5" fill="#f6efdc" stroke="#9a7b3c" strokeWidth="1.6" />
      <path d={`M ${kx} ${ky} V ${ky - 5.5} M ${kx} ${ky} L ${kx + 4} ${ky + 1.5}`} stroke="#3a3226" strokeWidth="1.3" strokeLinecap="round" />
      <line x1={cx} y1={cy - h - 29 - 8} x2={cx} y2={cy - h - 70} stroke="#4b4a45" strokeWidth="1.6" />
      <path d={`M ${cx} ${cy - h - 70} l 16 4 l -16 5 z`} fill="#c9963a" className="flag" />
      {attention > 0 && (
        <g>
          <circle cx={cx + 26} cy={cy - h - 40} r="10" fill="#e0483a" stroke="#fff" strokeWidth="1.6" />
          <text x={cx + 26} y={cy - h - 36.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">{attention > 9 ? '9+' : attention}</text>
        </g>
      )}
    </g>
  );
}

export default function CityMap({ agents, statuses, onAdd, onOpen, onOpenCentral, spotlight = null }) {
  const lots = [];
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) lots.push([r, c]);
  lots.sort((p, q) => (p[0] + p[1]) - (q[0] + q[1]) || p[1] - q[1]);

  const attention = Object.values(agents).reduce((n, a) => n + (a.unread || 0), 0);

  // Fit the view to the tallest building so an all-park city isn't floating low.
  let top = -150;
  for (const [key, a] of Object.entries(agents)) {
    const [r, c] = key.split('-').map(Number);
    const h = (STYLES[a.style] || STYLES.office).height;
    const extra = a.style === 'tower' ? 66 : a.style === 'factory' ? 70 : 48;
    top = Math.min(top, center(r, c)[1] - h - extra);
  }
  const vbTop = Math.floor(top) - 4;
  const vbH = 330 - vbTop;
  const half = GRID / 2;
  const ext = (half * TILE_W) + 10;

  return (
    <svg className="city" viewBox={`-360 ${vbTop} 720 ${vbH}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="City map">
      {/* ground: road slab */}
      <g transform={`translate(0, ${(GRID - 1) * H2})`}>
        <polygon points={pts([[0, -ext / 2 - 4], [ext + 8, 0], [0, ext / 2 + 4], [-ext - 8, 0]])} fill="#cfc8b6" />
        <polygon points={pts([[0, -ext / 2], [ext, 0], [0, ext / 2], [-ext, 0]])} fill="#5b6169" />
        <polygon points={pts([[-ext - 8, 0], [0, ext / 2 + 4], [0, ext / 2 + 18], [-ext - 8, 14]])} fill="#a59b85" />
        <polygon points={pts([[0, ext / 2 + 4], [ext + 8, 0], [ext + 8, 14], [0, ext / 2 + 18]])} fill="#8d846f" />
      </g>
      {/* lane markings */}
      <g stroke="#e8e2cf" strokeWidth="1.2" strokeDasharray="6 7" opacity="0.55">
        {Array.from({ length: GRID + 1 }, (_, i) => {
          const k = i - 0.5;
          const a1 = center(k, -0.5), a2 = center(k, GRID - 0.5);
          const b1 = center(-0.5, k), b2 = center(GRID - 0.5, k);
          return (
            <g key={i}>
              <line x1={a1[0]} y1={a1[1]} x2={a2[0]} y2={a2[1]} />
              <line x1={b1[0]} y1={b1[1]} x2={b2[0]} y2={b2[1]} />
            </g>
          );
        })}
      </g>
      {lots.map(([r, c]) => {
        const [cx, cy] = center(r, c);
        const key = lotKey(r, c);
        if (isCenter(r, c)) return <CentralStation key={key} cx={cx} cy={cy} onOpen={onOpenCentral} attention={attention} />;
        const agent = agents[key];
        if (agent) return <Building key={key} cx={cx} cy={cy} agent={agent} status={statuses[key]} onOpen={() => onOpen(key)} />;
        return <Park key={key} cx={cx} cy={cy} r={r} c={c} interactive dim={!!spotlight && spotlight !== key} onAdd={() => onAdd(key)} />;
      })}
      {/* name tags drawn last so nothing in front hides them */}
      <g className="tags" pointerEvents="none">
        {Object.entries(agents).map(([key, a]) => {
          const [r, c] = key.split('-').map(Number);
          const [cx, cy] = center(r, c);
          const b = H2 * (STYLES[a.style] || STYLES.office).footprint;
          const label = a.name.length > 16 ? a.name.slice(0, 15) + '…' : a.name;
          return (
            <g key={key}>
              <rect x={cx - 46} y={cy + b + 2} width="92" height="15" rx="7.5" fill="#1f2630" opacity="0.82" />
              <text x={cx} y={cy + b + 12.6} textAnchor="middle" fontSize="9" fontWeight="600" fill="#fff">{label}</text>
            </g>
          );
        })}
        {(() => {
          const [cx, cy] = center(CENTER.r, CENTER.c);
          const b = H2 * 0.86;
          return (
            <g>
              <rect x={cx - 52} y={cy + b + 4} width="104" height="16" rx="8" fill="#9a7b3c" />
              <text x={cx} y={cy + b + 15.2} textAnchor="middle" fontSize="9" fontWeight="700" letterSpacing="1.2" fill="#fff">CENTRAL STATION</text>
            </g>
          );
        })()}
      </g>
      {spotlight && (() => {
        const isC = spotlight === 'center';
        const [r, c] = isC ? [CENTER.r, CENTER.c] : spotlight.split('-').map(Number);
        const [cx, cy] = center(r, c);
        const tipY = isC ? cy - 52 - 84 : cy - 34;
        return (
          <g className="beacon" pointerEvents="none">
            <polygon points={diamond(cx, cy, 0.92)} fill="none" stroke="#f2b632" strokeWidth="3" className="beacon-ring" />
            <g className="beacon-arrow">
              <path d={`M ${cx} ${tipY} l -9 -12 h 5 v -14 h 8 v 14 h 5 z`} fill="#f2b632" stroke="#7a5a1e" strokeWidth="1.4" strokeLinejoin="round" />
            </g>
          </g>
        );
      })()}
    </svg>
  );
}
