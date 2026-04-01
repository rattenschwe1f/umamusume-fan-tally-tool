# Uma Circle Stats Discord Tracker

A simple automated tracker that sends daily club statistics from uma.moe to a Discord channel.

### Features
- Daily club rank board showing: **Daily gain**, **7-day average**, **Monthly gain**, and **Goal progress**
- Fully customizable **monthly goal** (`GOAL_METRIC`)
- Custom **webhook name** so the bot appears with your preferred name in Discord
- Automatically removes players that left the club

---

## Setup Guide

### 1. Create Your Own Repository

You need a **GitHub account** to use this template.

1. Go to this repository.
2. Click the green **"Use this template"** button (top right).
3. Select **"Create a new repository"**.
4. **Important:** Set the repository to **Private** (bad actors could hijack your embed otherwise).
5. Give it a name and click **"Create repository"**.

### 2. Configure Your Settings

Fill in the values in the `.env` file with your information:

```env
# === REQUIRED SETTINGS ===

# Your Club ID – the funny lil numbers that appear behind https://uma.moe/circles/
# Example: if the URL is https://uma.moe/circles/987654321 → put 987654321 here
CLUB_ID=

# The number of fans you want to gain for the month (example: 50000000 for 50 million)
GOAL_METRIC=

# Discord Webhook URL (click "Copy Webhook URL" when creating the webhook in your Discord server)
DISCORD_WEBHOOK_URL=

# === DISPLAY SETTINGS ===

# The name the "account" sending the messages in your server will have
WEBHOOK_NAME=

# Your club name (used in messages and embed titles)
CLUB_NAME=

This is just a sloppy solution that works well enough that i made for my club and then decided to open it up for the wider Uma community — feel free to improve it!
If you do make improvements, please notify me (Discord: rattenschweif). I'd love to see what you come up with.
