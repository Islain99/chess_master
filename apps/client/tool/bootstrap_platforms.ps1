# ─────────────────────────────────────────────────────────────────────────────
# Sprint 13 — Génération des dossiers plateformes Flutter (Windows / PowerShell)
#
# Équivalent Windows de tool/bootstrap_platforms.sh :
#   1. génère UNIQUEMENT les dossiers plateformes manquants via `flutter create`
#      (lib/, pubspec.yaml et test/ existants ne sont jamais écrasés) ;
#   2. applique les réglages réseau du client (HTTP + Socket.IO) ;
#   3. idempotent : peut être relancé sans risque.
#
# Usage (depuis apps/client) :
#   powershell -ExecutionPolicy Bypass -File tool\bootstrap_platforms.ps1
#   powershell -ExecutionPolicy Bypass -File tool\bootstrap_platforms.ps1 web,android
# ─────────────────────────────────────────────────────────────────────────────
param(
  [string[]] $Platforms = @('android', 'ios', 'web', 'windows', 'macos', 'linux')
)

$ErrorActionPreference = 'Stop'

# Avec `powershell -File`, « web,android » arrive en une seule chaîne :
# on découpe sur les virgules pour accepter les deux formes d'appel.
$Platforms = @($Platforms | ForEach-Object { $_ -split ',' } |
  ForEach-Object { $_.Trim() } | Where-Object { $_ })
Set-Location (Join-Path $PSScriptRoot '..')   # → apps/client

$Org     = 'com.islain99'
$Project = 'chess_client'

# ─── 1. Plateformes manquantes ───────────────────────────────────────────────
$missing = @($Platforms | Where-Object { -not (Test-Path $_ -PathType Container) })

if ($missing.Count -gt 0) {
  $list = $missing -join ','
  Write-Host "→ flutter create --platforms=$list"
  flutter create --project-name $Project --org $Org --platforms=$list .
  if ($LASTEXITCODE -ne 0) { throw "flutter create a échoué ($LASTEXITCODE)" }
} else {
  Write-Host "→ Dossiers plateformes déjà présents : $($Platforms -join ', ')"
}

# Le gabarit Flutter crée un test « compteur » si test/widget_test.dart
# n'existe pas ; il référence MyApp et casserait `flutter test`.
$tpl = 'test/widget_test.dart'
if ((Test-Path $tpl) -and (Select-String -Path $tpl -Pattern 'Counter increments' -Quiet)) {
  Write-Host '→ Suppression du test gabarit Flutter (compteur)'
  Remove-Item $tpl
}

# ─── 2. Réglages réseau ──────────────────────────────────────────────────────
# Insère $Snippet avant la DERNIÈRE occurrence de $Marker si $Guard est absent.
# Écrit en UTF-8 sans BOM (PowerShell 5.1 ajoute un BOM avec -Encoding UTF8).
function Add-BeforeLast {
  param([string] $File, [string] $Marker, [string] $Snippet, [string] $Guard)
  if (-not (Test-Path $File)) { return }
  $path    = (Resolve-Path $File).Path
  $content = [IO.File]::ReadAllText($path)
  if ($content.Contains($Guard)) { return }
  $idx = $content.LastIndexOf($Marker)
  if ($idx -lt 0) { Write-Warning "Repère '$Marker' introuvable dans $File"; return }
  $content = $content.Insert($idx, $Snippet)
  [IO.File]::WriteAllText($path, $content, (New-Object Text.UTF8Encoding $false))
  Write-Host "  ✓ $File"
}

Write-Host '→ Réglages réseau'
$nl = "`n"

# Android (release) : INTERNET n'est ajouté par défaut qu'en debug/profile.
Add-BeforeLast 'android/app/src/main/AndroidManifest.xml' '<application' `
  ("<uses-permission android:name=`"android.permission.INTERNET`"/>$nl    ") `
  'android.permission.INTERNET'

# Android (debug) : autorise http://10.0.2.2:3000 / localhost en développement.
Add-BeforeLast 'android/app/src/debug/AndroidManifest.xml' '</manifest>' `
  ("    <application android:usesCleartextTraffic=`"true`"/>$nl") `
  'usesCleartextTraffic'

# macOS : le bac à sable bloque les connexions sortantes sans cette clé.
foreach ($f in @('macos/Runner/DebugProfile.entitlements', 'macos/Runner/Release.entitlements')) {
  Add-BeforeLast $f '</dict>' `
    ("`t<key>com.apple.security.network.client</key>$nl`t<true/>$nl") `
    'com.apple.security.network.client'
}

# iOS : autorise le HTTP non chiffré vers le réseau local (API de dev).
Add-BeforeLast 'ios/Runner/Info.plist' '</dict>' `
  ("`t<key>NSAppTransportSecurity</key>$nl`t<dict>$nl`t`t<key>NSAllowsLocalNetworking</key>$nl`t`t<true/>$nl`t</dict>$nl") `
  'NSAppTransportSecurity'

Write-Host '✔ Plateformes prêtes. Étape suivante : flutter pub get ; flutter run -d windows'
