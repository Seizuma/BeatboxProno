import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../lib/context.jsx';
import { useI18n } from '../lib/i18n.jsx';
import DiscordButton from '../components/DiscordButton.jsx';
import PredictionView from '../components/PredictionView.jsx';
import DeleteAccount from '../components/DeleteAccount.jsx';
import { Badge, Banded, FramedAvatar, Name } from '../components/Cosmetics.jsx';
import { BADGES } from '../lib/cosmetics.js';

export default function Profile() {
  const { id } = useParams();
  const { user, loading, refresh, logout } = useSession();
  const { t, date, lang } = useI18n();
  const targetId = id ?? user?.id;

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  // Le pronostic ouvert en lecture. Fonctionne aussi sur le profil d'autrui :
  // le serveur n'expose que les pronostics déposés.
  const [reading, setReading] = useState(null);
  const [busy, setBusy] = useState(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!targetId) return;
    api.get(`/users/${targetId}`).then(setData).catch((e) => setError(e.message));
  }, [targetId]);

  if (loading) return <p className="faint" style={{ marginTop: '2rem' }}>{t('common.loading')}</p>;
  if (!targetId) {
    return (
      <div className="empty" style={{ marginTop: '3rem' }}>
        <p>{t('profile.signin')}</p>
        <DiscordButton />
      </div>
    );
  }
  if (error) return <p className="notice" style={{ marginTop: '2rem' }}>{error}</p>;
  if (!data) return <p className="faint" style={{ marginTop: '2rem' }}>{t('common.loading')}</p>;

  const own = !id || id === user?.id;

  const removeDraft = async (p) => {
    setBusy(p.id);
    try {
      await api.del(`/predictions/${p.id}`);
      setData(await api.get(`/users/${targetId}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  // Le tri suit le statut de l'ÉVÉNEMENT, pas `scoredAt` : celui-ci est posé à
  // chaque recalcul, donc au gré des manipulations d'organisateur. S'y fier
  // rangeait des pronostics vivants parmi les terminés.
  const buckets = [
    ['profile.bucket.live', data.predictions.filter((p) => p.submitted && p.event.status !== 'FINISHED')],
    ['profile.bucket.done', data.predictions.filter((p) => p.submitted && p.event.status === 'FINISHED')],
    ['profile.bucket.drafts', data.predictions.filter((p) => !p.submitted)],
  ];

  // Le mur de badges, groupé par compète. L'ordre serveur est chronologique
  // inversé ; à l'intérieur d'une compète, on range par prestige — l'ordre du
  // catalogue, du vainqueur au fil de fer de la participation.
  const order = new Map(BADGES.map((b) => [b.code, b.rank]));
  const wall = [];
  {
    const byEvent = new Map();
    for (const b of data.badges ?? []) {
      const key = b.event?.slug ?? b.eventId;
      if (!byEvent.has(key)) {
        byEvent.set(key, { event: b.event, codes: [] });
        wall.push(byEvent.get(key));
      }
      byEvent.get(key).codes.push(b.code);
    }
    for (const row of wall) row.codes.sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
  }

  return (
    <Banded bandId={data.user.equippedBand}>
      <div className="stack" style={{ paddingTop: '2.5rem' }}>
        <header className="row" style={{ gap: '1rem' }}>
          {data.user.avatarUrl && (
            <FramedAvatar url={data.user.avatarUrl} frameId={data.user.equippedFrame} size="lg" />
          )}
          <div>
            <p className="eyebrow">
              {t('profile.member', {
                date: date(data.user.createdAt, { month: 'long', year: 'numeric' }),
              })}
            </p>
            <h1>
              <Name fxId={data.user.equippedNameFx}>
                {data.user.globalName ?? data.user.username}
              </Name>
            </h1>
          </div>

          {/* La déconnexion vit ici, avec le reste de ce qui touche au compte.
              Dans la ligne de service, elle voisinait l'avatar : deux cibles de
              quarante pixels côte à côte, dont l'une ferme la session. */}
          {own && user && (
            <button
              className="btn btn--small btn--ghost"
              style={{ marginLeft: 'auto' }}
              onClick={logout}
            >
              {t('nav.logout')}
            </button>
          )}
        </header>

        {/* Sur le profil de quelqu'un d'autre, on le dit. Sans ce repère, les
            chiffres se lisent comme les siens — c'est arrivé en test. */}
        {!own && (
          <p className="notice notice--ok" style={{ margin: 0 }}>
            {t('profile.someoneElse', { name: data.user.globalName ?? data.user.username })}
            {' '}
            <Link to="/me">{t('profile.backToMine')}</Link>
          </p>
        )}

        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <Stat value={data.totals.points} label={t('profile.points')} accent />
          <Stat value={data.totals.submitted} label={t('profile.submitted')} />
          <Stat value={data.totals.pending} label={t('profile.pending')} />
          <Stat value={data.totals.drafts} label={t('profile.drafts')} />
          {/* Le porte-monnaie n'apparaît que chez soi : les points dépensables
              des autres ne regardent personne — leurs badges, si. */}
          {own && data.wallet != null && (
            <div className="panel">
              <p
                className="display"
                style={{ fontSize: 'calc(2.6rem * var(--display-scale))', color: 'var(--g)' }}
              >
                {data.wallet}
              </p>
              <p className="eyebrow" style={{ margin: '0.4rem 0 0' }}>{t('profile.wallet')}</p>
              <Link className="btn btn--small" style={{ marginTop: '0.6rem' }} to="/shop">
                {t('profile.shop.cta')}
              </Link>
            </div>
          )}
        </div>

        {/* Le mur de badges — un palmarès, une ligne par compète. */}
        <section className="stack">
          <h2>{t('profile.badges')}</h2>
          {wall.length === 0 ? (
            <p className="empty">{t('profile.badges.empty')}</p>
          ) : (
            <div className="panel cos-wall">
              {wall.map((row) => (
                <div className="cos-wall__row" key={row.event?.slug ?? 'unknown'}>
                  <div className="cos-wall__event">
                    {row.event ? `${row.event.name} ${row.event.year}` : '—'}
                  </div>
                  {row.codes.map((code) => (
                    <Badge key={code} code={code} scale={2} label={t(`badge.${code}`)} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>

        {buckets.map(([titleKey, rows]) => (
          <section className="stack" key={titleKey}>
            <h2>{t(titleKey)}</h2>
            {rows.length === 0 ? (
              <p className="empty">{t('profile.bucket.empty')}</p>
            ) : (
              <div className="panel panel--flush">
                <table>
                  <thead>
                    <tr>
                      <th>{t('artists.col.event')}</th>
                      <th>{t('artists.col.category')}</th>
                      {/* Les points ne veulent rien dire tant que l'événement
                          n'est pas terminé : la colonne n'apparaît que là. */}
                      {titleKey === 'profile.bucket.done' && (
                        <th className="num">{t('leaderboard.col.points')}</th>
                      )}
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.id}>
                        <td>
                          {p.event.name} {p.event.year}
                          {p.label && (
                            <span className="faint data" style={{ display: 'block', fontSize: '0.8rem' }}>
                              {p.submitted && '★ '}{p.label}
                            </span>
                          )}
                        </td>
                        <td className="muted">{p.category.name}</td>
                        {titleKey === 'profile.bucket.done' && (
                          <td className="num">{p.scoredAt ? p.points : '—'}</td>
                        )}
                        <td className="num">
                          <span className="row" style={{ gap: '0.3rem', justifyContent: 'flex-end' }}>
                            <button className="btn btn--small" onClick={() => setReading(p.id)}>
                              {t('common.open')}
                            </button>
                            {/* Un brouillon se supprime depuis son profil : c'est
                                là qu'on gère ses versions, pas dans l'éditeur. */}
                            {own && !p.submitted && (
                              <button
                                className="btn btn--small btn--danger"
                                disabled={busy === p.id}
                                onClick={() => removeDraft(p)}
                              >
                                {t('draft.delete')}
                              </button>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}

        {/* La zone dangereuse, sur son propre profil seulement. En bas de page et
            bordée de rouge : on ne la croise pas, on va la chercher. */}
        {own && user && (
          <section className="stack" style={{ gap: '0.6rem', marginTop: '2rem' }}>
            <h2>{t('account.zone')}</h2>
            <div className="panel stack" style={{ gap: '0.7rem', borderColor: 'var(--r)' }}>
              <p style={{ margin: 0 }}>{t('account.zone.lede')}</p>
              <span className="row" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
                <a
                  className="btn btn--small"
                  href={`${import.meta.env.VITE_API_URL ?? '/api'}/account/export`}
                  download
                >
                  {t('account.export')}
                </a>
                <button className="btn btn--small btn--danger" onClick={() => setClosing(true)}>
                  {t('account.delete.open')}
                </button>
                <Link className="btn btn--small btn--ghost" to="/privacy">
                  {t('footer.privacy')}
                </Link>
              </span>
            </div>
          </section>
        )}

        {reading && <PredictionView predictionId={reading} onClose={() => setReading(null)} />}

        {closing && (
          <DeleteAccount
            onClose={() => setClosing(false)}
            onDeleted={async () => {
              // La session est déjà invalidée côté serveur ; on rafraîchit pour
              // que l'en-tête cesse d'afficher un compte qui n'existe plus, puis
              // on quitte le profil — dont l'adresse ne mène plus nulle part.
              setClosing(false);
              await refresh();
              window.location.assign('/?deleted=1');
            }}
          />
        )}
      </div>
    </Banded>
  );
}

function Stat({ value, label, accent }) {
  return (
    <div className="panel">
      <p
        className="display"
        style={{ fontSize: 'calc(2.6rem * var(--display-scale))', color: accent ? 'var(--accent)' : 'inherit' }}
      >
        {value}
      </p>
      <p className="eyebrow" style={{ margin: '0.4rem 0 0' }}>{label}</p>
    </div>
  );
}