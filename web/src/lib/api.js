const BASE = import.meta.env.VITE_API_URL ?? '/api';

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
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
  put: (p, b) => request('PUT', p, b),
  patch: (p, b) => request('PATCH', p, b),
  del: (p) => request('DELETE', p),
  loginUrl: `${BASE}/auth/discord`,
};
