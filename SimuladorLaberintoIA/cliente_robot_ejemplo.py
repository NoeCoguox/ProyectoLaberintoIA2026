# -*- coding: utf-8 -*-
"""
Cliente TCP de ejemplo para el robot ESP32 por Wi-Fi.

Uso:
  py cliente_robot_ejemplo.py
  py cliente_robot_ejemplo.py 192.168.0.45

Si no pasas IP, se usa ROBOT_IP abajo (cámbiala o usa el argumento).
La IP debe ser la que imprime el ESP32 en el Monitor serie (línea "IP: ...").
"""

import socket
import sys

ROBOT_IP = "192.168.1.100"  # Valor por defecto; mejor: py cliente_robot_ejemplo.py TU_IP
ROBOT_PORT = 8888


def send_command(sock: socket.socket, cmd: str) -> list:
    """Envía un comando y lee líneas de respuesta hasta LISTO o PONG."""
    sock.sendall((cmd + "\n").encode())
    lines = []
    while True:
        data = sock.recv(1024).decode()
        if not data:
            break
        for line in data.strip().split("\n"):
            line = line.strip()
            if line:
                lines.append(line)
                if line == "LISTO" or line == "PONG":
                    return lines
    return lines


def main() -> None:
    ip = sys.argv[1].strip() if len(sys.argv) >= 2 else ROBOT_IP

    print("Conectando a", ip, "puerto", ROBOT_PORT)
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.settimeout(8.0)
        sock.connect((ip, ROBOT_PORT))
        print("Conectado.")
        r = send_command(sock, "PING")
        print("Respuesta PING:", r)
        r = send_command(sock, "LEER")
        print("Sensores sin mover (CELDA/DIST):", r)
        r = send_command(sock, "MOVER:ADELANTE")
        print("Respuesta MOVER:ADELANTE:", r)
    except socket.timeout:
        print("Error: tiempo de espera agotado (timeout).")
        print("Comprueba:")
        print("  1) En Monitor serie del ESP32, copia la IP exacta tras 'IP:' (no uses 192.168.1.100 si no es esa).")
        print("  2) PC y ESP32 en la misma red Wi-Fi (mismo router).")
        print("  3) Firewall de Windows: permite Python en red privada, o prueba: ping", ip)
        print("  4) El firmware debe estar cargado y el Serial mostrar 'Servidor TCP' / cliente listo.")
        print()
        print("Ejemplo con IP correcta:")
        print("  py cliente_robot_ejemplo.py 192.168.0.XX")
    except OSError as e:
        print("Error de red:", e)
    except Exception as e:
        print("Error:", e)
    finally:
        sock.close()


if __name__ == "__main__":
    main()
