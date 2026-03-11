'use strict';

// ─── Unit Definitions ────────────────────────────────────────────────
// range / speed are in canvas pixels; atkInterval in seconds
const UNIT_DEFS = {
  grunt: {
    name:        'Grunt',
    cost:        10,
    maxHp:       60,
    damage:      8,
    range:       CELL_W * 1.4,
    speed:       55,
    atkInterval: 1.0,
    size:        12,
    shape:       'square',
    desc:        'Basic infantry. Cheap and reliable.',
  },
  ranger: {
    name:        'Ranger',
    cost:        20,
    maxHp:       40,
    damage:      14,
    range:       CELL_W * 3.6,
    speed:       40,
    atkInterval: 1.4,
    size:        10,
    shape:       'diamond',
    desc:        'Ranged attacker. Keeps distance.',
  },
  tank: {
    name:        'Tank',
    cost:        45,
    maxHp:       200,
    damage:      22,
    range:       CELL_W * 1.4,
    speed:       28,
    atkInterval: 2.0,
    size:        18,
    shape:       'hexagon',
    desc:        'Heavy armour. Slow but devastating.',
  },
  speeder: {
    name:        'Speeder',
    cost:        15,
    maxHp:       35,
    damage:      7,
    range:       CELL_W * 1.4,
    speed:       115,
    atkInterval: 0.65,
    size:        9,
    shape:       'triangle',
    desc:        'Fast & fragile. Great for flanking.',
  },
};

// ─── Unit class (live game entity) ────────────────────────────────────
let _unitIdCounter = 0;

class Unit {
  constructor(typeKey, player, col, row) {
    this.id        = _unitIdCounter++;
    this.typeKey   = typeKey;
    this.player    = player;        // 1 or 2
    const def      = UNIT_DEFS[typeKey];
    this.name      = def.name;
    this.maxHp     = def.maxHp;
    this.hp        = def.maxHp;
    this.damage    = def.damage;
    this.range     = def.range;
    this.speed     = def.speed;
    this.atkInterval = def.atkInterval;
    this.size      = def.size;
    this.shape     = def.shape;

    // Canvas position (center of cell at placement)
    this.x = GRID_OX + col * CELL_W + CELL_W / 2;
    this.y = GRID_OY + row * CELL_H + CELL_H / 2;

    this.col = col;
    this.row = row;

    this.dead      = false;
    this.atkTimer  = 0;          // counts down; attack when ≤ 0
    this.target    = null;       // current attack target
    this.attackAnim = 0;         // flash timer for visual feedback
    this.hitAnim   = 0;          // flash when hit
  }

  get color() {
    return this.player === 1 ? C.p1 : C.p2;
  }

  // Pixel distance to another entity
  distTo(other) {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Move toward a target pixel position; returns true if already in range
  moveToward(tx, ty, dtSec) {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return true;
    const step = this.speed * dtSec;
    if (step >= dist) {
      this.x = tx;
      this.y = ty;
      return true;
    }
    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
    return false;
  }
}

// ─── Tower class ──────────────────────────────────────────────────────
class Tower {
  constructor(player, col, row) {
    this.player  = player;
    this.maxHp   = TOWER_HP;
    this.hp      = TOWER_HP;
    this.range   = CELL_W * 4.5;
    this.damage  = 18;
    this.atkInterval = 1.8;
    this.atkTimer    = 0;
    this.dead    = false;
    this.attackAnim  = 0;
    this.hitAnim     = 0;
    this.x = GRID_OX + col * CELL_W + CELL_W / 2;
    this.y = GRID_OY + row * CELL_H + CELL_H / 2;
    this.col = col;
    this.row = row;
  }

  get color() { return C.tower; }

  distTo(other) {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}