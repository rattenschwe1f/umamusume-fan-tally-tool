const { createCanvas } = require("@napi-rs/canvas");

const COLORS = {
  bg: "#121212",
  rowAlt: "#1e1e1e",
  white: "#FFFFFF",
  grey: "#888888",
  gold: "#FFD700",
  silver: "#C0C0C0",
  bronze: "#CD7F32",
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

/* -----------------------------
   FORMAT HELPERS
------------------------------*/
function toMillions(n) {
  if (!Number.isFinite(n)) return "0m";
  const val = n / 1_000_000;
  return `${val.toFixed(1).replace(/\.0$/, "")}m`;
}

function toRoundedMillions(n) {
  if (!Number.isFinite(n)) return "0m";
  return `${Math.round(n / 1_000_000)}m`;
}

/* -----------------------------
   CLEAN NAME & ROLE
------------------------------*/
function cleanNameAndRole(player) {
  let name = (player.name || "").trim();
  let role = (player.role || "").trim().toUpperCase();

  name = name.replace(/open_in_new.*$/i, "").trim();
  name = name
    .replace(/\s*\[.*?\]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();

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
   MOVEMENT ARROWS
------------------------------*/
function getMovement(name, currentRank, previousRanks) {
  const prev = previousRanks?.[name];
  if (!prev) return { text: "-", color: COLORS.grey };
  const diff = prev - currentRank;
  if (diff === 0) return { text: "-", color: COLORS.grey };
  if (diff > 0) return { text: `▲${diff}`, color: COLORS.green };
  return { text: `▼${Math.abs(diff)}`, color: COLORS.red };
}

/* -----------------------------
   PACING LOGIC
------------------------------*/
function getExpectedProgress(goalMetric) {
  const now = new Date();
  const day = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return (goalMetric / daysInMonth) * day;
}

/* -----------------------------
   MAIN RENDER — ALWAYS 30 ROWS
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
  const moveColW = 70 * SCALE;
  const nameMaxW = 210 * SCALE;
  const barW = 220 * SCALE;
  const quotaW = 170 * SCALE;
  const totalFansW = 130 * SCALE;

  const MAX_ROWS = 30;
  let list = Array.isArray(players) ? players : [];

  // Filter LEFT players and limit to top 30 by gain if necessary
  const nonLeft = list.filter(p => cleanNameAndRole(p).role !== "LEFT");

  if (nonLeft.length > MAX_ROWS) {
    nonLeft.sort((a, b) => {
      const gainA = parseNumber(a.stats?.monthly_gain || "0");
      const gainB = parseNumber(b.stats?.monthly_gain || "0");
      return gainB - gainA;
    });
    list = nonLeft.slice(0, MAX_ROWS);
  } else {
    list = nonLeft;
  }

  const height = padding + titleH + headerRowH + lineH + MAX_ROWS * rowH + padding;

  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "middle";

  /* background */
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, height);

  let y = padding;

  /* fonts */
  const titleFont = `bold ${26 * SCALE}px Arial, Helvetica, "Segoe UI", system-ui, sans-serif`;
  const headerFont = `${11 * SCALE}px Arial, Helvetica, "Segoe UI", system-ui, sans-serif`;
  const rankFont = `bold ${13 * SCALE}px Arial, Helvetica, "Segoe UI", system-ui, sans-serif`;
  const nameFont = `${13 * SCALE}px Arial, Helvetica, "Segoe UI", system-ui, sans-serif`;
  const smallBoldFont = `bold ${11 * SCALE}px Arial, Helvetica, "Segoe UI", system-ui, sans-serif`;

  /* title */
  ctx.fillStyle = COLORS.white;
  ctx.font = titleFont;
  ctx.textAlign = "left";
  ctx.fillText(`${clubName} Quota Progress`, padding, y + titleH / 2);
  y += titleH;

  /* layout */
  const xRank = padding;
  const xMove = xRank + rankColW + gap;
  const xName = xMove + moveColW + gap;
  const xBar = xName + nameMaxW + gap;
  const xPct = xBar + barW + 8 * SCALE;
  const xQuota = xPct + 55 * SCALE + 18 * SCALE;
  const xTotalFans = xQuota + quotaW + gap + 10 * SCALE;

  /* header */
  ctx.font = headerFont;
  ctx.fillStyle = COLORS.grey;
  const headerY = y + headerRowH / 2;
  ctx.textAlign = "left";
  ctx.fillText("RANK", xRank, headerY);
  ctx.fillText("PLAYER", xName, headerY);
  ctx.fillText("PROGRESS", xBar, headerY);
  ctx.fillText("QUOTA", xQuota, headerY);
  ctx.fillText("TOTAL FANS", xTotalFans, headerY);

  y += headerRowH + lineH;

  /* rows - always exactly 30 */
  let activeRank = 1;

  for (let i = 0; i < MAX_ROWS; i++) {
    const player = list[i];
    const rowTop = y + i * rowH;
    const cy = rowTop + rowH / 2;

    /* row background */
    ctx.fillStyle = i % 2 === 0 ? COLORS.rowAlt : COLORS.bg;
    ctx.fillRect(0, rowTop, WIDTH, rowH);

    if (!player) continue;

    const cleaned = cleanNameAndRole(player);
    const stats = player.stats || {};
    const monthlyGain = parseNumber(stats.monthly_gain || "0");

    // Blank row only for LEFT players
    if (cleaned.role === "LEFT") {
      continue;
    }

    // Active player (including 0 gain)
    const quotaValue = goalMetric > 0 ? (monthlyGain / goalMetric) * 100 : 0;
    const totalFansRaw = parseNumber(stats.total_fans ?? stats.fans ?? stats.all_time ?? 0);

    /* rank */
    ctx.font = rankFont;
    let rankColor = COLORS.rankMuted;
    if (activeRank === 1) rankColor = COLORS.gold;
    else if (activeRank === 2) rankColor = COLORS.silver;
    else if (activeRank === 3) rankColor = COLORS.bronze;

    ctx.fillStyle = rankColor;
    ctx.fillText(`#${activeRank}`, xRank, cy);

    /* movement */
    const move = getMovement(cleaned.name, activeRank, previousRanks);
    ctx.fillStyle = move.color;
    ctx.fillText(move.text, xMove, cy);

    /* name */
    ctx.fillStyle = COLORS.white;
    ctx.font = nameFont;
    ctx.fillText(cleaned.name, xName, cy);

    /* progress bar */
    const barY = rowTop + (rowH - 14 * SCALE) / 2;
    ctx.fillStyle = COLORS.barBg;
    ctx.beginPath();
    ctx.roundRect(xBar, barY, barW, 14 * SCALE, 7 * SCALE);
    ctx.fill();

    let barColor = COLORS.red;
    if (monthlyGain >= getExpectedProgress(goalMetric)) {
      barColor = quotaValue >= 100 ? COLORS.green : COLORS.blue;
    }
    ctx.fillStyle = barColor;
    ctx.beginPath();
    ctx.roundRect(xBar, barY, barW * Math.min(1, quotaValue / 100), 14 * SCALE, 7 * SCALE);
    ctx.fill();

    /* % label */
    ctx.fillStyle = COLORS.grey;
    ctx.font = smallBoldFont;
    ctx.fillText(`${Math.round(quotaValue)}%`, xPct, cy);

    /* quota */
    ctx.font = rankFont;
    const quotaLeft = toMillions(monthlyGain);
    const quotaRight = toMillions(goalMetric);
    ctx.fillStyle = COLORS.white;
    ctx.fillText(quotaLeft, xQuota, cy);
    ctx.fillStyle = COLORS.grey;
    ctx.fillText(`/${quotaRight}`, xQuota + ctx.measureText(quotaLeft).width + 6 * SCALE, cy);

    /* total fans */
    ctx.fillStyle = COLORS.white;
    ctx.font = nameFont;
    ctx.fillText(toRoundedMillions(totalFansRaw), xTotalFans, cy);

    activeRank++;
  }

  return canvas.toBuffer("image/png");
}

module.exports = { renderQuotaLeaderboardPng };
