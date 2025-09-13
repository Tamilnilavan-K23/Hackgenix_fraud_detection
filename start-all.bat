@echo off
echo Starting FraudShield Application...
echo =====================================

REM Kill any existing node processes
taskkill /F /IM node.exe 2>nul

echo.
echo Starting ML Service (Port 5001)...
start "ML Service" cmd /c "cd /d ml && node src/index.js"

echo Waiting for ML Service to start...
timeout /t 3 /nobreak >nul

echo.
echo Starting Backend Service (Port 5000)...
start "Backend Service" cmd /c "cd /d backend && npm start"

echo Waiting for Backend Service to start...
timeout /t 3 /nobreak >nul

echo.
echo Starting Frontend Service (Port 8080)...
start "Frontend Service" cmd /c "cd /d frontend/frontend && npm run dev"

echo.
echo =====================================
echo All services are starting up...
echo.
echo Services:
echo - ML Service: http://localhost:5001
echo - Backend API: http://localhost:5000
echo - Frontend UI: http://localhost:8080
echo.
echo Wait 10-15 seconds for all services to fully start
echo Then open: http://localhost:8080
echo =====================================

pause
