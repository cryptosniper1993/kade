# Bot-API

`/api/bot/...` met `Authorization: Bearer kade_bot_…` (sleutel aanmaken in [GROK BOTS](grok-bots.md)).

| Methode | Pad | Scope | Wat |
| --- | --- | --- | --- |
| GET | `me` | alle | wie ben ik, scope, project |
| GET | `projects` | sales: alles niet-vertrouwelijk; project: enkel eigen project | projecten met taken en offertes |
| GET | `prospects` | enkel sales | prospectielijst |
| GET | `do-not-contact` | enkel sales | adressen die nooit gemaild mogen worden |
| GET | `approvals` | alle | eigen ingediende concepten |
| POST | `approvals` | alle (project: eigen project) | concept indienen (gaat naar Goedkeuring) |
| POST | `notes`, `next-action`, `tasks` | binnen scope | notitie, volgende actie, taak |
| POST | `prospects/:nr` | enkel sales | beperkte statuswijziging |
| * | `send`, `verzend` | — | altijd **403**: bots versturen nooit |

Buiten scope → **403**. Elke oproep staat in de audit.
