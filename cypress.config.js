const { defineConfig } = require("cypress");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

module.exports = defineConfig({
  allowCypressEnv: false,
  pageLoadTimeout: 180000,

  e2e: {
    setupNodeEvents(on, config) {
      on("task", {
        getClubId() {
          return process.env.CLUB_ID;
        },
        writeStatsFile({ players }) {
          const outputPath = path.resolve(__dirname, "stats.json");
          const payload = {
            generatedAt: new Date().toISOString(),
            count: Array.isArray(players) ? players.length : 0,
            players: Array.isArray(players) ? players : [],
          };

          fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));

          return {
            ok: true,
            path: outputPath,
            count: payload.count,
          };
        },
      });

      return config;
    },
  },
});
