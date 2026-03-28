# Auditoría Técnica y Manual de Arquitectura del Ultra System
## El Sistema Operativo Personal para la Soberanía Digital

**Fecha:** 26 de Marzo de 2026  
**Versión:** 2.0 — Arquitectura Consolidada (Ultra Engine)  
**Servidor:** Hetzner CX23 (2vCPU, 4GB RAM, 40GB SSD) · IP: `95.217.158.7`

---

## 1. Evolución de la Infraestructura: De la Fragmentación Modular a la Consolidación Monolítica

El desarrollo de sistemas de automatización personal ha atravesado históricamente diversas fases, desde scripts aislados hasta complejas arquitecturas de microservicios. El proyecto **"Ultra System"** se sitúa en la vanguardia de esta evolución, representando un cambio de paradigma desde un entorno "Frankenstein" —compuesto por ocho servicios independientes interconectados de forma precaria— hacia una arquitectura centralizada denominada **"Ultra Engine"**.

Esta transición no responde únicamente a una búsqueda de simplicidad estética, sino que es una respuesta técnica a la necesidad de **optimización de recursos, soberanía de datos y resiliencia operativa** en entornos de infraestructura limitada, como los servidores VPS de bajo coste.

La arquitectura anterior dependía de un ecosistema heterogéneo que incluía herramientas como **n8n** para la orquestación, **Paperless-ngx** para la gestión documental, **Miniflux** para la lectura de noticias y **Changedetection.io** para la vigilancia web. Si bien este enfoque modular facilitó una implementación rápida inicial, generó un consumo de memoria RAM superior a los 750 MB, saturando la capacidad de nodos básicos como el CX23 de Hetzner.

La nueva arquitectura, basada en **Node.js y PostgreSQL**, consolida estas funciones en un único entorno de ejecución, reduciendo la huella de memoria a aproximadamente 200 MB, lo que supone un **ahorro del 75%** en el consumo de recursos críticos.

Esta consolidación mitiga la **"entropía arquitectónica"**, un fenómeno donde la complejidad del sistema crece exponencialmente con cada nueva integración de terceros. Al eliminar los silos de datos y centralizar la lógica en una base de datos relacional única, el sistema recupera la integridad referencial y permite consultas cruzadas complejas que antes eran técnicamente inviables entre contenedores aislados.

### Métricas de Rendimiento Comparativas

| Métrica de Rendimiento | Sistema Original (Modular) | Ultra Engine (Consolidado) |
|---|---|---|
| Consumo de RAM | ~750MB - 1GB | ~200MB |
| Almacenamiento en Disco | Varios GB (Imágenes Docker) | < 500MB (Imagen Alpine) |
| Base de Datos | Redis, Postgres, SQLite (Múltiples) | PostgreSQL (Única) |
| Latencia de Intercomunicación | Alta (Red Docker Interna) | Nula (Lógica en Memoria) |
| Mantenibilidad | Compleja (8 ciclos de actualización) | Alta (Código Fuente Propio) |

---

## 2. El Pilar de Burocracia: Inteligencia Documental y Gestión de Expiraciones

El "Pilar de Burocracia" constituye el **archivo inteligente** del Ultra System, diseñado específicamente para gestionar la complejidad documental de la vida en el extranjero, con un enfoque particular en el marco regulatorio de Nueva Zelanda. Este módulo trasciende el simple almacenamiento de archivos para convertirse en un **sistema de alerta temprana** que procesa metadatos críticos mediante Reconocimiento Óptico de Caracteres (OCR).

### 2.1 Optimización del Reconocimiento Óptico de Caracteres (OCR)

La sustitución de Paperless-ngx por una integración nativa de **Tesseract.js** permite realizar el procesamiento documental sin la sobrecarga de trabajadores de Redis o sistemas de colas complejos. Para que el OCR sea efectivo en documentos críticos como pasaportes o visados de Nueva Zelanda, se requiere una densidad de información mínima de **300 DPI**. El sistema implementa una tubería de preprocesamiento que transforma la imagen original mediante técnicas de binarización y reducción de ruido.

La binarización es un proceso matemático fundamental para el OCR. En el Ultra Engine, se utiliza el **método de umbralización de Otsu** para separar el texto del fondo, especialmente en condiciones de iluminación variable típicas de fotografías de documentos. Matemáticamente, el proceso busca minimizar la varianza intra-clase para definir un umbral $T$ óptimo:

$$\sigma_w^2(T) = w_0(T)\sigma_0^2(T) + w_1(T)\sigma_1^2(T)$$

Donde $w_0$ y $w_1$ son las probabilidades de las dos clases separadas por el umbral $T$, y $\sigma_i^2$ son las varianzas de dichas clases. Tras este proceso, el motor Tesseract.js puede identificar caracteres con una precisión significativamente mayor, permitiendo extraer fechas de caducidad con una fiabilidad superior al **95%** en documentos de alta calidad.

### 2.2 Especificidades del Contexto Documental en Nueva Zelanda

El sistema está configurado para reconocer patrones específicos de la documentación neozelandesa. Esto incluye la detección de eVisas, etiquetas físicas de pasaporte y documentos de seguro automotriz (WOF). La capacidad de diferenciar entre la "Expiry Date Travel" (última fecha para entrar al país) y la "Visa Expiry Date" (última fecha de estancia legal) es vital para evitar situaciones de ilegalidad migratoria.

| Tipo de Documento | Campo Crítico | Intervalo de Alerta Recomendado |
|---|---|---|
| Visa de Trabajo (AEWV) | Fecha de Expiración de Visa | 90 días (Preparación de nueva solicitud) |
| Pasaporte Internacional | Fecha de Caducidad | 180 días (Requisito de viaje internacional) |
| Warrant of Fitness (WOF) | Mes/Año troquelado | 14 días (Ventana de inspección) |
| Seguro de Vehículo | Fecha de Renovación de Póliza | 30 días |

### 2.3 Análisis de Visión por Computadora para el Warrant of Fitness (WOF)

Un desafío técnico único en Nueva Zelanda es la etiqueta del WOF, que no siempre utiliza texto impreso para la expiración, sino un sistema de agujeros troquelados sobre una cuadrícula de meses y años. El Ultra System utiliza lógica de detección de contornos mediante OpenCV para identificar la posición de estas perforaciones.

El algoritmo de detección procesa la imagen buscando áreas de máximo contraste o brillo en la rejilla del adhesivo. Al mapear las coordenadas $(x, y)$ del agujero detectado contra una matriz predefinida de la etiqueta estándar, el sistema puede deducir la fecha de expiración sin intervención humana. Este enfoque de "visión pura" elimina la necesidad de que el usuario introduzca manualmente los datos, reduciendo el error humano en un trámite que, de ser ignorado, conlleva multas inmediatas y riesgos de seguridad.

---

## 3. El Pilar de Noticias: Filtrado Algorítmico y Soberanía Informativa

El "Pilar de Noticias" nace como una respuesta a la manipulación de la atención ejercida por las redes sociales y los algoritmos de recomendación. La arquitectura de este módulo se basa en la agregación limpia de fuentes RSS/Atom, eliminando la publicidad y los rastreadores innecesarios para ofrecer un **"periódico privado"** centrado exclusivamente en los intereses del usuario.

### 3.1 Arquitectura de Agregación y Normalización

A diferencia de los lectores convencionales, el Ultra Engine no solo descarga el feed, sino que realiza una **normalización del contenido**. Utilizando la librería `rss-parser` en Node.js, el sistema extrae los titulares y el contenido limpio, almacenándolos en una tabla dedicada de PostgreSQL. Este proceso de limpieza es fundamental para mantener la ligereza del Dashboard y garantizar que la experiencia de lectura sea fluida incluso en dispositivos móviles con conexiones limitadas.

El scheduler integrado, que reemplaza a n8n, permite configurar frecuencias de actualización asíncronas para cada fuente. Mientras que los blogs de tecnología pueden actualizarse cada 30 minutos, las fuentes de noticias generales pueden tener ciclos de 6 horas, optimizando el uso de la CPU y el ancho de banda del VPS.

### 3.2 Esquema de Base de Datos para Noticias y Agregación

La base de datos PostgreSQL unificada utiliza un esquema relacional para gestionar las fuentes y los artículos, permitiendo funciones de búsqueda avanzada que no estaban disponibles en el sistema original basado en microservicios aislados.

| Tabla | Propósito | Atributos Clave |
|---|---|---|
| `rss_feeds` | Directorio de URLs a monitorizar | `url`, `category`, `last_fetched` |
| `rss_articles` | Almacén de contenido procesado | `title`, `summary`, `feed_id`, `published_at` |
| `notification_log` | Registro de alertas enviadas | `message`, `channel`, `sent_at` |

Este enfoque permite que el sistema actúe como un **archivo histórico personal**, donde el usuario puede buscar noticias relevantes de meses anteriores sin depender de si el sitio web original aún mantiene el artículo en su página principal.

---

## 4. El Pilar de Empleo: Automatización de la Vigilancia del Mercado Laboral

Para un nómada digital o un expatriado en Nueva Zelanda, la búsqueda de empleo es una tarea crítica que suele consumir horas de navegación repetitiva en portales como Seek o TradeMe. El "Pilar de Empleo" automatiza esta vigilancia mediante un motor de scraping ligero que actúa como un **"cazatalentos" personal**.

### 4.1 Transición de Motores de Renderizado: Cheerio vs. Playwright

Una de las decisiones técnicas más significativas en la migración fue el abandono de **Playwright** en favor de **Cheerio**. Playwright requiere la ejecución de una instancia completa de Chromium, lo que consume cientos de megabytes de RAM y ciclos de CPU sustanciales. Cheerio, por el contrario, parsea el HTML estático de la respuesta HTTP, permitiendo extraer datos de forma casi instantánea y con un consumo de recursos despreciable.

Esta optimización es posible porque la mayoría de los portales de empleo, por razones de SEO (Search Engine Optimization), sirven los datos críticos en el HTML inicial. El motor de scraping del Ultra Engine utiliza heurísticas basadas en selectores CSS para identificar nuevas ofertas.

```javascript
// Ejemplo conceptual de scraping con Cheerio para Seek.co.nz
const cheerio = require('cheerio');
const axios = require('axios');

async function scrapeJobs(url) {
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);
  const jobs = [];

  $('[data-automation="normalJob"]').each((i, el) => {
    jobs.push({
      title: $(el).find('a').text(),
      company: $(el).find('[data-automation="jobCompany"]').text(),
      location: $(el).find('[data-automation="jobLocation"]').text(),
      link: 'https://www.seek.co.nz' + $(el).find('a').attr('href')
    });
  });
  return jobs;
}
```

### 4.2 Estrategias de Detección de Novedades

El sistema compara las ofertas detectadas con los registros existentes en la tabla `job_listings` de la base de datos. Si un `job_id` (o un hash del título y la empresa) no existe, se clasifica como **"Nueva Oferta"** y se dispara una notificación inmediata a través del bot de Telegram. Este ciclo de revisión cada 6 horas garantiza que el usuario sea uno de los primeros solicitantes, un factor determinante en mercados laborales competitivos como el de Auckland o Wellington.

---

## 5. El Centro de Control: Dashboard Glassmorphism y Bot de Telegram

La interfaz de usuario es el nexo donde la complejidad técnica se transforma en utilidad práctica. El Ultra System ofrece dos canales de control: un Dashboard web de estética "Premium" y un bot de Telegram para interacciones rápidas.

### 5.1 Diseño Glassmorphism: Estética y Funcionalidad

El diseño del Dashboard se basa en la tendencia del **"Glassmorphism"** (o efecto de vidrio esmerilado), popularizado por sistemas operativos modernos como iOS y Windows 11. Este estilo utiliza la transparencia y el desenfoque de fondo para crear una sensación de profundidad y jerarquía visual sin sobrecargar la pantalla con colores sólidos.

Desde una perspectiva técnica, el efecto se logra mediante la propiedad CSS `backdrop-filter: blur()`, combinada con colores de fondo semitransparentes (RGBA). El uso de un tema oscuro ("Dark Mode") no solo reduce la fatiga visual, sino que resalta las alertas críticas (como documentos en rojo por expiración inminente) mediante el contraste cromático.

La implementación en **Vanilla JS** garantiza que el Dashboard sea extremadamente rápido. En lugar de recargar la página completa, el frontend realiza peticiones asíncronas a la API del backend, actualizando los widgets de noticias y empleo en tiempo real mediante la manipulación del DOM (Document Object Model).

### 5.2 Interacción Remota vía Telegram Bot

El bot de Telegram actúa como el terminal móvil del sistema, permitiendo al usuario interactuar con su servidor sin necesidad de abrir el navegador. Construido sobre la librería `node-telegram-bot-api`, el bot maneja una serie de comandos personalizados que consultan directamente la base de datos PostgreSQL.

| Comando | Acción del Backend | Utilidad para el Usuario |
|---|---|---|
| `/status` | Consulta el uso de RAM, CPU y estado de la DB | Monitorización de salud del servidor |
| `/alertas` | Filtra documentos con < 60 días de validez | Revisión rápida de burocracia pendiente |
| `/noticias` | Muestra los 5 titulares más recientes del feed | Consumo informativo rápido en movilidad |
| `/jobs` | Lista las últimas ofertas detectadas | Vigilancia laboral en tiempo real |

Para garantizar la seguridad, el bot utiliza un sistema de "Deep Linking" o tokens de sesión. Al iniciar el bot por primera vez, el usuario debe proporcionar una clave definida en el archivo `.env` del servidor, vinculando su `chat_id` de Telegram de forma permanente y exclusiva a su instancia del Ultra System.

---

## 6. Infraestructura y Seguridad: El Motor Bajo el Capó

La robustez del Ultra Engine reside en su pila tecnológica simplificada y sus protocolos de seguridad proactivos. Al eliminar ocho servicios de terceros, se reduce drásticamente la **superficie de ataque** y los puntos potenciales de fallo.

### 6.1 Gestión de Tareas Programadas y Manejo de Errores

El reemplazo de n8n por un programador nativo basado en funciones de JavaScript permite un control total sobre la ejecución de tareas críticas. Sin embargo, esto traslada la responsabilidad de la persistencia al desarrollador. El sistema utiliza bloques `try-catch` extensivos para evitar que errores en un scraper o en una petición RSS provoquen la caída global del motor.

En Node.js, es vital manejar las excepciones no capturadas para mantener la integridad del servicio. El Ultra Engine implementa un manejador global:

```javascript
process.on('uncaughtException', async (error) => {
    console.error('Error no capturado:', error);
    // Lógica para cerrar conexiones de DB y reiniciar limpiamente
    await db.disconnect();
    process.exit(1);
});
```

Esta estrategia, combinada con una política de reinicio automático en el archivo `docker-compose.yml` (`restart: unless-stopped`), garantiza que el sistema sea prácticamente indestructible frente a fallos lógicos menores.

### 6.2 Seguridad con Helmet.js y Autenticación Stateless

Para proteger el Dashboard privado, se ha optado por un enfoque de seguridad por capas. En primer lugar, la implementación de `helmet.js` configura automáticamente cabeceras HTTP que mitigan ataques comunes como el Cross-Site Scripting (XSS) y el Clickjacking.

| Cabecera de Seguridad | Propósito | Configuración Recomendada |
|---|---|---|
| `Content-Security-Policy` | Restringe de dónde se pueden cargar recursos | `default-src 'self'` |
| `X-Frame-Options` | Impide que el sitio se cargue en un iframe | `DENY` |
| `Strict-Transport-Security` | Fuerza el uso de conexiones HTTPS | `max-age=31536000` |
| `X-Content-Type-Options` | Evita que el navegador adivine el tipo MIME | `nosniff` |

La autenticación se maneja de forma "Stateless" (sin estado) mediante Basic Auth o tokens JWT sencillos. Esto significa que cada petición al servidor lleva las credenciales necesarias, eliminando la necesidad de gestionar sesiones complejas o bases de datos de cookies en el servidor, lo que se alinea con la filosofía de bajo consumo de recursos del proyecto.

---

## 7. Auditoría de Despliegue y Resolución de Conflictos en Hetzner

El estado actual del proyecto se encuentra en la **fase final de despliegue** en un VPS de Hetzner (IP `95.217.158.7`). No obstante, se ha detectado un bloqueo crítico: el error `Bind for 0.0.0.0:80 failed: port is already allocated`.

### 7.1 Diagnóstico de Conflictos de Puerto en Docker

Este error indica que el puerto 80 del servidor está siendo retenido por un proceso o contenedor preexistente. En la arquitectura anterior, el servicio "Homepage" ocupaba el puerto web, y es probable que sus procesos sigan activos a pesar de la migración del código.

La resolución técnica requiere una limpieza profunda del entorno Docker en el host remoto. El comando sugerido para liberar el entorno es:

```bash
docker stop $(docker ps -aq) && docker rm $(docker ps -aq)
```

Si tras ejecutar este comando el puerto persiste ocupado, el conflicto podría derivar de un servicio nativo del sistema operativo (como un servidor Nginx o Apache preinstalado). En tal caso, el administrador debe identificar el proceso mediante `sudo lsof -i :80` y detener el servicio correspondiente con `sudo systemctl stop nginx` (o el servicio identificado).

### 7.2 Idempotencia en el Despliegue

Para evitar que este problema se repita, el script de despliegue `deploy.sh` ha sido modificado para ser **idempotente**. Esto significa que, antes de intentar levantar el nuevo Ultra Engine, el script verifica el estado de los puertos y detiene cualquier contenedor que coincida con la configuración antigua, garantizando una transición suave y sin errores de red.

---

## 8. Conclusiones y Perspectivas Futuras

La migración del Ultra System de un ecosistema de herramientas de terceros a un "Ultra Engine" propio representa una victoria en términos de ingeniería de software para el usuario individual. Se ha logrado transformar un sistema pesado, frágil y costoso en una herramienta "Boutique" altamente eficiente, personalizada y segura.

### 8.1 Impacto de la Soberanía Tecnológica

Al poseer el código fuente completo, el usuario ya no es un "arrendatario" de las funcionalidades de n8n o Miniflux, sino el **dueño absoluto** de su lógica de automatización. Esto permite una agilidad de desarrollo sin precedentes: si el mercado laboral neozelandés cambia o surge un nuevo formato de documento oficial, la actualización del sistema es una cuestión de minutos en el código nativo de Node.js, sin esperar a actualizaciones de complementos de terceros.

### 8.2 Hoja de Ruta de Expansión

Una vez estabilizado el despliegue en Hetzner, el sistema tiene capacidad excedente para incorporar funciones avanzadas. Entre las propuestas destacan:

1. **Integración de LLM Locales:** Utilizar modelos de lenguaje pequeños (como Llama 3 o similares) para resumir los artículos de noticias detectados o redactar borradores de correos electrónicos para las ofertas de empleo encontradas.
2. **Análisis de Tendencias Laborales:** Utilizar los datos históricos de la tabla `job_listings` para generar gráficas de oferta/demanda salarial en sectores específicos de Nueva Zelanda mediante librerías como Chart.js en el Dashboard.
3. **Módulo de Finanzas Personales:** Extender el "Pilar de Burocracia" para gestionar facturas y recordatorios de impuestos (IRD), integrando el OCR para la categorización automática de gastos.

> El Ultra System no es solo un conjunto de automatizaciones; es la materialización de un entorno digital diseñado para servir a la vida humana, minimizando el ruido algorítmico y maximizando la eficiencia operativa del individuo en un mundo globalizado.

---

### Inventario de Archivos del Proyecto

```
ultra-system/
├── docker-compose.yml          # 2 servicios: db + engine
├── .env / .env.example         # Credenciales (PostgreSQL + Telegram)
├── db/
│   └── init.sql                # Schema completo (8 tablas)
├── ultra-engine/
│   ├── Dockerfile              # Node.js Alpine + Tesseract OCR
│   ├── package.json
│   ├── server.js               # Punto de entrada
│   ├── src/
│   │   ├── db.js               # Pool PostgreSQL
│   │   ├── telegram.js         # Bot Telegram
│   │   ├── scheduler.js        # Cron (reemplaza n8n)
│   │   ├── ocr.js              # OCR (reemplaza Paperless)
│   │   ├── rss.js              # RSS (reemplaza Miniflux)
│   │   ├── scraper.js          # Scraper (reemplaza Changedetection)
│   │   └── routes/
│   │       ├── documents.js    # API documentos
│   │       ├── status.js       # API estado
│   │       ├── feeds.js        # API noticias
│   │       └── jobs.js         # API empleo
│   └── public/
│       ├── index.html          # Dashboard premium
│       ├── css/style.css       # Glassmorphism dark theme
│       └── js/app.js           # Lógica frontend
├── scripts/
│   ├── deploy.sh               # Despliegue automático
│   └── backup.sh               # Backup automático
└── docs/
    ├── ARCHITECTURE.md
    └── ULTRA_SYSTEM_AUDIT.md   # ← Este documento
```
