import { detectLang, translator } from './i18n.jsx';

const BASE = import.meta.env.VITE_API_URL ?? '/api';

/**
 * Les messages d'erreur du transport, dans la langue du visiteur.
 *
 * Ce module vit hors de React : il n'a pas de contexte, donc pas de `useI18n`.
 * On relit la langue à chaque appel plutôt que de la figer au chargement — le
 * sélecteur de langue peut avoir été touché depuis, et une panne réseau ne doit
 * pas répondre dans celle d'avant.
 *
 * Ne concerne QUE les phrases écrites ici. Le texte d'un refus vient du serveur
 * dans `data.error` et reste tel quel : c'est une autre traduction, à faire
 * côté serveur le jour où on s'y mettra.
 */
const tr = (key) => translator(detectLang())(key);

async function request(method, path, body) {
  // Un File ou un Blob part tel quel, avec son propre type MIME : c'est ce que
  // la route de téléversement attend, et ça évite d'embarquer du multipart des
  // deux côtés pour une seule fonctionnalité.
  const raw = typeof Blob !== 'undefined' && body instanceof Blob;

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: raw
        ? { 'Content-Type': body.type || 'application/octet-stream' }
        : body
          ? { 'Content-Type': 'application/json' }
          : undefined,
      body: raw ? body : body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(tr('api.offline'));
  }

  const text = await res.text();
  let data = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // Une passerelle en panne renvoie du HTML. Inutile de montrer
      // « unexpected character » à quelqu'un qui voulait juste pronostiquer.
      const err = new Error(
        res.status >= 500 ? tr('api.down') : tr('api.unexpected')
      );
      err.status = res.status;
      throw err;
    }
  }

  if (!res.ok) {
    const err = new Error(data.error ?? tr('api.failed'));
    err.status = res.status;
    err.details = data.details;
    // Le corps complet, pour les refus qui portent une information exploitable
    // plutôt qu'une simple phrase : un 409 qui chiffre ce qu'une manœuvre
    // détruirait n'est utile que si l'appelant peut lire ce compte. Sans lui,
    // il fallait recopier chaque champ dans `details` au cas par cas.
    err.body = data;
    throw err;
  }
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b),
  upload: (p, file) => request('POST', p, file),
  put: (p, b) => request('PUT', p, b),
  patch: (p, b) => request('PATCH', p, b),
  // Un corps sur DELETE : la suppression de compte demande la saisie du pseudo,
  // qui n'a pas sa place dans l'URL — elle finirait dans les journaux d'accès.
  del: (p, b) => request('DELETE', p, b),
  loginUrl: `${BASE}/auth/discord`,
  // La même porte, avec une destination de retour. Sert aux liens
  // d'invitation : quelqu'un qui se connecte depuis une invitation doit
  // revenir sur cette invitation, pas sur « mes pronostics ». Le serveur
  // refuse toute destination qui n'est pas un chemin interne.
  loginWith: (next) => `${BASE}/auth/discord?next=${encodeURIComponent(next)}`,
};