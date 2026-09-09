import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useSession } from '../lib/context.jsx';
import { useI18n } from '../lib/i18n.jsx';
import DiscordButton from '../components/DiscordButton.jsx';
import { Badge, Preview } from '../components/Cosmetics.jsx';
import CosmeticPreview from '../components/CosmeticPreview.jsx';
import BadgeDetail from '../components/BadgeDetail.jsx';
import { DEFAULT_SET } from '../lib/badgeSets.js';
import { BADGES, SLOTS, discountedPrice, itemsForSlot } from '../lib/cosmetics.js';

/**
 * P470 · LA BOUTIQUE
 *
 * La vitrine se visite déconnecté : quelqu'un qui découvre le site doit pouvoir
 * voir ce qu'il y a à gagner avant de décider s'il s'inscrit. Seuls l'achat et
 * l'équipement demandent une session.
 */
export default function Shop() {
    const { user } = useSession();
    const { t, lang, date } = useI18n();

    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(null);
    // Le badge consulté depuis la légende : la règle, sans compète ni date.
    const [sheet, setSheet] = useState(null);
    // L'objet dont on regarde l'aperçu. Un panneau permanent en tête de page
    // obligeait à faire l'aller-retour entre la vitrine et lui ; ici l'aperçu
    // vient à l'objet.
    const [trying, setTrying] = useState(null);

    useEffect(() => {
        api.get('/shop').then(setData).catch((e) => setError(e.message));
    }, [user?.id]);

    const owned = useMemo(() => new Set(data?.owned ?? []), [data]);
    const worn = data?.equipped ?? {};
    const promos = data?.promos ?? {};

    /**
     * L'ordre d'un rayon : les plus achetés d'abord.
     *
     * Le classement vient du serveur et ne bouge que tous les deux jours. Un
     * objet absent de la tendance — ajouté au catalogue depuis le dernier calcul
     * — se range à la fin plutôt que de disparaître : mieux vaut mal placé que
     * pas là.
     */
    const rank = useMemo(() => {
        const order = new Map((data?.trend ?? []).map((id, i) => [id, i]));
        return (item) => order.get(item.id) ?? 9999;
    }, [data]);

    async function run(action, body) {
        setBusy(body.itemId ?? body.slot);
        try {
            setData(await api.post(`/shop/${action}`, body));
            setError(null);
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(null);
        }
    }

    if (error && !data) return <p className="notice" style={{ marginTop: '2rem' }}>{error}</p>;
    if (!data) return <p className="faint" style={{ marginTop: '2rem' }}>{t('common.loading')}</p>;

    return (
        <div className="stack" style={{ paddingTop: '2.5rem' }}>
            <header>
                <p className="eyebrow">{t('shop.eyebrow')}</p>
                <h1>{t('shop.title')}</h1>
            </header>

            <div className="panel">
                <div className="shop-balance">
                    <span className="shop-balance__value">{data.balance}</span>
                    <span className="eyebrow" style={{ margin: 0 }}>{t('shop.balance')}</span>
                </div>
                <p className="faint" style={{ margin: '0.6rem 0 0', maxWidth: '62ch' }}>
                    {t('shop.balance.lede')}
                </p>
                {!user && (
                    <p className="row" style={{ gap: '0.7rem', alignItems: 'center', marginTop: '0.8rem' }}>
                        <span>{t('shop.signin')}</span>
                        <DiscordButton />
                    </p>
                )}
            </div>

            {error && <p className="notice">{error}</p>}

            {/* Une seule ligne pour toute la page : répéter l'échéance sur chaque
                carte en promotion la rendrait invisible à force. */}
            {Object.keys(promos).length > 0 && (
                <p className="notice notice--ok" style={{ margin: 0 }}>
                    {t('shop.promo.banner', {
                        n: Object.keys(promos).length,
                        date: data.promoEndsAt
                            ? date(data.promoEndsAt, { weekday: 'long', day: 'numeric', month: 'long' })
                            : '—',
                    })}
                </p>
            )}


            {SLOTS.map((slot) => (
                <section className="stack" key={slot.id}>
                    <h2>{t(`shop.section.${slot.id}`)}</h2>
                    <p className="faint" style={{ margin: 0 }}>{t(`shop.section.${slot.id}.lede`)}</p>

                    <div className="shop-grid">
                        {[...itemsForSlot(slot.id)].sort((a, b) => rank(a) - rank(b)).map((item) => {
                            const has = owned.has(item.id) || item.price === 0;
                            const on = worn[slot.id] === item.id;
                            const percent = promos[item.id] ?? 0;
                            const price = discountedPrice(item.price, percent);
                            const tooPoor = data.balance < price;

                            return (
                                <article
                                    className={`shop-card${on ? ' shop-card--worn' : ''}${percent ? ' shop-card--promo' : ''}`}
                                    key={item.id}
                                >
                                    {/* La pastille de remise se pose sur la vignette et non
                                        à côté du prix : c'est ce qu'on voit en balayant la
                                        grille, avant même d'avoir lu un nom. */}
                                    {percent > 0 && <span className="shop-promo">−{percent} %</span>}

                                    <div className="shop-card__stage">
                                        <Preview item={item} avatarUrl={user?.avatarUrl} lang={lang} />
                                    </div>

                                    <p className="shop-card__name">{item.name[lang] ?? item.name.en}</p>
                                    <p className="shop-card__price">
                                        {item.price === 0 ? (
                                            t('shop.free')
                                        ) : percent > 0 ? (
                                            <>
                                                <s className="shop-card__was">{item.price}</s>{' '}
                                                <strong>{price}</strong> {t('shop.points')}
                                            </>
                                        ) : (
                                            `${item.price} ${t('shop.points')}`
                                        )}
                                        {item.animated && ` · ${t('shop.animated')}`}
                                    </p>

                                    <div className="shop-card__actions">
                                        {/* L'aperçu vient en premier : on regarde
                                            avant d'acheter, et l'ordre des boutons
                                            dit l'ordre des gestes. */}
                                        <button
                                            className="btn btn--small btn--ghost"
                                            onClick={() => setTrying(item)}
                                        >
                                            {t('shop.preview')}
                                        </button>
                                        {!has && (
                                            <button
                                                className="btn btn--small btn--primary"
                                                disabled={!user || tooPoor || busy === item.id}
                                                onClick={() => run('buy', { itemId: item.id })}
                                            >
                                                {t('shop.buy')}
                                            </button>
                                        )}
                                        {has && !on && (
                                            <button
                                                className="btn btn--small"
                                                disabled={!user || busy === item.id}
                                                onClick={() => run('equip', { slot: slot.id, itemId: item.id })}
                                            >
                                                {t('shop.equip')}
                                            </button>
                                        )}
                                        {on && (
                                            <button
                                                className="btn btn--small btn--ghost"
                                                disabled={busy === slot.id}
                                                onClick={() => run('equip', { slot: slot.id, itemId: null })}
                                            >
                                                {t('shop.unequip')}
                                            </button>
                                        )}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </section>
            ))}

            {/* Les badges ferment la page : ils ne s'achètent pas, mais c'est
                souvent en les voyant qu'on comprend à quoi servent les points. */}
            <section className="stack">
                <h2>{t('shop.badges')}</h2>
                <p className="faint" style={{ margin: 0 }}>{t('shop.badges.lede')}</p>
                <div className="panel shop-legend">
                    {BADGES.map((b) => (
                        <div className="shop-legend__item" key={b.code}>
                            <Badge
                                code={b.code}
                                /* La légende décrit la RÈGLE, sans compète :
                                   pas de famille à déduire, on retombe sur
                                   celle du catalogue. */
                                set={DEFAULT_SET}
                                scale={2}
                                label={t(`badge.${b.code}`)}
                                onClick={() => setSheet(b.code)}
                            />
                            <span className="shop-legend__label">{t(`badge.${b.code}`)}</span>
                        </div>
                    ))}
                </div>
            </section>

            {trying && (
                <CosmeticPreview
                    item={trying}
                    worn={worn}
                    user={user}
                    lang={lang}
                    t={t}
                    onClose={() => setTrying(null)}
                />
            )}

            {sheet && (
                <BadgeDetail code={sheet} set={DEFAULT_SET} t={t} date={date} onClose={() => setSheet(null)} />
            )}
        </div>
    );
}