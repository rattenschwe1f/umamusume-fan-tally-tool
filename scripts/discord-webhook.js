const fs = require("fs");
const path = require("path");
require("dotenv").config();

const { renderQuotaLeaderboardPng } = require("./leaderboard-image");

const statsPath = path.resolve(process.cwd(), "stats.json");
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
   CLEAN PLAYER DATA
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

/* -----------------------------
   BUILD MESSAGE + IMAGE
------------------------------*/

function collectPlayers(data) {
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

  return players;
}

function buildDiscordSendPayload(data, imageBuffer) {
  const players = collectPlayers(data);

  return {
    embeds: [
      {
        image: { url: `attachment://${ATTACHMENT_FILENAME}` },
      },
    ],
    imageBuffer,
    meta: {
      playerCount: players.length,
      attachmentFilename: ATTACHMENT_FILENAME,
    },
  };
}

function buildSendPackage(data) {
  const goalMetric = getGoalMetric();
  const players = collectPlayers(data);
  const imageBuffer = renderQuotaLeaderboardPng({
    players,
    goalMetric,
    clubName: getClubName(),
  });
  return buildDiscordSendPayload(data, imageBuffer);
}

/* -----------------------------
   SEND WEBHOOK
------------------------------*/

async function sendWebhookMultipart(payload) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) throw new Error("Missing DISCORD_WEBHOOK_URL");

  const { embeds, imageBuffer } = payload;
  const form = new FormData();
  form.append("payload_json", JSON.stringify({ embeds }));
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
    throw new Error(`Discord webhook failed: ${res.status} ${await res.text()}`);
  }
}

/* -----------------------------
   MAIN
------------------------------*/

async function main() {
  if (!fs.existsSync(statsPath)) {
    console.error("❌ stats.json not found");
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(statsPath, "utf8"));
  const pkg = buildSendPackage(data);

  if (process.argv.includes("--dry-run")) {
    const previewPath = path.resolve(process.cwd(), "quota-progress.preview.png");
    fs.writeFileSync(previewPath, pkg.imageBuffer);

    const jsonSafe = {
      embeds: pkg.embeds,
      meta: {
        ...pkg.meta,
        imagePreviewPath: previewPath,
        note: "Real send uses multipart/form-data with this PNG as files[0]. No message text.",
      },
    };
    fs.writeFileSync(
      path.resolve(process.cwd(), "discord-payload.preview.json"),
      JSON.stringify(jsonSafe, null, 2)
    );
    console.log("✅ Dry run complete (PNG + JSON preview written)");
    return;
  }

  await sendWebhookMultipart(pkg);

  console.log(
    `✅ ${getClubName()} stats successfully sent at ${new Date().toISOString()}`
  );
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
