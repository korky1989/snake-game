# Snake Game

A lightweight Snake game for GitHub Pages.

## Controls
- **Desktop:** Arrow keys or WASD to move, `P` or Space to pause, `R` to restart.
- **Mobile:** Swipe on the board or use on-screen directional buttons.
- **Debug:** Press `L` to advance one level for quick layout testing.

## Levels and obstacles
- The game starts at **Level 1**.
- The level increases every **5 food** eaten.
- When a level increases, a non-blocking toast (`Level N!`) appears briefly.
- Each level has a deterministic obstacle pattern (same pattern for the same level number).
- There are 6 base patterns, then patterns cycle for higher levels while adding extra obstacle pressure.
- Obstacles are blocked cells:
  - snake collision with obstacle = game over
  - food never spawns on obstacles or snake cells
  - obstacle generation avoids out-of-bounds cells and leaves open movement corridors
