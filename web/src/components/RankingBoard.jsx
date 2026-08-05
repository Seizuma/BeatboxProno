import { useMemo } from 'react';

/**
 * Classement à composer. L'ordre est le pronostic : on ajoute les contenders
 * un par un, on les remonte ou les descend. Pas de glisser-déposer, pour que
 * ça marche au clavier et sur téléphone.
 */
export default function RankingBoard({ phase, contenders, order, onChange, locked }) {
  const picked = useMemo(
    () => order.map((id) => contenders.find((c) => c.id === id)).filter(Boolean),
    [order, contenders]
  );
  const remaining = contenders.filter((c) => !order.includes(c.id));
  const cut = phase.qualifierCount ?? null;

  const move = (index, delta) => {
    const next = [...order];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="ladder">
      <div>
        <p className="eyebrow">
          Votre classement{cut ? ` — ${cut} qualifiés` : ''}
        </p>

        {picked.length === 0 && (
          <p className="faint" style={{ fontSize: '0.88rem' }}>
            Choisissez un premier nom dans la colonne de droite.
          </p>
        )}

        {picked.map((c, i) => (
          <div key={c.id}>
            {cut && i === cut && (
              <p className="slot__cut-label">
                <span className="slot__cut" style={{ display: 'block' }} />
                Ligne de qualification
              </p>
            )}
            <div className={`slot${cut && i < cut ? ' slot--qualified' : ''}`}>
              <span className="slot__rank">{i + 1}</span>
              <span className="slot__name">{c.name}</span>
              <button
                className="btn btn--small btn--ghost"
                onClick={() => move(i, -1)}
                disabled={locked || i === 0}
                aria-label={`Monter ${c.name}`}
              >
                ↑
              </button>
              <button
                className="btn btn--small btn--ghost"
                onClick={() => move(i, 1)}
                disabled={locked || i === picked.length - 1}
                aria-label={`Descendre ${c.name}`}
              >
                ↓
              </button>
              <button
                className="btn btn--small btn--ghost"
                onClick={() => onChange(order.filter((id) => id !== c.id))}
                disabled={locked}
                aria-label={`Retirer ${c.name}`}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      <div>
        <p className="eyebrow">À placer ({remaining.length})</p>
        {remaining.length === 0 && (
          <p className="faint" style={{ fontSize: '0.88rem' }}>Tout le monde est classé.</p>
        )}
        {remaining.map((c) => (
          <div className="slot" key={c.id}>
            <span className="battle__seed">{c.seed ?? '—'}</span>
            <span className="slot__name">{c.name}</span>
            <button
              className="btn btn--small"
              onClick={() => onChange([...order, c.id])}
              disabled={locked}
            >
              Placer {order.length + 1}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
