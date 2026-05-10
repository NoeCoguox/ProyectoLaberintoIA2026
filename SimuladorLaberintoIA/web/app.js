/* Simulador Laberinto IA — Lógica y UI */

const ROWS = 8, COLS = 8;
const CELL_FREE = 1, CELL_WALL = 2, CELL_START = 3, CELL_GOAL = 4, CELL_UNKNOWN = 0;
const NORTH = 0, EAST = 1, SOUTH = 2, WEST = 3;
const DELTAS = [[-1,0], [0,1], [1,0], [0,-1]];
const ORI_LABELS = ['Norte', 'Este', 'Sur', 'Oeste'];
const STEP_MS = 380;
const AGENT_TYPES_SEARCH = ['modelo', 'objetivos', 'utilidad'];

function newGrid() {
  return Array(ROWS).fill(null).map(() => Array(COLS).fill(CELL_FREE));
}

class World {
  constructor() {
    this.grid = newGrid();
    this.start = [0, 0];
    this.goal = [7, 7];
    this.grid[0][0] = CELL_START;
    this.grid[7][7] = CELL_GOAL;
  }
  get(r, c) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return CELL_WALL;
    return this.grid[r][c];
  }
  set(r, c, v) {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) this.grid[r][c] = v;
  }
  valid(r, c) { return this.get(r, c) !== CELL_WALL; }
  setStart(r, c) {
    this.set(this.start[0], this.start[1], CELL_FREE);
    this.start = [r, c];
    this.set(r, c, CELL_START);
  }
  setGoal(r, c) {
    this.set(this.goal[0], this.goal[1], CELL_FREE);
    this.goal = [r, c];
    this.set(r, c, CELL_GOAL);
  }
  loadDefault() {
    this.grid = newGrid();
    this.setStart(0, 0);
    this.setGoal(7, 7);
    const walls = [[1,1],[1,2],[1,3],[2,3],[3,3],[4,3],[4,4],[4,5],[5,5],[6,5],[2,5],[2,6],[3,6],[5,1],[5,2],[6,2],[7,2]];
    walls.forEach(([r,c]) => this.set(r, c, CELL_WALL));
  }
}

class AgentState {
  constructor(world) {
    this.row = world.start[0];
    this.col = world.start[1];
    this.ori = NORTH;
    this.known = Array(ROWS).fill(null).map(() => Array(COLS).fill(CELL_UNKNOWN));
    this.known[this.row][this.col] = CELL_START;
    this.movements = 0;
  }
  pos() { return [this.row, this.col]; }
  forward() {
    const [dr, dc] = DELTAS[this.ori];
    return [this.row + dr, this.col + dc];
  }
  transitable(r, c) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
    return this.known[r][c] !== CELL_WALL;
  }
  mark(r, c, v) {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) this.known[r][c] = v;
  }
  moveForward() {
    const [nr, nc] = this.forward();
    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && this.known[nr][nc] !== CELL_WALL) {
      this.row = nr; this.col = nc; this.movements++; return true;
    }
    return false;
  }
  turnLeft() { this.ori = (this.ori + 3) % 4; this.movements++; }
  turnRight() { this.ori = (this.ori + 1) % 4; this.movements++; }
}

function bfs(gridKnown, start, goal) {
  if (start[0] === goal[0] && start[1] === goal[1]) return [];
  const queue = [[start, []]];
  const vis = new Set([start[0] + ',' + start[1]]);
  while (queue.length) {
    const [[r, c], path] = queue.shift();
    for (let d = 0; d < 4; d++) {
      const [dr, dc] = DELTAS[d];
      const nr = r + dr, nc = c + dc;
      const key = nr + ',' + nc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || !gridKnown(nr, nc) || vis.has(key)) continue;
      vis.add(key);
      const newPath = path.concat([d]);
      if (nr === goal[0] && nc === goal[1]) return newPath;
      queue.push([[nr, nc], newPath]);
    }
  }
  return [];
}

function manhattan(r1, c1, r2, c2) { return Math.abs(r1 - r2) + Math.abs(c1 - c2); }

function astar(gridKnown, start, goal) {
  if (start[0] === goal[0] && start[1] === goal[1]) return [];
  const [gr, gc] = goal;
  const open = [{ f: manhattan(start[0], start[1], gr, gc), g: 0, r: start[0], c: start[1], path: [] }];
  const vis = new Set([start[0] + ',' + start[1]]);
  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const { g, r, c, path } = open.shift();
    for (let d = 0; d < 4; d++) {
      const [dr, dc] = DELTAS[d];
      const nr = r + dr, nc = c + dc;
      const key = nr + ',' + nc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || !gridKnown(nr, nc) || vis.has(key)) continue;
      vis.add(key);
      const newPath = path.concat([d]);
      if (nr === gr && nc === gc) return newPath;
      open.push({
        f: g + 1 + manhattan(nr, nc, gr, gc),
        g: g + 1,
        r: nr, c: nc,
        path: newPath
      });
    }
  }
  return [];
}

function countExploredBFS(gridKnown, start, goal) {
  const vis = new Set([start[0] + ',' + start[1]]);
  const queue = [start];
  while (queue.length) {
    const [r, c] = queue.shift();
    if (r === goal[0] && c === goal[1]) return vis.size;
    for (let d = 0; d < 4; d++) {
      const [dr, dc] = DELTAS[d];
      const nr = r + dr, nc = c + dc;
      const key = nr + ',' + nc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && gridKnown(nr, nc) && !vis.has(key)) {
        vis.add(key); queue.push([nr, nc]);
      }
    }
  }
  return vis.size;
}

function countExploredAStar(gridKnown, start, goal) {
  const [gr, gc] = goal;
  const open = [{ f: manhattan(start[0], start[1], gr, gc), r: start[0], c: start[1] }];
  const closed = new Set();
  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const { r, c } = open.shift();
    const key = r + ',' + c;
    if (closed.has(key)) continue;
    closed.add(key);
    if (r === gr && c === gc) return closed.size;
    for (let d = 0; d < 4; d++) {
      const [dr, dc] = DELTAS[d];
      const nr = r + dr, nc = c + dc;
      const nkey = nr + ',' + nc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && gridKnown(nr, nc) && !closed.has(nkey))
        open.push({ f: manhattan(nr, nc, gr, gc), r: nr, c: nc });
    }
  }
  return closed.size;
}

function programmedAgent(agent, world) {
  const [r, c] = agent.pos();
  if (world.get(r, c) === CELL_GOAL) return 'stop';
  const rightOri = (agent.ori + 1) % 4;
  const [dr, dc] = DELTAS[rightOri];
  const rr = r + dr, rc = c + dc;
  if (rr >= 0 && rr < ROWS && rc >= 0 && rc < COLS && world.valid(rr, rc)) return 'turn_right';
  const [fr, fc] = agent.forward();
  if (world.valid(fr, fc)) return 'forward';
  const leftOri = (agent.ori + 3) % 4;
  const [lr, lc] = [r + DELTAS[leftOri][0], c + DELTAS[leftOri][1]];
  if (lr >= 0 && lr < ROWS && lc >= 0 && lc < COLS && world.valid(lr, lc)) return 'turn_left';
  return 'turn_right';
}

function reactiveAgent(agent, world) {
  const [r, c] = agent.pos();
  if (world.get(r, c) === CELL_GOAL) return 'stop';
  const [fr, fc] = agent.forward();
  if (!world.valid(fr, fc)) return 'turn_right';
  return 'forward';
}

function goalBasedAgent(agent, world, goal, algo) {
  const start = agent.pos();
  if (start[0] === goal[0] && start[1] === goal[1]) return ['stop'];
  const gridKnown = (nr, nc) => agent.transitable(nr, nc);
  const path = algo === 'bfs' ? bfs(gridKnown, start, goal) : astar(gridKnown, start, goal);
  if (!path.length) return ['turn_right'];
  const nextDir = path[0];
  if (agent.ori === nextDir) return ['forward'];
  const diff = (nextDir - agent.ori + 4) % 4;
  if (diff === 1) return ['turn_right'];
  if (diff === 3) return ['turn_left'];
  if (diff === 2) return ['turn_right', 'turn_right'];
  return ['forward'];
}

class QAgent {
  constructor() {
    this.Q = {};
    this.alpha = 0.2; this.gamma = 0.95; this.epsilon = 0.2;
    this.lastS = null; this.lastA = null;
  }
  key(r, c, a) { return r + ',' + c + ',' + a; }
  get(r, c, a) { return this.Q[this.key(r, c, a)] ?? 0; }
  choose(r, c, validActions, goal) {
    if (r === goal[0] && c === goal[1]) return 'stop';
    if (!validActions.length) return null;
    let a;
    if (Math.random() < this.epsilon) a = validActions[Math.floor(Math.random() * validActions.length)];
    else a = validActions.reduce((best, ac) => this.get(r, c, ac) > this.get(r, c, best) ? ac : best);
    this.lastS = [r, c]; this.lastA = a; return a;
  }
  update(nr, nc, reward, goal) {
    if (this.lastS == null || this.lastA == null) return;
    const [r, c] = this.lastS;
    const maxNext = [0,1,2,3].reduce((m, a) => Math.max(m, this.get(nr, nc, a)), 0);
    const q = this.get(r, c, this.lastA);
    this.Q[this.key(r, c, this.lastA)] = q + this.alpha * (reward + this.gamma * (nr === goal[0] && nc === goal[1] ? 0 : maxNext) - q);
    this.lastS = null; this.lastA = null;
  }
}

function learningAgent(agent, world, goal, qAgent) {
  const [r, c] = agent.pos();
  const validActions = [0,1,2,3].filter(d => {
    const [dr, dc] = DELTAS[d];
    const nr = r + dr, nc = c + dc;
    return nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && world.valid(nr, nc);
  });
  const a = qAgent.choose(r, c, validActions, goal);
  if (a === 'stop' || a == null) return a === 'stop' ? 'stop' : 'turn_right';
  if (agent.ori === a) return 'forward';
  const diff = (a - agent.ori + 4) % 4;
  if (diff === 1) return 'turn_right';
  if (diff === 3) return 'turn_left';
  return 'turn_right';
}

const world = new World();
world.loadDefault();
let agent = new AgentState(world);
let goal = [7, 7];
let agentType = 'objetivos';
let searchAlgo = 'astar';
let running = false;
let finished = false;
let won = false;
let currentActions = [];
let startTime = null;
let elapsed = 0;
let nodesExplored = 0;
let pathLength = 0;
let qAgent = new QAgent();
let currentTool = 'wall';
let learningHistory = [];
let scene, camera, renderer, robotMesh;

const gridEl = document.getElementById('grid');
const agentEl = document.getElementById('agent');
const metricsEl = document.getElementById('metrics');
const agentTypeSelect = document.getElementById('agent-type');
const searchMethodSelect = document.getElementById('search-method');
const searchBlock = document.getElementById('search-block');
const btnStart = document.getElementById('btn-start');
const btnReset = document.getElementById('btn-reset');
const btnDefault = document.getElementById('btn-default');
const learningCanvas = document.getElementById('learning-chart');
const learningBlock = document.getElementById('learning-block');
const viewport3d = document.getElementById('viewport3d');

if (!learningCanvas) {
  // En entornos sin canvas (por seguridad) evitamos errores.
}

function init3D() {
  if (!viewport3d || !window.THREE) return;
  const width = viewport3d.clientWidth;
  const height = viewport3d.clientHeight;
  scene = new THREE.Scene();
  scene.background = null;
  camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
  camera.position.set(6, 8, 10);
  camera.lookAt(3, 0, 3);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  viewport3d.innerHTML = '';
  viewport3d.appendChild(renderer.domElement);
  const light = new THREE.DirectionalLight(0xffffff, 0.9);
  light.position.set(5, 10, 7);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const planeGeo = new THREE.PlaneGeometry(8, 8);
  const planeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0 });
  const plane = new THREE.Mesh(planeGeo, planeMat);
  plane.rotation.x = -Math.PI / 2;
  scene.add(plane);
  const cubeGeo = new THREE.BoxGeometry(0.9, 0.4, 1.2);
  const cubeMat = new THREE.MeshStandardMaterial({ color: 0x2563eb });
  robotMesh = new THREE.Mesh(cubeGeo, cubeMat);
  robotMesh.position.y = 0.2;
  scene.add(robotMesh);
  const sensorGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.1, 24);
  const sensorMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0ea5e9 });
  const sensor = new THREE.Mesh(sensorGeo, sensorMat);
  sensor.rotation.x = Math.PI / 2;
  sensor.position.set(0, 0.3, 0.65);
  robotMesh.add(sensor);
  function animate() {
    requestAnimationFrame(animate);
    if (renderer && scene && camera) renderer.render(scene, camera);
  }
  animate();
}

function buildGrid() {
  gridEl.innerHTML = '';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement('div');
          cell.className = 'cell';
          const t = world.get(r, c);
          if (t === CELL_START) cell.classList.add('cell-start');
          else if (t === CELL_GOAL) cell.classList.add('cell-goal');
          else if (t === CELL_WALL) cell.classList.add('cell-wall');
          else cell.classList.add('cell-path');
          cell.dataset.r = r;
          cell.dataset.c = c;
          cell.addEventListener('click', () => onCellClick(r, c));
          gridEl.appendChild(cell);
    }
  }
}

function updateGrid() {
  const cells = gridEl.querySelectorAll('.cell');
  cells.forEach((cell, i) => {
    const r = Math.floor(i / COLS), c = i % COLS;
    const t = world.get(r, c);
    cell.className = 'cell';
    if (t === CELL_START) cell.classList.add('cell-start');
    else if (t === CELL_GOAL) cell.classList.add('cell-goal');
    else if (t === CELL_WALL) cell.classList.add('cell-wall');
    else cell.classList.add('cell-path');
  });
}

function placeAgent() {
  const cellSize = 52;
  const gap = 1;
  const baseTop = 12, baseLeft = 12;
  const [r, c] = agent.pos();
  const deg = agent.ori * 90;
  agentEl.style.left = baseLeft + c * (cellSize + gap) + 'px';
  agentEl.style.top = baseTop + r * (cellSize + gap) + 'px';
  agentEl.style.transform = `rotate(${deg}deg)`;
  if (!agentEl.querySelector('.agent-inner')) {
    agentEl.innerHTML = '<div class="agent-inner"><span class="wheel left"></span><span class="wheel right"></span></div>';
  }
   if (robotMesh) {
     const scale = 8 / ROWS;
     robotMesh.position.x = (c - (COLS - 1) / 2) * scale;
     robotMesh.position.z = (r - (ROWS - 1) / 2) * scale;
     robotMesh.rotation.y = -agent.ori * (Math.PI / 2);
   }
}

function readSensors() {
  const [r, c] = agent.pos();
  agent.mark(r, c, world.get(r, c));
  const [fr, fc] = agent.forward();
  if (fr >= 0 && fr < ROWS && fc >= 0 && fc < COLS) agent.mark(fr, fc, world.get(fr, fc));
}

function getNextActions() {
  readSensors();
  goal = world.goal;
  let a;
  if (agentType === 'programado') a = programmedAgent(agent, world);
  else if (agentType === 'reactivo') a = reactiveAgent(agent, world);
  else if (agentType === 'modelo' || agentType === 'objetivos' || agentType === 'utilidad') {
    const gridKnown = (nr, nc) => agent.transitable(nr, nc);
    const start = agent.pos();
    if (searchAlgo === 'bfs') {
      nodesExplored = countExploredBFS(gridKnown, start, goal);
      pathLength = bfs(gridKnown, start, goal).length;
    } else {
      nodesExplored = countExploredAStar(gridKnown, start, goal);
      pathLength = astar(gridKnown, start, goal).length;
    }
    return goalBasedAgent(agent, world, goal, searchAlgo);
  }
  else if (agentType === 'aprende') a = learningAgent(agent, world, goal, qAgent);
  else a = 'turn_right';
  return Array.isArray(a) ? a : [a];
}

function runAction(action) {
  if (action === 'stop') {
    finished = true;
    won = agent.pos()[0] === goal[0] && agent.pos()[1] === goal[1];
    running = false;
    if (agentType === 'aprende') {
      qAgent.update(agent.row, agent.col, won ? 10 : -0.1, goal);
      learningHistory.push({ episode: learningHistory.length + 1, steps: agent.movements, success: won });
      drawLearningChart();
    }
    return;
  }
  if (action === 'forward') {
    const [fr, fc] = agent.forward();
    if (world.valid(fr, fc)) {
      agent.moveForward();
      readSensors();
      if (agentType === 'aprende') qAgent.update(agent.row, agent.col, -0.1, goal);
    } else {
      agent.mark(fr, fc, CELL_WALL);
      if (agentType === 'aprende') qAgent.update(agent.row, agent.col, -1, goal);
    }
  } else if (action === 'turn_left') {
    agent.turnLeft();
    if (agentType === 'aprende') qAgent.update(agent.row, agent.col, -0.02, goal);
  } else if (action === 'turn_right') {
    agent.turnRight();
    if (agentType === 'aprende') qAgent.update(agent.row, agent.col, -0.02, goal);
  }
  if (agent.pos()[0] === goal[0] && agent.pos()[1] === goal[1]) {
    finished = true; won = true; running = false;
    if (agentType === 'aprende') {
      qAgent.update(agent.row, agent.col, 10, goal);
      learningHistory.push({ episode: learningHistory.length + 1, steps: agent.movements, success: true });
      drawLearningChart();
    }
  }
}

function step() {
  if (!running || finished) return;
  if (!startTime) startTime = Date.now();
  if (!currentActions.length) {
    currentActions = getNextActions();
  }
  const action = currentActions.shift();
  if (action === undefined) { running = false; return; }
  runAction(action);
  placeAgent();
  updateMetrics();
  if (running && !finished) setTimeout(step, STEP_MS);
}

function updateMetrics() {
  elapsed = startTime ? (Date.now() - startTime) / 1000 : 0;
  const status = won ? 'Objetivo alcanzado!' : (running ? 'En ejecución' : 'Detenido');
  const [r, c] = agent.pos();
  const [fr, fc] = agent.forward();
  let frontDesc = 'Fuera del laberinto';
  if (fr >= 0 && fr < ROWS && fc >= 0 && fc < COLS) {
    const t = world.get(fr, fc);
    if (t === CELL_WALL) frontDesc = 'Pared / obstáculo';
    else if (t === CELL_GOAL) frontDesc = 'Objetivo';
    else if (t === CELL_START) frontDesc = 'Inicio';
    else frontDesc = 'Camino libre';
  }
  const labels = {
    programado: '1. Sistema programado',
    reactivo: '2. Reactivo simple',
    modelo: '3. Basado en modelo',
    objetivos: '4. Basado en objetivos',
    utilidad: '5. Basado en utilidad',
    aprende: '6. Agente que aprende'
  };
  metricsEl.innerHTML = `
    <p><strong>Posición:</strong> fila ${r + 1}, columna ${c + 1}</p>
    <p><strong>Orientación:</strong> ${ORI_LABELS[agent.ori]}</p>
    <p><strong>Frente al sensor:</strong> ${frontDesc}</p>
    <p><strong>Movimientos:</strong> ${agent.movements}</p>
    <p><strong>Tiempo:</strong> ${elapsed.toFixed(1)} s</p>
    <p><strong>Nodos explorados:</strong> ${nodesExplored}</p>
    <p><strong>Long. ruta:</strong> ${pathLength}</p>
    <p><strong>Estado:</strong> ${status}</p>
    <p><strong>Modo:</strong> ${labels[agentType] || agentType}</p>
  `;
}

function onCellClick(r, c) {
  if (running) return;
  if (currentTool === 'wall') {
    if (r === world.start[0] && c === world.start[1]) { world.setStart(0, 0); agent = new AgentState(world); }
    if (r === world.goal[0] && c === world.goal[1]) world.setGoal(7, 7);
    world.set(r, c, CELL_WALL);
  } else if (currentTool === 'path') {
    if (r === world.start[0] && c === world.start[1]) { world.setStart(0, 0); agent = new AgentState(world); }
    if (r === world.goal[0] && c === world.goal[1]) world.setGoal(7, 7);
    world.set(r, c, CELL_FREE);
  } else if (currentTool === 'start') {
    world.setStart(r, c);
    agent = new AgentState(world);
  } else if (currentTool === 'goal') {
    world.setGoal(r, c);
  }
  updateGrid();
  placeAgent();
}

function reset() {
  agent = new AgentState(world);
  goal = world.goal;
  running = false;
  finished = false;
  won = false;
  currentActions = [];
  startTime = null;
  elapsed = 0;
  nodesExplored = 0;
  pathLength = 0;
  qAgent.lastS = null;
  qAgent.lastA = null;
  if (agentType === 'aprende' && !running) {
    // mantenemos el historial pero actualizamos la gráfica
    drawLearningChart();
  }
  placeAgent();
  updateMetrics();
  btnStart.textContent = 'Iniciar';
}

function loadDefault() {
  world.loadDefault();
  reset();
  updateGrid();
}

agentTypeSelect.addEventListener('change', () => {
  agentType = agentTypeSelect.value;
  searchBlock.classList.toggle('hidden', !AGENT_TYPES_SEARCH.includes(agentType));
  if (learningBlock) {
    learningBlock.style.display = agentType === 'aprende' ? 'block' : 'none';
  }
  if (!running) reset();
});

searchMethodSelect.addEventListener('change', () => {
  searchAlgo = searchMethodSelect.value;
  if (!running) reset();
});

btnStart.addEventListener('click', () => {
  if (finished) reset();
  running = !running;
  btnStart.textContent = running ? 'Pausar' : 'Iniciar';
  if (running) step();
});

btnReset.addEventListener('click', reset);
btnDefault.addEventListener('click', loadDefault);

document.querySelectorAll('.tool-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTool = btn.dataset.tool;
  });
});

searchBlock.classList.toggle('hidden', !AGENT_TYPES_SEARCH.includes(agentType));
if (learningBlock) {
  learningBlock.style.display = agentType === 'aprende' ? 'block' : 'none';
}

function drawLearningChart() {
  if (!learningCanvas || !learningCanvas.getContext) return;
  const ctx = learningCanvas.getContext('2d');
  const w = learningCanvas.width;
  const h = learningCanvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(32, 8);
  ctx.lineTo(32, h - 20);
  ctx.lineTo(w - 8, h - 20);
  ctx.stroke();
  const data = learningHistory.slice(-20);
  if (!data.length) return;
  const maxSteps = Math.max(...data.map(d => d.steps)) || 1;
  const minSteps = Math.min(...data.map(d => d.steps));
  const range = Math.max(1, maxSteps - minSteps);
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  data.forEach((d, i) => {
    const x = 32 + ((w - 40) * i) / Math.max(1, data.length - 1);
    const norm = (d.steps - minSteps) / range;
    const y = 8 + norm * (h - 32);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

buildGrid();
placeAgent();
updateMetrics();
init3D();
drawLearningChart();
