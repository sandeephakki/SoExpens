// ui/report-canvas.js — draws the report model as a PNG-ready canvas.
// Fixed logical width so the image looks identical on every device.

const W = 600;           // logical width (css px)
const SCALE = 2;         // output is 1200px wide
const SL = 56;
const AMT = 124;
const TXT = W - SL - AMT;
const PAD = 8;
const LH = 22;
const FONT = (px, w = 400) => `${w} ${px}px Calibri, Carlito, "Segoe UI", Roboto, Arial, sans-serif`;
const INK = '#111111';
const LINE = '#2b2b2b';

function wrap(ctx, text, maxW) {
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width <= maxW || !cur) cur = test; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function drawReport(model) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = FONT(16);

  const rows = [];
  const push = (r) => rows.push(r);
  const cellH = (lines) => lines * LH + PAD;

  push({ t: 'merged', text: model.society, size: 20, align: 'center', h: 36 });
  push({ t: 'title', h: 32 });
  push({ t: 'cols', a: 'Sl No.', b: 'Particulars', c: 'Amount', h: 32 });

  ctx.font = FONT(16);
  for (const it of model.items) {
    const lines = wrap(ctx, it.text, TXT - PAD * 2);
    push({ t: 'item', sl: it.sl, lines, amount: it.amount, h: cellH(lines.length) + 4 });
  }
  if (!model.items.length) push({ t: 'merged', text: '-', size: 16, align: 'center', h: 32 });
  push({ t: 'total', label: 'Total spent', amount: model.totalSpent, h: 34 });
  push({ t: 'gap', h: 14 });
  push({ t: 'merged', text: model.summaryTitle, size: 17, weight: 600, underline: true, align: 'center', h: 34 });
  push({ t: 'cols', a: 'Sl No.', b: 'Description', c: 'Amount', h: 32 });
  for (const s of model.summary) {
    const lines = wrap(ctx, s.text, TXT - PAD * 2);
    push({ t: 'item', sl: s.sl, lines, amount: s.amount, bold: s.bold, h: cellH(lines.length) + 4 });
  }
  push({ t: 'total', label: model.balance.text, amount: model.balance.amount, h: 34 });
  push({ t: 'total', label: model.savings.text, amount: model.savings.amount, h: 34 });

  const carryLines = wrap(ctx, model.carryLine, W - PAD * 2);
  push({ t: 'text', lines: carryLines, bold: true, h: cellH(carryLines.length) + 4 });
  if (model.note) {
    const nl = wrap(ctx, `Note: ${model.note}`, W - PAD * 2);
    push({ t: 'text', lines: nl, h: cellH(nl.length) + 4 });
  }

  const totalH = rows.reduce((s, r) => s + r.h, 0) + 2;
  canvas.width = (W + 2) * SCALE;
  canvas.height = totalH * SCALE;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W + 2, totalH);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.fillStyle = INK;
  ctx.textBaseline = 'middle';

  const box = (x, y, w, h) => ctx.strokeRect(x + 1.5, y + 1.5, w, h);
  const text = (s, x, y, { size = 16, weight = 400, align = 'left' } = {}) => {
    ctx.font = FONT(size, weight);
    ctx.textAlign = align;
    ctx.fillText(s, x, y);
  };

  let y = 0;
  for (const r of rows) {
    const mid = y + r.h / 2 + 1;
    if (r.t === 'merged') {
      box(0, y, W, r.h);
      text(r.text, W / 2 + 1.5, mid, { size: r.size, weight: r.weight || 400, align: 'center' });
      if (r.underline) {
        ctx.font = FONT(r.size, r.weight || 400);
        const tw = ctx.measureText(r.text).width;
        ctx.beginPath(); ctx.moveTo(W / 2 + 1.5 - tw / 2, mid + 10); ctx.lineTo(W / 2 + 1.5 + tw / 2, mid + 10); ctx.stroke();
      }
    } else if (r.t === 'title') {
      box(0, y, W, r.h);
      ctx.font = FONT(16);
      const a = model.titlePre;
      const b = model.titleBold;
      ctx.font = FONT(16, 400); const wa = ctx.measureText(a).width;
      ctx.font = FONT(16, 700); const wb = ctx.measureText(b).width;
      const x0 = W / 2 + 1.5 - (wa + wb) / 2;
      text(a, x0, mid, { align: 'left' });
      text(b, x0 + wa, mid, { weight: 700, align: 'left' });
    } else if (r.t === 'cols') {
      box(0, y, SL, r.h); box(SL, y, TXT, r.h); box(SL + TXT, y, AMT, r.h);
      text(r.a, SL / 2 + 1.5, mid, { align: 'center' });
      text(r.b, SL + TXT / 2 + 1.5, mid, { align: 'center' });
      text(r.c, SL + TXT + AMT / 2 + 1.5, mid, { align: 'center' });
    } else if (r.t === 'item') {
      box(0, y, SL, r.h); box(SL, y, TXT, r.h); box(SL + TXT, y, AMT, r.h);
      text(r.sl, SL / 2 + 1.5, mid, { align: 'center', weight: r.bold ? 700 : 400 });
      const top = y + (r.h - r.lines.length * LH) / 2 + LH / 2 + 1;
      r.lines.forEach((ln, i) => text(ln, SL + PAD + 1.5, top + i * LH, { weight: r.bold ? 700 : 400 }));
      text(r.amount, SL + TXT + AMT - PAD + 1.5, mid, { align: 'right', weight: r.bold ? 700 : 400 });
    } else if (r.t === 'total') {
      box(0, y, SL + TXT, r.h); box(SL + TXT, y, AMT, r.h);
      text(r.label, SL + TXT - PAD + 1.5, mid, { align: 'right' });
      text(r.amount, SL + TXT + AMT - PAD + 1.5, mid, { align: 'right', weight: 700 });
    } else if (r.t === 'text') {
      box(0, y, W, r.h);
      const top = y + (r.h - r.lines.length * LH) / 2 + LH / 2 + 1;
      r.lines.forEach((ln, i) => text(ln, PAD + 1.5, top + i * LH, { weight: r.bold ? 600 : 400 }));
    }
    y += r.h;
  }
  return canvas;
}
