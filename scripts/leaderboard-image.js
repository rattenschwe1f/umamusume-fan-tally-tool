const { createCanvas } = require("@napi-rs/canvas");

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

function getMovement(name, currentRank, previousRanks) {
  if (!previousRanks || !previousRanks[name]) return 0;
  return previousRanks[name] - currentRank;
}

function drawArrow(ctx, movement, x, y, scale) {
  if (movement === 0) return;

  ctx.font = `${12 * scale}px system-ui`;
  if (movement > 0) {
    ctx.fillStyle = "#4ADE80";
    ctx.fillText(`▲${movement}`, x, y);
  } else {
    ctx.fillStyle = "#EF4444";
    ctx.fillText(`▼${Math.abs(movement)}`, x, y);
  }
}

function renderQuotaLeaderboardPng({ players, goalMetric, clubName, previousRanks = {} }) {
  const SCALE = 3;

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
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, height);

  let y = padding;

  ctx.fillStyle = COLORS.white;
  ctx.font = `bold ${26 * SCALE}px system-ui`;
  ctx.fillText(`${clubName} Quota Progress`, padding, y + titleH / 2);
  y += titleH;

  const xRank = padding;
  const xName = xRank + rankColW + gap;
  const xBar = xName + nameMaxW + gap;
  const xPct = xBar + barW + gap;

  ctx.font = `${11 * SCALE}px system-ui`;
  ctx.fillStyle = COLORS.grey;

  y += headerRowH + lineH;

  for (let i = 0; i < list.length; i++) {
    const player = list[i];
    const { name } = cleanNameAndRole(player);

    const rowTop = y + i * rowH;
    const cy = rowTop + rowH / 2;

    const movement = getMovement(name, i + 1, previousRanks);

    drawArrow(ctx, movement, xRank - 20 * SCALE, cy, SCALE);

    ctx.fillStyle = COLORS.white;
    ctx.font = `${13 * SCALE}px system-ui`;
    ctx.fillText(name, xName, cy);
  }

  return canvas.toBuffer("image/png");
}

module.exports = { renderQuotaLeaderboardPng };
