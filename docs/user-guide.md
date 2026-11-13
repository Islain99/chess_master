# Guide utilisateur — Chess Platform

> Sprint 21. Ce guide s'adresse aux joueurs. Pour installer ou héberger la plateforme, voir [deployment.md](deployment.md).

Chess Platform est un jeu d'échecs disponible sur le **Web**, **Android**, **iOS**, **Windows**, **macOS** et **Linux**. On peut y jouer seul contre l'ordinateur, à deux sur le même appareil, ou en ligne contre d'autres joueurs, puis revoir et analyser ses parties.

---

## 1. Démarrer

### Écran d'accueil

| Carte | Ce qu'elle fait | Compte requis |
|---|---|---|
| ⚔️ **Partie locale** | deux joueurs sur le même appareil | non |
| 🤖 **Contre l'IA** | cinq niveaux, jusqu'à Stockfish | non |
| 🔍 **Matchmaking classé** | un adversaire de votre niveau, partie classée Elo | **oui** |
| 🌐 **Salle privée** | jouer avec un ami grâce à un code | conseillé |
| 📂 **Importer FEN / PGN** | reprendre une position ou une partie | non |

En bas de l'écran : **Mes parties**, **Classement**, **Notifications**, et l'accès au **profil** et aux **paramètres**. Si une partie locale ou contre l'IA a été interrompue, la carte **Reprendre la partie** apparaît.

### Installer sur iPhone ou iPad

Il n'y a pas encore d'application dans l'App Store : Chess master s'installe depuis Safari et fonctionne ensuite comme une application.

1. Ouvrez le site dans **Safari**.
2. Touchez **Partager** (le carré avec une flèche vers le haut), puis **Sur l'écran d'accueil**.
3. Ouvrez Chess master depuis sa nouvelle icône : il s'affiche en plein écran.
4. Connectez-vous, puis touchez **Activer** sur la carte « Être prévenu quand c'est votre tour ».

Les notifications demandent iOS 16.4 ou plus récent et ne fonctionnent que depuis l'icône de l'écran d'accueil, pas dans un onglet Safari.

Sur Android, utilisez l'application (APK) ; sur ordinateur, le site suffit.

### Créer un compte

Un compte permet de jouer des parties classées, de garder son historique et de recevoir des notifications.

1. Touchez **Connexion**, puis **Créer un compte**.
2. Saisissez un **nom d'affichage** (2 à 32 caractères), votre **e-mail** et un **mot de passe** (8 caractères minimum), puis confirmez-le.
3. Touchez **Créer mon compte**.

L'adresse e-mail n'est pas sensible à la casse : `Alice@Mail.com` et `alice@mail.com` désignent le même compte.

**Connexion Google, Apple ou Facebook** : sur l'écran de connexion, touchez **Continuer avec…**. Les boutons proposés dépendent de l'appareil et de la configuration du serveur. Si l'adresse fournie par le service correspond à un compte existant, les deux sont reliés : vous pouvez ensuite utiliser l'un ou l'autre moyen de connexion.

La session reste ouverte : l'application renouvelle votre connexion en arrière-plan. **Se déconnecter** se trouve dans le profil.

> **Sécurité** — si quelqu'un réutilise une ancienne copie de votre session, toutes vos sessions sont fermées par précaution : reconnectez-vous simplement.

---

## 2. Jouer un coup

- **Toucher-toucher** : touchez une pièce, les cases accessibles sont marquées d'un point (ou d'un anneau pour une prise), puis touchez la case d'arrivée.
- **Glisser-déposer** : faites glisser la pièce vers sa case.
- **Promotion** : quand un pion atteint la dernière rangée, choisissez dame, tour, fou ou cavalier.
- Le dernier coup joué est surligné ; un roi en échec apparaît en rouge.
- Le bouton ⇅ (**Retourner**) change l'orientation du plateau.

Toutes les règles sont appliquées : roque, prise en passant, promotion, pat, triple répétition, règle des 50 coups, matériel insuffisant.

---

## 3. Contre l'IA

Choisissez un **niveau** et une **cadence** puis lancez la partie. Vous jouez les blancs.

| Niveau | Nom | Style de jeu |
|---|---|---|
| 1 | Débutant | coups au hasard — pour apprendre sans pression |
| 2 | Facile | calcule 2 demi-coups : capture et évite de perdre des pièces |
| 3 | Intermédiaire | calcule 4 demi-coups : tactique et placement des pièces |
| 4 | Avancé | recherche approfondie (1,5 s par coup) : planifie |
| 5 | Expert | **Stockfish**, avec un **Elo cible** réglable de 800 à 3000 |

Si le moteur Stockfish est momentanément indisponible, l'IA joue au niveau 4 sans interrompre la partie.

| Cadence | Temps par joueur |
|---|---|
| ⚡ Bullet | 1 min |
| 🔥 Blitz | 5 min |
| ⏱ Rapide | 10 min |
| 🕰 Classique | 30 min |

Contre l'IA, il n'y a ni annulation de coup ni proposition de nulle. **Abandon** reste possible.

---

## 4. Partie locale

Deux joueurs se partagent l'appareil. Touchez **Partie locale** (ou **Partie locale rapide**).

- ↶ **Annuler** reprend le dernier coup.
- **½ Nulle** : nulle immédiate si les deux joueurs l'acceptent.
- **Abandon** : le camp dont c'est le tour abandonne.

Si vous êtes connecté, la partie figure dans **Mes parties** (résultat affiché 1-0, 0-1 ou ½-½).

---

## 5. Jouer en ligne

### Matchmaking classé

1. Touchez **Matchmaking classé** (connexion requise), choisissez une cadence, puis **Chercher un adversaire**.
2. Le serveur cherche un joueur dans une plage de **±300 Elo**, élargie de 100 points toutes les 30 secondes d'attente (la plage actuelle est affichée).
3. Dès qu'un adversaire est trouvé, la partie s'ouvre ; les couleurs sont tirées au sort.

**Annuler la recherche** vous retire de la file. Fermer l'application vous en retire aussi.

### Salle privée

- **Créer une salle (Rapide 10 min)** : un code de 6 caractères s'affiche. **Copiez-le** et envoyez-le à votre ami, puis attendez sur l'écran : la partie démarre dès son arrivée. Vous jouez les blancs.
- **Rejoindre la salle** : saisissez le code reçu (majuscules ou minuscules). Un code ne sert qu'une fois.

### Règles des parties en ligne

| Situation | Ce qui se passe |
|---|---|
| Pendule | mesurée par le serveur, du coup précédent à votre coup — la latence de votre réseau ne vous fait pas gagner de temps |
| Temps écoulé | la partie est perdue au temps au coup suivant ou à la reconnexion |
| Proposer la nulle | **½ Nulle** → l'adversaire accepte ou refuse ; jouer un coup annule la proposition |
| Abandon | **Abandon** → votre adversaire gagne |
| Déconnexion | l'adversaire voit « Adversaire déconnecté — 30 s avant forfait ». Revenez dans les 30 s et la partie continue ; au-delà, elle est perdue par **forfait** |
| Plusieurs appareils | ouvrir la même partie sur un second appareil est possible : tant qu'un appareil reste connecté, vous n'êtes pas considéré comme absent |
| Spectateurs | toute personne qui ouvre la partie peut la suivre, sans pouvoir y jouer |

### Elo

Chaque cadence a son propre classement, qui commence à **1200**. Après chaque partie classée (mat, abandon, nulle, temps, forfait), votre Elo évolue selon le résultat et le niveau de l'adversaire : battre plus fort que soi rapporte plus de points. Les 30 premières parties d'une cadence comptent double (K = 40) pour vous placer rapidement.

Le **Classement** présente les meilleurs joueurs de chaque cadence (onglets Bullet, Blitz, Rapide, Classique).

---

## 6. Revoir et analyser une partie

À la fin d'une partie, touchez **Revoir et analyser** (ou ouvrez une partie depuis **Mes parties**).

- **Lecteur** : avancez ou reculez coup par coup, ou touchez un coup de la liste pour y aller directement.
- **Analyser avec Stockfish** : le serveur analyse chaque coup de la partie (quelques dizaines de secondes, la progression est affichée).
- **Graphique d'évaluation** : l'avantage blanc / noir au fil de la partie ; touchez le graphique pour aller au coup correspondant.
- **Précision** des blancs et des noirs, de 0 à 100 %.
- **Classification de chaque coup**, selon la probabilité de gain perdue :

| Étiquette affichée | Signification |
|---|---|
| Théorie | coup d'ouverture (8 premiers demi-coups) |
| Meilleur coup | le coup que Stockfish aurait joué |
| Bon | ne change pas l'issue de la partie |
| Imprécision ?! | perd au moins 10 points de probabilité de gain |
| Erreur ? | perd au moins 20 points |
| Gaffe ?? | perd au moins 30 points |

- **Copier le PGN** : la partie au format standard, à coller dans un autre logiciel d'échecs.

### Mes parties

L'historique de vos parties en deux onglets, **En cours** et **Terminées**, de la plus récente à la plus ancienne : adversaire (joueur ou niveau d'IA), couleur et résultat. Touchez une partie en cours pour la reprendre, une partie terminée pour la revoir.

### Importer une partie

**Importer FEN / PGN** accepte :

- une **position FEN** (`Charger la position`) — pour étudier une position ou la jouer à deux ;
- une **partie PGN** (`Importer le PGN`) — pour la rejouer dans le lecteur.

---

## 7. Profil

**Mon profil** affiche :

- vos **statistiques** des parties classées : parties, victoires, nulles, défaites, taux de victoire, **meilleure série** de victoires ;
- votre **Elo** dans chaque cadence ;
- **Choisir un avatar** : une pièce et une couleur ; sinon l'initiale de votre nom s'affiche ;
- votre **nom d'affichage** et votre **pays** (drapeau à côté de votre nom), modifiables.

Votre adresse e-mail n'est jamais montrée aux autres joueurs.

### Supprimer mon compte

En bas du profil, **Supprimer mon compte**, puis tapez **SUPPRIMER** (et votre mot de passe si vous vous connectez par courriel). La suppression est **définitive** : profil, classements, statistiques et notifications sont effacés. Vos parties en ligne en cours sont annulées, sans effet sur l'Elo de votre adversaire. Vos parties terminées restent dans l'historique de vos adversaires, sous le nom « Compte supprimé ».

---

## 8. Notifications

L'application vous prévient quand :

- c'est **à vous de jouer** dans une partie en ligne que vous n'avez pas à l'écran ;
- une partie en ligne **se termine** ;
- un **adversaire rejoint votre salle privée**.

Elles apparaissent dans **Notifications** (badge du nombre de non-lues, **Tout lire**) et, si vous les activez (bouton **Activer** de l'accueil ou de l'écran Notifications), en **notification push** sur Android, iOS, macOS et le Web — même application fermée. Toucher une notification (dans la liste ou en push) ouvre la partie concernée : la partie en cours, ou le lecteur si elle est terminée.

---

## 9. Paramètres

| Réglage | Effet |
|---|---|
| **Plateau** | thème des cases : Classique, Bleu, Vert, Violet, Gris |
| **Pièces** | Classique, Contrasté, Contour, Lettres (R D T F C P : roi, dame, tour, fou, cavalier, pion — utile en cas de basse vision) |
| Afficher les coordonnées | lettres a-h et chiffres 1-8 sur les bords du plateau |
| Afficher les coups légaux | points sur les cases accessibles à la pièce sélectionnée |
| Animer les coups | la pièce glisse de sa case de départ à sa case d'arrivée (coups de l'adversaire, de l'IA, du lecteur) |
| Retourner le plateau à chaque coup (partie locale) | le plateau se tourne vers le camp qui doit jouer ; le bouton **Retourner** inverse ce sens |
| Effets sonores | son du coup, de la prise et de l'échec ; son à l'arrivée d'une notification (sur le Web, après un premier clic sur la page) |

Les réglages sont enregistrés sur l'appareil.

---

## 10. Questions fréquentes

**Je ne trouve pas d'adversaire.** La plage Elo s'élargit avec l'attente ; aux heures creuses, essayez une autre cadence ou invitez un ami en salle privée.

**« Code invalide ou salle complète ».** Le code a déjà servi ou la partie est terminée : demandez un nouveau code.

**Ma connexion a coupé pendant une partie en ligne.** Rouvrez l'application dans les 30 secondes : la partie reprend là où elle en était.

**« Identifiants invalides ».** Vérifiez l'adresse et le mot de passe. Si vous vous êtes inscrit avec Google, Apple ou Facebook, utilisez le même bouton.

**« Ce compte est désactivé ».** Le compte a été suspendu : contactez l'administrateur de la plateforme.

**« Serveur injoignable ».** Vérifiez votre connexion Internet ; le serveur peut aussi être en maintenance.

**Je ne reçois pas de notifications push.** Autorisez les notifications pour l'application dans les réglages de l'appareil (ou du navigateur), puis reconnectez-vous. Sur le Web, elles nécessitent une adresse HTTPS.

**Pourquoi l'IA ne me laisse pas annuler un coup ?** L'annulation n'existe qu'en partie locale, pour éviter de rejouer indéfiniment contre l'ordinateur.

**Mes parties contre l'IA comptent-elles pour l'Elo ?** Non : seules les parties du matchmaking classé modifient l'Elo et les statistiques.
