@echo off
title Dong bo Cau Long Manager len GitHub
echo ===========================================
echo   TIEN TRINH DONG BO DU LIEU GITHUB
echo ===========================================
echo.

:: Di chuyen den thu muc chua file bat
cd /d "%~dp0"

:: Kiem tra va tim duong dan Git
set GIT_PATH=git
git --version >nul 2>&1
if %errorlevel% neq 0 (
    if exist "C:\Program Files\Git\cmd\git.exe" (
        set GIT_PATH="C:\Program Files\Git\cmd\git.exe"
    ) else if exist "C:\Program Files (x86)\Git\cmd\git.exe" (
        set GIT_PATH="C:\Program Files (x86)\Git\cmd\git.exe"
    ) else if exist "%LocalAppData%\Programs\Git\cmd\git.exe" (
        set GIT_PATH="%LocalAppData%\Programs\Git\cmd\git.exe"
    ) else (
        echo [LOI] Khong tim thay Git tren he thong.
        echo Vui long tai va cai dat Git tai: https://git-scm.com/
        goto ERROR_END
    )
)

echo [+] Su dung Git tai: %GIT_PATH%

:: 2. Kiem tra xem da khoi tao Git repository chua
%GIT_PATH% rev-parse --is-inside-work-tree >nul 2>&1
if %errorlevel% neq 0 (
    echo [LOI] Thu muc nay chua duoc khoi tao Git.
    echo Ban can chay lenh "git init" va cau hinh remote repository.
    goto ERROR_END
)

:: 3. Lay ten branch hien tai
set BRANCH=main
for /f "tokens=*" %%i in ('%GIT_PATH% branch --show-current') do set BRANCH=%%i

echo [+] Nhanh hien tai: %BRANCH%
echo.

:: 4. Chuan bi commit
echo [+] Dang chuan bi cac file thay doi...
%GIT_PATH% add .

echo [+] Dang ghi nhan thay doi (Commit)...
%GIT_PATH% commit -m "Cap nhat tu dong"

:: 5. Day du lieu len GitHub (Push)
echo.
echo [+] Dang day du lieu len GitHub (git push origin %BRANCH%)...
%GIT_PATH% push origin %BRANCH%
if %errorlevel% neq 0 (
    echo.
    echo [LOI] Push that bai!
    echo Vui long kiem tra ket noi mang hoac quyen truy cap.
    goto ERROR_END
)

echo.
echo ===========================================
echo   DA DONG BO THANH CONG!
echo ===========================================
echo.
pause
exit /b 0

:ERROR_END
echo.
echo ===========================================
echo   DONG BO THAT BAI!
echo ===========================================
echo.
pause
exit /b 1
