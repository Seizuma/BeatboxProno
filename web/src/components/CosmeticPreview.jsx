import Modal from './Modal.jsx';
import { FramedAvatar, Name, Stamp, bandImage } from './Cosmetics.jsx';
import { itemById } from '../lib/cosmetics.js';

/**
 * L'aperçu d'un objet, là où il se porte.
 *
 * ─── Pourquoi les contextes dépendent de l'emplacement ──────────────────────
 *
 * Une bande de profil ne s'affiche que sur un profil : montrer une ligne de
 * classement à côté ne dirait rien, sinon que la bande n'y apparaît pas. Un
 * tampon, lui, existe à deux endroits — sur le tableau qu'on remplit et sur la
 * carte qu'on partage — et il faut les voir tous les deux, parce que le fond
 * n'est pas le même et que la lisibilité s'y joue.
 *
 * D'où cette table : un emplacement, ses écrans, et rien d'autre.
 */
const CONTEXTS = {
    frame: ['leaderboard', 'profile'],
    nameFx: ['leaderboard', 'profile'],
    band: ['profile'],
    cardSkin: ['card'],
    stamp: ['bracket', 'card'],
};

export default function CosmeticPreview({ item, worn, user, lang, t, onClose }) {
    if (!item) return null;

    // L'objet essayé prime sur ce qui est porté, mais seulement dans SON
    // emplacement : on regarde un cadre sur sa propre tenue, pas sur un profil
    // vidé de tout le reste.
    const pick = (slot) => (item.slot === slot ? item.id : worn?.[slot] ?? null);

    const frame = pick('frame');
    const nameFx = pick('nameFx');
    const band = pick('band');
    const stamp = pick('stamp');
    const skin = itemById(pick('cardSkin'));

    const [bg, accent, ink] = skin?.colors ?? ['var(--screen)', 'var(--y)', 'var(--c)'];
    const bandUrl = bandImage(band);
    const avatar = user?.avatarUrl ?? null;
    const pseudo = user?.globalName ?? user?.username ?? 'SEIZUMA';

    const frameClass = frame ? ` ${itemById(frame)?.css ?? ''}` : '';

    const screens = {
        leaderboard: (
            <div className="shop-live__cell" key="leaderboard">
                <span className="shop-live__title">{t('shop.live.leaderboard')}</span>
                {[1, 2].map((rank) => (
                    <span className="shop-live__row" key={rank}>
                        <span className="shop-live__rank">{rank}</span>
                        {rank === 1 && avatar ? (
                            <FramedAvatar url={avatar} frameId={frame} size="sm" />
                        ) : (
                            <span className={`cos-frame cos-frame--sm${rank === 1 ? frameClass : ''}`} />
                        )}
                        <span>{rank === 1 ? <Name fxId={nameFx}>{pseudo}</Name> : 'NaPoM'}</span>
                        <span className="shop-live__pts">{rank === 1 ? 304 : 288}</span>
                    </span>
                ))}
            </div>
        ),

        profile: (
            <div className="shop-live__cell" key="profile">
                <span className="shop-live__title">{t('shop.live.profile')}</span>
                <span className="shop-live__profile">
                    <span
                        className="shop-live__strip"
                        style={{ backgroundImage: bandUrl, backgroundSize: '1.1rem auto' }}
                    />
                    {avatar ? (
                        <FramedAvatar url={avatar} frameId={frame} size="lg" />
                    ) : (
                        <span className={`cos-frame cos-frame--lg${frameClass}`} />
                    )}
                    <span style={{ flex: 1, minWidth: 0 }}>
                        <Name fxId={nameFx}>{pseudo}</Name>
                    </span>
                    <span
                        className="shop-live__strip shop-live__strip--right"
                        style={{ backgroundImage: bandUrl, backgroundSize: '1.1rem auto' }}
                    />
                </span>
            </div>
        ),

        bracket: (
            <div className="shop-live__cell" key="bracket">
                <span className="shop-live__title">{t('shop.live.bracket')}</span>
                <span className="shop-live__battle">
                    <span style={{ color: 'var(--y)' }}>▸ MARTIN BENATI</span>
                    <span>MOKBAY</span>
                    <Stamp stampId={stamp} lang={lang} />
                </span>
            </div>
        ),

        card: (
            <div className="shop-live__cell" key="card">
                <span className="shop-live__title">{t('shop.live.card')}</span>
                <span className="shop-live__card" style={{ background: bg }}>
                    <b style={{ color: accent }}>GRAND BEATBOX BATTLE 2026</b>
                    <span style={{ color: ink }}>LOOPSTATION · 48 POINTS</span>
                    <Stamp stampId={stamp} lang={lang} />
                </span>
            </div>
        ),
    };

    const shown = CONTEXTS[item.slot] ?? [];

    return (
        <Modal
            title={item.name[lang] ?? item.name.en}
            subtitle={t(`shop.section.${item.slot}`)}
            onClose={onClose}
            narrow={shown.length === 1}
            footer={<button className="btn" onClick={onClose}>{t('common.close')}</button>}
        >
            <div className="shop-live">{shown.map((key) => screens[key])}</div>
            <p className="shop-live__hint" style={{ marginTop: '0.8rem' }}>
                {t('shop.preview.note')}
            </p>
        </Modal>
    );
}