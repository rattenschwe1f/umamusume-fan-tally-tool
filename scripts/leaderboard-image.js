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

/* -----------------------------
   MOVEMENT LOGIC
------------------------------*/

function getMovementSymbol(name, currentRank, previousRanks) {
  const prev = previousRanks?.[name];

  if (!prev) {
    return { text: "-", color: COLORS.grey };
  }

  const diff = prev - currentRank;

  if (diff === 0) {
    return { text: "-", color: COLORS.grey };
  }

  if (diff > 0) {
    return { text: `▲${diff}`, color: COLORS.green };
  }

  return { text: `▼${Math.abs(diff)}`, color: COLORS.red };
}

/* -----------------------------
   RENDER
------------------------------*/

function renderQuotaLeaderboardPng({
  players,
  goalMetric,
  clubName,
  previousRanks = {},
}) {
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

  y += titleH + headerRowH + lineH;

  const xArrow = padding;
  const xRank = xArrow + 60 * SCALE;
  const xName = xRank + rankColW + gap;

  for (let i = 0; i < list.length; i++) {
    const player = list[i];
    const { name } = cleanNameAndRole(player);

    const rowTop = y + i * rowH;
    const cy = rowTop + rowH / 2;

    const move = getMovementSymbol(name, i + 1, previousRanks);

    ctx.fillStyle = move.color;
    ctx.font = `bold ${13 * SCALE}px system-ui`;
    ctx.fillText(move.text, xArrow, cy);

    ctx.fillStyle = COLORS.white;
    ctx.font = `${13 * SCALE}px system-ui`;
    ctx.fillText(name, xName, cy);
  }

  return canvas.toBuffer("image/png");
}

module.exports = { renderQuotaLeaderboardPng };
