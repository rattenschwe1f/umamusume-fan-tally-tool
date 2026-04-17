const { createCanvas } = require("@napi-rs/canvas");

const SCALE = 3;

const COLORS = {
  bg: "#121212",
  rowAlt: "#1e1e1e",
  white: "#FFFFFF",
  grey: "#888888",
  gold: "#FFD700",
  rankMuted: "#9CA3AF",
  green: "#4ADE80",
  blue: "#4F46E5",
  red: "#EF4444",
  barBg: "#374151",
  headerLine: "#3B82F6",
};

function parseNumber(value) {
  if (!value) return 0;
  const cleaned = String(value).replace(/[^0-9-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compactNumber(n) {
  if (!Number.isFinite(n) || n <= 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e9) {
    const v = n / 1e9;
    let s = v >= 100 ? String(Math.round(v)) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
    s = s.replace(/\.0+$/, "");
    return `${s}B`;
  }
  if (abs >= 1e6) {
    const v = n / 1e6;
    let s = v >= 100 ? String(Math.round(v)) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
    s = s.replace(/\.0+$/, "");
    return `${s}M`;
  }
  if (abs >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(Math.round(n));
}

function cleanNameAndRole(player) {
  let name = (player.name || "").trim();
  let role = (player.role || "").trim().toUpperCase();

  if (!role) {
    if (/leader$/i.test(name)) role = "LEADER";
    else if (/officer$/i.test(name)) role = "OFFICER";
    else if (/member$/i.test(name)) role = "MEMBER";
    else if (/left$/i.test(name)) role = "LEFT";
  }

  name = name.replace(/(Leader|Member|Left|Officer)+$/i, "").trim();
  return { name, role: role || "UNKNOWN" };
}

function pickAllTimeFans(stats) {
  if (!stats || typeof stats !== "object") return null;
  const preferred = [
    "all_time",
    "alltime",
    "all_time_fans",
    "total_fans",
    "fans_total",
    "lifetime",
    "total",
  ];
  for (const key of preferred) {
    if (stats[key] != null && String(stats[key]).trim() !== "") {
      const n = parseNumber(stats[key]);
      if (n > 0) return n;
    }
  }
  for (const [key, val] of Object.entries(stats)) {
    if (/all_?time|total|lifetime/i.test(key)) {
      const n = parseNumber(val);
      if (n > 0) return n;
    }
  }
  return null;
}

function barFillColor(percent) {
  if (percent >= 100) return COLORS.green;
  if (percent >= 30) return COLORS.blue;
  return COLORS.red;
}

function percentTextColor(percent) {
  if (percent >= 100) return COLORS.green;
  return COLORS.white;
}

function drawRoundedBar(ctx, x, y, width, height, fillRatio, fillColor) {
  const r = height / 2;
  ctx.fillStyle = COLORS.barBg;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, r);
  ctx.fill();

  const clamped = Math.max(0, Math.min(1, fillRatio));
  const fillW = Math.max(0, width * clamped);
  if (fillW < 0.5) return;

  ctx.fillStyle = fillColor;
  ctx.beginPath();
  const innerR = Math.min(r, fillW / 2);
  ctx.roundRect(x, y, fillW, height, innerR);
  ctx.fill();
}

function truncateToWidth(ctx, text, maxWidth) {
  const t = String(text);
  if (!t) return "";
  if (ctx.measureText(t).width <= maxWidth) return t;
  let s = t;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) {
    s = s.slice(0, -1);
  }
  return `${s}…`;
}

function renderQuotaLeaderboardPng({ players, goalMetric, clubName }) {
  const club = String(clubName || "Club").trim() || "Club";
  const titleText = `${club} Quota Progress`;

  const WIDTH = 980 * SCALE;
  const padding = 24 * SCALE;
  const titleH = 44 * SCALE;
  const headerRowH = 28 * SCALE;
  const lineH = 2 * SCALE;
  const rowH = 38 * SCALE;
  const gap = 12 * SCALE;
  const rankColW = 52 * SCALE;
  const nameMaxW = 210 * SCALE;
  const barW = 200 * SCALE;
  const pctW = 52 * SCALE;
  const fansW = 138 * SCALE;
  const allTimeW = 78 * SCALE;

  const list = Array.isArray(players) ? players : [];
  const height =
    padding +
    titleH +
    headerRowH +
    lineH +
    Math.max(1, list.length) * rowH +
    padding;

  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext("2d");

  ctx.textBaseline = "middle";
  ctx.imageSmoothingEnabled = true;

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, height);

  let y = padding;

  ctx.fillStyle = COLORS.white;
  ctx.font = `bold ${26 * SCALE}px system-ui, Segoe UI, Arial, sans-serif`;
  ctx.textAlign = "left";
  const titleDraw = truncateToWidth(ctx, titleText, WIDTH - padding * 2);
  ctx.fillText(titleDraw, padding, y + titleH / 2);
  y += titleH;

  const xRank = padding;
  const xName = xRank + rankColW + gap;
  const xBar = xName + nameMaxW + gap;
  const xPct = xBar + barW + gap;
  const xFans = xPct + pctW + gap;
  const xAllTime = xFans + fansW + gap;

  ctx.font = `${11 * SCALE}px system-ui, Segoe UI, Arial, sans-serif`;
  ctx.fillStyle = COLORS.grey;
  ctx.textAlign = "left";
  const headerY = y + headerRowH / 2;
  ctx.fillText("RANK", xRank, headerY);
  ctx.fillText("PLAYER", xName, headerY);
  ctx.fillText("PROGRESS", xBar, headerY);
  ctx.textAlign = "right";
  ctx.fillText("%", xPct + pctW, headerY);
  ctx.fillText("Monthly FANS", xFans + fansW, headerY);
  ctx.fillText("Total Fans", xAllTime + allTimeW, headerY);
  ctx.textAlign = "left";

  y += headerRowH;
  ctx.strokeStyle = COLORS.headerLine;
  ctx.lineWidth = lineH;
  ctx.beginPath();
  ctx.moveTo(padding, y);
  ctx.lineTo(WIDTH - padding, y);
  ctx.stroke();
  y += lineH;

  if (list.length === 0) {
    ctx.fillStyle = COLORS.grey;
    ctx.font = `${14 * SCALE}px system-ui, Segoe UI, Arial, sans-serif`;
    ctx.fillText("No member data", padding, y + rowH / 2);
    return canvas.toBuffer("image/png");
  }

  for (let i = 0; i < list.length; i++) {
    const player = list[i];
    const rowTop = y + i * rowH;
    const rowBg = i % 2 === 0 ? COLORS.rowAlt : COLORS.bg;
    ctx.fillStyle = rowBg;
    ctx.fillRect(0, rowTop, WIDTH, rowH);

    const { name } = cleanNameAndRole(player);
    const stats = player.stats || {};
    const monthlyGain = parseNumber(stats.monthly_gain || "0");
    const pctRaw = goalMetric > 0 ? (monthlyGain / goalMetric) * 100 : 0;
    const pctDisplay = Math.round(Math.max(0, Math.min(1000, pctRaw)));
    const barRatio = Math.min(1, pctRaw / 100);
    const displayRank = i + 1;

    const cy = rowTop + rowH / 2;

    ctx.font = `bold ${13 * SCALE}px system-ui, Segoe UI, Arial, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillStyle = displayRank <= 3 ? COLORS.gold : COLORS.rankMuted;
    ctx.fillText(`#${displayRank}`, xRank, cy);

    ctx.fillStyle = COLORS.white;
    ctx.font = `${13 * SCALE}px system-ui, Segoe UI, Arial, sans-serif`;
    ctx.fillText(truncateToWidth(ctx, name, nameMaxW), xName, cy);

    const barHeight = 14 * SCALE;
    const barY = rowTop + (rowH - barHeight) / 2;
    drawRoundedBar(ctx, xBar, barY, barW, barHeight, barRatio, barFillColor(pctRaw));

    ctx.textAlign = "right";
    ctx.font = `bold ${13 * SCALE}px system-ui, Segoe UI, Arial, sans-serif`;
    ctx.fillStyle = percentTextColor(pctRaw);
    ctx.fillText(`${pctDisplay}%`, xPct + pctW, cy);

    const curCompact = compactNumber(monthlyGain);
    const goalCompact = compactNumber(goalMetric);
    const fansGrey = ` / ${goalCompact}`;
    const fansRight = xFans + fansW;

    ctx.textAlign = "right";
    ctx.font = `${13 * SCALE}px system-ui, Segoe UI, Arial, sans-serif`;
    const greyW = ctx.measureText(fansGrey).width;
    ctx.font = `bold ${13 * SCALE}px system-ui, Segoe UI, Arial, sans-serif`;
    ctx.fillStyle = COLORS.white;
    ctx.fillText(curCompact, fansRight - greyW, cy);

    ctx.font = `${13 * SCALE}px system-ui, Segoe UI, Arial, sans-serif`;
    ctx.fillStyle = COLORS.grey;
    ctx.fillText(fansGrey, fansRight, cy);

    const allTime = pickAllTimeFans(stats);
    const allTimeStr = allTime != null ? compactNumber(allTime) : "—";

    ctx.textAlign = "right";
    ctx.fillStyle = COLORS.grey;
    ctx.font = `${13 * SCALE}px system-ui, Segoe UI, Arial, sans-serif`;
    ctx.fillText(allTimeStr, xAllTime + allTimeW, cy);

    ctx.textAlign = "left";
  }

  return canvas.toBuffer("image/png");
}

module.exports = { renderQuotaLeaderboardPng };
