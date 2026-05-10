/*
 * Firmware Robot Explorador Laberinto - Proyecto IA 2026
 * ESP32: Wi-Fi, comandos de movimiento, sensores (color + ultrasónico en servo).
 * Compatible con el protocolo del simulador en PC.
 *
 * Credenciales: copia secrets.h.example -> secrets.h y edita WIFI_SSID / WIFI_PASSWORD.
 *
 * Para Wokwi: definir USE_COLOR_SENSOR 0 (no hay librería TCS34725 en simulación).
 * Para hardware real: USE_COLOR_SENSOR 1 y instalar "Adafruit TCS34725" en Arduino IDE.
 *
 * Placa fisica de referencia: ESP32-WROOM-32 **DevKit 38 pines** (v1.3 / 2x19). Los GPIO
 * coinciden con Wokwi (wokwi-esp32-devkit-v1). En la placa busca serigrafia IO12, IO25...
 * Guia: ../INTERCONEXIONES-PINES.md y GUIA_PLACA_ESP32_38_PINES.md en esta carpeta.
 *
 * ========== TABLA DE CONEXIONES (ESP32) ==========
 * L298N — motores (cada canal = una llanta; izq/der depende de cómo cablees el robot)
 *   Motor A — IN1 -> GPIO12, IN2 -> GPIO13, ENA (PWM) -> GPIO25
 *   Motor B — IN3 -> GPIO14, IN4 -> GPIO27, ENB (PWM) -> GPIO26
 *   GND L298N <-> GND ESP32 (común); alimentación motores según tu batería (no desde 3V3 del ESP32)
 *
 * HC-SR04 — montado en el brazo del servo (gira con el servo)
 *   VCC -> 5V (idealmente del mismo rail que alimenta el servo, con GND común al ESP32)
 *   Trig -> GPIO5
 *   Echo -> GPIO18
 *   GND -> GND común
 *
 * Servo 180° (p. ej. SG90) — mueve el ultrasonido
 *   Marrón/Negra -> GND común
 *   Roja -> +5V (mejor fuente externa si el servo consume mucho; GND unido al ESP32)
 *   Naranja/Amarilla (señal PWM) -> GPIO4
 *
 * Buzzer pasivo (alerta cuando CELDA=ROJO, tono continuo PWM)
 *   Terminal + -> GPIO33 (ideal: resistencia serie 100–220 Ω) · otro terminal -> GND
 *
 * LED actividad motores (opcional, visualizar que hay pulso MOVER/MOTOR:* )
 *   Anodo LED -> resistencia 220 Ω (típico) -> GPIO32 · catodo LED -> GND
 *   El firmware lo pone en HIGH mientras gire cualquier canal (mismos flags que moving/movingA/movingB).
 *   Pon MOTOR_ACTIVITY_LED_PIN en -1 si no usás LED. Podés cambiar el pin con #define MOTOR_ACTIVITY_LED_PIN ...
 *
 * ----- Sensor de color TCS34725 (chip TCS34725, p. ej. módulo Adafruit o clon I2C) -----
 * El sensor mira hacia el suelo del laberinto. I2C por defecto en ESP32: SDA=GPIO21, SCL=GPIO22.
 *
 *   Pin del módulo    ->  ESP32
 *   ----------------     -------
 *   VIN  (o 3V3)      ->  3V3  (3,3 V; el ESP32 es lógica 3V3)
 *   GND               ->  GND  (mismo GND que el resto del circuito)
 *   SDA               ->  GPIO21  (I2C datos; en Wire.begin() por defecto)
 *   SCL               ->  GPIO22  (I2C reloj)
 *   LED (si lo trae)  ->  sin conectar o según placa: en Adafruit, dejar flotante o ver datasheet
 *                        (controla el LED blanco integrado; no es obligatorio para leer color)
 *
 * Dirección I2C habitual: 0x29; algunas placas usan 0x39 (el firmware prueba ambas).
 * Clasificacion de color: solo ROJO, VERDE, AZUL (proporciones pr,pg,pb + umbral clear C; ver classifyCell).
 * Sin BLANCO: celdas claras/gris se resuelven por reglas debiles o por canal dominante en RAW.
 * Convencion proyecto 2026: VERDE suelo = meta (objetivo TCS34725); AZUL = paso; ROJO = no pasar.
 * Librerías: "Adafruit TCS34725" y "Adafruit Unified Sensor" (dependencia) en el Gestor de librerías.
 *
 * Librerías (Gestor de bibliotecas de Arduino IDE):
 *   - ESP32Servo  (NO uses la librería "Servo" genérica de AVR; en ESP32 usa esta)
 *   - Adafruit TCS34725 + dependencias (Adafruit Unified Sensor, Adafruit BusIO)
 * WiFi viene con el core ESP32.
 *
 * ========== CONTRATO: ULTRASONIDO (HC-SR04) Y COLOR (TCS34725) ==========
 * Son dos subsistemas independientes en logica de firmware:
 *
 *   HC-SR04 — Solo obstaculo / distancia. Su valor se envia en DIST: (cm o 999 sin eco).
 *   No participa en classifyCell(), no filtra ni modifica RGB/CELDA, no hay umbrales que
 *   enlacen "hay obstaculo" con "no hay color".
 *
 *   TCS34725 — Solo color del suelo. classifyCell(r,g,b,c) no recibe ni consulta la distancia.
 *   CELDA y RGB dependen unicamente del TCS34725 y sus umbrales.
 *
 * El orden de lectura en LEER (color primero, ultrasonido despues) es solo tecnico: reducir
 * acoplamiento mecanico/electrico; no implica decision cruzada entre sensores.
 */
#define USE_COLOR_SENSOR 1  // 1 = físico con TCS34725, 0 = Wokwi/sin sensor color

#include "secrets.h"
#include <stdio.h>
#include <math.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include <ESP32Servo.h>
#include <Wire.h>
#if USE_COLOR_SENSOR
#include <Adafruit_TCS34725.h>
#endif

// ========== CONFIGURACIÓN WI-FI ==========
WiFiServer server(8888);
WiFiClient client;

const unsigned long WIFI_CONNECT_TIMEOUT_MS = 60000;
const unsigned long WIFI_RECONNECT_INTERVAL_MS = 5000;

// ========== PINES MOTORES (L298N) ==========
#define MOTOR_A_IN1 12
#define MOTOR_A_IN2 13
/**
 * Si «B adelante» no mueve pero «B atrás» sí: muchas veces IN3/IN4 del L298N están cruzados
 * respecto al esquema (IN3 del integrado va al GPIO27 del ESP e IN4 al GPIO14).
 * Poné 1, recompilá y probá de nuevo 3 y 4 en CalibracionLlantas.
 */
#ifndef MOTOR_B_IN3_IN4_GPIO_SWAPPED
#define MOTOR_B_IN3_IN4_GPIO_SWAPPED 0
#endif
#if MOTOR_B_IN3_IN4_GPIO_SWAPPED
#define MOTOR_B_IN3 27
#define MOTOR_B_IN4 14
#else
#define MOTOR_B_IN3 14
#define MOTOR_B_IN4 27
#endif
#define ENA 25  // PWM motor A (opcional)
#define ENB 26  // PWM motor B (opcional)

/**
 * Si al pulsar «adelante» (MOVER:ADELANTE) el carrito gira en vez de ir recto, una llanta va
 * «al revés» respecto a la otra en el L298N. Pon a 1 el motor que corrige (prueba solo uno).
 * No cambia pines GPIO: invierte la secuencia IN1/IN2 o IN3/IN4 en software para ese canal.
 */
#ifndef MOTOR_A_INVERT
#define MOTOR_A_INVERT 0
#endif
#ifndef MOTOR_B_INVERT
#define MOTOR_B_INVERT 0
#endif

/** Monitor serie USB: 1 = imprime [TCP] y [MOV] para comprobar que los comandos llegan y el pulso termina. */
#define SERIAL_LOG_MOV 1

// ========== ULTRASÓNICO HC-SR04 (sobre el servo) — solo distancia / obstáculo ==========
// Proposito: linea DIST:. No interviene en classifyCell ni en umbrales de color.
#define TRIG 5
#define ECHO 18

// ========== SERVO 180° (orientación del ultrasonido) ==========
#define SERVO_PIN 4
// Ángulo que consideras "frente" del robot (ajusta si el sensor no queda centrado mecánicamente)
#define SERVO_ANGLE_FORWARD 90
// Pausa tras mover el servo antes de medir (ms); sube si el servo vibra al leer
#define SERVO_SETTLE_MS 45

/** Barrido continuo 0..180..0 (ultrasonido). Desactivar con SERVO_SWEEP:0 o comando SERVO:x */
#define SERVO_SWEEP_DEFAULT_ON 1
/** Ms entre pasos de 1 grado (menor = barrido mas rapido; ~30 ms ~ 12 s ida y vuelta completa) */
#define SERVO_SWEEP_STEP_MS 30
/** Minimo ms entre lineas SERVO_ANG: (Serial/TCP). Mismo ritmo que el bloque de sensores por USB (3 s). */
#define SERVO_ANGLE_REPORT_MIN_MS 3000

Servo servoUltrasonic;
int currentServoAngle = -1;

bool g_servoSweepEnabled = (SERVO_SWEEP_DEFAULT_ON != 0);
int g_sweepAngle = 0;
int g_sweepDir = 1;
unsigned long g_lastServoSweepMs = 0;
unsigned long g_lastServoAngReportMs = 0;

// ========== SENSOR DE COLOR TCS34725 (I2C) — solo suelo / CELDA; sin usar DIST ==========
#if USE_COLOR_SENSOR
// 154 ms + ganancia 60x: mas fotones integrados y maxima amplificacion = objetivo util ~8-10 cm al suelo
// (a muy poca distancia puede saturar; si pasa, bajar a GAIN_16X o 4X en el constructor)
Adafruit_TCS34725 tcs = Adafruit_TCS34725(TCS34725_INTEGRATIONTIME_154MS, TCS34725_GAIN_60X);
#endif
bool hasColorSensor = false;

#define I2C_SDA 21
#define I2C_SCL 22

/** Buzzer pasivo: PWM continuo mientras classifyCell sea ROJO (LEER / dump USB / tras MOVER LISTO). */
#define BUZZER_PIN 33
#ifndef BUZZER_FREQ_HZ
#define BUZZER_FREQ_HZ 2500
#endif

/** LED muestra pulsos MOVER:* / MOTOR:* (HIGH = motores activos). -1 = desactivado. Ver cabecera "LED actividad motores". */
#ifndef MOTOR_ACTIVITY_LED_PIN
#define MOTOR_ACTIVITY_LED_PIN 32
#endif

#if USE_COLOR_SENSOR

/** Prueba direcciones I2C habituales del TCS34725 (Wire.begin ya ejecutado). */
bool tryBeginTcs34725() {
  if (tcs.begin(0x29)) {
    return true;
  }
  delay(15);
  if (tcs.begin(0x39)) {
    return true;
  }
  return false;
}
#endif

// ========== CONSTANTES DE MOVIMIENTO (calibrar en físico) ==========
/** Duración por defecto del pulso MOVER:* / MOTOR:*:ADELANTE|ATRAS (web / TCP). Opcional: <cmd>:50..60000 (ms), ej. MOVER:ADELANTE:250 */
const unsigned long MS_MOVE_PULSE_MS = 5000;
const int PWM_SPEED = 200;               // 0-255

/**
 * Tras MOVER:IZQUIERDA / MOVER:DERECHA, pulso extra ADELANTE (misma lógica que avance) a PWM bajo.
 * Ayuda a que la rueda loca se alinee antes del siguiente recto. 0 = desactivado (recomendado en
 * laberinto si el cliente asume 1 solo movimiento por LISTO). Probar 80–220 ms y PWM 70–140.
 */
#ifndef POST_TURN_SETTLE_MS
#define POST_TURN_SETTLE_MS 0
#endif
#ifndef POST_TURN_SETTLE_PWM
#define POST_TURN_SETTLE_PWM 100
#endif

// Estado
bool moving = false;
unsigned long moveEndTime = 0;
/** 0 = ninguno; durante MOVER:* reaplicamos salidas cada loop (LEDC + servo). */
static uint8_t g_moverPulseKind = 0;
static void refreshMoverPulseOutputs(void);
/** Tras fin de giro MOVER, pulso corto adelante antes de LISTO (ver POST_TURN_SETTLE_MS). */
static bool g_postTurnSettling = false;
static unsigned long g_postTurnSettleEnd = 0;
static void motorApplyA(bool forward);
static void motorApplyB(bool forward);
/** Prueba por llanta: MOTOR:A:* / MOTOR:B:* (solo un canal L298N a la vez en el pulso). */
bool movingA = false;
bool movingB = false;
unsigned long motorAEndTime = 0;
unsigned long motorBEndTime = 0;
String currentCommand = "";
unsigned long lastWifiReconnectAttempt = 0;
bool tcpServerStarted = false;

#if MOTOR_ACTIVITY_LED_PIN >= 0
static inline void updateMotorActivityLed() {
  bool on = moving || movingA || movingB;
  digitalWrite(MOTOR_ACTIVITY_LED_PIN, on ? HIGH : LOW);
}
#else
static inline void updateMotorActivityLed() {}
#endif

void printSensorSnapshotToSerial(long dist, const String& celdaStr, uint16_t r, uint16_t g, uint16_t b, uint16_t c,
                                 bool colorHardwareOk, bool colorEvaluado, bool esAutomatico);

/** Copia de la ultima lectura enviada por TCP (Serial USB va despues de LISTO para no bloquear el cliente). */
static long g_lastReadDist = 0;
static String g_lastReadCelda = "UNKNOWN";
static uint16_t g_lastR = 0, g_lastG = 0, g_lastB = 0, g_lastC = 0;
static bool g_lastColorEval = false;

static void mirrorLastReadToSerialAfterTcp() {
#if USE_COLOR_SENSOR
  printSensorSnapshotToSerial(g_lastReadDist, g_lastReadCelda, g_lastR, g_lastG, g_lastB, g_lastC, hasColorSensor,
                              g_lastColorEval, false);
#else
  printSensorSnapshotToSerial(g_lastReadDist, g_lastReadCelda, g_lastR, g_lastG, g_lastB, g_lastC, false, true, false);
#endif
}

/** Monitor serie USB: lectura periodica de ultrasonido + color (no envia TCP). */
const unsigned long SERIAL_SENSOR_INTERVAL_MS = 3000;
unsigned long lastSerialSensorMs = 0;

/**
 * Ultrasonido = solo obstaculo/distancia (texto monitor util si >= MIN_DIST_CM_ULTRASONIC y dist != 999).
 * Color = solo TCS34725; nunca se condiciona por dist. Ver contrato al inicio del archivo.
 * Lectura: TCS34725 antes que HC-SR04 para no mezclar vibracion/pulseIn/TRIG con I2C (no es logica cruzada).
 */
#define MIN_DIST_CM_ULTRASONIC 5

bool distanciaUltrasonidoUtil(long distCm) {
  return (distCm != 999 && distCm >= MIN_DIST_CM_ULTRASONIC);
}

/** Ultima H (grados) y S (0-1) calculadas en classifyCell (para Monitor serie). */
float lastHueGrados = -1.0f;
float lastSaturacion = 0.0f;
#if USE_COLOR_SENSOR
/** Como se clasifico el ultimo color: prop-AZUL, prop-ROJO, C-baja, etc. (Monitor serie). */
String lastColorRegla = "-";
#endif

/** Nombre legible del color detectado (CELDA = ROJO|AZUL|VERDE|UNKNOWN; BLANCO solo legacy). */
String nombreColorHumano(const String& celda) {
  if (celda == "ROJO") return "Rojo";
  if (celda == "AZUL") return "Azul";
  if (celda == "VERDE") return "Verde meta";
  if (celda == "BLANCO") return "Blanco (legacy; firmware solo R/G/B)";
  if (celda == "AMARILLO") return "Amarillo";  // legacy; firmware ya no emite AMARILLO
  if (celda == "UNKNOWN") return "No clasificado (C baja o RGB simetrico)";
  if (celda == "SKIP") {
    return "(color no evaluado — firmware antiguo o estado raro)";
  }
  return celda;
}

#if USE_COLOR_SENSOR
/** Clear C minimo: a mas altura/distancia al papel la reflexion es debil; ~40 suele permitir ~8-10 cm (calibrar). */
#define TCS34725_CLEAR_MIN 40U
/** Umbral minimo de proporcion del canal dominante (sobre R+G+B) para regla "fuerte". Simetrico R/G/B. */
#define TCS_PR_ROJO 0.39f
#define TCS_PG_VERDE 0.39f
#define TCS_PB_AZUL 0.39f
/**
 * Reglas "debiles": con obstaculo/sombra, R,G,B se aplana (~32-35% cada uno) y las reglas fuertes fallan.
 * Si el mayor canal supera al segundo en >= TCS_WEAK_GAP y supera TCS_WEAK_MIN_DOMINANT, se clasifica por dominancia.
 */
#define TCS_WEAK_GAP 0.014f
#define TCS_WEAK_MIN_DOMINANT 0.322f

/**
 * Parametros legacy (TCS_CAL / THRESH en panel): ya no afectan classifyCell (solo R/G/B).
 * Se mantienen para no romper clientes que envian blc, blcp, bdg...
 */
#define TCS_BLANCO_CLEAR_MIN_GENERAL 140U
#define TCS_BLANCO_DEV_MAX_GENERAL 0.055f
#define TCS_BLANCO_SAT_MAX_GENERAL 0.098f
#define TCS_BLANCO_CLEAR_MIN_PURO   520U
#define TCS_BLANCO_DEV_MAX_PURO     0.028f
#define TCS_BLANCO_SAT_MAX_PURO     0.042f

/** Umbrales en RAM (inicial = #define); TCP `TCS_CAL:cmin=...,pb=...` ajusta sin recompilar (blc/blcp/bdg... legacy, no clasifican). */
static uint16_t g_tcsClearMin = TCS34725_CLEAR_MIN;
static float g_tcsPrRojo = TCS_PR_ROJO;
static float g_tcsPgVerde = TCS_PG_VERDE;
static float g_tcsPbAzul = TCS_PB_AZUL;
static float g_tcsWeakGap = TCS_WEAK_GAP;
static float g_tcsWeakMinDom = TCS_WEAK_MIN_DOMINANT;
static uint16_t g_tcsBlancoClearGen = TCS_BLANCO_CLEAR_MIN_GENERAL;
static uint16_t g_tcsBlancoClearPuro = TCS_BLANCO_CLEAR_MIN_PURO;
static float g_tcsBlancoDevGen = TCS_BLANCO_DEV_MAX_GENERAL;
static float g_tcsBlancoDevPuro = TCS_BLANCO_DEV_MAX_PURO;
static float g_tcsBlancoSatGen = TCS_BLANCO_SAT_MAX_GENERAL;
static float g_tcsBlancoSatPuro = TCS_BLANCO_SAT_MAX_PURO;

/** Claves: cmin pb pg pr wg wd blc blcp bdg bdp bsg bsp */
static String applyTcsCalPayload(const String& payloadIn) {
  String p = payloadIn;
  p.trim();
  if (!p.length()) {
    return String("vacio");
  }
  int start = 0;
  while (start < (int)p.length()) {
    int comma = p.indexOf(',', start);
    String tok = (comma < 0) ? p.substring(start) : p.substring(start, comma);
    tok.trim();
    start = (comma < 0) ? (int)p.length() : comma + 1;
    if (!tok.length()) {
      continue;
    }
    int eq = tok.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    String key = tok.substring(0, eq);
    String vs = tok.substring(eq + 1);
    key.trim();
    key.toLowerCase();
    vs.trim();
    float vf = vs.toFloat();
    int vi = vs.toInt();
    if (key == "cmin") {
      g_tcsClearMin = (uint16_t)constrain(vi, 0, 4095);
    } else if (key == "pb") {
      g_tcsPbAzul = constrain(vf, 0.05f, 0.95f);
    } else if (key == "pg") {
      g_tcsPgVerde = constrain(vf, 0.05f, 0.95f);
    } else if (key == "pr") {
      g_tcsPrRojo = constrain(vf, 0.05f, 0.95f);
    } else if (key == "wg") {
      g_tcsWeakGap = constrain(vf, 0.001f, 0.2f);
    } else if (key == "wd") {
      g_tcsWeakMinDom = constrain(vf, 0.15f, 0.55f);
    } else if (key == "blc") {
      g_tcsBlancoClearGen = (uint16_t)constrain(vi, 0, 4095);
    } else if (key == "blcp") {
      g_tcsBlancoClearPuro = (uint16_t)constrain(vi, 0, 4095);
    } else if (key == "bdg") {
      g_tcsBlancoDevGen = constrain(vf, 0.005f, 0.25f);
    } else if (key == "bdp") {
      g_tcsBlancoDevPuro = constrain(vf, 0.005f, 0.25f);
    } else if (key == "bsg") {
      g_tcsBlancoSatGen = constrain(vf, 0.01f, 0.35f);
    } else if (key == "bsp") {
      g_tcsBlancoSatPuro = constrain(vf, 0.01f, 0.35f);
    }
  }
  return String("");
}

void printUmbralesColorSerial() {
  Serial.println(F("--- Umbrales color (proporciones sobre R+G+B) ---"));
  Serial.print(F("  Clear C minimo: "));
  Serial.println((int)g_tcsClearMin);
  Serial.println(F("  AZUL:  pb > umbral y pb > pr y pb > pg"));
  Serial.println(F("  VERDE: pg > umbral y pg > pr y pg > pb"));
  Serial.println(F("  ROJO:  pr > umbral y pr > pg y pr > pb"));
  Serial.println(F("  Debil (sombra/luz plana): gap y min dominante -> gana el mayor"));
  Serial.println(F("  Ultimo recurso: mayor canal RAW (R/G/B) -> solo tres colores (sin BLANCO)"));
  Serial.println(F("  TCS34725: integracion 154 ms, ganancia 60x (objetivo ~8-10 cm al suelo)"));
}

void printUmbralesColorSerialCompact() {
  Serial.print(F("Umbrales: C>="));
  Serial.print((int)g_tcsClearMin);
  Serial.print(F(" pb>"));
  Serial.print(g_tcsPbAzul, 2);
  Serial.print(F(" pg>"));
  Serial.print(g_tcsPgVerde, 2);
  Serial.print(F(" pr>"));
  Serial.print(g_tcsPrRojo, 2);
  Serial.print(F(" | BL dec="));
  Serial.print((unsigned)g_tcsBlancoClearGen);
  Serial.print(F("/pur="));
  Serial.print((unsigned)g_tcsBlancoClearPuro);
  Serial.print(F(" | weak gap="));
  Serial.print(g_tcsWeakGap, 3);
  Serial.print(F(" wd="));
  Serial.print(g_tcsWeakMinDom, 3);
  Serial.println(F(" | TCS 154ms 60x"));
}

void emitThreshTcp() {
  client.print(F("THRESH:cmin="));
  client.print((int)g_tcsClearMin);
  client.print(F(",pb="));
  client.print(g_tcsPbAzul, 2);
  client.print(F(",pg="));
  client.print(g_tcsPgVerde, 2);
  client.print(F(",pr="));
  client.print(g_tcsPrRojo, 2);
  client.print(F(",wg="));
  client.print(g_tcsWeakGap, 3);
  client.print(F(",wd="));
  client.print(g_tcsWeakMinDom, 3);
  client.print(F(",blc="));
  client.print((unsigned)g_tcsBlancoClearGen);
  client.print(F(",blcp="));
  client.print((unsigned)g_tcsBlancoClearPuro);
  client.print(F(",bdg="));
  client.print(g_tcsBlancoDevGen, 3);
  client.print(F(",bdp="));
  client.print(g_tcsBlancoDevPuro, 3);
  client.print(F(",bsg="));
  client.print(g_tcsBlancoSatGen, 3);
  client.print(F(",bsp="));
  client.print(g_tcsBlancoSatPuro, 3);
  client.println(F(",tcs=154ms_60x"));
}

/** Porcentaje de cada canal sobre la suma (R+G+B)=100%. */
void printRgbPctSerial(uint16_t r, uint16_t g, uint16_t b) {
  uint32_t sum = (uint32_t)r + (uint32_t)g + (uint32_t)b;
  Serial.print(F("RGB%  R="));
  if (sum == 0) {
    Serial.println(F("0.0%  G=0.0%  B=0.0%  (sobre R+G+B)"));
    return;
  }
  float inv = 100.0f / (float)sum;
  Serial.print(inv * (float)r, 1);
  Serial.print(F("%  G="));
  Serial.print(inv * (float)g, 1);
  Serial.print(F("%  B="));
  Serial.print(inv * (float)b, 1);
  Serial.println(F("%  (sobre R+G+B)"));
}

void emitRgbPctTcp(uint16_t r, uint16_t g, uint16_t b) {
  uint32_t sum = (uint32_t)r + (uint32_t)g + (uint32_t)b;
  client.print(F("RGBP:"));
  if (sum == 0) {
    client.println(F("0,0,0"));
    return;
  }
  float inv = 100.0f / (float)sum;
  client.print(inv * (float)r, 1);
  client.print(F(","));
  client.print(inv * (float)g, 1);
  client.print(F(","));
  client.println(inv * (float)b, 1);
}
#endif

/** Escribe angulo sin pausa (barrido en tiempo real). */
void servoWriteImmediate(int angle) {
  if (angle < 0) angle = 0;
  if (angle > 180) angle = 180;
  servoUltrasonic.write(angle);
  currentServoAngle = angle;
}

void servoSetAngle(int angle) {
  if (angle < 0) angle = 0;
  if (angle > 180) angle = 180;
  servoUltrasonic.write(angle);
  if (angle != currentServoAngle) {
    delay(SERVO_SETTLE_MS);
  }
  currentServoAngle = angle;
}

void emitServoAngleLine() {
  Serial.print(F("SERVO_ANG:"));
  Serial.println(currentServoAngle);
  if (client.connected()) {
    client.print(F("SERVO_ANG:"));
    client.println(currentServoAngle);
  }
}

/**
 * Barrido 0 -> 180 -> 0 en bucle mientras g_servoSweepEnabled.
 * No usa delay(); compatible con WiFi/TCP/LEER.
 */
void updateServoSweepAndReport() {
  if (!g_servoSweepEnabled) {
    return;
  }
  if (moving) {
    return;
  }
  if (g_postTurnSettling) {
    return;
  }
  unsigned long now = millis();
  if (now - g_lastServoSweepMs < (unsigned long)SERVO_SWEEP_STEP_MS) {
    return;
  }
  g_lastServoSweepMs = now;

  g_sweepAngle += g_sweepDir;
  if (g_sweepAngle >= 180) {
    g_sweepAngle = 180;
    g_sweepDir = -1;
  } else if (g_sweepAngle <= 0) {
    g_sweepAngle = 0;
    g_sweepDir = 1;
  }
  servoWriteImmediate(g_sweepAngle);

  if (now - g_lastServoAngReportMs >= (unsigned long)SERVO_ANGLE_REPORT_MIN_MS) {
    g_lastServoAngReportMs = now;
    emitServoAngleLine();
  }
}

/** Fuerza el servo al frente y mide. Usar solo si necesitas reorientar (p. ej. tras SERVO:x). */
long readUltrasonicForward() {
  servoSetAngle(SERVO_ANGLE_FORWARD);
  return readUltrasonicRaw();
}

/**
 * Solo medicion de distancia (obstaculo). No alimenta classifyCell ni decisiones de color.
 * Sin mover el servo en LEER: menos vibracion en el conjunto del TCS34725 (mira al suelo).
 * Angulo actual: ultimo SERVO: o setup (SERVO_ANGLE_FORWARD).
 */
long readUltrasonicRaw() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  long t = pulseIn(ECHO, HIGH, 30000);
  if (t <= 0) return 999;
  return (t * 0.034) / 2; // cm
}

/**
 * PWM en ENA/ENB como en PruebaMotores_carrito.ino.
 * ESP32Servo.attach() puede dejar los enables del L298N sin PWM válido; se llama ANTES y DESPUÉS del attach.
 */
static void initL298nEnablePwm() {
  pinMode(ENA, OUTPUT);
  pinMode(ENB, OUTPUT);
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
  ledcAttach(ENA, 5000, 8);
  ledcAttach(ENB, 4900, 8);
#else
  constexpr uint8_t kChA = 14;
  constexpr uint8_t kChB = 15;
  ledcSetup(kChA, 5000, 8);
  ledcAttachPin(ENA, kChA);
  ledcSetup(kChB, 5000, 8);
  ledcAttachPin(ENB, kChB);
#endif
  analogWrite(ENA, 0);
  analogWrite(ENB, 0);
}

static void buzzerPasivoInit() {
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
  ledcAttach(BUZZER_PIN, BUZZER_FREQ_HZ, 8);
#else
  constexpr uint8_t kBuzzCh = 12;
  ledcSetup(kBuzzCh, BUZZER_FREQ_HZ, 8);
  ledcAttachPin(BUZZER_PIN, kBuzzCh);
#endif
  analogWrite(BUZZER_PIN, 0);
}

/** Ton continuo pasivo cuando ROJO; silencio en cualquier otro CELDA. */
static void buzzerPasivoActualizarPorCelda(const String& celdaStr) {
  if (celdaStr == "ROJO") {
    analogWrite(BUZZER_PIN, 160);  // volumen medio (0–255, 8 bits)
  } else {
    analogWrite(BUZZER_PIN, 0);
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);  // tiempo para abrir Monitor serie; baudios 115200
  Serial.println();
  Serial.println(F("========== Firmware Robot Laberinto IA 2026 =========="));
  Serial.println(F("Si no ves esta linea, sube ESTE .ino (FirmwareRobotLaberinto) al ESP32."));
  Serial.println();

  pinMode(MOTOR_A_IN1, OUTPUT);
  pinMode(MOTOR_A_IN2, OUTPUT);
  pinMode(MOTOR_B_IN3, OUTPUT);
  pinMode(MOTOR_B_IN4, OUTPUT);
  initL298nEnablePwm();
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  buzzerPasivoInit();
  Serial.println(F("Buzzer ROJO en GPIO33 (solo suena con CELDA:ROJO)."));
#if MOTOR_ACTIVITY_LED_PIN >= 0
  pinMode(MOTOR_ACTIVITY_LED_PIN, OUTPUT);
  digitalWrite(MOTOR_ACTIVITY_LED_PIN, LOW);
  Serial.print(F("LED actividad motores en GPIO"));
  Serial.print(MOTOR_ACTIVITY_LED_PIN);
  Serial.println(F(" (HIGH durante pulso MOVER/MOTOR)"));
#else
  Serial.println(F("LED actividad motores desactivado (MOTOR_ACTIVITY_LED_PIN < 0)"));
#endif

  // Servo: pulso típico SG90; si tu servo no llega a 0/180, ajusta 500-2500 en attach()
  servoUltrasonic.attach(SERVO_PIN, 500, 2400);
  initL298nEnablePwm();
  g_sweepAngle = 0;
  g_sweepDir = 1;
  servoWriteImmediate(g_sweepAngle);
  currentServoAngle = g_sweepAngle;
  Serial.println(F("Servo: barrido 0-180 activo por defecto (SERVO_SWEEP:0 para parar, SERVO_SWEEP:1 activar)."));
  Serial.println(F("Monitor angulo: SERVO_ANG cada 3 s (mismo ritmo que el bloque de sensores USB)."));

  WiFi.mode(WIFI_STA);
  Serial.print(F("Conectando WiFi, red: "));
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print(F("Esperando IP (max 60 s)"));
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < WIFI_CONNECT_TIMEOUT_MS) {
    delay(500);
    Serial.print(F("."));
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(F("--- WiFi OK ---"));
    Serial.print(F("IP del robot (usala en cliente Python): "));
    Serial.println(WiFi.localIP());
    Serial.print(F("Servidor TCP escuchando en puerto 8888"));
    Serial.println();
    server.begin();
    tcpServerStarted = true;
  } else {
    Serial.println(F("--- WiFi NO conectado ---"));
    Serial.println(F("Revisa secrets.h (SSID y contrasena) y que la red sea 2,4 GHz si el ESP32 no tiene 5 GHz."));
    Serial.print(F("Estado WiFi.status(): "));
    Serial.println((int)WiFi.status());
    Serial.println(F("Se reintentara en el loop. Sin WiFi no habra IP ni puerto 8888."));
  }

#if USE_COLOR_SENSOR
  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(100000);
  delay(80);
  for (int attempt = 0; attempt < 3 && !hasColorSensor; attempt++) {
    if (attempt > 0) {
      delay(300);
      Serial.println(F("Reintentando TCS34725..."));
    }
    if (tryBeginTcs34725()) {
      hasColorSensor = true;
    }
  }
  if (hasColorSensor) {
    Serial.println(F("Sensor color TCS34725 OK (I2C)"));
  } else {
    Serial.println(F("Sensor color no detectado al inicio; se reintentara al LEER."));
  }
#else
  Serial.println("Modo sin sensor color (Wokwi/simulacion)");
#endif
  lastSerialSensorMs = millis() - SERIAL_SENSOR_INTERVAL_MS;
  Serial.println(F("Monitor serie: cada 3 s. Ultrasonido y color totalmente independientes."));
#if USE_COLOR_SENSOR
  printUmbralesColorSerial();
#endif
}

void printSensorSnapshotToSerial(long dist, const String& celdaStr, uint16_t r, uint16_t g, uint16_t b,
                                 uint16_t c, bool colorHardwareOk, bool colorEvaluado, bool esAutomatico) {
  Serial.println();
  if (esAutomatico) {
    Serial.print(F("(reporte automatico cada "));
    Serial.print(SERIAL_SENSOR_INTERVAL_MS / 1000);
    Serial.println(F(" s)"));
  }
  Serial.println(F("========== Sensores (lectura actual) =========="));
  Serial.println(F("--- Ultrasonido (independiente) ---"));
  Serial.print(F("Distancia (cm): "));
  Serial.println((int)dist);
  if (dist == 999) {
    Serial.println(F("Estado: sin eco (revisa cable TRIG/ECHO, alimentacion, obstaculo en rango)"));
  } else if (distanciaUltrasonidoUtil(dist)) {
    Serial.println(F("Estado: medicion util (>= 5 cm; a 10 cm ya cuenta como lectura valida)"));
  } else {
    Serial.println(F("Estado: lectura < 5 cm (muy cerca; el ultra puede ser poco fiable)"));
  }
#if USE_COLOR_SENSOR
  Serial.println(F("--- Color TCS34725 (independiente) ---"));
  if (!colorHardwareOk) {
    Serial.println(F("Sensor no conectado (SENSOR:OFF) — revisa I2C 21/22, 3V3, GND"));
  } else if (colorEvaluado) {
    Serial.print(F("RGBC  R="));
    Serial.print(r);
    Serial.print(F("  G="));
    Serial.print(g);
    Serial.print(F("  B="));
    Serial.print(b);
    Serial.print(F("  C="));
    Serial.println(c);
    printRgbPctSerial(r, g, b);
    Serial.print(F(">>> Color detectado: "));
    Serial.print(nombreColorHumano(celdaStr));
    Serial.print(F("   [CELDA:"));
    Serial.print(celdaStr);
    Serial.print(F("]"));
    if (lastHueGrados >= 0.0f) {
      Serial.print(F("   H="));
      Serial.print(lastHueGrados, 1);
      Serial.print(F("deg  S="));
      Serial.print(lastSaturacion, 2);
    }
    Serial.print(F("   regla="));
    Serial.println(lastColorRegla);
    printUmbralesColorSerialCompact();
  } else {
    Serial.println(F("Color: no evaluado."));
  }
#else
  Serial.println(F("--- Color TCS34725 ---"));
  Serial.print(F("Modo sin sensor color (Wokwi). Celda: "));
  Serial.println(celdaStr);
#endif
  Serial.println(F("================================================"));
}

/** Solo Monitor USB: misma logica que LEER pero sin TCP. */
void dumpSensorReadingsSerialOnly() {
  Serial.println(F("--- Wi-Fi ---"));
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print(F("IP robot: "));
    Serial.println(WiFi.localIP());
  } else {
    Serial.println(F("IP robot: (sin conexion WiFi — sin IP todavia)"));
  }
  String celdaStr = "UNKNOWN";
  uint16_t r = 0, g = 0, b = 0, c = 0;
  bool colorEvaluado = false;
#if USE_COLOR_SENSOR
  if (!hasColorSensor) {
    if (tryBeginTcs34725()) {
      hasColorSensor = true;
    }
  }
  if (hasColorSensor) {
    tcs.getRawData(&r, &g, &b, &c);
    celdaStr = classifyCell(r, g, b, c);
    colorEvaluado = true;
  }
#else
  celdaStr = readCellType();
#endif
  long dist = readUltrasonicRaw();
  buzzerPasivoActualizarPorCelda(celdaStr);
#if USE_COLOR_SENSOR
  printSensorSnapshotToSerial(dist, celdaStr, r, g, b, c, hasColorSensor, colorEvaluado, true);
#else
  printSensorSnapshotToSerial(dist, celdaStr, r, g, b, c, false, true, true);
#endif
}

void loop() {
  updateMotorActivityLed();
  updateServoSweepAndReport();

  if (millis() - lastSerialSensorMs >= SERIAL_SENSOR_INTERVAL_MS) {
    lastSerialSensorMs = millis();
    dumpSensorReadingsSerialOnly();
  }

  // Pulsos MOVER / MOTOR:* — ANTES del chequeo de cliente TCP.
  // Si el PC cierra el socket en cuanto envía el comando, antes no se ejecutaba este bloque
  // (return por !client.connected) y los motores no llegaban a girar como en PruebaMotores_carrito.
  if (moving) {
    refreshMoverPulseOutputs();
    if (millis() >= moveEndTime) {
      const uint8_t endedMover = g_moverPulseKind;
      stopMotors();
      moving = false;
      g_moverPulseKind = 0;
#if SERIAL_LOG_MOV
      Serial.println(F("[MOV] Fin pulso (MOVER) — motores OFF"));
#endif
      bool sendListoAhora = true;
      unsigned long settleMs = (unsigned long)POST_TURN_SETTLE_MS;
      if (settleMs > 2000UL) {
        settleMs = 2000UL;
      }
      if ((endedMover == 3 || endedMover == 4) && settleMs > 0UL) {
        g_postTurnSettling = true;
        g_postTurnSettleEnd = millis() + settleMs;
        sendListoAhora = false;
#if SERIAL_LOG_MOV
        Serial.print(F("[MOV] Post-giro ADELANTE "));
        Serial.print((unsigned long)settleMs);
        Serial.print(F(" ms PWM="));
        Serial.println((int)constrain(POST_TURN_SETTLE_PWM, 0, 255));
#endif
      }
      if (sendListoAhora) {
        if (client.connected()) {
#if SERIAL_LOG_MOV
          Serial.println(F("[MOV] Enviando LISTO + sensores por TCP"));
#endif
          sendSensorReadings();
          client.println("LISTO");
          client.flush();
          mirrorLastReadToSerialAfterTcp();
        }
#if SERIAL_LOG_MOV
        else {
          Serial.println(F("[MOV] Cliente TCP desconectado; LISTO no enviado (motores ya detenidos)"));
        }
#endif
      }
    }
    delay(20);
    return;
  }

  if (g_postTurnSettling) {
    {
      const int sp = constrain(POST_TURN_SETTLE_PWM, 0, 255);
      motorApplyA(true);
      motorApplyB(true);
      analogWrite(ENA, sp);
      analogWrite(ENB, sp);
    }
    if (millis() >= g_postTurnSettleEnd) {
      stopMotors();
      g_postTurnSettling = false;
#if SERIAL_LOG_MOV
      Serial.println(F("[MOV] Fin post-giro — LISTO"));
#endif
      if (client.connected()) {
        sendSensorReadings();
        client.println("LISTO");
        client.flush();
        mirrorLastReadToSerialAfterTcp();
      }
#if SERIAL_LOG_MOV
      else {
        Serial.println(F("[MOV] Cliente TCP desconectado; LISTO no enviado tras post-giro"));
      }
#endif
    }
    delay(20);
    return;
  }

  if (movingA || movingB) {
    if (movingA && millis() >= motorAEndTime) {
      stopMotorA();
      movingA = false;
#if SERIAL_LOG_MOV
      Serial.println(F("[MOV] Fin pulso motor A"));
#endif
    }
    if (movingB && millis() >= motorBEndTime) {
      stopMotorB();
      movingB = false;
#if SERIAL_LOG_MOV
      Serial.println(F("[MOV] Fin pulso motor B"));
#endif
    }
    if (!movingA && !movingB) {
#if SERIAL_LOG_MOV
      Serial.println(F("[MOV] Fin pulso (MOTOR)"));
#endif
      if (client.connected()) {
        sendSensorReadings();
        client.println("LISTO");
        client.flush();
        mirrorLastReadToSerialAfterTcp();
      }
#if SERIAL_LOG_MOV
      else {
        Serial.println(F("[MOV] Cliente TCP desconectado; LISTO no enviado"));
      }
#endif
    }
    delay(20);
    return;
  }

  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastWifiReconnectAttempt >= WIFI_RECONNECT_INTERVAL_MS) {
      lastWifiReconnectAttempt = millis();
      Serial.println("WiFi desconectado; reconectando...");
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      tcpServerStarted = false;
    }
    delay(50);
    return;
  }

  if (!tcpServerStarted) {
    server.begin();
    tcpServerStarted = true;
    Serial.print("Servidor TCP puerto 8888, IP: ");
    Serial.println(WiFi.localIP());
  }

  if (!client.connected()) {
    client = server.available();
    if (client) Serial.println("Cliente conectado");
    delay(10);
    return;
  }

  if (client.available()) {
    String line = client.readStringUntil('\n');
    line.trim();
    if (line.length() > 0) {
      processCommand(line);
    }
  }
  delay(10);
}

/** Mapa de pines según este firmware + escaneo I2C (no detecta físicamente qué cable va a cada pin). */
void sendHardwareReport() {
  client.println(F("HW:VER:1"));
  client.println(F("HW:NOTE=Mapa declarado en firmware; I2CADDR=dispositivos que responden en el bus ahora."));
  client.println(String("PIN:") + String(MOTOR_A_IN1) + "=L298N MotorA IN1 (llanta A)");
  client.println(String("PIN:") + String(MOTOR_A_IN2) + "=L298N MotorA IN2 (llanta A)");
  client.println(String("PIN:") + String(MOTOR_B_IN3) + "=L298N MotorB IN3 (llanta B)");
  client.println(String("PIN:") + String(MOTOR_B_IN4) + "=L298N MotorB IN4 (llanta B)");
  client.println(String("PIN:") + String(ENA) + "=L298N ENA PWM MotorA (llanta A)");
  client.println(String("PIN:") + String(ENB) + "=L298N ENB PWM MotorB (llanta B)");
  client.println(String("PIN:") + String(TRIG) + "=HC-SR04 TRIG");
  client.println(String("PIN:") + String(ECHO) + "=HC-SR04 ECHO");
  client.println(String("PIN:") + String(SERVO_PIN) + "=Servo SG90 señal (ultrasonido)");
  client.println(String("PIN:") + String(BUZZER_PIN) + "=Buzzer pasivo PWM (alarma continua si CELDA=ROJO)");
  client.println(String("PIN:") + String(I2C_SDA) + "=I2C SDA (TCS34725 / bus)");
  client.println(String("PIN:") + String(I2C_SCL) + "=I2C SCL (TCS34725 / bus)");

  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(100000);
  delay(40);
  int encontrados = 0;
  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      char buf[20];
      snprintf(buf, sizeof(buf), "I2CADDR:0x%02X", (unsigned int)addr);
      client.println(buf);
      encontrados++;
    }
  }
  if (encontrados == 0) {
    client.println(F("I2CADDR:NINGUNO"));
  }
#if USE_COLOR_SENSOR
  client.println(String("HAS_COLOR:") + (hasColorSensor ? "1" : "0"));
#else
  client.println(F("HAS_COLOR:0"));
#endif
}

/** Si el comando termina en :NNN (ms) tras ADELANTE/ATRAS, devuelve base sin sufijo y ms en [50,60000]. */
static void splitMoveCmdPulse(const String& cmd, String& cmdBase, unsigned long& outMs) {
  cmdBase = cmd;
  outMs = MS_MOVE_PULSE_MS;
  if (!cmd.startsWith("MOVER:") && !cmd.startsWith("MOTOR:")) {
    return;
  }
  int li = cmd.lastIndexOf(':');
  if (li <= 0 || li >= (int)cmd.length() - 1) {
    return;
  }
  String tail = cmd.substring(li + 1);
  tail.trim();
  if (!tail.length() || tail.length() > 6) {
    return;
  }
  for (int i = 0; i < tail.length(); ++i) {
    char c = tail.charAt(i);
    if (c < '0' || c > '9') {
      return;
    }
  }
  long v = tail.toInt();
  if (v < 50 || v > 60000) {
    return;
  }
  String before = cmd.substring(0, li);
  if (before.endsWith("ADELANTE") || before.endsWith("ATRAS") || before.endsWith("IZQUIERDA") ||
      before.endsWith("DERECHA")) {
    outMs = (unsigned long)v;
    cmdBase = before;
  }
}

void processCommand(String cmd) {
  currentCommand = cmd;
  String cmdBase = cmd;
  unsigned long pulseMsForMove = MS_MOVE_PULSE_MS;
  splitMoveCmdPulse(cmd, cmdBase, pulseMsForMove);
#if SERIAL_LOG_MOV
  if (cmd.startsWith("MOVER:") || cmd.startsWith("MOTOR:") || cmd == "DETENER") {
    Serial.print(F("[TCP] "));
    Serial.println(cmd);
  }
#endif
  if (cmdBase == "MOVER:ADELANTE") {
    g_moverPulseKind = 1;
    moveForward();
    moving = true;
    moveEndTime = millis() + pulseMsForMove;
  } else if (cmdBase == "MOVER:ATRAS") {
    g_moverPulseKind = 2;
    moveBackward();
    moving = true;
    moveEndTime = millis() + pulseMsForMove;
  } else if (cmdBase == "MOVER:IZQUIERDA") {
    g_moverPulseKind = 3;
    turnLeft();
    moving = true;
    moveEndTime = millis() + pulseMsForMove;
  } else if (cmdBase == "MOVER:DERECHA") {
    g_moverPulseKind = 4;
    turnRight();
    moving = true;
    moveEndTime = millis() + pulseMsForMove;
  } else if (cmdBase == "MOTOR:A:ADELANTE") {
    motorAForward();
    movingA = true;
    motorAEndTime = millis() + pulseMsForMove;
  } else if (cmdBase == "MOTOR:A:ATRAS") {
    motorABackward();
    movingA = true;
    motorAEndTime = millis() + pulseMsForMove;
  } else if (cmdBase == "MOTOR:A:DETENER") {
    stopMotorA();
    movingA = false;
    client.println("LISTO");
  } else if (cmdBase == "MOTOR:B:ADELANTE") {
    motorBForward();
    movingB = true;
    motorBEndTime = millis() + pulseMsForMove;
  } else if (cmdBase == "MOTOR:B:ATRAS") {
    motorBBackward();
    movingB = true;
    motorBEndTime = millis() + pulseMsForMove;
  } else if (cmdBase == "MOTOR:B:DETENER") {
    stopMotorB();
    movingB = false;
    client.println("LISTO");
  } else if (cmd == "DETENER") {
    stopMotors();
    moving = false;
    g_moverPulseKind = 0;
    g_postTurnSettling = false;
    movingA = false;
    movingB = false;
    client.println("LISTO");
  } else if (cmd == "PING") {
    client.println("PONG");
  } else if (cmd == "LEER") {
    // Sensores sin mover (como el primer paso del simulador: celda actual + distancia al frente)
    sendSensorReadings();
    client.println("LISTO");
    client.flush();
    mirrorLastReadToSerialAfterTcp();
  } else if (cmd == "STATUS") {
    client.println("IP:" + WiFi.localIP().toString());
    client.println("RSSI:" + String(WiFi.RSSI()));
    client.println("LISTO");
  } else if (cmd == "HARDWARE") {
    sendHardwareReport();
    client.println("LISTO");
  } else if (cmd == "SERVO_SWEEP:1" || cmd == "SERVO_SWEEP:ON") {
    g_servoSweepEnabled = true;
    g_sweepAngle = constrain(currentServoAngle, 0, 180);
    g_sweepDir = (g_sweepAngle >= 90) ? -1 : 1;
    g_lastServoSweepMs = 0;
    client.println(F("OK:SERVO_SWEEP on"));
    client.println("LISTO");
  } else if (cmd == "SERVO_SWEEP:0" || cmd == "SERVO_SWEEP:OFF") {
    g_servoSweepEnabled = false;
    client.println(F("OK:SERVO_SWEEP off"));
    client.println("LISTO");
  } else if (cmd.startsWith("SERVO:")) {
    // Posicion fija: desactiva barrido hasta que envies SERVO_SWEEP:1
    g_servoSweepEnabled = false;
    int a = cmd.substring(6).toInt();
    servoSetAngle(a);
    g_sweepAngle = currentServoAngle;
    emitServoAngleLine();
    client.println("LISTO");
  } else if (cmd.startsWith("TCS_CAL:")) {
#if USE_COLOR_SENSOR
    String e = applyTcsCalPayload(cmd.substring(8));
    if (e.length()) {
      client.println(String("ERR:TCS_CAL ") + e);
    } else {
      emitThreshTcp();
      client.println(F("OK:TCS_CAL"));
    }
#else
    client.println(F("ERR:NO_COLOR_SENSOR"));
#endif
    client.println(F("LISTO"));
  }
}

/** forward = sentido «adelante» del protocolo (MOVER:ADELANTE / MOTOR:*:ADELANTE). */
static void motorApplyA(bool forward) {
  const bool f = forward ^ (MOTOR_A_INVERT != 0);
  digitalWrite(MOTOR_A_IN1, f ? HIGH : LOW);
  digitalWrite(MOTOR_A_IN2, f ? LOW : HIGH);
}

static void motorApplyB(bool forward) {
  const bool f = forward ^ (MOTOR_B_INVERT != 0);
  digitalWrite(MOTOR_B_IN3, f ? HIGH : LOW);
  digitalWrite(MOTOR_B_IN4, f ? LOW : HIGH);
}

void motorAForward() {
  motorApplyA(true);
  analogWrite(ENA, PWM_SPEED);
}

void motorABackward() {
  motorApplyA(false);
  analogWrite(ENA, PWM_SPEED);
}

void motorBForward() {
  motorApplyB(true);
  analogWrite(ENB, PWM_SPEED);
}

void motorBBackward() {
  motorApplyB(false);
  analogWrite(ENB, PWM_SPEED);
}

void moveForward() {
  motorAForward();
  motorBForward();
}

void moveBackward() {
  motorABackward();
  motorBBackward();
}

void turnLeft() {
  motorABackward();
  motorBForward();
}

void turnRight() {
  motorAForward();
  motorBBackward();
}

static void refreshMoverPulseOutputs(void) {
  switch (g_moverPulseKind) {
    case 1:
      moveForward();
      break;
    case 2:
      moveBackward();
      break;
    case 3:
      turnLeft();
      break;
    case 4:
      turnRight();
      break;
    default:
      break;
  }
}

void stopMotors() {
  digitalWrite(MOTOR_A_IN1, LOW);
  digitalWrite(MOTOR_A_IN2, LOW);
  digitalWrite(MOTOR_B_IN3, LOW);
  digitalWrite(MOTOR_B_IN4, LOW);
  analogWrite(ENA, 0);
  analogWrite(ENB, 0);
}

void stopMotorA() {
  digitalWrite(MOTOR_A_IN1, LOW);
  digitalWrite(MOTOR_A_IN2, LOW);
  analogWrite(ENA, 0);
}

void stopMotorB() {
  digitalWrite(MOTOR_B_IN3, LOW);
  digitalWrite(MOTOR_B_IN4, LOW);
  analogWrite(ENB, 0);
}

// ----- Color (TCS34725): proporciones pr,pg,pb — no usa distancia ni HC-SR04 -----
#if USE_COLOR_SENSOR

String classifyCell(uint16_t r, uint16_t g, uint16_t b, uint16_t c) {
  lastColorRegla = "?";
  lastHueGrados = -1.0f;
  lastSaturacion = 0.0f;

  if (c < g_tcsClearMin) {
    lastColorRegla = "C-baja";
    return "UNKNOWN";
  }

  float suma = (float)r + (float)g + (float)b;
  if (suma <= 0.0f) {
    lastColorRegla = "suma0";
    return "UNKNOWN";
  }

  float pr = (float)r / suma;
  float pg = (float)g / suma;
  float pb = (float)b / suma;

  lastSaturacion = fmaxf(pr, fmaxf(pg, pb)) - fminf(pr, fminf(pg, pb));

  if (pb > g_tcsPbAzul && pb > pr && pb > pg) {
    lastColorRegla = "prop-AZUL";
    return "AZUL";
  }

  if (pg > g_tcsPgVerde && pg > pr && pg > pb) {
    lastColorRegla = "prop-VERDE";
    return "VERDE";
  }

  if (pr > g_tcsPrRojo && pr > pg && pr > pb) {
    lastColorRegla = "prop-ROJO";
    return "ROJO";
  }

  {
    float mx = fmaxf(pr, fmaxf(pg, pb));
    float mid = pr + pg + pb - mx - fminf(pr, fminf(pg, pb));
    if (mx - mid >= g_tcsWeakGap && mx >= g_tcsWeakMinDom) {
      if (pr > pg && pr > pb) {
        lastColorRegla = "weak-ROJO";
        return "ROJO";
      }
      if (pg > pr && pg > pb) {
        lastColorRegla = "weak-VERDE";
        return "VERDE";
      }
      if (pb > pr && pb > pg) {
        lastColorRegla = "weak-AZUL";
        return "AZUL";
      }
    }
  }

  /** Solo tres colores: desempate por lectura RAW (evita UNKNOWN en suelos tenues salvo RGB simetrico). */
  if ((uint32_t)r + (uint32_t)g + (uint32_t)b == 0) {
    lastColorRegla = "raw0";
    return "UNKNOWN";
  }
  if (r == g && g == b) {
    lastColorRegla = "raw-simetrico";
    return "UNKNOWN";
  }
  if (r >= g && r >= b) {
    lastColorRegla = "fallback-RAW-R";
    return "ROJO";
  }
  if (g >= r && g >= b) {
    lastColorRegla = "fallback-RAW-G";
    return "VERDE";
  }
  lastColorRegla = "fallback-RAW-B";
  return "AZUL";
}
#else
String classifyCell(uint16_t r, uint16_t g, uint16_t b, uint16_t c) {
  (void)r;
  (void)g;
  (void)b;
  (void)c;
  return "UNKNOWN";
}
#endif

String readCellType() {
#if USE_COLOR_SENSOR
  if (hasColorSensor) {
    uint16_t r, g, b, c;
    tcs.getRawData(&r, &g, &b, &c);
    return classifyCell(r, g, b, c);
  }
#endif
  return "UNKNOWN";
}

void sendSensorReadings() {
  String celdaStr = "UNKNOWN";
  uint16_t r = 0, g = 0, b = 0, c = 0;
  bool colorEvaluado = false;

  // Contrato: CELDA solo desde TCS34725; DIST solo desde HC-SR04. Sin condicion cruzada.
  // Orden: color (I2C) primero, luego readUltrasonicRaw() — motivo tecnico, no logico.
#if USE_COLOR_SENSOR
  if (!hasColorSensor) {
    if (tryBeginTcs34725()) {
      hasColorSensor = true;
    }
  }
  if (hasColorSensor) {
    tcs.getRawData(&r, &g, &b, &c);
    celdaStr = classifyCell(r, g, b, c);
    colorEvaluado = true;
  }
#endif

  long dist = readUltrasonicRaw();

  client.println("DIST:" + String((int)dist));

#if USE_COLOR_SENSOR
  emitThreshTcp();
  if (hasColorSensor) {
    client.println("RGB:" + String(r) + "," + String(g) + "," + String(b) + "," + String(c));
    emitRgbPctTcp(r, g, b);
    client.println("SENSOR:OK");
    client.println("CELDA:" + celdaStr);
  } else {
    client.println("RGB:0,0,0,0");
    emitRgbPctTcp(0, 0, 0);
    client.println("SENSOR:OFF");
    client.println("CELDA:UNKNOWN");
  }
#else
  celdaStr = readCellType();
  client.println("CELDA:" + celdaStr);
#endif

  g_lastReadDist = dist;
  g_lastReadCelda = celdaStr;
  g_lastR = r;
  g_lastG = g;
  g_lastB = b;
  g_lastC = c;
  g_lastColorEval = colorEvaluado;
  buzzerPasivoActualizarPorCelda(celdaStr);
}
