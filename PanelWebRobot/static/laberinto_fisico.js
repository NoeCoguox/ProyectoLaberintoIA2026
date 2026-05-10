/** Laberinto físico N×M — agentes, sensores sincronizados, BFS, A*, DFS, Greedy */
(function () {
  const DIM_MIN = 3;
  const DIM_MAX = 32;
  let GRID_W = 8;
  let GRID_H = 8;
  const HDR = ["N↑", "E→", "S↓", "W←"];

  function maxXi() {
    return Math.max(0, GRID_W - 1);
  }
  function maxYi() {
    return Math.max(0, GRID_H - 1);
  }

  /** @typedef {'DESCONOCIDO'|'LIBRE'|'OBSTACULO'|'INICIO'|'OBJETIVO'} MapState */

  /** @type {MapState[][]} */
  let grid = [];
  const robot = { x: 0, y: 0, h: 0 };

  /** @type {string[]} */
  let tcpQueue = [];
  let programQueue = [];
  /** @type {{x:number,y:number}[]} */
  let pathHighlight = [];

  let lastRawCelda = "";
  let lastDistCm = null;
  let lastLoggedRawSig = "";
  /** Fragmento después de `THRESH:` del último `/api/leer`. */
  let lastLeerThresh = "";

  /** Cronómetro "Tiempo autonomía": sólo después de ▶ Iniciar autonomía */
  let autonomyStartedAtMs = null;
  let autonomyEndedAtMs = null;
  let movesSent = 0;
  let lastSearchNodes = 0;
  let lastPathLen = 0;
  let timeTimer = null;

  let inFlightLeer = false;
  /** Cola de LEER: evita que `leer(true)` devuelva null por solapamiento (autonomía + lectura automática). */
  let leerChain = Promise.resolve();
  let inFlightTcp = false;
  /** Si el último adelante/atras entró en suelo ROJO se revirtió con el pulso contrario — replan síncronos 4/5. */
  let lfLastDisplacementBlockedByRed = false;
  const LF_SIM_STORAGE_KEY = "laberintoFisicoSimTerrain_v1";
  /** Terreno «verdad» para TCS en simulación (mismo vocabulario que el firmware). */
  /** @type {("VERDE"|"AZUL"|"ROJO")[][]} */
  let lfSimTerrain = [];
  /** @type {"VERDE"|"AZUL"|"ROJO"} */
  /** Pincel por defecto coherente con la UI («Libre» activo). */
  let lfSimBrush = "AZUL";
  let lfSimPaintDrag = false;
  let lfTimer = null;

  /* DOM — sensores */
  const hostEl = document.getElementById("host");
  const portEl = document.getElementById("port");
  const celdaBadge = document.getElementById("celdaBadge");
  const distEl = document.getElementById("distReadout");
  const mapStateReadout = document.getElementById("mapStateReadout");
  const msgEl = document.getElementById("lfMsg");
  const logBody = document.getElementById("logBody");

  /* DOM — pose */
  const robotXEl = document.getElementById("robotX");
  const robotYEl = document.getElementById("robotY");
  const robotHEl = document.getElementById("robotH");
  const goalXEl = document.getElementById("goalX");
  const goalYEl = document.getElementById("goalY");
  const ultraThreshEl = document.getElementById("ultraThresh");
  const unknownAsFreeEl = document.getElementById("unknownAsFree");
  const autoReplanEl = document.getElementById("autoReplan");
  const lfCellMoveMsHint = document.getElementById("lfCellMoveMsHint");
  /** Mismas claves que Control manual (`manualMovePulseMs_*`) para compartir calibración. */
  const LF_PULSE_LS = {
    adelante: "manualMovePulseMs_adelante",
    atras: "manualMovePulseMs_atras",
    izquierda: "manualMovePulseMs_izquierda",
    derecha: "manualMovePulseMs_derecha",
  };
  const LF_PULSE_IDS = {
    adelante: "lfPulseMsAdelante",
    atras: "lfPulseMsAtras",
    izquierda: "lfPulseMsIzquierda",
    derecha: "lfPulseMsDerecha",
  };

  const lfMapGrid = document.getElementById("lfMapGrid");
  const lfGridWEl = document.getElementById("lfGridW");
  const lfGridHEl = document.getElementById("lfGridH");
  const btnApplyDims = document.getElementById("btnApplyDims");
  const lfMapTitleEl = document.getElementById("lfMapTitle");
  const lfPageTitleMainEl = document.getElementById("lfPageTitleMain");

  const colorPresetEl = document.getElementById("colorPreset");
  const agentModeEl = document.getElementById("agentMode");
  const searchAlgoEl = document.getElementById("searchAlgo");
  const lfSearchAlgoLabel = document.getElementById("lfSearchAlgoLabel");
  const lfSearchKpiHint = document.getElementById("lfSearchKpiHint");
  const programmedBlock = document.getElementById("programmedBlock");
  const programmedSeqEl = document.getElementById("programmedSeq");
  const btnLoadProgram = document.getElementById("btnLoadProgram");
  const agentHintEl = document.getElementById("agentHint");
  const planPreviewEl = document.getElementById("planPreview");

  const btnLeer = document.getElementById("btnLeer");
  const lfAuto = document.getElementById("lfAuto");
  const lfInterval = document.getElementById("lfInterval");
  const lfOnlyOnChange = document.getElementById("lfOnlyOnChange");
  const btnClearLog = document.getElementById("btnClearLog");
  const btnExportLog = document.getElementById("btnExportLog");

  const btnResetMap = document.getElementById("btnResetMap");
  const btnExportMap = document.getElementById("btnExportMap");
  const fileImportMap = document.getElementById("fileImportMap");

  const btnPlan = document.getElementById("btnPlan");
  const btnStepAgent = document.getElementById("btnStepAgent");
  const btnExecOne = document.getElementById("btnExecOne");
  const btnClearPlan = document.getElementById("btnClearPlan");

  const btnAutorunStart = document.getElementById("btnAutorunStart");
  const btnAutorunStop = document.getElementById("btnAutorunStop");
  const autorunDelayEl = document.getElementById("autorunDelay");
  const autorunStatusEl = document.getElementById("autorunStatus");

  const logRows = [];
  const forwardDelta = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
  ];

  function inBounds(x, y) {
    return x >= 0 && x < GRID_W && y >= 0 && y < GRID_H;
  }

  function key(x, y) {
    return x + "," + y;
  }

  function initGrid() {
    grid = [];
    for (let y = 0; y < GRID_H; y++) {
      grid.push([]);
      for (let x = 0; x < GRID_W; x++) grid[y][x] = "DESCONOCIDO";
    }
  }

  function syncGridDimsStyle() {
    const cols = String(Math.max(1, GRID_W));
    const asp = `${GRID_W} / ${GRID_H}`;
    if (lfMapGrid) {
      lfMapGrid.style.setProperty("--lf-grid-cols", cols);
      lfMapGrid.style.setProperty("--lf-grid-aspect", asp);
    }
    const simG = document.getElementById("lfSimTerrainGrid");
    if (simG) {
      simG.style.setProperty("--lf-grid-cols", cols);
      simG.style.setProperty("--lf-grid-aspect", asp);
    }
  }

  function updateDimTitles() {
    const lbl = `${GRID_W}×${GRID_H}`;
    if (lfMapTitleEl) lfMapTitleEl.textContent = `Mapa interno (${lbl})`;
    if (lfPageTitleMainEl) lfPageTitleMainEl.textContent = `Laboratorio de navegación ${lbl}`;
    if (lfMapGrid) lfMapGrid.setAttribute("aria-label", `${GRID_W} columnas × ${GRID_H} filas`);
    document.title = `Laberinto físico ${lbl} · UMG`;
  }

  function syncDimInputsFromGlobals() {
    if (lfGridWEl) lfGridWEl.value = String(GRID_W);
    if (lfGridHEl) lfGridHEl.value = String(GRID_H);
  }

  function updatePoseRanges() {
    const mx = maxXi();
    const my = maxYi();
    robotXEl.max = goalXEl.max = String(mx);
    robotYEl.max = goalYEl.max = String(my);
    readRobotFromInputs();
    robot.x = clampInt(robot.x, 0, mx);
    robot.y = clampInt(robot.y, 0, my);
    goalXEl.value = String(clampInt(+goalXEl.value, 0, mx));
    goalYEl.value = String(clampInt(+goalYEl.value, 0, my));
    writeRobotToInputs();
  }

  function persistGridDims() {
    try {
      localStorage.setItem("lfGridW", String(GRID_W));
      localStorage.setItem("lfGridH", String(GRID_H));
    } catch (_) {}
  }

  function loadStoredGridDims() {
    try {
      const ws = localStorage.getItem("lfGridW");
      const hs = localStorage.getItem("lfGridH");
      if (ws !== null && ws !== "") {
        const v = clampInt(+ws, DIM_MIN, DIM_MAX);
        if (Number.isFinite(v)) GRID_W = v;
      }
      if (hs !== null && hs !== "") {
        const v = clampInt(+hs, DIM_MIN, DIM_MAX);
        if (Number.isFinite(v)) GRID_H = v;
      }
    } catch (_) {}
  }

  function resetPoseDefaultCorners() {
    robot.x = 0;
    robot.y = 0;
    robot.h = 0;
    goalXEl.value = String(maxXi());
    goalYEl.value = String(maxYi());
    writeRobotToInputs();
  }

  function clearQueuesAndHighlight() {
    pathHighlight = [];
    tcpQueue = [];
    programQueue = [];
    planPreviewEl.textContent = "";
    lastLoggedRawSig = "";
  }

  /**
   * @param {{ keepPose?: boolean }} [opts]
   */
  function applyGridDimensions(rawW, rawH, opts) {
    const o = opts || {};
    const prevSim = lfSimTerrain.length ? lfSimTerrain.map((r) => r.slice()) : [];
    const prevGw = GRID_W;
    const prevGh = GRID_H;
    GRID_W = clampInt(+rawW, DIM_MIN, DIM_MAX);
    GRID_H = clampInt(+rawH, DIM_MIN, DIM_MAX);
    syncDimInputsFromGlobals();
    persistGridDims();
    initGrid();
    clearQueuesAndHighlight();
    if (!o.keepPose) resetPoseDefaultCorners();
    buildMapDom();
    lfSimRemapTerrainFromPrev(prevSim, prevGw, prevGh);
    syncGridDimsStyle();
    updateDimTitles();
    updatePoseRanges();
    renderMap();
  }

  function mergeMapState(prev, neu) {
    if (neu === null || neu === undefined) return prev;
    if (neu === "OBSTACULO") return "OBSTACULO";
    if (prev === "OBSTACULO") return "OBSTACULO";
    if (neu === "INICIO") return "INICIO";
    if (neu === "OBJETIVO") return "OBJETIVO";
    if (neu === "LIBRE") {
      if (prev === "INICIO" || prev === "OBJETIVO") return prev;
      return "LIBRE";
    }
    return prev;
  }

  /** @returns {MapState|null} */
  function rawCeldaToMapState(raw) {
    const c = (raw || "").toUpperCase().trim();
    const unkLibre = unknownAsFreeEl.checked;
    /** Convención (sin blanco en firmware): verde=meta (objetivo en suelo), azul=disponible, rojo=peligro. */
    if (c === "VERDE") return "OBJETIVO";
    if (c === "AZUL") return "LIBRE";
    if (c === "ROJO") return "OBSTACULO";
    if (c === "BLANCO") return "LIBRE";
    if (unkLibre && (c === "UNKNOWN" || c === "SKIP" || !c || c === "—")) return "LIBRE";
    return null;
  }

  function readRobotFromInputs() {
    robot.x = clampInt(+robotXEl.value, 0, maxXi());
    robot.y = clampInt(+robotYEl.value, 0, maxYi());
    robot.h = clampInt(+robotHEl.value, 0, 3);
  }

  function writeRobotToInputs() {
    robotXEl.value = String(robot.x);
    robotYEl.value = String(robot.y);
    robotHEl.value = String(robot.h);
  }

  function clampInt(n, lo, hi) {
    if (!Number.isFinite(n)) return lo;
    return Math.min(hi, Math.max(lo, n));
  }

  function frontXY() {
    const d = forwardDelta[robot.h];
    return { x: robot.x + d.dx, y: robot.y + d.dy };
  }

  function markFrontUltraObstacle(distCm) {
    if (distCm == null || distCm >= 999) return false;
    const u = clampInt(+ultraThreshEl.value, 1, 80) || 15;
    if (distCm >= u) return false;
    const fc = frontXY();
    if (!inBounds(fc.x, fc.y)) return false;
    const old = grid[fc.y][fc.x];
    grid[fc.y][fc.x] = "OBSTACULO";
    return old !== "OBSTACULO";
  }

  /** @returns {boolean} obstacle newly discovered → replan */
  function integrateSensors(leerJson) {
    readRobotFromInputs();
    const raw = leerJson.celda != null ? String(leerJson.celda) : "";
    lastRawCelda = raw;
    lastDistCm = leerJson.dist != null ? +leerJson.dist : null;

    const mapped = rawCeldaToMapState(raw);
    if (mapped !== null) {
      const x = robot.x,
        y = robot.y;
      grid[y][x] = mergeMapState(grid[y][x], mapped);
    }

    const ultraNew = markFrontUltraObstacle(lastDistCm);
    return ultraNew;
  }

  function walkableCell(x, y) {
    if (!inBounds(x, y)) return false;
    const s = grid[y][x];
    if (s === "OBSTACULO") return false;
    if (s === "DESCONOCIDO") return unknownAsFreeEl.checked;
    return true;
  }

  function heuristic(x, y, gx, gy) {
    return Math.abs(x - gx) + Math.abs(y - gy);
  }

  function reconstruct(parent, gx, gy) {
    /** @type {{x:number,y:number}[]} */
    const out = [];
    let cx = gx,
      cy = gy;
    while (cx !== undefined) {
      out.push({ x: cx, y: cy });
      const p = parent.get(key(cx, cy));
      if (p == null) break;
      cx = p.x;
      cy = p.y;
    }
    out.reverse();
    return out;
  }

  /** @returns {{path:Array,nodes:number,algo:string}|null} */
  function searchBFS(sx, sy, gx, gy) {
    if (!walkableCell(sx, sy) || !walkableCell(gx, gy)) return null;
    const parent = new Map();
    /** @type {string[]} */
    const q = [key(sx, sy)];
    const seen = new Set(q);
    let nodes = 0;
    parent.set(key(sx, sy), null);
    let qi = 0;
    while (qi < q.length) {
      const cur = q[qi++];
      nodes++;
      const [cx, cy] = cur.split(",").map(Number);
      if (cx === gx && cy === gy)
        return { path: reconstruct(parent, gx, gy), nodes, algo: "BFS" };
      for (const d of forwardDelta) {
        const nx = cx + d.dx,
          ny = cy + d.dy;
        if (!walkableCell(nx, ny)) continue;
        const k = key(nx, ny);
        if (seen.has(k)) continue;
        seen.add(k);
        parent.set(k, { x: cx, y: cy });
        q.push(k);
      }
    }
    return null;
  }

  /** DFS primera ruta encontrada — no óptima; cuenta nodos expandidos */
  function searchDFS(sx, sy, gx, gy) {
    if (!walkableCell(sx, sy) || !walkableCell(gx, gy)) return null;
    let nodes = 0;
    const visited = new Set();

    function dfs(x, y, trace) {
      nodes++;
      if (x === gx && y === gy) return trace;
      visited.add(key(x, y));
      const order = forwardDelta.slice();
      for (const d of order) {
        const nx = x + d.dx,
          ny = y + d.dy;
        if (!walkableCell(nx, ny)) continue;
        const k = key(nx, ny);
        if (visited.has(k)) continue;
        const sub = dfs(nx, ny, trace.concat([{ x: nx, y: ny }]));
        if (sub) return sub;
      }
      visited.delete(key(x, y));
      return null;
    }

    const path = dfs(sx, sy, [{ x: sx, y: sy }]);
    return path ? { path, nodes, algo: "DFS" } : null;
  }

  /** A* */
  function searchAStar(sx, sy, gx, gy) {
    if (!walkableCell(sx, sy) || !walkableCell(gx, gy)) return null;
    const open = [{ x: sx, y: sy, g: 0, f: heuristic(sx, sy, gx, gy) }];
    const came = new Map();
    /** @type {Map<string, number>} */
    const gScore = new Map();
    came.set(key(sx, sy), null);
    gScore.set(key(sx, sy), 0);
    let nodes = 0;

    while (open.length) {
      open.sort((a, b) => a.f - b.f || a.g - b.g);
      const cur = open.shift();
      if (!cur) break;
      nodes++;
      if (cur.x === gx && cur.y === gy) return { path: reconstructA(came, gx, gy), nodes, algo: "A*" };
      for (const d of forwardDelta) {
        const nx = cur.x + d.dx,
          ny = cur.y + d.dy;
        if (!walkableCell(nx, ny)) continue;
        const nk = key(nx, ny);
        const tg = cur.g + 1;
        const pg = gScore.get(nk);
        if (pg !== undefined && pg <= tg) continue;
        gScore.set(nk, tg);
        came.set(nk, { x: cur.x, y: cur.y });
        const nf = tg + heuristic(nx, ny, gx, gy);
        const ex = open.findIndex((o) => o.x === nx && o.y === ny);
        if (ex >= 0 && open[ex].g <= tg) continue;
        if (ex >= 0) open.splice(ex, 1);
        open.push({ x: nx, y: ny, g: tg, f: nf });
      }
    }
    return null;
  }

  function reconstructA(parent, gx, gy) {
    /** @type {{x:number,y:number}[]} */
    const out = [];
    let cx = gx,
      cy = gy,
      pk = key(cx, cy);
    while (true) {
      out.push({ x: cx, y: cy });
      const p = parent.get(pk);
      if (p == null) break;
      cx = p.x;
      cy = p.y;
      pk = key(cx, cy);
    }
    out.reverse();
    return out;
  }

  /** Greedy best-first (expande primero menor h = Manhattan a la meta) */
  function searchGreedy(sx, sy, gx, gy) {
    if (!walkableCell(sx, sy) || !walkableCell(gx, gy)) return null;
    const open = [{ x: sx, y: sy, trace: [{ x: sx, y: sy }], h: heuristic(sx, sy, gx, gy) }];
    const visited = new Set([key(sx, sy)]);
    let nodes = 0;
    while (open.length) {
      open.sort((a, b) => a.h - b.h || a.trace.length - b.trace.length);
      const cur = open.shift();
      if (!cur) break;
      nodes++;
      if (cur.x === gx && cur.y === gy) return { path: cur.trace, nodes, algo: "Greedy" };
      const neigh = [];
      for (const d of forwardDelta) {
        const nx = cur.x + d.dx,
          ny = cur.y + d.dy;
        if (!walkableCell(nx, ny)) continue;
        const k = key(nx, ny);
        if (visited.has(k)) continue;
        neigh.push({
          nx,
          ny,
          k,
          h: heuristic(nx, ny, gx, gy),
        });
      }
      neigh.sort((a, b) => a.h - b.h);
      for (const { nx, ny, k, h } of neigh) {
        visited.add(k);
        open.push({ x: nx, y: ny, trace: cur.trace.concat([{ x: nx, y: ny }]), h });
      }
    }
    return null;
  }

  function runSearch(sx, sy, gx, gy, algo) {
    const a = (algo || "astar").toLowerCase();
    if (a === "bfs") return searchBFS(sx, sy, gx, gy);
    if (a === "dfs") return searchDFS(sx, sy, gx, gy);
    if (a === "greedy") return searchGreedy(sx, sy, gx, gy);
    return searchAStar(sx, sy, gx, gy);
  }

  function deltaToHeading(dx, dy) {
    if (dx === 0 && dy === -1) return 0;
    if (dx === 1 && dy === 0) return 1;
    if (dx === 0 && dy === 1) return 2;
    if (dx === -1 && dy === 0) return 3;
    return null;
  }

  function turnsNeeded(hFrom, hTo) {
    const diff = (hTo - hFrom + 4) % 4;
    /** @type {string[]} */
    const out = [];
    if (diff === 0) return out;
    if (diff <= 2) {
      for (let i = 0; i < diff; i++) out.push("derecha");
    } else {
      for (let i = 0; i < 4 - diff; i++) out.push("izquierda");
    }
    return out;
  }

  /** @param {{x:number,y:number}[]} pathCells */
  function pathToTcpMoves(pathCells) {
    if (!pathCells || pathCells.length < 2) return [];
    let x = pathCells[0].x,
      y = pathCells[0].y;
    let h = robot.h;
    readRobotFromInputs();
    if (pathCells[0].x !== robot.x || pathCells[0].y !== robot.y) {
      return [];
    }
    h = robot.h;
    /** @type {string[]} */
    const out = [];
    for (let i = 1; i < pathCells.length; i++) {
      const nx = pathCells[i].x,
        ny = pathCells[i].y;
      const dx = nx - x,
        dy = ny - y;
      const want = deltaToHeading(dx, dy);
      if (want === null) return [];
      turnsNeeded(h, want).forEach((t) => out.push(t));
      h = want;
      out.push("adelante");
      x = nx;
      y = ny;
    }
    return out;
  }

  function plannerAlgorithmId() {
    const a = (searchAlgoEl.value || "astar").toLowerCase();
    if (["bfs", "dfs", "astar", "greedy"].includes(a)) return a;
    return "astar";
  }

  function modeUsesGraphSearchPlanner() {
    const m = agentModeEl.value;
    return m === "3" || m === "4" || m === "5";
  }

  function findNearestUnknownFrom(sx, sy) {
    const algo = plannerAlgorithmId();
    let best = null;
    let bestD = 1e9;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (grid[y][x] !== "DESCONOCIDO") continue;
        if (!walkableCell(x, y)) continue;
        const r = runSearch(sx, sy, x, y, algo);
        if (r && r.path.length > 0 && r.path.length < bestD) {
          bestD = r.path.length;
          best = r.path;
        }
      }
    }
    return best && best.length > 1 ? best : null;
  }

  function renderMap() {
    readRobotFromInputs();
    const gx = clampInt(+goalXEl.value, 0, maxXi());
    const gy = clampInt(+goalYEl.value, 0, maxYi());
    const pathSet = new Set(pathHighlight.map((p) => key(p.x, p.y)));

    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const el = lfMapGrid.querySelector(`[data-x="${x}"][data-y="${y}"]`);
        if (!el) continue;
        const st = grid[y][x];
        el.className = "lf-cell lf-cell--" + st;
        el.querySelector(".lf-cell__xy").textContent = x + "," + y;
        el.classList.toggle("lf-cell--goalPick", x === gx && y === gy);
        el.classList.toggle("lf-cell--path", pathSet.has(key(x, y)));
        el.classList.toggle("lf-cell--robot", x === robot.x && y === robot.y);
        const arr = el.querySelector(".lf-cell__arrow");
        if (arr) {
          arr.textContent = x === robot.x && y === robot.y ? HDR[robot.h] : "";
        }
      }
    }
    if (lfMapGrid && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      lfMapGrid.classList.remove("lf-map-grid--flash");
      void lfMapGrid.offsetWidth;
      lfMapGrid.classList.add("lf-map-grid--flash");
    }
    lfSimRefreshRobotMarker();
  }

  function buildMapDom() {
    lfMapGrid.innerHTML = "";
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const d = document.createElement("div");
        d.className = "lf-cell lf-cell--DESCONOCIDO";
        d.dataset.x = String(x);
        d.dataset.y = String(y);
        d.title = "Clic: fijar meta en (" + x + "," + y + ")";
        d.innerHTML = '<span class="lf-cell__xy">' + x + "," + y + '</span><span class="lf-cell__arrow" aria-hidden="true"></span>';
        d.addEventListener("click", () => {
          goalXEl.value = String(x);
          goalYEl.value = String(y);
          renderMap();
        });
        lfMapGrid.appendChild(d);
      }
    }
  }

  function lfSimulationEnabled() {
    const el = document.getElementById("lfSimEnabled");
    return !!(el && el.checked);
  }

  async function lfSimNetworkDelay() {
    const inp = document.getElementById("lfSimDelayMs");
    let ms = inp ? clampInt(+inp.value, 0, 800) : 40;
    if (!Number.isFinite(ms)) ms = 40;
    if (ms <= 0) return;
    await new Promise((res) => setTimeout(res, ms));
  }

  function lfSimRgbForCell(cel) {
    const u = String(cel || "").toUpperCase();
    if (u === "VERDE") return { r: 65, g: 200, b: 90, c: 480 };
    if (u === "ROJO") return { r: 220, g: 60, b: 55, c: 620 };
    if (u === "AZUL") return { r: 55, g: 120, b: 220, c: 540 };
    return { r: 80, g: 80, b: 80, c: 200 };
  }

  function lfSimCellAtRobot() {
    readRobotFromInputs();
    if (!lfSimTerrain.length) return "AZUL";
    const x = robot.x,
      y = robot.y;
    if (!inBounds(x, y)) return "ROJO";
    const c = lfSimTerrain[y][x];
    return c === "VERDE" || c === "AZUL" || c === "ROJO" ? c : "AZUL";
  }

  function lfSimUltraDistCm() {
    const sense = document.getElementById("lfSimUltraSense");
    if (!(sense && sense.checked)) return 999;
    readRobotFromInputs();
    const fc = frontXY();
    if (!inBounds(fc.x, fc.y)) return 12;
    const t = lfSimTerrain[fc.y] && lfSimTerrain[fc.y][fc.x];
    return t === "ROJO" ? 10 : 999;
  }

  function lfSimBuildLeerJson() {
    const cel = lfSimCellAtRobot();
    const rgb = lfSimRgbForCell(cel);
    return {
      ok: true,
      celda: cel,
      dist: lfSimUltraDistCm(),
      r: rgb.r,
      g: rgb.g,
      b: rgb.b,
      c: rgb.c,
      sensor_ok: true,
      thresh: "sim=1",
      rgb_pct: null,
      raw_lines: ["SIM_LEER_LISTO"],
      servo_angle: 90,
    };
  }

  function lfSimEnsureSingleVerde() {
    if (!lfSimTerrain.length) return;
    let first = null;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (lfSimTerrain[y][x] === "VERDE") {
          if (first === null) first = { x, y };
          else lfSimTerrain[y][x] = "AZUL";
        }
      }
    }
    if (first === null) {
      readRobotFromInputs();
      const gx = clampInt(+goalXEl.value, 0, maxXi());
      const gy = clampInt(+goalYEl.value, 0, maxYi());
      lfSimTerrain[gy][gx] = "VERDE";
    }
  }

  function lfSimPersistTerrain() {
    try {
      localStorage.setItem(
        LF_SIM_STORAGE_KEY,
        JSON.stringify({ version: 1, w: GRID_W, h: GRID_H, rows: lfSimTerrain })
      );
    } catch (_) {}
  }

  function lfSimTryLoadTerrain() {
    try {
      const raw = localStorage.getItem(LF_SIM_STORAGE_KEY);
      if (!raw) return false;
      const o = JSON.parse(raw);
      if (o.version !== 1 || !Array.isArray(o.rows)) return false;
      if (o.w !== GRID_W || o.h !== GRID_H) return false;
      const rows = o.rows.map((row) =>
        row.map((c) => {
          const v = String(c || "").toUpperCase();
          if (v === "VERDE" || v === "AZUL" || v === "ROJO") return v;
          return "AZUL";
        })
      );
      if (rows.length !== GRID_H) return false;
      for (const row of rows) {
        if (!Array.isArray(row) || row.length !== GRID_W) return false;
      }
      lfSimTerrain = rows;
      lfSimEnsureSingleVerde();
      return true;
    } catch (_) {
      return false;
    }
  }

  function buildLfSimTerrainDom() {
    const g = document.getElementById("lfSimTerrainGrid");
    if (!g) return;
    g.innerHTML = "";
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const d = document.createElement("div");
        const v =
          lfSimTerrain[y] && lfSimTerrain[y][x] ? lfSimTerrain[y][x] : "AZUL";
        d.className = "lf-sim-cell lf-sim-cell--" + v;
        d.dataset.x = String(x);
        d.dataset.y = String(y);
        d.textContent = v === "VERDE" ? "G" : v === "ROJO" ? "█" : "·";
        d.title = "Pintar (" + x + "," + y + ") — " + (v === "VERDE" ? "meta" : v);
        d.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          lfSimPaintDrag = true;
          lfSimPaintCell(x, y);
        });
        d.addEventListener("mouseenter", () => {
          if (lfSimPaintDrag) lfSimPaintCell(x, y);
        });
        g.appendChild(d);
      }
    }
    lfSimRefreshRobotMarker();
  }

  function lfSimRefreshRobotMarker() {
    const g = document.getElementById("lfSimTerrainGrid");
    if (!g) return;
    readRobotFromInputs();
    g.querySelectorAll(".lf-sim-cell--robot").forEach((el) => el.classList.remove("lf-sim-cell--robot"));
    const el = g.querySelector(`[data-x="${robot.x}"][data-y="${robot.y}"]`);
    if (el) el.classList.add("lf-sim-cell--robot");
  }

  function lfSimPaintCell(x, y) {
    if (!inBounds(x, y) || !lfSimTerrain.length) return;
    lfSimTerrain[y][x] = lfSimBrush;
    lfSimEnsureSingleVerde();
    lfSimPersistTerrain();
    const g = document.getElementById("lfSimTerrainGrid");
    if (!g) return;
    for (let yy = 0; yy < GRID_H; yy++) {
      for (let xx = 0; xx < GRID_W; xx++) {
        const cell = g.querySelector(`[data-x="${xx}"][data-y="${yy}"]`);
        if (!cell) continue;
        const v = lfSimTerrain[yy][xx];
        cell.className = "lf-sim-cell lf-sim-cell--" + v;
        cell.textContent = v === "VERDE" ? "G" : v === "ROJO" ? "█" : "·";
        cell.title = "Pintar (" + xx + "," + yy + ") — " + (v === "VERDE" ? "meta" : v);
      }
    }
    lfSimRefreshRobotMarker();
  }

  function lfSimShufflePairs(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  function lfSimRemapTerrainFromPrev(prev, pw, ph) {
    lfSimTerrain = [];
    for (let y = 0; y < GRID_H; y++) {
      lfSimTerrain.push([]);
      for (let x = 0; x < GRID_W; x++) {
        let v = "AZUL";
        if (prev && prev.length && y < ph && x < pw && prev[y] && prev[y][x]) {
          const pv = prev[y][x];
          if (pv === "VERDE" || pv === "AZUL" || pv === "ROJO") v = pv;
        }
        lfSimTerrain[y].push(v);
      }
    }
    lfSimEnsureSingleVerde();
    lfSimPersistTerrain();
    buildLfSimTerrainDom();
  }

  function lfSimHydrateTerrainOnBoot() {
    if (lfSimTryLoadTerrain()) buildLfSimTerrainDom();
    else lfSimRemapTerrainFromPrev([], 0, 0);
  }

  function lfSimGenerarMazeTerrain() {
    const W = GRID_W;
    const H = GRID_H;
    const T_L = "L";
    const T_P = "P";
    const g = Array.from({ length: H }, () => Array(W).fill(T_P));
    const rooms = [];
    for (let r = 0; r < H; r += 2) {
      for (let c = 0; c < W; c += 2) {
        rooms.push([r, c]);
      }
    }
    if (rooms.length === 0) {
      lfSimFlatOpenTerrain();
      return;
    }
    function keyRC(r, c) {
      return r + "," + c;
    }
    const visited = new Set();
    const startIdx = Math.floor(Math.random() * rooms.length);
    const sr = rooms[startIdx][0];
    const sc = rooms[startIdx][1];
    const stack = [[sr, sc]];
    visited.add(keyRC(sr, sc));
    g[sr][sc] = T_L;
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
        if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
        if (visited.has(keyRC(nr, nc))) continue;
        candidates.push([nr, nc]);
      }
      lfSimShufflePairs(candidates);
      if (candidates.length === 0) {
        stack.pop();
        continue;
      }
      const next = candidates[0];
      const nr = next[0];
      const nc = next[1];
      const midR = (r + nr) >> 1;
      const midC = (c + nc) >> 1;
      g[midR][midC] = T_L;
      g[nr][nc] = T_L;
      visited.add(keyRC(nr, nc));
      stack.push([nr, nc]);
    }
    const metaCands = [];
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        if (g[r][c] === T_L) metaCands.push([r, c]);
      }
    }
    if (!metaCands.length) {
      lfSimFlatOpenTerrain();
      return;
    }
    const pickM = metaCands[Math.floor(Math.random() * metaCands.length)];
    lfSimTerrain = [];
    for (let y = 0; y < H; y++) {
      lfSimTerrain.push([]);
      for (let x = 0; x < W; x++) {
        let cel = "ROJO";
        if (g[y][x] === T_L) cel = "AZUL";
        lfSimTerrain[y].push(cel);
      }
    }
    lfSimTerrain[pickM[0]][pickM[1]] = "VERDE";
    lfSimEnsureSingleVerde();
    lfSimPersistTerrain();
    buildLfSimTerrainDom();
  }

  function lfSimFlatOpenTerrain() {
    lfSimTerrain = [];
    for (let y = 0; y < GRID_H; y++) {
      lfSimTerrain.push([]);
      for (let x = 0; x < GRID_W; x++) lfSimTerrain[y].push("AZUL");
    }
    readRobotFromInputs();
    const gx = clampInt(+goalXEl.value, 0, maxXi());
    const gy = clampInt(+goalYEl.value, 0, maxYi());
    lfSimTerrain[gy][gx] = "VERDE";
    lfSimPersistTerrain();
    buildLfSimTerrainDom();
  }

  function lfSimSnapRobotToFirstAzul() {
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (lfSimTerrain[y] && lfSimTerrain[y][x] === "AZUL") {
          robot.x = x;
          robot.y = y;
          writeRobotToInputs();
          renderMap();
          lfSimRefreshRobotMarker();
          return true;
        }
      }
    }
    return false;
  }

  function lfSimCopyTerrainToBelief() {
    readRobotFromInputs();
    const gxFallback = clampInt(+goalXEl.value, 0, maxXi());
    const gyFallback = clampInt(+goalYEl.value, 0, maxYi());
    if (!lfSimTerrain.length) return;
    let mx = -1,
      my = -1;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        let st = /** @type {MapState} */ ("DESCONOCIDO");
        const t = lfSimTerrain[y][x];
        if (t === "VERDE") {
          st = "OBJETIVO";
          mx = x;
          my = y;
        } else if (t === "AZUL") st = "LIBRE";
        else if (t === "ROJO") st = "OBSTACULO";
        grid[y][x] = st;
      }
    }
    if (mx >= 0 && my >= 0) {
      goalXEl.value = String(mx);
      goalYEl.value = String(my);
    } else if (inBounds(gxFallback, gyFallback)) {
      grid[gyFallback][gxFallback] = "OBJETIVO";
    }
    renderMap();
    if (agentModeEl.value === "4" || agentModeEl.value === "5") doPlan(true);
    msgEl.textContent =
      mx >= 0
        ? "Mapa ⇐ terreno: meta desde celda VERDE · coordenadas de meta sincronizadas."
        : "Mapa ⇐ terreno: sin VERDE en suelo · meta desde Meta X/Y del panel.";
    msgEl.className = "msg ok";
  }

  function lfSimUiRefresh() {
    const chip = document.getElementById("lfSimChip");
    const on = lfSimulationEnabled();
    if (chip) chip.hidden = !on;
    if (hostEl) {
      hostEl.classList.toggle("lf-host--dim", !!on);
      hostEl.placeholder = on ? "(simulación — IP opcional)" : "192.168.x.x · 10.x.x.x";
    }
    lfSchedulePingRestart();
  }

  function captureAutonomyEndTime() {
    if (autonomyStartedAtMs !== null && autonomyEndedAtMs === null) autonomyEndedAtMs = Date.now();
  }

  function autonomyTimerSecondsDisplayed() {
    if (autonomyStartedAtMs === null) return null;
    let endMs = autonomyEndedAtMs;
    if (endMs == null) endMs = autorunActive ? Date.now() : autonomyEndedAtMs;
    if (endMs == null) return 0;
    return Math.floor((endMs - autonomyStartedAtMs) / 1000);
  }

  function updateMetrics() {
    document.getElementById("mMoves").textContent = String(movesSent);
    const tAuto = autonomyTimerSecondsDisplayed();
    const mTimeEl = document.getElementById("mTime");
    if (mTimeEl)
      mTimeEl.textContent = tAuto === null ? "—" : tAuto + " s";
    const showSearchKpi = modeUsesGraphSearchPlanner();
    document.getElementById("mNodes").textContent =
      showSearchKpi && lastSearchNodes > 0 ? String(lastSearchNodes) : "—";
    document.getElementById("mPathLen").textContent =
      showSearchKpi && lastPathLen > 0 ? String(lastPathLen) : "—";
  }

  function setAgentState(s) {
    const el = document.getElementById("mState");
    if (el) el.textContent = s;
  }

  function parseMsPulseInput(el, fallbackMs) {
    if (!el) return fallbackMs;
    const ms = parseInt(el.value, 10);
    if (!Number.isFinite(ms)) return fallbackMs;
    return Math.max(50, Math.min(60000, ms));
  }

  function getLfCellPulseMsForDir(dir) {
    const id = LF_PULSE_IDS[dir];
    const el = id ? document.getElementById(id) : null;
    return parseMsPulseInput(el, 350);
  }

  /** Compat: referencia típica = avance. */
  function getLfCellPulseMs() {
    return getLfCellPulseMsForDir("adelante");
  }

  function updateLfCellMoveHint() {
    if (!lfCellMoveMsHint) return;
    const a = getLfCellPulseMsForDir("adelante");
    const t = getLfCellPulseMsForDir("atras");
    const iz = getLfCellPulseMsForDir("izquierda");
    const d = getLfCellPulseMsForDir("derecha");
    lfCellMoveMsHint.textContent =
      "Actual (ms): ↑ " +
      a +
      " · ↓ " +
      t +
      " · ◀ " +
      iz +
      " · ▶ " +
      d +
      ". Giros suele necesitar otros tiempos que el avance.";
  }

  function savePrefs() {
    try {
      localStorage.setItem("robotPanelHost", hostEl.value.trim());
      localStorage.setItem("robotPanelPort", String(parseInt(portEl.value, 10) || 8888));
      localStorage.setItem("lfAuto", lfAuto.checked ? "1" : "0");
      localStorage.setItem("lfInterval", lfInterval.value || "1500");
      localStorage.setItem("lfOnlyOnChange", lfOnlyOnChange.checked ? "1" : "0");
      localStorage.setItem("lfColorPreset", colorPresetEl.value);
      localStorage.setItem("lfAgentMode", agentModeEl.value);
      localStorage.setItem("lfSearchAlgo", searchAlgoEl.value);
      localStorage.setItem("lfAutorunDelay", autorunDelayEl ? autorunDelayEl.value || "800" : "800");
      Object.keys(LF_PULSE_IDS).forEach((k) => {
        const el = document.getElementById(LF_PULSE_IDS[k]);
        if (el) localStorage.setItem(LF_PULSE_LS[k], el.value);
      });
      const lfSimE = document.getElementById("lfSimEnabled");
      const lfSimUltra = document.getElementById("lfSimUltraSense");
      const lfSimDel = document.getElementById("lfSimDelayMs");
      if (lfSimE) localStorage.setItem("lfSimEnabled", lfSimE.checked ? "1" : "0");
      if (lfSimUltra) localStorage.setItem("lfSimUltraSense", lfSimUltra.checked ? "1" : "0");
      if (lfSimDel) localStorage.setItem("lfSimDelayMs", String(lfSimDel.value || "40"));
      persistGridDims();
    } catch (_) {}
  }

  function loadPrefs() {
    try {
      const h = localStorage.getItem("robotPanelHost");
      const p = localStorage.getItem("robotPanelPort");
      if (h) hostEl.value = h;
      if (p) portEl.value = p;
      if (localStorage.getItem("lfAuto") === "1") lfAuto.checked = true;
      const ms = localStorage.getItem("lfInterval");
      if (ms && [...lfInterval.options].some((o) => o.value === ms)) lfInterval.value = ms;
      if (localStorage.getItem("lfOnlyOnChange") === "1") lfOnlyOnChange.checked = true;
      const cp = localStorage.getItem("lfColorPreset");
      if (cp && [...colorPresetEl.options].some((o) => o.value === cp)) {
        colorPresetEl.value = cp;
      } else if (cp === "enunciado" || cp === "pista" || cp === "metodologia") {
        colorPresetEl.value = "rgb3060";
      }
      let baseMs = "350";
      const lfm = localStorage.getItem("lfCellMoveMs");
      const legacyManual = localStorage.getItem("manualMovePulseMs");
      const legacySec = localStorage.getItem("lfCellMoveSec");
      if (lfm != null && lfm !== "") baseMs = lfm;
      else if (legacyManual != null && legacyManual !== "") baseMs = legacyManual;
      if (legacySec != null && legacySec !== "") {
        const sec = parseFloat(legacySec);
        if (Number.isFinite(sec)) {
          baseMs = String(Math.max(50, Math.min(60000, Math.round(sec * 1000))));
        }
      }
      ["adelante", "atras", "izquierda", "derecha"].forEach((d) => {
        const el = document.getElementById(LF_PULSE_IDS[d]);
        if (!el) return;
        const saved = localStorage.getItem(LF_PULSE_LS[d]);
        el.value = saved != null && saved !== "" ? saved : baseMs;
      });
      updateLfCellMoveHint();
      const am = localStorage.getItem("lfAgentMode");
      if (am && [...agentModeEl.options].some((o) => o.value === am)) agentModeEl.value = am;
      const sa = localStorage.getItem("lfSearchAlgo");
      if (sa && [...searchAlgoEl.options].some((o) => o.value === sa)) searchAlgoEl.value = sa;
      const ad = localStorage.getItem("lfAutorunDelay");
      if (autorunDelayEl && ad && [...autorunDelayEl.options].some((o) => o.value === ad)) autorunDelayEl.value = ad;

      const lfSimE = document.getElementById("lfSimEnabled");
      const lfSimUltra = document.getElementById("lfSimUltraSense");
      const lfSimDel = document.getElementById("lfSimDelayMs");
      if (lfSimE) lfSimE.checked = localStorage.getItem("lfSimEnabled") === "1";
      if (lfSimUltra) lfSimUltra.checked = localStorage.getItem("lfSimUltraSense") !== "0";
      if (lfSimDel) {
        const dv = localStorage.getItem("lfSimDelayMs");
        if (dv != null && dv !== "") lfSimDel.value = dv;
      }
      lfSimUiRefresh();
    } catch (_) {}
  }

  function setCeldaClass(celda) {
    if (!celda || celda === "—") {
      celdaBadge.className = "badge UNKNOWN lf-chip-sensor";
      celdaBadge.textContent = "—";
      return;
    }
    const allowed = ["ROJO", "AZUL", "VERDE", "BLANCO", "UNKNOWN", "SKIP"];
    const t = allowed.includes(celda) ? celda : "UNKNOWN";
    celdaBadge.className = "badge " + t + " lf-chip-sensor";
    celdaBadge.textContent = celda;
  }

  function pushLog(entry) {
    logRows.push(entry);
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" +
      escapeHtml(entry.t) +
      "</td><td>" +
      escapeHtml(entry.xy) +
      "</td><td>" +
      escapeHtml(entry.mapSt) +
      "</td><td><strong>" +
      escapeHtml(entry.celda) +
      "</strong></td><td>" +
      escapeHtml(entry.dist) +
      "</td><td>" +
      escapeHtml(entry.note) +
      "</td>";
    logBody.appendChild(tr);
    const wrap = logBody.closest(".lf-log-wrap");
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function shouldRecord(rawCelda, distStr) {
    if (!lfOnlyOnChange.checked) return true;
    const sig = rawCelda + "|" + distStr + "|" + robot.x + "," + robot.y;
    if (sig === lastLoggedRawSig) return false;
    lastLoggedRawSig = sig;
    return true;
  }

  function parseThreshString(thresh) {
    const out = {};
    if (!thresh || typeof thresh !== "string") return out;
    for (const part of thresh.split(",")) {
      const i = part.indexOf("=");
      if (i <= 0) continue;
      const k = part.slice(0, i).trim().toLowerCase();
      out[k] = part.slice(i + 1).trim();
    }
    return out;
  }

  function applyThreshToTcsInputs(thresh) {
    const m = parseThreshString(thresh);
    const pairs = [
      ["cmin", "lfTcsCmin"],
      ["pb", "lfTcsPb"],
      ["pg", "lfTcsPg"],
      ["pr", "lfTcsPr"],
      ["wg", "lfTcsWg"],
      ["wd", "lfTcsWd"],
      ["blc", "lfTcsBlc"],
      ["blcp", "lfTcsBlcp"],
      ["bdg", "lfTcsBdg"],
      ["bdp", "lfTcsBdp"],
      ["bsg", "lfTcsBsg"],
      ["bsp", "lfTcsBsp"],
    ];
    for (const [key, id] of pairs) {
      if (m[key] === undefined) continue;
      const el = document.getElementById(id);
      if (el) el.value = m[key];
    }
  }

  function tcsCalQuerySuffix() {
    const spec = [
      ["cmin", "lfTcsCmin"],
      ["pb", "lfTcsPb"],
      ["pg", "lfTcsPg"],
      ["pr", "lfTcsPr"],
      ["wg", "lfTcsWg"],
      ["wd", "lfTcsWd"],
      ["blc", "lfTcsBlc"],
      ["blcp", "lfTcsBlcp"],
      ["bdg", "lfTcsBdg"],
      ["bdp", "lfTcsBdp"],
      ["bsg", "lfTcsBsg"],
      ["bsp", "lfTcsBsp"],
    ];
    const parts = [];
    for (const [k, id] of spec) {
      const el = document.getElementById(id);
      if (!el) continue;
      const v = String(el.value).trim();
      if (v === "") continue;
      parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(v));
    }
    return parts.length ? "&" + parts.join("&") : "";
  }

  async function leer(silent) {
    const host = hostEl.value.trim();
    const port = parseInt(portEl.value, 10) || 8888;
    if (!lfSimulationEnabled() && !host) {
      if (!silent) {
        msgEl.textContent = "Escribí la IP del ESP32 o activá el simulador.";
        msgEl.className = "msg err";
      }
      return null;
    }
    const task = leerChain.then(async () => {
      inFlightLeer = true;
      if (!silent) {
        msgEl.textContent = "Leyendo…";
        msgEl.className = "msg";
      }
      try {
        let j;
        if (lfSimulationEnabled()) {
          await lfSimNetworkDelay();
          j = lfSimBuildLeerJson();
        } else {
          const res = await fetch("/api/leer?host=" + encodeURIComponent(host) + "&port=" + port);
          j = await res.json();
        }
        if (!j.ok) {
          msgEl.textContent = j.error || "Error LEER";
          msgEl.className = "msg err";
          return null;
        }
        msgEl.textContent = silent ? "" : "LEER OK — mapa actualizado";
        msgEl.className = silent ? "msg" : "msg ok";
        lastLeerThresh = typeof j.thresh === "string" ? j.thresh : "";
        const celda = j.celda != null ? String(j.celda) : "—";
        setCeldaClass(celda);
        const distStr = j.dist != null ? (j.dist >= 999 ? "999 (sin eco)" : String(j.dist) + " cm") : "—";
        distEl.textContent = "Distancia · " + distStr;

        const changedUltra = integrateSensors(j);
        readRobotFromInputs();
        const ms = grid[robot.y][robot.x];
        mapStateReadout.textContent = "Mapa · " + ms + " @ (" + robot.x + "," + robot.y + ")";

        if (shouldRecord(celda, distStr)) {
          pushLog({
            t: new Date().toLocaleTimeString(),
            xy: robot.x + "," + robot.y,
            mapSt: ms,
            celda: celda,
            dist: distStr,
            note: silent ? "(auto)" : "(manual)",
          });
        }

        renderMap();
        if (changedUltra && autoReplanEl.checked && (agentModeEl.value === "4" || agentModeEl.value === "5")) {
          doPlan(true);
        }
        return j;
      } catch (e) {
        msgEl.textContent = String(e);
        msgEl.className = "msg err";
        return null;
      } finally {
        inFlightLeer = false;
      }
    });
    leerChain = task.catch(() => {});
    return await task;
  }

  function applyLfPoseDeltaForDir(dir) {
    readRobotFromInputs();
    if (dir === "adelante") {
      const d = forwardDelta[robot.h];
      robot.x = clampInt(robot.x + d.dx, 0, maxXi());
      robot.y = clampInt(robot.y + d.dy, 0, maxYi());
    } else if (dir === "atras") {
      const d = forwardDelta[robot.h];
      robot.x = clampInt(robot.x - d.dx, 0, maxXi());
      robot.y = clampInt(robot.y - d.dy, 0, maxYi());
    } else if (dir === "izquierda") {
      robot.h = (robot.h + 3) % 4;
    } else if (dir === "derecha") {
      robot.h = (robot.h + 1) % 4;
    }
    writeRobotToInputs();
    renderMap();
    updateMetrics();
  }

  async function lfFetchMover(host, port, dir) {
    if (lfSimulationEnabled()) {
      await lfSimNetworkDelay();
      return {
        ok: true,
        dir: String(dir || "").toLowerCase(),
        ms: null,
        raw_lines: ["SIM_MOVER_LISTO"],
      };
    }
    let url =
      "/api/mover?host=" + encodeURIComponent(host) + "&port=" + port + "&dir=" + encodeURIComponent(dir);
    if (dir !== "detener") url += "&ms=" + String(getLfCellPulseMsForDir(dir));
    const res = await fetch(url);
    return res.json();
  }

  /**
   * Desplazamiento físico (sin contador inFlightTcp). Usado para rollback ROJO dentro de un MOVER ya bloqueado.
   * @returns {boolean}
   */
  async function lfTcpMoveNoGuard(host, port, dir) {
    const j = await lfFetchMover(host, port, dir);
    if (!j.ok) {
      msgEl.textContent = j.error || "Fallo MOVER";
      msgEl.className = "msg err";
      setAgentState("Error TCP");
      return false;
    }
    movesSent++;
    applyLfPoseDeltaForDir(dir);
    return true;
  }

  async function execMover(dir) {
    const host = hostEl.value.trim();
    const port = parseInt(portEl.value, 10) || 8888;
    if (!lfSimulationEnabled() && !host) {
      msgEl.textContent = "Falta IP para MOVER (o activá simulador).";
      msgEl.className = "msg err";
      return false;
    }
    if (inFlightTcp) return false;
    lfLastDisplacementBlockedByRed = false;
    inFlightTcp = true;
    setAgentState("Enviando " + dir + "…");
    try {
      const j = await lfFetchMover(host, port, dir);
      if (!j.ok) {
        msgEl.textContent = j.error || "Fallo MOVER";
        msgEl.className = "msg err";
        setAgentState("Error TCP");
        return false;
      }
      movesSent++;
      applyLfPoseDeltaForDir(dir);

      let skipListoBanner = false;
      if (dir === "adelante" || dir === "atras") {
        const lj = await leer(true);
        const raw =
          lj && lj.celda != null ? String(lj.celda).toUpperCase().trim() : "";
        if (lj && raw === "ROJO") {
          lfLastDisplacementBlockedByRed = true;
          const rev = dir === "adelante" ? "atras" : "adelante";
          msgEl.textContent = "CELDA ROJA (obstáculo) → ejecutando retroceso.";
          msgEl.className = "msg err";
          setAgentState("Retroceso…");
          const okRb = await lfTcpMoveNoGuard(host, port, rev);
          if (!okRb) {
            msgEl.textContent =
              "Retroceso tras ROJO falló (" +
              (lfSimulationEnabled() ? "simulador" : "TCP") +
              "). La pose en el panel puede no coincidir con el robot físico.";
            msgEl.className = "msg err";
            return false;
          }
          await leer(true);
          skipListoBanner = true;
          msgEl.textContent =
            "ROJO detectado tras desplazar: revertido a la celda anterior; casilla frontal marcada como obstáculo en el mapa.";
          msgEl.className = "msg ok";
        }
      }

      if (!skipListoBanner) {
        msgEl.textContent = "MOVER " + dir + " — LISTO";
        msgEl.className = "msg ok";
      }
      setAgentState("Listo");
      return true;
    } catch (e) {
      msgEl.textContent = String(e);
      msgEl.className = "msg err";
      setAgentState("Error red");
      return false;
    } finally {
      inFlightTcp = false;
    }
  }

  function plannerFailureHint(sx, sy, gx, gy) {
    if (!walkableCell(sx, sy))
      return "La celda del robot no es transitable (DESCONOCIDO sin casilla): activá «Desconocido transitable al planificar» o LEER sobre azul/verde-meta para marcar el suelo.";
    if (!walkableCell(gx, gy))
      return "La meta no es transitable: misma condición (mapa o casilla desconocida).";
    return "Sin ruta hasta la meta: revisá obstáculos rojos, paredes por ultrasonido o que el mapa refleje el laberinto real.";
  }

  function doPlan(silent) {
    readRobotFromInputs();
    const gx = clampInt(+goalXEl.value, 0, maxXi());
    const gy = clampInt(+goalYEl.value, 0, maxYi());
    const algo = plannerAlgorithmId();
    const res = runSearch(robot.x, robot.y, gx, gy, algo);
    if (!res || !res.path.length) {
      lastSearchNodes = 0;
      lastPathLen = 0;
      pathHighlight = [];
      tcpQueue = [];
      planPreviewEl.textContent = plannerFailureHint(robot.x, robot.y, gx, gy);
      renderMap();
      updateMetrics();
      return false;
    }
    lastSearchNodes = res.nodes;
    lastPathLen = res.path.length;
    pathHighlight = res.path.slice();
    const moves = pathToTcpMoves(res.path);
    tcpQueue = moves;
    planPreviewEl.textContent =
      res.algo +
      " · nodos " +
      res.nodes +
      " · celdas " +
      res.path.length +
      "\nTCP: " +
      (moves.length ? moves.join(", ") : "(ya en meta o sin pasos)");
    renderMap();
    updateMetrics();
    return true;
  }

  function reactivePickMove() {
    readRobotFromInputs();
    const dcm = lastDistCm;
    const u = clampInt(+ultraThreshEl.value, 1, 80) || 15;
    if (dcm != null && dcm < 999 && dcm < u) return "izquierda";
    const raw = (lastRawCelda || "").toUpperCase();
    if (raw === "ROJO") return "STOP";
    const fc = frontXY();
    if (inBounds(fc.x, fc.y) && grid[fc.y][fc.x] === "OBSTACULO") return "derecha";
    const want = Math.random() < 0.5 ? "izquierda" : "derecha";
    if (!walkableCell(fc.x, fc.y) && fc.x !== undefined) return want;
    return "adelante";
  }

  function exploradorNextTcp() {
    readRobotFromInputs();
    const path = findNearestUnknownFrom(robot.x, robot.y);
    if (!path) return "STOP";
    const moves = pathToTcpMoves(path);
    if (!moves.length) return "STOP";
    tcpQueue = moves.slice(1);
    planPreviewEl.textContent =
      "Explorador hacia DESCONOCIDO · restante TCP: " + tcpQueue.slice(0, 10).join(", ") + (tcpQueue.length > 10 ? "…" : "");
    return moves[0];
  }

  function qlDemoMove() {
    const opts = [];
    readRobotFromInputs();
    const fc = frontXY();
    if (
      lastDistCm != null &&
      lastDistCm < 999 &&
      lastDistCm < (clampInt(+ultraThreshEl.value, 1, 80) || 15)
    ) {
      opts.push("izquierda", "derecha");
    } else if (inBounds(fc.x, fc.y) && grid[fc.y][fc.x] !== "OBSTACULO" && walkableCell(fc.x, fc.y))
      opts.push("adelante");
    else opts.push("izquierda", "derecha", "atras");
    return opts[Math.floor(Math.random() * opts.length)];
  }

  /**
   * Un ciclo completo del agente: LEER + decisión + un MOVER (excepto algunos STOP).
   * @returns {{ stopAutorun: boolean }}
   */
  async function stepAgentCore() {
    savePrefs();
    const host = hostEl.value.trim();
    if (!lfSimulationEnabled() && !host) {
      msgEl.textContent = "Escribí la IP del ESP32 o activá el simulador para ejecutar el agente.";
      msgEl.className = "msg err";
      return { stopAutorun: true };
    }

    const lj = await leer(true);
    if (lj === null) {
      if (msgEl.className !== "msg err" || !String(msgEl.textContent || "").trim()) {
        msgEl.textContent = "LEER falló: revisá IP, puerto y que el ESP32 responda (o probá «Leer sensores» manual).";
      }
      msgEl.className = "msg err";
      return { stopAutorun: true };
    }

    readRobotFromInputs();
    const mode = agentModeEl.value;
    const gx = clampInt(+goalXEl.value, 0, maxXi());
    const gy = clampInt(+goalYEl.value, 0, maxYi());
    /** Modos 2/4/5 usan la meta por coordenadas; 1 (cola fija) y 3/6 no deben frenar solo por estar en la meta. */
    if ((mode === "2" || mode === "4" || mode === "5") && robot.x === gx && robot.y === gy) {
      msgEl.textContent = "Meta alcanzada (coordenadas). Autonomía detenida.";
      msgEl.className = "msg ok";
      return { stopAutorun: true };
    }

    if (mode === "1") {
      const next = programQueue.shift();
      if (!next) {
        msgEl.textContent = "Cola programada terminada.";
        msgEl.className = "msg ok";
        return { stopAutorun: true };
      }
      if (next === "detener") {
        await execMover("detener");
        return { stopAutorun: false };
      }
      const ok = await execMover(next);
      return { stopAutorun: !ok };
    }

    if (mode === "2") {
      const m = reactivePickMove();
      if (m === "STOP") {
        msgEl.textContent = "Reactivo: condición de parada (meta u obstáculo actual).";
        msgEl.className = "msg ok";
        return { stopAutorun: true };
      }
      const ok = await execMover(m);
      return { stopAutorun: !ok };
    }

    if (mode === "3") {
      const m = exploradorNextTcp();
      if (m === "STOP") {
        msgEl.textContent =
          "Explorador: sin frontera alcanzable. Revisá desconocidos transitables o la pose.";
        msgEl.className = "msg err";
        return { stopAutorun: true };
      }
      const ok = await execMover(m);
      return { stopAutorun: !ok };
    }

    if (mode === "4" || mode === "5") {
      doPlan(true);
      const next = tcpQueue.shift();
      if (!next) {
        msgEl.textContent = plannerFailureHint(robot.x, robot.y, gx, gy);
        msgEl.className = "msg err";
        return { stopAutorun: true };
      }
      const ok = await execMover(next);
      if (lfLastDisplacementBlockedByRed) doPlan(true);
      return { stopAutorun: !ok };
    }

    if (mode === "6") {
      const m = qlDemoMove();
      const ok = await execMover(m);
      return { stopAutorun: !ok };
    }

    return { stopAutorun: true };
  }

  async function stepAgent() {
    await stepAgentCore();
  }

  /* —— Autonomía (Iniciar / Detener) —— */
  let autorunActive = false;
  let autorunTimeout = null;
  let lfAutoSuspendedByAutorun = false;

  const LF_PING_INTERVAL_MS = 2500;
  let lfPingTimer = null;
  let lfPingInFlight = false;
  let lfPingDeb = null;

  function lfPausePing() {
    if (lfPingTimer) {
      clearInterval(lfPingTimer);
      lfPingTimer = null;
    }
  }

  function lfPingStripIdle(caption) {
    const strip = document.getElementById("lfPingLive");
    const msEl = document.getElementById("lfPingMs");
    const cap = document.getElementById("lfPingCaption");
    if (!strip || !msEl || !cap) return;
    strip.className = "lf-ping-live lf-ping-live--idle";
    msEl.textContent = "—";
    cap.textContent = caption || "Sin IP";
  }

  function lfPingBlocked() {
    return autorunActive || inFlightTcp || inFlightLeer;
  }

  async function lfPingOnce() {
    const strip = document.getElementById("lfPingLive");
    const msEl = document.getElementById("lfPingMs");
    const cap = document.getElementById("lfPingCaption");
    const host = hostEl.value.trim();
    const port = parseInt(portEl.value, 10) || 8888;
    if (!strip || !msEl || !cap) return;

    if (lfSimulationEnabled()) {
      strip.className = "lf-ping-live lf-ping-live--ok";
      msEl.textContent = "—";
      cap.textContent = "Simulador (sin TCP al ESP32)";
      return;
    }

    if (!host) {
      lfPausePing();
      lfPingStripIdle("Escribí la IP del ESP32");
      return;
    }

    if (lfPingBlocked()) {
      strip.classList.remove("lf-ping-live--idle", "lf-ping-live--ok", "lf-ping-live--fail", "lf-ping-live--wait");
      strip.classList.add("lf-ping-live--busy");
      msEl.textContent = "—";
      cap.textContent = autorunActive ? "Autonomía · ping en pausa" : "Sesión TCP ocupada (LEER/MOVER)";
      return;
    }

    if (lfPingInFlight) return;
    lfPingInFlight = true;
    strip.classList.remove("lf-ping-live--idle", "lf-ping-live--ok", "lf-ping-live--fail", "lf-ping-live--busy");
    strip.classList.add("lf-ping-live--wait");
    cap.textContent = "Comprobando…";
    try {
      const res = await fetch("/api/ping?host=" + encodeURIComponent(host) + "&port=" + port);
      const j = await res.json();
      const msTxt = j.ms_tcp != null ? j.ms_tcp + " ms" : "—";
      if (j.ok && j.pong) {
        strip.className = "lf-ping-live lf-ping-live--ok";
        msEl.textContent = msTxt;
        cap.textContent = "Conexión viva · PONG";
      } else {
        strip.className = "lf-ping-live lf-ping-live--fail";
        msEl.textContent = msTxt;
        cap.textContent = (j.error || "Sin PONG").replace(/^Error\s+/i, "");
      }
    } catch (e) {
      strip.className = "lf-ping-live lf-ping-live--fail";
      msEl.textContent = "—";
      cap.textContent = String(e);
    } finally {
      lfPingInFlight = false;
    }
  }

  function lfResumePing() {
    lfPausePing();
    const host = hostEl.value.trim();
    if (!lfSimulationEnabled() && !host) {
      lfPingStripIdle("Escribí la IP del ESP32");
      return;
    }
    void lfPingOnce();
    lfPingTimer = setInterval(lfPingOnce, LF_PING_INTERVAL_MS);
  }

  function lfSchedulePingRestart() {
    clearTimeout(lfPingDeb);
    lfPingDeb = setTimeout(lfResumePing, 340);
  }

  function updateAutorunUi() {
    if (btnAutorunStart) btnAutorunStart.disabled = autorunActive;
    if (btnAutorunStop) btnAutorunStop.disabled = !autorunActive;
  }

  function stopAutorun() {
    captureAutonomyEndTime();
    autorunActive = false;
    if (autorunTimeout) {
      clearTimeout(autorunTimeout);
      autorunTimeout = null;
    }
    setAgentState("Listo");
    if (autorunStatusEl) autorunStatusEl.textContent = "";
    if (lfAutoSuspendedByAutorun && lfAuto) {
      lfAutoSuspendedByAutorun = false;
      lfAuto.checked = true;
      syncLfAuto();
    }
    updateAutorunUi();
    lfSchedulePingRestart();
  }

  function scheduleNextAutorunStep() {
    if (!autorunActive) return;
    const delay = clampInt(parseInt(autorunDelayEl && autorunDelayEl.value, 10) || 800, 200, 20000);
    autorunTimeout = setTimeout(() => {
      void runAutorunLoop();
    }, delay);
  }

  async function runAutorunLoop() {
    if (!autorunActive) return;
    try {
      const r = await stepAgentCore();
      if (!autorunActive) return;
      if (r.stopAutorun) {
        autorunActive = false;
        captureAutonomyEndTime();
        if (autorunStatusEl) autorunStatusEl.textContent = "Autonomía finalizada.";
        updateAutorunUi();
        setAgentState("Listo");
        return;
      }
      if (!autorunActive) return;
      if (autorunStatusEl) {
        autorunStatusEl.textContent =
          "Autonomía activa · modo " + agentModeEl.value + " · próximo ciclo en " + (parseInt(autorunDelayEl.value, 10) || 800) + " ms";
      }
      scheduleNextAutorunStep();
    } catch (e) {
      msgEl.textContent = String(e);
      msgEl.className = "msg err";
      stopAutorun();
    }
  }

  function startAutorun() {
    savePrefs();
    const host = hostEl.value.trim();
    if (!lfSimulationEnabled() && !host) {
      msgEl.textContent = "Activá simulador o poné la IP del ESP32.";
      msgEl.className = "msg err";
      return;
    }
    if (agentModeEl.value === "1") {
      if (!programQueue.length) loadProgramFromTextarea();
      if (!programQueue.length) {
        msgEl.textContent =
          "Modo programado: escribí líneas válidas (adelante, atras, izquierda, derecha, detener) y tocá «Cargar cola».";
        msgEl.className = "msg err";
        return;
      }
    }
    if (lfAuto.checked) {
      lfAutoSuspendedByAutorun = true;
      lfAuto.checked = false;
      stopLfTimer();
    }
    try {
      localStorage.setItem("lfAutorunDelay", autorunDelayEl.value || "800");
    } catch (_) {}
    autonomyStartedAtMs = Date.now();
    autonomyEndedAtMs = null;
    autorunActive = true;
    updateAutorunUi();
    void lfPingOnce();
    setAgentState("Autonomía");
    const delayMs = autorunDelayEl && autorunDelayEl.value ? autorunDelayEl.value : "?";
    if (autorunStatusEl) {
      autorunStatusEl.textContent =
        "Autonomía activa · modo " + agentModeEl.selectedOptions[0].text.trim() + " · intervalo " + delayMs + " ms";
    }
    msgEl.textContent = "Autonomía iniciada — el robot ejecutará pasos según el modo seleccionado.";
    msgEl.className = "msg ok";
    void runAutorunLoop();
  }

  function syncProgrammedVisibility() {
    programmedBlock.style.display = agentModeEl.value === "1" ? "block" : "none";
    const m = agentModeEl.value;
    const usesPlanner = modeUsesGraphSearchPlanner();
    if (searchAlgoEl.disabled !== !usesPlanner) {
      searchAlgoEl.disabled = !usesPlanner;
      searchAlgoEl.classList.toggle("lf-select--muted", !usesPlanner);
      if (lfSearchAlgoLabel) lfSearchAlgoLabel.classList.toggle("lf-label-muted", !usesPlanner);
    }
    if (!usesPlanner) {
      pathHighlight = [];
      if (!autorunActive) {
        lastSearchNodes = 0;
        lastPathLen = 0;
      }
      renderMap();
    }
    if (lfSearchKpiHint)
      lfSearchKpiHint.textContent = usesPlanner
        ? "Nodos · largo de ruta: salen del último grafo explorado («Calcular ruta» o un paso del modo 3/4/5)."
        : "Sin búsqueda en grilla en este modo: desplegable «Algoritmo» desactivado. Los KPI muestran —.";
    const hints = {
      1: "Cola fija desde el cuadro de texto (se parsea al elegir este modo y al ▶ Iniciar). Sin grilla · Algoritmo desactivado.",
      2: "Reglas reactivas por color/distancia · sin grafos.",
      3: "Hacia DESCONOCIDO en grilla transitables — sí usa Algoritmo (misma meta cercana «desconocida» repetidamente por trayecto). «Calcular ruta» proyecta hasta la meta clicada.",
      4: "Objetivos fijos: meta = coordenadas (clic o Meta X/Y) y/o suelo VERDE=TCS como meta en mapa. Algoritmo cada ciclo.",
      5: "Misma ruta-plan que 4 (demo comparativa informe): usa Algoritmo.",
      6: "Aleatorio seguridad local · sin grafos.",
    };
    agentHintEl.textContent = hints[m] || "";
  }

  function startLfTimer() {
    stopLfTimer();
    const ms = parseInt(lfInterval.value, 10) || 1500;
    lfTimer = setInterval(() => leer(true), ms);
  }

  function stopLfTimer() {
    if (lfTimer) {
      clearInterval(lfTimer);
      lfTimer = null;
    }
  }

  function syncLfAuto() {
    savePrefs();
    stopLfTimer();
    if (lfAuto.checked) {
      if (!lfSimulationEnabled() && !hostEl.value.trim()) {
        lfAuto.checked = false;
        return;
      }
      leer(true);
      startLfTimer();
    }
  }

  function loadProgramFromTextarea() {
    const lines = programmedSeqEl.value.split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const allowed = ["adelante", "atras", "izquierda", "derecha", "detener"];
    programQueue = lines.filter((l) => allowed.includes(l));
    return programQueue.length;
  }

  btnLoadProgram.addEventListener("click", () => {
    const n = loadProgramFromTextarea();
    if (!n) {
      msgEl.textContent = "No hay comandos reconocidos. Usá: adelante, atras, izquierda, derecha, detener (una por línea).";
      msgEl.className = "msg err";
      return;
    }
    msgColaPrograma();
  });

  function msgColaPrograma() {
    msgEl.textContent = "Cola programada: " + programQueue.length + " acciones.";
    msgEl.className = "msg ok";
  }

  btnLeer.addEventListener("click", () => {
    savePrefs();
    leer(false);
  });

  const btnTcsCalLoadFromLeer = document.getElementById("btnTcsCalLoadFromLeer");
  const btnTcsCalSend = document.getElementById("btnTcsCalSend");
  if (btnTcsCalLoadFromLeer) {
    btnTcsCalLoadFromLeer.addEventListener("click", () => {
      if (!lastLeerThresh) {
        msgEl.textContent = "Hacé «Leer sensores» primero para obtener THRESH del robot.";
        msgEl.className = "msg err";
        return;
      }
      applyThreshToTcsInputs(lastLeerThresh);
      msgEl.textContent = "Campos TCS cargados desde el último LEER.";
      msgEl.className = "msg ok";
    });
  }
  if (btnTcsCalSend) {
    btnTcsCalSend.addEventListener("click", async () => {
      savePrefs();
      const host = hostEl.value.trim();
      const port = parseInt(portEl.value, 10) || 8888;
      if (!host) {
        msgEl.textContent = "Falta IP del ESP32.";
        msgEl.className = "msg err";
        return;
      }
      const qs = tcsCalQuerySuffix();
      if (!qs) {
        msgEl.textContent = "No hay valores de calibración para enviar.";
        msgEl.className = "msg err";
        return;
      }
      msgEl.textContent = "Enviando TCS_CAL…";
      msgEl.className = "msg";
      try {
        const res = await fetch(
          "/api/tcs_cal?host=" + encodeURIComponent(host) + "&port=" + encodeURIComponent(String(port)) + qs
        );
        const j = await res.json();
        if (!j.ok) {
          msgEl.textContent = j.error || "Error TCS_CAL";
          msgEl.className = "msg err";
          return;
        }
        msgEl.textContent = "Calibración aplicada en el ESP32.";
        msgEl.className = "msg ok";
      } catch (e) {
        msgEl.textContent = String(e);
        msgEl.className = "msg err";
      }
    });
  }

  btnPlan.addEventListener("click", () => {
    savePrefs();
    doPlan(false);
  });

  btnStepAgent.addEventListener("click", () => stepAgent());
  if (btnAutorunStart) btnAutorunStart.addEventListener("click", () => startAutorun());
  if (btnAutorunStop) btnAutorunStop.addEventListener("click", () => stopAutorun());
  if (autorunDelayEl) autorunDelayEl.addEventListener("change", savePrefs);
  btnExecOne.addEventListener("click", async () => {
    savePrefs();
    const mode = agentModeEl.value;
    if (mode === "1") {
      if (!programQueue.length) loadProgramFromTextarea();
      if (!programQueue.length) {
        msgEl.textContent = "Cola programada vacía: escribí comandos y tocá «Cargar cola».";
        msgEl.className = "msg err";
        return;
      }
      await leer(true);
      const next = programQueue.shift();
      planPreviewEl.textContent = "Programado · pendiente: " + programQueue.join(", ");
      if (next === "detener") await execMover("detener");
      else await execMover(next);
      return;
    }
    if ((mode === "4" || mode === "5") && !tcpQueue.length) doPlan(true);
    if (!tcpQueue.length) {
      msgEl.textContent = "Cola de plan vacía — «Calcular ruta», modo explorador (3) o paso de agente en 4/5.";
      msgEl.className = "msg err";
      return;
    }
    const next = tcpQueue.shift();
    planPreviewEl.textContent = "Pendiente: " + tcpQueue.join(", ");
    await execMover(next);
    if ((mode === "4" || mode === "5") && lfLastDisplacementBlockedByRed) doPlan(true);
  });

  btnClearPlan.addEventListener("click", () => {
    tcpQueue = [];
    pathHighlight = [];
    planPreviewEl.textContent = "";
    renderMap();
  });

  btnResetMap.addEventListener("click", () => {
    initGrid();
    pathHighlight = [];
    tcpQueue = [];
    programQueue = [];
    planPreviewEl.textContent = "";
    renderMap();
    msgEl.textContent = "Mapa reiniciado (todo desconocido).";
    msgEl.className = "msg ok";
  });

  btnExportMap.addEventListener("click", () => {
    readRobotFromInputs();
    const blob = new Blob(
      [
        JSON.stringify(
          {
            cols: GRID_W,
            rows: GRID_H,
            grid,
            robot: { ...robot },
            goal: { x: +goalXEl.value, y: +goalYEl.value },
            preset: colorPresetEl.value,
            umbralCm: +ultraThreshEl.value,
          },
          null,
          2
        ),
      ],
      { type: "application/json;charset=utf-8" }
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mapa-${GRID_W}x${GRID_H}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  fileImportMap.addEventListener("change", (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const o = JSON.parse(String(r.result));
        let fw = +(o.cols || o.width || GRID_W);
        let fh = +(o.rows || o.height || GRID_H);
        if (o.grid && Array.isArray(o.grid) && o.grid.length > 0) {
          fh = clampInt(o.grid.length, DIM_MIN, DIM_MAX);
          const widths = o.grid.filter(Array.isArray).map((row) => row.length);
          const rowW = widths.length ? Math.max(...widths, 1) : GRID_W;
          fw = clampInt(rowW, DIM_MIN, DIM_MAX);
        } else {
          fw = clampInt(fw, DIM_MIN, DIM_MAX);
          fh = clampInt(fh, DIM_MIN, DIM_MAX);
        }
        GRID_W = fw;
        GRID_H = fh;
        syncDimInputsFromGlobals();
        persistGridDims();
        initGrid();
        clearQueuesAndHighlight();
        lastLoggedRawSig = "";
        if (o.grid && Array.isArray(o.grid)) {
          for (let y = 0; y < GRID_H; y++) {
            const row = o.grid[y];
            if (!Array.isArray(row)) continue;
            for (let x = 0; x < GRID_W; x++) {
              const v = row[x];
              if (typeof v === "string") grid[y][x] = v;
            }
          }
        }
        if (o.robot) {
          robot.x = clampInt(+o.robot.x, 0, maxXi());
          robot.y = clampInt(+o.robot.y, 0, maxYi());
          robot.h = clampInt(+o.robot.h, 0, 3);
          writeRobotToInputs();
        } else updatePoseRanges();
        if (o.goal) {
          goalXEl.value = String(clampInt(+o.goal.x, 0, maxXi()));
          goalYEl.value = String(clampInt(+o.goal.y, 0, maxYi()));
        } else updatePoseRanges();
        if (o.preset && [...colorPresetEl.options].some((x) => x.value === o.preset)) colorPresetEl.value = o.preset;
        buildMapDom();
        syncGridDimsStyle();
        updateDimTitles();
        updatePoseRanges();
        renderMap();
        savePrefs();
        msgEl.textContent = "Mapa importado (" + GRID_W + "×" + GRID_H + ").";
        msgEl.className = "msg ok";
      } catch (e) {
        msgEl.textContent = "JSON inválido";
        msgEl.className = "msg err";
      }
    };
    r.readAsText(f);
    ev.target.value = "";
  });

  btnClearLog.addEventListener("click", () => {
    logRows.length = 0;
    logBody.innerHTML = "";
    lastLoggedRawSig = "";
  });

  btnExportLog.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(logRows, null, 2)], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bitacora-lf-" + Date.now() + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  [robotXEl, robotYEl, robotHEl, goalXEl, goalYEl, ultraThreshEl, unknownAsFreeEl].forEach((el) =>
    el.addEventListener("change", () => {
      renderMap();
      savePrefs();
    })
  );

  robotXEl.addEventListener("input", renderMap);
  robotYEl.addEventListener("input", renderMap);

  agentModeEl.addEventListener("change", () => {
    stopAutorun();
    if (agentModeEl.value === "1") loadProgramFromTextarea();
    syncProgrammedVisibility();
    savePrefs();
  });

  ["change", "input"].forEach((ev) => {
    searchAlgoEl.addEventListener(ev, savePrefs);
    colorPresetEl.addEventListener(ev, savePrefs);
  });

  hostEl.addEventListener("input", () => {
    savePrefs();
    lfSchedulePingRestart();
  });
  portEl.addEventListener("input", () => {
    savePrefs();
    lfSchedulePingRestart();
  });
  lfInterval.addEventListener("change", () => {
    savePrefs();
    if (lfAuto.checked) startLfTimer();
  });
  lfAuto.addEventListener("change", syncLfAuto);
  lfOnlyOnChange.addEventListener("change", savePrefs);
  Object.keys(LF_PULSE_IDS).forEach((k) => {
    const el = document.getElementById(LF_PULSE_IDS[k]);
    if (el)
      el.addEventListener("input", function () {
        updateLfCellMoveHint();
        savePrefs();
      });
  });
  const btnLfPulseSyncAll = document.getElementById("btnLfPulseSyncAll");
  if (btnLfPulseSyncAll) {
    btnLfPulseSyncAll.addEventListener("click", function () {
      const root = document.getElementById(LF_PULSE_IDS.adelante);
      if (!root) return;
      const v = root.value;
      ["atras", "izquierda", "derecha"].forEach((d) => {
        const o = document.getElementById(LF_PULSE_IDS[d]);
        if (o) o.value = v;
      });
      updateLfCellMoveHint();
      savePrefs();
    });
  }

  if (btnApplyDims && lfGridWEl && lfGridHEl) {
    btnApplyDims.addEventListener("click", () => {
      const nw = clampInt(+lfGridWEl.value, DIM_MIN, DIM_MAX);
      const nh = clampInt(+lfGridHEl.value, DIM_MIN, DIM_MAX);
      lfGridWEl.value = String(nw);
      lfGridHEl.value = String(nh);
      if (nw === GRID_W && nh === GRID_H) {
        msgEl.textContent = "Ya estás usando " + nw + "×" + nh + ".";
        msgEl.className = "msg";
        return;
      }
      if (
        !confirm(
          "Cambiar a " +
            nw +
            "×" +
            nh +
            " reinicia TODO el mapa (celdas desconocidas), vacía rutas/cola TCP y sitúa robot en (0,0) con meta en la esquina inferior derecha. ¿Continuar?"
        )
      ) {
        syncDimInputsFromGlobals();
        return;
      }
      applyGridDimensions(nw, nh);
      savePrefs();
      msgEl.textContent = "Laberinto " + nw + "×" + nh + " listo.";
      msgEl.className = "msg ok";
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      if (lfAuto.checked && (lfSimulationEnabled() || hostEl.value.trim())) {
        stopLfTimer();
        startLfTimer();
      }
      lfSchedulePingRestart();
    }
  });

  timeTimer = setInterval(updateMetrics, 1000);

  loadStoredGridDims();
  syncDimInputsFromGlobals();
  initGrid();
  buildMapDom();
  lfSimHydrateTerrainOnBoot();
  syncGridDimsStyle();
  updateDimTitles();
  updatePoseRanges();
  renderMap();
  loadPrefs();
  if (agentModeEl.value === "1") loadProgramFromTextarea();
  syncProgrammedVisibility();
  syncLfAuto();
  updateAutorunUi();
  updateMetrics();

  document.addEventListener("mouseup", () => {
    lfSimPaintDrag = false;
  });
  const lfSimEnabledWire = document.getElementById("lfSimEnabled");
  if (lfSimEnabledWire) {
    lfSimEnabledWire.addEventListener("change", () => {
      savePrefs();
      lfSimUiRefresh();
    });
  }
  const lfSimUltraWire = document.getElementById("lfSimUltraSense");
  if (lfSimUltraWire) lfSimUltraWire.addEventListener("change", savePrefs);
  const lfSimDelayWire = document.getElementById("lfSimDelayMs");
  if (lfSimDelayWire) lfSimDelayWire.addEventListener("change", savePrefs);
  document.querySelectorAll("[data-lf-sim-brush]").forEach((btn) => {
    btn.addEventListener("click", () => {
      lfSimBrush = /** @type {"VERDE"|"AZUL"|"ROJO"} */ (
        btn.getAttribute("data-lf-sim-brush") || "AZUL"
      );
      document.querySelectorAll("[data-lf-sim-brush]").forEach((b) =>
        b.classList.toggle("lf-sim-brush--active", b === btn)
      );
    });
  });
  const btnLfSimMaze = document.getElementById("btnLfSimMaze");
  if (btnLfSimMaze) {
    btnLfSimMaze.addEventListener("click", () => {
      lfSimGenerarMazeTerrain();
      msgEl.textContent = "Laberinto aleatorio aplicado al terreno simulado.";
      msgEl.className = "msg ok";
    });
  }
  const btnLfSimFlat = document.getElementById("btnLfSimFlat");
  if (btnLfSimFlat) {
    btnLfSimFlat.addEventListener("click", () => {
      lfSimFlatOpenTerrain();
      msgEl.textContent = "Terreno todo pasillo azul · meta VERDE según Meta X/Y del panel.";
      msgEl.className = "msg ok";
    });
  }
  const btnLfSimSnapRobot = document.getElementById("btnLfSimSnapRobot");
  if (btnLfSimSnapRobot) {
    btnLfSimSnapRobot.addEventListener("click", () => {
      if (!lfSimSnapRobotToFirstAzul()) {
        msgEl.textContent = "No hay celda AZUL libre donde colocar el robot.";
        msgEl.className = "msg err";
        return;
      }
      msgEl.textContent = "Robot colocado en la primera celda AZUL (pasillo; la meta VERDE sigue marcada aparte).";
      msgEl.className = "msg ok";
    });
  }
  const btnLfSimRevealMap = document.getElementById("btnLfSimRevealMap");
  if (btnLfSimRevealMap) btnLfSimRevealMap.addEventListener("click", () => lfSimCopyTerrainToBelief());

  function setupLfRailTabs() {
    const tabs = document.querySelectorAll("[data-lf-rail-tab]");
    const panels = document.querySelectorAll("[data-lf-rail-panel]");
    if (!tabs.length || !panels.length) return;

    function activate(name) {
      tabs.forEach((t) => {
        const on = t.getAttribute("data-lf-rail-tab") === name;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.classList.toggle("lf-rail-tab--active", on);
      });
      panels.forEach((p) => {
        const on = p.getAttribute("data-lf-rail-panel") === name;
        p.hidden = !on;
        p.classList.toggle("lf-rail-panel--active", on);
      });
      try {
        sessionStorage.setItem("lfRailTab", name);
      } catch (_) {}
    }

    tabs.forEach((btn) => {
      btn.addEventListener("click", () => activate(btn.getAttribute("data-lf-rail-tab") || ""));
    });

    let initial = "conn";
    try {
      const s = sessionStorage.getItem("lfRailTab");
      if (s && [...tabs].some((t) => t.getAttribute("data-lf-rail-tab") === s)) initial = s;
    } catch (_) {}
    activate(initial);
  }

  function setupLfMainWorkbenchTabs() {
    const tabs = document.querySelectorAll("[data-lf-main-tab]");
    const panels = document.querySelectorAll("[data-lf-main-panel]");
    if (!tabs.length || !panels.length) return;

    function activate(name) {
      tabs.forEach((t) => {
        const on = t.getAttribute("data-lf-main-tab") === name;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.classList.toggle("lf-main-tab--active", on);
      });
      panels.forEach((p) => {
        const on = p.getAttribute("data-lf-main-panel") === name;
        p.hidden = !on;
        p.classList.toggle("lf-main-tab-panel--active", on);
      });
      try {
        sessionStorage.setItem("lfWorkbenchTab", name);
      } catch (_) {}
    }

    tabs.forEach((btn) => {
      btn.addEventListener("click", () => activate(btn.getAttribute("data-lf-main-tab") || ""));
    });

    let initial = "sense";
    try {
      const s = sessionStorage.getItem("lfWorkbenchTab");
      if (s && [...tabs].some((t) => t.getAttribute("data-lf-main-tab") === s)) initial = s;
    } catch (_) {}
    activate(initial);
  }

  setupLfRailTabs();
  setupLfMainWorkbenchTabs();
  lfSchedulePingRestart();
})();
