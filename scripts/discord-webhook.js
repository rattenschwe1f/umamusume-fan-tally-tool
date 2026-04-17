const fs = require("fs");
const path = require("path");
require("dotenv").config();

const { renderQuotaLeaderboardPng } = require("./leaderboard-image");

const statsPath = path.resolve(process.cwd(), "stats.json");
const historyPath = path.resolve(process.cwd(), "rank-history.json");
const ATTACHMENT_FILENAME = "quota-progress.png";

/* -----------------------------
   HELPERS
------------------------------*/

function parseNumber(value) {
  if (!value) return 0;
  const cleaned = String(value).replace(/[^0-9-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getClubName() {
  return (process.env.CLUB_NAME || "Club").trim();
}

function getGoalMetric() {
  const metric = parseNumber(process.env.GOAL_METRIC);
  return metric >= 0 ? metric : 50000000;
}

/* -----------------------------
   CLEAN DATA
------------------------------*/

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

function collectPlayers(data) {
  let players = Array.isArray(data.players) ? [...data.players] : [];
  players = players.filter((p) => cleanNameAndRole(p).role !== "LEFT");

  players.sort((a, b) => {
    const aGain = parseNumber(a.stats?.monthly_gain || "0");
    const bGain = parseNumber(b.stats?.monthly_gain || "0");
    return bGain - aGain;
  });

  return players;
}

/* -----------------------------
   HISTORY
------------------------------*/

function loadHistory() {
  if (!fs.existsSync(historyPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(historyPath, "utf8"));
  } catch {
    return {};
  }
}

function saveHistory(players) {
  const map = {};

  players.forEach((p, i) => {
    const { name } = cleanNameAndRole(p);
    map[name] = i + 1;
  });

  fs.writeFileSync(historyPath, JSON.stringify(map, null, 2));
}

/* -----------------------------
   BUILD
------------------------------*/

function buildPayload(data) {
  const players = collectPlayers(data);

  const imageBuffer = renderQuotaLeaderboardPng({
    players,
    goalMetric: getGoalMetric(),
    clubName: getClubName(),
    previousRanks: loadHistory(),
  });

  return { players, imageBuffer };
}

/* -----------------------------
   WEBHOOK (IMAGE ONLY)
------------------------------*/

async function sendWebhook(imageBuffer) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) throw new Error("Missing DISCORD_WEBHOOK_URL");

  const form = new FormData();

  /* 🚨 no embed, no title, no content */
  form.append("payload_json", JSON.stringify({}));

  form.append(
    "files[0]",
    new Blob([imageBuffer], { type: "image/png" }),
    ATTACHMENT_FILENAME
  );

  const res = await fetch(webhookUrl, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }
}

/* -----------------------------
   MAIN
------------------------------*/

async function main() {
  const data = JSON.parse(fs.readFileSync(statsPath, "utf8"));

  const { players, imageBuffer } = buildPayload(data);

  await sendWebhook(imageBuffer);

  saveHistory(players);

  console.log("✅ Image sent (no embed, no title)");
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
