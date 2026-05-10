@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not defined WEB_UI_PORT set "WEB_UI_PORT=5050"

echo.
echo === Panel Web Robot ===
echo Carpeta: %CD%
echo Puerto:   %WEB_UI_PORT%
echo.
echo Si falta Flask:  pip install -r requirements.txt
echo Deja esta ventana ABIERTA mientras uses el panel. Ctrl+C para cerrar.
echo.

where py >nul 2>&1
if %ERRORLEVEL% equ 0 (
  py app.py
  goto :after
)
where python >nul 2>&1
if %ERRORLEVEL% equ 0 (
  python app.py
  goto :after
)

echo ERROR: No se encontro "py" ni "python" en el PATH.
echo Instala Python desde https://www.python.org/ y marca "Add to PATH".
pause
exit /b 1

:after
if errorlevel 1 (
  echo.
  echo El servidor termino con error. Revisa el mensaje arriba.
  pause
)
endlocal
