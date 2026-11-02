# Service IA (Stockfish)

Microservice NestJS qui expose :

- `POST /move` : meilleur coup Stockfish (niveau 5, Elo configurable) ;
- le worker BullMQ `analysis` : analyse post-partie coup par coup (erreurs, imprécisions, coups brillants).

## Schéma Prisma

La source de vérité est `apps/api/prisma/schema.prisma`. Le fichier `prisma/schema.prisma` d'ici en est une **copie** : l'image Docker est construite avec `apps/ai-engine` comme contexte et ne voit pas `apps/api`.

```bash
npm run prisma:sync   # recopie le schéma de l'API après une modification
npm run build         # « prebuild » échoue si les deux schémas divergent
```

Dans un build Docker, `apps/api` est absent : la vérification est alors ignorée.
