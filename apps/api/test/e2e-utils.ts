// ─────────────────────────────────────────────────────────────────────────────
// Sprint 20 — Outils des tests end-to-end
//
// L'application est démarrée EXACTEMENT comme en production (configureApp :
// préfixe, validation, filtre d'erreurs, Helmet, adaptateur Socket.IO Redis)
// et écoute sur un port réel : les tests passent par HTTP et par de vrais
// clients Socket.IO, comme l'application Flutter.
// ─────────────────────────────────────────────────────────────────────────────
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

export interface RunningApp {
  app: NestExpressApplication;
  /** http://127.0.0.1:<port> */
  url: string;
  /** Client HTTP supertest préfixé : api().get('/health') → /api/v1/health */
  api: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

/** Démarre une instance de l'API (appeler plusieurs fois = plusieurs « pods »). */
export async function startApp(): Promise<RunningApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  await configureApp(app);
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  const agent = request(url);
  return {
    app,
    url,
    api: () => agent,
    close: () => app.close(),
  };
}

/** Préfixe unique par exécution : les comptes de test ne se croisent jamais. */
export const RUN_ID = randomUUID().slice(0, 8);

export interface TestUser {
  id: string;
  email: string;
  password: string;
  displayName: string;
  accessToken: string;
  refreshToken: string;
}

let userCounter = 0;

/** Inscrit un nouveau compte et renvoie ses jetons. */
export async function registerUser(target: RunningApp, name = 'joueur'): Promise<TestUser> {
  userCounter += 1;
  const email = `${name}-${RUN_ID}-${userCounter}@e2e.test`;
  const password = 'motdepasse-e2e';
  const displayName = `${name}-${userCounter}`.slice(0, 32);
  const res = await target.api().post('/api/v1/auth/register').send({ email, password, displayName }).expect(201);
  return {
    id: res.body.user.id,
    email,
    password,
    displayName,
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
  };
}

export const bearer = (user: TestUser) => ({ Authorization: `Bearer ${user.accessToken}` });

// ─── Socket.IO ───────────────────────────────────────────────────────────────

const openSockets = new Set<Socket>();

/** Client Socket.IO connecté (transport WebSocket, comme le client Flutter). */
export async function connectSocket(
  target: RunningApp,
  namespace: '/game' | '/lobby',
  user?: TestUser,
): Promise<Socket> {
  const socket = io(`${target.url}${namespace}`, {
    transports: ['websocket'],
    auth: user ? { token: user.accessToken } : {},
    reconnection: false,
    forceNew: true,
  });
  openSockets.add(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  return socket;
}

/** Ferme tous les sockets ouverts par connectSocket (à appeler en afterEach / afterAll). */
export function closeSockets(): void {
  for (const s of openSockets) s.disconnect();
  openSockets.clear();
}

/**
 * Attend le prochain événement `event` (optionnellement filtré). Les
 * événements sont mémorisés dès l'appel : appeler waitFor AVANT de
 * déclencher l'action pour ne rien rater.
 */
export function waitFor<T = any>(
  socket: Socket,
  event: string,
  predicate: (payload: T) => boolean = () => true,
  timeoutMs = 8000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Délai dépassé en attendant « ${event} »`));
    }, timeoutMs);
    const handler = (payload: T) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

/** Vérifie qu'un événement n'arrive PAS pendant `ms`. */
export function expectNoEvent(socket: Socket, event: string, ms = 500): Promise<void> {
  return new Promise((resolve, reject) => {
    const handler = (payload: unknown) => {
      socket.off(event, handler);
      reject(new Error(`Événement inattendu « ${event} » : ${JSON.stringify(payload)}`));
    };
    socket.on(event, handler);
    setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, ms);
  });
}

/** Réessaie `check` jusqu'à ce qu'il ne lève plus (tâches asynchrones : Elo…). */
export async function eventually<T>(check: () => Promise<T>, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      return await check();
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw lastError;
}

/** « Mat de l'idiot » (Fool's mate) : les noirs matent au 2e coup. */
export const FOOLS_MATE = ['f2f3', 'e7e5', 'g2g4', 'd8h4'] as const;

// ─── Parties en temps réel ───────────────────────────────────────────────────

export interface Seat {
  user: TestUser;
  color: 'white' | 'black';
  lobby: Socket;
  game?: Socket;
}

/**
 * Inscrit deux joueurs dans la file (chacun sur l'instance donnée) et attend
 * lobby:matchFound des deux côtés. Renvoie les places triées blancs / noirs.
 */
export async function matchPlayers(
  a: { target: RunningApp; user: TestUser },
  b: { target: RunningApp; user: TestUser },
  timeControl = 'BLITZ',
): Promise<{ gameId: string; white: Seat; black: Seat; found: Record<string, any> }> {
  const [lobbyA, lobbyB] = await Promise.all([
    connectSocket(a.target, '/lobby', a.user),
    connectSocket(b.target, '/lobby', b.user),
  ]);
  const foundA = waitFor(lobbyA, 'lobby:matchFound');
  const foundB = waitFor(lobbyB, 'lobby:matchFound');

  const queuedA = waitFor(lobbyA, 'lobby:queued');
  lobbyA.emit('lobby:joinQueue', { timeControl });
  await queuedA; // A est en file avant que B n'arrive : appariement immédiat
  lobbyB.emit('lobby:joinQueue', { timeControl });

  const [mA, mB] = await Promise.all([foundA, foundB]);
  if (mA.gameId !== mB.gameId) throw new Error('Les deux joueurs ont reçu des parties différentes');
  const seatA: Seat = { user: a.user, color: mA.color, lobby: lobbyA };
  const seatB: Seat = { user: b.user, color: mB.color, lobby: lobbyB };
  return {
    gameId: mA.gameId,
    white: seatA.color === 'white' ? seatA : seatB,
    black: seatA.color === 'white' ? seatB : seatA,
    found: { [a.user.id]: mA, [b.user.id]: mB },
  };
}

/** Ouvre un socket /game et rejoint la partie ; attend son propre game:state. */
export async function joinGame(target: RunningApp, gameId: string, user?: TestUser) {
  const socket = await connectSocket(target, '/game', user);
  const state = waitFor(socket, 'game:state');
  socket.emit('game:join', { gameId });
  return { socket, state: await state };
}

/** Joue un coup et attend qu'il soit diffusé à tous les sockets observateurs. */
export async function playMove(mover: Socket, gameId: string, uci: string, observers: Socket[]) {
  const seen = observers.map((s) => waitFor(s, 'game:moveMade', (p: any) => p.move?.uci === uci));
  mover.emit('game:move', { gameId, uci });
  return Promise.all(seen);
}
