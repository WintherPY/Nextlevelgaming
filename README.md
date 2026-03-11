# Nextlevelgaming – Battlefield Command

A browser-based turn-based strategy game. No installation required — just open `index.html` in Chrome, Firefox, or Edge.

## How to Play

1. **Open `index.html`** in any modern browser (double-click the file).
2. Click **START GAME** → choose **1 vs AI** or **1 vs 1** (hotseat).
3. If playing vs AI, pick a **difficulty**: Easy / Medium / Hard.
4. During the **Preparation Phase** (2 minutes):
   - You have **300 coins** to spend on units.
   - Click a unit card on the right, then click a cell in **your half** of the battlefield.
   - **Right-click a placed unit** to sell it back for **75% of its cost**.
   - Click **READY →** (or let the timer expire) to start the battle.
5. Units fight automatically during the **Battle Phase**.
6. Win two rounds to claim the **match** (best-of-3).

## Units

| Unit       | Cost | HP  | DMG | Range    | Speed | Notes                        |
|------------|------|-----|-----|----------|-------|------------------------------|
| Grunt      | 10   | 60  | 8   | Short    | 55    | Cheap and reliable           |
| Speeder    | 15   | 35  | 7   | Short    | 115   | Fast & fragile               |
| Ranger     | 20   | 40  | 14  | Medium   | 40    | Ranged attacker              |
| Sniper     | 30   | 30  | 32  | Very Long| 28    | Extreme range, glass cannon  |
| Tank       | 45   | 200 | 22  | Short    | 28    | Heavy armour, slow           |
| Artillery  | 60   | 90  | 50  | Extreme  | 16    | Massive range & damage       |

## Win Conditions

- All enemy troops eliminated → instant win (tower HP is cosmetic).
- Timer expires → player with **most troops remaining** wins.
- Equal troops remaining → **Draw** (no score awarded).
- First player to **win 2 rounds** wins the match.

## Architecture

- `index.html` — entry point
- `css/style.css` — dark sci-fi styling
- `js/constants.js` — canvas layout, grid config, colour palette, game states
- `js/units.js` — `Unit` / `Tower` classes + stat definitions (6 unit types)
- `js/ai.js` — difficulty-aware AI army builder (Easy / Medium / Hard)
- `js/game.js` — full game controller: state machine, canvas rendering, combat loop, UI
