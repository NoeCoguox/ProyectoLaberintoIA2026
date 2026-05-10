/*
 * PruebaMotores_Validacion.ino
 *
 * Sketch APARTE para validar SOLO motores + L298N con los mismos pines que el robot.
 * Incluye: PWM como FirmwareRobotLaberinto (ESP32 core 3.x) + menú por Monitor serie +
 * modo automático opcional con tecla 'A'.
 *
 * Pines (copiados del firmware proyecto); placa fisica ESP32 DevKit 38 pines v1.3 = mismos GPIO (IOxx).
 *   Motor A — IN1=12, IN2=13, ENA(PWM)=25
 *   Motor B — IN3=14, IN4=27, ENB(PWM)=26
 *
 * Checklist si NO giran:
 *   [ ] VMOT del L298N a batería (7.4V etc.), NO alimentar motores desde 3.3V del ESP32
 *   [ ] GND carcasa puente ↔ GND ESP32 (referencia común)
 *   [ ] Cables OUT1..OUT4 a bornes motores DC
 *   [ ] IN1..IN4 y ENA/ENB al ESP según este archivo
 *   [ ] Quitá jumpers en ENA/ENB si en tu placa están puenteados a 5V “siempre encendido”
 *       (para usar PWM desde GPIO 25 y 26)
 *   [ ] Batería con carga suficiente; el L298 pierde voltaje — si Ves < ~6V en motor, apenas arranca
 */

#define MOTOR_A_IN1 12
#define MOTOR_A_IN2 13
#define MOTOR_B_IN3 14
#define MOTOR_B_IN4 27
#define ENA 25
#define ENB 26

#ifndef PWM_SPEED
#define PWM_SPEED 220
#endif

static int g_pwm = PWM_SPEED;  /* ajustá con + / - en Monitor serie */

static bool g_autoRun = false;
static unsigned long g_nextAutoMs = 0;
static uint8_t g_autoStep = 0;

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

inline void todosParar() {
  digitalWrite(MOTOR_A_IN1, LOW);
  digitalWrite(MOTOR_A_IN2, LOW);
  digitalWrite(MOTOR_B_IN3, LOW);
  digitalWrite(MOTOR_B_IN4, LOW);
  analogWrite(ENA, 0);
  analogWrite(ENB, 0);
}

inline void soloAadelante() {
  digitalWrite(MOTOR_A_IN1, HIGH);
  digitalWrite(MOTOR_A_IN2, LOW);
  digitalWrite(MOTOR_B_IN3, LOW);
  digitalWrite(MOTOR_B_IN4, LOW);
  analogWrite(ENA, g_pwm);
  analogWrite(ENB, 0);
}

inline void soloBadelante() {
  digitalWrite(MOTOR_A_IN1, LOW);
  digitalWrite(MOTOR_A_IN2, LOW);
  digitalWrite(MOTOR_B_IN3, HIGH);
  digitalWrite(MOTOR_B_IN4, LOW);
  analogWrite(ENA, 0);
  analogWrite(ENB, g_pwm);
}

inline void ambasAdelante() {
  digitalWrite(MOTOR_A_IN1, HIGH);
  digitalWrite(MOTOR_A_IN2, LOW);
  digitalWrite(MOTOR_B_IN3, HIGH);
  digitalWrite(MOTOR_B_IN4, LOW);
  analogWrite(ENA, g_pwm);
  analogWrite(ENB, g_pwm);
}

inline void ambasAtras() {
  digitalWrite(MOTOR_A_IN1, LOW);
  digitalWrite(MOTOR_A_IN2, HIGH);
  digitalWrite(MOTOR_B_IN3, LOW);
  digitalWrite(MOTOR_B_IN4, HIGH);
  analogWrite(ENA, g_pwm);
  analogWrite(ENB, g_pwm);
}

/** Rampa 0→255 en ~1 s sobre ambos enables con IN en “adelante” (prueba fuente de poder) */
void pruebaRamp() {
  Serial.println(F("[RAMP] Adelante logic + subida PWM ENA/ENB 0..255"));
  digitalWrite(MOTOR_A_IN1, HIGH);
  digitalWrite(MOTOR_A_IN2, LOW);
  digitalWrite(MOTOR_B_IN3, HIGH);
  digitalWrite(MOTOR_B_IN4, LOW);
  for (int p = 0; p <= 255; p += 5) {
    analogWrite(ENA, p);
    analogWrite(ENB, p);
    delay(20);
    if (p % 50 == 0) {
      Serial.print(F("PWM="));
      Serial.println(p);
    }
  }
  delay(600);
  todosParar();
  Serial.println(F("[RAMP] Fin."));
}

void printMenu() {
  Serial.println();
  Serial.println(F("--- Menu PruebaMotores_Validacion (115200) ---"));
  Serial.println(F(" 0 / S  Parar todos"));
  Serial.println(F(" 1      Solo Motor A adelante"));
  Serial.println(F(" 2      Solo Motor B adelante"));
  Serial.println(F(" 3      Ambas adelante"));
  Serial.println(F(" 4      Ambas atras"));
  Serial.println(F(" R      Rampa PWM (stress suave motores+batería)"));
  Serial.println(F(" A      Toggle secuencia automatica (~2 s por estado)"));
  Serial.println(F(" + / -  Duty PWM en comandos 1-4 / AUTO (80-255)"));
  Serial.println(F(" ?      Este menu"));
}

void setup() {
  Serial.begin(115200);
  delay(400);

  pinMode(MOTOR_A_IN1, OUTPUT);
  pinMode(MOTOR_A_IN2, OUTPUT);
  pinMode(MOTOR_B_IN3, OUTPUT);
  pinMode(MOTOR_B_IN4, OUTPUT);

  initL298nEnablePwm();
  todosParar();

  Serial.println();
  Serial.println(F("===== PruebaMotores_Validacion — listo ====="));
  printMenu();
}

void ejecutarAuto() {
  unsigned long ms = millis();
  if (!g_autoRun || (long)(ms - g_nextAutoMs) < 0) return;
  g_nextAutoMs = ms + 2000;

  todosParar();
  delay(100);

  switch (g_autoStep % 5) {
    case 0:
      Serial.println(F("[AUTO] A adelante"));
      soloAadelante();
      break;
    case 1:
      Serial.println(F("[AUTO] B adelante"));
      soloBadelante();
      break;
    case 2:
      Serial.println(F("[AUTO] Ambas adelante"));
      ambasAdelante();
      break;
    case 3:
      Serial.println(F("[AUTO] Ambas atras"));
      ambasAtras();
      break;
    default:
      Serial.println(F("[AUTO] Parar"));
      todosParar();
      break;
  }
  g_autoStep++;
}

void loop() {
  ejecutarAuto();

  if (!Serial.available()) return;

  char c = (char)Serial.read();
  while (Serial.available()) (void)Serial.read();  // vaciar cola línea simple

  if (g_autoRun) {
    Serial.println(F("Modo AUTO desactivado por comando."));
    g_autoRun = false;
    todosParar();
  }

  switch (toupper(c)) {
    case '?':
      printMenu();
      break;
    case 'S':
    case '0':
      todosParar();
      Serial.println(F("STOP"));
      break;
    case '1':
      Serial.println(F("CMD: A adelante"));
      soloAadelante();
      break;
    case '2':
      Serial.println(F("CMD: B adelante"));
      soloBadelante();
      break;
    case '3':
      Serial.println(F("CMD: ambas adelante"));
      ambasAdelante();
      break;
    case '4':
      Serial.println(F("CMD: ambas atras"));
      ambasAtras();
      break;
    case 'R':
      pruebaRamp();
      break;
    case 'A':
      g_autoRun = !g_autoRun;
      g_nextAutoMs = millis();
      Serial.println(g_autoRun ? F("AUTO ON") : F("AUTO OFF"));
      if (!g_autoRun) todosParar();
      break;
    case '+':
      g_pwm = min(255, g_pwm + 15);
      Serial.print(F("PWM ahora "));
      Serial.println(g_pwm);
      break;
    case '-':
      g_pwm = max(80, g_pwm - 15);
      Serial.print(F("PWM ahora "));
      Serial.println(g_pwm);
      break;
    default:
      break;
  }
}
