// Sprint 15 — Bouton Google officiel (Web uniquement).
//
// Sur le Web, Google Identity Services interdit de déclencher la connexion
// depuis un bouton maison : il faut afficher le sien (renderButton). Le jeton
// est ensuite diffusé par OAuthService.googleWebCredentials().
//
// L'import conditionnel évite de compiler du code JavaScript (dart:js_interop)
// pour Android, iOS et desktop.
export 'google_web_button_stub.dart'
    if (dart.library.js_interop) 'google_web_button_web.dart';
