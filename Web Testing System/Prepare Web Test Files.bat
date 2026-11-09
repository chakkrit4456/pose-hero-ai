@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ===== เตรียมไฟล์ให้หน้าเว็บ (ท่าจากระบบ 2 + โมเดลสำหรับออฟไลน์) =====
py "Prepare Web Test Files.py" %*
echo.
pause
