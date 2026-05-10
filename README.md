# Proyecto Laberinto IA 2026 — Proyecto independiente

**Ubicación:** `C:\PROYECTOS-PERSONALES\ProyectoLaberintoIA2026`

Este proyecto (simulador + firmware del robot explorador de laberinto) es **independiente** y está guardado fuera de PortalDigitalIGSS.

---

## Contenido

1. **SimuladorLaberintoIA** — Simulador en PC (Python + Pygame): laberinto 8×8, agentes, BFS/A*, visualización y métricas.
2. **FirmwareRobotLaberinto** — Firmware ESP32 para el robot físico y simulación en Wokwi (HC-SR04, L298N, opcional TCS34725). Cableado de referencia: **ESP32 DevKit 38 pines (v1.3)** — ver `INTERCONEXIONES-PINES.md` y `FirmwareRobotLaberinto/GUIA_PLACA_ESP32_38_PINES.md`.
3. **PanelWebRobot** — Panel web local (Flask) para ver en el navegador celda, distancia y RGB del TCS34725 vía TCP al ESP32.

---

## 1. Simulador de software

```bash
cd SimuladorLaberintoIA
pip install -r requirements.txt
python main.py
```

Ver `SimuladorLaberintoIA/README.md` para uso y tipos de agente.

---

## 2. Firmware y electrónica

- **En físico:** Edita `FirmwareRobotLaberinto/secrets.h` (SSID/contraseña). Abre `FirmwareRobotLaberinto.ino` en Arduino IDE, placa tipo **ESP32 Dev Module** (DevKit **38 pines v1.3** compatible), compila y sube al ESP32.
- **En Wokwi:** Crea proyecto ESP32 en [wokwi.com](https://wokwi.com), añade HC-SR04 y L298N según `FirmwareRobotLaberinto/diagram.json`, pega el código del `.ino` con `USE_COLOR_SENSOR 0`.

Pines y protocolo están comentados al inicio del `.ino`.

---

## 3. Panel web (visualizar sensores)

```bash
cd PanelWebRobot
pip install -r requirements.txt
py app.py
```

Abre `http://127.0.0.1:5050`, pon la IP del ESP32 y usa **Leer ahora** o **Auto cada 1 s**. El PC debe estar en la misma red que el robot.

---

## Unir PC y robot

Comandos TCP (puerto 8888, texto + `\n`): `PING` → `PONG`; `LEER` → `DIST:...`, `THRESH:...` (umbrales proporción: `cmin`, `pb`, `pg`, `pr`, `tcs=101ms_16x`), `RGB:...`, `RGBP:r,g,b` (% sobre R+G+B), `SENSOR:OK|OFF` (SKIP solo firmware antiguo), `CELDA:...`, `LISTO`; `HARDWARE` → … + `LISTO`; `MOVER:ADELANTE` (opcional duración en ms: `MOVER:ADELANTE:250`) e igual `MOTOR:A:ATRAS:500` → mismas líneas y `LISTO`. Clasificación de color en el firmware: solo **ROJO / VERDE / AZUL** (`CELDA:`; sin BLANCO; `UNKNOWN` si C baja o RGB simétrico). Umbrales en `FirmwareRobotLaberinto.ino` y comando TCP `TCS_CAL:`.
