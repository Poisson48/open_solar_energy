@echo off
echo.
echo  Open Solar Energy — Serveur local
echo  Ouvrez http://localhost:8080 dans votre navigateur
echo  Appuyez sur Ctrl+C pour arreter
echo.
start "" "http://localhost:8080"
python -m http.server 8080
pause
