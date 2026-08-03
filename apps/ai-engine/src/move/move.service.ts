import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { spawn } from 'child_process';

@Injectable()
export class MoveService {
  private readonly logger = new Logger(MoveService.name);
  private readonly sfPath: string;

  constructor() {
    this.sfPath = process.env.STOCKFISH_PATH ?? 'stockfish';
  }

  /**
   * Lance un processus Stockfish, envoie les commandes UCI et retourne le
   * meilleur coup (format UCI) pour la position FEN donnée.
   *
   * Protocole UCI simplifié :
   *   uci  →  uciok
   *   setoption name Skill Level value <n>
   *   position fen <fen>
   *   go movetime <ms>  →  bestmove <uci>
   */
  async getBestMove(
    fen: string,
    skillLevel: number,
    movetime: number,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let sf: ReturnType<typeof spawn>;

      try {
        sf = spawn(this.sfPath);
      } catch (err) {
        this.logger.error(`Impossible de lancer ${this.sfPath} : ${err}`);
        return reject(
          new ServiceUnavailableException('Stockfish non disponible sur ce serveur.'),
        );
      }

      let output = '';
      let resolved = false;

      const finish = (uci: string) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        try { sf.kill(); } catch { /* ignore */ }
        resolve(uci);
      };

      const fail = (err: Error) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        try { sf.kill(); } catch { /* ignore */ }
        reject(new ServiceUnavailableException(err.message));
      };

      // Délai de sécurité : movetime + 5 s
      const timer = setTimeout(
        () => fail(new Error('Stockfish : délai dépassé')),
        movetime + 5_000,
      );

      sf.stdout?.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        const match = output.match(/bestmove\s+(\S+)/);
        if (match) {
          const uci = match[1];
          // Stockfish retourne "bestmove (none)" si aucun coup légal
          if (uci === '(none)') {
            fail(new Error('Stockfish : aucun coup légal (position terminée ?)'));
          } else {
            finish(uci);
          }
        }
      });

      sf.on('error', (err) => fail(err));
      sf.on('close', (code) => {
        if (!resolved) {
          fail(new Error(`Stockfish fermé prématurément (code ${code})`));
        }
      });

      // Commandes UCI
      const cmd = [
        'uci',
        `setoption name Skill Level value ${Math.max(1, Math.min(20, skillLevel))}`,
        // "Hash" en Mo : adapter en production
        'setoption name Hash value 32',
        `position fen ${fen}`,
        `go movetime ${movetime}`,
      ].join('\n') + '\n';

      sf.stdin?.write(cmd, (err) => {
        if (err) fail(err);
      });
    });
  }
}
