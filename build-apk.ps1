# ==============================================================================
# Script Automatizado de Generación de APK Android (Capacitor + Gradle)
# Sistema de Gestión de Servicios Adicionales (Alfas)
# Nota: Soporta ejecución desde Google Drive File Stream (G:\) compilando
# automáticamente en un directorio local rápido ($env:LOCALAPPDATA\AlfasAndroidBuild)
# para evitar errores TAR_ENTRY_ERROR / EBADF de npm en unidades virtuales,
# y copia el proyecto Android / APK resultante de vuelta al workspace.
# ==============================================================================
param (
    [ValidateSet("debug", "release", "sync-only")]
    [string]$Mode = "debug"
)

$ErrorActionPreference = "Stop"
$WorkspaceDir = $PSScriptRoot

Write-Host "1. Empaquetando activos web en carpeta www/..." -ForegroundColor Cyan
node "$WorkspaceDir\scripts\build-apk-assets.js"

# Detectar si estamos en una unidad virtual (ej. Google Drive G:\) donde npm tar falla con EBADF
$DriveRoot = (Get-Item $WorkspaceDir).PSDrive.Name
$UseLocalBuildDir = ($DriveRoot -ne "C")

if ($UseLocalBuildDir) {
    $BuildDir = Join-Path $env:LOCALAPPDATA "AlfasAndroidBuild"
    Write-Host "2. Unidad virtual detectada ($DriveRoot`:). Preparando entorno de compilación nativo en $BuildDir..." -ForegroundColor Cyan
    if (-not (Test-Path $BuildDir)) {
        New-Item -ItemType Directory -Path $BuildDir -Force | Out-Null
    }
    Copy-Item "$WorkspaceDir\package.json" "$BuildDir\package.json" -Force
    Copy-Item "$WorkspaceDir\capacitor.config.json" "$BuildDir\capacitor.config.json" -Force
    if (Test-Path "$BuildDir\www") { Remove-Item "$BuildDir\www" -Recurse -Force }
    Copy-Item "$WorkspaceDir\www" "$BuildDir\www" -Recurse -Force
} else {
    $BuildDir = $WorkspaceDir
}

Push-Location $BuildDir
try {
    if (-not (Test-Path "node_modules/@capacitor/core")) {
        Write-Host "3. Instalando dependencias de Capacitor y SQLite nativo..." -ForegroundColor Cyan
        npm.cmd install --no-audit --no-fund
    }

    if (-not (Test-Path "android")) {
        Write-Host "4. Inicializando plataforma nativa Android en Capacitor..." -ForegroundColor Cyan
        npx.cmd cap add android
    }

    Write-Host "5. Sincronizando activos web y plugins SQLite hacia proyecto Android..." -ForegroundColor Cyan
    npx.cmd cap sync android

    if ($Mode -eq "sync-only") {
        Write-Host "Sincronización completada en: $BuildDir\android" -ForegroundColor Green
        exit 0
    }

    if (Test-Path "android/gradlew.bat") {
        Push-Location android
        try {
            if ($Mode -eq "release") {
                Write-Host "6. Compilando APK de Producción (Release)..." -ForegroundColor Cyan
                .\gradlew.bat assembleRelease
                $ApkPath = Join-Path $BuildDir "android\app\build\outputs\apk\release\app-release-unsigned.apk"
            } else {
                Write-Host "6. Compilando APK de Prueba (Debug)..." -ForegroundColor Cyan
                .\gradlew.bat assembleDebug
                $ApkPath = Join-Path $BuildDir "android\app\build\outputs\apk\debug\app-debug.apk"
            }
            if (Test-Path $ApkPath) {
                $DestApk = Join-Path $WorkspaceDir "Gestion_Alfas_$Mode.apk"
                Copy-Item $ApkPath $DestApk -Force
                Write-Host "APK generado y copiado exitosamente a: $DestApk" -ForegroundColor Green
            }
        } finally {
            Pop-Location
        }
    } else {
        Write-Warning "Proyecto Android generado en $BuildDir\android. Ábralo en Android Studio para compilar el APK."
    }
} finally {
    Pop-Location
}
