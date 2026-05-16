/*
 * Calibración / validación de llantas — L298N + ESP32 (sin WiFi).
 * Uso: Monitor serie del Arduino IDE (115200 baud, una tecla + Enter).
 *
 * Pines = FirmwareRobotLaberinto.ino:
 *   A: IN1=12, IN2=13, ENA=25  |  B: IN3=14, IN4=27, ENB=26
 *   Encoders FC-03: llanta A DO -> GPIO34, llanta B DO -> GPIO35 (VCC a 3V3)
 *
 * Si 5/6 giran en vez de recto: probá MOTOR_A_INVERT o MOTOR_B_INVERT = 1 y subí de nuevo.
 * Si los pulsos de A/B salen invertidos: ENCODER_SWAP_AB = 1
 */

#include <cstring>

// ========== Encoders (mismos pines que FirmwareRobotLaberinto.ino) ==========
#ifndef ENCODER_WHEEL_A_DO_PIN
#define ENCODER_WHEEL_A_DO_PIN 34
#endif
#ifndef ENCODER_WHEEL_B_DO_PIN
#define ENCODER_WHEEL_B_DO_PIN 35
#endif
#ifndef ENCODER_SWAP_AB
#define ENCODER_SWAP_AB 0
#endif

volatile uint32_t g_encRawA = 0;
volatile uint32_t g_encRawB = 0;

static void IRAM_ATTR encIsrA() {
  g_encRawA++;
}

static void IRAM_ATTR encIsrB() {
  g_encRawB++;
}

static void encoderInit() {
  pinMode(ENCODER_WHEEL_A_DO_PIN, INPUT);
  pinMode(ENCODER_WHEEL_B_DO_PIN, INPUT);
  attachInterrupt(digitalPinToInterrupt(ENCODER_WHEEL_A_DO_PIN), encIsrA, CHANGE);
  attachInterrupt(digitalPinToInterrupt(ENCODER_WHEEL_B_DO_PIN), encIsrB, CHANGE);
}

static void encoderReset() {
  noInterrupts();
  g_encRawA = 0;
  g_encRawB = 0;
  interrupts();
}

/** Cuentas por llanta lógica (A = motor L298N canal A). */
static void encoderGetLogical(uint32_t& countA, uint32_t& countB) {
  uint32_t ra;
  uint32_t rb;
  noInterrupts();
  ra = g_encRawA;
  rb = g_encRawB;
  interrupts();
#if ENCODER_SWAP_AB
  countA = rb;
  countB = ra;
#else
  countA = ra;
  countB = rb;
#endif
}

static void encoderPrintLine(const __FlashStringHelper* prefix) {
  uint32_t ra;
  uint32_t rb;
  uint32_t la;
  uint32_t lb;
  noInterrupts();
  ra = g_encRawA;
  rb = g_encRawB;
  interrupts();
  encoderGetLogical(la, lb);
  Serial.print(prefix);
  Serial.print(F(" GPIO"));
  Serial.print(ENCODER_WHEEL_A_DO_PIN);
  Serial.print(F("="));
  Serial.print(ra);
  Serial.print(F(" GPIO"));
  Serial.print(ENCODER_WHEEL_B_DO_PIN);
  Serial.print(F("="));
  Serial.print(rb);
  Serial.print(F("  |  llanta A="));
  Serial.print(la);
  Serial.print(F("  llanta B="));
  Serial.print(lb);
  Serial.print(F("  diff="));
  Serial.println((int32_t)la - (int32_t)lb);
}

#define MOTOR_A_IN1 12
#define MOTOR_A_IN2 13
/**
 * Si el comando 3 (B adelante) no mueve y el 4 (B atrás) sí: probá poner esto en 1.
 * Corrige cuando el cable del IN3 del L298N va al GPIO27 del ESP y el IN4 al GPIO14.
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
#define ENA 25
#define ENB 26

#ifndef MOTOR_A_INVERT
#define MOTOR_A_INVERT 0
#endif
#ifndef MOTOR_B_INVERT
#define MOTOR_B_INVERT 0
#endif

const int PWM_PRUEBA = 200;
const unsigned long MS_PULSO = 1800;
const unsigned long MS_COOLDOWN = 400;

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

static void pararTodo() {
  digitalWrite(MOTOR_A_IN1, LOW);
  digitalWrite(MOTOR_A_IN2, LOW);
  digitalWrite(MOTOR_B_IN3, LOW);
  digitalWrite(MOTOR_B_IN4, LOW);
  analogWrite(ENA, 0);
  analogWrite(ENB, 0);
}

static void motorA_run(bool adelante) {
  motorApplyA(adelante);
  analogWrite(ENA, PWM_PRUEBA);
}

static void motorB_run(bool adelante) {
  motorApplyB(adelante);
  analogWrite(ENB, PWM_PRUEBA);
}

static void imprimirAyuda() {
  Serial.println();
  Serial.println(F("######## MONITOR SERIE (Arduino IDE) ########"));
  Serial.println(F(" - Abajo: velocidad 115200 baud."));
  Serial.println(F(" - Fin de linea: 'Nueva linea' o 'Ambos NL y CR'."));
  Serial.println(F(" - Escribi UNA letra o numero en el cuadro de texto y pulsa ENTER."));
  Serial.println(F("   Ejemplo: 5 + Enter = ambas adelante ~1,8 s."));
  Serial.println(F("#############################################"));
  Serial.println();
  Serial.println(F("=== Comandos (una tecla + Enter) ==="));
  Serial.println(F(" 1 = A adelante   | 2 = A atras"));
  Serial.println(F(" 3 = B adelante   | 4 = B atras"));
  Serial.println(F(" 5 = ambas adelante | 6 = ambas atras"));
  Serial.println(F(" 7 = giro izq     | 8 = giro der"));
  Serial.println(F(" 0 = parar ya     | a = secuencia auto | h = este menu"));
  Serial.println(F("--- Encoders FC-03 (GPIO34/35, VCC 3V3) ---"));
  Serial.println(F(" e = leer contadores | r = reset contadores"));
  Serial.println(F(" 9 = escucha 12 s (gira ruedas a mano, sin motor)"));
  Serial.println(F(" Tras 1-8/5/6/7/8: al fin del pulso imprime pulsos A/B"));
  Serial.println(F("------------------------------------"));
  Serial.print(F(" ENCODER: A=GPIO"));
  Serial.print(ENCODER_WHEEL_A_DO_PIN);
  Serial.print(F(" B=GPIO"));
  Serial.print(ENCODER_WHEEL_B_DO_PIN);
  Serial.print(F("  ENCODER_SWAP_AB="));
  Serial.println(ENCODER_SWAP_AB);
  Serial.println(F("------------------------------------"));
  Serial.print(F(" MOTOR_A_INVERT="));
  Serial.print(MOTOR_A_INVERT);
  Serial.print(F("   MOTOR_B_INVERT="));
  Serial.print(MOTOR_B_INVERT);
  Serial.print(F("   MOTOR_B_IN3_IN4_GPIO_SWAPPED="));
  Serial.println(MOTOR_B_IN3_IN4_GPIO_SWAPPED);
  Serial.println(F(" Si 4 funciona y 3 no: pone MOTOR_B_IN3_IN4_GPIO_SWAPPED=1 arriba y subi de nuevo."));
  Serial.println(F("===================================="));
  Serial.println(F("> Listo. Escribi comando y Enter."));
}

enum class Estado : uint8_t { Idle, Corriendo, Cooldown, EncMonitor };
static Estado g_estado = Estado::Idle;
static unsigned long g_hastaMs = 0;
static unsigned long g_encLastPrintMs = 0;
static char g_ultimaPrueba[48] = "";
static String g_lineBuf;

static const unsigned long MS_ENC_MONITOR = 12000;
static const unsigned long MS_ENC_PRINT_INTERVAL = 400;

static void arrancarPrueba(const char* nombre, void (*aplicar)(void)) {
  if (g_estado != Estado::Idle) {
    Serial.println(F("(Espera fin de pulso o enfriamiento.)"));
    return;
  }
  strncpy(g_ultimaPrueba, nombre, sizeof(g_ultimaPrueba) - 1);
  g_ultimaPrueba[sizeof(g_ultimaPrueba) - 1] = '\0';
  encoderReset();
  g_encLastPrintMs = millis();
  Serial.print(F(">>> "));
  Serial.print(nombre);
  Serial.println(F(" ..."));
  aplicar();
  g_estado = Estado::Corriendo;
  g_hastaMs = millis() + MS_PULSO;
}

static void aplicar_A_adelante() {
  motorA_run(true);
}
static void aplicar_A_atras() {
  motorA_run(false);
}
static void aplicar_B_adelante() {
  motorB_run(true);
}
static void aplicar_B_atras() {
  motorB_run(false);
}
static void aplicar_ambas_adelante() {
  motorA_run(true);
  motorB_run(true);
}
static void aplicar_ambas_atras() {
  motorA_run(false);
  motorB_run(false);
}
static void aplicar_giro_izq() {
  motorA_run(false);
  motorB_run(true);
}
static void aplicar_giro_der() {
  motorA_run(true);
  motorB_run(false);
}

static void iniciarMonitorEncoder() {
  if (g_estado != Estado::Idle) {
    Serial.println(F("(Espera fin de pulso o monitor encoder.)"));
    return;
  }
  encoderReset();
  g_estado = Estado::EncMonitor;
  g_hastaMs = millis() + MS_ENC_MONITOR;
  g_encLastPrintMs = 0;
  Serial.println(F(">>> Monitor encoder 12 s — gira cada rueda a mano (sin motor)."));
  encoderPrintLine(F("  [inicio]"));
}

static void tickEstado() {
  const unsigned long ahora = millis();
  if (g_estado == Estado::Corriendo) {
    if (ahora - g_encLastPrintMs >= MS_ENC_PRINT_INTERVAL) {
      g_encLastPrintMs = ahora;
      encoderPrintLine(F("  [vivo]"));
    }
    if (ahora >= g_hastaMs) {
      pararTodo();
      Serial.print(F("--- Fin pulso: "));
      Serial.print(g_ultimaPrueba);
      Serial.println(F(" (OFF)"));
      encoderPrintLine(F("  [fin pulso]"));
      g_estado = Estado::Cooldown;
      g_hastaMs = ahora + MS_COOLDOWN;
    }
  } else if (g_estado == Estado::Cooldown) {
    if (ahora >= g_hastaMs) {
      g_estado = Estado::Idle;
      Serial.println(F("> Listo. Proximo comando + Enter."));
    }
  } else if (g_estado == Estado::EncMonitor) {
    if (ahora - g_encLastPrintMs >= MS_ENC_PRINT_INTERVAL) {
      g_encLastPrintMs = ahora;
      encoderPrintLine(F("  [monitor]"));
    }
    if (ahora >= g_hastaMs) {
      encoderPrintLine(F("  [fin monitor]"));
      g_estado = Estado::Idle;
      Serial.println(F("> Fin monitor encoder. h = menu."));
    }
  }
}

static char primerCaracterUtil(const String& s) {
  for (unsigned i = 0; i < s.length(); i++) {
    const char c = s.charAt(i);
    if (c != ' ' && c != '\t') {
      return c;
    }
  }
  return '\0';
}

static void procesarTecla(char c) {
  c = (char)tolower((unsigned char)c);
  switch (c) {
    case 'h':
      imprimirAyuda();
      break;
    case '0':
      pararTodo();
      g_estado = Estado::Idle;
      Serial.println(F(">>> PARAR."));
      Serial.println(F("> Listo."));
      break;
    case '1':
      arrancarPrueba("A ADELANTE", aplicar_A_adelante);
      break;
    case '2':
      arrancarPrueba("A ATRAS", aplicar_A_atras);
      break;
    case '3':
      arrancarPrueba("B ADELANTE", aplicar_B_adelante);
      break;
    case '4':
      arrancarPrueba("B ATRAS", aplicar_B_atras);
      break;
    case '5':
      arrancarPrueba("AMBAS ADELANTE", aplicar_ambas_adelante);
      break;
    case '6':
      arrancarPrueba("AMBAS ATRAS", aplicar_ambas_atras);
      break;
    case '7':
      arrancarPrueba("GIRO IZQ", aplicar_giro_izq);
      break;
    case '8':
      arrancarPrueba("GIRO DER", aplicar_giro_der);
      break;
    case '9':
      iniciarMonitorEncoder();
      break;
    case 'e':
      encoderPrintLine(F(">>> ENC"));
      Serial.println(F("> Listo."));
      break;
    case 'r':
      encoderReset();
      Serial.println(F(">>> Contadores encoder en 0."));
      Serial.println(F("> Listo."));
      break;
    default:
      Serial.print(F("No reconocido: '"));
      Serial.print(c);
      Serial.println(F("'  (h + Enter = menu)"));
      break;
  }
}

static void procesarLineaCompleta(const String& lineaCruda) {
  String linea = lineaCruda;
  linea.trim();
  if (linea.length() == 0) {
    return;
  }
  Serial.print(F("> Recibido: ["));
  Serial.print(linea);
  Serial.println(F("]"));

  const char c0 = primerCaracterUtil(linea);
  if (c0 == '\0') {
    return;
  }

  if (c0 == 'a' || c0 == 'A') {
    if (g_estado != Estado::Idle) {
      Serial.println(F("(Espera a terminar el pulso antes de 'a'.)"));
      return;
    }
    const unsigned long t = 1600;
    auto pulsoConEncoder = [&](const char* nombre, void (*fn)(void)) {
      encoderReset();
      Serial.print(F("--- Auto: "));
      Serial.println(nombre);
      fn();
      delay(t);
      pararTodo();
      encoderPrintLine(F("  [auto]"));
      delay(600);
    };
    pulsoConEncoder("A adelante", aplicar_A_adelante);
    pulsoConEncoder("B adelante", aplicar_B_adelante);
    pulsoConEncoder("ambas adelante", aplicar_ambas_adelante);
    pulsoConEncoder("ambas atras", aplicar_ambas_atras);
    Serial.println(F("--- Fin secuencia (revisa: solo A debe subir en 1er pulso, solo B en 2do) ---"));
    Serial.println(F("> Listo."));
    return;
  }

  procesarTecla(c0);
}

void setup() {
  Serial.begin(115200);
  delay(800);
  while (Serial.available() > 0) {
    (void)Serial.read();
  }
  delay(1200);

  pinMode(MOTOR_A_IN1, OUTPUT);
  pinMode(MOTOR_A_IN2, OUTPUT);
  pinMode(MOTOR_B_IN3, OUTPUT);
  pinMode(MOTOR_B_IN4, OUTPUT);
  initL298nEnablePwm();
  pararTodo();
  encoderInit();
  encoderReset();

  Serial.println();
  Serial.println(F("======== CalibracionLlantas | ESP32 + L298N + encoders ========"));
  Serial.print(F(" FC-03: GPIO"));
  Serial.print(ENCODER_WHEEL_A_DO_PIN);
  Serial.print(F(" (llanta A)  GPIO"));
  Serial.print(ENCODER_WHEEL_B_DO_PIN);
  Serial.println(F(" (llanta B)  |  Monitor 115200 | tecla + Enter"));
  Serial.println(F("===================================================="));
  imprimirAyuda();
}

void loop() {
  tickEstado();

  while (Serial.available() > 0) {
    const int raw = Serial.read();
    if (raw < 0) {
      break;
    }
    const char ch = (char)raw;
    if (ch == '\n' || ch == '\r') {
      procesarLineaCompleta(g_lineBuf);
      g_lineBuf = "";
    } else if (g_lineBuf.length() < 40) {
      g_lineBuf += ch;
    }
  }
}
