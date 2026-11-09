@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem ส่งออกท่าล่าสุดจากระบบ 2 (ถ้าไม่มี ใช้ท่าตัวอย่างเดิม) แล้วเปิดหน้าเว็บด้วย Chrome หรือ Edge
py "Prepare Web Test Files.py" --poses-only
set "P=%~dp0index.html"
set "P=%P:\=/%"
where chrome >nul 2>nul && (start "" chrome "file:///%P%" & exit /b 0)
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "file:///%P%" & exit /b 0)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "file:///%P%" & exit /b 0)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "file:///%P%" & exit /b 0)
start "" "file:///%P%"
