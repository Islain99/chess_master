// ─────────────────────────────────────────────────────────────────────────────
// Sprint 20 — Messages d'erreur des écrans de connexion et d'inscription
//
// Avant : un message fixe quelle que soit la cause (« e-mail peut-être déjà
// utilisé » même pour un nom trop court ou un serveur injoignable).
// ─────────────────────────────────────────────────────────────────────────────
import '../../../core/http/api_client.dart';

const unreachableMessage = 'Serveur injoignable. Vérifiez votre connexion et réessayez.';

/// Erreur de connexion → message affiché sous le formulaire.
String loginErrorMessage(Object? error) {
  if (error is ApiException) {
    // Compte désactivé : le serveur l'explique, on relaie son message.
    if (error.statusCode == 401 && error.message.contains('désactivé')) return error.message;
    if (error.statusCode == 401 || error.statusCode == 400) {
      return 'Identifiants invalides. Vérifiez votre e-mail et mot de passe.';
    }
    if (error.statusCode == 429) return 'Trop de tentatives. Patientez quelques secondes.';
    return 'Connexion impossible (erreur ${error.statusCode}).';
  }
  return unreachableMessage;
}

/// Erreur d'inscription → message affiché sous le formulaire.
String registerErrorMessage(Object? error) {
  if (error is ApiException) {
    // 400 (validation) et 409 (adresse déjà utilisée) : message précis du serveur
    if (error.statusCode == 400 || error.statusCode == 409) return error.message;
    if (error.statusCode == 429) return 'Trop de tentatives. Patientez quelques secondes.';
    return 'Inscription impossible (erreur ${error.statusCode}).';
  }
  return unreachableMessage;
}
