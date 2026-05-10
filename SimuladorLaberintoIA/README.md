# Simulador Laberinto IA — Proyecto Final 2026

Simulador en PC del agente explorador en cuadrícula 8×8: mundo, sensores simulados, algoritmos de búsqueda (BFS, A*) y varios tipos de agente.

## Requisitos

- Python 3.8 o superior
- Pygame

## Instalación

```bash
cd SimuladorLaberintoIA
pip install -r requirements.txt
```

## Ejecución

```bash
python main.py
```

## Uso

1. **Iniciar / Pausar**: arranca o pausa la simulación.
2. **Reiniciar**: vuelve al estado inicial (inicio en (0,0), mapa por defecto).
3. **Tipo de agente**:
   - **Agente reactivo**: reacciona solo al obstáculo delante (gira).
   - **Agente objetivos (A*)**: planifica ruta con A* hacia el objetivo; replanifica al descubrir obstáculos.
   - **Agente objetivos (BFS)**: igual con BFS.
   - **Agente modelo (A*)**: mantiene mapa interno y usa A*.

El mapa mostrado es el **mapa descubierto** por el agente (gris = desconocido, colores = libre/pared/inicio/objetivo). Las métricas (movimientos, tiempo, nodos explorados, longitud de ruta) se actualizan en tiempo real.

## Estructura del código

- `config.py`: dimensiones, tipos de celda, colores.
- `world.py`: mundo real (laberinto 8×8), tipo de cada celda.
- `agent_state.py`: estado del agente (posición, orientación, mapa conocido).
- `search.py`: BFS y A*.
- `agent_types.py`: reactivo, basado en objetivos, basado en modelo.
- `simulator.py`: un paso = leer sensores, actualizar mapa, decidir acción, ejecutar.
- `main.py`: interfaz Pygame (cuadrícula, agente, panel de métricas y botones).

## Conectar con el robot físico

El mismo protocolo (MOVER:ADELANTE, CELDA:..., DIST:..., LISTO) se usa en el firmware del ESP32. Para controlar el robot desde esta lógica tendrías que:

1. Sustituir la ejecución simulado de movimientos por envío de comandos por TCP al ESP32.
2. Recibir CELDA y DIST y actualizar el mapa del agente con esos valores.
3. La decisión (búsqueda, tipo de agente) sigue en la PC; el robot solo ejecuta movimientos y reporta sensores.

Ver carpeta `../FirmwareRobotLaberinto` para el código del ESP32. Cableado físico (DevKit **38 pines v1.3**): `../INTERCONEXIONES-PINES.md` y `../FirmwareRobotLaberinto/GUIA_PLACA_ESP32_38_PINES.md`.
