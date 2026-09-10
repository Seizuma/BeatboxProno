import { useState } from 'react';
import { api } from '../lib/api.js';
import Modal from './Modal.jsx';

/**
 * Remplacer un participant qui déclare forfait.
 *
 * ─── Ce que cette fenêtre évite ─────────────────────────────────────────────
 *
 * Jusqu'ici il fallait retirer le partant puis rajouter le remplaçant, et
 * comme le seed se recalcule à l'ajout, cela obligeait à défaire et refaire
 * toute la liste pour rendre à chacun sa place. Un forfait sur seize
 * participants coûtait quinze manipulations.
 *
 * Ici la LIGNE ne bouge pas. Seul le rattachement à l'artiste change, donc le
 * seed reste, l'arbre reste, et les affiches déjà composées restent. C'est un
 * remplacement au sens sportif : le dossard est le même, la personne dedans
 * change.
 *
 * ─── Ce qu'il faut dire avant de cliquer ────────────────────────────────────
 *
 * Les pronostics déjà déposés suivent. Quelqu'un qui avait misé sur le partant
 * verra le remplaçant à sa place, sans l'avoir choisi. Il n'y a pas de bonne
 * option — l'alternative est que son pronostic disparaisse — mais il n'y a
 * aucune raison de le cacher, et le serveur exige une confirmation dès qu'un
 * pronostic est concerné.
 */
export default function ReplaceContender({ contender, category, artists, onDone, onCancel, run }) {
    const [artistId, setArtistId] = useState('');
    const [name, setName] = useState('');
    const [confirming, setConfirming] = useState(null);
    const [busy, setBusy] = useState(false);

    // Les artistes déjà engagés ici sont écartés : le serveur les refuse, et le
    // cas se présente vite puisque le remplaçant d'un forfait est souvent le
    // premier non-qualifié, déjà présent à un autre seed.
    const engaged = new Set(
        category.contenders.flatMap((c) => (c.artists ?? []).map((l) => l.artist?.id ?? l.artistId))
    );
    const suggested = artists.filter(
        (a) => !engaged.has(a.id) && (a.kinds ?? []).includes(category.kind)
    );

    const ready = Boolean(artistId || name.trim());

    const body = () => ({
        artistId: artistId || null,
        name: artistId ? null : name.trim(),
    });

    /** Premier envoi sans confirmation : le serveur répond par le bilan. */
    async function attempt() {
        if (!ready || busy) return;
        setBusy(true);
        try {
            await api.patch(`/admin/contenders/${contender.id}/artist`, body());
            await onDone();
        } catch (e) {
            // 409 : des pronostics sont concernés. On montre la phrase du
            // serveur plutôt que d'en réécrire une ici — elle porte le compte
            // exact, et deux formulations finiraient par diverger.
            setConfirming(e.message);
        }
        setBusy(false);
    }

    async function confirm() {
        setBusy(true);
        await run(async () => {
            const res = await api.patch(
                `/admin/contenders/${contender.id}/artist?confirm=true`,
                body()
            );
            await onDone();
            return `${res.replaced} remplacé par ${res.contender.name}.`;
        });
        setBusy(false);
    }

    return (
        <Modal
            title="Remplacer un participant"
            subtitle={`${contender.name} · seed ${contender.seed ?? '—'}`}
            onClose={onCancel}
            narrow
            footer={
                <>
                    <button
                        className="btn btn--primary"
                        disabled={!ready || busy}
                        onClick={confirming ? confirm : attempt}
                    >
                        {busy ? 'En cours…' : confirming ? 'Remplacer quand même' : 'Remplacer'}
                    </button>
                    <button className="btn" onClick={onCancel} disabled={busy}>Annuler</button>
                </>
            }
        >
            <p style={{ margin: 0 }}>
                Le seed <strong>{contender.seed ?? '—'}</strong> est conservé, ainsi que la place du
                participant dans le tableau et dans les affiches déjà composées. Seul l'artiste change.
            </p>

            <div className="field">
                <label htmlFor={`rep-artist-${contender.id}`}>Remplaçant</label>
                <select
                    id={`rep-artist-${contender.id}`}
                    value={artistId}
                    onChange={(e) => { setArtistId(e.target.value); setConfirming(null); }}
                >
                    <option value="">— créer d'après le nom —</option>
                    {suggested.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </select>
            </div>

            {!artistId && (
                <div className="field">
                    <label htmlFor={`rep-name-${contender.id}`}>Nom du remplaçant</label>
                    <input
                        id={`rep-name-${contender.id}`}
                        type="text"
                        value={name}
                        placeholder="Alem, ou « Colaps & Zekka »"
                        onChange={(e) => { setName(e.target.value); setConfirming(null); }}
                    />
                </div>
            )}

            {confirming && <p className="notice" style={{ margin: 0 }}>{confirming}</p>}

            <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
                Les pronostics déjà déposés suivent le remplacement : celui qui avait misé sur{' '}
                {contender.name} verra le remplaçant à sa place. Sur une compète encore ouverte c'est
                sans conséquence, chacun peut réviser.
            </p>
        </Modal>
    );
}