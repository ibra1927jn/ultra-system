import { useEffect, useState } from 'react';
import { z } from 'zod';
import { DetailDrawer } from '@/ui/DetailDrawer';
import { LoadingState } from '@/ui/LoadingState';
import { ErrorState } from '@/ui/ErrorState';

const EntitySchema = z.object({
  text: z.string(),
  label: z.string(),
});

const ArticleSchema = z.object({
  id: z.number(),
  title: z.string(),
  url: z.string(),
  summary: z.string().nullable().optional(),
  auto_summary: z.string().nullable().optional(),
  published_at: z.string().nullable().optional(),
  source_name: z.string().nullable().optional(),
  relevance_score: z.union([z.number(), z.string(), z.null()]).optional(),
  sentiment_label: z.string().nullable().optional(),
  sentiment_score: z.union([z.number(), z.string(), z.null()]).optional(),
  entities: z.array(EntitySchema).nullable().optional(),
  primary_topic: z.string().nullable().optional(),
  country_iso: z.string().nullable().optional(),
  continent: z.string().nullable().optional(),
}).passthrough();

type Article = z.infer<typeof ArticleSchema>;

type FullText = {
  paragraphs: string[];
  word_count: number;
  author: string | null;
  sitename: string | null;
  language: string | null;
};

type Props = {
  articleId: number | null;
  onClose: () => void;
};

type State =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ok'; article: Article };

const SENTIMENT_CLASS: Record<string, string> = {
  positive: 'text-accent',
  negative: 'text-critical',
  neutral: 'text-fg-muted',
};

const ENTITY_BADGE: Record<string, string> = {
  PERSON: 'bg-accent/15 text-accent',
  ORG: 'bg-attention/15 text-attention',
  GPE: 'bg-bg-elev text-fg',
  LOC: 'bg-bg-elev text-fg',
};

const TRANSLATE_LANGS: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ar', label: 'العربية' },
];

export function ArticleReader({ articleId, onClose }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    if (articleId === null) return;
    const ctrl = new AbortController();
    setState({ status: 'loading' });
    fetch(`/api/wm/article/${articleId}`, {
      credentials: 'include',
      signal: ctrl.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const body = (await r.json()) as { ok: boolean; data: { article: unknown } };
        const parsed = ArticleSchema.safeParse(body.data?.article);
        if (!parsed.success) throw new Error('schema mismatch');
        setState({ status: 'ok', article: parsed.data });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setState({
          status: 'error',
          error: err instanceof Error ? err.message : 'unknown',
        });
      });
    return () => ctrl.abort();
  }, [articleId]);

  return (
    <DetailDrawer
      open={articleId !== null}
      onClose={onClose}
      title={state.status === 'ok' ? state.article.title : 'Artículo'}
      testId="article-reader"
      actions={
        state.status === 'ok' && (
          <a
            href={state.article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-accent px-3 py-1 text-meta text-accent hover:bg-accent/10"
          >
            abrir original ↗
          </a>
        )
      }
    >
      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorState message={state.error} />}
      {state.status === 'ok' && <ArticleContent article={state.article} />}
    </DetailDrawer>
  );
}

function ArticleContent({ article }: { article: Article }) {
  const sent = article.sentiment_label?.toLowerCase() ?? null;
  const sentClass = sent && sent in SENTIMENT_CLASS ? SENTIMENT_CLASS[sent] : 'text-fg-muted';

  const [fullText, setFullText] = useState<FullText | null>(null);
  const [fullTextState, setFullTextState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [fullTextErr, setFullTextErr] = useState<string | null>(null);

  const [translated, setTranslated] = useState<string | null>(null);
  const [translateState, setTranslateState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [translateLang, setTranslateLang] = useState<string>('es');
  const [translateErr, setTranslateErr] = useState<string | null>(null);

  const fetchFullText = async () => {
    setFullTextState('loading');
    setFullTextErr(null);
    try {
      const r = await fetch(`/api/wm/article/${article.id}/fulltext`, {
        credentials: 'include',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = (await r.json()) as {
        ok: boolean;
        data: {
          paragraphs?: string[];
          word_count?: number;
          author?: string | null;
          sitename?: string | null;
          language?: string | null;
          error?: string;
        };
      };
      if (body.data.error) throw new Error(body.data.error);
      setFullText({
        paragraphs: body.data.paragraphs ?? [],
        word_count: body.data.word_count ?? 0,
        author: body.data.author ?? null,
        sitename: body.data.sitename ?? null,
        language: body.data.language ?? null,
      });
      setFullTextState('idle');
    } catch (err) {
      setFullTextState('error');
      setFullTextErr(err instanceof Error ? err.message : 'unknown');
    }
  };

  const translate = async () => {
    const text =
      fullText?.paragraphs.join('\n\n') ||
      article.auto_summary ||
      article.summary ||
      article.title;
    setTranslateState('loading');
    setTranslateErr(null);
    try {
      const r = await fetch('/api/wm/translate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, target: translateLang }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = (await r.json()) as { ok: boolean; data?: { translated: string } };
      setTranslated(body.data?.translated ?? '');
      setTranslateState('idle');
    } catch (err) {
      setTranslateState('error');
      setTranslateErr(err instanceof Error ? err.message : 'unknown');
    }
  };

  return (
    <div className="space-y-4 text-meta">
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-fg-muted">
        {article.source_name && (
          <span>
            fuente: <span className="text-fg">{article.source_name}</span>
          </span>
        )}
        {article.published_at && (
          <span>
            · {new Date(article.published_at).toISOString().slice(0, 16).replace('T', ' ')}
          </span>
        )}
        {article.country_iso && <span>· {article.country_iso}</span>}
        {article.primary_topic && <span>· {article.primary_topic}</span>}
        {sent && (
          <span>
            · sentimiento <span className={sentClass}>{sent}</span>
          </span>
        )}
        {article.relevance_score != null && (
          <span>
            · score <span className="text-fg">{article.relevance_score}</span>
          </span>
        )}
      </div>

      {article.auto_summary && (
        <section aria-label="ai-summary">
          <h3 className="mb-1 text-card-title text-fg-muted">Resumen (IA)</h3>
          <p className="whitespace-pre-wrap text-fg">{article.auto_summary}</p>
        </section>
      )}

      {article.summary && article.summary !== article.auto_summary && (
        <section aria-label="original-summary">
          <h3 className="mb-1 text-card-title text-fg-muted">Extracto</h3>
          <p className="whitespace-pre-wrap text-fg-muted">{article.summary}</p>
        </section>
      )}

      {article.entities && article.entities.length > 0 && (
        <section aria-label="entities">
          <h3 className="mb-1 text-card-title text-fg-muted">Entidades</h3>
          <div className="flex flex-wrap gap-1">
            {dedupe(article.entities)
              .slice(0, 25)
              .map((e, i) => (
                <span
                  key={`${e.text}-${i}`}
                  className={`rounded px-2 py-0.5 text-meta ${ENTITY_BADGE[e.label] ?? 'bg-bg-elev text-fg-muted'}`}
                >
                  {e.text}
                  <span className="ml-1 text-fg-dim">{e.label}</span>
                </span>
              ))}
          </div>
        </section>
      )}

      <section aria-label="fulltext-actions" className="flex flex-wrap gap-2 border-t border-border pt-3">
        {fullText === null && fullTextState !== 'loading' && (
          <button
            type="button"
            data-testid="reader-fetch-fulltext"
            onClick={fetchFullText}
            className="rounded border border-border px-3 py-1 text-meta text-fg hover:border-accent"
          >
            {fullTextState === 'error' ? 'reintentar texto completo' : 'cargar texto completo'}
          </button>
        )}
        {fullTextState === 'loading' && (
          <span className="text-meta text-fg-muted" data-testid="reader-fulltext-loading">
            cargando texto completo…
          </span>
        )}
        <select
          data-testid="reader-translate-lang"
          value={translateLang}
          onChange={(e) => setTranslateLang(e.target.value)}
          className="rounded border border-border bg-bg-base px-3 py-1 text-meta text-fg"
        >
          {TRANSLATE_LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          data-testid="reader-translate"
          onClick={translate}
          disabled={translateState === 'loading'}
          className="rounded border border-accent px-3 py-1 text-meta text-accent hover:bg-accent/10 disabled:opacity-50"
        >
          {translateState === 'loading' ? 'traduciendo…' : 'traducir'}
        </button>
      </section>

      {fullTextErr && (
        <p className="text-meta text-critical" role="alert">
          error: {fullTextErr}
        </p>
      )}

      {fullText && fullText.paragraphs.length > 0 && (
        <section aria-label="fulltext">
          <h3 className="mb-1 text-card-title text-fg-muted">
            Texto completo ({fullText.word_count} palabras · {fullText.language ?? '?'})
          </h3>
          {fullText.author && (
            <p className="text-meta text-fg-dim">
              por {fullText.author}
              {fullText.sitename && ` · ${fullText.sitename}`}
            </p>
          )}
          <div className="mt-2 space-y-3" data-testid="reader-fulltext">
            {fullText.paragraphs.map((p, i) => (
              <p key={i} className="whitespace-pre-wrap text-fg">
                {p}
              </p>
            ))}
          </div>
        </section>
      )}

      {translateErr && (
        <p className="text-meta text-critical" role="alert">
          translate: {translateErr}
        </p>
      )}

      {translated && (
        <section aria-label="translation" className="border-t border-border pt-3">
          <h3 className="mb-1 text-card-title text-accent">Traducción → {translateLang}</h3>
          <p className="whitespace-pre-wrap text-fg" data-testid="reader-translation">
            {translated}
          </p>
        </section>
      )}
    </div>
  );
}

function dedupe(entities: ReadonlyArray<{ text: string; label: string }>): Array<{ text: string; label: string }> {
  const seen = new Set<string>();
  const out: Array<{ text: string; label: string }> = [];
  for (const e of entities) {
    const key = `${e.text.toLowerCase()}|${e.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}
