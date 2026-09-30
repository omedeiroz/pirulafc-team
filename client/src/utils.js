export const ROLES = ['Controlador', 'Duelista', 'Iniciador', 'Sentinela'];

// Recorta a área escolhida no cropper (em pixels da imagem original) e gera WebP no tamanho final.
export async function cropImage(src, area, { width, height }) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Não consegui ler essa imagem'));
    i.src = src;
  });
  // Nunca amplia além da resolução real do recorte.
  const k = Math.min(1, area.width / width, area.height / height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * k));
  canvas.height = Math.max(1, Math.round(height * k));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  // O recorte pode sair da imagem (zoom afastado): desenha a imagem inteira deslocada e escalada,
  // e o que ficar fora dela fica transparente.
  const s = canvas.width / area.width;
  ctx.drawImage(img, -area.x * s, -area.y * s, img.naturalWidth * s, img.naturalHeight * s);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível processar a imagem'))), 'image/webp', 0.9)
  );
}

// Reduz a imagem no navegador antes do upload (foto quadrada / banner largo), em WebP.
// GIF vai sem mexer para não perder a animação.
export async function resizeImage(file, { width, height }) {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem');
  if (file.type === 'image/gif') return file;
  let bmp;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error('Não consegui ler essa imagem. Use PNG, JPG, WebP ou GIF (fotos HEIC do iPhone não funcionam).');
  }
  // Proporção do alvo; se a imagem for menor que o alvo, reduz o alvo (nunca amplia).
  const k = Math.min(1, bmp.width / width, bmp.height / height);
  const w = Math.max(1, Math.round(width * k));
  const h = Math.max(1, Math.round(height * k));
  // "cover": corta o excesso mantendo o centro
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const s = Math.max(w / bmp.width, h / bmp.height);
  const dw = bmp.width * s, dh = bmp.height * s;
  canvas.getContext('2d').drawImage(bmp, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível processar a imagem'))), 'image/webp', 0.88)
  );
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = iso.length === 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
  return d.toLocaleDateString('pt-BR');
}

export function fmtDateTime(iso) {
  return iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
}

export function fmtRange(start, end) {
  if (!start) return '';
  return end && end !== start ? `${fmtDate(start)} – ${fmtDate(end)}` : fmtDate(start);
}

export const isHttp = (url) => /^https?:\/\//i.test(url || '');

export function matchResult(m) {
  if (m.scoreUs == null || m.scoreThem == null) return null;
  if (m.scoreUs > m.scoreThem) return 'W';
  if (m.scoreUs < m.scoreThem) return 'L';
  return 'D';
}

export function record(matches) {
  let w = 0, l = 0, rounds = 0;
  for (const m of matches) {
    const r = matchResult(m);
    if (r === 'W') w++;
    if (r === 'L') l++;
    rounds += (m.scoreUs || 0) - (m.scoreThem || 0);
  }
  return { w, l, rounds, wr: w + l ? Math.round((w / (w + l)) * 100) : null };
}

// Soma K/D/A por player em uma lista de partidas.
export function aggregateStats(matches) {
  const by = {};
  for (const m of matches) {
    for (const s of m.stats || []) {
      const p = (by[s.player] ||= { player: s.player, maps: 0, k: 0, d: 0, a: 0, acsSum: 0, acsN: 0, agents: {} });
      p.maps += 1;
      p.k += s.k || 0;
      p.d += s.d || 0;
      p.a += s.a || 0;
      if (s.acs != null) { p.acsSum += s.acs; p.acsN += 1; }
      if (s.agent) p.agents[s.agent] = (p.agents[s.agent] || 0) + 1;
    }
  }
  return Object.values(by)
    .map((p) => ({
      ...p,
      kd: p.d ? p.k / p.d : p.k,
      kda: p.d ? (p.k + p.a) / p.d : p.k + p.a,
      acs: p.acsN ? Math.round(p.acsSum / p.acsN) : null,
      topAgents: Object.entries(p.agents).sort((a, b) => b[1] - a[1]).map(([name]) => name),
    }))
    .sort((a, b) => b.kd - a.kd);
}

// Comp confirmada mais recente de cada mapa.
export function latestByMap(teamComps) {
  const out = {};
  for (const c of teamComps) if (!out[c.map] || out[c.map].confirmedAt < c.confirmedAt) out[c.map] = c;
  return out;
}
