@echo off
rem ============================================================================
rem  Dual World - one click local launcher (Windows)
rem  Starts a zero-dependency static server and opens the browser.
rem
rem  NOTE: this file is intentionally ASCII-only. cmd.exe parses .bat files with
rem  the OEM/ANSI code page, so UTF-8 Chinese text here gets mangled and even
rem  executed as commands. All Chinese output comes from the Node/Python server.
rem ============================================================================
setlocal enabledelayedexpansion
chcp 65001 >nul
cd /d "%~dp0"

set "NODE_EXE="
set "PY_EXE="
set "NODE_VER=20.11.1"
set "NODE_DIR=%LOCALAPPDATA%\nodejs"
set "PORTABLE_DIR=%NODE_DIR%\node-v%NODE_VER%-win-x64"

rem ---- 1. Node.js on PATH ----------------------------------------------------
for %%I in (node.exe) do if not "%%~$PATH:I"=="" set "NODE_EXE=%%~$PATH:I"

rem ---- 2. common Node.js install locations -----------------------------------
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_EXE if exist "%APPDATA%\nvm\node.exe" set "NODE_EXE=%APPDATA%\nvm\node.exe"
if not defined NODE_EXE if exist "%PORTABLE_DIR%\node.exe" set "NODE_EXE=%PORTABLE_DIR%\node.exe"
if not defined NODE_EXE if exist "%NODE_DIR%\node.exe" set "NODE_EXE=%NODE_DIR%\node.exe"

rem ---- 3. node bundled with the DSH runtime ----------------------------------
if not defined NODE_EXE for /d %%D in ("%USERPROFILE%\.dsh\dsh-runtimes\*") do if exist "%%D\dependencies\node\bin\node.exe" set "NODE_EXE=%%D\dependencies\node\bin\node.exe"

rem ---- 4. Python as a fallback ----------------------------------------------
for %%I in (python.exe) do if not "%%~$PATH:I"=="" set "PY_EXE=%%~$PATH:I"
if not defined PY_EXE for %%I in (py.exe) do if not "%%~$PATH:I"=="" set "PY_EXE=%%~$PATH:I"
if not defined PY_EXE if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "PY_EXE=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"

echo.
echo   ============================================================
echo    Dual World - local launcher
echo   ============================================================
echo.

rem ---- 5. if Node.js is missing, try to install it automatically -------------
if not defined NODE_EXE call :install_node
if not defined NODE_EXE goto :check_python
echo   Node.js : !NODE_EXE!
echo   Starting the local static server, the browser will open...
echo   (keep this window open while playing; close it to stop the server)
echo.
"!NODE_EXE!" "tools\dev-server.mjs" --open
set "EXITCODE=%errorlevel%"
goto :done

:check_python
if defined PY_EXE goto :run_python
goto :nothing

:run_python
echo   Node.js is not available - falling back to Python.
echo   Python  : !PY_EXE!
echo   Starting the local static server, the browser will open...
echo   (keep this window open while playing; close it to stop the server)
echo.
"!PY_EXE!" "tools\dev-server.py" --open
set "EXITCODE=%errorlevel%"
goto :done

rem ============================================================================
rem  :install_node - try winget first, then a portable zip (no admin needed)
rem ============================================================================
:install_node
echo   Node.js was not found. Trying to install it automatically...
echo.

rem  a) winget (built into Windows 10 1809+ and Windows 11)
where winget >nul 2>nul
if not errorlevel 1 (
  echo   [1/2] winget install OpenJS.NodeJS.LTS ...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
  if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
  if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
)
if defined NODE_EXE (
  echo   Node.js installed via winget.
  goto :eof
)

rem  b) portable zip into %LOCALAPPDATA%\nodejs - works without administrator rights
echo   [2/2] downloading a portable Node.js v%NODE_VER% (no admin needed) ...
set "NODE_ZIP=%TEMP%\node-v%NODE_VER%-win-x64.zip"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v%NODE_VER%/node-v%NODE_VER%-win-x64.zip' -OutFile '%NODE_ZIP%' -UseBasicParsing } catch { exit 1 }"
if errorlevel 1 (
  echo   Download failed - check the network connection.
  goto :eof
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Expand-Archive -Path '%NODE_ZIP%' -DestinationPath '%NODE_DIR%' -Force } catch { exit 1 }"
if exist "%PORTABLE_DIR%\node.exe" set "NODE_EXE=%PORTABLE_DIR%\node.exe"
if not defined NODE_EXE if exist "%NODE_DIR%\node.exe" set "NODE_EXE=%NODE_DIR%\node.exe"
if defined NODE_EXE (
  echo   Node.js unpacked to %NODE_DIR% .
  del "%NODE_ZIP%" >nul 2>nul
) else (
  echo   Unpacking failed.
)
goto :eof

:nothing
echo   Neither Node.js nor Python is available, and the automatic Node.js
echo   installation did not succeed.
echo.
echo   The game itself is 100%% static: it only needs a plain HTTP server
echo   (ES modules cannot be loaded over file://).
echo.
echo   Please install Node.js manually (recommended, 18 or newer):
echo       https://nodejs.org/
echo   or install Python from https://www.python.org/
echo   Then double-click this file again.
echo.
set "EXITCODE=1"
goto :done

:done
echo.
if "%EXITCODE%"=="0" goto :stopped
rem Ctrl+C on Windows reports these two "console interrupt" exit codes - treat as a normal stop
if "%EXITCODE%"=="-1073741510" goto :stopped
if "%EXITCODE%"=="3221225786" goto :stopped
echo   Server exited with code %EXITCODE%.
echo   If you did not stop it on purpose, please send me the text above.
goto :pause
:stopped
echo   Server stopped.
:pause
echo.
pause
exit /b %EXITCODE%
