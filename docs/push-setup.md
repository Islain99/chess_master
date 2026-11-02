# Notifications push : configuration (sprint 16)

Chess Master envoie trois notifications :

- **« À vous de jouer »**, si vous n'avez pas la partie ouverte ;
- **fin de partie** (victoire, défaite ou nulle) ;
- **adversaire arrivé dans votre salle privée**.

Elles sont toujours visibles dans l'écran *Notifications* de l'application. Le push les fait aussi apparaître sur le téléphone ou le navigateur quand l'application est fermée.

| Plateforme | Canal |
|---|---|
| Android | Firebase Cloud Messaging (FCM) |
| iOS / macOS | FCM → APNs |
| Web | FCM → Web Push (VAPID) |
| Windows / Linux | non disponible : notifications in-app uniquement |

Sans configuration, le push est simplement désactivé. Le jeu et les notifications in-app fonctionnent normalement.

## Fonctionnement

1. À la connexion, l'application demande la permission puis appelle `FirebaseMessaging.register()`.
2. Elle reçoit l'**identifiant d'installation Firebase (FID)** et l'envoie à `POST /notifications/devices`.
3. Lors d'un événement de jeu, l'API crée la notification puis l'envoie via l'**API FCM HTTP v1**. Elle s'authentifie avec un compte de service : JWT RS256 puis jeton OAuth2, mis en cache 1 h. Aucun SDK Firebase côté serveur.
4. FCM signale les appareils désinstallés : l'API les supprime.
5. À la déconnexion, l'application appelle `DELETE /notifications/devices` puis `unregister()`.

> Les FID remplacent les anciens « registration tokens », que Firebase a dépréciés. Pendant la période de migration, le champ `token` de l'API FCM accepte les deux formats.

## 1. Projet Firebase

1. Sur [console.firebase.google.com](https://console.firebase.google.com), créer un projet. Analytics est facultatif.
2. Ajouter une application par plateforme :
   - **Android** : package `com.islain99.chess_client` ;
   - **iOS / macOS** : bundle ID de l'app ;
   - **Web**.
3. Pour chaque application, noter `apiKey`, `appId`, `messagingSenderId` et `projectId` (*Paramètres du projet > Vos applications*).

Aucun fichier `google-services.json` ou `GoogleService-Info.plist` n'est nécessaire : les options sont passées par `--dart-define`.

## 2. Côté API : compte de service

Dans *Paramètres du projet > Comptes de service*, cliquer sur **Générer une nouvelle clé privée**. Un fichier JSON est téléchargé.

```bash
# apps/api/.env
FCM_SERVICE_ACCOUNT=$(base64 -w0 service-account.json)   # ou le JSON brut
PUBLIC_WEB_URL=https://chess.example.com                  # lien ouvert au clic (Web)
```

En production, le secret se passe à Helm :

```bash
helm upgrade … --set secrets.fcmServiceAccount="$(base64 -w0 service-account.json)"
```

`GET /api/v1/notifications/push-status` doit répondre `{ "enabled": true }`.

> Ce fichier donne le droit d'envoyer des notifications à tous les utilisateurs : il ne doit **jamais** être commité ni embarqué dans l'application.

## 3. Côté client : `--dart-define`

```bash
flutter run -d <appareil> \
  --dart-define=FIREBASE_API_KEY=AIza… \
  --dart-define=FIREBASE_APP_ID=1:1234567890:android:abcdef \
  --dart-define=FIREBASE_MESSAGING_SENDER_ID=1234567890 \
  --dart-define=FIREBASE_PROJECT_ID=chess-master
# Web : ajouter la clé VAPID (Cloud Messaging > Certificats Web Push)
  --dart-define=FIREBASE_VAPID_KEY=BExx…
```

L'`appId` diffère selon la plateforme : utilisez celui de l'application Firebase correspondante.

### Android
Aucune étape supplémentaire. La permission `POST_NOTIFICATIONS` (Android 13+) est déclarée par le plugin et demandée à la connexion.

### iOS / macOS
1. Sur developer.apple.com, créer une **clé APNs** (*Keys*, type « Apple Push Notifications service »), puis la téléverser dans Firebase (*Cloud Messaging > Configuration des applications Apple*).
2. Dans Xcode (*Signing & Capabilities*), ajouter **Push Notifications** et **Background Modes**, avec « Remote notifications » coché. Le bootstrap ajoute déjà `UIBackgroundModes` à `Info.plist`.
3. Les notifications ne fonctionnent pas sur le simulateur iOS : il faut un appareil réel.

### Web
Le service worker Firebase est servi depuis `/push/firebase-messaging-sw.js`. Sa portée est séparée de celle du service worker de Flutter, ce qui évite les conflits. Il reçoit la configuration par son URL : aucun identifiant n'est écrit en dur.

- Il est copié dans `web/push/` par `tool/bootstrap_platforms.*` (et par le Dockerfile).
- Sa source est `web_push/firebase-messaging-sw.ts` (SDK Firebase JS 13.1.0, la version de FlutterFire). Pour la régénérer :
  ```bash
  cd apps/client/web_push && npm ci && npm run build   # → dist/firebase-messaging-sw.js
  ```
- Le Web Push exige **HTTPS**, sauf sur `localhost`.

## 4. Vérification rapide

1. Se connecter dans l'application et accepter les notifications.
2. Ouvrir une partie en ligne sur un second appareil, puis **fermer** l'application sur le premier.
3. Jouer un coup sur le second appareil : le premier reçoit « À vous de jouer ♟ ».
4. Toucher la notification : l'application s'ouvre sur l'écran *Notifications*.

En cas d'échec, les journaux de l'API (`FcmService` / `PushService`) donnent le code d'erreur FCM.
