@echo off
set PORT=%1
if "%PORT%"=="" set PORT=8080
echo Serving South Denver Warlord at http://localhost:%PORT%
python -m http.server %PORT%
