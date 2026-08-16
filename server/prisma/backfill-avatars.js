import { prisma } from '../src/lib/prisma.js';
import { avatarUrlFor } from '../src/lib/avatar.js';

/**
 * Rattrape les avatars manquants des comptes déjà inscrits.
 *
 * Une correction dans `upsertDiscordUser` ne vaut que pour les connexions
 * futures : les personnes déjà inscrites gardent leur `avatarUrl` à null
 * jusqu'à leur prochaine visite, et resteraient sans image au classement
 * entre-temps.
 *
 * On ne peut pas récupérer l'avatar téléversé d'un compte sans son jeton — mais
 * l'avatar par défaut, lui, se calcule à partir du seul identifiant Discord,
 * qu'on a déjà. C'est exactement ce qui manquait à ces comptes-là.
 *
 *   node prisma/backfill-avatars.js --dry-run
 *   node prisma/backfill-avatars.js
 */

const dryRun = process.argv.includes('--dry-run');

const users = await prisma.user.findMany({
    where: { avatarUrl: null },
    select: { id: true, discordId: true, username: true },
});

console.log(`${users.length} compte(s) sans avatar.`);

let done = 0;
for (const user of users) {
    // Le discriminant n'est pas stocké : passer `null` fait retomber sur la
    // formule des pseudos uniques, qui est celle de tous les comptes récents et
    // reste correcte pour les autres — un avatar par défaut n'est qu'une couleur.
    const url = avatarUrlFor({ id: user.discordId, avatar: null, discriminator: null });
    console.log(`  ${user.username} → ${url}`);
    if (!dryRun) {
        await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: url } });
        done += 1;
    }
}

console.log(dryRun ? 'Essai à blanc : rien n’a été écrit.' : `${done} avatar(s) posé(s).`);
await prisma.$disconnect();