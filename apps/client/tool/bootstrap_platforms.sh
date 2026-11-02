#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Sprint 13 — Génération des dossiers plateformes Flutter (macOS / Linux / CI)
#
# Le dépôt ne versionnait que lib/ : impossible de lancer `flutter run` ou
# `flutter build` sur une plateforme. Ce script :
#   1. génère UNIQUEMENT les dossiers plateformes manquants via `flutter create`
#      (les fichiers existants — lib/, pubspec.yaml, test/ — ne sont jamais écrasés) ;
#   2. applique les réglages réseau nécessaires au client (HTTP + Socket.IO) ;
#   3. est idempotent : on peut le relancer sans risque.
#
# Usage (depuis apps/client) :
#   bash tool/bootstrap_platforms.sh                 # les 6 plateformes
#   bash tool/bootstrap_platforms.sh web android     # seulement celles-ci (CI)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")/.."            # → apps/client

ORG="com.islain99"
PROJECT="chess_client"
ALL=(android ios web windows macos linux)
if (( $# > 0 )); then REQUESTED=("$@"); else REQUESTED=("${ALL[@]}"); fi

# ─── 1. Plateformes manquantes ───────────────────────────────────────────────
MISSING=()
for p in "${REQUESTED[@]}"; do
  [[ -d "$p" ]] || MISSING+=("$p")
done

if (( ${#MISSING[@]} > 0 )); then
  LIST=$(IFS=,; echo "${MISSING[*]}")
  echo "→ flutter create --platforms=$LIST"
  flutter create --project-name "$PROJECT" --org "$ORG" --platforms="$LIST" .
else
  echo "→ Dossiers plateformes déjà présents : ${REQUESTED[*]}"
fi

# Le gabarit Flutter crée un test « compteur » si test/widget_test.dart
# n'existe pas ; il référence MyApp et casserait `flutter test`.
if grep -qs "Counter increments" test/widget_test.dart; then
  echo "→ Suppression du test gabarit Flutter (compteur)"
  rm -f test/widget_test.dart
fi

# ─── 2. Réglages réseau ──────────────────────────────────────────────────────
# insert_before_last FILE MARKER SNIPPET GUARD
#   Insère SNIPPET avant la DERNIÈRE occurrence de MARKER si GUARD est absent.
insert_before_last() {
  local file="$1" marker="$2" snippet="$3" guard="$4"
  [[ -f "$file" ]] || return 0
  grep -q "$guard" "$file" && return 0
  SNIPPET="$snippet" MARKER="$marker" perl -0pi -e \
    's/(.*)\Q$ENV{MARKER}\E/$1$ENV{SNIPPET}$ENV{MARKER}/s' "$file"
  echo "  ✓ $file"
}

echo "→ Réglages réseau"

# Android (release) : la permission INTERNET n'est ajoutée par défaut
# qu'aux manifestes debug/profile.
insert_before_last android/app/src/main/AndroidManifest.xml "<application" \
  '<uses-permission android:name="android.permission.INTERNET"/>
    ' 'android.permission.INTERNET'

# Android (debug) : autorise http://10.0.2.2:3000 / localhost en développement.
insert_before_last android/app/src/debug/AndroidManifest.xml "</manifest>" \
  '    <application android:usesCleartextTraffic="true"/>
' 'usesCleartextTraffic'

# macOS : le bac à sable bloque les connexions sortantes sans cette clé.
for f in macos/Runner/DebugProfile.entitlements macos/Runner/Release.entitlements; do
  insert_before_last "$f" "</dict>" \
    '	<key>com.apple.security.network.client</key>
	<true/>
' 'com.apple.security.network.client'
done

# iOS : autorise le HTTP non chiffré vers le réseau local (API de dev).
insert_before_last ios/Runner/Info.plist "</dict>" \
  '	<key>NSAppTransportSecurity</key>
	<dict>
		<key>NSAllowsLocalNetworking</key>
		<true/>
	</dict>
' 'NSAppTransportSecurity'

# Sprint 16 : notifications push iOS (réveil par notification distante).
insert_before_last ios/Runner/Info.plist "</dict>" \
  '	<key>UIBackgroundModes</key>
	<array>
		<string>remote-notification</string>
	</array>
' 'UIBackgroundModes'

# Sprint 16 : service worker FCM du Web (toujours recopié → mises à jour).
if [[ -d web && -f web_push/dist/firebase-messaging-sw.js ]]; then
  mkdir -p web/push
  cp web_push/dist/firebase-messaging-sw.js web/push/firebase-messaging-sw.js
  echo "  ✓ web/push/firebase-messaging-sw.js"
fi

echo "✔ Plateformes prêtes. Étape suivante : flutter pub get && flutter run -d <device>"
