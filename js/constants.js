'use strict';

// ─── Canvas & Layout ────────────────────────────────────────────────
const CANVAS_W = 1400;
const CANVAS_H = 820;
const HUD_H    = 70;
const SHOP_W   = 290;

const GRID_AREA_W = CANVAS_W - SHOP_W;  // 1110
const GRID_AREA_H = CANVAS_H - HUD_H;   // 750

// ─── Grid ────────────────────────────────────────────────────────────
const GRID_COLS = 20;
const GRID_ROWS = 12;
const CELL_W = Math.floor(GRID_AREA_W / GRID_COLS);  // 55
const CELL_H = Math.floor(GRID_AREA_H / GRID_ROWS);  // 62

// Grid draw origin (canvas coordinates)
const GRID_OX = 0;
const GRID_OY = HUD_H;

// ─── Player zones (row numbers) ──────────────────────────────────────
const P1_ROWS = { start: 6, end: 11 };  // bottom half (player 1)
const P2_ROWS = { start: 0, end: 5  };  // top half    (player 2 / AI)

// Tower grid positions (col, row)
const P1_TOWER = { col: 9, row: 11 };
const P2_TOWER = { col: 9, row: 0  };
const TOWER_HP  = 1000;

// ─── Game balance ────────────────────────────────────────────────────
const STARTING_COINS  = 300;
const PREP_DURATION   = 120;  // seconds (preparation phase)
const BATTLE_DURATION = 120;  // seconds (maximum battle length)
const BATTLE_TICK_MS  = 120;  // ms between battle updates
const SELL_REFUND     = 0.75; // fraction of cost returned when selling a unit
const MATCH_WINS      = 2;    // rounds needed to win the match (best-of-3)

// ─── Colours ─────────────────────────────────────────────────────────
const C = {
  bg:       '#080c18',
  grid:     'rgba(40,65,110,0.45)',
  divider:  '#2a4060',
  p1Zone:   'rgba(20,70,160,0.12)',
  p2Zone:   'rgba(160,30,30,0.12)',
  p1:       '#4a9eff',
  p2:       '#ff5050',
  tower:    '#ffd700',
  towerGlow:'rgba(255,215,0,0.35)',
  hpBg:     '#1a0808',
  hpGreen:  '#22dd44',
  hpRed:    '#ee3322',
  hud:      '#0b1020',
  shop:     '#080e1c',
  text:     '#d8e8ff',
  textDim:  '#4a5878',
  textGold: '#ffd700',
  accent:   '#4a9eff',
  btnBg:    '#122040',
  btnHover: '#1e3a6a',
  btnBorder:'#2a5090',
};

// ─── Game states ──────────────────────────────────────────────────────
const STATE = {
  MENU:        'menu',
  MODE_SELECT: 'mode_select',
  DIFF_SELECT: 'diff_select',
  PREP_P1:     'prep_p1',
  PREP_P2:     'prep_p2',
  BATTLE:      'battle',
  RESULTS:     'results',
};

// ─── Unit type keys (must match UNIT_DEFS keys in units.js) ──────────
const UNIT_KEYS = ['grunt', 'speeder', 'ranger', 'sniper', 'tank', 'artillery'];