import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { isOwner } from '../lib/context.jsx';
import MenuButton from './MenuButton.jsx';
import Modal from './Modal.jsx';

/**
 * La liste des comptes, dans l'espace « Joueurs ».
 *
 * ─── Ce que cet écran n'est plus ────────────────────────────────────────────
 *
 * Il portait aussi les chiffres du site et la courbe de fréquentation. Ils sont
 * partis dans l'onglet « Statistiques », auquel ils appartenaient : cette
 * courbe ne parle pas des comptes, elle parle du SITE. On l'ouvrait pour savoir
 * si une annonce avait porté, et on tombait sur cent personnes à administrer.
 *
 * Ce qui reste ici est ce qui s'applique à UNE personne : son rôle, son
 * porte-monnaie, son bannissement, la suppression de son compte. La suppression
 * de ses pronostics est à côté, dans le même espace, sous l'onglet
 * « Pronostics » — c'est le regroupement qui manquait, elle vivait auparavant
 * dans un onglet « Recherche » sans rapport apparent.
 */

export default function AdminPeople({ currentUser, useFlash }) {
    const [flash, run] = useFlash();

    // Le porte-monnaie ouvert, s'il y en a un. Un seul à la fois : c'est un
    // geste qu'on fait pour une personne précise, pas une colonne qu'on
    // parcourt. En faire une colonne aurait demandé un agrégat par ligne sur
    // cent comptes, pour une information qu'on regarde une fois par mois.
    const [wallet, setWallet] = useState(null);

    // La sanction en cours de confirmation : { user, kind } où kind vaut
    // « ban », « unban » ou « delete ». Rien ne part au serveur tant que la
    // fenêtre n'a pas été relue et validée — les routes refusent de toute
    // façon sans confirmation, l'interface et l'API tiennent la même ligne.
    const [sanction, setSanction] = useState(null);

    const [data, setData] = useState(null);
    const [q, setQ] = useState('');
    // La liste est déployée d'emblée : c'est désormais le seul contenu de
    // l'écran. Elle était repliée quand les chiffres passaient devant elle, ce
    // qui n'est plus le cas — la replier encore obligerait à un clic pour voir
    // la seule chose que cet onglet contient.
    const [open, setOpen] = useState(true);

    const reload = () =>
        api.get(`/admin/users?q=${encodeURIComponent(q)}`).then(setData);

    useEffect(() => {
        // Le délai évite une requête par lettre tapée. 300 ms : assez court pour
        // qu'on ne le remarque pas, assez long pour couvrir une frappe normale.
        const id = setTimeout(() => { reload().catch(() => { }); }, 300);
        return () => clearTimeout(id);
    }, [q]);

    // Chercher, c'est vouloir voir : le repli ne doit pas obliger à un second
    // geste pour lire ce qu'on vient de demander.
    useEffect(() => {
        if (q.trim()) setOpen(true);
    }, [q]);

    const users = data?.users ?? [];

    return (
        <div className="stack">
            {flash}

            {/* --- La liste des comptes ------------------------------------------- */}
            <section className="panel stack" style={{ gap: '0.7rem' }}>
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <button
                        className="btn btn--small"
                        aria-expanded={open}
                        onClick={() => setOpen((v) => !v)}
                    >
                        {open ? '▾' : '▸'} Liste des comptes
                        {data && (
                            <span className="faint data" style={{ marginLeft: '0.5rem' }}>
                                {q.trim() ? `${data.matching} trouvé${data.matching > 1 ? 's' : ''}` : data.total}
                            </span>
                        )}
                    </button>

                    <div className="field" style={{ margin: 0, minWidth: '16rem', flex: '1 1 16rem' }}>
                        <label htmlFor="q">Chercher un compte</label>
                        <input
                            id="q"
                            type="search"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="pseudo, nom affiché ou identifiant Discord"
                        />
                    </div>
                </div>

                {open && (
                    <>
                        {/* La liste est plafonnée à cent lignes côté serveur. On le dit
                plutôt que de laisser croire que le site n'a que cent comptes —
                c'est exactement ce que l'ancienne version laissait penser. */}
                        {data?.capped && (
                            <p className="notice">
                                {data.matching} comptes correspondent, les 100 premiers sont affichés. Affinez la
                                recherche pour atteindre les autres.
                            </p>
                        )}

                        {users.length === 0 ? (
                            <p className="empty">Aucun compte ne correspond.</p>
                        ) : (
                            <div className="panel panel--flush">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Compte</th>
                                            <th>Identifiant Discord</th>
                                            <th>Rôle</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.flatMap((u) => [
                                            <tr key={u.id}>
                                                <td>
                                                    <span className="row" style={{ gap: '0.5rem' }}>
                                                        {u.avatarUrl && <img className="avatar" src={u.avatarUrl} alt="" />}
                                                        <span>
                                                            {u.globalName ?? u.username}
                                                            {/* La date d'inscription sous le nom plutôt que
                                  dans une colonne : elle qualifie la personne,
                                  et une colonne de plus aurait poussé le
                                  sélecteur de rôle hors de l'écran étroit. */}
                                                            <span
                                                                className="faint data"
                                                                style={{ display: 'block', fontSize: '0.75rem' }}
                                                            >
                                                                inscrit le {formatDay(u.createdAt)}
                                                                {u.lastSeenAt && ` · vu le ${formatDay(u.lastSeenAt)}`}
                                                            </span>
                                                            {/* Le bannissement se lit sur la ligne, avec
                                                                sa date et son motif. Une pastille seule
                                                                obligerait à ouvrir quelque chose pour
                                                                savoir pourquoi — et le pourquoi est
                                                                justement ce qu'on vient chercher. */}
                                                            {u.bannedAt && (
                                                                <span
                                                                    className="data"
                                                                    style={{ display: 'block', fontSize: '0.75rem', color: 'var(--m)' }}
                                                                >
                                                                    banni le {formatDay(u.bannedAt)}
                                                                    {u.banReason ? ` · ${u.banReason}` : ''}
                                                                </span>
                                                            )}
                                                        </span>
                                                    </span>
                                                </td>
                                                <td className="data faint">{u.discordId}</td>
                                                <td>
                                                    <select
                                                        value={u.role}
                                                        // Un administrateur ne peut pas toucher au
                                                        // propriétaire, et personne ne se retire ses
                                                        // propres droits.
                                                        disabled={
                                                            u.id === currentUser.id ||
                                                            (u.role === 'OWNER' && !isOwner(currentUser))
                                                        }
                                                        aria-label={`Rôle de ${u.username}`}
                                                        onChange={(e) =>
                                                            run(async () => {
                                                                await api.patch(`/admin/users/${u.id}/role`, { role: e.target.value });
                                                                await reload();
                                                            }, 'Rôle mis à jour.')
                                                        }
                                                    >
                                                        <option value="USER">Membre</option>
                                                        <option value="ADMIN">Administrateur</option>
                                                        {/* Seul le propriétaire peut transmettre son rang ;
                                le serveur refuse de toute façon les autres cas. */}
                                                        {isOwner(currentUser) && <option value="OWNER">Propriétaire</option>}
                                                    </select>
                                                </td>
                                                <td className="num">
                                                    <span className="row" style={{ gap: '0.3rem', justifyContent: 'flex-end' }}>
                                                        <button
                                                            className="btn btn--small btn--ghost"
                                                            aria-expanded={wallet === u.id}
                                                            onClick={() => setWallet(wallet === u.id ? null : u.id)}
                                                        >
                                                            Points
                                                        </button>

                                                        {/* Deux mesures dans un menu plutôt que deux
                                                            boutons : elles ne se prennent pas en
                                                            parcourant une liste, et un « Supprimer »
                                                            posé en permanence à côté de « Points » se
                                                            clique un jour par erreur.

                                                            Le menu disparaît sur soi-même et sur le
                                                            propriétaire : le serveur refuse déjà les deux,
                                                            le cacher dit la même chose plus tôt. */}
                                                        {u.id !== currentUser.id && u.role !== 'OWNER' && (
                                                            <MenuButton
                                                                label={`Mesures pour ${u.username}`}
                                                                items={[
                                                                    u.bannedAt
                                                                        ? {
                                                                            label: 'Lever le bannissement',
                                                                            onClick: () => setSanction({ user: u, kind: 'unban' }),
                                                                        }
                                                                        : {
                                                                            label: 'Bannir ce compte',
                                                                            onClick: () => setSanction({ user: u, kind: 'ban' }),
                                                                        },
                                                                    { separator: true },
                                                                    {
                                                                        label: 'Supprimer le compte',
                                                                        danger: true,
                                                                        onClick: () => setSanction({ user: u, kind: 'delete' }),
                                                                    },
                                                                ]}
                                                            />
                                                        )}
                                                    </span>
                                                </td>
                                            </tr>,

                                            /* Une ligne dépliée sous le compte plutôt qu'une fenêtre : on
                                               garde sous les yeux DE QUI il s'agit, ce qu'une modale fait
                                               précisément disparaître. */
                                            wallet === u.id ? (
                                                <tr key={`${u.id}-wallet`}>
                                                    <td colSpan={4} style={{ background: 'var(--surface-2)' }}>
                                                        <WalletPanel userId={u.id} run={run} />
                                                    </td>
                                                </tr>
                                            ) : null,
                                        ])}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </section>

            {sanction && (
                <SanctionDialog
                    sanction={sanction}
                    run={run}
                    onDone={async () => { setSanction(null); await reload().catch(() => { }); }}
                    onCancel={() => setSanction(null)}
                />
            )}

            <p className="faint" style={{ fontSize: '0.85rem' }}>
                Bannir ferme la porte sans rien effacer : les pronostics déposés restent au classement,
                parce que les retirer réécrirait le palmarès de tous les autres joueurs de l'événement.
                C'est réversible. Supprimer emporte tout et ne l'est pas.
            </p>

            <p className="faint" style={{ fontSize: '0.85rem' }}>
                Un administrateur gère les événements, les artistes et les résultats, et distribue les
                rôles. Le propriétaire est le seul qu'aucun administrateur ne peut destituer ; il n'y en a
                qu'un, et il ne peut transmettre son rang qu'en le donnant à quelqu'un d'autre.
            </p>
        </div>
    );
}


/**
 * La confirmation d'une mesure sur un compte.
 *
 * Trois gestes, une seule fenêtre : ils partagent la forme — on relit de QUI il
 * s'agit, on lit ce que la mesure emporte, on valide — et trois fenêtres
 * auraient triplé le même code pour trois phrases différentes.
 *
 * Le motif n'est demandé qu'au bannissement, et il y est obligatoire. Le
 * serveur le refuse vide de toute façon : la seule réponse possible à
 * « pourquoi mon compte est fermé ? » six mois plus tard serait sinon « je ne
 * sais plus ».
 *
 * La suppression demande la saisie du pseudo, exactement comme la suppression
 * volontaire depuis le profil. La friction n'est pas là pour arrêter la
 * décision, elle est là pour arrêter le clic.
 */
function SanctionDialog({ sanction, run, onDone, onCancel }) {
    const { user, kind } = sanction;
    const [reason, setReason] = useState('');
    const [typed, setTyped] = useState('');
    const [busy, setBusy] = useState(false);

    const name = user.globalName ?? user.username;

    const ready =
        kind === 'ban' ? reason.trim().length > 0
            : kind === 'delete' ? typed.trim() === user.username
                : true;

    const title =
        kind === 'ban' ? 'Bannir ce compte ?'
            : kind === 'unban' ? 'Lever le bannissement ?'
                : 'Supprimer ce compte ?';

    // Le libellé du bouton dit l'ACTE, là où le titre pose la question. Le
    // déduire du titre par un remplacement de chaîne aurait tenu jusqu'à la
    // première reformulation.
    const confirmLabel =
        kind === 'ban' ? 'Bannir'
            : kind === 'unban' ? 'Lever'
                : 'Supprimer définitivement';

    async function confirm() {
        if (!ready || busy) return;
        setBusy(true);
        await run(async () => {
            if (kind === 'delete') {
                await api.del(`/admin/users/${user.id}?confirm=true`);
                return `${name} supprimé.`;
            }
            await api.patch(`/admin/users/${user.id}/ban`, {
                banned: kind === 'ban',
                ...(kind === 'ban' ? { reason: reason.trim() } : {}),
            });
            return kind === 'ban' ? `${name} banni.` : `Bannissement de ${name} levé.`;
        });
        setBusy(false);
        await onDone();
    }

    return (
        <Modal
            title={title}
            subtitle={`${name} · ${user.discordId}`}
            onClose={onCancel}
            narrow
            footer={
                <>
                    <button
                        className={`btn ${kind === 'unban' ? 'btn--primary' : 'btn--danger'}`}
                        disabled={!ready || busy}
                        onClick={confirm}
                    >
                        {busy ? 'En cours…' : confirmLabel}
                    </button>
                    <button className="btn" onClick={onCancel} disabled={busy}>Annuler</button>
                </>
            }
        >
            {kind === 'ban' && (
                <>
                    <p style={{ margin: 0 }}>
                        Le compte ne pourra plus se connecter, et ses sessions ouvertes sont coupées
                        immédiatement. Ses pronostics déjà déposés restent au classement : les retirer
                        réécrirait le palmarès de tous les autres joueurs de l'événement.
                    </p>
                    <div className="field">
                        <label htmlFor="ban-reason">Motif (obligatoire)</label>
                        <input
                            id="ban-reason"
                            type="text"
                            maxLength={280}
                            value={reason}
                            autoFocus
                            placeholder="propos injurieux dans les commentaires de groupe"
                            onChange={(e) => setReason(e.target.value)}
                        />
                    </div>
                    <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
                        Le motif reste dans l'administration : la personne bannie voit que son compte est
                        fermé, pas pourquoi. Réversible depuis le même menu.
                    </p>
                </>
            )}

            {kind === 'unban' && (
                <p style={{ margin: 0 }}>
                    {name} pourra de nouveau se connecter et pronostiquer. Le motif enregistré est effacé.
                </p>
            )}

            {kind === 'delete' && (
                <>
                    <p className="notice" style={{ margin: 0 }}>
                        Définitif. Pronostics, brouillons, points, commentaires et adhésions disparaissent,
                        et le classement de chaque événement est recalculé sans eux.
                    </p>
                    <p style={{ margin: 0 }}>
                        Les groupes que {name} possède passent à leur plus ancien membre restant ; ceux
                        dont il était le seul membre sont dissous.
                    </p>
                    <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
                        Dans la plupart des cas c'est un bannissement qu'il faut : il ferme la porte sans
                        toucher au classement, et il se lève.
                    </p>
                    <div className="field">
                        <label htmlFor="del-confirm">
                            Saisissez « {user.username} » pour confirmer
                        </label>
                        <input
                            id="del-confirm"
                            type="text"
                            value={typed}
                            autoFocus
                            autoComplete="off"
                            onChange={(e) => setTyped(e.target.value)}
                        />
                    </div>
                </>
            )}
        </Modal>
    );
}

/**
 * Le porte-monnaie d'un joueur : son solde, ses vingt dernières écritures, et
 * de quoi en ajouter une.
 *
 * Le motif est OBLIGATOIRE. Un crédit d'événement se justifie tout seul, il
 * porte le nom de la compète ; un crédit manuel ne porte rien. Sans motif, la
 * seule réponse possible à « d'où viennent ces cinq cents points ? » est « je
 * ne sais pas », et c'est une conversation qu'on n'a qu'une fois avant de le
 * regretter.
 */
function WalletPanel({ userId, run }) {
    const [data, setData] = useState(null);
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);

    const reload = () => api.get(`/admin/users/${userId}/wallet`).then(setData);

    useEffect(() => {
        setData(null);
        reload().catch(() => { });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    const value = Number(amount);
    const valid = Number.isInteger(value) && value !== 0 && note.trim().length > 0;

    async function submit(event) {
        event.preventDefault();
        if (!valid || busy) return;
        setBusy(true);
        await run(async () => {
            const out = await api.post(`/admin/users/${userId}/wallet`, {
                amount: value,
                note: note.trim(),
            });
            setAmount('');
            setNote('');
            await reload();
            return `Porte-monnaie à ${out.balance} point(s).`;
        });
        setBusy(false);
    }

    if (!data) return <p className="faint" style={{ margin: '0.6rem 0' }}>Chargement…</p>;

    return (
        <div className="stack" style={{ gap: '0.7rem', padding: '0.6rem 0' }}>
            <div className="row" style={{ gap: '0.8rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span
                    className="display"
                    style={{ fontSize: 'calc(1.8rem * var(--display-scale))', color: 'var(--g)' }}
                >
                    {data.balance}
                </span>
                <span className="eyebrow" style={{ margin: 0 }}>points dépensables</span>
            </div>

            <form className="row" style={{ gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }} onSubmit={submit}>
                <div className="field" style={{ margin: 0, width: '7rem' }}>
                    <label htmlFor={`amt-${userId}`}>Montant</label>
                    <input
                        id={`amt-${userId}`}
                        type="number"
                        step="1"
                        value={amount}
                        placeholder="250"
                        onChange={(e) => setAmount(e.target.value)}
                    />
                </div>

                <div className="field" style={{ margin: 0, flex: '1 1 18rem' }}>
                    <label htmlFor={`note-${userId}`}>Motif</label>
                    <input
                        id={`note-${userId}`}
                        type="text"
                        maxLength={140}
                        value={note}
                        placeholder="concours de pronostics du live GBB26"
                        onChange={(e) => setNote(e.target.value)}
                    />
                </div>

                <button className="btn btn--small btn--primary" type="submit" disabled={!valid || busy}>
                    {value < 0 ? 'Retirer' : 'Créditer'}
                </button>
            </form>

            <p className="faint" style={{ fontSize: '0.8rem', margin: 0 }}>
                Un montant négatif reprend des points. Le score au classement n'est jamais touché : il
                reste la somme des pronostics, et rien ne le dépense.
            </p>

            {data.entries.length === 0 ? (
                <p className="empty">Aucun mouvement.</p>
            ) : (
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Origine</th>
                            <th className="num">Montant</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.entries.map((e) => (
                            <tr key={e.id}>
                                <td className="data faint">{formatDay(e.createdAt)}</td>
                                <td>
                                    {e.kind === 'EVENT_POINTS' && (e.event ? `${e.event.name} ${e.event.year}` : 'Compétition supprimée')}
                                    {e.kind === 'PURCHASE' && `Achat · ${e.itemId}`}
                                    {e.kind === 'GRANT' && (e.note ?? 'Crédit manuel')}
                                </td>
                                <td className="num" style={{ color: e.amount < 0 ? 'var(--m)' : 'var(--g)' }}>
                                    {e.amount > 0 ? `+${e.amount}` : e.amount}
                                </td>
                                <td className="num">
                                    {/* Seules les écritures manuelles s'annulent : le serveur refuse
                                        les autres, le bouton ne fait que dire la même chose plus tôt. */}
                                    {e.kind === 'GRANT' && (
                                        <button
                                            className="btn btn--small btn--ghost"
                                            onClick={() =>
                                                run(async () => {
                                                    await api.del(`/admin/wallet/${e.id}`);
                                                    await reload();
                                                    return 'Écriture annulée.';
                                                })
                                            }
                                        >
                                            Annuler
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

/** AAAA-MM-JJ vers une date lisible. Le panneau d'administration est en français. */
function formatDay(value) {
    return new Date(value).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}