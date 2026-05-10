/**
 * Mapa 8×8: M=meta (verde objetivo suelo TCS), L=libre (azul), P=pared (rojo).
 * Laberinto: DFS / backtracking sobre rejilla 4×4 de "salas" (celdas par,par);
 * todos los pasillos generados son conexos (árbol recubridor).
 * Persistencia: localStorage MAP_STORAGE_KEY (celda 'I' legacy se lee como 'M').
 */
(function () {
  const SIZE = 8;
  const MAP_STORAGE_KEY = "laberintoMapa8_v1";

  const T = {
    META: "M",
    LIBRE: "L",
    PARED: "P",
  };

  const LABELS = {
    M: "meta (verde)",
    L: "paso libre",
    P: "pared / obstáculo",
  };

  let grid = [];
  let brush = T.LIBRE;
  let painting = false;

  function emptyGrid() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(T.LIBRE));
  }

  function defaultGrid() {
    const g = emptyGrid();
    g[SIZE - 1][SIZE - 1] = T.META;
    return g;
  }

  function normalizeCellToken(v) {
    const u = String(v || "").toUpperCase();
    if (u === "I") return T.META;
    if (u === T.META || u === T.LIBRE || u === T.PARED) return u;
    return T.LIBRE;
  }

  function findMeta(g) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (g[r][c] === T.META) return { r, c };
      }
    }
    return null;
  }

  function ensureSingleMeta(g, row, col) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (g[r][c] === T.META && (r !== row || c !== col)) {
          g[r][c] = T.LIBRE;
        }
      }
    }
  }

  function loadGrid() {
    try {
      const raw = localStorage.getItem(MAP_STORAGE_KEY);
      if (!raw) {
        grid = defaultGrid();
        return;
      }
      const data = JSON.parse(raw);
      if (data.version !== 1 || !Array.isArray(data.cells)) {
        grid = defaultGrid();
        return;
      }
      const cells = data.cells;
      if (cells.length !== SIZE) {
        grid = defaultGrid();
        return;
      }
      for (let r = 0; r < SIZE; r++) {
        if (!Array.isArray(cells[r]) || cells[r].length !== SIZE) {
          grid = defaultGrid();
          return;
        }
      }
      grid = cells.map((row) => row.map((x) => normalizeCellToken(x)));
      const posMeta = findMeta(grid);
      if (!posMeta) grid[SIZE - 1][SIZE - 1] = T.META;
      else ensureSingleMeta(grid, posMeta.r, posMeta.c);
    } catch (_) {
      grid = defaultGrid();
    }
  }

  function saveGrid() {
    const payload = {
      version: 1,
      size: SIZE,
      cells: grid,
    };
    try {
      localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {}
  }

  function randomInt(maxExclusive) {
    return Math.floor(Math.random() * maxExclusive);
  }

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  function keyRC(r, c) {
    return r + "," + c;
  }

  /**
   * Laberinto perfecto (sin ciclos): salas en (0,0)…(6,6) paso 2.
   * Se abren pasillos de 1 celda entre salas; el grafo de celdas L es conexo.
   * Una celda L se marca como M (meta verde en TCS).
   */
  function generarLaberinto() {
    const g = Array.from({ length: SIZE }, () => Array(SIZE).fill(T.PARED));
    const rooms = [];
    for (let r = 0; r < SIZE; r += 2) {
      for (let c = 0; c < SIZE; c += 2) {
        rooms.push([r, c]);
      }
    }
    const visited = new Set();
    const startIdx = randomInt(rooms.length);
    const [sr, sc] = rooms[startIdx];
    const stack = [[sr, sc]];
    visited.add(keyRC(sr, sc));
    g[sr][sc] = T.LIBRE;

    const dirs = [
      [-2, 0],
      [2, 0],
      [0, -2],
      [0, 2],
    ];

    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const r = top[0];
      const c = top[1];
      const candidates = [];
      for (let d = 0; d < dirs.length; d++) {
        const nr = r + dirs[d][0];
        const nc = c + dirs[d][1];
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
        if (visited.has(keyRC(nr, nc))) continue;
        candidates.push([nr, nc]);
      }
      shuffleInPlace(candidates);
      if (candidates.length === 0) {
        stack.pop();
        continue;
      }
      const next = candidates[0];
      const nr = next[0];
      const nc = next[1];
      const midR = (r + nr) >> 1;
      const midC = (c + nc) >> 1;
      g[midR][midC] = T.LIBRE;
      g[nr][nc] = T.LIBRE;
      visited.add(keyRC(nr, nc));
      stack.push([nr, nc]);
    }

    const metaCands = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (g[r][c] === T.LIBRE) metaCands.push([r, c]);
      }
    }
    if (metaCands.length === 0) {
      g[SIZE - 1][SIZE - 1] = T.META;
      return g;
    }
    const pick = metaCands[randomInt(metaCands.length)];
    g[pick[0]][pick[1]] = T.META;
    return g;
  }

  function crearMapaLaberinto() {
    grid = generarLaberinto();
    saveGrid();
    renderGrid();
    setMsg(
      "Laberinto generado: una meta (verde TCS) y caminos conectados (sin islas). Podés retocar con el pincel.",
      true
    );
  }

  function cellClass(t) {
    if (t === T.META) return "map-cell--meta";
    if (t === T.PARED) return "map-cell--pared";
    return "map-cell--libre";
  }

  function renderGrid() {
    const el = document.getElementById("mapGrid");
    if (!el) return;
    el.innerHTML = "";
    el.setAttribute("role", "grid");
    el.setAttribute("aria-label", "Laberinto 8 por 8");
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "map-cell " + cellClass(grid[r][c]);
        btn.dataset.row = String(r);
        btn.dataset.col = String(c);
        btn.setAttribute(
          "aria-label",
          "Fila " + (r + 1) + ", columna " + (c + 1) + ", " + LABELS[grid[r][c]]
        );
        btn.addEventListener("click", (ev) => {
          ev.preventDefault();
          applyBrush(r, c);
        });
        btn.addEventListener("mouseenter", () => {
          if (painting) applyBrush(r, c);
        });
        el.appendChild(btn);
      }
    }
  }

  function applyBrush(row, col) {
    const v = brush;
    if (v === T.META) {
      ensureSingleMeta(grid, row, col);
      grid[row][col] = T.META;
    } else {
      grid[row][col] = v;
    }
    saveGrid();
    renderGrid();
  }

  function setBrush(b) {
    brush = b;
    document.querySelectorAll(".map-brush").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-brush") === b);
    });
  }

  function setMsg(text, ok) {
    const m = document.getElementById("mapMsg");
    if (!m) return;
    m.textContent = text || "";
    m.className = "map-msg" + (ok === true ? " ok" : ok === false ? " err" : "");
  }

  function fillAllLibre() {
    grid = emptyGrid();
    grid[SIZE - 1][SIZE - 1] = T.META;
    saveGrid();
    renderGrid();
    setMsg("Mapa vacío: meta abajo-derecha (verde TCS), resto libre.", true);
  }

  function clearWallsOnly() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c] === T.PARED) grid[r][c] = T.LIBRE;
      }
    }
    const pos = findMeta(grid);
    if (!pos) {
      ensureSingleMeta(grid, SIZE - 1, SIZE - 1);
      grid[SIZE - 1][SIZE - 1] = T.META;
    }
    saveGrid();
    renderGrid();
    setMsg("Paredes quitadas; se mantiene una sola meta (verde).", true);
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadGrid();
    renderGrid();

    document.querySelectorAll(".map-brush").forEach((btn) => {
      btn.addEventListener("click", () => setBrush(btn.getAttribute("data-brush")));
    });
    setBrush(T.LIBRE);

    const gridEl = document.getElementById("mapGrid");
    if (gridEl) {
      gridEl.addEventListener("mousedown", (e) => {
        if (e.target.classList.contains("map-cell")) painting = true;
      });
      document.addEventListener("mouseup", () => {
        painting = false;
      });
      gridEl.addEventListener("mouseleave", () => {
        painting = false;
      });
    }

    const btnFill = document.getElementById("btnMapFillLibre");
    if (btnFill) btnFill.addEventListener("click", fillAllLibre);

    const btnClearWalls = document.getElementById("btnMapClearWalls");
    if (btnClearWalls) btnClearWalls.addEventListener("click", clearWallsOnly);

    const btnCrear = document.getElementById("btnCrearMapa");
    if (btnCrear) btnCrear.addEventListener("click", crearMapaLaberinto);
  });

  window.LaberintoMapa8 = {
    getGrid: () => grid.map((row) => row.slice()),
    getSIZE: () => SIZE,
    T: T,
  };
})();
