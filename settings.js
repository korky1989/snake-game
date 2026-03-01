(() => {
  const DEFAULT_SETTINGS = {
    baseSpeed: 110,
    gridSize: 20,
  };

  const baseSpeedEl = document.getElementById("baseSpeed");
  const baseSpeedValueEl = document.getElementById("baseSpeedValue");
  const gridSizeEl = document.getElementById("gridSize");
  const gridSizeValueEl = document.getElementById("gridSizeValue");
  const saveBtn = document.getElementById("saveSettings");

  function loadSettings() {
    try {
      const raw = localStorage.getItem("snake_settings");
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw);
      const baseSpeed = Number(parsed.baseSpeed);
      const gridSize = Number(parsed.gridSize);
      return {
        baseSpeed: Number.isFinite(baseSpeed) ? Math.min(220, Math.max(50, baseSpeed)) : DEFAULT_SETTINGS.baseSpeed,
        gridSize: Number.isFinite(gridSize) ? Math.min(30, Math.max(12, Math.floor(gridSize))) : DEFAULT_SETTINGS.gridSize,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(v) {
    localStorage.setItem("snake_settings", JSON.stringify(v));
  }

  function updateLabels() {
    baseSpeedValueEl.textContent = `${baseSpeedEl.value}`;
    gridSizeValueEl.textContent = `${gridSizeEl.value}x${gridSizeEl.value}`;
  }

  const settings = loadSettings();
  baseSpeedEl.value = String(settings.baseSpeed);
  gridSizeEl.value = String(settings.gridSize);
  updateLabels();

  baseSpeedEl.addEventListener("input", updateLabels);
  gridSizeEl.addEventListener("input", updateLabels);

  saveBtn.addEventListener("click", () => {
    saveSettings({
      baseSpeed: Number(baseSpeedEl.value),
      gridSize: Number(gridSizeEl.value),
    });
    window.location.href = "index.html";
  });
})();
