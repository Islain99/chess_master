// ─────────────────────────────────────────────────────────────────────────────
// Sprint 20 — Tests de widgets : plateau, promotion, liste des coups,
// écrans de connexion et d'inscription
//
// Les écrans d'authentification utilisent un ApiClient sur un faux serveur
// HTTP (MockClient) : on vérifie ce qui est envoyé ET ce que voit l'utilisateur.
// Pas de ChessApp ni de AppTheme.theme : google_fonts téléchargerait des
// polices pendant le test.
// ─────────────────────────────────────────────────────────────────────────────
import 'dart:convert';

import 'package:chess_client/core/http/api_client.dart';
import 'package:chess_client/core/settings/board_theme.dart';
import 'package:chess_client/features/auth/providers/auth_provider.dart';
import 'package:chess_client/features/auth/screens/auth_error_messages.dart';
import 'package:chess_client/features/auth/screens/login_screen.dart';
import 'package:chess_client/features/auth/screens/register_screen.dart';
import 'package:chess_client/features/auth/services/oauth_service.dart';
import 'package:chess_client/features/board/models/board_position.dart';
import 'package:chess_client/features/board/models/chess_move.dart';
import 'package:chess_client/features/board/widgets/chess_board.dart';
import 'package:chess_client/features/board/widgets/chess_piece.dart';
import 'package:chess_client/features/board/widgets/chess_square.dart';
import 'package:chess_client/features/game/widgets/move_list_widget.dart';
import 'package:chess_client/features/notifications/services/push_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/// Case du plateau par son nom (« e2 »).
Finder squareNamed(String name) =>
    find.byWidgetPredicate((w) => w is ChessSquare && w.square == name);

ChessSquare squareWidget(WidgetTester tester, String name) =>
    tester.widget<ChessSquare>(squareNamed(name));

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  // ─── Plateau ───────────────────────────────────────────────────────────────
  group('ChessBoardWidget', () {
    Future<void> pumpBoard(
      WidgetTester tester, {
      String fen = _start,
      bool flipped = false,
      String? selected,
      Set<String> targets = const {},
      ChessMove? lastMove,
      String? inCheck,
      void Function(String)? onTap,
      void Function(String, String)? onDrop,
      BoardTheme? theme,
    }) async {
      await tester.pumpWidget(ProviderScope(
        child: MaterialApp(
          home: Scaffold(
            body: Center(
              child: SizedBox(
                width: 400,
                height: 400,
                child: ChessBoardWidget(
                  position: BoardPosition.fromFen(fen),
                  flipped: flipped,
                  selectedSquare: selected,
                  legalTargets: targets,
                  lastMove: lastMove,
                  inCheckSquare: inCheck,
                  onSquareTap: onTap ?? (_) {},
                  onPieceDrop: onDrop ?? (_, __) {},
                  boardTheme: theme,
                ),
              ),
            ),
          ),
        ),
      ));
      await tester.pump(); // réglages chargés (SharedPreferences, asynchrone)
    }

    testWidgets('64 cases, 32 pièces dans la position initiale', (tester) async {
      await pumpBoard(tester);
      expect(find.byType(ChessSquare), findsNWidgets(64));
      expect(find.byType(ChessPieceWidget), findsNWidgets(32));
      expect(squareWidget(tester, 'e1').pieceCode, 'wK');
      expect(squareWidget(tester, 'd8').pieceCode, 'bQ');
      expect(squareWidget(tester, 'e4').pieceCode, isNull);
    });

    testWidgets('pièces et points de coup légal centrés dans leur case (polissage)', (tester) async {
      await pumpBoard(tester, selected: 'e2', targets: {'e3', 'e4'});
      void expectCentered(Finder inner, String square) {
        final got = tester.getCenter(inner);
        final want = tester.getCenter(squareNamed(square));
        expect((got - want).distance, lessThan(0.5), reason: 'décalé dans $square');
      }

      // Pièce (blanc et noir)
      expectCentered(find.descendant(of: squareNamed('e2'), matching: find.byType(ChessPieceWidget)), 'e2');
      expectCentered(find.descendant(of: squareNamed('g8'), matching: find.byType(ChessPieceWidget)), 'g8');

      // Point de coup légal (case vide) : avant, collé dans le coin supérieur gauche
      final dot = find.descendant(
        of: squareNamed('e4'),
        matching: find.byWidgetPredicate((w) =>
            w is Container &&
            w.decoration is BoxDecoration &&
            (w.decoration! as BoxDecoration).shape == BoxShape.circle),
      );
      expect(dot, findsOneWidget);
      expectCentered(dot, 'e4');
    });

    testWidgets('couleurs des cases : a1 foncée, h1 et a8 claires (sprint 20)', (tester) async {
      await pumpBoard(tester);
      expect(squareWidget(tester, 'a1').isLight, isFalse);
      expect(squareWidget(tester, 'h1').isLight, isTrue);
      expect(squareWidget(tester, 'a8').isLight, isTrue);
      expect(squareWidget(tester, 'e4').isLight, isTrue);
      expect(squareWidget(tester, 'd4').isLight, isFalse);
    });

    test('isLightSquare : damier complet, 32 cases claires', () {
      final squares = [
        for (final f in 'abcdefgh'.split('')) for (var r = 1; r <= 8; r++) '$f$r',
      ];
      expect(squares.where(ChessBoardWidget.isLightSquare), hasLength(32));
      expect(ChessBoardWidget.isLightSquare('h8'), isFalse);
    });

    testWidgets('thème du plateau choisi dans les Paramètres appliqué (sprint 20)', (tester) async {
      SharedPreferences.setMockInitialValues({'board_theme': 'Bleu'});
      await pumpBoard(tester);
      expect(squareWidget(tester, 'a1').boardTheme.name, 'Bleu');

      // Un thème imposé (aperçu) prime sur le réglage
      await pumpBoard(tester, theme: BoardTheme.green);
      expect(squareWidget(tester, 'a1').boardTheme.name, 'Vert');
    });

    testWidgets('réglages : coordonnées et coups légaux masquables (sprint 20)', (tester) async {
      SharedPreferences.setMockInitialValues({'show_coords': false, 'show_legal': false});
      await pumpBoard(tester, targets: {'e3', 'e4'});

      expect(find.text('a'), findsNothing);
      expect(find.text('1'), findsNothing);
      expect(squareWidget(tester, 'e4').isLegalTarget, isFalse);
    });

    testWidgets('orientation : blancs en bas, plateau retourné pour les noirs', (tester) async {
      await pumpBoard(tester);
      final a1 = tester.getCenter(squareNamed('a1'));
      final h8 = tester.getCenter(squareNamed('h8'));
      expect(a1.dy, greaterThan(h8.dy)); // a1 en bas
      expect(a1.dx, lessThan(h8.dx)); // a1 à gauche

      await pumpBoard(tester, flipped: true);
      final a1f = tester.getCenter(squareNamed('a1'));
      final h8f = tester.getCenter(squareNamed('h8'));
      expect(a1f.dy, lessThan(h8f.dy)); // a1 en haut
      expect(a1f.dx, greaterThan(h8f.dx)); // a1 à droite
    });

    testWidgets('coordonnées : 8 chiffres et 8 lettres sur les bords', (tester) async {
      await pumpBoard(tester);
      for (final label in ['1', '8', 'a', 'h']) {
        expect(find.text(label), findsOneWidget, reason: 'étiquette $label');
      }
      expect(squareWidget(tester, 'a1').rankLabel, '1');
      expect(squareWidget(tester, 'a1').fileLabel, 'a');
      expect(squareWidget(tester, 'e4').rankLabel, isNull);
    });

    testWidgets('toucher une case remonte son nom', (tester) async {
      final taps = <String>[];
      await pumpBoard(tester, onTap: taps.add);

      await tester.tap(squareNamed('e2'));
      await tester.tap(squareNamed('e4'));

      expect(taps, ['e2', 'e4']);
    });

    testWidgets('sélection, cibles légales, dernier coup et échec transmis aux cases', (tester) async {
      await pumpBoard(
        tester,
        selected: 'g1',
        targets: {'f3', 'h3'},
        lastMove: const ChessMove(ply: 1, san: 'e4', uci: 'e2e4', fenAfter: _start),
        inCheck: 'e8',
      );
      expect(squareWidget(tester, 'g1').isSelected, isTrue);
      expect(squareWidget(tester, 'f3').isLegalTarget, isTrue);
      expect(squareWidget(tester, 'h3').isLegalTarget, isTrue);
      expect(squareWidget(tester, 'e3').isLegalTarget, isFalse);
      expect(squareWidget(tester, 'e2').isLastMoveSrc, isTrue);
      expect(squareWidget(tester, 'e4').isLastMoveDst, isTrue);
      expect(squareWidget(tester, 'e8').isInCheck, isTrue);
    });

    testWidgets('glisser-déposer une pièce : (départ, arrivée)', (tester) async {
      String? from;
      String? to;
      await pumpBoard(tester, onDrop: (f, t) {
        from = f;
        to = t;
      });

      final start = tester.getCenter(squareNamed('e2'));
      final end = tester.getCenter(squareNamed('e4'));
      final gesture = await tester.startGesture(start);
      await tester.pump();
      await gesture.moveTo(Offset.lerp(start, end, 0.5)!);
      await tester.pump();
      await gesture.moveTo(end);
      await tester.pump();
      await gesture.up();
      await tester.pumpAndSettle();

      expect(from, 'e2');
      expect(to, 'e4');
    });
  });

  // ─── Promotion ─────────────────────────────────────────────────────────────
  group('PromotionDialog', () {
    Future<String?> choose(WidgetTester tester, String color, String piece) async {
      String? picked;
      // Polissage : les choix utilisent ChessPieceWidget (style des réglages),
      // qui lit les Paramètres → ProviderScope requis.
      await tester.pumpWidget(ProviderScope(child: MaterialApp(
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () => showDialog<void>(
              context: context,
              builder: (_) => PromotionDialog(color: color, onSelect: (p) => picked = p),
            ),
            child: const Text('ouvrir'),
          ),
        ),
      )));
      await tester.tap(find.text('ouvrir'));
      await tester.pumpAndSettle();
      expect(find.text('Promotion'), findsOneWidget);

      expect(find.byType(ChessPieceWidget), findsNWidgets(4));
      await tester.tap(find.byKey(ValueKey('promotion-$piece')));
      await tester.pumpAndSettle();
      expect(find.text('Promotion'), findsNothing); // fermé après le choix
      return picked;
    }

    testWidgets('blancs : dame → « q »', (tester) async {
      expect(await choose(tester, 'w', 'q'), 'q');
    });

    testWidgets('noirs : cavalier → « n »', (tester) async {
      expect(await choose(tester, 'b', 'n'), 'n');
    });
  });

  // ─── Liste des coups ───────────────────────────────────────────────────────
  group('MoveListWidget', () {
    ChessMove m(int ply, String san) => ChessMove(ply: ply, san: san, uci: 'a2a3', fenAfter: _start);

    Future<void> pumpMoves(WidgetTester tester, List<ChessMove> moves) => tester.pumpWidget(
          MaterialApp(home: Scaffold(body: MoveListWidget(moves: moves))),
        );

    testWidgets('aucun coup : rien n\'est affiché', (tester) async {
      await pumpMoves(tester, const []);
      expect(find.byType(ListView), findsNothing);
    });

    testWidgets('coups groupés par paires numérotées', (tester) async {
      await pumpMoves(tester, [m(1, 'e4'), m(2, 'e5'), m(3, 'Nf3')]);
      expect(find.text('1.'), findsOneWidget);
      expect(find.text('2.'), findsOneWidget);
      expect(find.text('3.'), findsNothing);
      for (final san in ['e4', 'e5', 'Nf3']) {
        expect(find.text(san), findsOneWidget);
      }
    });

    testWidgets('le dernier coup est mis en valeur (gras)', (tester) async {
      await pumpMoves(tester, [m(1, 'e4'), m(2, 'e5')]);
      final last = tester.widget<Text>(find.text('e5'));
      final previous = tester.widget<Text>(find.text('e4'));
      expect(last.style?.fontWeight, FontWeight.w600);
      expect(previous.style?.fontWeight, FontWeight.w400);
    });
  });

  // ─── Messages d'erreur (sprint 20) ─────────────────────────────────────────
  group('messages d\'erreur d\'authentification', () {
    ApiException api(int status, String message) =>
        ApiException(statusCode: status, error: 'E', message: message);

    test('connexion', () {
      expect(loginErrorMessage(api(401, 'Identifiants invalides.')), contains('Identifiants invalides'));
      expect(loginErrorMessage(api(401, 'Ce compte est désactivé.')), 'Ce compte est désactivé.');
      expect(loginErrorMessage(api(429, '')), contains('Trop de tentatives'));
      expect(loginErrorMessage(Exception('SocketException')), unreachableMessage);
    });

    test('inscription : message précis du serveur pour 400 / 409', () {
      expect(registerErrorMessage(api(409, 'Cette adresse e-mail est déjà utilisée.')),
          'Cette adresse e-mail est déjà utilisée.');
      expect(registerErrorMessage(api(400, 'Adresse e-mail invalide.')), 'Adresse e-mail invalide.');
      expect(registerErrorMessage(api(500, 'boom')), contains('500'));
    });

    test('ApiClient.session : jeton de la session lu à chaque requête (polissage)', () async {
      final seen = <String?>[];
      final client = ApiClient.session(
        client: MockClient((req) async {
          seen.add(req.headers['Authorization']);
          return http.Response('{}', 200);
        }),
      );
      addTearDown(() => SessionToken.current = null);

      SessionToken.current = null;
      await client.get('/x');
      SessionToken.current = 'jeton-1';
      await client.get('/x');
      SessionToken.current = 'jeton-2'; // renouvellement : même instance, nouveau jeton
      await client.get('/x');

      expect(seen, [null, 'Bearer jeton-1', 'Bearer jeton-2']);
    });

    test('ApiClient : liste de messages de validation jointe ligne par ligne', () async {
      final client = ApiClient(
        client: MockClient((_) async => http.Response(
              jsonEncode({'statusCode': 400, 'error': 'Bad Request', 'message': ['a invalide', 'b trop court']}),
              400,
            )),
      );
      await expectLater(
        client.post('/auth/register', {}),
        throwsA(isA<ApiException>().having((e) => e.message, 'message', 'a invalide\nb trop court')),
      );
    });
  });

  // ─── Écrans d'authentification ─────────────────────────────────────────────
  group('écrans de connexion et d\'inscription', () {
    late List<http.Request> requests;

    /// Faux serveur : réponses par chemin (« /auth/login » → (statut, corps)).
    MockClient server(Map<String, (int, Map<String, dynamic>)> routes) => MockClient((req) async {
          requests.add(req);
          final match = routes.entries.where((e) => req.url.path.endsWith(e.key));
          if (match.isEmpty) return http.Response('{"message":"inconnu"}', 404);
          final (status, body) = match.first.value;
          return http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});
        });

    final tokens = {
      'accessToken': 'jwt-acces',
      'refreshToken': 'jeton-refresh',
      'expiresIn': 900,
      'user': {'id': 'u-1', 'email': 'alice@test.io', 'displayName': 'Alice', 'role': 'PLAYER'},
    };

    /// Monte l'écran au-dessus d'une page d'accueil (l'écran se ferme en cas de succès).
    Future<void> pumpScreen(WidgetTester tester, Widget screen, MockClient client) async {
      requests = [];
      await tester.pumpWidget(ProviderScope(
        overrides: [
          rawApiClientProvider.overrideWithValue(ApiClient(client: client)),
          oauthServiceProvider.overrideWithValue(OAuthService(platform: TargetPlatform.linux, isWeb: false)),
          pushServiceProvider.overrideWithValue(PushService(platform: TargetPlatform.linux, isWeb: false)),
        ],
        child: MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () => Navigator.push(context, MaterialPageRoute<void>(builder: (_) => screen)),
                child: const Text('accueil'),
              ),
            ),
          ),
        ),
      ));
      await tester.tap(find.text('accueil'));
      await tester.pumpAndSettle();
    }

    Future<void> fill(WidgetTester tester, String label, String value) =>
        tester.enterText(find.widgetWithText(TextField, label), value);

    testWidgets('connexion : champs vides → message, aucune requête', (tester) async {
      await pumpScreen(tester, const LoginScreen(), server({}));

      await tester.tap(find.text('Se connecter'));
      await tester.pump();

      expect(find.text('Veuillez remplir tous les champs.'), findsOneWidget);
      expect(requests, isEmpty);
    });

    testWidgets('connexion : identifiants refusés → message, l\'écran reste ouvert', (tester) async {
      await pumpScreen(
        tester,
        const LoginScreen(),
        server({'/auth/login': (401, {'statusCode': 401, 'message': 'Identifiants invalides.'})}),
      );
      await fill(tester, 'E-mail', 'alice@test.io');
      await fill(tester, 'Mot de passe', 'mauvais');
      await tester.tap(find.text('Se connecter'));
      await tester.pumpAndSettle();

      expect(find.textContaining('Identifiants invalides'), findsOneWidget);
      expect(find.byType(LoginScreen), findsOneWidget);
    });

    testWidgets('connexion réussie : e-mail nettoyé envoyé, callback, écran fermé', (tester) async {
      var success = 0;
      await pumpScreen(
        tester,
        LoginScreen(onSuccess: () => success++),
        server({'/auth/login': (200, tokens)}),
      );
      await fill(tester, 'E-mail', '  alice@test.io ');
      await fill(tester, 'Mot de passe', 'motdepasse');
      await tester.tap(find.text('Se connecter'));
      await tester.pumpAndSettle();

      final login = requests.singleWhere((r) => r.url.path.endsWith('/auth/login'));
      expect(jsonDecode(login.body), {'email': 'alice@test.io', 'password': 'motdepasse'});
      expect(success, 1);
      expect(find.byType(LoginScreen), findsNothing);

      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('access_token'), 'jwt-acces');
    });

    testWidgets('connexion : afficher / masquer le mot de passe', (tester) async {
      await pumpScreen(tester, const LoginScreen(), server({}));
      EditableText field() => tester.widget<EditableText>(
            find.descendant(of: find.widgetWithText(TextField, 'Mot de passe'), matching: find.byType(EditableText)),
          );

      expect(field().obscureText, isTrue);
      await tester.tap(find.byIcon(Icons.visibility));
      await tester.pump();
      expect(field().obscureText, isFalse);
    });

    testWidgets('inscription : règles vérifiées avant l\'envoi', (tester) async {
      await pumpScreen(tester, const RegisterScreen(), server({}));
      Future<void> submit() async {
        await tester.ensureVisible(find.text('Créer mon compte'));
        await tester.tap(find.text('Créer mon compte'));
        await tester.pump();
      }

      await submit();
      expect(find.text('Tous les champs sont obligatoires.'), findsOneWidget);

      await fill(tester, 'Nom d\'affichage', 'A');
      await fill(tester, 'E-mail', 'alice@test.io');
      await fill(tester, 'Mot de passe', 'motdepasse');
      await fill(tester, 'Confirmer le mot de passe', 'motdepasse');
      await submit();
      expect(find.textContaining('entre 2 et 32 caractères'), findsOneWidget);

      await fill(tester, 'Nom d\'affichage', 'Alice');
      await fill(tester, 'Mot de passe', 'court');
      await submit();
      expect(find.textContaining('au moins 8 caractères'), findsOneWidget);

      await fill(tester, 'Mot de passe', 'motdepasse');
      await fill(tester, 'Confirmer le mot de passe', 'autrechose');
      await submit();
      expect(find.text('Les mots de passe ne correspondent pas.'), findsOneWidget);

      expect(requests, isEmpty);
    });

    testWidgets('inscription : adresse déjà utilisée → message exact du serveur', (tester) async {
      await pumpScreen(
        tester,
        const RegisterScreen(),
        server({'/auth/register': (409, {'statusCode': 409, 'message': 'Cette adresse e-mail est déjà utilisée.'})}),
      );
      await fill(tester, 'Nom d\'affichage', 'Alice');
      await fill(tester, 'E-mail', 'alice@test.io');
      await fill(tester, 'Mot de passe', 'motdepasse');
      await fill(tester, 'Confirmer le mot de passe', 'motdepasse');
      await tester.ensureVisible(find.text('Créer mon compte'));
      await tester.tap(find.text('Créer mon compte'));
      await tester.pumpAndSettle();

      expect(find.text('Cette adresse e-mail est déjà utilisée.'), findsOneWidget);
      final body = jsonDecode(requests.single.body) as Map<String, dynamic>;
      expect(body, {'email': 'alice@test.io', 'password': 'motdepasse', 'displayName': 'Alice'});
    });
  });
}
