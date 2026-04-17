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

function toMillions(n) {
  if (!Number.isFinite(n)) return "0m";
  const val = n / 1_000_000;
  return `${val.toFixed(1).replace(/\.0$/, "")}m`;
}

function toRoundedMillions(n) {
  if (!Number.isFinite(n)) return "0m";
  return `${Math.round(n / 1_000_000)}m`;
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
  const prev = previousRanks?.[name];
  if (!prev) return { text: "-", color: COLORS.grey };

  const diff = prev - currentRank;
  if (diff === 0) return { text: "-", color: COLORS.grey };
  if (diff > 0) return { text: `▲${diff}`, color: COLORS.green };

  return { text: `▼${Math.abs(diff)}`, color: COLORS.red };
}

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

  const quotaW = 170 * SCALE;      // slightly wider
  const totalFansW = 130 * SCALE;  // slightly wider

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
  ctx.textAlign = "left";
  ctx.fillText(`${clubName} Quota Progress`, padding, y + titleH / 2);

  y += titleH;

  const xRank = padding;
  const xMove = xRank + rankColW + gap;
  const xName = xMove + moveColW + gap;

  const xBar = xName + nameMaxW + gap;

  const xPct = xBar + barW + 8 * SCALE; // 👈 % goes right of bar

  const xQuota = xPct + 55 * SCALE + 18 * SCALE; // 👈 pushed right
  const xTotalFans = xQuota + quotaW + gap + 10 * SCALE;

  /* header */
  ctx.font = `${11 * SCALE}px system-ui`;
  ctx.fillStyle = COLORS.grey;

  const headerY = y + headerRowH / 2;
  ctx.textAlign = "left";

  ctx.fillText("RANK", xRank, headerY);
  ctx.fillText("", xMove, headerY);
  ctx.fillText("PLAYER", xName, headerY);
  ctx.fillText("PROGRESS", xBar, headerY);
  ctx.fillText("", xPct, headerY);
  ctx.fillText("QUOTA", xQuota, headerY);
  ctx.fillText("TOTAL FANS", xTotalFans, headerY);

  y += headerRowH + lineH;

  for (let i = 0; i < list.length; i++) {
    const player = list[i];
    const { name } = cleanNameAndRole(player);

    const stats = player.stats || {};
    const monthlyGain = parseNumber(stats.monthly_gain || "0");

    const quotaValue = goalMetric > 0 ? (monthlyGain / goalMetric) * 100 : 0;

    const totalFansRaw =
      parseNumber(stats.total_fans ?? stats.fans ?? stats.all_time ?? 0);

    const rowTop = y + i * rowH;
    const cy = rowTop + rowH / 2;

    ctx.fillStyle = i % 2 === 0 ? COLORS.rowAlt : COLORS.bg;
    ctx.fillRect(0, rowTop, WIDTH, rowH);

    ctx.textAlign = "left";

    ctx.font = `bold ${13 * SCALE}px system-ui`;
    ctx.fillStyle = i < 3 ? COLORS.gold : COLORS.rankMuted;
    ctx.fillText(`#${i + 1}`, xRank, cy);

    const move = getMovement(name, i + 1, previousRanks);
    ctx.fillStyle = move.color;
    ctx.fillText(move.text, xMove, cy);

    ctx.fillStyle = COLORS.white;
    ctx.font = `${13 * SCALE}px system-ui`;
    ctx.fillText(name, xName, cy);

    /* progress bar */
    const barY = rowTop + (rowH - 14 * SCALE) / 2;

    ctx.fillStyle = COLORS.barBg;
    ctx.beginPath();
    ctx.roundRect(xBar, barY, barW, 14 * SCALE, 7 * SCALE);
    ctx.fill();

    ctx.fillStyle =
      quotaValue >= 100
        ? COLORS.green
        : quotaValue >= 30
        ? COLORS.blue
        : COLORS.red;

    ctx.beginPath();
    ctx.roundRect(
      xBar,
      barY,
      barW * Math.min(1, quotaValue / 100),
      14 * SCALE,
      7 * SCALE
    );
    ctx.fill();

    /* ✅ RESTORED % LABEL */
    ctx.fillStyle = COLORS.grey;
    ctx.font = `bold ${11 * SCALE}px system-ui`;
    ctx.fillText(`${Math.round(quotaValue)}%`, xPct, cy);

    /* quota */
    ctx.font = `bold ${13 * SCALE}px system-ui`;

    const quotaLeft = toMillions(monthlyGain);
    const quotaRight = toMillions(goalMetric);

    ctx.fillStyle = COLORS.white;
    ctx.fillText(quotaLeft, xQuota, cy);

    ctx.fillStyle = COLORS.grey;
    ctx.fillText(
      `/${quotaRight}`,
      xQuota + ctx.measureText(quotaLeft).width + 6 * SCALE,
      cy
    );

    /* total fans */
    ctx.fillStyle = COLORS.white;
    ctx.font = `${13 * SCALE}px system-ui`;
    ctx.fillText(toRoundedMillions(totalFansRaw), xTotalFans, cy);
  }

  return canvas.toBuffer("image/png");
}

module.exports = { renderQuotaLeaderboardPng };
