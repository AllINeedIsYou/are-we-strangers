import { useId } from 'react';
export default function ArchiveEmpty() {
  const glow = useId().replaceAll(':', '');
  return <div className="archive-empty" role="status">
    <svg viewBox="0 0 100 130" aria-hidden="true"><defs><filter id={glow} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5" /></filter></defs>
      <path className="archive-star-glow" d="M50 5C47 54 45 61 15 65C45 69 47 76 50 125C53 76 55 69 85 65C55 61 53 54 50 5Z" fill="currentColor" filter={`url(#${glow})`} />
      <path d="M50 5C47 54 45 61 15 65C45 69 47 76 50 125C53 76 55 69 85 65C55 61 53 54 50 5Z" fill="currentColor" />
    </svg><p>тут пусто</p>
  </div>;
}
