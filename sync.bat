@echo off
title Dong bo Cau Long Manager len GitHub
echo ===========================================
echo   DANG DONG BO DU LIEU LEN GITHUB PAGES...
echo ===========================================
echo.

:: Di chuyen den thu muc chua file bat
cd /d "%~dp0"

:: Kiem tra trang thai git
git status

echo.
echo 1. Dang chuan bi cac file thay doi...
git add .

echo.
echo 2. Dang ghi nhan thay doi (Commit)...
git commit -m "Cap nhat tu dong vao luc %date% %time%"

echo.
echo 3. Dang day code len GitHub Pages (Push)...
git push origin main

echo.
echo ===========================================
echo   DA DONG BO THANH CONG!
echo   Trang web cua ban se cap nhat sau 1-2 phut.
echo ===========================================
echo.
pause
