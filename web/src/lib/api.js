const BASE = import.meta.env.VITE_API_URL ?? '/api';

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
    throw new Error('Le serveur est injoignable. Vérifiez votre connexion.');
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
        res.status >= 500
          ? 'Le serveur ne répond pas. Réessayez dans un instant.'
          : 'Réponse inattendue du serveur.'
      );
      err.status = res.status;
      throw err;
    }
  }

  if (!res.ok) {
    const err = new Error(data.error ?? "La requête n'a pas abouti.");
    err.status = res.status;
    err.details = data.details;
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