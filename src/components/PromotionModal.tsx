import { PIECE_UNICODE } from '../lib/pieces';
import type { PieceColor } from '../lib/types';

interface PromotionModalProps {
  color: PieceColor;
  onChoose: (piece: 'q' | 'r' | 'b' | 'n') => void;
}

const CHOICES: Array<{ piece: 'q' | 'r' | 'b' | 'n'; label: string }> = [
  { piece: 'q', label: 'Queen' },
  { piece: 'r', label: 'Rook' },
  { piece: 'b', label: 'Bishop' },
  { piece: 'n', label: 'Knight' },
];

export default function PromotionModal({ color, onChoose }: PromotionModalProps) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Choose promotion piece">
      <div className="modal promotion-modal">
        <h3>Promote to&hellip;</h3>
        <div className="promotion-choices">
          {CHOICES.map((c) => (
            <button key={c.piece} className="promotion-choice" onClick={() => onChoose(c.piece)} aria-label={c.label}>
              <span className={'piece ' + (color === 'w' ? 'white' : 'black')}>{PIECE_UNICODE[color + c.piece]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
