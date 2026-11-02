# Déploiement de Chess Platform

> Sprint 19 — chart Helm complet, supervision Prometheus / Grafana, API multi-réplicas.

Deux façons de faire tourner la plateforme :

| | Docker Compose | Kubernetes (Helm) |
|---|---|---|
| Usage | poste de développement, petite instance sur un seul serveur | production, montée en charge |
| Réplicas de l'API | 1 | 2 à 12 (autoscaling) |
| TLS | à ajouter (reverse proxy devant) | cert-manager automatique |
| Supervision | logs | Prometheus + Grafana + alertes |

---

## 1. Docker Compose

```bash
cd infra
echo "JWT_ACCESS_SECRET=$(openssl rand -hex 32)" > .env   # obligatoire
docker compose up --build -d
```

- Client Web : http://localhost:8080 — API : http://localhost:3000/api/v1
- Le service `migrate` crée / met à jour les tables (`prisma db push`) puis s'arrête ; l'API ne démarre qu'après lui.
- Sans `JWT_ACCESS_SECRET` (32 caractères minimum), **l'API refuse de démarrer** et l'explique dans `docker compose logs api` : le secret d'exemple permettait à n'importe qui de forger des jetons.
- Postgres (5432) et Redis (6379) ne sont publiés que sur `127.0.0.1`.
- OAuth, push, etc. : mêmes variables que `apps/api/.env.example`, à ajouter dans `infra/.env`.

---

## 2. Kubernetes avec Helm

### 2.1 Prérequis du cluster

| Composant | Rôle | Installation |
|---|---|---|
| ingress-nginx | entrée HTTP(S) + WebSocket | `helm install ingress-nginx ingress-nginx/ingress-nginx -n ingress-nginx --create-namespace` |
| cert-manager | certificats Let's Encrypt | `helm install cert-manager jetstack/cert-manager -n cert-manager --create-namespace --set crds.enabled=true` puis un `ClusterIssuer` nommé `letsencrypt-prod` |
| metrics-server | autoscaling (HPA) | souvent préinstallé (sinon `kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml`) |
| kube-prometheus-stack | Prometheus, Grafana, Alertmanager (facultatif) | voir § 2.6 |
| CNI avec NetworkPolicy | cloisonnement Postgres / Redis | Calico, Cilium… (sans eux, les NetworkPolicies sont ignorées sans erreur) |

Un DNS `chess.mondomaine.com` doit pointer vers l'IP publique de l'ingress.

### 2.2 Images

La CI publie trois images sur GHCR à chaque push sur `main` (`sha-<7 caractères>`, `latest`) et à chaque tag `vX.Y.Z` :

```
ghcr.io/<propriétaire en minuscules>/chess-api
ghcr.io/<propriétaire en minuscules>/chess-ai-engine
ghcr.io/<propriétaire en minuscules>/chess-client
```

- L'URL de l'API est **figée dans l'image du client** à la compilation : définir les variables de dépôt GitHub `CLIENT_API_URL=https://chess.mondomaine.com/api/v1` et `CLIENT_WS_URL=https://chess.mondomaine.com`.
- Les paquets GHCR sont privés par défaut : soit les rendre publics (GitHub → Packages → Settings), soit créer un secret de tirage et le déclarer :

```bash
kubectl -n chess create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io --docker-username=<utilisateur> --docker-password=<PAT read:packages>
# puis : --set 'global.imagePullSecrets[0].name=ghcr-pull'
```

### 2.3 Premier déploiement

```bash
cp infra/helm/chess-platform/values-production.example.yaml values-prod.yaml   # à adapter, hors Git
helm upgrade --install chess ./infra/helm/chess-platform \
  --namespace chess --create-namespace \
  -f values-prod.yaml \
  --set global.imageTag=v1.0.0 \
  --wait --timeout 10m
```

Ce que fait le chart :

```
                     ┌──────────── Ingress (TLS) ─────────────┐
                     │  /api, /socket.io        /             │
                     ▼                          ▼             │
              API ×2-12 (HPA)            client Web ×2        │
              │   │    │                                      │
              │   │    └──── HTTP ────► moteur IA ×2 (Stockfish, worker BullMQ)
              │   │                         │      │
              │   └────────► Redis ◄────────┘      │
              └────────────► PostgreSQL ◄──────────┘
                               ▲
                     Job « migrate » (prisma db push) à chaque installation / mise à jour
```

| Ressource | Détail |
|---|---|
| Secret `chess-secrets` | `JWT_ACCESS_SECRET`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `DATABASE_URL`, `REDIS_URL` (+ `FACEBOOK_APP_SECRET`, `FCM_SERVICE_ACCOUNT` si fournis). **Générés au premier déploiement puis conservés** d'une mise à jour à l'autre ; non supprimé par `helm uninstall`. |
| API | Deployment non-root, système de fichiers en lecture seule, HPA, PDB, sondes `/api/v1/health` (vivacité) et `/api/v1/health/ready` (base joignable), arrêt progressif. |
| Moteur IA | Deployment + Service interne (jamais exposé). |
| Client | Nginx non-root (port 8080). |
| PostgreSQL | StatefulSet + volume (20 Gi par défaut). |
| Redis | StatefulSet avec mot de passe, AOF, `noeviction` (exigé par BullMQ). |
| Job `migrate` | `prisma db push` après l'installation et **avant** chaque mise à jour. Un changement destructeur fait échouer la mise à jour au lieu de perdre des données. |
| NetworkPolicies | Postgres ← API, IA, migration ; Redis ← API, IA ; IA ← API, Prometheus. |

### 2.4 Secrets à fournir (facultatifs)

| Valeur | Quand |
|---|---|
| `secrets.jwtAccessSecret` | pour imposer / faire tourner le secret (≥ 32 caractères). Changer le secret déconnecte tous les joueurs. |
| `secrets.fcmServiceAccount` | notifications push : `--set-string secrets.fcmServiceAccount="$(base64 -w0 firebase-sa.json)"` |
| `secrets.facebookAppSecret` | connexion Facebook |
| `postgresql.enabled=false` + `secrets.databaseUrl` | base managée (RDS, Cloud SQL…) |
| `redis.enabled=false` + `secrets.redisUrl` | Redis managé (`rediss://` pour TLS) |
| `secrets.existingSecret` | Secret géré ailleurs (Vault, External Secrets…) : il doit contenir **toutes** les clés du tableau § 2.3. |

Les identifiants **publics** (OAuth client IDs, `APPLE_ANDROID_PACKAGE`) vont dans `api.env`. `CORS_ORIGIN` et `PUBLIC_WEB_URL` sont déduits de `ingress.host` s'ils sont vides.

Relire un secret généré : `kubectl -n chess get secret chess-secrets -o jsonpath='{.data.JWT_ACCESS_SECRET}' | base64 -d`

### 2.5 Plusieurs réplicas de l'API : ce qui a changé (sprint 19)

| Problème avec 2 pods ou plus | Correction |
|---|---|
| Deux joueurs sur des pods différents ne recevaient pas les coups de l'autre (rooms Socket.IO locales) | adaptateur Socket.IO Redis |
| Un joueur connecté sur l'autre pod était déclaré absent → forfait au bout de 30 s | présence calculée sur tout le cluster (`fetchSockets`) |
| Proposition de nulle invisible depuis l'autre pod | propositions stockées dans Redis (expiration 2 h) |
| Un joueur pouvait être apparié deux fois (vérifications périodiques simultanées sur chaque pod) | verrou Redis par joueur + revérification de la file |
| Limitation de débit : toutes les requêtes semblaient venir de l'ingress | `TRUST_PROXY=1` (IP réelle via `X-Forwarded-For`) |
| Mot de passe de `REDIS_URL` ignoré par BullMQ | URL complète analysée (mot de passe, base, `rediss://`) |

La limitation de débit HTTP reste **par pod** (10 req/s par IP et par pod) : suffisant contre les abus, sans coordination entre pods.

Le client Web utilise exclusivement le transport WebSocket : aucune affinité de session n'est nécessaire à l'ingress.

### 2.6 Supervision : Prometheus et Grafana

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace

helm upgrade chess ./infra/helm/chess-platform -n chess --reuse-values --set monitoring.enabled=true
```

Le chart crée alors :

- deux **ServiceMonitor** (API et moteur IA, `GET /metrics`, toutes les 30 s) ;
- une **PrometheusRule** : API injoignable, > 5 % d'erreurs 5xx, latence p95 > 1 s, > 10 % d'échecs de l'IA, analyses en échec, redémarrages en boucle ;
- un **tableau de bord Grafana** « Chess Platform » (importé automatiquement par le sidecar de kube-prometheus-stack).

Grafana : `kubectl -n monitoring port-forward svc/kube-prometheus-stack-grafana 3000:80` (identifiants dans le secret `kube-prometheus-stack-grafana`).

Si votre Prometheus n'a pas été installé avec le nom de release `kube-prometheus-stack`, adapter `monitoring.serviceMonitor.labels` et `monitoring.prometheusRule.labels` à son `serviceMonitorSelector` / `ruleSelector`.

Métriques exposées :

| Métrique | Type | Description |
|---|---|---|
| `chess_api_http_requests_total{method,route,status}` | compteur | requêtes HTTP (route = gabarit `/api/v1/games/:id`) |
| `chess_api_http_request_duration_seconds{method,route}` | histogramme | durée des requêtes |
| `chess_api_ws_connections{namespace}` | jauge | sockets ouverts sur le pod (`game`, `lobby`) |
| `chess_api_games_finished_total{reason}` | compteur | fins de partie en ligne (CHECKMATE, RESIGNATION, ABANDONED…) |
| `chess_api_push_notifications_total{result}` | compteur | envois FCM (`sent`, `invalid-token`, `failed`) |
| `chess_ai_bestmove_duration_seconds{result}` | histogramme | calcul d'un coup Stockfish (`ok` / `error`) |
| `chess_ai_analysis_jobs_total{result}` | compteur | analyses de parties (`completed` / `failed`) |
| `chess_ai_analysis_duration_seconds` | histogramme | durée d'une analyse complète |
| `chess_api_*`, `chess_ai_*` (process, nodejs) | divers | mémoire, CPU, boucle d'événements, GC |

`/metrics` n'est **pas** routé par l'ingress : il n'est lisible que depuis le cluster.

### 2.7 Mises à jour, retour arrière, désinstallation

```bash
helm upgrade chess ./infra/helm/chess-platform -n chess --reuse-values --set global.imageTag=v1.1.0 --wait
helm history chess -n chess
helm rollback chess <révision> -n chess --wait     # le schéma de base n'est PAS rétrogradé
helm uninstall chess -n chess                      # conserve le Secret et les volumes
```

Le volume Postgres (`data-chess-postgres-0`) survit à la désinstallation. Pour tout effacer : `kubectl -n chess delete pvc --all && kubectl -n chess delete secret chess-secrets`.

Sauvegarde ponctuelle de la base :

```bash
kubectl -n chess exec chess-postgres-0 -- pg_dump -U chess chess | gzip > chess-$(date +%F).sql.gz
```

### 2.8 Déploiement continu (GitHub Actions)

| Évènement | Résultat |
|---|---|
| Pull request | tests, lint, `helm lint`, build des images (sans push) |
| Push sur `main` | images `sha-<court>` + `latest` → déploiement **staging** (`chess-staging`) |
| Tag `vX.Y.Z` | images `vX.Y.Z` → déploiement **production** (`chess`) |

Secrets GitHub : `KUBE_CONFIG`, `KUBE_CONFIG_PROD` (kubeconfig en base64) ; facultatifs : `JWT_ACCESS_SECRET`, `JWT_ACCESS_SECRET_PROD` (≥ 32 caractères, sinon générés par le chart), `DATABASE_URL_PROD` (base managée), `FCM_SERVICE_ACCOUNT` (base64), `FACEBOOK_APP_SECRET`.
Variables GitHub : `STAGING_HOST`, `PRODUCTION_HOST`, `CLIENT_API_URL`, `CLIENT_WS_URL`.

> Les anciens secrets `DATABASE_URL`, `REDIS_URL`, `REDIS_URL_PROD` et `JWT_REFRESH_SECRET*` ne sont plus utilisés : la base et Redis sont fournis par le chart.

### 2.9 Dépannage

| Symptôme | Piste |
|---|---|
| Pods API en `CrashLoopBackOff`, log « Configuration de production invalide » | `secrets.jwtAccessSecret` trop court ou valeur d'exemple |
| `helm upgrade` échoue sur le Job `migrate` | `kubectl -n chess logs job/chess-migrate` — souvent un changement destructeur du schéma : à migrer à la main |
| `ImagePullBackOff` | nom du registre en minuscules ? paquet GHCR privé sans `imagePullSecrets` ? tag existant ? |
| Certificat absent | `kubectl -n chess describe certificate chess-tls` ; le `ClusterIssuer` existe-t-il ? |
| WebSocket coupé au bout de 60 s | ingress autre que NGINX : reproduire les délais `proxy-read-timeout` / `proxy-send-timeout` dans `ingress.annotations` |
| Pas de métriques dans Prometheus | `monitoring.serviceMonitor.labels` doit correspondre au `serviceMonitorSelector` de Prometheus |
