import { useMemo, useState } from 'react';
import { z } from 'zod';
import { useEndpoint } from '@/lib/useEndpoint';
import { LoadingState } from '@/ui/LoadingState';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { ListRow } from '@/ui/ListRow';

const ArticleSchema = z.object({
  article_id: z.number(),
  title: z.string(),
  url: z.string(),
  published_at: z.string(),
  relevance_score: z.union([z.number(), z.string(), z.null()]).optional(),
  source_name: z.string().nullable(),
  lang: z.string().nullable().optional(),
  continent: z.string().nullable().optional(),
  subregion: z.string().nullable().optional(),
  country_iso: z.string().nullable().optional(),
  primary_topic: z.string().nullable().optional(),
  sentiment_label: z.string().nullable().optional(),
}).passthrough();

const FilteredNewsSchema = z.object({
  ok: z.literal(true),
  count: z.number(),
  data: z.array(ArticleSchema),
}).passthrough();

type Article = z.infer<typeof ArticleSchema>;

const TOPIC_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'geopolitics', label: 'Geopolítica' },
  { value: 'economy', label: 'Economía' },
  { value: 'tech', label: 'Tech' },
  { value: 'climate', label: 'Clima' },
  { value: 'health', label: 'Salud' },
  { value: 'sports', label: 'Deportes' },
  { value: 'culture', label: 'Cultura' },
];

const HOURS_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: 'Última hora' },
  { value: 6, label: 'Últimas 6h' },
  { value: 24, label: 'Últimas 24h' },
  { value: 48, label: 'Últimas 48h' },
];

function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const mins = Math.floor((Date.now() - t) / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function WorldNews() {
  const [topic, setTopic] = useState('');
  const [hours, setHours] = useState(24);
  const [search, setSearch] = useState('');

  const path = useMemo(() => {
    const p = new URLSearchParams();
    p.set('level', 'world');
    p.set('hours', String(hours));
    p.set('limit', '30');
    if (topic) p.set('topics', topic);
    if (search.trim().length >= 2) p.set('search', search.trim().slice(0, 100));
    return `/api/wm/news/filtered?${p}`;
  }, [topic, hours, search]);

  const list = useEndpoint(path, FilteredNewsSchema);

  const articles: Article[] = list.status === 'ok' ? list.data.data : [];

  return (
    <section className="mt-6 space-y-3" aria-label="world-news">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-bg-panel p-3">
        <label className="flex min-w-[220px] flex-1 flex-col text-meta text-fg-muted">
          <span className="mb-1">Buscar en titulares</span>
          <input
            data-testid="world-news-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Iran, Trump, climate…"
            className="rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg placeholder:text-fg-dim focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex w-[150px] flex-col text-meta text-fg-muted">
          <span className="mb-1">Topic</span>
          <select
            data-testid="world-news-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg focus:border-accent focus:outline-none"
          >
            {TOPIC_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-[150px] flex-col text-meta text-fg-muted">
          <span className="mb-1">Ventana</span>
          <select
            data-testid="world-news-hours"
            value={hours}
            onChange={(e) => setHours(parseInt(e.target.value, 10) || 24)}
            className="rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg focus:border-accent focus:outline-none"
          >
            {HOURS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {list.status === 'loading' && <LoadingState />}
      {list.status === 'error' && <ErrorState message={list.error} />}
      {list.status === 'ok' && articles.length === 0 && (
        <EmptyState title="Sin artículos con estos filtros." />
      )}
      {list.status === 'ok' && articles.length > 0 && (
        <div
          data-testid="world-news-list"
          className="space-y-1 rounded-lg border border-border bg-bg-panel p-2"
        >
          {articles.map((a) => (
            <ListRow
              key={a.article_id}
              testId={`world-news-${a.article_id}`}
              title={a.title}
              subtitle={[
                a.source_name,
                a.country_iso,
                a.primary_topic,
                a.sentiment_label,
              ]
                .filter(Boolean)
                .join(' · ')}
              trailing={timeAgo(a.published_at)}
              href={a.url}
              external
            />
          ))}
        </div>
      )}
    </section>
  );
}
