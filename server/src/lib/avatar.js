/**
 * L'adresse de l'avatar d'un compte Discord.
 *
 * Discord ne renvoie `avatar` que si la personne en a téléversé un. Un compte
 * qui n'a jamais changé son image a `avatar: null` — ce n'est pas une erreur,
 * c'est le cas d'une bonne partie des comptes, surtout les récents. Construire
 * l'URL uniquement à partir de ce champ laissait donc ces gens sans image du
 * tout, alors que Discord fournit bien un avatar par défaut.
 *
 * Deux subtilités valent d'être notées :
 *
 *  — L'avatar par défaut se calcule différemment selon l'âge du compte. Les
 *    comptes historiques (Pseudo#1234) le tirent de leur discriminant modulo 5.
 *    Depuis le passage aux pseudos uniques, le discriminant vaut « 0 » et
 *    l'index se dérive de l'identifiant lui-même, modulo 6. Appliquer l'ancienne
 *    formule à un compte récent donnait toujours 0 : tout le monde avec la même
 *    image grise.
 *
 *  — Un avatar animé a un hash préfixé de `a_` et n'existe en mouvement qu'en
 *    .gif. Le demander en .png donne une image fixe, ce qui marche mais perd
 *    ce que la personne avait choisi.
 */

const CDN = 'https://cdn.discordapp.com';

/** L'index de l'avatar par défaut, entre 0 et 5. */
export function defaultAvatarIndex(discordId, discriminator) {
    if (!discriminator || discriminator === '0') {
        // Pseudos uniques : l'index vient des bits de l'identifiant.
        try {
            return Number((BigInt(discordId) >> 22n) % 6n);
        } catch {
            return 0;
        }
    }
    return Number(discriminator) % 5;
}

/**
 * @param {object} profile  la réponse de /users/@me : { id, avatar, discriminator }
 * @param {number} size     puissance de deux, 16 à 4096
 */
export function avatarUrlFor(profile, size = 128) {
    if (!profile?.id) return null;

    if (profile.avatar) {
        const animated = profile.avatar.startsWith('a_');
        const ext = animated ? 'gif' : 'png';
        return `${CDN}/avatars/${profile.id}/${profile.avatar}.${ext}?size=${size}`;
    }

    const index = defaultAvatarIndex(profile.id, profile.discriminator);
    // Les avatars par défaut ne se déclinent pas en tailles : pas de ?size ici.
    return `${CDN}/embed/avatars/${index}.png`;
}