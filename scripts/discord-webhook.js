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

function progressBar(percentage) {
  const clamped = Math.min(Math.max(percentage, 0), 100);
  const filled = Math.round(clamped / 10);
  const bar = "█".repeat(filled) + "░".repeat(10 - filled);
  return `${bar} ${Math.floor(percentage)}%`;
}

function getClubName() {
  return (process.env.CLUB_NAME || "Club").trim();
}

function getWebhookName() {
  return (process.env.WEBHOOK_NAME || "Club Stats").trim();
}

function getGoalMetric() {
  const metric = parseNumber(process.env.GOAL_METRIC);
  return metric >= 0 ? metric : 50000000;
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

  const goalMetric = getGoalMetric();

  // Current Quota (pro-rated using monthly gain)
  const now = new Date();
  const currentDay = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  
  const dailyAverage = Math.round(goalMetric / daysInMonth);
  const currentQuotaTarget = Math.round(dailyAverage * currentDay);
  const currentProgress = currentQuotaTarget > 0 ? (monthlyGainRaw / currentQuotaTarget) * 100 : 0;
  const currentQuotaRemaining = Math.max(currentQuotaTarget - monthlyGainRaw, 0);

  // Monthly Quota
  const monthlyProgress = goalMetric > 0 ? (monthlyGainRaw / goalMetric) * 100 : 0;
  const monthlyRemaining = Math.max(goalMetric - monthlyGainRaw, 0);

  // Custom remaining text
  let currentRemainingText = "";
  if (currentProgress >= 200) {
    currentRemainingText = "great job :crown:";
  } else if (currentProgress >= 100) {
    currentRemainingText = "good job o7";
  } else if (currentQuotaRemaining > 0) {
    currentRemainingText = `${formatNumber(currentQuotaRemaining)} remaining`;
  }

  let monthlyRemainingText = "";
  if (monthlyProgress >= 200) {
    monthlyRemainingText = "great job :crown:";
  } else if (monthlyProgress >= 100) {
    monthlyRemainingText = "good job o7";
  } else if (monthlyRemaining > 0) {
    monthlyRemainingText = `${formatNumber(monthlyRemaining)} remaining`;
  }

  return {
    name: `${rank} ${name}`.slice(0, 256),
    value: `Current Quota:\n${progressBar(currentProgress)}\n${currentRemainingText}\n\nMonthly Quota:\n${progressBar(monthlyProgress)}\n${monthlyRemainingText}\n────────────`,
    inline: true,
  };
}

function buildDiscordPayload(data) {
  const webhookName = getWebhookName();
  const clubName = getClubName();
  const goalMetric = getGoalMetric();

  let players = Array.isArray(data.players) ? [...data.players] : [];

  players = players.filter((player) => {
    const { role } = cleanNameAndRole(player);
    return role !== "LEFT";
  });

  players.sort((a, b) => {
    const gainA = parseNumber(a.stats?.monthly_gain || "0");
    const gainB = parseNumber(b.stats?.monthly_gain || "0");
    return gainB - gainA;
  });

  const dateRef = new Date(data.generatedAt || Date.now());
  const generatedAt = dateRef.toISOString().slice(0, 10);

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dailyQuota = Math.round(goalMetric / daysInMonth);

  const lines = players.map((player) => formatPlayerLine(player));

  const chunks = [];
  for (let i = 0; i < lines.length; i += 24) {
    chunks.push(lines.slice(i, i + 24));
  }

  const totalPlayers = players.length;
  const meetingGoalCount = players.filter(
    (player) => parseNumber(player.stats?.monthly_gain || "0") >= goalMetric
  ).length;
  const belowGoalCount = totalPlayers - meetingGoalCount;

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
      ? `Statistics as of ${generatedAt}\nMonthly Quota: ${formatNumber(goalMetric)}\nDaily Quota: ${formatNumber(dailyQuota)}\nTop Daily Gain: ${topDaily || "N/A"}`
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
