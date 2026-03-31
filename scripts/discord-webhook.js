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

function resolveGoalMetric() {
  const raw = process.env.GOAL_METRIC;
  if (!raw) return 0;
  const goal = Number(raw);
  if (!Number.isFinite(goal)) {
    throw new Error("GOAL_METRIC must be a valid number");
  }
  return goal;
}

function cleanNameAndRole(player) {
  let name = (player.name || "").trim();
  let role = (player.role || "").trim();

  if (!role) {
    if (/leader$/i.test(name)) role = "LEADER";
    else if (/member$/i.test(name)) role = "MEMBER";
    else if (/left$/i.test(name)) role = "LEFT";
  }

  name = name.replace(/(Leader|Member|Left)+$/i, "").trim();
  return { name, role: role || "UNKNOWN" };
}

function formatPlayerLine(player, goalMetric) {
  const { name, role } = cleanNameAndRole(player);
  const stats = player.stats || {};
  const rank = player.rank || "#?";
  const dailyRaw = parseNumber(stats.daily_gain || "0");
  const avg7Raw = parseNumber(stats["7_day_avg"] || "0");
  const daily = dailyRaw > 0 ? formatNumber(dailyRaw) : "N/A";
  const avg7 = avg7Raw > 0 ? formatNumber(avg7Raw) : "N/A";
  const total = stats.total_fans || "N/A";
  const monthlyGainRaw = stats.monthly_gain || "0";
  const monthlyGain = parseNumber(monthlyGainRaw);
  const requiredToGoal = Math.max(goalMetric - monthlyGain, 0);
  const goalStatus =
    requiredToGoal === 0 ? "SAFE" : `${formatNumber(requiredToGoal)} required`;
  const weeklyTotalRaw = parseNumber(stats.weekly_total || "0");
  const weeklyTotal =
    weeklyTotalRaw > 0
      ? formatNumber(weeklyTotalRaw)
      : avg7Raw > 0
        ? formatNumber(avg7Raw * 7)
        : "N/A";
  const inactiveLabel = player.inactive ? " - INACTIVE" : "";
  const roleLabel = role && role !== "UNKNOWN" ? ` (${role})` : "";
  return {
    name: `${rank} ${name}${roleLabel}${inactiveLabel}`.slice(0, 256),
    value:
      `Latest Day Gain: ${daily}\nAvg Daily Gain: ${avg7}\nWeekly Total: ${weeklyTotal}\nGoal: ${goalStatus}\nTotal Fans: ${total}`.slice(
        0,
        1024
      ),
    inline: true,
  };
}

function buildDiscordPayload(data) {
  const goalMetric = resolveGoalMetric();
  const players = Array.isArray(data.players) ? [...data.players] : [];

  players.sort((a, b) => {
    const rankA = parseNumber(a.rank);
    const rankB = parseNumber(b.rank);
    return rankA - rankB;
  });

  const lines = players.map((player) => formatPlayerLine(player, goalMetric));
  const chunks = [];
  for (let i = 0; i < lines.length; i += 25) {
    chunks.push(lines.slice(i, i + 25));
  }

  const generatedAt = data.generatedAt
    ? new Date(data.generatedAt).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const dateRef = new Date(data.generatedAt || Date.now());
  const year = dateRef.getUTCFullYear();
  const month = dateRef.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const dailyRequirement = goalMetric > 0 ? Math.ceil(goalMetric / daysInMonth) : 0;
  const meetingGoalCount = players.filter(
    (player) => parseNumber(player.stats?.monthly_gain || "0") >= goalMetric
  ).length;
  const belowGoalCount = players.length - meetingGoalCount;
  const inactiveCount = players.filter((player) => player.inactive).length;
  const topDaily = [...players]
    .sort((a, b) => parseNumber(b.stats?.daily_gain) - parseNumber(a.stats?.daily_gain))
    .slice(0, 3)
    .map((p) => {
      const { name } = cleanNameAndRole(p);
      return `${p.rank || "#?"} ${name} (${p.stats?.daily_gain || "N/A"})`;
    })
    .join(" | ");

  const embeds = chunks.map((fields, idx) => ({
    title:
      idx === 0
        ? "Club Stats (Rank Board)"
        : `Club Stats (cont. ${idx + 1})`,
    description:
      idx === 0
        ? `Statistics as of ${generatedAt}\nDaily Requirement: ${formatNumber(dailyRequirement)}\nMeeting Goal: ${meetingGoalCount}/${players.length}\nBelow Goal: ${belowGoalCount}/${players.length}\nInactive Members: ${inactiveCount}\nTop Daily Gain: ${topDaily || "N/A"}`
        : undefined,
    color: 0x1f8b4c,
    fields,
    timestamp: new Date().toISOString(),
  }));

  return {
    username: "Uma Fan Tracker",
    content: `Club stats update for ${generatedAt}`,
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
    throw new Error(`stats.json not found at ${statsPath}`);
  }

  const raw = fs.readFileSync(statsPath, "utf8");
  const data = JSON.parse(raw);
  const payload = buildDiscordPayload(data);

  if (process.argv.includes("--dry-run")) {
    const outPath = path.resolve(process.cwd(), "discord-payload.preview.json");
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
    process.stdout.write(`Preview written to ${outPath}\n`);
    return;
  }

  await sendWebhook(payload);
  process.stdout.write("Discord webhook sent successfully.\n");
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
