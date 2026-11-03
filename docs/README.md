# Documentation de Chess Platform

| Document | Pour qui | Contenu |
|---|---|---|
| [Guide utilisateur](user-guide.md) | joueurs | comptes, IA, parties en ligne, analyse, profil, paramètres, FAQ |
| [Architecture](architecture.md) | développeurs | composants, modules NestJS, diagrammes de classes, de séquence, d'états et de déploiement, décisions |
| [Base de données](database.md) | développeurs | modèle entité-association, dictionnaire des tables, énumérations, clés Redis |
| [API REST](api-rest-spec.md) | développeurs client | toutes les routes, corps, réponses et erreurs |
| [Événements WebSocket](websocket-events.md) | développeurs client | namespaces `/game` et `/lobby`, règles d'autorisation |
| [Tests](testing.md) | développeurs | tests unitaires, end-to-end, Flutter, chart Helm |
| [Déploiement](deployment.md) | exploitation | Docker Compose, Kubernetes (Helm), supervision, CI/CD |
| [Déploiement VPS](deploiement-vps.md) | exploitation | Droplet DigitalOcean : Compose + Caddy (HTTPS), sauvegardes, mises à jour |
| [Connexion OAuth](oauth-setup.md) | exploitation | configurer Google, Apple, Facebook |
| [Notifications push](push-setup.md) | exploitation | configurer Firebase Cloud Messaging |

Les diagrammes sont écrits en Mermaid : GitHub les affiche directement. Pour les exporter en image : `npx @mermaid-js/mermaid-cli -i diagramme.mmd -o diagramme.svg`.
