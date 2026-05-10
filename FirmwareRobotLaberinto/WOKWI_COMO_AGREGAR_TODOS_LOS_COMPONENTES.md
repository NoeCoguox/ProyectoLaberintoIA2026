# Cómo tener en Wokwi todos los componentes: ESP32 + L298N + 2 motores DC + HC-SR04

En Wokwi el **L298N** y los **motores DC** no salen en el buscador porque son un **chip personalizado**. La forma de tenerlos es **abrir un proyecto que ya los trae** y hacer una copia (Fork). Luego cambias el diagrama y el código por el de tu robot.

---

## Paso 1: Abrir el proyecto que ya tiene L298N y motores

1. Abre el navegador y entra a este enlace (proyecto de la comunidad con L298N y 2 motores):
   - **https://wokwi.com/projects/395397773471623169**
2. Si te pide, **inicia sesión** en Wokwi (o crea una cuenta gratis).
3. Arriba a la derecha haz clic en **"Fork"** (o **"Copy"** / **"Duplicate"**, según lo que muestre).
4. Se creará **tu copia** del proyecto. En esa copia ya están:
   - El chip personalizado **L298N** (archivos `l298n.chip.json` y `l298n.chip.c`).
   - La simulación de los **2 motores DC** (suelen estar integrados en el chip L298N).
   - Un `diagram.json` y un `sketch.ino` que luego vamos a sustituir.

---

## Paso 2: Cambiar el diagrama a ESP32 + L298N + HC-SR04

El proyecto que copiaste usa **Arduino**. Nosotros queremos **ESP32**, **L298N** (el mismo chip que ya está) y **HC-SR04**.

**Hardware real (ESP32 DevKit 38 pines / v1.3):** las conexiones `GPIOxx` del `diagram.json` son las mismas que debes cablear a los agujeros marcados **IOxx** en la placa física. Guía: `INTERCONEXIONES-PINES.md` y `GUIA_PLACA_ESP32_38_PINES.md` en esta carpeta.

1. En tu proyecto (el que hiciste Fork), arriba verás pestañas: **sketch.ino** | **diagram.json** | **Library Manager** y los archivos del chip (**l298n.chip.json**, **l298n.chip.c**).
2. Haz clic en la pestaña **diagram.json**.
3. **Selecciona todo** el contenido (Ctrl+A) y **bórralo**.
4. Abre en tu PC el archivo que está en tu carpeta del proyecto:
   - `FirmwareRobotLaberinto/diagram-wokwi-esp32-l298n-hcsr04.json`
5. Copia **todo** su contenido y **pégalo** en la pestaña `diagram.json` de Wokwi (reemplazando lo que había).
6. Guarda (Ctrl+S o botón **Save**).

Con eso tu diagrama tendrá:
- **ESP32** a la izquierda.
- **L298N** abajo al centro (driver de motores).
- **HC-SR04** a la derecha (sensor frontal).
- Conexiones con colores estándar: rojo = alimentación, negro = GND, verde = control motores, naranja = PWM (ENA/ENB), azul/verde = TRIG/ECHO.
- Rutas de cable ordenadas para que se vea limpio y profesional.

---

## Paso 3: Poner tu código (firmware) en el proyecto

1. Haz clic en la pestaña **sketch.ino**.
2. Selecciona todo el código (Ctrl+A) y bórralo.
3. Abre en tu PC el archivo:
   - `FirmwareRobotLaberinto/FirmwareRobotLaberinto.ino`
4. Copia **todo** su contenido y pégalo en **sketch.ino** en Wokwi.
5. Guarda (Ctrl+S).

Tu firmware ya usa los pines correctos:
- L298N: IN1=12, IN2=13, IN3=14, IN4=27, ENA=25, ENB=26.
- HC-SR04: Trig=5, Echo=18.

No hace falta cambiar pines si usas el `diagram-wokwi-esp32-l298n-hcsr04.json` que te dejamos.

---

## Paso 4: Probar la simulación

1. Haz clic en el botón **Play** (triángulo verde) para iniciar la simulación.
2. Abre el **Serial Monitor** (icono de terminal o pestaña inferior).
3. Deberías ver:
   - Mensajes de conexión WiFi (o timeout si no configuraste red).
   - Si acercas “obstáculo” al HC-SR04 en Wokwi (clic en el sensor y cambias la distancia), la lógica del firmware reacciona según la distancia.
4. Los **motores** en el diagrama (en el bloque L298N) deberían reflejar adelante / atrás / giro según el código.

---

## Resumen de componentes en el diagrama

| Componente   | En Wokwi                         | Pines / conexión |
|-------------|-----------------------------------|-------------------|
| ESP32       | `wokwi-esp32-devkit-v1` (mismo mapa GPIO que placa física **38 pines v1.3**) | GPIO, GND, VIN    |
| L298N       | Chip personalizado `l298n`       | IN1, IN2, IN3, IN4, ENA, ENB, GND, VCC |
| 2 motores DC| Incluidos en el chip L298N       | Salidas del driver |
| HC-SR04     | `wokwi-hc-sr04`                 | TRIG, ECHO, VCC, GND |

---

## Si algo no funciona

- **No se ve el L298N o los motores:** Asegúrate de haber hecho Fork del proyecto **395397773471623169** y de haber pegado el `diagram-wokwi-esp32-l298n-hcsr04.json` completo (no mezclar con el diagrama anterior).
- **Error de pines:** Revisa que en `diagram.json` los nombres de pines del chip coincidan con los del archivo `l298n.chip.json` (por ejemplo IN1, IN2, IN3, IN4, ENA, ENB). Si en tu copia el chip usa otros nombres, ajusta el `diagram.json` o el firmware para que coincidan.
- **Sensor HC-SR04:** En Wokwi puedes hacer clic en el HC-SR04 y cambiar la “distancia” simulada para probar la lógica de obstáculos.

Cuando sigas estos pasos tendrás en un solo proyecto de Wokwi: **ESP32 + L298N + 2 motores DC + HC-SR04**, listo para corroborar que los componentes y la lógica son funcionales.
