# ─────────────────────────────────────────────────────────────────────────────
# Sprint 13 — Image Docker du client Web Flutter
#
# Étape 1 : compilation `flutter build web` dans l'image officielle CirrusLabs.
# Étape 2 : service des fichiers statiques par Nginx (≈ 25 Mo au final).
#
# Sprint 19 : Nginx « unprivileged » (utilisateur non-root, port 8080) pour
# tourner sous Kubernetes avec runAsNonRoot et un système de fichiers en
# lecture seule.
#
# Les URL de l'API sont figées à la compilation (String.fromEnvironment dans
# lib/core/config/api_config.dart) → on les passe en build args :
#   docker build -t chess-client \
#     --build-arg API_URL=https://chess.example.com/api/v1 \
#     --build-arg WS_URL=https://chess.example.com .
# ─────────────────────────────────────────────────────────────────────────────

# ─── Étape 1 : build ─────────────────────────────────────────────────────────
FROM ghcr.io/cirruslabs/flutter:stable AS build

WORKDIR /app

# Dépendances d'abord : cette couche reste en cache tant que pubspec ne change pas.
COPY pubspec.yaml pubspec.lock* ./
RUN flutter pub get

COPY . .

# Génère web/ s'il n'est pas versionné et copie le service worker push
# (sprint 16) — mêmes réglages que le développement local.
RUN bash tool/bootstrap_platforms.sh web

ARG API_URL=http://localhost:3000/api/v1
ARG WS_URL=http://localhost:3000

# Novembre 2026 : identifiants PUBLICS de connexion et de push (vides =
# bouton / push désactivés). Avant, seules les URL étaient transmises : les
# boutons Google / Facebook et le push Web restaient inactifs en production.
ARG GOOGLE_CLIENT_ID=
ARG FACEBOOK_APP_ID=
ARG FIREBASE_API_KEY=
ARG FIREBASE_APP_ID=
ARG FIREBASE_MESSAGING_SENDER_ID=
ARG FIREBASE_PROJECT_ID=
ARG FIREBASE_VAPID_KEY=

RUN flutter build web --release \
      --dart-define=API_URL=${API_URL} \
      --dart-define=WS_URL=${WS_URL} \
      --dart-define=GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID} \
      --dart-define=FACEBOOK_APP_ID=${FACEBOOK_APP_ID} \
      --dart-define=FIREBASE_API_KEY=${FIREBASE_API_KEY} \
      --dart-define=FIREBASE_APP_ID=${FIREBASE_APP_ID} \
      --dart-define=FIREBASE_MESSAGING_SENDER_ID=${FIREBASE_MESSAGING_SENDER_ID} \
      --dart-define=FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID} \
      --dart-define=FIREBASE_VAPID_KEY=${FIREBASE_VAPID_KEY}

# Pages statiques (politique de confidentialité, exigée par Google et
# Facebook) : adresse de contact insérée à la compilation.
ARG CONTACT_EMAIL=contact@example.com
RUN mkdir -p build/web && for f in web_static/*.html; do \
      sed "s|__CONTACT_EMAIL__|${CONTACT_EMAIL}|g" "$f" > "build/web/$(basename "$f")"; \
    done

# ─── Étape 2 : runtime Nginx ─────────────────────────────────────────────────
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build/web /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
