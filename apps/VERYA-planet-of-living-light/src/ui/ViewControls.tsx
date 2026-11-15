import { IconCinema, IconRecenter } from './icons';

interface Props {
  onResetCamera: () => void;
  onCinematic: () => void;
}

export function ViewControls({ onResetCamera, onCinematic }: Props) {
  return (
    <div className="view-controls glass" role="group" aria-label="View">
      <button type="button" className="icon-btn" onClick={onResetCamera} aria-label="Reset camera" title="Reset camera (R)">
        <IconRecenter />
      </button>
      <span className="view-controls__rule" aria-hidden="true" />
      <button type="button" className="icon-btn" onClick={onCinematic} aria-label="Cinematic mode" title="Cinematic mode (C)">
        <IconCinema />
      </button>
    </div>
  );
}
