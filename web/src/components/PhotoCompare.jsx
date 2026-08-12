import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import Modal from './Modal.jsx';
import { shrinkImage, humanSize } from '../lib/image.js';

/** Une photo servie depuis le dossier monté du projet Beatbox-Games. */
const fromBeatboxGames = (url) => typeof url === 'string' && url.startsWith('/api/media/artists/');

/**
 * Comparaison avant remplacement. La nouvelle image n'est pas envoyée tant que
 * le choix n'est pas fait : on l'affiche depuis un blob local, côte à côte avec
 * l'actuelle et à la même taille. Rien ne part sur le serveur si l'on garde
 * l'ancienne.
 */
export default function PhotoCompare({ artist, file, onCancel, onReplaced }) {
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    // Le fichier réellement envoyé : la version réduite, pas l'original.
    const [ready, setReady] = useState(null);

    useEffect(() => {
        let url = null;
        let cancelled = false;

        // On réduit AVANT d'afficher l'aperçu : ce qu'on voit est exactement ce
        // qui partira sur le serveur.
        shrinkImage(file).then((result) => {
            if (cancelled) return;
            setReady(result);
            url = URL.createObjectURL(result.file);
            setPreview(url);
        });

        return () => {
            cancelled = true;
            // Un blob non révoqué reste en mémoire tant que l'onglet est ouvert.
            if (url) URL.revokeObjectURL(url);
        };
    }, [file]);

    const replace = async () => {
        setBusy(true);
        setError(null);
        try {
            await api.upload(`/admin/photos/upload/${artist.id}`, ready.file);
            onReplaced();
        } catch (e) {
            setError(e.message);
            setBusy(false);
        }
    };

    return (
        <Modal
            wide
            title="Quelle photo garder ?"
            subtitle={artist.name}
            onClose={onCancel}
            footer={
                <>
                    <button className="btn" onClick={onCancel} disabled={busy}>
                        Garder l'actuelle
                    </button>
                    <button className="btn btn--primary" onClick={replace} disabled={busy || !ready}>
                        {busy ? 'Envoi…' : 'Utiliser la nouvelle'}
                    </button>
                </>
            }
        >
            {error && <p className="notice">{error}</p>}

            <div className="compare">
                <figure className="compare__side">
                    <figcaption className="eyebrow">Actuelle</figcaption>
                    <img src={artist.imageUrl} alt={`Photo actuelle de ${artist.name}`} />
                    <p className="faint" style={{ fontSize: '0.82rem', margin: 0 }}>
                        {fromBeatboxGames(artist.imageUrl) ? 'Depuis Beatbox-Games' : 'Ajoutée ici'}
                    </p>
                </figure>

                <figure className="compare__side compare__side--new">
                    <figcaption className="eyebrow">Nouvelle</figcaption>
                    {preview ? (
                        <img src={preview} alt={`Nouvelle photo proposée pour ${artist.name}`} />
                    ) : (
                        <p className="faint">Préparation…</p>
                    )}
                    <p className="faint" style={{ fontSize: '0.82rem', margin: 0 }}>
                        {file.name} — {ready ? humanSize(ready.to) : humanSize(file.size)}
                        {ready?.resized && ` (réduite depuis ${humanSize(ready.from)})`}
                    </p>
                </figure>
            </div>

            {fromBeatboxGames(artist.imageUrl) && (
                <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>
                    La photo actuelle vient du dossier de Beatbox-Games, monté en lecture seule. La remplacer
                    ne touche pas au fichier d'origine : seul le lien de cet artiste change, et vous pourrez
                    revenir en arrière en relançant l'appariement automatique.
                </p>
            )}
        </Modal>
    );
}