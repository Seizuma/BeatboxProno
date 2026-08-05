import { useState } from 'react';
import { initials } from '../lib/media.js';

/**
 * Photo d'artiste. Si le fichier manque ou ne charge pas, on retombe sur les
 * initiales : jamais de carré cassé dans un arbre de battles.
 *
 * @param {'xs'|'sm'|'md'|'lg'} size
 */
export default function ArtistFigure({ src, name, size = 'sm', className = '' }) {
  const [broken, setBroken] = useState(false);
  const cls = `figure figure--${size}${className ? ` ${className}` : ''}`;

  if (!src || broken) {
    return (
      <span className={`${cls} figure--empty`} aria-hidden="true">
        {initials(name)}
      </span>
    );
  }

  return (
    <img
      className={cls}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
    />
  );
}
