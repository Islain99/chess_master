import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';

export interface PositionAnalysis {
  bestUci: string;
  evalCp:  number;  // centipions (+ = avantage blanc, - = avantage noir)
}

/**
 * Lance Stockfish pour analyser une position donnée.
 * Retourne le meilleur coup UCI et l'évaluation en centipions.
 */
@Injectable()
export class StockfishAnalysisService {
  private readonly logger = new Logger(StockfishAnalysisService.name);
  private readonly sfPath: string;

  constructor() {
    this.sfPath = process.env.STOCKFISH_PATH ?? 'stockfish';
  }

  async analyzePosition(
    fen: string,
    depth = 15,
  ): Promise<PositionAnalysis> {
    return new Promise((resolve, reject) => {
      let sf: ReturnType<typeof spawn>;

      try {
        sf = spawn(this.sfPath);
      } catch {
        // Si Stockfish n'est pas disponible, simuler une évaluation
        return resolve({ bestUci: 'e2e4', evalCp: 0 });
      }

      let output = '';
      let evalCp = 0;
      let resolved = false;

      const finish = (bestUci: string) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        try { sf.kill(); } catch { /* ignore */ }
        resolve({ bestUci, evalCp });
      };

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try { sf.kill(); } catch { /* ignore */ }
          resolve({ bestUci: 'e2e4', evalCp: 0 }); // fallback
        }
      }, 3_000);

      sf.stdout?.on('data', (chunk: Buffer) => {
        output += chunk.toString();

        // Extraire le score centipions de la dernière ligne info
        const cpMatches = output.match(/score cp (-?\d+)/g) ?? [];
        if (cpMatches.length > 0) {
          evalCp = parseInt(cpMatches[cpMatches.length - 1].replace('score cp ', ''));
        }

        // Score de mat
        const mateMatches = output.match(/score mate (-?\d+)/g) ?? [];
        if (mateMatches.length > 0) {
          const mateIn = parseInt(mateMatches[mateMatches.length - 1].replace('score mate ', ''));
          evalCp = mateIn > 0 ? 10_000 : -10_000;
        }

        // Bestmove trouvé → terminer
        const bm = output.match(/bestmove (\S+)/);
        if (bm && bm[1] !== '(none)') {
          finish(bm[1]);
        } else if (bm) {
          finish('e2e4'); // position terminée
        }
      });

      sf.on('error', () => resolve({ bestUci: 'e2e4', evalCp: 0 }));

      // Commandes UCI
      sf.stdin?.write([
        'uci',
        `position fen ${fen}`,
        `go depth ${depth}`,
      ].join('\n') + '\n');
    });
  }
}
