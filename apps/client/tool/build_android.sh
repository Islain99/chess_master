#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Compilation de l'APK Android de production (distribution directe)
#
# Usage, depuis apps/client (Git Bash sous Windows, ou macOS / Linux) :
#   cp config/android.example.json config/android.json   # puis le remplir
#   bash tool/build_android.sh
#
# 1. génère le dossier android/ s'il manque (bootstrap_platforms.sh) ;
# 2. si FACEBOOK_APP_ID est renseigné, écrit la configuration du SDK Facebook
#    (res/values/facebook.xml + balises meta-data du manifeste) — à refaire
#    automatiquement, android/ n'étant pas versionné ;
# 3. compile l'APK avec toutes les valeurs du fichier en --dart-define ;
# 4. affiche l'empreinte SHA-1 (Google) et le « key hash » (Facebook) de la
#    clé de signature, à déclarer dans leurs consoles.
#
# Signature : le gabarit Flutter signe la version « release » avec la clé de
# débogage de CE PC (~/.android/debug.keystore). Une mise à jour de l'APK ne
# s'installe par-dessus l'ancienne que si elle est signée avec la même clé :
# compilez toujours sur ce PC et sauvegardez ce fichier. (Google Play
# exigerait une clé de publication dédiée.)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")/.."            # → apps/client
CONFIG=${1:-config/android.json}

if [[ ! -f "$CONFIG" ]]; then
  echo "Fichier $CONFIG introuvable : cp config/android.example.json $CONFIG puis remplis-le." >&2
  exit 1
fi

# Lecture d'une clé du JSON (Perl est fourni avec Git pour Windows).
value() {
  perl -MJSON::PP -e 'local $/; open my $f, "<", $ARGV[0] or die "$!\n";
                      my $d = decode_json(<$f>); print $d->{$ARGV[1]} // ""' "$CONFIG" "$1"
}

API_URL=$(value API_URL)
if [[ -z "$API_URL" || "$API_URL" == *mondomaine* ]]; then
  echo "API_URL n'est pas renseigné dans $CONFIG." >&2
  exit 1
fi

echo "==> Dossier android/"
bash tool/bootstrap_platforms.sh android

FB_APP_ID=$(value FACEBOOK_APP_ID)
FB_TOKEN=$(value FACEBOOK_CLIENT_TOKEN)
MANIFEST=android/app/src/main/AndroidManifest.xml
if [[ -n "$FB_APP_ID" ]]; then
  if [[ -z "$FB_TOKEN" ]]; then
    echo "FACEBOOK_CLIENT_TOKEN manquant (Facebook > Paramètres > Avancé > Jeton client)." >&2
    exit 1
  fi
  echo "==> Configuration Facebook (App ID $FB_APP_ID)"
  cat > android/app/src/main/res/values/facebook.xml <<XML
<?xml version="1.0" encoding="utf-8"?>
<!-- Généré par tool/build_android.sh — ne pas modifier à la main. -->
<resources>
    <string name="facebook_app_id">${FB_APP_ID}</string>
    <string name="facebook_client_token">${FB_TOKEN}</string>
</resources>
XML
  if ! grep -q "com.facebook.sdk.ApplicationId" "$MANIFEST"; then
    perl -0pi -e 's#(\s*)</application>#$1    <meta-data android:name="com.facebook.sdk.ApplicationId" android:value="\@string/facebook_app_id"/>$1    <meta-data android:name="com.facebook.sdk.ClientToken" android:value="\@string/facebook_client_token"/>$1</application>#' "$MANIFEST"
    echo "  ✓ $MANIFEST"
  fi
fi

echo "==> flutter build apk --release"
flutter pub get
flutter build apk --release --dart-define-from-file="$CONFIG"

APK=build/app/outputs/flutter-apk/app-release.apk
echo
echo "APK prêt : apps/client/$APK ($(du -h "$APK" | cut -f1))"

# Empreintes de la clé de signature (à déclarer une fois dans les consoles).
KEYSTORE="$HOME/.android/debug.keystore"
if command -v keytool >/dev/null 2>&1 && [[ -f "$KEYSTORE" ]]; then
  echo
  echo "Empreinte SHA-1 (Google Cloud > client OAuth Android) :"
  keytool -list -v -alias androiddebugkey -keystore "$KEYSTORE" -storepass android 2>/dev/null \
    | grep -m1 "SHA1:" | sed 's/^[[:space:]]*//'
  if command -v openssl >/dev/null 2>&1; then
    echo "Key hash (Facebook > Paramètres > De base > Android) :"
    keytool -exportcert -alias androiddebugkey -keystore "$KEYSTORE" -storepass android 2>/dev/null \
      | openssl sha1 -binary | openssl base64
  fi
else
  echo
  echo "keytool introuvable : pour les empreintes, voir docs/deploiement-vps.md (« Application Android »)."
fi
