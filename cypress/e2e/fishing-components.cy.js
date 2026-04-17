describe("collect rank card stats", () => {
  const cardSelector = ".member-card";
  const scrollStepPx = 120;
  const scrollDelayMs = 250;
  const maxNoProgressIterations = 12;
  const maxIterations = 500;
  const overlayDismissSelector =
    ".dismiss-btn, button, [role='button'], .modal button";

  function normalizeKey(label) {
    return label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function parseCard(card) {
    const headerText = card
      .querySelector(".member-header")
      ?.textContent?.replace(/\s+/g, " ")
      .trim() || "";

    const rankMatch = headerText.match(/#\d+/);
    const rank = rankMatch ? rankMatch[0] : "";

    let role = "";
    const roleNode =
      card.querySelector(".member-badge") || card.querySelector(".member-role");
    if (roleNode) {
      role = roleNode.textContent?.trim() || "";
    } else {
      const roleFromHeader = headerText.match(/\b(LEADER|MEMBER|LAST)\b/i);
      role = roleFromHeader ? roleFromHeader[1].toUpperCase() : "";
    }

    const cleanHeader = headerText
      .replace(rank, "")
      .replace(role, "")
      .replace(/\s+/g, " ")
      .trim();
    const name = cleanHeader;

    const stats = {};
    const rows = card.querySelectorAll(".member-stats > div");
    rows.forEach((row) => {
      const keyNode = row.children[0];
      const valueNode = row.children[1];
      if (!keyNode || !valueNode) {
        return;
      }
      const label = keyNode.textContent?.trim() || "";
      const value = valueNode.textContent?.trim() || "";
      if (!label) {
        return;
      }
      stats[normalizeKey(label)] = value;
    });

    return {
      rank,
      name,
      role,
      stats,
      inactive: card.classList.contains("inactive"),
      capturedAt: new Date().toISOString(),
    };
  }

  function collectVisibleCards(existingPlayers) {
    return cy.document().then((doc) => {
      const cards = Array.from(doc.querySelectorAll(cardSelector));
      cards.forEach((card) => {
        const parsed = parseCard(card);
        if (!parsed.rank || !parsed.name) {
          return;
        }
        const dedupeKey = `${parsed.rank}|${parsed.name}`;
        existingPlayers.set(dedupeKey, parsed);
      });
      return existingPlayers;
    });
  }

  function dismissBlockingPopups() {
    return cy.get("body").then(($body) => {
      const dismissCandidates = Array.from(
        $body[0].querySelectorAll(overlayDismissSelector)
      ).filter((el) => {
        const text = (el.textContent || "").trim();
        const className = el.className || "";
        return /dismiss/i.test(text) || /dismiss/i.test(String(className));
      });

      if (dismissCandidates.length === 0) {
        return null;
      }

      return cy.wrap(dismissCandidates[0]).click({ force: true }).wait(300);
    });
  }

  function slowScrollAndCollect(playersMap, state = { lastY: -1, stagnant: 0, iterations: 0 }) {
    return collectVisibleCards(playersMap).then(() => {
      return cy.window().then((win) => {
        const currentY = Math.round(win.scrollY);
        const nextState = { ...state };

        if (currentY === state.lastY) {
          nextState.stagnant += 1;
        } else {
          nextState.stagnant = 0;
        }

        nextState.lastY = currentY;
        nextState.iterations += 1;

        const hitIterationLimit = nextState.iterations >= maxIterations;
        const endReached = nextState.stagnant >= maxNoProgressIterations;
        if (hitIterationLimit || endReached) {
          return playersMap;
        }

        const nextY = currentY + scrollStepPx;
        return cy
          .window()
          .then((windowRef) => {
            windowRef.scrollTo(0, nextY);
          })
          .wait(scrollDelayMs)
          .then(() => dismissBlockingPopups())
          .then(() => slowScrollAndCollect(playersMap, nextState));
      });
    });
  }

  it("scrolls slowly and saves all rank card stats", () => {
    const playersMap = new Map();
    cy.task("getClubId").then((clubIdRaw) => {
      expect(clubIdRaw, "CLUB_ID env var is required").to.not.equal(undefined);
      expect(
        ["string", "number"],
        "CLUB_ID env var type"
      ).to.include(typeof clubIdRaw);
      const clubId = String(clubIdRaw).trim();
      expect(clubId, "CLUB_ID env var").to.not.equal("");
      const targetUrl = `https://uma.moe/circles/${clubId}`;

      cy.visit(targetUrl);
      dismissBlockingPopups();
      dismissBlockingPopups();

      cy.wait(1500);
      cy.get(cardSelector, { timeout: 20000 }).should("have.length.greaterThan", 0);

      return slowScrollAndCollect(playersMap).then((collected) => {
        const players = Array.from(collected.values()).sort((a, b) => {
          const aRank = Number(a.rank.replace("#", "")) || Number.MAX_SAFE_INTEGER;
          const bRank = Number(b.rank.replace("#", "")) || Number.MAX_SAFE_INTEGER;
          return aRank - bRank;
        });

        return cy.task("writeStatsFile", { players }).then((result) => {
          expect(result.ok).to.equal(true);
          expect(result.count).to.equal(players.length);
        });
      });
    });
  });
});
