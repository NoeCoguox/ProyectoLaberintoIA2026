/**
 * Calibración compartida MOVER: pulsos encoder (distancia) + ms tope (seguridad).
 * Usado por Control manual y Laberinto físico (mismo localStorage).
 */
(function (global) {
  "use strict";

  const DIRS = ["adelante", "atras", "izquierda", "derecha"];

  const LS_ENC = {
    adelante: "manualMovePulseEnc_adelante",
    atras: "manualMovePulseEnc_atras",
    izquierda: "manualMovePulseEnc_izquierda",
    derecha: "manualMovePulseEnc_derecha",
  };

  const LS_MS = {
    adelante: "manualMovePulseMs_adelante",
    atras: "manualMovePulseMs_atras",
    izquierda: "manualMovePulseMs_izquierda",
    derecha: "manualMovePulseMs_derecha",
  };

  const LS_USE_ENC = "robotMoveUseEncoder";
  const DEFAULT_ENC = { adelante: 72, atras: 72, izquierda: 38, derecha: 38 };
  const DEFAULT_MS = { adelante: 3500, atras: 3500, izquierda: 900, derecha: 900 };

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function parseIntSafe(v, fallback) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  }

  function useEncoderMoves() {
    try {
      const v = localStorage.getItem(LS_USE_ENC);
      return v === "1";
    } catch (_) {
      return false;
    }
  }

  function setUseEncoderMoves(on) {
    try {
      localStorage.setItem(LS_USE_ENC, on ? "1" : "0");
    } catch (_) {}
  }

  function getEncPulses(dir) {
    const d = String(dir || "").toLowerCase();
    const def = DEFAULT_ENC[d] != null ? DEFAULT_ENC[d] : 60;
    try {
      const saved = localStorage.getItem(LS_ENC[d]);
      if (saved != null && saved !== "") {
        return clamp(parseIntSafe(saved, def), 1, 65535);
      }
    } catch (_) {}
    return def;
  }

  function getMsMax(dir) {
    const d = String(dir || "").toLowerCase();
    const def = DEFAULT_MS[d] != null ? DEFAULT_MS[d] : 3500;
    try {
      const saved = localStorage.getItem(LS_MS[d]);
      if (saved != null && saved !== "") {
        return clamp(parseIntSafe(saved, def), 50, 60000);
      }
    } catch (_) {}
    return def;
  }

  function saveEncPulses(dir, value) {
    const d = String(dir || "").toLowerCase();
    if (!LS_ENC[d]) return;
    try {
      localStorage.setItem(LS_ENC[d], String(clamp(parseIntSafe(value, 1), 1, 65535)));
    } catch (_) {}
  }

  function saveMsMax(dir, value) {
    const d = String(dir || "").toLowerCase();
    if (!LS_MS[d]) return;
    try {
      localStorage.setItem(LS_MS[d], String(clamp(parseIntSafe(value, 50), 50, 60000)));
    } catch (_) {}
  }

  /** Parámetros query para /api/mover (encoder o solo ms). */
  function getMoverApiQuery(dir) {
    const d = String(dir || "").toLowerCase();
    if (d === "detener") return {};
    if (useEncoderMoves()) {
      return {
        mode: "encoder",
        pulses: getEncPulses(d),
        ms_max: getMsMax(d),
      };
    }
    return {
      mode: "ms",
      ms: getMsMax(d),
    };
  }

  function appendMoverQuery(url, dir) {
    const q = getMoverApiQuery(dir);
    if (q.mode === "encoder") {
      return (
        url +
        "&pulses=" +
        encodeURIComponent(String(q.pulses)) +
        "&ms_max=" +
        encodeURIComponent(String(q.ms_max))
      );
    }
    if (q.ms != null) {
      return url + "&ms=" + encodeURIComponent(String(q.ms));
    }
    return url;
  }

  function parseEncFromRawLines(lines) {
    const out = {
      active: false,
      a: null,
      b: null,
      diff: null,
      pwma: null,
      pwmb: null,
      target: null,
      straight: null,
      velA: null,
      velB: null,
    };
    if (!lines || !lines.length) return out;
    for (let i = 0; i < lines.length; i++) {
      const line = String(lines[i] || "");
      const u = line.toUpperCase();
      if (u === "ENC_ACTIVE:1") out.active = true;
      if (!u.startsWith("ENC:")) continue;
      const mA = line.match(/A=(\d+)/i);
      const mB = line.match(/B=(\d+)/i);
      const mD = line.match(/DIFF=(-?\d+)/i);
      const mPa = line.match(/PWMA=(\d+)/i);
      const mPb = line.match(/PWMB=(\d+)/i);
      const mT = line.match(/TARGET=(\d+)/i);
      if (mA) out.a = parseInt(mA[1], 10);
      if (mB) out.b = parseInt(mB[1], 10);
      if (mD) out.diff = parseInt(mD[1], 10);
      if (mPa) out.pwma = parseInt(mPa[1], 10);
      if (mPb) out.pwmb = parseInt(mPb[1], 10);
      if (mT) out.target = parseInt(mT[1], 10);
      const mS = line.match(/STR=(\d+)/i);
      if (mS) out.straight = parseInt(mS[1], 10);
      const mVa = line.match(/VELA=(\d+)/i);
      const mVb = line.match(/VELB=(\d+)/i);
      if (mVa) out.velA = parseInt(mVa[1], 10);
      if (mVb) out.velB = parseInt(mVb[1], 10);
      out.active = true;
    }
    return out;
  }

  function formatEncStatus(enc) {
    if (!enc || enc.a == null) return "";
    let s = "ENC A=" + enc.a + " B=" + enc.b;
    if (enc.diff != null) s += " Δ=" + enc.diff;
    if (enc.velA != null && enc.velB != null) s += " vA=" + enc.velA + " vB=" + enc.velB;
    if (enc.target != null) s += " /meta " + enc.target;
    if (enc.pwma != null && enc.pwmb != null) s += " PWM " + enc.pwma + "/" + enc.pwmb;
    if (enc.straight === 2) s += " · corrigiendo fuerte";
    else if (enc.straight === 1) s += " · enderezando";
    return s;
  }

  function parseBalanceFromRawLines(lines) {
    const out = {
      ran: false,            // hubo BAL:iniciar
      seen: false,           // hubo cualquier línea BAL: (incluye BAL:check / BAL:disabled)
      checkOnly: false,      // sólo BAL:check (firmware evaluó pero no hizo falta)
      disabled: false,       // BAL:check:disabled (BALANCE:0 a runtime)
      checkActualDiff: null,
      checkExpectedDiff: null,
      checkErr: null,
      checkThreshold: null,
      mode: null,            // 0=PIVOTE, 1=SIMETRICO
      passes: 0,             // total de pasadas que terminaron (OK o TIMEOUT)
      finishedOk: 0,         // de esas, las OK
      timeout: false,        // si la ÚLTIMA pasada fue TIMEOUT
      lastDeltaA: null,
      lastDeltaB: null,
      lastTargetA: null,
      lastTargetB: null,
      perWheel: { A: 0, B: 0 }, // suma de pulsos rotados durante balance, por rueda
      initial: null,         // primer BAL:iniciar (referencia)
      finalA: null,
      finalB: null,
    };
    if (!lines || !lines.length) return out;
    for (let i = 0; i < lines.length; i++) {
      const line = String(lines[i] || "");
      const u = line.toUpperCase();
      if (!u.startsWith("BAL:")) continue;
      out.seen = true;
      const isCheck = u.startsWith("BAL:CHECK");
      if (!isCheck) {
        out.ran = true;
      }

      const mPwm = line.match(/PWM=(\d+)/i);
      const mErr = line.match(/ERR=(-?\d+)/i);
      const mActual = line.match(/ACTUALDIFF=(-?\d+)/i);
      const mExp = line.match(/EXPECTEDDIFF=(-?\d+)/i);
      const mThr = line.match(/THRESHOLD=(\d+)/i);
      const mMode = line.match(/MODO=(\d+)/i);
      const mTargetA = line.match(/TARGETA=(\d+)/i);
      const mTargetB = line.match(/TARGETB=(\d+)/i);
      const mDirA = line.match(/DIRA=([A-Z\-]+)/i);
      const mDirB = line.match(/DIRB=([A-Z\-]+)/i);
      const mDeltaA = line.match(/DELTAA=(\d+)\/(\d+)/i);
      const mDeltaB = line.match(/DELTAB=(\d+)\/(\d+)/i);
      // Compat con BAL:fin viejo (modo PIVOTE legacy): rueda=X delta=N/M
      const mWheel = line.match(/RUEDA=([AB])/i);
      const mDeltaLegacy = line.match(/DELTA=(\d+)\/(\d+)/i);
      const mTargetLegacy = line.match(/TARGET=(-?\d+)/i);
      const mA = line.match(/:A=(\d+)/i);
      const mB = line.match(/:B=(\d+)/i);

      if (isCheck) {
        out.checkOnly = !out.ran;
        out.disabled = /DISABLED/i.test(line);
        if (mActual) out.checkActualDiff = parseInt(mActual[1], 10);
        if (mExp) out.checkExpectedDiff = parseInt(mExp[1], 10);
        if (mErr) out.checkErr = parseInt(mErr[1], 10);
        if (mThr) out.checkThreshold = parseInt(mThr[1], 10);
        continue;
      }
      out.checkOnly = false;
      if (u.startsWith("BAL:INICIAR")) {
        if (mMode) out.mode = parseInt(mMode[1], 10);
        if (!out.initial) {
          out.initial = {
            mode: mMode ? parseInt(mMode[1], 10) : null,
            targetA: mTargetA ? parseInt(mTargetA[1], 10) : (mTargetLegacy ? parseInt(mTargetLegacy[1], 10) : null),
            targetB: mTargetB ? parseInt(mTargetB[1], 10) : null,
            dirA: mDirA ? mDirA[1].toUpperCase() : null,
            dirB: mDirB ? mDirB[1].toUpperCase() : null,
            wheel: mWheel ? mWheel[1].toUpperCase() : null,
            target: mTargetLegacy ? parseInt(mTargetLegacy[1], 10) : null,
            pwm: mPwm ? parseInt(mPwm[1], 10) : null,
            err: mErr ? parseInt(mErr[1], 10) : null,
            actualDiff: mActual ? parseInt(mActual[1], 10) : null,
            expectedDiff: mExp ? parseInt(mExp[1], 10) : null,
          };
        }
        continue;
      }
      if (u.startsWith("BAL:FIN")) {
        out.passes += 1;
        if (mDeltaA) {
          out.lastDeltaA = parseInt(mDeltaA[1], 10);
          out.lastTargetA = parseInt(mDeltaA[2], 10);
        }
        if (mDeltaB) {
          out.lastDeltaB = parseInt(mDeltaB[1], 10);
          out.lastTargetB = parseInt(mDeltaB[2], 10);
        }
        // Compat legacy: BAL:fin con rueda=X y delta=N/M
        if (!mDeltaA && !mDeltaB && mDeltaLegacy && mWheel) {
          const w = mWheel[1].toUpperCase();
          if (w === "A") {
            out.lastDeltaA = parseInt(mDeltaLegacy[1], 10);
            out.lastTargetA = parseInt(mDeltaLegacy[2], 10);
          } else {
            out.lastDeltaB = parseInt(mDeltaLegacy[1], 10);
            out.lastTargetB = parseInt(mDeltaLegacy[2], 10);
          }
        }
        if (mA) out.finalA = parseInt(mA[1], 10);
        if (mB) out.finalB = parseInt(mB[1], 10);
        if (/BAL:FIN:OK/i.test(line)) {
          out.finishedOk += 1;
          out.timeout = false;
          if (out.lastDeltaA != null) out.perWheel.A += out.lastDeltaA;
          if (out.lastDeltaB != null) out.perWheel.B += out.lastDeltaB;
        } else if (/BAL:FIN:TIMEOUT/i.test(line)) {
          out.timeout = true;
        }
      }
    }
    return out;
  }

  function formatBalanceStatus(bal) {
    if (!bal || !bal.seen) return "";
    if (bal.checkOnly) {
      if (bal.disabled) {
        return (
          "BAL apagado · Δreal " +
          (bal.checkActualDiff != null ? bal.checkActualDiff : "?") +
          " (BALANCE:1 para activar)"
        );
      }
      return (
        "BAL ✓ recto · Δreal " +
        (bal.checkActualDiff != null ? bal.checkActualDiff : "?") +
        " (umbral " +
        (bal.checkThreshold != null ? bal.checkThreshold : "?") +
        ")"
      );
    }
    if (!bal.ran) return "";
    const init = bal.initial;
    const modeStr = bal.mode === 0 ? "PIVOTE" : "SIM";
    if (bal.passes === 0) {
      const tA = init && init.targetA != null ? init.targetA : "?";
      const tB = init && init.targetB != null ? init.targetB : "?";
      return "BAL " + modeStr + " arrancó (A→" + tA + " · B→" + tB + ")";
    }
    if (bal.timeout) {
      return (
        "BAL " +
        modeStr +
        " TIMEOUT · A " +
        (bal.lastDeltaA != null ? bal.lastDeltaA : "?") +
        "/" +
        (bal.lastTargetA != null ? bal.lastTargetA : "?") +
        " · B " +
        (bal.lastDeltaB != null ? bal.lastDeltaB : "?") +
        "/" +
        (bal.lastTargetB != null ? bal.lastTargetB : "?") +
        " (pase " +
        bal.passes +
        ") — revisá FC-03 o subí PWM"
      );
    }
    let s =
      "BAL " +
      modeStr +
      " OK · " +
      bal.passes +
      (bal.passes === 1 ? " pasada" : " pasadas");
    if (bal.perWheel.A > 0 || bal.perWheel.B > 0) {
      s += " · A " + bal.perWheel.A + " · B " + bal.perWheel.B + " pulsos";
    }
    if (init && init.actualDiff != null && init.expectedDiff != null) {
      s +=
        " (Δinicial " +
        init.actualDiff +
        " · Δesperado " +
        init.expectedDiff +
        ")";
    }
    return s;
  }

  function calibrationSummaryLine() {
    const encOn = useEncoderMoves();
    const a = getEncPulses("adelante");
    const t = getEncPulses("atras");
    const iz = getEncPulses("izquierda");
    const d = getEncPulses("derecha");
    const ma = getMsMax("adelante");
    if (!encOn) {
      return "Movimiento por ms: ↑" + ma + " · ↓" + getMsMax("atras") + " · lectura ENC en respuesta.";
    }
    return (
      "Modo pulsos (firmware con ENCODER_DRIVE_CONTROL): ↑" +
      a +
      " ↓" +
      t +
      " ◀" +
      iz +
      " ▶" +
      d +
      " · tope ms ↑" +
      ma
    );
  }

  global.RobotMoveCal = {
    DIRS,
    LS_ENC,
    LS_MS,
    LS_USE_ENC,
    DEFAULT_ENC,
    DEFAULT_MS,
    useEncoderMoves,
    setUseEncoderMoves,
    getEncPulses,
    getMsMax,
    saveEncPulses,
    saveMsMax,
    getMoverApiQuery,
    appendMoverQuery,
    parseEncFromRawLines,
    parseBalanceFromRawLines,
    formatBalanceStatus,
    formatEncStatus,
    calibrationSummaryLine,
  };
})(typeof window !== "undefined" ? window : globalThis);
