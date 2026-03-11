'use strict';

// ════════════════════════════════════════════════════════════════════
//  NEXT LEVEL GAMING – Battlefield Command
//  Main game controller
// ════════════════════════════════════════════════════════════════════

class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx    = this.canvas.getContext('2d');

    // Scale canvas to fit window while keeping 1400×820 logical size
    this._resize();
    window.addEventListener('resize', () => this._resize());

    // ── State ──────────────────────────────────────────────────────
    this.state      = STATE.MENU;
    this.mode       = null;   // '1vsAI' | '1vs1'
    this.round      = 1;
    this.difficulty = 'medium';  // 'easy' | 'medium' | 'hard'

    // ── Player data ────────────────────────────────────────────────
    this.coins     = [0, STARTING_COINS, STARTING_COINS];  // index 1 & 2
    this.scores    = [0, 0, 0];  // wins per player; index 1 & 2
    this.matchOver = false;
    this.units     = [];   // live Unit instances
    this.towers    = [];   // two Tower instances

    // ── Placement ─────────────────────────────────────────────────
    this.selectedUnit = null;  // typeKey string
    this.hoverCell    = null;  // { col, row }
    this.placedCells  = new Set();  // 'col,row' strings
    this.prepTimer    = PREP_DURATION;
    this.prepStart    = 0;

    // ── Battle ─────────────────────────────────────────────────────
    this.battleTimer  = 0;
    this.lastTick     = 0;
    this.projectiles  = [];   // visual projectile effects
    this.particles    = [];   // explosion particles

    // ── Results ────────────────────────────────────────────────────
    this.winner = null;   // 1, 2, or 'draw'
    this.winMsg = '';

    // ── UI buttons (populated during render, hit-tested on click) ──
    this.buttons = [];

    // ── Input ──────────────────────────────────────────────────────
    this.mouseX = 0;
    this.mouseY = 0;

    this.canvas.addEventListener('mousemove', e => this._onMouseMove(e));
    this.canvas.addEventListener('click',     e => this._onClick(e));
    this.canvas.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (this.selectedUnit !== null) {
        this.selectedUnit = null;  // deselect
      } else if (this.state === STATE.PREP_P1 || this.state === STATE.PREP_P2) {
        const pos  = this._canvasPos(e);
        const cell = this._screenToGrid(pos.x, pos.y);
        if (cell) this._trySell(cell.col, cell.row);
      }
    });

    // Start loop
    requestAnimationFrame(ts => this._loop(ts));
  }

  // ─────────────────────────────────────────────────────────────────
  //  RESIZE
  // ─────────────────────────────────────────────────────────────────
  _resize() {
    const scaleX = window.innerWidth  / CANVAS_W;
    const scaleY = window.innerHeight / CANVAS_H;
    const scale  = Math.min(scaleX, scaleY);
    this.canvas.width  = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.canvas.style.width  = (CANVAS_W * scale) + 'px';
    this.canvas.style.height = (CANVAS_H * scale) + 'px';
    this._scale = scale;
  }

  // ─────────────────────────────────────────────────────────────────
  //  MAIN LOOP
  // ─────────────────────────────────────────────────────────────────
  _loop(timestamp) {
    const dt = Math.min((timestamp - (this._lastFrame || timestamp)) / 1000, 0.1);
    this._lastFrame = timestamp;

    this._update(dt);
    this._render();

    requestAnimationFrame(ts => this._loop(ts));
  }

  // ─────────────────────────────────────────────────────────────────
  //  UPDATE
  // ─────────────────────────────────────────────────────────────────
  _update(dt) {
    if (this.state === STATE.PREP_P1 || this.state === STATE.PREP_P2) {
      this.prepTimer -= dt;
      if (this.prepTimer <= 0) {
        this._endPrep();
      }
    }

    if (this.state === STATE.BATTLE) {
      this._updateBattle(dt);
    }

    // Decay projectiles & particles
    this.projectiles = this.projectiles.filter(p => {
      p.life -= dt;
      return p.life > 0;
    });
    this.particles = this.particles.filter(p => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 60 * dt;
      return p.life > 0;
    });
  }

  // ─────────────────────────────────────────────────────────────────
  //  BATTLE UPDATE
  // ─────────────────────────────────────────────────────────────────
  _updateBattle(dt) {
    this.battleTimer += dt;

    const allCombatants = [...this.units, ...this.towers];

    for (const unit of allCombatants) {
      if (unit.dead) continue;
      unit.atkTimer    = Math.max(0, unit.atkTimer - dt);
      unit.attackAnim  = Math.max(0, unit.attackAnim - dt);
      unit.hitAnim     = Math.max(0, unit.hitAnim - dt);

      // Towers don't move
      const canMove = !(unit instanceof Tower);

      // Find closest enemy
      const enemy = this._closestEnemy(unit, allCombatants);
      if (!enemy) continue;

      const dist = unit.distTo(enemy);
      if (dist <= unit.range) {
        // In range — attack
        if (unit.atkTimer <= 0) {
          this._doAttack(unit, enemy);
          unit.atkTimer = unit.atkInterval;
        }
      } else if (canMove) {
        // Move toward enemy
        unit.moveToward(enemy.x, enemy.y, dt);
      }
    }

    // Remove dead
    this.units = this.units.filter(u => !u.dead);

    // Check win condition
    this._checkWin();
  }

  _closestEnemy(actor, all) {
    let best = null, bestDist = Infinity;
    for (const other of all) {
      if (other.dead) continue;
      if (other.player === actor.player) continue;
      if (other === actor) continue;
      const d = actor.distTo(other);
      if (d < bestDist) { bestDist = d; best = other; }
    }
    return best;
  }

  _doAttack(attacker, target) {
    target.hp -= attacker.damage;
    attacker.attackAnim = 0.15;
    target.hitAnim      = 0.2;

    // Projectile effect
    this.projectiles.push({
      x1: attacker.x, y1: attacker.y,
      x2: target.x,   y2: target.y,
      color: attacker.color,
      life: 0.12, maxLife: 0.12,
    });

    if (target.hp <= 0) {
      target.hp   = 0;
      target.dead = true;
      this._spawnParticles(target.x, target.y, target.color);
    }
  }

  _spawnParticles(x, y, color) {
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 80;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        life: 0.4 + Math.random() * 0.3,
        size: 2 + Math.random() * 3,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────
  //  WIN CONDITION
  // ─────────────────────────────────────────────────────────────────
  _checkWin() {
    const p1Units = this.units.filter(u => u.player === 1);
    const p2Units = this.units.filter(u => u.player === 2);
    const p1Tower = this.towers.find(t => t.player === 1);
    const p2Tower = this.towers.find(t => t.player === 2);

    const p1HasTroops = p1Units.length > 0;
    const p2HasTroops = p2Units.length > 0;

    if (!p1HasTroops && !p2HasTroops) {
      // Both wiped out simultaneously — draw
      this._endBattle('draw', 'Both sides wiped out — DRAW!');
      return;
    }
    if (!p1HasTroops) {
      this._endBattle(2, 'Player 2 wins! All of Player 1\'s troops were eliminated.');
      return;
    }
    if (!p2HasTroops) {
      const name = this.mode === '1vsAI' ? 'AI' : 'Player 2';
      this._endBattle(1, `Player 1 wins! All of ${name}'s troops were eliminated.`);
      return;
    }

    // Battle timer expired – most troops wins
    if (this.battleTimer >= BATTLE_DURATION) {
      if (p1Units.length > p2Units.length) {
        this._endBattle(1, `Time! Player 1 wins with ${p1Units.length} troops remaining.`);
      } else if (p2Units.length > p1Units.length) {
        const name = this.mode === '1vsAI' ? 'AI' : 'Player 2';
        this._endBattle(2, `Time! ${name} wins with ${p2Units.length} troops remaining.`);
      } else {
        this._endBattle('draw', 'Time! Equal troops remaining — DRAW!');
      }
    }
  }

  _endBattle(winner, msg) {
    this.winner = winner;
    this.winMsg = msg;
    if (winner === 1 || winner === 2) {
      this.scores[winner]++;
      if (this.scores[winner] >= MATCH_WINS) {
        this.matchOver = true;
      }
    }
    this.state = STATE.RESULTS;
  }

  // ─────────────────────────────────────────────────────────────────
  //  STATE TRANSITIONS
  // ─────────────────────────────────────────────────────────────────
  _startGame(mode) {
    this.mode      = mode;
    this.round     = 1;
    this.scores    = [0, 0, 0];
    this.matchOver = false;
    if (mode === '1vsAI') {
      this.state = STATE.DIFF_SELECT;
    } else {
      this._beginPrep();
    }
  }

  _beginPrep() {
    this.coins      = [0, STARTING_COINS, STARTING_COINS];
    this.units      = [];
    this.towers     = [
      new Tower(1, P1_TOWER.col, P1_TOWER.row),
      new Tower(2, P2_TOWER.col, P2_TOWER.row),
    ];
    this.placedCells  = new Set();
    this.placedCells.add(`${P1_TOWER.col},${P1_TOWER.row}`);
    this.placedCells.add(`${P2_TOWER.col},${P2_TOWER.row}`);
    this.selectedUnit = null;
    this.projectiles  = [];
    this.particles    = [];
    this.battleTimer  = 0;

    if (this.mode === '1vsAI') {
      // AI places immediately; only player gets the prep screen
      const aiPlacements = AI.buildArmy(STARTING_COINS, this.difficulty);
      for (const p of aiPlacements) {
        const u = new Unit(p.typeKey, 2, p.col, p.row);
        this.units.push(u);
        this.placedCells.add(`${p.col},${p.row}`);
      }
      this.coins[2] = 0;
      this.prepTimer = PREP_DURATION;
      this.state     = STATE.PREP_P1;
    } else {
      // 1vs1 – Player 1 places first
      this.prepTimer = PREP_DURATION;
      this.state     = STATE.PREP_P1;
    }
  }

  _endPrep() {
    if (this.state === STATE.PREP_P1 && this.mode === '1vs1') {
      // Switch to Player 2's prep
      this.selectedUnit = null;
      this.prepTimer    = PREP_DURATION;
      this.state        = STATE.PREP_P2;
    } else {
      // Start battle
      this.selectedUnit = null;
      this.state        = STATE.BATTLE;
      this.battleTimer  = 0;
    }
  }

  _startBattle() {
    this.selectedUnit = null;
    this.state        = STATE.BATTLE;
    this.battleTimer  = 0;
  }

  _playAgain() {
    if (this.matchOver) {
      // Start a brand-new match
      this.round     = 1;
      this.scores    = [0, 0, 0];
      this.matchOver = false;
    } else {
      this.round++;
    }
    this._beginPrep();
  }

  _goToMenu() {
    this.state = STATE.MENU;
    this.units  = [];
    this.towers = [];
  }

  // ─────────────────────────────────────────────────────────────────
  //  INPUT
  // ─────────────────────────────────────────────────────────────────
  _canvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (CANVAS_W / rect.width),
      y: (e.clientY - rect.top)  * (CANVAS_H / rect.height),
    };
  }

  _onMouseMove(e) {
    const pos = this._canvasPos(e);
    this.mouseX = pos.x;
    this.mouseY = pos.y;
    this.hoverCell = this._screenToGrid(pos.x, pos.y);
  }

  _onClick(e) {
    const pos = this._canvasPos(e);
    const cx = pos.x, cy = pos.y;

    // Hit-test buttons
    for (const btn of this.buttons) {
      if (cx >= btn.x && cx <= btn.x + btn.w &&
          cy >= btn.y && cy <= btn.y + btn.h) {
        btn.action();
        return;
      }
    }

    // Grid click during prep
    if (this.state === STATE.PREP_P1 || this.state === STATE.PREP_P2) {
      const cell = this._screenToGrid(cx, cy);
      if (cell && this.selectedUnit) {
        this._tryPlace(cell.col, cell.row);
      } else if (cell && !this.selectedUnit) {
        // Right-click already handled; left-click with no selection does nothing
      }
    }
  }

  _screenToGrid(sx, sy) {
    const col = Math.floor((sx - GRID_OX) / CELL_W);
    const row = Math.floor((sy - GRID_OY) / CELL_H);
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return null;
    return { col, row };
  }

  _gridToScreen(col, row) {
    return {
      x: GRID_OX + col * CELL_W,
      y: GRID_OY + row * CELL_H,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  //  PLACEMENT
  // ─────────────────────────────────────────────────────────────────
  _currentPlayer() {
    return this.state === STATE.PREP_P1 ? 1 : 2;
  }

  _validZone(player, row) {
    if (player === 1) return row >= P1_ROWS.start && row <= P1_ROWS.end;
    return row >= P2_ROWS.start && row <= P2_ROWS.end;
  }

  _tryPlace(col, row) {
    const player  = this._currentPlayer();
    const typeKey = this.selectedUnit;
    const def     = UNIT_DEFS[typeKey];
    const key     = `${col},${row}`;

    if (!this._validZone(player, row))           return;  // wrong zone
    if (this.placedCells.has(key))               return;  // occupied
    if (this.coins[player] < def.cost)           return;  // can't afford

    this.coins[player] -= def.cost;
    const unit = new Unit(typeKey, player, col, row);
    this.units.push(unit);
    this.placedCells.add(key);
  }

  _trySell(col, row) {
    const player = this._currentPlayer();
    const key    = `${col},${row}`;
    const idx    = this.units.findIndex(u => u.col === col && u.row === row && u.player === player);
    if (idx === -1) return;
    const refund = Math.floor(UNIT_DEFS[this.units[idx].typeKey].cost * SELL_REFUND);
    this.coins[player] += refund;
    this.units.splice(idx, 1);
    this.placedCells.delete(key);
  }

  // ─────────────────────────────────────────────────────────────────
  //  RENDER – main dispatcher
  // ─────────────────────────────────────────────────────────────────
  _render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    this.buttons = [];  // rebuilt each frame

    if (this.state === STATE.MENU)        this._renderMenu();
    else if (this.state === STATE.MODE_SELECT)  this._renderModeSelect();
    else if (this.state === STATE.DIFF_SELECT)  this._renderDiffSelect();
    else if (this.state === STATE.PREP_P1 ||
             this.state === STATE.PREP_P2) this._renderPrep();
    else if (this.state === STATE.BATTLE)  this._renderBattleScreen();
    else if (this.state === STATE.RESULTS) this._renderResults();
  }

  // ─────────────────────────────────────────────────────────────────
  //  RENDER – MENU
  // ─────────────────────────────────────────────────────────────────
  _renderMenu() {
    const ctx = this.ctx;

    // Background
    this._drawBg();
    this._drawGridLines(0.25);

    // Title
    ctx.save();
    ctx.textAlign = 'center';

    // Glowing title
    ctx.font = 'bold 64px "Segoe UI", Arial, sans-serif';
    ctx.shadowColor = C.accent;
    ctx.shadowBlur  = 30;
    ctx.fillStyle   = '#ffffff';
    ctx.fillText('BATTLEFIELD COMMAND', CANVAS_W / 2, 220);

    ctx.font = '22px "Segoe UI", Arial, sans-serif';
    ctx.shadowBlur  = 10;
    ctx.fillStyle   = C.textDim;
    ctx.fillText('A turn-based strategy game', CANVAS_W / 2, 265);

    ctx.shadowBlur = 0;
    ctx.restore();

    // Start Game button
    this._drawButton(
      CANVAS_W / 2 - 130, 340, 260, 60,
      'START GAME',
      () => { this.state = STATE.MODE_SELECT; },
      true
    );

    // Version
    ctx.save();
    ctx.textAlign = 'right';
    ctx.font = '14px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = C.textDim;
    ctx.fillText('v2.0', CANVAS_W - 16, CANVAS_H - 12);
    ctx.restore();
  }

  // ─────────────────────────────────────────────────────────────────
  //  RENDER – MODE SELECT
  // ─────────────────────────────────────────────────────────────────
  _renderModeSelect() {
    const ctx = this.ctx;
    this._drawBg();
    this._drawGridLines(0.2);

    ctx.save();
    ctx.textAlign = 'center';

    ctx.font = 'bold 44px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = C.text;
    ctx.shadowColor = C.accent;
    ctx.shadowBlur  = 20;
    ctx.fillText('SELECT GAME MODE', CANVAS_W / 2, 200);
    ctx.shadowBlur = 0;

    ctx.restore();

    const bw = 280, bh = 80, gap = 40;
    const totalW = bw * 2 + gap;
    const startX = CANVAS_W / 2 - totalW / 2;
    const bY = 290;

    this._drawButton(startX, bY, bw, bh, '1 vs AI',
      () => this._startGame('1vsAI'), true);
    this._drawButton(startX + bw + gap, bY, bw, bh, '1 vs 1',
      () => this._startGame('1vs1'), true);

    // Descriptions
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '16px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = C.textDim;
    ctx.fillText('Play against the computer', startX + bw / 2, bY + bh + 26);
    ctx.fillText('Hotseat multiplayer', startX + bw + gap + bw / 2, bY + bh + 26);
    ctx.restore();

    // Back button
    this._drawButton(CANVAS_W / 2 - 80, 500, 160, 44, '← Back',
      () => { this.state = STATE.MENU; }, false);
  }

  // ─────────────────────────────────────────────────────────────────
  //  RENDER – DIFFICULTY SELECT (1vsAI only)
  // ─────────────────────────────────────────────────────────────────
  _renderDiffSelect() {
    const ctx = this.ctx;
    this._drawBg();
    this._drawGridLines(0.2);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = C.text;
    ctx.shadowColor = C.accent;
    ctx.shadowBlur  = 20;
    ctx.fillText('SELECT DIFFICULTY', CANVAS_W / 2, 200);
    ctx.shadowBlur = 0;
    ctx.restore();

    const diffs = [
      { key: 'easy',   label: 'EASY',   desc: 'Only basic units, 60% budget',    color: C.hpGreen },
      { key: 'medium', label: 'MEDIUM', desc: 'Balanced mix, full budget',         color: C.textGold },
      { key: 'hard',   label: 'HARD',   desc: 'Heavy units, artillery, full budget', color: C.p2 },
    ];
    const bw = 240, bh = 80, gap = 30;
    const totalW = bw * 3 + gap * 2;
    let bx = CANVAS_W / 2 - totalW / 2;
    const by = 280;

    for (const d of diffs) {
      const isPrimary = this.difficulty === d.key;
      const dx = bx;
      this._drawButton(dx, by, bw, bh, d.label, () => {
        this.difficulty = d.key;
        this._beginPrep();
      }, isPrimary);

      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '14px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = d.color;
      ctx.fillText(d.desc, dx + bw / 2, by + bh + 24);
      ctx.restore();

      bx += bw + gap;
    }

    this._drawButton(CANVAS_W / 2 - 80, 460, 160, 44, '← Back',
      () => { this.state = STATE.MODE_SELECT; }, false);
  }

  // ─────────────────────────────────────────────────────────────────
  //  RENDER – PREP PHASE
  // ─────────────────────────────────────────────────────────────────
  _renderPrep() {
    const ctx = this.ctx;
    const player  = this._currentPlayer();

    this._drawBg();
    this._drawGridZones();
    this._drawGridLines(1);
    this._drawDivider();

    // Draw placed units & towers
    this._drawTowers();
    this._drawUnits();

    // Hover preview
    if (this.selectedUnit && this.hoverCell) {
      const { col, row } = this.hoverCell;
      const valid = this._validZone(player, row) && !this.placedCells.has(`${col},${row}`) &&
                    this.coins[player] >= UNIT_DEFS[this.selectedUnit].cost;
      const sc = this._gridToScreen(col, row);
      ctx.save();
      ctx.globalAlpha = valid ? 0.55 : 0.25;
      ctx.fillStyle   = valid ? (player === 1 ? C.p1 : C.p2) : '#ff0000';
      ctx.fillRect(sc.x + 2, sc.y + 2, CELL_W - 4, CELL_H - 4);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    this._drawHUD();
    this._drawShop(player);
  }

  // ─────────────────────────────────────────────────────────────────
  //  RENDER – BATTLE SCREEN
  // ─────────────────────────────────────────────────────────────────
  _renderBattleScreen() {
    const ctx = this.ctx;

    this._drawBg();
    this._drawGridZones();
    this._drawGridLines(0.5);
    this._drawDivider();

    // Projectiles (draw under units)
    for (const proj of this.projectiles) {
      const alpha = proj.life / proj.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = proj.color;
      ctx.shadowColor = proj.color;
      ctx.shadowBlur  = 6;
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.moveTo(proj.x1, proj.y1);
      ctx.lineTo(proj.x2, proj.y2);
      ctx.stroke();
      ctx.restore();
    }

    // Particles
    for (const p of this.particles) {
      const alpha = p.life / 0.7;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle   = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur  = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    this._drawTowers();
    this._drawUnits();
    this._drawHUDBattle();
  }

  // ─────────────────────────────────────────────────────────────────
  //  RENDER – RESULTS
  // ─────────────────────────────────────────────────────────────────
  _renderResults() {
    const ctx = this.ctx;

    // Dim background (show the last battle state)
    this._drawBg();
    this._drawGridZones();
    this._drawGridLines(0.3);
    this._drawTowers();
    this._drawUnits();

    // Overlay
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Winner banner
    const bx = CANVAS_W / 2 - 360, by = CANVAS_H / 2 - 180;
    const bw = 720, bh = 360;

    // Panel
    ctx.fillStyle   = '#0b1428';
    ctx.strokeStyle = this.winner === 1 ? C.p1 : this.winner === 2 ? C.p2 : C.textGold;
    ctx.lineWidth   = 3;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur  = 20;
    this._roundRect(ctx, bx, by, bw, bh, 12);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.textAlign = 'center';

    // Superbanner for match over
    if (this.matchOver) {
      ctx.font      = 'bold 20px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = C.textGold;
      ctx.shadowColor = C.textGold;
      ctx.shadowBlur  = 14;
      ctx.fillText('✦  MATCH OVER  ✦', CANVAS_W / 2, by + 38);
      ctx.shadowBlur = 0;
    }

    // Round winner title
    const titleColor = this.winner === 1 ? C.p1 : this.winner === 2 ? C.p2 : C.textGold;
    ctx.font      = `bold ${this.matchOver ? 46 : 52}px "Segoe UI", Arial, sans-serif`;
    ctx.fillStyle = titleColor;
    ctx.shadowColor = titleColor;
    ctx.shadowBlur  = 24;
    const titleText = this.winner === 'draw' ? 'DRAW!' :
                      this.winner === 1 ? 'PLAYER 1 WINS!' :
                      (this.mode === '1vsAI' ? 'AI WINS!' : 'PLAYER 2 WINS!');
    ctx.fillText(titleText, CANVAS_W / 2, by + (this.matchOver ? 88 : 80));
    ctx.shadowBlur = 0;

    // Detail
    ctx.font      = '17px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = C.textDim;
    ctx.fillText(this.winMsg, CANVAS_W / 2, by + 130);

    // Round info
    ctx.font      = '14px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = C.textDim;
    ctx.fillText(`Round ${this.round} complete`, CANVAS_W / 2, by + 158);

    // ── Score board ─────────────────────────────────────────────────
    const sbY   = by + 186;
    const p2Name = this.mode === '1vsAI' ? 'AI' : 'Player 2';

    ctx.font      = 'bold 15px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = C.textDim;
    ctx.fillText('MATCH SCORE', CANVAS_W / 2, sbY);

    // P1 score
    ctx.font      = `bold 46px "Segoe UI", Arial, sans-serif`;
    ctx.fillStyle = C.p1;
    ctx.shadowColor = C.p1;
    ctx.shadowBlur  = this.scores[1] >= MATCH_WINS ? 18 : 0;
    ctx.fillText(this.scores[1], CANVAS_W / 2 - 70, sbY + 52);
    ctx.shadowBlur = 0;

    ctx.font      = 'bold 14px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = C.p1;
    ctx.fillText('Player 1', CANVAS_W / 2 - 70, sbY + 72);

    ctx.font      = 'bold 32px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = C.textDim;
    ctx.fillText('–', CANVAS_W / 2, sbY + 46);

    // P2/AI score
    ctx.font      = `bold 46px "Segoe UI", Arial, sans-serif`;
    ctx.fillStyle = C.p2;
    ctx.shadowColor = C.p2;
    ctx.shadowBlur  = this.scores[2] >= MATCH_WINS ? 18 : 0;
    ctx.fillText(this.scores[2], CANVAS_W / 2 + 70, sbY + 52);
    ctx.shadowBlur = 0;

    ctx.font      = 'bold 14px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = C.p2;
    ctx.fillText(p2Name, CANVAS_W / 2 + 70, sbY + 72);

    ctx.restore();

    // Buttons
    const btnY = by + bh - 72;
    if (this.matchOver) {
      this._drawButton(CANVAS_W / 2 - 200, btnY, 190, 50, 'New Match',
        () => this._playAgain(), true);
    } else {
      this._drawButton(CANVAS_W / 2 - 200, btnY, 190, 50, 'Next Round →',
        () => this._playAgain(), true);
    }
    this._drawButton(CANVAS_W / 2 + 10, btnY, 190, 50, 'Main Menu',
      () => this._goToMenu(), false);
  }

  // ─────────────────────────────────────────────────────────────────
  //  HUD (prep phase)
  // ─────────────────────────────────────────────────────────────────
  _drawHUD() {
    const ctx    = this.ctx;
    const player = this._currentPlayer();
    const name   = player === 1 ? 'Player 1' :
                   (this.mode === '1vsAI' ? 'AI Setup' : 'Player 2');

    ctx.save();
    ctx.fillStyle = C.hud;
    ctx.fillRect(0, 0, CANVAS_W, HUD_H);
    ctx.strokeStyle = C.btnBorder;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(0, HUD_H); ctx.lineTo(CANVAS_W, HUD_H);
    ctx.stroke();

    // Round + scores
    ctx.textAlign = 'left';
    ctx.font      = 'bold 18px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = C.textGold;
    ctx.fillText(`Round ${this.round}`, 14, 26);

    const p2Name = this.mode === '1vsAI' ? 'AI' : 'P2';
    ctx.font      = '13px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = C.p1;
    ctx.fillText(`P1: ${this.scores[1]}`, 14, 50);
    ctx.fillStyle = C.p2;
    ctx.fillText(`${p2Name}: ${this.scores[2]}`, 62, 50);

    // Phase label
    ctx.font      = '13px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = C.textDim;
    ctx.fillText('PREPARATION PHASE', 14 + (this.mode === '1vsAI' ? 80 : 80), 50);

    // Player indicator
    const pColor = player === 1 ? C.p1 : C.p2;
    ctx.textAlign = 'center';
    ctx.font      = 'bold 20px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = pColor;
    ctx.shadowColor = pColor;
    ctx.shadowBlur  = 12;
    ctx.fillText(`${name}'s Turn`, CANVAS_W / 2, 30);
    ctx.shadowBlur  = 0;
    ctx.font = '13px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = C.textDim;
    ctx.fillText(
      player === 1 ? 'Place units on the BOTTOM half' : 'Place units on the TOP half',
      CANVAS_W / 2, 52
    );

    // Timer
    const secs = Math.ceil(this.prepTimer);
    const timerColor = secs <= 20 ? '#ff4444' : C.text;
    ctx.textAlign   = 'right';
    ctx.font        = 'bold 32px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle   = timerColor;
    ctx.shadowColor = timerColor;
    ctx.shadowBlur  = secs <= 20 ? 14 : 0;
    ctx.fillText(this._formatTime(secs), CANVAS_W - SHOP_W - 14, 44);
    ctx.shadowBlur  = 0;

    ctx.restore();
  }

  _drawHUDBattle() {
    const ctx  = this.ctx;
    const secs = Math.max(0, Math.ceil(BATTLE_DURATION - this.battleTimer));

    ctx.save();
    ctx.fillStyle = C.hud;
    ctx.fillRect(0, 0, CANVAS_W, HUD_H);
    ctx.strokeStyle = C.btnBorder;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(0, HUD_H); ctx.lineTo(CANVAS_W, HUD_H);
    ctx.stroke();

    // Round + scores (left)
    ctx.textAlign = 'left';
    ctx.font      = 'bold 18px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = C.textGold;
    ctx.fillText(`Round ${this.round}`, 14, 26);

    const p2Label = this.mode === '1vsAI' ? 'AI' : 'P2';
    ctx.font      = '13px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = C.p1;
    ctx.fillText(`P1: ${this.scores[1]}`, 14, 50);
    ctx.fillStyle = C.p2;
    ctx.fillText(`${p2Label}: ${this.scores[2]}`, 62, 50);

    ctx.font      = '13px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = C.textDim;
    ctx.fillText('BATTLE PHASE', 115, 50);

    // Timer (center)
    ctx.textAlign   = 'center';
    ctx.font        = 'bold 32px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle   = C.text;
    ctx.fillText(this._formatTime(secs), CANVAS_W / 2, 44);

    // Unit counts (right)
    const p1u = this.units.filter(u => u.player === 1).length;
    const p2u = this.units.filter(u => u.player === 2).length;
    const t1  = this.towers.find(t => t.player === 1);
    const t2  = this.towers.find(t => t.player === 2);

    ctx.font      = '15px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = C.p1;
    ctx.textAlign = 'left';
    ctx.fillText(`P1: ${p1u} units  Tower: ${t1 ? t1.hp : 0} HP`, 14, 68);

    ctx.fillStyle = C.p2;
    ctx.textAlign = 'right';
    ctx.fillText(`Tower: ${t2 ? t2.hp : 0} HP  Units: ${p2u} ${p2Label}`, CANVAS_W - 14, 68);

    ctx.restore();
  }

  // ─────────────────────────────────────────────────────────────────
  //  SHOP PANEL
  // ─────────────────────────────────────────────────────────────────
  _drawShop(player) {
    const ctx = this.ctx;
    const sx  = GRID_AREA_W;   // shop left edge
    const sw  = SHOP_W;
    const sh  = CANVAS_H;

    ctx.save();
    ctx.fillStyle = C.shop;
    ctx.fillRect(sx, 0, sw, sh);
    ctx.strokeStyle = C.btnBorder;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(sx, 0); ctx.lineTo(sx, sh);
    ctx.stroke();

    // Coins
    ctx.textAlign = 'center';
    ctx.font      = 'bold 22px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = C.textGold;
    ctx.shadowColor = C.textGold;
    ctx.shadowBlur  = 8;
    ctx.fillText(`⬡ ${this.coins[player]}`, sx + sw / 2, HUD_H + 38);
    ctx.shadowBlur = 0;
    ctx.font = '13px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = C.textDim;
    ctx.fillText('COINS', sx + sw / 2, HUD_H + 58);

    // Separator
    ctx.strokeStyle = C.divider;
    ctx.beginPath();
    ctx.moveTo(sx + 12, HUD_H + 68); ctx.lineTo(sx + sw - 12, HUD_H + 68);
    ctx.stroke();

    // Unit cards – dynamically sized to fit all UNIT_KEYS in the shop panel
    const readyY  = CANVAS_H - 70;
    const footerH = 48;   // instructions + gap above ready button
    const gapH    = 6;
    const numCards = UNIT_KEYS.length;
    const availH  = readyY - footerH - (HUD_H + 75);
    const cardH   = Math.floor((availH - gapH * (numCards - 1)) / numCards);

    let cardY = HUD_H + 75;
    for (const key of UNIT_KEYS) {
      const def       = UNIT_DEFS[key];
      const cardX     = sx + 10;
      const cardW     = sw - 20;
      const selected  = this.selectedUnit === key;
      const canAfford = this.coins[player] >= def.cost;

      ctx.fillStyle   = selected ? C.btnHover : C.btnBg;
      ctx.strokeStyle = selected ? (player === 1 ? C.p1 : C.p2) :
                        canAfford ? C.btnBorder : C.textDim;
      ctx.lineWidth   = selected ? 2 : 1;
      if (selected) {
        ctx.shadowColor = player === 1 ? C.p1 : C.p2;
        ctx.shadowBlur  = 12;
      }
      this._roundRect(ctx, cardX, cardY, cardW, cardH, 6);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Unit icon
      const iconX = cardX + 24;
      const iconY = cardY + cardH / 2;
      ctx.save();
      ctx.translate(iconX, iconY);
      this._drawUnitShape(ctx, key, player === 1 ? C.p1 : C.p2, 12, canAfford ? 1 : 0.4);
      ctx.restore();

      // Name & cost
      ctx.textAlign   = 'left';
      ctx.font        = `bold 13px "Segoe UI", Arial, sans-serif`;
      ctx.fillStyle   = canAfford ? C.text : C.textDim;
      ctx.fillText(def.name, cardX + 44, cardY + 16);

      ctx.fillStyle = canAfford ? C.textGold : C.textDim;
      ctx.font      = 'bold 12px "Segoe UI", Arial, sans-serif';
      ctx.fillText(`⬡ ${def.cost}`, cardX + 44, cardY + 30);

      // Stats
      ctx.font      = '10px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = C.textDim;
      ctx.fillText(`HP ${def.maxHp}  DMG ${def.damage}  SPD ${def.speed}`, cardX + 44, cardY + 44);

      // Description (only if there's room)
      if (cardH >= 72) {
        ctx.font      = '10px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = C.textDim;
        ctx.fillText(def.desc, cardX + 10, cardY + cardH - 8);
      }

      // Register button area
      const finalCardY = cardY;
      this.buttons.push({
        x: cardX, y: finalCardY, w: cardW, h: cardH,
        action: () => {
          if (canAfford) {
            this.selectedUnit = this.selectedUnit === key ? null : key;
          }
        },
      });

      cardY += cardH + gapH;
    }

    // Instructions
    ctx.textAlign = 'center';
    ctx.font      = '10px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = C.textDim;
    ctx.fillText('Click card → click your zone', sx + sw / 2, readyY - 24);
    ctx.fillText('Right-click placed unit to sell (75%)', sx + sw / 2, readyY - 11);

    // Ready button
    this._drawButton(sx + 20, readyY, sw - 40, 50, 'READY →',
      () => this._endPrep(), true);

    ctx.restore();
  }

  // ─────────────────────────────────────────────────────────────────
  //  GRID RENDERING
  // ─────────────────────────────────────────────────────────────────
  _drawBg() {
    this.ctx.fillStyle = C.bg;
    this.ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  _drawGridZones() {
    const ctx = this.ctx;
    ctx.save();

    // P2 zone (top half)
    ctx.fillStyle = C.p2Zone;
    ctx.fillRect(GRID_OX, GRID_OY,
                 GRID_COLS * CELL_W, P2_ROWS.end * CELL_H + CELL_H);

    // P1 zone (bottom half)
    ctx.fillStyle = C.p1Zone;
    ctx.fillRect(GRID_OX, GRID_OY + P1_ROWS.start * CELL_H,
                 GRID_COLS * CELL_W, (P1_ROWS.end - P1_ROWS.start + 1) * CELL_H);

    ctx.restore();
  }

  _drawGridLines(alpha) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = C.grid;
    ctx.lineWidth   = 1;

    for (let c = 0; c <= GRID_COLS; c++) {
      const x = GRID_OX + c * CELL_W;
      ctx.beginPath();
      ctx.moveTo(x, GRID_OY);
      ctx.lineTo(x, GRID_OY + GRID_ROWS * CELL_H);
      ctx.stroke();
    }
    for (let r = 0; r <= GRID_ROWS; r++) {
      const y = GRID_OY + r * CELL_H;
      ctx.beginPath();
      ctx.moveTo(GRID_OX, y);
      ctx.lineTo(GRID_OX + GRID_COLS * CELL_W, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawDivider() {
    const ctx = this.ctx;
    const y   = GRID_OY + (P1_ROWS.start) * CELL_H;
    ctx.save();
    ctx.strokeStyle = C.divider;
    ctx.lineWidth   = 2;
    ctx.setLineDash([8, 5]);
    ctx.shadowColor = C.divider;
    ctx.shadowBlur  = 4;
    ctx.beginPath();
    ctx.moveTo(GRID_OX, y);
    ctx.lineTo(GRID_OX + GRID_COLS * CELL_W, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Labels
    ctx.shadowBlur = 0;
    ctx.textAlign  = 'right';
    ctx.font       = '12px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle  = C.p2;
    ctx.fillText(this.mode === '1vsAI' ? 'AI ZONE' : 'PLAYER 2 ZONE',
                 GRID_OX + GRID_COLS * CELL_W - 6, y - 6);
    ctx.fillStyle  = C.p1;
    ctx.fillText('PLAYER 1 ZONE', GRID_OX + GRID_COLS * CELL_W - 6, y + 16);

    ctx.restore();
  }

  // ─────────────────────────────────────────────────────────────────
  //  ENTITY RENDERING
  // ─────────────────────────────────────────────────────────────────
  _drawTowers() {
    const ctx = this.ctx;
    for (const tower of this.towers) {
      if (tower.dead) continue;

      const hit  = tower.hitAnim > 0;
      const sc   = this._gridToScreen(tower.col, tower.row);
      const cx   = sc.x + CELL_W  / 2;
      const cy   = sc.y + CELL_H / 2;

      // Glow
      ctx.save();
      ctx.shadowColor = hit ? '#ffffff' : C.towerGlow;
      ctx.shadowBlur  = hit ? 30 : 18;

      // Outer hex
      ctx.strokeStyle = C.tower;
      ctx.lineWidth   = 3;
      ctx.fillStyle   = hit ? '#443300' : '#1a1200';
      this._hexPath(ctx, cx, cy, 26);
      ctx.fill();
      ctx.stroke();

      // Inner core
      ctx.fillStyle = C.tower;
      this._hexPath(ctx, cx, cy, 13);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.restore();

      // HP bar
      this._drawHpBar(ctx, cx - 28, cy + 30, 56, 6, tower.hp, tower.maxHp);

      // HP text
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font      = '10px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = C.textGold;
      ctx.fillText(`⬡ ${tower.hp}`, cx, cy + 48);
      ctx.restore();
    }
  }

  _drawUnits() {
    const ctx = this.ctx;
    for (const unit of this.units) {
      if (unit.dead) continue;

      const hit  = unit.hitAnim > 0;
      const atk  = unit.attackAnim > 0;
      const col  = unit.color;

      ctx.save();
      ctx.shadowColor = hit ? '#ffffff' : col;
      ctx.shadowBlur  = hit ? 20 : 8;

      ctx.translate(unit.x, unit.y);
      this._drawUnitShape(ctx, unit.typeKey, col, unit.size, atk ? 1.3 : 1, hit);

      ctx.restore();

      // HP bar
      this._drawHpBar(ctx, unit.x - 14, unit.y - unit.size - 10, 28, 4,
                      unit.hp, unit.maxHp);
    }
  }

  _drawUnitShape(ctx, typeKey, color, size, scale, hit) {
    const s = size * (scale || 1);
    ctx.fillStyle   = hit ? '#ffffff' : color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1;

    const def = UNIT_DEFS[typeKey];
    switch (def.shape) {
      case 'square':
        ctx.fillRect(-s, -s, s * 2, s * 2);
        ctx.strokeRect(-s, -s, s * 2, s * 2);
        break;
      case 'diamond':
        ctx.beginPath();
        ctx.moveTo(0, -s * 1.3);
        ctx.lineTo(s, 0);
        ctx.lineTo(0, s * 1.3);
        ctx.lineTo(-s, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      case 'hexagon':
        this._hexPath(ctx, 0, 0, s);
        ctx.fill();
        ctx.stroke();
        break;
      case 'triangle':
        ctx.beginPath();
        ctx.moveTo(0, -s * 1.3);
        ctx.lineTo(s, s);
        ctx.lineTo(-s, s);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      case 'cross': {
        const t = s * 0.38;
        ctx.beginPath();
        ctx.moveTo(-t, -s); ctx.lineTo(t, -s);
        ctx.lineTo(t, -t);  ctx.lineTo(s, -t);
        ctx.lineTo(s, t);   ctx.lineTo(t, t);
        ctx.lineTo(t, s);   ctx.lineTo(-t, s);
        ctx.lineTo(-t, t);  ctx.lineTo(-s, t);
        ctx.lineTo(-s, -t); ctx.lineTo(-t, -t);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'pentagon': {
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const angle = Math.PI / 180 * (72 * i - 90);
          const px = s * Math.cos(angle);
          const py = s * Math.sin(angle);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      default:
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }
  }

  // ─────────────────────────────────────────────────────────────────
  //  BUTTON HELPER
  // ─────────────────────────────────────────────────────────────────
  _drawButton(x, y, w, h, label, action, primary) {
    const ctx     = this.ctx;
    const hovered = this.mouseX >= x && this.mouseX <= x + w &&
                    this.mouseY >= y && this.mouseY <= y + h;

    ctx.save();
    ctx.fillStyle   = hovered ? C.btnHover : (primary ? '#102040' : C.btnBg);
    ctx.strokeStyle = primary ? C.accent : C.btnBorder;
    ctx.lineWidth   = primary ? 2 : 1;
    if (hovered) {
      ctx.shadowColor = C.accent;
      ctx.shadowBlur  = 15;
    }
    this._roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.font        = `bold ${primary ? 18 : 15}px "Segoe UI", Arial, sans-serif`;
    ctx.fillStyle   = primary ? C.text : C.textDim;
    ctx.fillText(label, x + w / 2, y + h / 2);

    ctx.textBaseline = 'alphabetic';
    ctx.restore();

    this.buttons.push({ x, y, w, h, action });
  }

  // ─────────────────────────────────────────────────────────────────
  //  MISC DRAW HELPERS
  // ─────────────────────────────────────────────────────────────────
  _drawHpBar(ctx, x, y, w, h, hp, maxHp) {
    const ratio = Math.max(0, hp / maxHp);
    ctx.save();
    ctx.fillStyle = C.hpBg;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = ratio > 0.5 ? C.hpGreen :
                    ratio > 0.25 ? '#aaee22' : C.hpRed;
    ctx.fillRect(x, y, w * ratio, h);
    ctx.restore();
  }

  _hexPath(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI / 180 * (60 * i - 30);
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  _formatTime(secs) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }
}

// ════════════════════════════════════════════════════════════════════
//  Boot
// ════════════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  window.game = new Game();
});