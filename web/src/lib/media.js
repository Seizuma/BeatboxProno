/**
 * Les photos vivent dans le dossier `beatbox_artists` du VPS, monté en lecture
 * seule dans le conteneur api et servi sous /api/media/artists/…
 * Un contender peut avoir sa propre image (un crew, un duo) ; sinon on prend
 * celle du premier artiste rattaché.
 */
export function contenderPhoto(contender) {
  if (!contender) return null;
  if (contender.imageUrl) return contender.imageUrl;
  const first = contender.artists?.[0]?.artist ?? contender.artists?.[0];
  return first?.imageUrl ?? null;
}

/** « Colaps & Zekka » → « CZ », « Alexinho » → « AL » */
export function initials(name) {
  const words = String(name ?? '')
    .split(/[\s&+/·-]+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
