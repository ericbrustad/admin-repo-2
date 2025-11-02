import React, { useEffect, useMemo, useRef, useState } from 'react';
import { clearDefaultGeo, getDefaultGeo, setDefaultGeo } from '../../lib/geo/defaultGeo.js';

const LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

export default function GlobalLocationSelector({
  initial,
  useAsDefault = false,
  onUpdate,
  onUseAsDefaultChange,
}) {
  const [leafletReady, setLeafletReady] = useState(
    () => typeof window !== 'undefined' && Boolean(window.L),
  );
  const [enabled, setEnabled] = useState(() => Boolean(initial));
  const [lat, setLat] = useState(() => initial?.lat ?? 44.9778);
  const [lng, setLng] = useState(() => initial?.lng ?? -93.265);
  const [persistNew, setPersistNew] = useState(() => {
    if (typeof useAsDefault === 'boolean') return useAsDefault;
    return Boolean(getDefaultGeo());
  });
  const [updating, setUpdating] = useState(false);
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (typeof useAsDefault === 'boolean') {
      setPersistNew(useAsDefault);
    }
  }, [useAsDefault]);

  useEffect(() => {
    if (initial && Number.isFinite(initial.lat) && Number.isFinite(initial.lng)) {
      setLat(initial.lat);
      setLng(initial.lng);
      setEnabled(true);
    }
  }, [initial?.lat, initial?.lng]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (window.L) {
      setLeafletReady(true);
      return undefined;
    }

    const linkId = 'leaflet-stylesheet';
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS_URL;
      document.head.appendChild(link);
    }

    const scriptId = 'leaflet-script';
    const handleLoad = () => {
      setLeafletReady(Boolean(window.L));
    };
    let script = document.getElementById(scriptId);
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = LEAFLET_JS_URL;
      script.async = true;
      script.dataset.loaded = 'false';
      script.addEventListener(
        'load',
        () => {
          script.dataset.loaded = 'true';
          handleLoad();
        },
        { once: true },
      );
      script.addEventListener(
        'error',
        () => {
          console.warn('Leaflet failed to load from CDN');
          setLeafletReady(false);
        },
        { once: true },
      );
      document.body.appendChild(script);
    } else if (script.dataset.loaded === 'true') {
      handleLoad();
    } else {
      script.addEventListener('load', handleLoad, { once: true });
    }

    return () => {};
  }, []);

  useEffect(() => {
    if (!enabled) {
      markerRef.current = null;
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch {}
        mapInstanceRef.current = null;
      }
      return;
    }
    if (!leafletReady || typeof window === 'undefined') return;
    if (!mapContainerRef.current) return;
    const L = window.L;
    if (!L) return;

    const numericLat = Number(lat) || 44.9778;
    const numericLng = Number(lng) || -93.265;
    const center = [numericLat, numericLng];

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center,
        zoom: 12,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      const marker = L.marker(center, { draggable: true }).addTo(map);
      marker.on('dragend', () => {
        const point = marker.getLatLng();
        setLat(Number(point.lat.toFixed(6)));
        setLng(Number(point.lng.toFixed(6)));
      });
      map.on('click', (event) => {
        marker.setLatLng(event.latlng);
        setLat(Number(event.latlng.lat.toFixed(6)));
        setLng(Number(event.latlng.lng.toFixed(6)));
      });

      mapInstanceRef.current = map;
      markerRef.current = marker;
    } else {
      try {
        mapInstanceRef.current.setView(center);
      } catch {}
      if (markerRef.current) {
        markerRef.current.setLatLng(center);
      }
    }
  }, [enabled, leafletReady]);

  useEffect(() => {
    if (!enabled || !leafletReady) return;
    if (!markerRef.current || !mapInstanceRef.current) return;
    const numericLat = Number(lat);
    const numericLng = Number(lng);
    if (!Number.isFinite(numericLat) || !Number.isFinite(numericLng)) return;
    markerRef.current.setLatLng([numericLat, numericLng]);
    try {
      mapInstanceRef.current.panTo([numericLat, numericLng], { animate: false });
    } catch {}
  }, [lat, lng, enabled, leafletReady]);

  useEffect(
    () => () => {
      markerRef.current = null;
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch {}
        mapInstanceRef.current = null;
      }
    },
    [],
  );

  const coordinateValid = useMemo(
    () => Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)),
    [lat, lng],
  );

  const handleUpdateAllPins = async () => {
    if (!coordinateValid) return;
    if (persistNew) {
      setDefaultGeo(lat, lng);
    } else {
      clearDefaultGeo();
    }
    if (typeof onUseAsDefaultChange === 'function') {
      try {
        const maybe = onUseAsDefaultChange(persistNew);
        if (maybe && typeof maybe.then === 'function') {
          maybe.catch((error) => {
            console.error('Failed to persist location default flag', error);
          });
        }
      } catch (error) {
        console.error('Failed to persist location default flag', error);
      }
    }
    if (!onUpdate) return;
    try {
      const maybePromise = onUpdate(Number(lat), Number(lng));
      if (maybePromise && typeof maybePromise.then === 'function') {
        setUpdating(true);
        await maybePromise;
      }
    } catch (error) {
      console.error('Failed to update all pins', error);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        gap: 8,
        padding: 12,
        border: '1px solid rgba(15,23,42,0.12)',
        borderRadius: 12,
        background: 'white',
      }}
    >
      <div style={{ fontWeight: 700, color: '#0f172a' }}>Global Location</div>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        <span>Enable map location selector (updates all pins)</span>
      </label>

      {enabled && (
        <>
          <div style={{ position: 'relative' }}>
            {!leafletReady && (
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                background: 'rgba(15,23,42,0.08)',
                color: '#475569',
                fontSize: 14,
                zIndex: 1,
              }}>
                Loading Leaflet map…
              </div>
            )}
            <div
              ref={mapContainerRef}
              style={{
                height: 220,
                borderRadius: 10,
                overflow: 'hidden',
                border: '1px solid rgba(15,23,42,0.12)',
                background: '#0b0c10',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="number"
              step="0.000001"
              value={lat}
              onChange={(event) => setLat(Number(event.target.value))}
              placeholder="Latitude"
              style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(15,23,42,0.12)', width: 180 }}
            />
            <input
              type="number"
              step="0.000001"
              value={lng}
              onChange={(event) => setLng(Number(event.target.value))}
              placeholder="Longitude"
              style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(15,23,42,0.12)', width: 180 }}
            />
          </div>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={persistNew}
              onChange={(event) => {
                const checked = event.target.checked;
                setPersistNew(checked);
                if (checked) {
                  setDefaultGeo(lat, lng);
                } else {
                  clearDefaultGeo();
                }
                if (typeof onUseAsDefaultChange === 'function') {
                  try {
                    const maybe = onUseAsDefaultChange(checked);
                    if (maybe && typeof maybe.then === 'function') {
                      maybe.catch((error) => {
                        console.error('Failed to persist location default flag', error);
                      });
                    }
                  } catch (error) {
                    console.error('Failed to persist location default flag', error);
                  }
                }
              }}
            />
            <span>Use this as default for new Missions / Devices (Draft &amp; Live forms)</span>
          </label>

          <div>
            <button
              type="button"
              onClick={handleUpdateAllPins}
              disabled={!coordinateValid || updating}
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                border: '1px solid rgba(15,23,42,0.18)',
                background: coordinateValid ? '#0ea5e9' : '#cbd5f5',
                color: coordinateValid ? '#ffffff' : '#475569',
                cursor: coordinateValid ? 'pointer' : 'not-allowed',
              }}
            >
              {updating ? 'Updating…' : 'Update all pins to this location'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

