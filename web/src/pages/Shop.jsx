import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useSession } from '../lib/context.jsx';
import { useI18n } from '../lib/i18n.jsx';
import DiscordButton from '../components/DiscordButton.jsx';
import { Badge, FramedAvatar, Name, Preview, Stamp, bandImage } from '../components/Cosmetics.jsx';
import BadgeDetail from '../components/BadgeDetail.jsx';
import { BADGES, SLOTS, itemById, itemsForSlot } from '../lib/cosmetics.js';

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
    // L'objet survolé dans la vitrine. Il s'applique aux maquettes le temps du
    // survol : on repose la souris, on retrouve sa tenue.
    const [trying, setTrying] = useState(null);

    useEffect(() => {
        api.get('/shop').then(setData).catch((e) => setError(e.message));
    }, [user?.id]);

    const owned = useMemo(() => new Set(data?.owned ?? []), [data]);
    const worn = data?.equipped ?? {};

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

            <section className="stack">
                <h2>{t('shop.live')}</h2>
                <p className="shop-live__hint">{t('shop.live.lede')}</p>
                <LivePreview worn={worn} trying={trying} user={user} lang={lang} t={t} />
            </section>

            {SLOTS.map((slot) => (
                <section className="stack" key={slot.id}>
                    <h2>{t(`shop.section.${slot.id}`)}</h2>
                    <p className="faint" style={{ margin: 0 }}>{t(`shop.section.${slot.id}.lede`)}</p>

                    <div className="shop-grid">
                        {itemsForSlot(slot.id).map((item) => {
                            const has = owned.has(item.id) || item.price === 0;
                            const on = worn[slot.id] === item.id;
                            const tooPoor = data.balance < item.price;

                            return (
                                <article
                                    className={`shop-card${on ? ' shop-card--worn' : ''}`}
                                    key={item.id}
                                    // Le survol ET le focus : quelqu'un qui
                                    // parcourt la vitrine au clavier doit voir la
                                    // même chose que quelqu'un à la souris.
                                    onMouseEnter={() => setTrying(item)}
                                    onMouseLeave={() => setTrying(null)}
                                    onFocus={() => setTrying(item)}
                                    onBlur={() => setTrying(null)}
                                >
                                    <div className="shop-card__stage">
                                        <Preview item={item} avatarUrl={user?.avatarUrl} lang={lang} />
                                    </div>

                                    <p className="shop-card__name">{item.name[lang] ?? item.name.en}</p>
                                    <p className="shop-card__price">
                                        {item.price === 0 ? t('shop.free') : `${item.price} ${t('shop.points')}`}
                                        {item.animated && ` · ${t('shop.animated')}`}
                                    </p>

                                    <div className="shop-card__actions">
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
                                scale={2}
                                label={t(`badge.${b.code}`)}
                                onClick={() => setSheet(b.code)}
                            />
                            <span className="shop-legend__label">{t(`badge.${b.code}`)}</span>
                        </div>
                    ))}
                </div>
            </section>

            {sheet && (
                <BadgeDetail code={sheet} t={t} date={date} onClose={() => setSheet(null)} />
            )}
        </div>
    );
}


/**
 * Les quatre endroits où un cosmétique se voit.
 *
 * La vitrine montrait chaque objet seul sur fond noir : on jugeait un cadre de
 * cinq pixels sur une vignette, un tampon sur rien du tout, un skin sur deux
 * lignes de texte. Ici ce sont les vraies proportions — une rangée de
 * classement, un en-tête de profil, une affiche de bracket, une carte
 * d'export — et les animations tournent pour de bon.
 *
 * `trying` prime sur ce qui est porté, emplacement par emplacement : survoler
 * un cadre ne doit pas retirer le tampon qu'on porte déjà.
 */
function LivePreview({ worn, trying, user, lang, t }) {
    const pick = (slot) => (trying?.slot === slot ? trying.id : worn[slot] ?? null);

    const frame = pick('frame');
    const nameFx = pick('nameFx');
    const band = pick('band');
    const stamp = pick('stamp');
    const skinId = pick('cardSkin');

    const skin = itemById(skinId);
    const [bg, accent, ink] = skin?.colors ?? ['var(--screen)', 'var(--y)', 'var(--c)'];

    const bandUrl = bandImage(band);
    const avatar = user?.avatarUrl ?? null;
    const pseudo = user?.globalName ?? user?.username ?? 'SEIZUMA';

    return (
        <div className="shop-live">
            {/* 1. Le classement — l'endroit le plus vu du site. */}
            <div className="shop-live__cell">
                <span className="shop-live__title">{t('shop.live.leaderboard')}</span>
                {[1, 2].map((rank) => (
                    <span className="shop-live__row" key={rank}>
                        <span className="shop-live__rank">{rank}</span>
                        {rank === 1 && avatar ? (
                            <FramedAvatar url={avatar} frameId={frame} size="sm" />
                        ) : (
                            <span className={`cos-frame cos-frame--sm${rank === 1 && frame ? ` ${itemById(frame)?.css ?? ''}` : ''}`} />
                        )}
                        <span>
                            {rank === 1 ? <Name fxId={nameFx}>{pseudo}</Name> : 'NaPoM'}
                        </span>
                        <span className="shop-live__pts">{rank === 1 ? 304 : 288}</span>
                    </span>
                ))}
            </div>

            {/* 2. Le profil — le seul écran qui porte les bandes. */}
            <div className="shop-live__cell">
                <span className="shop-live__title">{t('shop.live.profile')}</span>
                <span className="shop-live__profile">
                    <span
                        className="shop-live__strip"
                        style={{ backgroundImage: bandUrl, backgroundSize: '0.9rem auto' }}
                    />
                    {avatar ? (
                        <FramedAvatar url={avatar} frameId={frame} size="lg" />
                    ) : (
                        <span className={`cos-frame cos-frame--lg${frame ? ` ${itemById(frame)?.css ?? ''}` : ''}`} />
                    )}
                    <span style={{ flex: 1, minWidth: 0 }}>
                        <Name fxId={nameFx}>{pseudo}</Name>
                    </span>
                    <span
                        className="shop-live__strip shop-live__strip--right"
                        style={{ backgroundImage: bandUrl, backgroundSize: '0.9rem auto' }}
                    />
                </span>
            </div>

            {/* 3. Le tableau — le tampon s'y pose. */}
            <div className="shop-live__cell">
                <span className="shop-live__title">{t('shop.live.bracket')}</span>
                <span className="shop-live__battle">
                    <span style={{ color: 'var(--y)' }}>▸ MARTIN BENATI</span>
                    <span>MOKBAY</span>
                    <Stamp stampId={stamp} lang={lang} />
                </span>
            </div>

            {/* 4. La carte partagée — la seule chose que voient les gens sans
                compte. C'est aussi la seule maquette où le skin se juge. */}
            <div className="shop-live__cell">
                <span className="shop-live__title">{t('shop.live.card')}</span>
                <span className="shop-live__card" style={{ background: bg }}>
                    <b style={{ color: accent }}>GRAND BEATBOX BATTLE 2026</b>
                    <span style={{ color: ink }}>LOOPSTATION · 48 POINTS</span>
                    <Stamp stampId={stamp} lang={lang} />
                </span>
            </div>
        </div>
    );
}