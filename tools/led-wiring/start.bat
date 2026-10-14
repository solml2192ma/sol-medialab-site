@echo off
rem Double-click to test locally. Opens http://localhost:8765/ in the browser.
rem Close this window to stop the server.
cd /d "%~dp0"
start "" http://localhost:8765/index.html
python serve.py
