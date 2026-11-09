@echo off
chcp 65001 >nul
cd /d "%~dp0"
node "ซิงค์รูป.js"
rem เปิดหน้าทดสอบแผ่นเต้นด้วย Chrome หรือ Edge (ต้องเสียบแผ่นเต้นก่อน)
set "P=%~dp0index.html"
set "P=%P:\=/%"
where chrome >nul 2>nul && (start "" chrome "file:///%P%" & exit /b 0)
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "file:///%P%" & exit /b 0)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "file:///%P%" & exit /b 0)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "file:///%P%" & exit /b 0)
start "" "file:///%P%"
