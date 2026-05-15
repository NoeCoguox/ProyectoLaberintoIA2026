# ESP32 DevKit **38 pines (v1.3)** — guía rápida de cableado

Placa de referencia del proyecto: **ESP32-WROOM-32** en formato **dos tiras de 19 pines** (38 pines en total), USB + antena Wi‑Fi, a menudo vendida como *ESP-32S*, *NodeMCU-32S* o *v1.3*.

El firmware **solo usa números GPIO** (lo mismo en Wokwi `wokwi-esp32-devkit-v1` que en hardware).

---

## 1. Cómo localizar un GPIO en la placa

1. Gira la placa para leer la **serigrafía blanca** junto a cada agujero.
2. Busca etiquetas del tipo **`IO12`**, **`GPIO12`**, **`12`** o en algunas placas **`D12`** (muchas veces **D12 = GPIO12**; si tu manual dice otra cosa, sigue el manual del vendedor).
3. El número que coincida con el `#define` del `.ino` es el agujero correcto.

**No usamos** en este proyecto: GPIO0, GPIO2, GPIO15 (así evitamos conflictos típicos de *boot* y LED en placa en muchos clones).

---

## 2. Pines del robot (memoria de una página)

| GPIO | ¿Qué cableas? |
|------|----------------|
| **12** | L298N **IN1** (motor A) |
| **13** | L298N **IN2** (motor A) |
| **25** | L298N **ENA** (PWM motor A; quitar jumper 5 V en ENA si tu módulo lo trae) |
| **14** | L298N **IN3** (motor B) |
| **27** | L298N **IN4** (motor B) |
| **26** | L298N **ENB** (PWM motor B) |
| **5** | HC-SR04 **Trig** |
| **18** | HC-SR04 **Echo** |
| **4** | Servo **señal** (cable naranja/amarillo) |
| **33** | Buzzer pasivo **señal** (tono PWM continuo cuando la celda es **ROJO**) |
| **21** | TCS34725 **SDA** |
| **22** | TCS34725 **SCL** |
| **34** | FC-03 **DO** encoder llanta A (canal L298N A) |
| **35** | FC-03 **DO** encoder llanta B |
| **GND** | Común: L298N, HC-SR04, servo, TCS34725, encoders FC-03, masa batería lógica |
| **3V3** | TCS34725 VIN/3V3 (lógica 3,3 V) |
| **5 V** (pin de la placa, si existe) | Solo si tu esquema alimenta HC-SR04/servo desde rail 5 V **estable**; nunca alimentes motores desde el ESP32 |

Motores: alimentación de **potencia** solo por el **VMOT / +12V** del L298N según tu batería y módulo.

---

## 3. Orientación típica (referencia visual)

Coloca la placa con el **conector USB hacia ti** y la **antena metálica** del módulo Wi‑Fi hacia arriba. En muchos modelos de 38 pines, los **GPIO bajos** (p. ej. **IO4**, **IO5**) quedan en la **tira más cercana al USB** y **IO21 / IO22** hacia la esquina opuesta — **comprueba siempre la serigrafía de tu unidad**.

---

## 4. Arduino IDE

- **Placa:** *ESP32 Dev Module* o *DOIT ESP32 DEVKIT V1* (según tu core Espressif).
- **Puerto COM:** el que aparece al enchufar USB.
- Velocidad monitor: **115200** baud (como el firmware principal).

---

## 5. Más detalle

Lista larga de módulos, alimentación y Wokwi: **`../INTERCONEXIONES-PINES.md`**.
