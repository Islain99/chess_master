# Configuration OAuth : Google, Apple et Facebook (sprint 15)

La connexion sociale fonctionne en **échange de jeton** :

1. L'application Flutter s'authentifie avec le SDK officiel du fournisseur.
2. Elle envoie le jeton obtenu à `POST /api/v1/auth/oauth/:provider`.
3. L'API vérifie ce jeton auprès du fournisseur : signature JWKS, émetteur, audience, expiration et nonce. Pour Facebook, elle appelle `/debug_token`.
4. L'API renvoie ses propres JWT.

Tant qu'un fournisseur n'est pas configuré, son bouton n'apparaît pas et l'API répond `503`. Aucune étape ci-dessous n'est obligatoire pour faire tourner le projet.

> Préalable : les dossiers plateformes doivent exister (`tool/bootstrap_platforms.ps1`, sprint 13).

## Récapitulatif des variables

| Où | Variable | Valeur |
|---|---|---|
| API (`apps/api/.env`, Helm `api.env`) | `GOOGLE_CLIENT_IDS` | Client IDs Google Web, iOS et macOS, séparés par des virgules |
| API | `APPLE_CLIENT_IDS` | Bundle ID iOS/macOS et Services ID |
| API | `APPLE_ANDROID_PACKAGE` | `com.islain99.chess_client` |
| API | `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` | Identifiants Meta. Le secret reste **côté serveur uniquement** (Helm : `secrets.facebookAppSecret`) |
| Client (`--dart-define`) | `GOOGLE_CLIENT_ID` | Client ID Web (build Web) ou iOS (build iOS/macOS) |
| Client | `GOOGLE_SERVER_CLIENT_ID` | Client ID **Web** (Android et iOS) |
| Client | `APPLE_SERVICE_ID` / `APPLE_REDIRECT_URI` | Services ID et `https://<api>/api/v1/auth/oauth/apple/callback` |
| Client | `FACEBOOK_APP_ID` | App ID Meta (Web) |

## 1. Google : console Google Cloud, « Identifiants »

1. Créer l'**écran de consentement OAuth** (type Externe, scopes `email` et `profile`).
2. Créer les identifiants OAuth :
   - **Web** : origines JavaScript `http://localhost:8080` et le domaine de production. Ce client ID sert de `GOOGLE_SERVER_CLIENT_ID` sur mobile et de `GOOGLE_CLIENT_ID` sur le Web.
   - **Android** : package `com.islain99.chess_client` et empreinte SHA-1 de la clé de signature (`cd android && ./gradlew signingReport`). Il n'est utilisé que par Google pour reconnaître l'APK et ne se met pas dans le code.
   - **iOS** (et macOS) : bundle ID de l'app.
3. Ajouter tous ces client IDs (sauf Android) à `GOOGLE_CLIENT_IDS` côté API.
4. **iOS et macOS** : dans `ios/Runner/Info.plist` (et `macos/Runner/Info.plist`), déclarer le *reversed client ID* :
   ```xml
   <key>GIDClientID</key>
   <string>XXXX.apps.googleusercontent.com</string>
   <key>CFBundleURLTypes</key>
   <array><dict>
     <key>CFBundleURLSchemes</key>
     <array><string>com.googleusercontent.apps.XXXX</string></array>
   </dict></array>
   ```
5. **Web** : Google impose son propre bouton (`renderButton`), qui est affiché automatiquement.

## 2. Apple : developer.apple.com, « Certificates, Identifiers & Profiles »

1. **App ID** : activer la capability *Sign in with Apple*.
2. **iOS et macOS** : dans Xcode, onglet *Signing & Capabilities*, ajouter **Sign in with Apple**. Le bundle ID va dans `APPLE_CLIENT_IDS`.
3. **Android et Web** : créer un **Services ID** (par exemple `com.islain99.chess.signin`) et activer *Sign in with Apple* :
   - *Domains* : le domaine de l'API ;
   - *Return URL* : `https://<api>/api/v1/auth/oauth/apple/callback`.

   Ajouter ce Services ID à `APPLE_CLIENT_IDS` et le passer au client avec `APPLE_SERVICE_ID` et `APPLE_REDIRECT_URI`.
4. **Android** : déclarer l'activité de retour dans `android/app/src/main/AndroidManifest.xml`, à l'intérieur de `<application>` :
   ```xml
   <activity
       android:name="com.aboutyou.dart_packages.sign_in_with_apple.SignInWithAppleCallback"
       android:exported="true">
     <intent-filter>
       <action android:name="android.intent.action.VIEW" />
       <category android:name="android.intent.category.DEFAULT" />
       <category android:name="android.intent.category.BROWSABLE" />
       <data android:scheme="signinwithapple" android:path="callback" />
     </intent-filter>
   </activity>
   ```

Apple ne transmet le nom de l'utilisateur **qu'à la première connexion**. L'application le relaie à l'API (`displayName`). L'adresse peut être un relais `@privaterelay.appleid.com`.

## 3. Facebook : developers.facebook.com

1. Créer une application de type *Consumer* et ajouter le produit **Facebook Login**.
2. Récupérer l'**App ID**, l'**App Secret** (API seulement) et le **Client Token** (*Paramètres > Avancé*).
3. **Android** (`tool/build_android.sh` fait les deux modifications ci-dessous automatiquement à partir de `config/android.json`) :
   - Dans *Paramètres > De base > Android*, renseigner le package et le *key hash* de la clé de signature.
   - Dans `android/app/src/main/res/values/strings.xml` :
     ```xml
     <string name="facebook_app_id">1234567890</string>
     <string name="facebook_client_token">CLIENT_TOKEN</string>
     ```
   - Dans le manifeste, à l'intérieur de `<application>` :
     ```xml
     <meta-data android:name="com.facebook.sdk.ApplicationId" android:value="@string/facebook_app_id"/>
     <meta-data android:name="com.facebook.sdk.ClientToken" android:value="@string/facebook_client_token"/>
     ```
4. **iOS et macOS** : dans `Info.plist`, ajouter `FacebookAppID`, `FacebookClientToken`, `FacebookDisplayName`, l'URL scheme `fb1234567890` et `LSApplicationQueriesSchemes` (`fbapi`, `fb-messenger-share-api`). Sans autorisation de suivi (ATT), iOS renvoie un jeton **Limited Login** (JWT), que l'API sait vérifier.
5. **Web** : ajouter le domaine dans *Facebook Login > Paramètres*. Le SDK JavaScript n'accepte que HTTPS, sauf `localhost`.

## 4. Lancer avec les identifiants

```bash
# API
cp apps/api/.env.example apps/api/.env   # puis renseigner la section OAuth

# Client (exemple Android)
flutter run -d <appareil> \
  --dart-define=API_URL=http://10.0.2.2:3000/api/v1 \
  --dart-define=WS_URL=http://10.0.2.2:3000 \
  --dart-define=GOOGLE_SERVER_CLIENT_ID=WEB_CLIENT_ID.apps.googleusercontent.com \
  --dart-define=APPLE_SERVICE_ID=com.islain99.chess.signin \
  --dart-define=APPLE_REDIRECT_URI=https://api.example.com/api/v1/auth/oauth/apple/callback
```

## 5. Plateformes non prises en charge

**Windows et Linux** n'ont pas de SDK officiel Google ni Apple. Les boutons y sont masqués et la connexion e-mail / mot de passe reste disponible.

## 6. Sécurité : résumé

- Les jetons fournisseurs sont **toujours** revérifiés côté serveur. Le client n'est jamais cru sur parole.
- L'audience est contrôlée : un jeton émis pour une autre application est refusé (`401`).
- La liaison à un compte existant n'a lieu que si le fournisseur garantit l'adresse (`email_verified`). Une adresse non vérifiée n'est jamais enregistrée.
- Une adresse déjà liée à un autre fournisseur renvoie `409`, sans fusion silencieuse.
- Les secrets (Facebook App Secret, JWT) ne quittent jamais l'API. Les identifiants passés au client sont publics par nature.
