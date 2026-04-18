import { useCallback, useEffect, useMemo, useState } from 'react';
import { useEndpoint } from '@/lib/useEndpoint';
import { LoadingState } from '@/ui/LoadingState';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { PoiListSchema, type Poi } from './types';

type Coords = { lat: number; lon: number; source: 'auto' | 'preset' | 'manual' };

// Presets usables sin coord selector: ciudades donde el usuario típicamente opera.
const PRESETS: ReadonlyArray<{ label: string; lat: number; lon: number }> = [
  { label: 'Auckland', lat: -36.85, lon: 174.76 },
  { label: 'Madrid', lat: 40.4168, lon: -3.7038 },
  { label: 'Barcelona', lat: 41.3851, lon: 2.1734 },
  { label: 'Sydney', lat: -33.8688, lon: 151.2093 },
  { label: 'Queenstown', lat: -45.0312, lon: 168.6626 },
];

const POI_TYPES: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'campsite', label: 'Camping' },
  { value: 'drinking_water', label: 'Agua' },
  { value: 'sanitary_dump_station', label: 'Dump station' },
  { value: 'shower', label: 'Ducha' },
  { value: 'toilets', label: 'WC' },
  { value: 'fuel', label: 'Gasolinera' },
];

function renderBadges(p: Poi): string[] {
  const out: string[] = [];
  if (p.has_water) out.push('agua');
  if (p.has_dump) out.push('dump');
  if (p.has_shower) out.push('ducha');
  if (p.has_wifi) out.push('wifi');
  if (p.has_power) out.push('luz');
  if (p.is_free === true) out.push('free');
  return out;
}

export function MovesPoi() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [radius, setRadius] = useState(20);
  const [poiType, setPoiType] = useState('');
  const [freeOnly, setFreeOnly] = useState(false);
  const [geoErr, setGeoErr] = useState<string | null>(null);

  const path = useMemo(() => {
    if (!coords) return null;
    const p = new URLSearchParams({
      lat: String(coords.lat),
      lon: String(coords.lon),
      radius_km: String(radius),
      limit: '50',
    });
    if (poiType) p.set('poi_type', poiType);
    return `/api/logistics/poi?${p}`;
  }, [coords, radius, poiType]);

  const list = useEndpoint(path, PoiListSchema);

  const requestGeo = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoErr('geolocation no disponible');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setCoords({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          source: 'auto',
        }),
      (err) => setGeoErr(`error: ${err.message}`),
      { maximumAge: 60_000, timeout: 8_000 },
    );
  }, []);

  useEffect(() => {
    // Al montar, intenta geolocation (si el user ya dio permiso es instant).
    if (navigator.geolocation && coords === null) requestGeo();
  }, [coords, requestGeo]);

  const filtered = useMemo(() => {
    // useEndpoint con path=null devuelve { status: 'ok', data: null } como
    // estado inerte — por eso chequeamos data además de status.
    if (list.status !== 'ok' || !list.data) return [] as Poi[];
    const rows = list.data.data;
    return freeOnly ? rows.filter((p) => p.is_free === true) : rows;
  }, [list, freeOnly]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-bg-panel p-4">
        <div className="flex flex-col text-meta text-fg-muted">
          <span className="mb-1">Ubicación</span>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              data-testid="poi-geo-btn"
              onClick={requestGeo}
              className="rounded border border-border px-3 py-2 text-card-title text-fg hover:border-accent"
            >
              📍 Usar mi ubicación
            </button>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                data-testid={`poi-preset-${p.label}`}
                onClick={() =>
                  setCoords({ lat: p.lat, lon: p.lon, source: 'preset' })
                }
                className="rounded border border-border px-3 py-2 text-card-title text-fg-muted hover:border-accent hover:text-fg"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex w-[150px] flex-col text-meta text-fg-muted">
          <span className="mb-1">Radio (km)</span>
          <input
            data-testid="poi-radius"
            type="number"
            min={1}
            max={500}
            value={radius}
            onChange={(e) => setRadius(parseInt(e.target.value, 10) || 20)}
            className="rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg focus:border-accent focus:outline-none"
          />
        </label>

        <label className="flex w-[160px] flex-col text-meta text-fg-muted">
          <span className="mb-1">Tipo</span>
          <select
            data-testid="poi-type"
            value={poiType}
            onChange={(e) => setPoiType(e.target.value)}
            className="rounded border border-border bg-bg-base px-3 py-2 text-card-title text-fg focus:border-accent focus:outline-none"
          >
            {POI_TYPES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex cursor-pointer items-center gap-2 text-meta text-fg-muted">
          <input
            data-testid="poi-free-only"
            type="checkbox"
            checked={freeOnly}
            onChange={(e) => setFreeOnly(e.target.checked)}
            className="accent-accent"
          />
          <span>Sólo gratis</span>
        </label>
      </div>

      {coords && (
        <p className="text-meta text-fg-dim" data-testid="poi-coords">
          {coords.lat.toFixed(4)}, {coords.lon.toFixed(4)} · fuente {coords.source}
        </p>
      )}
      {geoErr && <p className="text-meta text-attention">{geoErr}</p>}

      {coords === null && !geoErr && (
        <EmptyState title="Elige una ubicación preset o activa geolocalización para ver POIs." />
      )}

      {coords !== null && list.status === 'loading' && <LoadingState />}
      {coords !== null && list.status === 'error' && <ErrorState message={list.error} />}
      {coords !== null && list.status === 'ok' && filtered.length === 0 && (
        <EmptyState title="Sin POIs en el radio indicado." />
      )}
      {coords !== null && list.status === 'ok' && filtered.length > 0 && (
        <div data-testid="poi-list" className="grid gap-2 md:grid-cols-2">
          {filtered.slice(0, 40).map((p) => (
            <div
              key={p.id}
              data-testid={`poi-${p.id}`}
              className="rounded border border-border bg-bg-panel p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-card-title text-fg line-clamp-1">{p.name ?? '—'}</span>
                <span className="shrink-0 text-meta text-fg-dim">{p.poi_type ?? ''}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {renderBadges(p).map((b) => (
                  <span
                    key={b}
                    className="rounded bg-bg-elev px-2 py-0.5 text-meta text-fg-muted"
                  >
                    {b}
                  </span>
                ))}
              </div>
              {p.source && (
                <p className="mt-1 text-meta text-fg-dim">src: {p.source}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
