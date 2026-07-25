/**
 * GET /api/qz/setup-bat
 * ─────────────────────────────────────────────────────────────────────────
 * Generates a downloadable Windows batch script (.bat) that, when run,
 * automatically installs the DistriTrack certificate as `override.crt`
 * in QZ Tray's configuration folders so QZ Tray marks the site as:
 *
 *   ✅ Trusted: Trusted website
 *   ✅ Allow button is UNLOCKED permanently
 *   ✅ "Remember this decision" works permanently → zero popups forever!
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from 'next/server';
import { getQzKeys } from '@/lib/qzCert';

export async function GET() {
  const { publicKeyPem } = await getQzKeys();

  // Split PEM into lines for ECHO commands in the batch file
  const pemLines = publicKeyPem.trim().split('\n').map(l => l.trim());

  // Build the .bat script content
  const batScript = `@echo off
setlocal enabledelayedexpansion
title DistriTrack QZ Tray Certificate Installer
echo.
echo =====================================================
echo   DistriTrack QZ Tray Certificate Installer
echo =====================================================
echo.

set "USER_QZ=%USERPROFILE%\\.qz"
set "CERT_DIR=%USER_QZ%\\trusted-certs"
set "CERT_FILE=%CERT_DIR%\\distritrack.pem"
set "OVERRIDE_1=%USER_QZ%\\override.crt"
set "OVERRIDE_2=%APPDATA%\\qz\\override.crt"
set "OVERRIDE_3=C:\\Program Files\\QZ Tray\\override.crt"
set "PROPS_FILE=%USER_QZ%\\qz-tray.properties"

if not exist "%USER_QZ%" mkdir "%USER_QZ%"
if not exist "%CERT_DIR%" mkdir "%CERT_DIR%"
if not exist "%APPDATA%\\qz" mkdir "%APPDATA%\\qz"

:: ── Write the certificate PEM ──
echo Writing certificate...
(
${pemLines.map(line => `echo ${line}`).join('\n')}
) > "%CERT_FILE%"

copy /Y "%CERT_FILE%" "%OVERRIDE_1%" >nul 2>&1
copy /Y "%CERT_FILE%" "%OVERRIDE_2%" >nul 2>&1
copy /Y "%CERT_FILE%" "%OVERRIDE_3%" >nul 2>&1

echo [OK] Certificate installed as QZ Tray root authority!
echo.

:: ── Create qz-tray.properties ──
echo Creating QZ Tray properties...
(
echo # DistriTrack QZ Tray Configuration
echo # Allowed hosts for silent printing
echo wss.whitelist=localhost,distritrack.vercel.app
) > "%PROPS_FILE%"

echo [OK] Configuration updated.
echo.

:: ── Restart QZ Tray ──
echo Restarting QZ Tray...
taskkill /F /IM "qz-tray.exe" >nul 2>&1
timeout /t 2 /nobreak >nul

set "QZ_EXE="
if exist "C:\\Program Files\\QZ Tray\\qz-tray.exe" set "QZ_EXE=C:\\Program Files\\QZ Tray\\qz-tray.exe"
if exist "C:\\Program Files (x86)\\QZ Tray\\qz-tray.exe" set "QZ_EXE=C:\\Program Files (x86)\\QZ Tray\\qz-tray.exe"
if exist "%LOCALAPPDATA%\\Programs\\QZ Tray\\qz-tray.exe" set "QZ_EXE=%LOCALAPPDATA%\\Programs\\QZ Tray\\qz-tray.exe"

if defined QZ_EXE (
    start "" "%QZ_EXE%"
    echo [OK] QZ Tray restarted.
) else (
    echo [!] QZ Tray not found in default paths. Please open QZ Tray manually.
)

echo.
echo =====================================================
echo   SETUP COMPLETE!
echo.
echo   QZ Tray is now fully configured for DistriTrack.
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
