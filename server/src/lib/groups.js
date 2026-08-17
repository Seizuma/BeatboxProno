import crypto from 'node:crypto';
import { prisma } from './prisma.js';

/**
 * Les outils des groupes privés : identifiants d'URL, codes d'invitation, et
 * les gardes qui répondent à « cette personne a-t-elle le droit d'être là ».
 *
 * Ces gardes ne vivent pas dans les routes parce qu'ils y seraient recopiés
 * quinze fois : un oubli sur une seule route ouvrirait tout un groupe à
 * n'importe qui.
 */

// --- Limites -------------------------------------------------------------------
//
// Toutes côté serveur. Une limite affichée à l'écran est une indication ; une
// limite vérifiée à l'écriture est une règle.

/** Groupes qu'une même personne peut posséder. Rejoindre n'est pas limité. */
export const MAX_GROUPS_OWNED = 5;
/** Membres par groupe. Au-delà, le classement général fait le même travail. */
export const MAX_MEMBERS = 50;
/** Longueur d'un commentaire. */
export const MAX_COMMENT_LENGTH = 2000;
/** Commentaires par personne et par heure glissante. */
export const COMMENTS_PER_HOUR = 30;

// --- Identifiants ---------------------------------------------------------------

/**
 * Le fragment lisible d'une URL de groupe.
 *
 * La normalisation Unicode sépare les lettres de leurs accents, qu'on retire
 * ensuite : « Les Potés » devient « les-potes » plutôt que « les-pot-s ».
 */
function slugify(name) {
    return String(name)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
}

/**
 * Un slug unique, suffixé d'un fragment aléatoire.
 *
 * Deux bandes d'amis peuvent légitimement s'appeler « Les potes » : sans
 * suffixe, la seconde création échouerait sur la contrainte d'unicité, et il
 * faudrait expliquer à quelqu'un que le nom de son groupe est déjà pris par
 * des inconnus qu'il ne verra jamais.
 *
 * Le suffixe n'est pas un secret — le slug circule dans l'URL, la
 * confidentialité repose sur l'appartenance, pas sur l'ignorance de l'adresse.
 */
export async function uniqueSlug(name) {
    const base = slugify(name) || 'groupe';

    for (let attempt = 0; attempt < 5; attempt += 1) {
        const slug = `${base}-${crypto.randomBytes(3).toString('hex')}`;
        const taken = await prisma.group.findUnique({ where: { slug }, select: { id: true } });
        if (!taken) return slug;
    }
    // Cinq collisions de suite sur 16 millions de suffixes : autant prendre
    // quelque chose d'illisible mais certain plutôt que boucler.
    return `${base}-${crypto.randomUUID().slice(0, 12)}`;
}

/**
 * Le code d'invitation.
 *
 * Alphabet sans I, l, 1, O ni 0 : le lien se recopie parfois à la main depuis
 * une capture d'écran, et rien n'est plus frustrant qu'un code refusé parce
 * qu'on a lu un zéro pour un O. Douze caractères sur 32 valeurs font 60 bits :
 * hors de portée d'une tentative au hasard.
 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function makeInviteCode(length = 12) {
    const bytes = crypto.randomBytes(length);
    let out = '';
    for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
    return out;
}

/** Un code unique en base. La collision est improbable, pas impossible. */
export async function uniqueInviteCode() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const inviteCode = makeInviteCode();
        const taken = await prisma.group.findUnique({ where: { inviteCode }, select: { id: true } });
        if (!taken) return inviteCode;
    }
    return makeInviteCode(20);
}

// --- Gardes ----------------------------------------------------------------------

/**
 * Charge le groupe désigné par `:slug` et l'adhésion de la personne connectée.
 *
 * Un groupe inconnu et un groupe dont on n'est pas membre renvoient tous deux
 * 404. C'est délibéré : un 403 confirmerait l'existence du groupe à qui teste
 * des adresses au hasard. Ce qui est privé doit être indiscernable de ce qui
 * n'existe pas.
 */
export const loadGroup = async (req, res, next) => {
    try {
        const group = await prisma.group.findUnique({
            where: { slug: req.params.slug },
            include: {
                members: {
                    orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
                    include: {
                        user: { select: { id: true, username: true, globalName: true, avatarUrl: true } },
                    },
                },
            },
        });

        if (!group) return res.status(404).json({ error: 'Groupe introuvable.' });

        const membership = group.members.find((m) => m.userId === req.user.id) ?? null;
        if (!membership) return res.status(404).json({ error: 'Groupe introuvable.' });

        req.group = group;
        req.membership = membership;
        next();
    } catch (err) {
        next(err);
    }
};

/** Réservé au propriétaire : renommer, inviter, exclure, transmettre, dissoudre. */
export const requireGroupOwner = (req, res, next) => {
    if (req.membership?.role !== 'OWNER') {
        return res.status(403).json({ error: 'Seul le propriétaire du groupe peut faire cela.' });
    }
    next();
};

/**
 * La vue d'un groupe telle qu'un membre la reçoit.
 *
 * Le code d'invitation en fait partie : tout membre peut inviter, seul le
 * propriétaire peut fermer la porte ou changer la serrure.
 */
export function serializeGroup(group, membership) {
    return {
        slug: group.slug,
        name: group.name,
        description: group.description,
        createdAt: group.createdAt,
        inviteCode: group.inviteCode,
        inviteOpen: group.inviteOpen,
        myRole: membership.role,
        memberCount: group.members.length,
        members: group.members.map((m) => ({
            ...m.user,
            role: m.role,
            joinedAt: m.joinedAt,
        })),
    };
}