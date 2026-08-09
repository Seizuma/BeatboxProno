/**
 * Les splits de votes possibles pour un nombre de juges donné.
 *
 * Un vainqueur doit rassembler la majorité : à 3 juges, 3-0 et 2-1 ; à 5 juges,
 * 5-0, 4-1 et 3-2. On génère les deux orientations, parce que l'affiche a un
 * côté A et un côté B et que l'utilisateur désigne l'un ou l'autre.
 *
 * Le nombre de juges pair est ramené à l'impair inférieur : une compète ne peut
 * pas se conclure sur une égalité, et un panel pair est presque toujours une
 * saisie erronée.
 */
export function splitsFor(judgeCount) {
    const judges = Math.max(1, Math.floor(Number(judgeCount) || 3));
    const odd = judges % 2 === 0 ? judges - 1 : judges;
    const majority = Math.floor(odd / 2) + 1;

    const splits = [];
    for (let win = odd; win >= majority; win -= 1) {
        splits.push({ a: win, b: odd - win });
    }
    // Puis les mêmes vus depuis l'autre côté de l'affiche.
    for (let i = splits.length - 1; i >= 0; i -= 1) {
        splits.push({ a: splits[i].b, b: splits[i].a });
    }
    return splits.map((s) => ({ ...s, label: `${s.a} – ${s.b}`, value: `${s.a}-${s.b}` }));
}

/** Le nombre de juges applicable à une phase : sa surcharge, sinon l'événement. */
export const judgesFor = (phase, event) => phase?.judgeCount ?? event?.judgeCount ?? 3;