/**
 * Le relais Discord de la boîte à idées.
 *
 * Un webhook par salon, pas un bot : un webhook est une URL, il n'a aucune
 * permission au-delà d'écrire dans le salon qui l'a créé, et il ne demande ni
 * connexion permanente ni gestion de token. Pour poster deux sortes de messages
 * dans deux salons, c'est exactement ce qu'il faut.
 *
 * Les URL vivent dans l'environnement — ce sont des secrets : quiconque en
 * possède une peut écrire dans le salon.
 */

const WEBHOOKS = {
    SUGGESTION: () => process.env.DISCORD_WEBHOOK_SUGGESTIONS,
    BUG: () => process.env.DISCORD_WEBHOOK_BUGS,
    REPORT: () => process.env.DISCORD_WEBHOOK_REPORTS,
};

const COLORS = {
    SUGGESTION: 0x00d648, // vert
    BUG: 0xff2222, // rouge
    REPORT: 0x00e8e8, // cyan
};

const TITLES = {
    SUGGESTION: "Suggestion d'événement",
    BUG: 'Rapport de bug',
    REPORT: 'Rapport de fréquentation',
};

/** Les webhooks manquants, pour le prévenir au démarrage plutôt qu'à l'usage. */
export function missingWebhooks() {
    return Object.entries(WEBHOOKS)
        .filter(([, read]) => !read())
        .map(([kind]) => kind);
}

/**
 * Poste un contenu déjà mis en forme dans un salon.
 *
 * Sépare le transport de la rédaction : la boîte à idées compose un message à
 * partir d'un formulaire, le rapport quotidien à partir de la base, mais tous
 * deux partent par le même tuyau, avec les mêmes garde-fous.
 */
export async function postToDiscord(kind, { title, description, imageUrl, footer }) {
    const url = WEBHOOKS[kind]?.();
    if (!url) return { ok: false, error: `Aucun webhook configuré pour ${kind}.` };

    const payload = {
        username: 'BeatboxPredictions',
        allowed_mentions: { parse: [] },
        embeds: [
            {
                title: title ?? TITLES[kind] ?? kind,
                description: description.slice(0, 4000),
                color: COLORS[kind],
                timestamp: new Date().toISOString(),
                ...(imageUrl ? { image: { url: imageUrl } } : {}),
                ...(footer ? { footer: { text: footer } } : {}),
            },
        ],
    };

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            return { ok: false, error: `Discord ${res.status} ${text.slice(0, 200)}` };
        }
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err?.message ?? 'Envoi impossible.' };
    }
}

/**
 * Relaie un message dans le salon de sa catégorie.
 *
 * Ne lève jamais : un salon injoignable ne doit pas faire échouer la requête du
 * joueur, dont le message est déjà en base. On renvoie l'issue, l'appelant la
 * consigne.
 *
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function relayToDiscord({ id, kind, body, user }) {
    const url = WEBHOOKS[kind]?.();
    if (!url) return { ok: false, error: `Aucun webhook configuré pour ${kind}.` };

    const author = user.globalName ?? user.username;
    const payload = {
        username: 'BeatboxPredictions',
        // Le garde-fou qui compte : Discord n'exécute AUCUNE mention, quoi que
        // contienne le texte. Sans lui, n'importe qui pourrait faire sonner
        // @everyone depuis un formulaire public.
        allowed_mentions: { parse: [] },
        embeds: [
            {
                title: TITLES[kind] ?? kind,
                description: body.slice(0, 4000),
                color: COLORS[kind],
                timestamp: new Date().toISOString(),
                author: {
                    name: `${author} (@${user.username})`,
                    icon_url: user.avatarUrl ?? undefined,
                },
                footer: { text: `Discord ${user.discordId} · réf. ${id}` },
            },
        ],
    };

    // Discord coupe à 30 s ; on n'attend pas si longtemps une requête que le
    // joueur a déjà quittée des yeux.
    const abort = AbortSignal.timeout(8000);

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: abort,
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            return { ok: false, error: `Discord ${res.status} ${text.slice(0, 200)}` };
        }
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err?.message ?? 'Envoi impossible.' };
    }
}