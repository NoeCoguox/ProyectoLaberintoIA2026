@echo off
chcp 65001 >nul
title Ping sostenido al ESP32 (ICMP)
if "%~1"=="" (
  echo.
  echo  Uso:   ping_sostenido.bat IP_DEL_ESP32
  echo  Ejemplo:  ping_sostenido.bat 192.168.1.50
  echo.
  echo  Envia ping ICMP cada segundo hasta que pulses Ctrl+C.
  echo  Para el robot con puerto 8888, en el panel web usa "Ping TCP continuo".
  echo.
  pause
  exit /b 1
)
echo Ping continuo a %1  ^(Ctrl+C para salir^)
echo.
ping -t %1
