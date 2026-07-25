/**
 * GET /api/qz/setup-bat
 * ─────────────────────────────────────────────────────────────────────────
 * Generates a downloadable Windows batch script (.bat) that:
 * 1. Cleans up any old/corrupt `allowed.dat` files
 * 2. Writes the active DistriTrack certificate
 * 3. Runs QZ Tray's official CLI (`qz-tray.jar --allow`) to register the active cert
 * 4. Restarts QZ Tray automatically
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from 'next/server';
import { getQzKeys } from '@/lib/qzCert';

export async function GET() {
  const { publicKeyPem } = await getQzKeys();

  const pemLines = publicKeyPem.trim().split('\n').map(l => l.trim());

  const batScript = `@echo off
setlocal enabledelayedexpansion
title DistriTrack QZ Tray Auto-Trust Installer
echo.
echo =====================================================
echo   DistriTrack QZ Tray Auto-Trust Installer
echo =====================================================
echo.

set "USER_QZ=%USERPROFILE%\\.qz"
set "CERT_DIR=%USER_QZ%\\trusted-certs"
set "CERT_FILE=%CERT_DIR%\\distritrack.pem"
set "ALLOWED_DAT=%APPDATA%\\qz\\allowed.dat"
set "ALLOWED_DAT2=%USER_QZ%\\allowed.dat"

if not exist "%USER_QZ%" mkdir "%USER_QZ%"
if not exist "%CERT_DIR%" mkdir "%CERT_DIR%"
if not exist "%APPDATA%\\qz" mkdir "%APPDATA%\\qz"

:: ── Delete old stale allowed.dat to prevent PEM accumulation ──
echo Cleaning up old QZ Tray whitelist entries...
if exist "%ALLOWED_DAT%" del /F /Q "%ALLOWED_DAT%" >nul 2>&1
if exist "%ALLOWED_DAT2%" del /F /Q "%ALLOWED_DAT2%" >nul 2>&1

:: ── Write Active Certificate File ──
echo Writing active certificate to %CERT_FILE%...
(
${pemLines.map(line => `echo ${line}`).join('\n')}
) > "%CERT_FILE%"

echo [OK] Certificate written.
echo.

:: ── Whitelist Active Certificate using QZ Tray CLI ──
echo Registering active certificate in QZ Tray whitelist (allowed.dat)...

set "JAVA_EXE="
set "QZ_JAR="

if exist "C:\\Program Files\\QZ Tray\\runtime\\bin\\java.exe" set "JAVA_EXE=C:\\Program Files\\QZ Tray\\runtime\\bin\\java.exe"
if exist "C:\\Program Files\\QZ Tray\\qz-tray.jar" set "QZ_JAR=C:\\Program Files\\QZ Tray\\qz-tray.jar"

if defined JAVA_EXE (
    if defined QZ_JAR (
        "%JAVA_EXE%" -jar "%QZ_JAR%" --allow "%CERT_FILE%" >nul 2>&1
        echo [OK] Active certificate whitelisted successfully!
    )
)

:: ── Copy to override locations as fallback ──
copy /Y "%CERT_FILE%" "%USER_QZ%\\override.crt" >nul 2>&1
copy /Y "%CERT_FILE%" "%APPDATA%\\qz\\override.crt" >nul 2>&1

echo.
echo ── Restarting QZ Tray ──
taskkill /F /IM "qz-tray.exe" >nul 2>&1
timeout /t 2 /nobreak >nul

set "QZ_EXE="
if exist "C:\\Program Files\\QZ Tray\\qz-tray.exe" set "QZ_EXE=C:\\Program Files\\QZ Tray\\qz-tray.exe"
if exist "C:\\Program Files (x86)\\QZ Tray\\qz-tray.exe" set "QZ_EXE=C:\\Program Files (x86)\\QZ Tray\\qz-tray.exe"

if defined QZ_EXE (
    start "" "%QZ_EXE%"
    echo [OK] QZ Tray restarted.
) else (
    echo [!] Please open QZ Tray manually from Start Menu.
)

echo.
echo =====================================================
echo   SETUP COMPLETE!
echo   QZ Tray has permanently trusted DistriTrack.
echo   Press Ctrl+R in your browser to refresh.
echo =====================================================
echo.
pause
`;

  return new NextResponse(batScript, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-bat',
      'Content-Disposition': 'attachment; filename="distritrack-qz-setup.bat"',
    },
  });
}
