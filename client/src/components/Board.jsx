// Quadro de estratégia estilo Valoplant: minimapa + agentes, habilidades, spike, setas, linhas, desenho e texto.
// Coordenadas guardadas de 0 a 1 (relativas ao minimapa); o SVG desenha em 1000x1000.
import { useEffect, useId, useRef, useState } from 'react';
import { useData } from '../data.jsx';

export const COLORS = ['#ff4655', '#f5c451', '#3fd49b', '#4fa3ff', '#c77dff', '#ffffff'];
export const TEAM_COLOR = { ally: '#4fa3ff', enemy: '#ff4655' };
export const uid = () => Math.random().toString(36).slice(2, 10);

const S = 1000;
const clamp = (v) => Math.min(1, Math.max(0, v));
const isPoint = (it) => ['agent', 'ability', 'spike', 'text'].includes(it.type);

// "A" + "Site" -> "A Site"; "Attacker Side" + "Spawn" -> "Atk Spawn"; não repete a área se o nome já tem.
const AREA_SHORT = { 'Attacker Side': 'Atk', 'Defender Side': 'Def' };
function calloutLabel(c) {
  const area = AREA_SHORT[c.area] ?? c.area ?? '';
  return area && !c.name.toLowerCase().includes(area.toLowerCase()) ? `${area} ${c.name}` : c.name;
}

// Move um item por (dx, dy) sem sair do mapa.
export function translateItem(it, dx, dy) {
  if (isPoint(it)) return { ...it, x: clamp(it.x + dx), y: clamp(it.y + dy) };
  return { ...it, points: it.points.map((v, i) => clamp(v + (i % 2 ? dy : dx))) };
}

// ---------- Desenho de cada item ----------
function Item({ it, rotated, selected, bid, erasing }) {
  const { agent, playerName } = useData();
  const flip = rotated ? ' rotate(180)' : ''; // itens "em pé" mesmo com o mapa girado
  const common = { 'data-id': it.id, className: `board-item ${erasing ? 'erasable' : ''}` };

  if (it.type === 'agent' || it.type === 'ability' || it.type === 'spike' || it.type === 'text') {
    const x = it.x * S, y = it.y * S;
    if (it.type === 'agent') {
      const a = agent(it.agent);
      return (
        <g {...common} transform={`translate(${x} ${y})${flip}`}>
          {selected && <circle r="34" className="board-sel" />}
          <circle r="25" fill="#0f1923" stroke={TEAM_COLOR[it.team] || TEAM_COLOR.ally} strokeWidth="4" />
          {a?.icon && <image href={a.icon} x="-22" y="-22" width="44" height="44" clipPath={`url(#${bid}-round)`} />}
          {it.player && (
            <text y="44" className="board-label">{playerName(it.player)}</text>
          )}
        </g>
      );
    }
    if (it.type === 'ability') {
      const icon = agent(it.agent)?.abilities?.find((ab) => ab.slot === it.slot)?.icon;
      return (
        <g {...common} transform={`translate(${x} ${y})${flip}`}>
          {selected && <circle r="27" className="board-sel" />}
          <circle r="18" fill="rgba(15,25,35,.9)" stroke={TEAM_COLOR[it.team] || TEAM_COLOR.ally} strokeWidth="3" />
          {icon && <image href={icon} x="-12" y="-12" width="24" height="24" />}
        </g>
      );
    }
    if (it.type === 'spike') {
      return (
        <g {...common} transform={`translate(${x} ${y})${flip}`}>
          {selected && <circle r="28" className="board-sel" />}
          <polygon points="0,-19 16,-9 16,9 0,19 -16,9 -16,-9" fill="#ff4655" stroke="#fff" strokeWidth="3" />
          <path d="M0,-9 L6,0 L0,9 L-6,0 Z" fill="#fff" />
        </g>
      );
    }
    return (
      <g {...common} transform={`translate(${x} ${y})${flip}`}>
        {selected && <rect x={-(it.text.length * 8 + 14)} y="-22" width={it.text.length * 16 + 28} height="44" rx="8" className="board-sel" />}
        <text className="board-text" fill={it.color}>{it.text}</text>
      </g>
    );
  }

  // Linhas: um traço largo invisível por baixo facilita clicar/selecionar.
  const p = it.points.map((v) => v * S);
  const colorIdx = Math.max(0, COLORS.indexOf(it.color));
  const shape = it.type === 'pen'
    ? (props) => <polyline points={p.join(' ')} fill="none" strokeLinecap="round" strokeLinejoin="round" {...props} />
    : (props) => <line x1={p[0]} y1={p[1]} x2={p[2]} y2={p[3]} strokeLinecap="round" {...props} />;
  return (
    <g {...common}>
      {shape({ stroke: selected ? 'rgba(255,255,255,.35)' : 'transparent', strokeWidth: 26 })}
      {shape({
        stroke: it.color,
        strokeWidth: it.type === 'pen' ? 5 : 6,
        strokeDasharray: it.dashed ? '16 12' : undefined,
        markerEnd: it.type === 'arrow' ? `url(#${bid}-arrow-${colorIdx})` : undefined,
      })}
    </g>
  );
}

// ---------- Canvas (SVG) ----------
// tool: select | place | arrow | line | pen | text | erase ; pending: item a colocar no modo "place".
export function BoardCanvas({
  minimap, callouts = [], items, rotated = false, showCallouts = true, readOnly = false,
  tool = 'select', pending = null, color = COLORS[0], dashed = false,
  selectedId = null, onSelect, onCommit, onRequestText, className = '',
}) {
  const bid = useId().replace(/:/g, '');
  const svgRef = useRef(null);
  const drag = useRef(null);
  const [draft, setDraft] = useState(null); // item sendo desenhado ou { move: { id, dx, dy } }

  const toBoard = (e) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM().inverse());
    let x = q.x / S, y = q.y / S;
    if (rotated) { x = 1 - x; y = 1 - y; }
    return { x: clamp(x), y: clamp(y) };
  };
  const hitAt = (e) => document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-id]')?.getAttribute('data-id');
  const remove = (id) => onCommit(items.filter((i) => i.id !== id));

  const down = (e) => {
    if (readOnly || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    const p = toBoard(e);
    const hitId = e.target.closest?.('[data-id]')?.getAttribute('data-id');
    svgRef.current.setPointerCapture?.(e.pointerId);
    if (tool === 'select') {
      onSelect?.(hitId || null);
      if (hitId) drag.current = { mode: 'move', id: hitId, start: p, moved: false };
    } else if (tool === 'erase') {
      drag.current = { mode: 'erase' };
      if (hitId) remove(hitId);
    } else if (tool === 'place' && pending) {
      onCommit([...items, { ...pending, id: uid(), x: p.x, y: p.y }]);
    } else if (tool === 'arrow' || tool === 'line') {
      drag.current = { mode: 'draw' };
      setDraft({ type: tool, id: uid(), points: [p.x, p.y, p.x, p.y], color, dashed: tool === 'line' && dashed });
    } else if (tool === 'pen') {
      drag.current = { mode: 'draw' };
      setDraft({ type: 'pen', id: uid(), points: [p.x, p.y], color });
    } else if (tool === 'text') {
      onRequestText?.(p);
    }
  };

  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const p = toBoard(e);
    if (d.mode === 'move') {
      d.moved = true;
      setDraft({ move: { id: d.id, dx: p.x - d.start.x, dy: p.y - d.start.y } });
    } else if (d.mode === 'draw') {
      setDraft((cur) => {
        if (!cur) return cur;
        if (cur.type === 'pen') {
          const n = cur.points.length;
          if (n >= 1200 || Math.hypot(p.x - cur.points[n - 2], p.y - cur.points[n - 1]) < 0.004) return cur;
          return { ...cur, points: [...cur.points, p.x, p.y] };
        }
        return { ...cur, points: [cur.points[0], cur.points[1], p.x, p.y] };
      });
    } else if (d.mode === 'erase') {
      const id = hitAt(e);
      if (id) remove(id);
    }
  };

  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.mode === 'move' && d.moved && draft?.move) {
      const { id, dx, dy } = draft.move;
      onCommit(items.map((it) => (it.id === id ? translateItem(it, dx, dy) : it)));
    } else if (d?.mode === 'draw' && draft) {
      const pts = draft.points;
      const long = draft.type === 'pen' ? pts.length >= 4 : Math.hypot(pts[2] - pts[0], pts[3] - pts[1]) > 0.012;
      if (long) onCommit([...items, draft]);
    }
    setDraft(null);
  };

  // Itens com a prévia do arraste/desenho aplicada.
  // Camadas: desenhos (setas, linhas, lápis) por baixo; agentes, habilidades, spike e textos por cima,
  // para uma seta saindo de um agente não "roubar" o clique dele.
  const moved = items.map((it) => (draft?.move?.id === it.id ? translateItem(it, draft.move.dx, draft.move.dy) : it));
  if (draft && !draft.move) moved.push(draft);
  const shown = [...moved.filter((it) => !isPoint(it)), ...moved.filter(isPoint)];

  return (
    <svg
      ref={svgRef}
      className={`board-svg tool-${readOnly ? 'view' : tool} ${className}`}
      viewBox={`0 0 ${S} ${S}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <defs>
        <clipPath id={`${bid}-round`} clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".5" /></clipPath>
        {COLORS.map((c, i) => (
          <marker key={c} id={`${bid}-arrow-${i}`} markerWidth="4" markerHeight="4" refX="2.2" refY="2" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L4,2 L0,4 z" fill={c} />
          </marker>
        ))}
      </defs>
      <rect width={S} height={S} fill="#0b131b" />
      <g transform={rotated ? `rotate(180 ${S / 2} ${S / 2})` : undefined}>
        {minimap && <image href={minimap} width={S} height={S} className="board-minimap" />}
        {showCallouts && callouts.map((c) => (
          <text key={`${c.area}-${c.name}`} className="board-callout" transform={`translate(${c.x * S} ${c.y * S})${rotated ? ' rotate(180)' : ''}`}>
            {calloutLabel(c)}
          </text>
        ))}
        {shown.map((it) => (
          <Item key={it.id} it={it} rotated={rotated} bid={bid} selected={!readOnly && it.id === selectedId} erasing={tool === 'erase'} />
        ))}
      </g>
    </svg>
  );
}

// Tecla Delete/Backspace apaga o item selecionado (fora de campos de texto).
export function useDeleteKey(selectedId, onDelete) {
  useEffect(() => {
    if (!selectedId) return undefined;
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onDelete(selectedId);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedId, onDelete]);
}
