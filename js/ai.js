'use strict';

// ─── Simple AI for the opponent ──────────────────────────────────────
class AI {
  /**
   * Spend `budget` coins and return an array of placement decisions:
   * [{ typeKey, col, row }, ...]
   *
   * Strategy: mix of unit types, placed in the AI zone (rows 0-5).
   * Heavier units toward the back (row 0), fast units toward the front (row 4-5).
   */
  static buildArmy(budget) {
    const placements = [];
    const usedCells  = new Set();

    // Occupied tower cell – never place here
    usedCells.add(`${P2_TOWER.col},${P2_TOWER.row}`);

    // Helper – pick a random free cell in the AI zone
    function randomCell(preferRows) {
      const rows = preferRows || [P2_ROWS.start, P2_ROWS.start + 1,
                                  P2_ROWS.start + 2, P2_ROWS.start + 3,
                                  P2_ROWS.start + 4, P2_ROWS.end];
      for (let attempt = 0; attempt < 200; attempt++) {
        const row = rows[Math.floor(Math.random() * rows.length)];
        const col = Math.floor(Math.random() * GRID_COLS);
        const key = `${col},${row}`;
        if (!usedCells.has(key)) {
          usedCells.add(key);
          return { col, row };
        }
      }
      return null;  // field is full
    }

    let remaining = budget;

    // ── Phase 1: always buy at least one Tank if affordable ──────────
    if (remaining >= UNIT_DEFS.tank.cost) {
      const cell = randomCell([P2_ROWS.start, P2_ROWS.start + 1]);
      if (cell) {
        placements.push({ typeKey: 'tank', ...cell });
        remaining -= UNIT_DEFS.tank.cost;
      }
    }

    // ── Phase 2: spend remainder on a weighted random mix ────────────
    // weights: grunt 40 %, ranger 30 %, speeder 20 %, tank 10 %
    const weights = [
      { key: 'grunt',   w: 40, preferRows: [4, 5] },
      { key: 'ranger',  w: 30, preferRows: [1, 2] },
      { key: 'speeder', w: 20, preferRows: [3, 4, 5] },
      { key: 'tank',    w: 10, preferRows: [0, 1] },
    ];

    let safetyLimit = 60;
    while (remaining > 0 && safetyLimit-- > 0) {
      // Pick affordable unit types
      const affordable = weights.filter(w => UNIT_DEFS[w.key].cost <= remaining);
      if (affordable.length === 0) break;

      // Weighted pick
      const totalW = affordable.reduce((s, e) => s + e.w, 0);
      let r = Math.random() * totalW;
      let chosen = affordable[0];
      for (const entry of affordable) {
        r -= entry.w;
        if (r <= 0) { chosen = entry; break; }
      }

      const cell = randomCell(chosen.preferRows);
      if (!cell) break;

      placements.push({ typeKey: chosen.key, ...cell });
      remaining -= UNIT_DEFS[chosen.key].cost;
    }

    return placements;
  }
}
