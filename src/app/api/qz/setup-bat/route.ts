/**
 * GET /api/qz/setup-bat
 * ─────────────────────────────────────────────────────────────────────────
 * Generates a downloadable Windows batch script (.bat) that, when run,
 * automatically installs the DistriTrack certificate into QZ Tray's
 * local trusted-certs folder AND creates a qz-tray.properties file
 * to whitelist the app's domain for silent printing.
 *
 * This works for BOTH local dev and Vercel deployments because the
 * .bat runs on the USER'S LOCAL PC where QZ Tray is installed.
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

:: ── Create trusted-certs directory ──
set "QZ_DIR=%USERPROFILE%\\.qz"
set "CERT_DIR=%QZ_DIR%\\trusted-certs"
set "CERT_FILE=%CERT_DIR%\\distritrack.pem"
set "PROPS_FILE=%QZ_DIR%\\qz-tray.properties"

if not exist "%QZ_DIR%" mkdir "%QZ_DIR%"
if not exist "%CERT_DIR%" mkdir "%CERT_DIR%"

:: ── Write the certificate PEM ──
echo Writing certificate to %CERT_FILE%...
(
${pemLines.map(line => `echo ${line}`).join('\n')}
) > "%CERT_FILE%"

echo.
echo [OK] Certificate installed: %CERT_FILE%
echo.

:: ── Create qz-tray.properties for whitelisting ──
echo Creating QZ Tray properties for silent printing...
(
echo # DistriTrack QZ Tray Configuration
echo # Generated automatically - do not modify
echo # This allows silent printing without security prompts
echo.
echo # Whitelist localhost and Vercel deployment
echo wss.whitelist=localhost,distritrack.vercel.app
) > "%PROPS_FILE%"

echo [OK] Properties file created: %PROPS_FILE%
echo.

:: ── Kill and restart QZ Tray ──
echo Restarting QZ Tray...
taskkill /F /IM "qz-tray.exe" >nul 2>&1
timeout /t 2 /nobreak >nul

:: Try common QZ Tray install paths
set "QZ_EXE="
if exist "C:\\Program Files\\QZ Tray\\qz-tray.exe" set "QZ_EXE=C:\\Program Files\\QZ Tray\\qz-tray.exe"
if exist "C:\\Program Files (x86)\\QZ Tray\\qz-tray.exe" set "QZ_EXE=C:\\Program Files (x86)\\QZ Tray\\qz-tray.exe"
if exist "%LOCALAPPDATA%\\Programs\\QZ Tray\\qz-tray.exe" set "QZ_EXE=%LOCALAPPDATA%\\Programs\\QZ Tray\\qz-tray.exe"

if defined QZ_EXE (
    start "" "%QZ_EXE%"
    echo [OK] QZ Tray restarted from: %QZ_EXE%
) else (
    echo [!] QZ Tray not found in default paths.
    echo     Please restart QZ Tray manually from Start Menu.
)

echo.
echo =====================================================
echo   SETUP COMPLETE!
echo =====================================================
echo.
echo   Certificate: %CERT_FILE%
echo   Properties:  %PROPS_FILE%
echo.
echo   The "Action Required" popup will NO LONGER appear.
echo   Just refresh your browser (Ctrl+R) and you're done!
echo.
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
