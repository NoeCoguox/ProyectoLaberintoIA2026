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
      ran: false,
      ok: null,
      timeout: false,
      wheel: null,
      err: null,
      target: null,
      delta: null,
      actualDiff: null,
      expectedDiff: null,
      finalA: null,
      finalB: null,
      pwm: null,
    };
    if (!lines || !lines.length) return out;
    for (let i = 0; i < lines.length; i++) {
      const line = String(lines[i] || "");
      if (!line.toUpperCase().startsWith("BAL:")) continue;
      out.ran = true;
      const mWheel = line.match(/RUEDA=([AB])/i);
      if (mWheel) out.wheel = mWheel[1].toUpperCase();
      const mTarget = line.match(/TARGET=(-?\d+)/i);
      if (mTarget) out.target = parseInt(mTarget[1], 10);
      const mPwm = line.match(/PWM=(\d+)/i);
      if (mPwm) out.pwm = parseInt(mPwm[1], 10);
      const mErr = line.match(/ERR=(-?\d+)/i);
      if (mErr) out.err = parseInt(mErr[1], 10);
      const mActual = line.match(/ACTUALDIFF=(-?\d+)/i);
      if (mActual) out.actualDiff = parseInt(mActual[1], 10);
      const mExp = line.match(/EXPECTEDDIFF=(-?\d+)/i);
      if (mExp) out.expectedDiff = parseInt(mExp[1], 10);
      const mDelta = line.match(/DELTA=(\d+)\/(\d+)/i);
      if (mDelta) {
        out.delta = parseInt(mDelta[1], 10);
        out.target = parseInt(mDelta[2], 10);
      }
      const mA = line.match(/:A=(\d+)/i);
      const mB = line.match(/:B=(\d+)/i);
      if (mA) out.finalA = parseInt(mA[1], 10);
      if (mB) out.finalB = parseInt(mB[1], 10);
      if (/BAL:FIN:OK/i.test(line)) {
        out.ok = true;
      } else if (/BAL:FIN:TIMEOUT/i.test(line)) {
        out.ok = false;
        out.timeout = true;
      }
    }
    return out;
  }

  function formatBalanceStatus(bal) {
    if (!bal || !bal.ran) return "";
    const wheel = bal.wheel || "?";
    if (bal.ok === true) {
      let s =
        "BAL " +
        wheel +
        " retrocedió " +
        (bal.delta != null ? bal.delta : "?") +
        " pulsos";
      if (bal.target != null && bal.target !== bal.delta) {
        s += "/" + bal.target;
      }
      if (bal.actualDiff != null && bal.expectedDiff != null) {
        s +=
          " (Δreal " +
          bal.actualDiff +
          " · Δesperado " +
          bal.expectedDiff +
          ")";
      }
      return s;
    }
    if (bal.timeout) {
      return (
        "BAL " +
        wheel +
        " TIMEOUT (" +
        (bal.delta != null ? bal.delta : "?") +
        "/" +
        (bal.target != null ? bal.target : "?") +
        " pulsos) — revisá FC-03 o subí PWM"
      );
    }
    return (
      "BAL " +
      wheel +
      " arrancó (target " +
      (bal.target != null ? bal.target : "?") +
      ")"
    );
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
