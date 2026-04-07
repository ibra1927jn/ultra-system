# Newsletter → RSS (Kill the Newsletter)

ULTRA System ya consume RSS via `rss.js`. Para suscribirse a newsletters
que NO publican feed, usamos la instancia pública de
[Kill the Newsletter](https://kill-the-newsletter.com) (Leandro Facchinetti).

## Por qué no self-host

KtN no tiene imagen Docker oficial mantenida. La instancia pública lleva
años funcionando, no requiere auth, no rate-limita, y los Atom feeds que
genera son URLs estables. Si en el futuro hay razón de privacidad para
self-host, ver `BACKLOG.md` item separado.

## Workflow

1. Ir a https://kill-the-newsletter.com
2. Introducir un nombre (ej: `ultra-tech-crunch`)
3. KtN devuelve:
   - Email único: `xxxx@kill-the-newsletter.com`
   - Atom feed URL: `https://kill-the-newsletter.com/feeds/xxxx.xml`
4. Suscribir al newsletter usando el email
5. Registrar el feed en ULTRA:

```bash
curl -X POST http://95.217.158.7/api/feeds \
  -H "X-API-Key: $ULTRA_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "url": "https://kill-the-newsletter.com/feeds/xxxx.xml",
    "title": "TechCrunch Newsletter (via KtN)",
    "category": "tech",
    "is_active": true
  }'
```

A partir de aquí el cron de `rss.js` lo procesa como cualquier otro feed:
keyword scoring, dedup MinHash, sentiment, NER.

## Newsletters útiles para empezar

- **Substack** (mayoría sin RSS público): `https://example.substack.com/feed` SÍ funciona en muchas, probar primero. Si 404 → KtN.
- **Beehiiv**: rara vez expone RSS → KtN obligatorio.
- **ConvertKit/Mailchimp/Ghost (free)**: ninguno expone RSS por defecto → KtN.

## Limitaciones

- KtN parsea HTML del email tal cual → algunas newsletters con tracking pixels
  o imágenes inline pueden quedar feos. El scoring de `rss.js` opera sobre
  texto, así que no afecta a alertas.
- Si la instancia pública cae alguna vez, los feeds existentes dejan de
  refrescarse pero no rompen nada (rss.js maneja errores fetch).
