{{/* ───────────────────────────────────────────────────────────────────────
     Sprint 19 — Fonctions communes du chart
     ─────────────────────────────────────────────────────────────────────── */}}

{{/* Nom complet : <release>-chess, raccourci si la release contient déjà « chess ». */}}
{{- define "chess.fullname" -}}
{{- if contains "chess" .Release.Name -}}
{{- .Release.Name | trunc 50 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-chess" .Release.Name | trunc 50 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{/* Nom d'un composant : <fullname>-api, <fullname>-postgres… */}}
{{- define "chess.component" -}}
{{- printf "%s-%s" (include "chess.fullname" .root) .name -}}
{{- end -}}

{{/* Étiquettes de sélection (immuables : ne jamais y ajouter la version). */}}
{{- define "chess.selectorLabels" -}}
app.kubernetes.io/name: chess-platform
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .name }}
{{- end -}}

{{/* Étiquettes complètes, à poser sur toutes les ressources. */}}
{{- define "chess.labels" -}}
{{ include "chess.selectorLabels" . }}
app.kubernetes.io/version: {{ .root.Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .root.Chart.Name .root.Chart.Version }}
{{- end -}}

{{/* Image d'un composant applicatif : registre + dépôt + tag (global par défaut). */}}
{{- define "chess.image" -}}
{{- $tag := .image.tag | default .root.Values.global.imageTag -}}
{{- printf "%s%s:%s" .root.Values.global.imageRegistry .image.repository (toString $tag) -}}
{{- end -}}

{{/* Secret applicatif (créé par le chart ou fourni par l'utilisateur). */}}
{{- define "chess.secretName" -}}
{{- .Values.secrets.existingSecret | default (printf "%s-secrets" (include "chess.fullname" .)) -}}
{{- end -}}

{{/*
  Valeur d'un secret généré : 1) valeur fournie, 2) valeur déjà présente dans
  le Secret du cluster (conservée d'une mise à jour à l'autre), 3) aléatoire.
  Sans l'étape 2, chaque `helm upgrade` changerait le mot de passe Postgres
  (déjà initialisé) et le secret JWT (déconnectant tous les joueurs).
*/}}
{{- define "chess.persistentSecret" -}}
{{- $existing := lookup "v1" "Secret" .root.Release.Namespace (printf "%s-secrets" (include "chess.fullname" .root)) -}}
{{- if .value -}}
{{- .value -}}
{{- else if and $existing $existing.data (hasKey $existing.data .key) -}}
{{- index $existing.data .key | b64dec -}}
{{- else -}}
{{- randAlphaNum (int .length) -}}
{{- end -}}
{{- end -}}

{{/* Contexte de sécurité commun aux conteneurs applicatifs (non-root, lecture seule). */}}
{{- define "chess.containerSecurityContext" -}}
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities:
  drop: ["ALL"]
{{- end -}}

{{- define "chess.imagePullSecrets" -}}
{{- with .Values.global.imagePullSecrets }}
imagePullSecrets:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- end -}}

{{/* Sources autorisées d'une NetworkPolicy : pods des composants donnés. */}}
{{- define "chess.np.from" -}}
{{- range .components }}
- podSelector:
    matchLabels:
      app.kubernetes.io/instance: {{ $.root.Release.Name }}
      app.kubernetes.io/component: {{ . }}
{{- end }}
{{- end }}
