-- Écarter un compte d'UN événement.
--
-- ─── Pourquoi ce n'est pas un bannissement ───────────────────────────────────
--
-- Le bannissement ferme le site entier. C'est disproportionné quand le problème
-- tient à une seule compète : quelqu'un qui a triché sur un événement n'a pas de
-- raison de perdre l'accès aux autres, à ses groupes et à son palmarès.
-- L'exclusion est le cran d'en dessous, et les deux mesures cohabitent.
--
-- ─── Ce qu'elle ne fait pas ──────────────────────────────────────────────────
--
-- Elle n'efface rien. Les pronostics déjà déposés restent en base et continuent
-- de compter. Les retirer est un SECOND geste, délibéré, qui passe par la
-- suppression de pronostic. Lier les deux ferait disparaître des points sans
-- qu'on l'ait demandé, et sur un incident qui n'est pas toujours avéré au
-- moment où l'on ferme la porte.
--
-- ─── Le motif est obligatoire ────────────────────────────────────────────────
--
-- NOT NULL, contrairement au `banReason` du bannissement qui, lui, n'est
-- renseigné que lorsque la mesure est posée. Ici la ligne n'existe QUE pour
-- porter une exclusion : il n'y a pas d'état « sans motif » à représenter.
CREATE TABLE "EventExclusion" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "byId" TEXT,

    CONSTRAINT "EventExclusion_pkey" PRIMARY KEY ("id")
);

-- Un compte n'est écarté qu'une fois par événement. C'est aussi l'index que
-- consulte chaque écriture de pronostic : la question posée est toujours
-- « ce compte est-il écarté de CET événement ? ».
CREATE UNIQUE INDEX "EventExclusion_eventId_userId_key" ON "EventExclusion"("eventId", "userId");

-- La question inverse — « de quoi ce compte est-il écarté ? » — posée depuis
-- l'onglet Comptes.
CREATE INDEX "EventExclusion_userId_idx" ON "EventExclusion"("userId");

ALTER TABLE "EventExclusion" ADD CONSTRAINT "EventExclusion_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventExclusion" ADD CONSTRAINT "EventExclusion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL et non CASCADE : le départ de l'organisateur qui a décidé
-- l'exclusion ne doit pas la lever. La mesure survit à son auteur.
ALTER TABLE "EventExclusion" ADD CONSTRAINT "EventExclusion_byId_fkey" FOREIGN KEY ("byId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
