const PIECES_SPRITE = '/assets/pieces/standard.svg';

export const ChessPieceIcon = ({ piece, className = '' }) => {
  if (!piece) return null;

  return (
    <svg
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <use href={`${PIECES_SPRITE}#${piece.toLowerCase()}`} />
    </svg>
  );
};
