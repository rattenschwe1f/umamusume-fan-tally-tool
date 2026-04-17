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

function getMovement(name, currentRank, previousRanks) {
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
  const moveColW = 70 * SCALE; // 👈 NEW dedicated space for arrows
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

  /* background */
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, height);

  let y = padding;

  /* title */
  ctx.fillStyle = COLORS.white;
  ctx.font = `bold ${26 * SCALE}px system-ui`;
  ctx.textAlign = "left";
  ctx.fillText(`${clubName} Quota Progress`, padding, y + titleH / 2);

  y += titleH;

  /* column layout */
  const xRank = padding;
  const xMove = xRank + rankColW + gap;   // 👈 ARROWS GO HERE
  const xName = xMove + moveColW + gap;

  const xBar = xName + nameMaxW + gap;
  const xPct = xBar + barW + gap;
  const xFans = xPct + pctW + gap;
  const xAllTime = xFans + fansW + gap;

  /* header */
  ctx.font = `${11 * SCALE}px system-ui`;
  ctx.fillStyle = COLORS.grey;

  const headerY = y + headerRowH / 2;
  ctx.textAlign = "left";

  ctx.fillText("RANK", xRank, headerY);
  ctx.fillText("", xMove, headerY); // movement column (intentionally blank)
  ctx.fillText("PLAYER", xName, headerY);
  ctx.fillText("PROGRESS", xBar, headerY);

  ctx.textAlign = "right";
  ctx.fillText("%", xPct + pctW, headerY);
  ctx.fillText("FANS", xFans + fansW, headerY);
  ctx.fillText("ALL TIME", xAllTime + allTimeW, headerY);

  y += headerRowH + lineH;

  if (list.length === 0) {
    ctx.fillStyle = COLORS.grey;
    ctx.font = `${14 * SCALE}px system-ui`;
    ctx.fillText("No member data", padding, y + rowH / 2);
    return canvas.toBuffer("image/png");
  }

  /* rows */
  for (let i = 0; i < list.length; i++) {
    const player = list[i];
    const { name } = cleanNameAndRole(player);

    const stats = player.stats || {};
    const monthlyGain = parseNumber(stats.monthly_gain || "0");

    const rowTop = y + i * rowH;
    const cy = rowTop + rowH / 2;

    /* row background */
    ctx.fillStyle = i % 2 === 0 ? COLORS.rowAlt : COLORS.bg;
    ctx.fillRect(0, rowTop, WIDTH, rowH);

    /* rank */
    ctx.textAlign = "left";
    ctx.font = `bold ${13 * SCALE}px system-ui`;
    ctx.fillStyle = i < 3 ? COLORS.gold : COLORS.rankMuted;
    ctx.fillText(`#${i + 1}`, xRank, cy);

    /* movement arrow (BETWEEN rank and name) */
    const move = getMovement(name, i + 1, previousRanks);

    ctx.fillStyle = move.color;
    ctx.font = `bold ${13 * SCALE}px system-ui`;
    ctx.fillText(move.text, xMove, cy);

    /* name */
    ctx.fillStyle = COLORS.white;
    ctx.font = `${13 * SCALE}px system-ui`;
    ctx.fillText(name, xName, cy);

    /* progress bar */
    const pctRaw = goalMetric > 0 ? (monthlyGain / goalMetric) * 100 : 0;
    const barRatio = Math.min(1, pctRaw / 100);

    const barY = rowTop + (rowH - 14 * SCALE) / 2;

    ctx.fillStyle = COLORS.barBg;
    ctx.beginPath();
    ctx.roundRect(xBar, barY, barW, 14 * SCALE, 7 * SCALE);
    ctx.fill();

    ctx.fillStyle =
      pctRaw >= 100 ? COLORS.green : pctRaw >= 30 ? COLORS.blue : COLORS.red;

    ctx.beginPath();
    ctx.roundRect(
      xBar,
      barY,
      barW * barRatio,
      14 * SCALE,
      7 * SCALE
    );
    ctx.fill();

    /* percent */
    ctx.textAlign = "right";
    ctx.font = `bold ${13 * SCALE}px system-ui`;
    ctx.fillStyle = COLORS.white;
    ctx.fillText(`${Math.round(pctRaw)}%`, xPct + pctW, cy);

    /* fans */
    ctx.font = `${13 * SCALE}px system-ui`;
    ctx.fillText(String(monthlyGain), xFans + fansW, cy);

    /* all time placeholder */
    ctx.fillStyle = COLORS.grey;
    ctx.fillText("—", xAllTime + allTimeW, cy);
  }

  return canvas.toBuffer("image/png");
}

module.exports = { renderQuotaLeaderboardPng };
