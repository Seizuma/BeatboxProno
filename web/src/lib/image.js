/**
 * Réduction d'image avant envoi.
 *
 * Une photo de scène sort d'un reflex à 6000 px de large et pèse plusieurs
 * mégaoctets ; le site l'affiche au mieux dans un carré de 96 px. Envoyer
 * l'original, c'est saturer le proxy, remplir le disque du VPS et imposer le
 * téléchargement de ces mégaoctets à chaque visiteur.
 *
 * On redessine donc l'image dans un canvas avant l'envoi. Aucune dépendance :
 * le navigateur sait déjà tout faire.
 */

const MAX_SIDE = 1024; // large de côté : les photos restent nettes en grand
const QUALITY = 0.85;

/** Charge un fichier en bitmap, avec repli sur <img> si createImageBitmap manque. */
async function toBitmap(file) {
    if (typeof createImageBitmap === 'function') {
        try {
            // imageOrientation applique la rotation EXIF : sans elle, une photo prise
            // à la verticale arrive couchée.
            return await createImageBitmap(file, { imageOrientation: 'from-image' });
        } catch {
            /* certains navigateurs refusent l'option : on retombe plus bas */
        }
    }

    const url = URL.createObjectURL(file);
    try {
        return await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("Image illisible."));
            img.src = url;
        });
    } finally {
        URL.revokeObjectURL(url);
    }
}

/**
 * Renvoie une version réduite du fichier, ou le fichier d'origine si le
 * traitement échoue ou n'apporte rien.
 *
 * @param {File} file
 * @returns {Promise<{file: File|Blob, resized: boolean, from: number, to: number}>}
 */
export async function shrinkImage(file) {
    const original = { file, resized: false, from: file.size, to: file.size };

    // Les GIF peuvent être animés : les redessiner les figerait sur une image.
    if (file.type === 'image/gif') return original;

    let bitmap;
    try {
        bitmap = await toBitmap(file);
    } catch {
        return original; // illisible ici : le serveur tranchera
    }

    const { width, height } = bitmap;
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));

    // Déjà petite ET légère : rien à gagner.
    if (scale === 1 && file.size < 900_000) {
        bitmap.close?.();
        return original;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', QUALITY)
    );

    // Si la conversion échoue ou grossit le fichier, on garde l'original.
    if (!blob || blob.size >= file.size) return original;

    return { file: blob, resized: true, from: file.size, to: blob.size };
}

/** « 7,5 Mo », « 180 Ko » */
export function humanSize(bytes) {
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} Mo`;
    return `${Math.round(bytes / 1024)} Ko`;
}