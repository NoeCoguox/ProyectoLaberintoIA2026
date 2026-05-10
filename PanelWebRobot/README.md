# Panel web — datos del robot

Sirve una página en el navegador y, por detrás, abre un cliente TCP al ESP32 (`LEER` / `PING`).

**Importante:** el navegador no puede hablar TCP con el robot directamente; por eso este panel usa **Flask en tu PC** como puente. Cableado del ESP32 (38 pines v1.3, L298N, sensores): `../INTERCONEXIONES-PINES.md` y `../FirmwareRobotLaberinto/GUIA_PLACA_ESP32_38_PINES.md`.

## Uso

**Windows (recomendado):** doble clic en `iniciar_panel.bat` en esta carpeta. Se abrirá una consola **que debes dejar abierta**; al arrancar bien, el propio script intenta abrir el navegador en `http://127.0.0.1:5050/`.

Si Brave dice **“rechazó la conexión”**, el servidor **no está corriendo**: no cierres la ventana negra de CMD hasta terminar de usar el panel.

Si el puerto **5050** quedó ocupado por un `py app.py` antiguo: cierra esa ventana con **Ctrl+C** o ejecuta `cerrar_panel_5050.bat` (como administrador solo si Windows lo pide).

```bash
cd PanelWebRobot
pip install -r requirements.txt
py app.py
```

Navegador: `http://127.0.0.1:5050` (otro puerto solo si hace falta: `set WEB_UI_PORT=9000` y luego `py app.py`) — introduce la IP que muestra el Monitor serie del ESP32.

Para **no** abrir el navegador solo: `set UMG_OPEN_BROWSER=0` antes de `py app.py`.

En la página, **Cargar mapa HARDWARE** pide al ESP32 el listado de GPIO usados por el firmware y el escaneo I2C (no es detección física automática de cables).

### Conectividad

- **Ping TCP continuo:** en la página, marca *Ping TCP cada 2 s* (prueba el puerto 8888 y PONG del firmware).
- **Ping ICMP (red Windows):** en CMD: `ping -t TU_IP` o ejecuta `ping_sostenido.bat TU_IP` en esta carpeta. Detener con Ctrl+C.

## Firmware

Hace falta el firmware actualizado que envía `DIST:` primero y luego `RGB:...`, `SENSOR:...`, `CELDA:` (ver `FirmwareRobotLaberinto.ino`).
