/**
 * Le nom d'un participant.
 *
 * `Contender.name` est facultatif. Vide, le nom se déduit des artistes
 * rattachés — et c'est ce qui rend les corrections rétroactives : renommer un
 * artiste met à jour son nom partout, y compris dans les pronostics déjà
 * déposés, puisque plus rien n'est recopié au moment de l'engagement.
 *
 * On ne renseigne `name` que lorsqu'il n'appartient à aucun artiste isolé :
 * le nom d'un crew, celui d'un duo qui tourne sous un pseudonyme commun.
 */
export function contenderName(contender) {
    if (contender?.name) return contender.name;

    const artists = (contender?.artists ?? [])
        .map((link) => link.artist ?? link)
        .filter((a) => a?.name);

    if (artists.length === 0) return '—';
    if (artists.length === 1) return artists[0].name;

    // « Colaps & Zekka », « Berywam & Alem & … » — l'ordre est celui du
    // rattachement, stable d'un affichage à l'autre.
    return artists.map((a) => a.name).join(' & ');
}

/** Ajoute le nom résolu à un participant, pour l'envoyer au client. */
export const withName = (contender) =>
    contender && { ...contender, name: contenderName(contender) };