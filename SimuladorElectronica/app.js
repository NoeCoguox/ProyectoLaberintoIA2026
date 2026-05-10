/* Simulador de Electrónica — Proyecto IA 2026 (profesional) */

const circuitEl = document.getElementById('circuit');
const view3dEl = document.getElementById('view3d');
const testAreaCanvas = document.getElementById('test-area');
const distanceInput = document.getElementById('distance');
const distanceValue = document.getElementById('distance-value');
const speedInput = document.getElementById('speed');
const speedValue = document.getElementById('speed-value');
const btnRun = document.getElementById('btn-run');
const btnStop = document.getElementById('btn-stop');
const statusEl = document.getElementById('status');
const btnAddObstacle = document.getElementById('btn-add-obstacle');
const btnClearObstacles = document.getElementById('btn-clear-obstacles');
const useTestAreaCheck = document.getElementById('use-test-area');
const sensorReadout = document.getElementById('sensor-distance');

const gpio = {};
let distance = 50;
let running = false;
let simInterval = null;
let motor1Dir = 0;
let motor2Dir = 0;

// Vista 3D del carrito (Three.js)
let scene3d, camera3d, renderer3d, wheelLeft3d, wheelRight3d;
let orbit = { theta: 0.6, phi: 0.9, dist: 4.5, isDown: false, prevX: 0, prevY: 0 };

// Área de prueba: obstáculos y carrito
const TEST_W = 400, TEST_H = 320;
const PX_PER_CM = 2; // 1 cm = 2 px para escalar distancia
let obstacles = [];
let addObstacleMode = false;
let car = { x: TEST_W / 2, y: TEST_H / 2, angle: -Math.PI / 2, w: 24, h: 16 };
const CAR_SPEED = 2;
const TURN_SPEED = 0.08;
const SENSOR_MAX_CM = 80;

const connections = [
  { from: 'esp32-VIN', to: 'hcsr04-VCC', type: 'power', label: 'VIN → VCC' },
  { from: 'esp32-GND1', to: 'hcsr04-GND', type: 'gnd', label: 'GND' },
  { from: 'esp32-GPIO5', to: 'hcsr04-TRIG', type: 'signal', label: 'GPIO5 → TRIG' },
  { from: 'esp32-GPIO18', to: 'hcsr04-ECHO', type: 'signal', label: 'GPIO18 → ECHO' },
  { from: 'esp32-VIN', to: 'l298n-VCC', type: 'power', label: 'VIN → VCC' },
  { from: 'esp32-GND2', to: 'l298n-GND', type: 'gnd', label: 'GND' },
  { from: 'esp32-GPIO12', to: 'l298n-IN1', type: 'signal', label: 'GPIO12 → IN1' },
  { from: 'esp32-GPIO13', to: 'l298n-IN2', type: 'signal', label: 'GPIO13 → IN2' },
  { from: 'esp32-GPIO14', to: 'l298n-IN3', type: 'signal', label: 'GPIO14 → IN3' },
  { from: 'esp32-GPIO27', to: 'l298n-IN4', type: 'signal', label: 'GPIO27 → IN4' },
  { from: 'esp32-GPIO25', to: 'l298n-ENA', type: 'pwm', label: 'GPIO25 → ENA' },
  { from: 'esp32-GPIO26', to: 'l298n-ENB', type: 'pwm', label: 'GPIO26 → ENB' },
  { from: 'esp32-GPIO33', to: 'buzzer-SIG', type: 'pwm', label: 'GPIO33 → Buzzer +' },
  { from: 'esp32-GND1', to: 'buzzer-GND', type: 'gnd', label: 'GND buzzer' },
];

const layout = {
  esp32: { left: 24, top: 48, w: 180, h: 152, pins: [
    { id: 'esp32-VIN', label: 'VIN', dx: 180, dy: 12, type: 'power' },
    { id: 'esp32-GND1', label: 'GND', dx: 180, dy: 26, type: 'gnd' },
    { id: 'esp32-GPIO5', label: 'GPIO5', dx: 180, dy: 40, type: 'signal' },
    { id: 'esp32-GPIO18', label: 'GPIO18', dx: 180, dy: 54, type: 'signal' },
    { id: 'esp32-GPIO12', label: 'GPIO12', dx: 180, dy: 68, type: 'signal' },
    { id: 'esp32-GPIO13', label: 'GPIO13', dx: 180, dy: 82, type: 'signal' },
    { id: 'esp32-GPIO14', label: 'GPIO14', dx: 180, dy: 96, type: 'signal' },
    { id: 'esp32-GPIO27', label: 'GPIO27', dx: 180, dy: 110, type: 'signal' },
    { id: 'esp32-GPIO25', label: 'GPIO25', dx: 180, dy: 124, type: 'pwm' },
    { id: 'esp32-GPIO26', label: 'GPIO26', dx: 180, dy: 138, type: 'pwm' },
    { id: 'esp32-GND2', label: 'GND', dx: 0, dy: 12, type: 'gnd' },
    { id: 'esp32-GPIO33', label: 'GPIO33', dx: 0, dy: 32, type: 'pwm' },
  ]},
  l298n: { left: 280, top: 140, w: 160, h: 120, pins: [
    { id: 'l298n-IN1', label: 'IN1', dx: 0, dy: 20, type: 'signal' },
    { id: 'l298n-IN2', label: 'IN2', dx: 0, dy: 36, type: 'signal' },
    { id: 'l298n-IN3', label: 'IN3', dx: 0, dy: 52, type: 'signal' },
    { id: 'l298n-IN4', label: 'IN4', dx: 0, dy: 68, type: 'signal' },
    { id: 'l298n-ENA', label: 'ENA', dx: 0, dy: 84, type: 'pwm' },
    { id: 'l298n-ENB', label: 'ENB', dx: 0, dy: 100, type: 'pwm' },
    { id: 'l298n-GND', label: 'GND', dx: 160, dy: 20, type: 'gnd' },
    { id: 'l298n-VCC', label: 'VCC', dx: 160, dy: 36, type: 'power' },
  ]},
  hcsr04: { left: 24, top: 220, w: 120, h: 72, pins: [
    { id: 'hcsr04-VCC', label: 'VCC', dx: 0, dy: 14, type: 'power' },
    { id: 'hcsr04-GND', label: 'GND', dx: 0, dy: 30, type: 'gnd' },
    { id: 'hcsr04-TRIG', label: 'TRIG', dx: 0, dy: 46, type: 'signal' },
    { id: 'hcsr04-ECHO', label: 'ECHO', dx: 0, dy: 62, type: 'signal' },
  ]},
  buzzer: { left: 460, top: 40, w: 100, h: 52, pins: [
    { id: 'buzzer-SIG', label: '+ (PWM)', dx: 0, dy: 18, type: 'pwm' },
    { id: 'buzzer-GND', label: 'GND', dx: 0, dy: 36, type: 'gnd' },
  ]},
  motor1: { left: 500, top: 120, w: 80, h: 56 },
  motor2: { left: 500, top: 260, w: 80, h: 56 },
};

function pinState(pinId) {
  if (pinId.startsWith('esp32-')) {
    const key = pinId.replace('esp32-', '');
    if (key === 'VIN') return 1;
    if (key.startsWith('GND')) return 0;
    return gpio[key] ? 1 : 0;
  }
  if (pinId.startsWith('l298n-')) {
    const key = pinId.replace('l298n-', '');
    if (key === 'GND') return 0;
    if (key === 'VCC') return 1;
    return gpio['L298N_' + key] ? 1 : 0;
  }
  if (pinId.startsWith('hcsr04-')) {
    if (pinId === 'hcsr04-VCC') return 1;
    if (pinId === 'hcsr04-GND') return 0;
    return gpio[pinId] !== undefined ? gpio[pinId] : 0;
  }
  if (pinId.startsWith('buzzer-')) {
    if (pinId === 'buzzer-GND') return 0;
    return 0;
  }
  return 0;
}

function getPinPosition(pinId) {
  for (const [compKey, comp] of Object.entries(layout)) {
    if (compKey === 'motor1' || compKey === 'motor2') continue;
    if (!comp.pins) continue;
    const p = comp.pins.find(px => px.id === pinId);
    if (p) return { x: comp.left + p.dx, y: comp.top + p.dy };
  }
  return { x: 0, y: 0 };
}

function buildCircuit() {
  circuitEl.innerHTML = '';

  function addBlock(compKey) {
    const comp = layout[compKey];
    if (!comp.pins) return;
    const div = document.createElement('div');
    div.className = `comp-block ${compKey}`;
    div.style.left = comp.left + 'px';
    div.style.top = comp.top + 'px';
    div.style.width = comp.w + 'px';
    const name = compKey === 'esp32' ? 'ESP32 DevKit V1' : compKey === 'l298n' ? 'L298N Dual H-Bridge' : compKey === 'hcsr04' ? 'HC-SR04 Ultrasónico' : compKey === 'buzzer' ? 'Buzzer pasivo GPIO33 (ROJO)' : '';
    div.innerHTML = `<div class="label">${name}</div><div class="pins"></div>`;
    const pinsEl = div.querySelector('.pins');
    comp.pins.forEach(p => {
      const pinEl = document.createElement('div');
      pinEl.className = 'pin';
      pinEl.id = 'el-' + p.id;
      pinEl.innerHTML = `<span class="pin-dot" data-pin="${p.id}" data-type="${p.type}"></span><span class="pin-name">${p.label}</span>`;
      pinsEl.appendChild(pinEl);
    });
    circuitEl.appendChild(div);
  }

  addBlock('esp32');
  addBlock('l298n');
  addBlock('hcsr04');
  addBlock('buzzer');

  ['motor1', 'motor2'].forEach((key, i) => {
    const m = layout[key];
    const mDiv = document.createElement('div');
    mDiv.className = 'comp-block motor';
    mDiv.id = 'block-' + key;
    mDiv.style.left = m.left + 'px';
    mDiv.style.top = m.top + 'px';
    mDiv.innerHTML = `<div class="label">Motor ${i + 1}</div><div class="motor-block"><div class="motor-symbol" id="sym-${key}">M${i + 1}</div></div>`;
    circuitEl.appendChild(mDiv);
  });

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '620');
  svg.setAttribute('height', '400');
  svg.id = 'wires-svg';

  connections.forEach(conn => {
    const a = getPinPosition(conn.from);
    const b = getPinPosition(conn.to);
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', a.x);
    line.setAttribute('y1', a.y);
    line.setAttribute('x2', b.x);
    line.setAttribute('y2', b.y);
    line.setAttribute('data-from', conn.from);
    line.setAttribute('data-to', conn.to);
    line.setAttribute('data-type', conn.type);
    line.classList.add('wire-' + conn.type);
    svg.appendChild(line);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', midX);
    label.setAttribute('y', midY - 4);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'wire-label');
    label.textContent = conn.label || conn.type;
    svg.appendChild(label);
  });

  circuitEl.appendChild(svg);
}

function initCar3D() {
  if (!view3dEl || !window.THREE) return;
  var THREE = window.THREE;
  var w = view3dEl.clientWidth;
  var h = view3dEl.clientHeight;
  if (!w || w < 100) w = 400;
  if (!h || h < 100) h = 320;
  w = Math.max(300, w);
  h = Math.max(280, h);
  var aspect = w / h;

  scene3d = new THREE.Scene();
  scene3d.background = new THREE.Color(0x1a2332);

  camera3d = new THREE.PerspectiveCamera(42, aspect, 0.1, 20);
  camera3d.position.set(
    orbit.dist * Math.sin(orbit.phi) * Math.cos(orbit.theta),
    orbit.dist * Math.cos(orbit.phi),
    orbit.dist * Math.sin(orbit.phi) * Math.sin(orbit.theta)
  );
  camera3d.lookAt(0, 0, 0);

  try {
    renderer3d = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  } catch (err) {
    throw new Error('WebGL no disponible: ' + (err.message || err));
  }
  renderer3d.setSize(w, h);
  renderer3d.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  view3dEl.innerHTML = '';
  renderer3d.domElement.style.width = '100%';
  renderer3d.domElement.style.height = '100%';
  view3dEl.appendChild(renderer3d.domElement);
  view3dEl.classList.add('view3d-ready');

  window.addEventListener('resize', () => {
    if (!view3dEl || !camera3d || !renderer3d) return;
    const nw = Math.max(300, view3dEl.clientWidth || 400);
    const nh = Math.max(280, view3dEl.clientHeight || 320);
    camera3d.aspect = nw / nh;
    camera3d.updateProjectionMatrix();
    renderer3d.setSize(nw, nh);
  });

  const ambient = new THREE.AmbientLight(0xffffff, 0.45);
  scene3d.add(ambient);
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(3, 6, 4);
  scene3d.add(dir);
  const fill = new THREE.DirectionalLight(0x63b3ed, 0.35);
  fill.position.set(-2, 2, -2);
  scene3d.add(fill);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 8),
    new THREE.MeshStandardMaterial({ color: 0x21262d, roughness: 0.9, metalness: 0.1 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene3d.add(floor);

  const chassisGeo = new THREE.BoxGeometry(1.4, 0.06, 0.7);
  const chassisMat = new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.6, metalness: 0.3 });
  const chassis = new THREE.Mesh(chassisGeo, chassisMat);
  chassis.position.y = 0.03;
  scene3d.add(chassis);

  const wheelGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.06, 24);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a202c, roughness: 0.8, metalness: 0.2 });
  wheelLeft3d = new THREE.Mesh(wheelGeo, wheelMat);
  wheelLeft3d.rotation.z = Math.PI / 2;
  wheelLeft3d.position.set(-0.52, 0.09, 0);
  scene3d.add(wheelLeft3d);
  wheelRight3d = new THREE.Mesh(wheelGeo, wheelMat);
  wheelRight3d.rotation.z = Math.PI / 2;
  wheelRight3d.position.set(0.52, 0.09, 0);
  scene3d.add(wheelRight3d);

  const esp32Geo = new THREE.BoxGeometry(0.32, 0.04, 0.2);
  const esp32Mat = new THREE.MeshStandardMaterial({ color: 0x238636, roughness: 0.5, metalness: 0.1 });
  const esp32 = new THREE.Mesh(esp32Geo, esp32Mat);
  esp32.position.set(-0.35, 0.07, -0.15);
  scene3d.add(esp32);

  const l298Geo = new THREE.BoxGeometry(0.28, 0.05, 0.18);
  const l298Mat = new THREE.MeshStandardMaterial({ color: 0x553c9a, roughness: 0.5, metalness: 0.2 });
  const l298 = new THREE.Mesh(l298Geo, l298Mat);
  l298.position.set(0.1, 0.075, -0.08);
  scene3d.add(l298);

  const battGeo = new THREE.BoxGeometry(0.2, 0.06, 0.12);
  const battMat = new THREE.MeshStandardMaterial({ color: 0x744210, roughness: 0.6, metalness: 0.1 });
  const battery = new THREE.Mesh(battGeo, battMat);
  battery.position.set(-0.35, 0.07, 0.12);
  scene3d.add(battery);

  const sensorCyl = new THREE.CylinderGeometry(0.035, 0.035, 0.02, 20);
  const sensorMat = new THREE.MeshStandardMaterial({ color: 0x3182ce, roughness: 0.3, metalness: 0.3 });
  const hc1 = new THREE.Mesh(sensorCyl, sensorMat);
  hc1.rotation.x = Math.PI / 2;
  hc1.position.set(0.15, 0.08, 0.38);
  scene3d.add(hc1);
  const hc2 = new THREE.Mesh(sensorCyl, sensorMat);
  hc2.rotation.x = Math.PI / 2;
  hc2.position.set(0.28, 0.08, 0.38);
  scene3d.add(hc2);

  const motorGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16);
  const motorMat = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.6, metalness: 0.3 });
  const motorL = new THREE.Mesh(motorGeo, motorMat);
  motorL.rotation.z = Math.PI / 2;
  motorL.position.set(-0.52, 0.07, -0.28);
  scene3d.add(motorL);
  const motorR = new THREE.Mesh(motorGeo, motorMat);
  motorR.rotation.z = Math.PI / 2;
  motorR.position.set(0.52, 0.07, -0.28);
  scene3d.add(motorR);

  function updateCamera() {
    camera3d.position.set(
      orbit.dist * Math.sin(orbit.phi) * Math.cos(orbit.theta),
      orbit.dist * Math.cos(orbit.phi),
      orbit.dist * Math.sin(orbit.phi) * Math.sin(orbit.theta)
    );
    camera3d.lookAt(0, 0, 0);
    camera3d.updateProjectionMatrix();
  }

  view3dEl.addEventListener('mousedown', (e) => {
    if (e.button === 0) { orbit.isDown = true; orbit.prevX = e.clientX; orbit.prevY = e.clientY; }
  });
  view3dEl.addEventListener('mousemove', (e) => {
    if (!orbit.isDown) return;
    orbit.theta += (e.clientX - orbit.prevX) * 0.012;
    orbit.phi = Math.max(0.15, Math.min(Math.PI - 0.15, orbit.phi + (e.clientY - orbit.prevY) * 0.012));
    orbit.prevX = e.clientX;
    orbit.prevY = e.clientY;
    updateCamera();
  });
  view3dEl.addEventListener('mouseup', () => { orbit.isDown = false; });
  view3dEl.addEventListener('mouseleave', () => { orbit.isDown = false; });

  function animate3d() {
    requestAnimationFrame(animate3d);
    if (wheelLeft3d) wheelLeft3d.rotation.x += motor1Dir * 0.12;
    if (wheelRight3d) wheelRight3d.rotation.x += motor2Dir * 0.12;
    if (renderer3d && scene3d && camera3d) renderer3d.render(scene3d, camera3d);
  }
  animate3d();
}

function raycastSensor() {
  const cx = car.x + car.w / 2;
  const cy = car.y + car.h / 2;
  const frontX = cx + (car.w / 2) * Math.cos(car.angle);
  const frontY = cy + (car.h / 2) * Math.sin(car.angle);
  const dx = Math.cos(car.angle);
  const dy = Math.sin(car.angle);
  const maxDistPx = SENSOR_MAX_CM * PX_PER_CM;
  let minT = maxDistPx;

  for (const obs of obstacles) {
    const t = lineRectIntersect(frontX, frontY, dx, dy, obs.x, obs.y, obs.w, obs.h);
    if (t !== null && t >= 0 && t < minT) minT = t;
  }

  const distPx = Math.min(minT, maxDistPx);
  return Math.round(distPx / PX_PER_CM);
}

function lineRectIntersect(ox, oy, dx, dy, rx, ry, rw, rh) {
  let bestT = null;
  const eps = 1e-6;
  if (Math.abs(dx) > eps) {
    const tLeft = (rx - ox) / dx;
    const tRight = (rx + rw - ox) / dx;
    for (const t of [tLeft, tRight]) {
      if (t < 0) continue;
      const y = oy + t * dy;
      if (y >= ry && y <= ry + rh && (bestT === null || t < bestT)) bestT = t;
    }
  }
  if (Math.abs(dy) > eps) {
    const tTop = (ry - oy) / dy;
    const tBottom = (ry + rh - oy) / dy;
    for (const t of [tTop, tBottom]) {
      if (t < 0) continue;
      const x = ox + t * dx;
      if (x >= rx && x <= rx + rw && (bestT === null || t < bestT)) bestT = t;
    }
  }
  return bestT;
}

function drawTestArea() {
  const ctx = testAreaCanvas.getContext('2d');
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, TEST_W, TEST_H);

  ctx.strokeStyle = '#21262d';
  ctx.lineWidth = 1;
  for (let x = 0; x <= TEST_W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, TEST_H);
    ctx.stroke();
  }
  for (let y = 0; y <= TEST_H; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(TEST_W, y);
    ctx.stroke();
  }

  obstacles.forEach(obs => {
    ctx.fillStyle = '#cf222e';
    ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
    ctx.strokeStyle = '#f85149';
    ctx.lineWidth = 2;
    ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
  });

  const cx = car.x + car.w / 2;
  const cy = car.y + car.h / 2;
  const frontX = cx + (car.w / 2) * Math.cos(car.angle);
  const frontY = cy + (car.h / 2) * Math.sin(car.angle);
  const distCm = raycastSensor();
  const rayLen = Math.min(distCm * PX_PER_CM, SENSOR_MAX_CM * PX_PER_CM);
  const rx = frontX + Math.cos(car.angle) * rayLen;
  const ry = frontY + Math.sin(car.angle) * rayLen;

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(frontX, frontY);
  ctx.lineTo(rx, ry);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(car.angle);
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(-car.w / 2, -car.h / 2, car.w, car.h);
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 2;
  ctx.strokeRect(-car.w / 2, -car.h / 2, car.w, car.h);
  ctx.fillStyle = '#1e40af';
  ctx.beginPath();
  ctx.moveTo(car.w / 2, 0);
  ctx.lineTo(car.w / 2 - 6, -4);
  ctx.lineTo(car.w / 2 - 6, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  if (sensorReadout) sensorReadout.textContent = `Distancia: ${distCm} cm`;
}

function moveCar() {
  if (motor1Dir === 0 && motor2Dir === 0) return;
  const v = CAR_SPEED;
  const omega = TURN_SPEED;
  if (motor1Dir === motor2Dir) {
    car.x += v * Math.cos(car.angle);
    car.y += v * Math.sin(car.angle);
  } else {
    car.angle += motor1Dir > motor2Dir ? omega : -omega;
  }
  car.x = Math.max(car.w, Math.min(TEST_W - car.w, car.x));
  car.y = Math.max(car.h, Math.min(TEST_H - car.h, car.y));
}

function runFirmwareLogic() {
  const useArea = useTestAreaCheck && useTestAreaCheck.checked;
  if (useArea) {
    distance = raycastSensor();
    if (distanceValue) distanceValue.textContent = distance;
    if (distanceInput) distanceInput.value = distance;
  } else {
    distance = parseInt(distanceInput.value, 10);
    if (distanceValue) distanceValue.textContent = distance;
  }

  gpio['hcsr04-TRIG'] = 1;
  gpio['hcsr04-ECHO'] = 0;
  const THRESHOLD = 15;

  if (distance < THRESHOLD) {
    gpio['GPIO12'] = 1;
    gpio['GPIO13'] = 0;
    gpio['GPIO14'] = 0;
    gpio['GPIO27'] = 1;
    gpio['GPIO25'] = 1;
    gpio['GPIO26'] = 1;
    gpio['L298N_IN1'] = 1;
    gpio['L298N_IN2'] = 0;
    gpio['L298N_IN3'] = 0;
    gpio['L298N_IN4'] = 1;
    gpio['L298N_ENA'] = 1;
    gpio['L298N_ENB'] = 1;
    motor1Dir = 1;
    motor2Dir = -1;
  } else {
    gpio['GPIO12'] = 1;
    gpio['GPIO13'] = 0;
    gpio['GPIO14'] = 1;
    gpio['GPIO27'] = 0;
    gpio['GPIO25'] = 1;
    gpio['GPIO26'] = 1;
    gpio['L298N_IN1'] = 1;
    gpio['L298N_IN2'] = 0;
    gpio['L298N_IN3'] = 1;
    gpio['L298N_IN4'] = 0;
    gpio['L298N_ENA'] = 1;
    gpio['L298N_ENB'] = 1;
    motor1Dir = 1;
    motor2Dir = 1;
  }
}

function updatePinDots() {
  document.querySelectorAll('.pin-dot').forEach(dot => {
    const pinId = dot.dataset.pin;
    const type = dot.dataset.type;
    const v = pinState(pinId);
    dot.classList.remove('high', 'low', 'power', 'gnd', 'pwm');
    if (type === 'power') dot.classList.add('power');
    else if (type === 'gnd') dot.classList.add('gnd');
    else if (v) dot.classList.add(type === 'pwm' ? 'pwm' : 'high');
    else dot.classList.add('low');
  });
}

function updateWires() {
  const svg = document.getElementById('wires-svg');
  if (!svg) return;
  svg.querySelectorAll('line').forEach(line => {
    const from = line.getAttribute('data-from');
    const type = line.getAttribute('data-type');
    const v = pinState(from);
    line.classList.remove('wire-high', 'wire-low', 'wire-pwm', 'wire-power', 'wire-gnd');
    if (type === 'power') line.classList.add('wire-power');
    else if (type === 'gnd') line.classList.add('wire-gnd');
    else if (v) line.classList.add(type === 'pwm' ? 'wire-pwm' : 'wire-high');
    else line.classList.add('wire-low');
  });
}

function updateMotors() {
  const s1 = document.getElementById('sym-motor1');
  const s2 = document.getElementById('sym-motor2');
  if (s1) {
    s1.classList.remove('spin-fwd', 'spin-rev');
    if (motor1Dir === 1) s1.classList.add('spin-fwd');
    else if (motor1Dir === -1) s1.classList.add('spin-rev');
  }
  if (s2) {
    s2.classList.remove('spin-fwd', 'spin-rev');
    if (motor2Dir === 1) s2.classList.add('spin-fwd');
    else if (motor2Dir === -1) s2.classList.add('spin-rev');
  }
}

function tick() {
  runFirmwareLogic();
  moveCar();
  updatePinDots();
  updateWires();
  updateMotors();
  drawTestArea();
}

function startSimulation() {
  if (running) return;
  running = true;
  statusEl.textContent = 'Simulando…';
  statusEl.classList.add('running');
  btnRun.textContent = 'En ejecución';
  const speed = parseInt(speedInput.value, 10) || 5;
  const ms = Math.max(80, 400 - speed * 35);
  simInterval = setInterval(tick, ms);
}

function stopSimulation() {
  running = false;
  if (simInterval) clearInterval(simInterval);
  simInterval = null;
  statusEl.textContent = 'Detenido';
  statusEl.classList.remove('running');
  btnRun.textContent = 'Iniciar simulación';
  motor1Dir = 0;
  motor2Dir = 0;
  updateMotors();
  drawTestArea();
}

if (distanceInput) {
  distanceInput.addEventListener('input', () => {
    distanceValue.textContent = distanceInput.value;
    if (running) tick();
  });
}
if (speedInput) speedInput.addEventListener('input', () => { speedValue.textContent = speedInput.value; });
btnRun.addEventListener('click', () => { if (running) stopSimulation(); else startSimulation(); });
btnStop.addEventListener('click', stopSimulation);

btnAddObstacle.addEventListener('click', () => {
  addObstacleMode = !addObstacleMode;
  btnAddObstacle.textContent = addObstacleMode ? 'Clic en el área para colocar' : 'Agregar obstáculo';
  btnAddObstacle.classList.toggle('active', addObstacleMode);
});

btnClearObstacles.addEventListener('click', () => {
  obstacles = [];
  drawTestArea();
});

testAreaCanvas.addEventListener('click', (e) => {
  if (!addObstacleMode) return;
  const rect = testAreaCanvas.getBoundingClientRect();
  const scaleX = testAreaCanvas.width / rect.width;
  const scaleY = testAreaCanvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX - 25;
  const y = (e.clientY - rect.top) * scaleY - 25;
  obstacles.push({ x: Math.max(0, x), y: Math.max(0, y), w: 50, h: 50 });
  drawTestArea();
});

buildCircuit();
tick();

var car3dInitialized = false;
function loadThreeAndInit() {
  if (!view3dEl) return;
  if (car3dInitialized) return;
  const placeholder = document.getElementById('view3d-placeholder');
  function showError(msg) {
    view3dEl.innerHTML = '<div id="view3d-placeholder" class="view3d-placeholder error">' + msg + '</div>';
  }
  function doInit() {
    if (car3dInitialized) return;
    try {
      if (!window.THREE) {
        showError('Three.js no cargó. Comprueba que exista three.min.js en esta carpeta.');
        return;
      }
      car3dInitialized = true;
      initCar3D();
    } catch (e) {
      car3dInitialized = false;
      showError('Error 3D: ' + (e.message || String(e)));
      console.error('initCar3D error:', e);
    }
  }
  var done = false;
  setTimeout(function () {
    if (done) return;
    var p = document.getElementById('view3d-placeholder');
    if (p && p.textContent.indexOf('Cargando') !== -1) {
      p.innerHTML = 'Cargando… Si sigue igual, abre F12 → Consola y dime qué error sale.';
      p.classList.add('error');
    }
  }, 5000);
  if (window.THREE) {
    done = true;
    setTimeout(doInit, 150);
    return;
  }
  var script = document.createElement('script');
  script.src = 'three.min.js';
  script.onload = function () { done = true; setTimeout(doInit, 50); };
  script.onerror = function () { done = true; showError('No se pudo cargar three.min.js.'); };
  document.head.appendChild(script);
}

if (document.readyState === 'complete') {
  setTimeout(loadThreeAndInit, 100);
} else {
  window.addEventListener('load', () => setTimeout(loadThreeAndInit, 100));
}
updatePinDots();
updateWires();
drawTestArea();
