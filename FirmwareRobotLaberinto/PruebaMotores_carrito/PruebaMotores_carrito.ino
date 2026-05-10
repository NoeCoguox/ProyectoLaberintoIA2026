/*
 * Prueba básica L298N + ESP32 — solo girar llantas (sin WiFi ni sensores).
 *
 * Mismos pines que FirmwareRobotLaberinto.ino:
 *   Motor A: IN1=12, IN2=13, ENA=25 (PWM)
 *   Motor B: IN3=14, IN4=27, ENB=26 (PWM)
 *
 * IMPORTANTE (ESP32 Arduino core 3.x):
 *   Hay que configurar LEDC en ENA/ENB igual que el firmware principal;
 *   si no, analogWrite a veces NO mueve los motores aunque el código "esté bien".
 *
 * L298N:
 *   - Quitá jumpers que lleven ENA/ENB fijos a 5V si vas a usar GPIO 25/26 como PWM.
 *   - VMOT del puente = batería de motores; GND puente = GND ESP32 (común).
 *
 * Cómo usar:
 *   1. Abrí este .ino en Arduino IDE.
 *   2. Placa: ESP32 DevKit 38 pines (v1.3) — serigrafia IO12 = GPIO12, etc. Monitor 115200 baud.
 *   3. Subí el sketch. La secuencia del loop() prueba A, B, ambas, atrás.
 */

#define MOTOR_A_IN1 12
#define MOTOR_A_IN2 13
#define MOTOR_B_IN3 14
#define MOTOR_B_IN4 27
#define ENA 25
#define ENB 26

const int PWM_PRUEBA = 200;
const unsigned long MS_GIRO = 2500;
const unsigned long MS_PAUSA = 800;

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

void motorA_parar() {
  digitalWrite(MOTOR_A_IN1, LOW);
  digitalWrite(MOTOR_A_IN2, LOW);
  analogWrite(ENA, 0);
}

void motorB_parar() {
  digitalWrite(MOTOR_B_IN3, LOW);
  digitalWrite(MOTOR_B_IN4, LOW);
  analogWrite(ENB, 0);
}

void todos_parar() {
  motorA_parar();
  motorB_parar();
}

void motorA_adelante() {
  digitalWrite(MOTOR_A_IN1, HIGH);
  digitalWrite(MOTOR_A_IN2, LOW);
  analogWrite(ENA, PWM_PRUEBA);
}

void motorB_adelante() {
  digitalWrite(MOTOR_B_IN3, HIGH);
  digitalWrite(MOTOR_B_IN4, LOW);
  analogWrite(ENB, PWM_PRUEBA);
}

void motorA_atras() {
  digitalWrite(MOTOR_A_IN1, LOW);
  digitalWrite(MOTOR_A_IN2, HIGH);
  analogWrite(ENA, PWM_PRUEBA);
}

void motorB_atras() {
  digitalWrite(MOTOR_B_IN3, LOW);
  digitalWrite(MOTOR_B_IN4, HIGH);
  analogWrite(ENB, PWM_PRUEBA);
}

void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(MOTOR_A_IN1, OUTPUT);
  pinMode(MOTOR_A_IN2, OUTPUT);
  pinMode(MOTOR_B_IN3, OUTPUT);
  pinMode(MOTOR_B_IN4, OUTPUT);
  initL298nEnablePwm();

  todos_parar();

  Serial.println();
  Serial.println(F("=== PruebaMotores_carrito (PWM inicializado como firmware) ==="));
  Serial.println(F("Secuencia automática en loop."));
}

void loop() {
  Serial.println(F("[1] Solo llanta A adelante"));
  motorA_adelante();
  delay(MS_GIRO);
  todos_parar();
  delay(MS_PAUSA);

  Serial.println(F("[2] Solo llanta B adelante"));
  motorB_adelante();
  delay(MS_GIRO);
  todos_parar();
  delay(MS_PAUSA);

  Serial.println(F("[3] Ambas adelante"));
  motorA_adelante();
  motorB_adelante();
  delay(MS_GIRO);
  todos_parar();
  delay(MS_PAUSA);

  Serial.println(F("[4] Ambas atras"));
  motorA_atras();
  motorB_atras();
  delay(MS_GIRO);
  todos_parar();
  delay(MS_PAUSA);

  Serial.println(F("--- vuelta al inicio ---"));
}
