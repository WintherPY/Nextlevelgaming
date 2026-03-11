'use strict';

// ─── AI for the opponent ─────────────────────────────────────────────
class AI {
  /**
   * Spend `budget` coins and return an array of placement decisions:
   * [{ typeKey, col, row }, ...]
   *
   * difficulty: 'easy' | 'medium' | 'hard'
   *   easy   – only basic units, uses 60% of budget
   *   medium – balanced mix (original behaviour)
   *   hard   – heavy units, spends full budget, favours artillery/tanks
   */
  static buildArmy(budget, difficulty = 'medium') {
    const placements = [];
    const usedCells  = new Set();

    // Occupied tower cell – never place here
    usedCells.add(`${P2_TOWER.col},${P2_TOWER.row}`);

    // Helper – pick a random free cell in the AI zone
    function randomCell(preferRows) {
      const rows = preferRows || [0, 1, 2, 3, 4, 5];
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

    // Easy uses only part of the budget
    let remaining = difficulty === 'easy' ? Math.floor(budget * 0.6) : budget;

    // ── Phase 1: guaranteed anchor unit ─────────────────────────────
    if (difficulty === 'hard' && remaining >= UNIT_DEFS.artillery.cost) {
      const cell = randomCell([0, 1]);
      if (cell) {
        placements.push({ typeKey: 'artillery', ...cell });
        remaining -= UNIT_DEFS.artillery.cost;
      }
    } else if (difficulty === 'medium' && remaining >= UNIT_DEFS.tank.cost) {
      const cell = randomCell([P2_ROWS.start, P2_ROWS.start + 1]);
      if (cell) {
        placements.push({ typeKey: 'tank', ...cell });
        remaining -= UNIT_DEFS.tank.cost;
      }
    }

    // ── Phase 2: weighted random fill ────────────────────────────────
    const weights =
      difficulty === 'easy'
        ? [
            { key: 'grunt',   w: 70, preferRows: [4, 5] },
            { key: 'speeder', w: 30, preferRows: [3, 4, 5] },
          ]
        : difficulty === 'hard'
        ? [
            { key: 'tank',      w: 25, preferRows: [0, 1] },
            { key: 'artillery', w: 20, preferRows: [0, 1] },
            { key: 'sniper',    w: 20, preferRows: [1, 2] },
            { key: 'ranger',    w: 20, preferRows: [1, 2] },
            { key: 'speeder',   w: 15, preferRows: [3, 4, 5] },
          ]
        : /* medium */ [
            { key: 'grunt',   w: 40, preferRows: [4, 5] },
            { key: 'ranger',  w: 30, preferRows: [1, 2] },
            { key: 'speeder', w: 20, preferRows: [3, 4, 5] },
            { key: 'tank',    w: 10, preferRows: [0, 1] },
          ];

    let safetyLimit = 80;
    while (remaining > 0 && safetyLimit-- > 0) {
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