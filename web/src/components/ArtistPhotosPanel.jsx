import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

/**
 * À insérer dans l'onglet « Artistes » de l'administration, juste avant la
 * table :
 *
 *   import ArtistPhotosPanel from '../components/ArtistPhotosPanel.jsx';
 *   …
 *   <ArtistPhotosPanel onDone={reload} />
 *
 * Rattache les fichiers de beatbox_artists aux artistes en comparant les noms
 * de fichiers aux slugs et aux alias. Rien n'est écrit tant qu'on n'a pas
 * cliqué sur « Rattacher » : l'aperçu affiche d'abord ce qui va bouger.
 */
export default function ArtistPhotosPanel({ onDone }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .get('/admin/photos')
      .then(setReport)
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  async function sync(force) {
    setBusy(true);
    setError(null);
    try {
      await api.post('/admin/photos/sync', { force });
      await load();
      onDone?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="notice">{error}</p>;
  if (!report) return <p className="faint">Lecture du dossier…</p>;

  const pending = report.matched.filter((m) => m.changed);

  return (
    <section className="panel stack">
      <div className="spread">
        <div>
          <p className="eyebrow">{report.directory}</p>
          <h2>Photos des artistes</h2>
        </div>
        <div className="row" style={{ gap: '0.4rem' }}>
          <button className="btn btn--primary" disabled={busy || pending.length === 0} onClick={() => sync(false)}>
            Rattacher {pending.length > 0 ? `(${pending.length})` : ''}
          </button>
          <button className="btn btn--ghost" disabled={busy} onClick={() => sync(true)}>
            Tout réécrire
          </button>
        </div>
      </div>

      <div className="row" style={{ gap: '1.5rem' }}>
        <Readout value={report.fileCount} unit="fichiers lus" />
        <Readout value={report.matched.length} unit="artistes appariés" />
        <Readout value={report.unmatchedArtists.length} unit="sans photo" />
        <Readout value={report.unusedFiles.length} unit="fichiers inutilisés" />
      </div>

      {report.fileCount === 0 && (
        <p className="notice">
          Le dossier est vide ou n'est pas monté. Vérifiez <code>ARTIST_PHOTOS_HOST_DIR</code> dans
          le <code>.env</code> et le volume du service <code>api</code>.
        </p>
      )}

      {report.unmatchedArtists.length > 0 && (
        <details>
          <summary className="eyebrow" style={{ cursor: 'pointer' }}>
            Artistes sans photo ({report.unmatchedArtists.length})
          </summary>
          <p className="faint" style={{ fontSize: '0.82rem' }}>
            {report.unmatchedArtists.map((a) => a.name).join(' · ')}
          </p>
          <p className="faint" style={{ fontSize: '0.82rem' }}>
            Pour en rattraper un : ajoutez le nom du fichier comme alias de l'artiste, ou appelez
            <code> PUT /api/admin/photos/&lt;id&gt;</code> avec <code>{'{ "file": "…" }'}</code>.
          </p>
        </details>
      )}

      {report.unusedFiles.length > 0 && (
        <details>
          <summary className="eyebrow" style={{ cursor: 'pointer' }}>
            Fichiers non utilisés ({report.unusedFiles.length})
          </summary>
          <p className="faint" style={{ fontSize: '0.82rem', wordBreak: 'break-all' }}>
            {report.unusedFiles.slice(0, 60).join(' · ')}
            {report.unusedFiles.length > 60 && ` … +${report.unusedFiles.length - 60}`}
          </p>
        </details>
      )}
    </section>
  );
}

function Readout({ value, unit }) {
  return (
    <span className="readout">
      <span className="readout__value">{value}</span>
      <span className="readout__unit">{unit}</span>
    </span>
  );
}
