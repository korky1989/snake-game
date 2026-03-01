# Snake Game

A lightweight Snake game for GitHub Pages.

## Controls
- **Desktop:** Arrow keys or WASD to move, `P` or Space to pause, `R` to restart.
- **Mobile:** Swipe on the board or use on-screen directional buttons.
- **Debug:** Press `L` to advance one level for testing.

## Levels and obstacles
- The game starts at **Level 1**.
- The level increases every **5 food** eaten.
- Leveling up shows a short non-blocking toast (`Level N!`).
- Obstacle layouts are deterministic per level and collision with obstacles ends the game.
- Food never spawns on snake or obstacle cells.

## Settings page
Open `settings.html` (or use the **Settings** button in the game) to change:
- **Snake speed** (milliseconds per movement step)
- **Grid size** (e.g., 20x20)

Settings are stored in browser `localStorage` and applied when returning to the game.
