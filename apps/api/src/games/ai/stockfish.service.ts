import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { spawn } from 'child_process';

/**
 * Wrapper UCI autour du binaire natif Stockfish.
 * Si Stockfish n'est pas installé, `isAvailable` reste false et
 * `getBestMove` retourne null → le GamesService bascule sur le moteur interne.
 *
 * Installation :
 *   Ubuntu/Debian : sudo apt install stockfish
 *   macOS         : brew install stockfish
 *   Windows       : télécharger depuis stockfishchess.org
 */
@Injectable()
export class StockfishService implements OnModuleDestroy {
  private readonly logger = new Logger(StockfishService.name);
  private _available: boolean | null = null; // null = non encore testé

  onModuleDestroy() {
    // Rien à détruire — chaque appel spawn son propre process
  }

  // ──────────────────────────────────────────────
  // Disponibilité (lazy detection)
  // ──────────────────────────────────────────────

  get isAvailable(): boolean {
    return this._available === true;
  }

  /**
   * Sonde si le binaire `stockfish` est accessible sur le PATH.
   * Résultat mis en cache après le premier appel.
   */
  async checkAvailability(): Promise<boolean> {
    if (this._available !== null) return this._available;
    this._available = await this.probe();
    if (this._available) {
      this.logger.log('Stockfish détecté — niveau 5 actif');
    } else {
      this.logger.warn('Stockfish non trouvé — niveau 5 utilise le moteur interne');
    }
    return this._available;
  }

  private probe(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const proc = spawn('stockfish');
        const timer = setTimeout(() => { proc.kill(); resolve(false); }, 3000);

        proc.stdout?.once('data', (data: Buffer) => {
          if (data.toString().includes('Stockfish')) {
            clearTimeout(timer);
            proc.kill();
            resolve(true);
          }
        });
        proc.on('error', () => { clearTimeout(timer); resolve(false); });
        proc.stdin?.write('uci\n');
      } catch {
        resolve(false);
      }
    });
  }

  // ──────────────────────────────────────────────
  // Calcul du meilleur coup (UCI)
  // ──────────────────────────────────────────────

  /**
   * @param fen       Position FEN
   * @param movetime  Temps de réflexion en ms (défaut : 3000)
   * @param elo       Si défini, active UCI_LimitStrength (400–3200)
   * @returns         Coup UCI (ex. "e2e4") ou null si Stockfish indisponible
   */
  async getBestMove(
    fen: string,
    movetime = 3000,
    elo?: number,
  ): Promise<string | null> {
    if (!(await this.checkAvailability())) return null;

    return new Promise((resolve) => {
      let proc: ReturnType<typeof spawn>;
      try {
        proc = spawn('stockfish');
      } catch {
        resolve(null);
        return;
      }

      let phase: 'uci' | 'ready' | 'search' = 'uci';
      let resolved = false;
      let buf = '';

      const done = (move: string | null) => {
        if (!resolved) {
          resolved = true;
          try { proc.kill(); } catch { /* ok */ }
          resolve(move);
        }
      };

      // Délai de sécurité global
      const guard = setTimeout(() => done(null), movetime + 5000);

      proc.stdout?.on('data', (data: Buffer) => {
        buf += data.toString();
        const lines = buf.split('\n');
        buf = lines.pop() ?? ''; // garder la ligne incomplète

        for (const line of lines) {
          if (phase === 'uci' && line.includes('uciok')) {
            phase = 'ready';
            const cmds: string[] = [];
            if (elo) {
              cmds.push('setoption name UCI_LimitStrength value true');
              cmds.push(`setoption name UCI_Elo value ${Math.min(Math.max(elo, 400), 3200)}`);
            } else {
              cmds.push('setoption name UCI_LimitStrength value false');
            }
            cmds.push('isready');
            proc.stdin?.write(cmds.join('\n') + '\n');
          }

          if (phase === 'ready' && line.includes('readyok')) {
            phase = 'search';
            proc.stdin?.write(
              `ucinewgame\nposition fen ${fen}\ngo movetime ${movetime}\n`,
            );
          }

          if (phase === 'search') {
            const match = line.match(/^bestmove\s+(\S+)/);
            if (match) {
              clearTimeout(guard);
              done(match[1]);
            }
          }
        }
      });

      proc.on('error', () => { clearTimeout(guard); done(null); });
      proc.stdin?.write('uci\n');
    });
  }
}
