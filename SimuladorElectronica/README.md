# Simulador de Electrónica — Proyecto IA 2026

Simulador visual de electrónica para el robot explorador: **ESP32 + L298N + HC-SR04 + Chasis 2WD**, con **todas las conexiones etiquetadas**, **vista del chasis** y **área de prueba del sensor** con obstáculos. Las etiquetas `GPIOxx` coinciden con el firmware y la placa física **ESP32 DevKit 38 pines (v1.3)** (`../INTERCONEXIONES-PINES.md`).

## Contenido

### 1. Esquemático — Conexiones completas
- Cada cable muestra su **etiqueta** (ej. `GPIO12 → IN1`, `VIN → VCC`, `GND`).
- **ESP32**, **L298N**, **HC-SR04** y **2 motores** con pines y estados (rojo = HIGH, gris = LOW, naranja = PWM).

### 2. Carrito 2WD — Vista 3D (Three.js)
- **Escena 3D** con el carrito montado: chasis, dos ruedas, **ESP32** (verde), **L298N** (morado), **HC-SR04** (dos cilindros azules al frente), **batería** (marrón) y motores junto a las ruedas.
- **Arrastrar con el ratón** para girar la cámara y ver todos los componentes.
- Las **ruedas giran** en tiempo real según la simulación (adelante/atrás/giro).
- Iluminación y sombras para una vista clara y profesional.

### 3. Área de prueba del sensor
- **Canvas** donde el carrito se mueve según la lógica del firmware.
- **Agregar obstáculos**: clic en “Agregar obstáculo” y luego en el área (aparecen bloques rojos).
- El **sensor ultrasónico** se simula con un **rayo** desde el frente del carro; la **distancia** es la que hay hasta el obstáculo más cercano en esa dirección.
- Con **“Usar área (sensor real)”** activado, esa distancia alimenta la simulación: si es &lt; 15 cm el carro gira, si no avanza.
- Puedes **limpiar obstáculos** y colocar otros para probar distintos escenarios.

## Lógica de simulación

- Misma que el firmware: **distancia &lt; 15 cm** → giro; **≥ 15 cm** → avance.
- Modo **slider**: usas el deslizador de distancia (útil sin obstáculos).
- Modo **área**: la distancia la calcula el rayo del sensor sobre los obstáculos; el carro se mueve y reacciona en tiempo real.

## Cómo ejecutarlo

1. Abre **`index.html`** en el navegador.  
2. Opcional: desde esta carpeta, `python -m http.server 8080` y entra en `http://localhost:8080`.

## Archivos

- `index.html` — Esquemático, chasis 2WD, área de prueba y controles.  
- `styles.css` — Estilos (esquemático, chasis, área, etiquetas de cables).  
- `app.js` — Circuito, conexiones etiquetadas, chasis SVG, área de prueba, obstáculos, raycast del sensor y movimiento del carro.
