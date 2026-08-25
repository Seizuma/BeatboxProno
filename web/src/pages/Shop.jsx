import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useSession } from '../lib/context.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { BADGES, SLOTS } from '../lib/cosmetics.js';
import { BadgeMedal, Flair, FramedAvatar, Title } from '../components/Cosmetics.jsx';
import DiscordButton from '../components/DiscordButton.jsx';

/**
 * P470 · LA BOUTIQUE.
 *
 * La vitrine se visite déconnecté — seul l'achat demande une session. Le
 * catalogue affiché vient du SERVEUR, pas du bundle : pendant un déploiement,
 * un client sur un vieux bundle montre ainsi les bons prix, et le serveur
 * reste seul juge au moment de payer.
 *
 * L'aperçu d'un cadre se fait sur SON PROPRE avatar : voir l'objet porté vaut
 * mieux que n'importe quelle description.
 */
export default function Shop() {
    const { user } = useSession();
    const { t, lang } = useI18n();

    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(null);

    const load = () => api.get('/shop').then(setData).catch((e) => setError(e.message));
    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    if (error) return <p className="notice" style={{ marginTop: '2rem' }}>{error}</p>;
    if (!data) return <p className="faint" style={{ marginTop: '2rem' }}>{t('common.loading')}</p>;

    const owned = new Set(data.owned ?? []);
    const equipped = data.equipped ?? {};

    const buy = async (item) => {
        setBusy(item.id);
        setError(null);
        try {
            await api.post('/shop/buy', { itemId: item.id });
            await load();
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(null);
        }
    };

    const equip = async (item, off = false) => {
        setBusy(item.id);
        setError(null);
        try {
            await api.post('/shop/equip', { slot: item.slot, itemId: off ? null : item.id });
            await load();
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(null);
        }
    };

    const preview = (item) => {
        if (item.slot === 'frame') {
            // Sans session, un carré neutre fait l'affaire : la vitrine reste lisible.
            const url = user?.avatarUrl ?? null;
            return url ? (
                <FramedAvatar url={url} frameId={item.id} size="lg" />
            ) : (
                <span className={`cos-frame cos-frame--lg cos-frame--${item.id}`}>
                    <span style={{ display: 'block', width: '100%', height: '100%', background: 'var(--surface-2)' }} />
                </span>
            );
        }
        if (item.slot === 'title') return <Title itemId={item.id} lang={lang} />;
        return <Flair itemId={item.id} size={40} />;
    };

    return (
        <div className="stack" style={{ paddingTop: '2.5rem' }}>
            <header className="stack" style={{ gap: '0.5rem' }}>
                <p className="eyebrow">{t('shop.eyebrow')}</p>
                <h1>{t('shop.title')}</h1>

                {user ? (
                    <div className="shop-balance">
                        <span className="shop-balance__amount data">{data.balance ?? 0}</span>
                        <span className="eyebrow">{t('shop.balance')}</span>
                    </div>
                ) : (
                    <div className="row" style={{ gap: '0.8rem', flexWrap: 'wrap' }}>
                        <p className="faint" style={{ margin: 0 }}>{t('shop.signin')}</p>
                        <DiscordButton />
                    </div>
                )}
                <p className="faint" style={{ margin: 0, maxWidth: '60ch' }}>{t('shop.balance.lede')}</p>
            </header>

            {SLOTS.map((slot) => (
                <section className="stack" key={slot}>
                    <h2>{t(`shop.section.${slot}`)}</h2>
                    <div className="shop-grid">
                        {data.items.filter((i) => i.slot === slot).map((item) => {
                            const has = owned.has(item.id);
                            const worn = equipped?.[
                                { frame: 'equippedFrame', title: 'equippedTitle', flair: 'equippedFlair' }[slot]
                            ] === item.id;
                            const affordable = user && (data.balance ?? 0) >= item.price;

                            return (
                                <article className={`shop-card${has ? ' shop-card--owned' : ''}`} key={item.id}>
                                    <div className="shop-card__preview">{preview(item)}</div>
                                    <h3 className="shop-card__name">{item.name[lang] ?? item.name.en}</h3>
                                    <p className="shop-card__blurb">{item.blurb[lang] ?? item.blurb.en}</p>
                                    <div className="shop-card__foot">
                                        <span className="shop-price">{item.price} pts</span>
                                        {!user ? null : !has ? (
                                            <button
                                                className="btn btn--small"
                                                disabled={!affordable || busy === item.id}
                                                onClick={() => buy(item)}
                                            >
                                                {t('shop.buy')}
                                            </button>
                                        ) : worn ? (
                                            <button
                                                className="btn btn--small btn--ghost"
                                                disabled={busy === item.id}
                                                onClick={() => equip(item, true)}
                                            >
                                                {t('shop.unequip')}
                                            </button>
                                        ) : (
                                            <button
                                                className="btn btn--small"
                                                disabled={busy === item.id}
                                                onClick={() => equip(item)}
                                            >
                                                {t('shop.equip')}
                                            </button>
                                        )}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </section>
            ))}

            {/* La carotte, affichée là où l'on dépense : ce qui ne s'achète pas. */}
            <section className="stack">
                <h2>{t('shop.badges')}</h2>
                <p className="faint" style={{ margin: 0, maxWidth: '60ch' }}>{t('shop.badges.lede')}</p>
                <div className="shop-legend">
                    {BADGES.map((b) => (
                        <div className="shop-legend__item" key={b.code}>
                            <BadgeMedal code={b.code} size={48} />
                            <p>{t(`badge.${b.code}`)}</p>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}