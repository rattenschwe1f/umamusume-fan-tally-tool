const fs = require("fs");
const path = require("path");
require("dotenv").config();

const statsPath = path.resolve(process.cwd(), "stats.json");

function parseNumber(value) {
  if (!value) return 0;
  const cleaned = String(value).replace(/[^0-9-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "0";
  return Math.round(value).toLocaleString();
}

function getClubName() {
  return (process.env.CLUB_NAME || "Club").trim();
}

function getWebhookName() {
  return (process.env.WEBHOOK_NAME || "Club Stats").trim();
}

function getGoalReachedEmote() {
  const emote = (process.env.GOAL_REACHED_EMOTE || "").trim();
  return emote || ":white_check_mark:";
}

// Fixed: Now properly allows GOAL_METRIC=0 for testing
function getGoalMetric() {
  const metric = parseNumber(process.env.GOAL_METRIC);
  return metric >= 0 ? metric : 50000000;  // fallback only on negative/invalid values
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

function formatPlayerLine(player) {
  const { name } = cleanNameAndRole(player);
  const stats = player.stats || {};
  const rank = player.rank || "#?";
  const dailyRaw = parseNumber(stats.daily_gain || "0");
  const monthlyGainRaw = parseNumber(stats.monthly_gain || "0");

  const dailyFormatted = formatNumber(dailyRaw);
  const monthlyGain = formatNumber(monthlyGainRaw);

  const goalReachedEmote = getGoalReachedEmote();
  const goalMetric = getGoalMetric();
  const dailyQuota = Math.round(goalMetric / 30);

  // Dynamic Quota based on current day of the month
  const now = new Date();
  const currentDay = now.getDate();
  const currentQuotaTarget = Math.round(dailyQuota * currentDay);

  // Dynamic Quota (day target)
  const quotaStatus = monthlyGainRaw >= currentQuotaTarget
    ? goalReachedEmote
    : `${formatNumber(currentQuotaTarget - monthlyGainRaw)} required`;

  // Final Quota (full monthly goal)
  const finalQuotaStatus = monthlyGainRaw >= goalMetric
    ? goalReachedEmote
    : `${formatNumber(goalMetric - monthlyGainRaw)} required`;

  return {
    name: `${rank} ${name}`.slice(0, 256),
    value: `Daily: ${dailyFormatted}\nMonthly: ${monthlyGain}\nQuota: ${quotaStatus}\nFinal Quota: ${finalQuotaStatus}`,
    inline: true,
  };
}

function buildDiscordPayload(data) {
  const webhookName = getWebhookName();
  const clubName = getClubName();
  const goalMetric = getGoalMetric();
  const dailyQuota = Math.round(goalMetric / 30);

  let players = Array.isArray(data.players) ? [...data.players] : [];
  
  // Remove LEFT players
  players = players.filter((player) => {
    const { role } = cleanNameAndRole(player);
    return role !== "LEFT";
  });

  // Sort by monthly gain DESCENDING
  players.sort((a, b) => {
    const gainA = parseNumber(a.stats?.monthly_gain || "0");
    const gainB = parseNumber(b.stats?.monthly_gain || "0");
    return gainB - gainA;
  });

  const dateRef = new Date(data.generatedAt || Date.now());
  const generatedAt = dateRef.toISOString().slice(0, 10);

  const lines = players.map((player) => formatPlayerLine(player));

  const chunks = [];
  for (let i = 0; i < lines.length; i += 25) {
    chunks.push(lines.slice(i, i + 25));
  }

  const totalPlayers = players.length;
  const meetingQuotaCount = players.filter(
    (player) => parseNumber(player.stats?.monthly_gain || "0") >= goalMetric
  ).length;
  const belowQuotaCount = totalPlayers - meetingQuotaCount;

  const topDaily = [...players]
    .sort((a, b) => parseNumber(b.stats?.daily_gain) - parseNumber(a.stats?.daily_gain))
    .slice(0, 3)
    .map((p) => {
      const { name } = cleanNameAndRole(p);
      return `${p.rank || "#?"} ${name} (${formatNumber(p.stats?.daily_gain || "0")})`;
    })
    .join(" | ");

  const embeds = chunks.map((fields, idx) => ({
    title: idx === 0
      ? `${clubName} Stats (Ranked by Monthly Gain)`
      : `${clubName} Stats (cont. ${idx + 1})`,
    description: idx === 0
      ? `Statistics as of ${generatedAt}\n` +
        `Monthly Quota: ${formatNumber(goalMetric)}\n` +
        `Daily Quota: ${formatNumber(dailyQuota)}\n` +
        `Meeting Quota: ${meetingQuotaCount}/${totalPlayers}\n` +
        `Below Quota: ${belowQuotaCount}/${totalPlayers}\n` +
        `Top Daily Gain: ${topDaily || "N/A"}`
      : undefined,
    color: 0x1f8b4c,
    fields,
    timestamp: new Date().toISOString(),
  }));

  return {
    username: webhookName,
    content: `${clubName} stats update for ${generatedAt}`,
    embeds,
  };
}

async function sendWebhook(payload) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error("Missing DISCORD_WEBHOOK_URL environment variable");
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord webhook failed: ${response.status} ${text}`);
  }
}

async function main() {
  if (!fs.existsSync(statsPath)) {
    console.error(`❌ stats.json not found at ${statsPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(statsPath, "utf8");
  const data = JSON.parse(raw);

  const payload = buildDiscordPayload(data);

  if (process.argv.includes("--dry-run")) {
    const outPath = path.resolve(process.cwd(), "discord-payload.preview.json");
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
    console.log(`✅ Preview written to ${outPath}`);
    return;
  }

  await sendWebhook(payload);
  console.log(`✅ ${getClubName()} stats successfully sent to Discord at ${new Date().toISOString()}`);
}

main().catch((error) => {
  console.error("❌ Error:", error.message);
  process.exit(1);
});
