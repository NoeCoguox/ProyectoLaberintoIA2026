@echo off
setlocal EnableExtensions
echo Cierra procesos que esten ESCUCHANDO en el puerto TCP 5050 (panel Flask).
echo.

for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":5050" ^| findstr LISTENING') do (
  echo taskkill /PID %%P /F
  taskkill /PID %%P /F
)

echo Listo. Ahora puedes ejecutar iniciar_panel.bat o py app.py
pause
