# -*- coding: utf-8 -*-
"""
Panel web: lee sensores del ESP32 por TCP (LEER) y sirve JSON + interfaz HTML.
Ejecutar: py app.py  →  http://127.0.0.1:5050  (puerto configurable: WEB_UI_PORT)
"""
from __future__ import annotations

import os
import re
import socket
import threading
import time
import webbrowser
from dataclasses import dataclass

from flask import Flask, jsonify, redirect, render_template, request

app = Flask(__name__)

WEB_UI_PORT = int(os.environ.get("WEB_UI_PORT", "5050"))

DEFAULT_PORT = 8888
TCP_TIMEOUT_S = 6.0
# LEER espera LISTO despues de varias lineas; el firmware puede tardar (servo + sensores + WiFi)
TCP_LEER_TIMEOUT_S = 18.0
TCP_HARDWARE_TIMEOUT_S = 12.0
TCP_SERVO_CMD_TIMEOUT_S = 8.0
TCP_SERVO_LISTEN_MS = 480.0
# MOVER:* / MOTOR:* — pulso (por defecto ~5 s; el cliente puede enviar ?ms= para acortar/alargar)
TCP_MOVE_CMD_TIMEOUT_S = 22.0
TCP_MOVE_CMD_TIMEOUT_MAX_S = 72.0


@dataclass
class SensorSnapshot:
    celda: str | None
    dist: int | None
    r: int | None
    g: int | None
    b: int | None
    c: int | None
    sensor_ok: bool | None  # True = SENSOR:OK del firmware; False = SENSOR:OFF; None = sin línea
    thresh: str | None  # línea THRESH: del firmware (umbrales de color)
    rgb_pct: dict[str, float] | None  # R,G,B % sobre (R+G+B) desde línea RGBP:
    raw_lines: list[str]
    error: str | None = None
    servo_angle: int | None = None


def tcp_robot_command(host: str, port: int, command: str, timeout_s: float = TCP_SERVO_CMD_TIMEOUT_S) -> tuple[list[str], str | None]:
    """Envía una línea de comando (p. ej. SERVO_SWEEP:1) y lee hasta LISTO."""
    lines: list[str] = []
    err: str | None = None
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout_s)
        sock.connect((host, port))
        sock.sendall((command.strip() + "\n").encode("utf-8"))
        buf = b""
        while True:
            chunk = sock.recv(8192)
            if not chunk:
                break
            buf += chunk
            if b"LISTO" in buf:
                break
        try:
            sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        sock.close()
        if b"LISTO" not in buf:
            err = "La respuesta no incluye LISTO."
        text = buf.decode("utf-8", errors="replace")
        for line in text.replace("\r", "").split("\n"):
            line = line.strip()
            if line:
                lines.append(line)
    except OSError as e:
        err = str(e)
    return lines, err


def _tcp_error_retryable(err: str | None) -> bool:
    """True si el fallo suele ser ESP32 ocupado (otro cliente TCP) o red momentánea."""
    if not err:
        return False
    e = err.lower()
    return (
        "refused" in e
        or "actively refused" in e
        or "timed out" in e
        or "unreachable" in e
        or "10061" in e
        or "no route to host" in e
        or "host is down" in e
    )


def _move_cmd_timeout_s(ms_val: int | None, pulses: int | None = None) -> float:
    """Espera TCP: pulso + margen; tope para no bloquear Flask demasiado."""
    base_ms = int(ms_val) if ms_val is not None else 5000
    if pulses is not None and pulses > 0:
        base_ms = max(base_ms, 8000)
    return min(TCP_MOVE_CMD_TIMEOUT_MAX_S, max(TCP_MOVE_CMD_TIMEOUT_S, base_ms / 1000.0 + 18.0))


def parse_enc_from_raw_lines(lines: list[str]) -> dict:
    """Parsea ENC:A=…:B=…:DIFF=… del firmware (tras MOVER o LEER)."""
    out: dict = {
        "active": False,
        "a": None,
        "b": None,
        "diff": None,
        "pwma": None,
        "pwmb": None,
        "target": None,
    }
    for line in lines:
        u = line.upper()
        if u == "ENC_ACTIVE:1":
            out["active"] = True
        if not u.startswith("ENC:"):
            continue
        m_a = re.search(r"A=(\d+)", line, re.I)
        m_b = re.search(r"B=(\d+)", line, re.I)
        m_d = re.search(r"DIFF=(-?\d+)", line, re.I)
        m_pa = re.search(r"PWMA=(\d+)", line, re.I)
        m_pb = re.search(r"PWMB=(\d+)", line, re.I)
        m_t = re.search(r"TARGET=(\d+)", line, re.I)
        if m_a:
            out["a"] = int(m_a.group(1))
        if m_b:
            out["b"] = int(m_b.group(1))
        if m_d:
            out["diff"] = int(m_d.group(1))
        if m_pa:
            out["pwma"] = int(m_pa.group(1))
        if m_pb:
            out["pwmb"] = int(m_pb.group(1))
        if m_t:
            out["target"] = int(m_t.group(1))
        out["active"] = True
    return out


def tcp_robot_command_retry(
    host: str,
    port: int,
    command: str,
    timeout_s: float,
    attempts: int = 4,
    pause_s: float = 0.28,
) -> tuple[list[str], str | None]:
    """
    Igual que tcp_robot_command, pero reintenta solo ante errores transitorios (p. ej. conexión
    rechazada mientras el panel hace LEER en otro socket). No reintenta si LISTO falta en la respuesta.
    """
    last_lines: list[str] = []
    last_err: str | None = None
    for attempt in range(attempts):
        lines, err = tcp_robot_command(host, port, command, timeout_s)
        last_lines, last_err = lines, err
        if err is None:
            return lines, None
        if attempt < attempts - 1 and _tcp_error_retryable(err):
            time.sleep(pause_s * (1.0 + 0.4 * attempt))
            continue
        break
    return last_lines, last_err


def tcp_listen_servo_angle(host: str, port: int, listen_ms: float = TCP_SERVO_LISTEN_MS) -> tuple[int | None, str | None]:
    """Conecta y escucha líneas SERVO_ANG: del firmware (barrido)."""
    last_angle: int | None = None
    err: str | None = None
    deadline = time.perf_counter() + listen_ms / 1000.0
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(0.12)
        sock.connect((host, port))
        buf = b""
        while time.perf_counter() < deadline:
            try:
                chunk = sock.recv(4096)
                if chunk:
                    buf += chunk
                    text = buf.decode("utf-8", errors="replace")
                    for line in text.replace("\r", "").split("\n"):
                        line = line.strip()
                        if line.upper().startswith("SERVO_ANG:"):
                            m = re.match(r"SERVO_ANG:\s*(\d+)", line, re.I)
                            if m:
                                last_angle = int(m.group(1))
                else:
                    time.sleep(0.02)
            except socket.timeout:
                continue
        try:
            sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        sock.close()
    except OSError as e:
        err = str(e)
    return last_angle, err


def tcp_leer(host: str, port: int = DEFAULT_PORT) -> SensorSnapshot:
    """Envía LEER al robot y parsea DIST, RGB, SENSOR, CELDA hasta LISTO."""
    lines: list[str] = []
    err: str | None = None
    celda = dist = r = g = b = c = None
    sensor_ok: bool | None = None
    thresh: str | None = None
    rgb_pct: dict[str, float] | None = None
    servo_angle: int | None = None

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(TCP_LEER_TIMEOUT_S)
        sock.connect((host, port))
        sock.sendall(b"LEER\n")
        buf = b""
        while True:
            chunk = sock.recv(4096)
            if not chunk:
                break
            buf += chunk
            if b"LISTO" in buf:
                break
        # Tras LISTO, seguir leyendo un instante por si el firmware envia SERVO_ANG: (barrido).
        if b"LISTO" in buf:
            try:
                sock.settimeout(0.07)
                extra_until = time.perf_counter() + 0.45
                while time.perf_counter() < extra_until:
                    try:
                        more = sock.recv(4096)
                        if more:
                            buf += more
                        else:
                            time.sleep(0.012)
                    except socket.timeout:
                        pass
            except OSError:
                pass
        try:
            sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        sock.close()
        if b"LISTO" not in buf:
            err = (
                "La respuesta no incluye LISTO. Sube el firmware actual "
                "(DIST, RGB, SENSOR, CELDA, LISTO)."
            )
        text = buf.decode("utf-8", errors="replace")
        for line in text.replace("\r", "").split("\n"):
            line = line.strip()
            if line:
                lines.append(line)

        for line in lines:
            try:
                if line.upper().startswith("CELDA:"):
                    celda = line[6:].strip()
                elif line.upper().startswith("DIST:"):
                    m = re.match(r"DIST:\s*(-?\d+)", line, re.I)
                    if m:
                        dist = int(m.group(1))
                elif line.upper().startswith("RGB:"):
                    rest = line[4:].strip()
                    parts = rest.split(",")
                    if len(parts) >= 4:
                        r, g, b, c = (
                            int(parts[0].strip()),
                            int(parts[1].strip()),
                            int(parts[2].strip()),
                            int(parts[3].strip()),
                        )
                elif line.upper().startswith("SENSOR:"):
                    v = line[7:].strip().upper()
                    sensor_ok = v == "OK"
                elif line.upper().startswith("THRESH:"):
                    thresh = line[7:].strip()
                elif line.upper().startswith("RGBP:"):
                    rest = line[5:].strip()
                    parts = rest.split(",")
                    if len(parts) >= 3:
                        rgb_pct = {
                            "r": float(parts[0].strip()),
                            "g": float(parts[1].strip()),
                            "b": float(parts[2].strip()),
                        }
                elif line.upper().startswith("SERVO_ANG:"):
                    m = re.match(r"SERVO_ANG:\s*(\d+)", line, re.I)
                    if m:
                        servo_angle = int(m.group(1))
            except (ValueError, IndexError):
                continue

        # Datos completos aunque falte LISTO (timeout parcial muy raro)
        if err and dist is not None and r is not None and celda is not None:
            err = None

    except OSError as e:
        err = str(e)

    return SensorSnapshot(
        celda=celda,
        dist=dist,
        r=r,
        g=g,
        b=b,
        c=c,
        sensor_ok=sensor_ok,
        thresh=thresh,
        rgb_pct=rgb_pct,
        raw_lines=lines,
        error=err,
        servo_angle=servo_angle,
    )


def tcp_hardware(host: str, port: int = DEFAULT_PORT) -> dict:
    """Envía HARDWARE y parsea mapa de pines + escaneo I2C."""
    lines: list[str] = []
    err: str | None = None
    pins: list[dict[str, str | int]] = []
    i2c_addrs: list[str] = []
    note = ""
    has_color: bool | None = None
    hw_ver = ""

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(TCP_HARDWARE_TIMEOUT_S)
        sock.connect((host, port))
        sock.sendall(b"HARDWARE\n")
        buf = b""
        while True:
            chunk = sock.recv(8192)
            if not chunk:
                break
            buf += chunk
            if b"LISTO" in buf:
                break
        try:
            sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        sock.close()
        if b"LISTO" not in buf:
            err = "Respuesta sin LISTO (¿firmware con comando HARDWARE?)."
        text = buf.decode("utf-8", errors="replace")
        for line in text.replace("\r", "").split("\n"):
            line = line.strip()
            if line:
                lines.append(line)

        for line in lines:
            if line.startswith("HW:VER:"):
                hw_ver = line[7:].strip()
            elif line.startswith("HW:NOTE="):
                note = line[8:].strip()
            elif line.startswith("PIN:"):
                rest = line[4:]
                if "=" in rest:
                    gpio_s, label = rest.split("=", 1)
                    try:
                        pins.append(
                            {"gpio": int(gpio_s.strip()), "label": label.strip()}
                        )
                    except ValueError:
                        pass
            elif line.startswith("I2CADDR:"):
                i2c_addrs.append(line[8:].strip())
            elif line.startswith("HAS_COLOR:"):
                v = line[10:].strip()
                has_color = v == "1"

    except OSError as e:
        err = str(e)

    return {
        "ok": err is None,
        "error": err,
        "hw_ver": hw_ver,
        "note": note,
        "pins": pins,
        "i2c": i2c_addrs,
        "has_color_init": has_color,
        "raw_lines": lines,
    }


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/mapa")
def mapa():
    """Editor de laberinto 8×8 (inicio / libre / pared); la lógica vive en static/mapa.js + localStorage."""
    return render_template("mapa.html")


@app.route("/manual")
def manual():
    """Cruceta MOVER:* / DETENER; IP/puerto comparten localStorage con el panel principal."""
    return render_template("manual.html")


@app.route("/laberinto-fisico")
def laberinto_fisico():
    """Navegación en pista: grilla N×M configurable en el navegador, LEER/color y bitácora."""
    return render_template("laberinto_fisico.html")


@app.route("/laberinto_fisico")
def laberinto_fisico_alias_snake_case():
    """Alias por si escribís guión bajo en lugar de guión en la URL."""
    return redirect("/laberinto-fisico", code=308)


@app.route("/api/leer")
def api_leer():
    host = (request.args.get("host") or "").strip()
    port = request.args.get("port", type=int) or DEFAULT_PORT
    if not host:
        return jsonify({"ok": False, "error": "Falta ?host=IP_DEL_ESP32"}), 400
    snap = tcp_leer(host, port)
    if snap.error:
        return jsonify(
            {"ok": False, "error": snap.error, "raw_lines": snap.raw_lines}
        )
    return jsonify(
        {
            "ok": True,
            "celda": snap.celda,
            "dist": snap.dist,
            "r": snap.r,
            "g": snap.g,
            "b": snap.b,
            "c": snap.c,
            "sensor_ok": snap.sensor_ok,
            "thresh": snap.thresh,
            "rgb_pct": snap.rgb_pct,
            "raw_lines": snap.raw_lines,
            "servo_angle": snap.servo_angle,
        }
    )


TCS_CAL_KEYS = ("cmin", "pb", "pg", "pr", "wg", "wd", "blc", "blcp", "bdg", "bdp", "bsg", "bsp")


@app.route("/api/tcs_cal")
def api_tcs_cal():
    """
    Envía TCS_CAL:cmin=...,pb=,... al ESP32 (firmware con USE_COLOR_SENSOR y comando TCS_CAL).
    Cada parámetro es opcional; los omitidos no cambian en el robot.
    """
    host = (request.args.get("host") or "").strip()
    port = request.args.get("port", type=int) or DEFAULT_PORT
    if not host:
        return jsonify({"ok": False, "error": "Falta ?host=IP_DEL_ESP32"}), 400
    parts: list[str] = []
    for key in TCS_CAL_KEYS:
        v = request.args.get(key)
        if v is None:
            continue
        vs = str(v).strip()
        if not vs:
            continue
        parts.append(f"{key}={vs}")
    if not parts:
        return jsonify(
            {"ok": False, "error": "Ningún parámetro de calibración (cmin, pb, pg, …)."}
        ), 400
    cmd = "TCS_CAL:" + ",".join(parts)
    lines, err = tcp_robot_command(host, port, cmd, timeout_s=TCP_SERVO_CMD_TIMEOUT_S)
    if err:
        return jsonify({"ok": False, "error": err, "raw_lines": lines})
    ok_line = any(line.startswith("OK:TCS_CAL") for line in lines)
    err_line = next((line for line in lines if line.startswith("ERR:")), None)
    if err_line and not ok_line:
        return jsonify({"ok": False, "error": err_line, "raw_lines": lines})
    return jsonify({"ok": True, "raw_lines": lines})


@app.route("/api/servo")
def api_servo():
    """op=angle | sweep_on | sweep_off | set&deg=0-180 — TCP al ESP32 (firmware con SERVO_SWEEP / SERVO_ANG)."""
    host = (request.args.get("host") or "").strip()
    port = request.args.get("port", type=int) or DEFAULT_PORT
    op = (request.args.get("op") or "").strip().lower()
    if not host:
        return jsonify({"ok": False, "error": "Falta host"}), 400

    if op == "angle":
        angle, err = tcp_listen_servo_angle(host, port)
        return jsonify(
            {
                "ok": err is None,
                "angle": angle,
                "error": err,
            }
        )

    if op == "sweep_on":
        lines, err = tcp_robot_command(host, port, "SERVO_SWEEP:1")
        return jsonify({"ok": err is None, "error": err, "raw_lines": lines})

    if op == "sweep_off":
        lines, err = tcp_robot_command(host, port, "SERVO_SWEEP:0")
        return jsonify({"ok": err is None, "error": err, "raw_lines": lines})

    if op == "set":
        deg = request.args.get("deg", type=int)
        if deg is None or deg < 0 or deg > 180:
            return jsonify({"ok": False, "error": "Falta deg=0..180"}), 400
        lines, err = tcp_robot_command(host, port, f"SERVO:{deg}")
        return jsonify({"ok": err is None, "error": err, "raw_lines": lines})

    return jsonify({"ok": False, "error": "op inválido (angle|sweep_on|sweep_off|set)"}), 400


@app.route("/api/mover")
def api_mover():
    """
    dir=adelante|atras|izquierda|derecha|detener — MOVER:* / DETENER.
    Modo tiempo (habitual): ms=50..60000 → MOVER:ADELANTE:3500
    Modo pulsos (solo si firmware ENCODER_DRIVE_CONTROL=1): pulses + ms_max → MOVER:ADELANTE:E72:3500
    La respuesta incluye ENC: (lectura) cuando el firmware tiene encoders.
    """
    host = (request.args.get("host") or "").strip()
    port = request.args.get("port", type=int) or DEFAULT_PORT
    d = (request.args.get("dir") or "").strip().lower()
    if not host:
        return jsonify({"ok": False, "error": "Falta host"}), 400

    cmd_map = {
        "adelante": "MOVER:ADELANTE",
        "atras": "MOVER:ATRAS",
        "izquierda": "MOVER:IZQUIERDA",
        "derecha": "MOVER:DERECHA",
        "detener": "DETENER",
    }
    tcp_cmd = cmd_map.get(d)
    if not tcp_cmd:
        return jsonify(
            {"ok": False, "error": "dir inválido (adelante|atras|izquierda|derecha|detener)"}
        ), 400

    ms = request.args.get("ms", type=int)
    ms_max = request.args.get("ms_max", type=int)
    pulses = request.args.get("pulses", type=int)
    move_mode = "detener" if tcp_cmd == "DETENER" else "ms"

    if tcp_cmd != "DETENER":
        if pulses is not None and pulses > 0:
            pulses = max(1, min(65535, int(pulses)))
            tcp_cmd = f"{tcp_cmd}:E{pulses}"
            move_mode = "encoder"
            if ms_max is not None:
                ms_max = max(50, min(60000, int(ms_max)))
                tcp_cmd = f"{tcp_cmd}:{ms_max}"
            ms = ms_max
        elif ms is not None:
            ms = max(50, min(60000, int(ms)))
            tcp_cmd = f"{tcp_cmd}:{ms}"

    timeout_ms = ms_max if move_mode == "encoder" else ms
    lines, err = tcp_robot_command_retry(
        host, port, tcp_cmd, timeout_s=_move_cmd_timeout_s(timeout_ms, pulses)
    )
    enc = parse_enc_from_raw_lines(lines)
    return jsonify(
        {
            "ok": err is None,
            "error": err,
            "raw_lines": lines,
            "dir": d,
            "ms": ms,
            "ms_max": ms_max,
            "pulses": pulses,
            "move_mode": move_mode,
            "enc": enc,
            "tcp_cmd": tcp_cmd,
        }
    )


@app.route("/api/motor")
def api_motor():
    """wheel=a|b, dir=adelante|atras|detener — MOTOR:A:* / MOTOR:B:*. Opcional: ms=50..60000 (pulso ADELANTE/ATRAS)."""
    host = (request.args.get("host") or "").strip()
    port = request.args.get("port", type=int) or DEFAULT_PORT
    wheel = (request.args.get("wheel") or "").strip().lower()
    d = (request.args.get("dir") or "").strip().lower()
    if not host:
        return jsonify({"ok": False, "error": "Falta host"}), 400
    if wheel not in ("a", "b"):
        return jsonify({"ok": False, "error": "wheel debe ser a o b"}), 400
    dir_tcp = {"adelante": "ADELANTE", "atras": "ATRAS", "detener": "DETENER"}.get(d)
    if not dir_tcp:
        return jsonify({"ok": False, "error": "dir inválido (adelante|atras|detener)"}), 400
    label = "A" if wheel == "a" else "B"
    tcp_cmd = f"MOTOR:{label}:{dir_tcp}"
    ms = request.args.get("ms", type=int)
    if dir_tcp != "DETENER" and ms is not None:
        ms = max(50, min(60000, int(ms)))
        tcp_cmd = f"{tcp_cmd}:{ms}"

    lines, err = tcp_robot_command_retry(
        host, port, tcp_cmd, timeout_s=_move_cmd_timeout_s(ms)
    )
    return jsonify({"ok": err is None, "error": err, "raw_lines": lines, "wheel": wheel, "dir": d, "ms": ms})


@app.route("/api/whoami")
def api_whoami():
    """IP del cliente HTTP (navegador) vista por Flask; útil para comprobar desde qué equipo abres el panel."""
    fwd = (request.headers.get("X-Forwarded-For") or "").strip()
    if fwd:
        client_ip = fwd.split(",")[0].strip()
    else:
        client_ip = request.remote_addr or ""
    return jsonify({"ok": True, "client_ip": client_ip})


@app.route("/api/status")
def api_status():
    """Pregunta al ESP32 comando STATUS -> IP: y RSSI: (misma IP que debes poner en el panel)."""
    host = (request.args.get("host") or "").strip()
    port = request.args.get("port", type=int) or DEFAULT_PORT
    if not host:
        return jsonify({"ok": False, "error": "Falta host"}), 400
    lines, err = tcp_robot_command(host, port, "STATUS", timeout_s=TCP_TIMEOUT_S)
    if err:
        return jsonify({"ok": False, "error": err, "raw_lines": lines})
    ip_val: str | None = None
    rssi_val: int | None = None
    for line in lines:
        u = line.upper()
        if u.startswith("IP:"):
            ip_val = line.split(":", 1)[1].strip()
        elif u.startswith("RSSI:"):
            try:
                rssi_val = int(line.split(":", 1)[1].strip())
            except (ValueError, IndexError):
                pass
    return jsonify(
        {
            "ok": True,
            "robot_ip": ip_val,
            "rssi": rssi_val,
            "raw_lines": lines,
        }
    )


@app.route("/api/ping")
def api_ping():
    host = (request.args.get("host") or "").strip()
    port = request.args.get("port", type=int) or DEFAULT_PORT
    if not host:
        return jsonify({"ok": False, "error": "Falta host"}), 400
    t0 = time.perf_counter()
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(TCP_TIMEOUT_S)
        sock.connect((host, port))
        sock.sendall(b"PING\n")
        buf = b""
        while True:
            chunk = sock.recv(1024)
            if not chunk:
                break
            buf += chunk
            if b"PONG" in buf:
                break
        try:
            sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        sock.close()
        ms = round((time.perf_counter() - t0) * 1000.0, 1)
        ok_pong = b"PONG" in buf
        return jsonify({"ok": ok_pong, "pong": ok_pong, "ms_tcp": ms, "error": None if ok_pong else "Sin PONG"})
    except OSError as e:
        ms = round((time.perf_counter() - t0) * 1000.0, 1)
        return jsonify({"ok": False, "pong": False, "ms_tcp": ms, "error": str(e)})


@app.route("/api/hardware")
def api_hardware():
    host = (request.args.get("host") or "").strip()
    port = request.args.get("port", type=int) or DEFAULT_PORT
    if not host:
        return jsonify({"ok": False, "error": "Falta host"}), 400
    data = tcp_hardware(host, port)
    if data.get("error"):
        return jsonify({"ok": False, **data})
    return jsonify({"ok": True, **data})


if __name__ == "__main__":
    pid = os.getpid()
    url = f"http://127.0.0.1:{WEB_UI_PORT}/"
    print(f"Panel web: {url}")
    print(f"PID de este proceso: {pid}  ->  Ctrl+C aqui debe detener el servidor.")
    print(
        f"Si el navegador sigue sirviendo la página después de cerrar CMD, "
        f"hay otro Python u otra sesión ocupando el puerto. "
        f'En CMD: netstat -ano | findstr ":{WEB_UI_PORT}" '
        f"y taskkill /PID <número> /F"
    )

    def _open_browser_when_ready() -> None:
        if os.environ.get("UMG_OPEN_BROWSER", "1").strip().lower() in ("0", "false", "no", "off"):
            return
        time.sleep(1.0)
        try:
            webbrowser.open(url)
        except Exception:
            pass

    threading.Thread(target=_open_browser_when_ready, daemon=True).start()

    try:
        app.run(host="127.0.0.1", port=WEB_UI_PORT, debug=False)
    except OSError as e:
        print(f"\nNo se pudo usar el puerto {WEB_UI_PORT}: {e}")
        print("Prueba otro puerto, por ejemplo: set WEB_UI_PORT=5051  y vuelve a ejecutar py app.py")
        raise SystemExit(1) from e
    except KeyboardInterrupt:
        print("\nServidor Flask detenido (Ctrl+C).")
