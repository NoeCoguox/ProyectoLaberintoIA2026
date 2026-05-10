/*
 * Calibración / validación de llantas — L298N + ESP32 (sin WiFi).
 * Uso: Monitor serie del Arduino IDE (115200 baud, una tecla + Enter).
 *
 * Pines = FirmwareRobotLaberinto.ino:
 *   A: IN1=12, IN2=13, ENA=25  |  B: IN3=14, IN4=27, ENB=26
 *
 * Si 5/6 giran en vez de recto: probá MOTOR_A_INVERT o MOTOR_B_INVERT = 1 y subí de nuevo.
 */

#include <cstring>

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

enum class Estado : uint8_t { Idle, Corriendo, Cooldown };
static Estado g_estado = Estado::Idle;
static unsigned long g_hastaMs = 0;
static char g_ultimaPrueba[48] = "";
static String g_lineBuf;

static void arrancarPrueba(const char* nombre, void (*aplicar)(void)) {
  if (g_estado != Estado::Idle) {
    Serial.println(F("(Espera fin de pulso o enfriamiento.)"));
    return;
  }
  strncpy(g_ultimaPrueba, nombre, sizeof(g_ultimaPrueba) - 1);
  g_ultimaPrueba[sizeof(g_ultimaPrueba) - 1] = '\0';
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

static void tickEstado() {
  const unsigned long ahora = millis();
  if (g_estado == Estado::Corriendo) {
    if (ahora >= g_hastaMs) {
      pararTodo();
      Serial.print(F("--- Fin pulso: "));
      Serial.print(g_ultimaPrueba);
      Serial.println(F(" (OFF)"));
      g_estado = Estado::Cooldown;
      g_hastaMs = ahora + MS_COOLDOWN;
    }
  } else if (g_estado == Estado::Cooldown) {
    if (ahora >= g_hastaMs) {
      g_estado = Estado::Idle;
      Serial.println(F("> Listo. Proximo comando + Enter."));
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
    Serial.println(F("--- Auto: A adelante ---"));
    aplicar_A_adelante();
    delay(t);
    pararTodo();
    delay(600);
    Serial.println(F("--- Auto: B adelante ---"));
    aplicar_B_adelante();
    delay(t);
    pararTodo();
    delay(600);
    Serial.println(F("--- Auto: ambas adelante ---"));
    aplicar_ambas_adelante();
    delay(t);
    pararTodo();
    delay(600);
    Serial.println(F("--- Auto: ambas atras ---"));
    aplicar_ambas_atras();
    delay(t);
    pararTodo();
    Serial.println(F("--- Fin secuencia ---"));
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

  Serial.println();
  Serial.println(F("======== CalibracionLlantas | ESP32 + L298N ========"));
  Serial.println(F(" Monitor serie: 115200 baud | comandos: tecla + Enter"));
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
