import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleMap, useJsApiLoader, MarkerF } from '@react-google-maps/api';
import { RefreshIcon, BusIcon } from '../components/Icons';
import { subscribeBusLocation } from '../lib/firebase-db';

// ---------------------------------------------------------------------------
// Google Maps config
// ---------------------------------------------------------------------------

/** API key from Vite env (set in .env as VITE_GOOGLE_MAPS_API_KEY). */
const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

/** Default map center — use your university campus coordinates here. */
const DEFAULT_CENTER = { lat: 23.8103, lng: 90.4125 }; // Dhaka, Bangladesh (placeholder)

/** Default zoom level — close enough to see the campus area. */
const DEFAULT_ZOOM = 15;

/** Map styling — light minimal theme that matches the UI. */
const MAP_STYLES = { width: '100%', height: '100%' };

/** Google Maps library loading options. */
const LIBRARIES = ['marker'];

/** Firebase database path where the bus location is stored. */
const BUS_DB_PATH = 'bus/location';

// ---------------------------------------------------------------------------
// Bus marker icon — inline SVG so we don't need a hosted image
// ---------------------------------------------------------------------------

const BUS_MARKER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none"
  stroke="#1a1a1a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <path d="M4 16V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10"/>
  <path d="M4 16h16"/>
  <path d="M4 16v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h10v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-2"/>
  <circle cx="7.5" cy="19.5" r="1.5"/>
  <circle cx="16.5" cy="19.5" r="1.5"/>
  <path d="M7.5 3v5M16.5 3v5"/>
</svg>`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtTime(date) {
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BusNavigate() {
  // ---- Bus position state ------------------------------------------------
  const [busPosition, setBusPosition] = useState(DEFAULT_CENTER);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isActive, setIsActive] = useState(true);
  const [dataSource, setDataSource] = useState('simulated'); // 'firebase' | 'simulated'

  // ---- Firebase Realtime Database listener --------------------------------
  // Subscribes to `bus/location` in Firebase. When the database path has
  // { lat, lng } data, the marker updates in real-time.
  //
  // If Firebase is not configured (no VITE_FIREBASE_DATABASE_URL), the
  // component falls back to the simulated drift so the page still works.
  useEffect(() => {
    let gotFirebaseUpdate = false;

    const unsubscribe = subscribeBusLocation(({ lat, lng }) => {
      gotFirebaseUpdate = true;
      setBusPosition({ lat, lng });
      setLastUpdated(new Date());
      setIsActive(true);
      setDataSource('firebase');
    }, BUS_DB_PATH);

    // After 3 seconds, if no Firebase update arrived, fall back to simulation.
    const fallbackTimer = setTimeout(() => {
      if (!gotFirebaseUpdate) {
        setDataSource('simulated');
      }
    }, 3000);

    return () => {
      unsubscribe();
      clearTimeout(fallbackTimer);
    };
  }, []);

  // ---- Simulated movement (placeholder fallback) -------------------------
  // Only active when Firebase is not configured. Gently drifts the marker
  // so the page feels alive on load. Replace this with a real Firebase
  // listener once your bus sends GPS data to `bus/location`.
  const simulationRef = useRef(null);
  useEffect(() => {
    // Don't start simulation if Firebase is providing updates.
    if (dataSource === 'firebase') {
      clearTimeout(simulationRef.current);
      return;
    }

    let frame;
    let t = 0;

    const drift = () => {
      t += 0.008;
      const lat = DEFAULT_CENTER.lat + Math.sin(t) * 0.0008;
      const lng = DEFAULT_CENTER.lng + Math.cos(t * 0.7) * 0.001;
      setBusPosition({ lat, lng });
      setLastUpdated(new Date());
      frame = requestAnimationFrame(drift);
    };

    // Start the gentle drift after a short delay so the map renders first.
    simulationRef.current = setTimeout(() => {
      frame = requestAnimationFrame(drift);
    }, 1500);

    return () => {
      clearTimeout(simulationRef.current);
      cancelAnimationFrame(frame);
    };
  }, [dataSource]);

  // ---- Google Maps loader ------------------------------------------------
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: API_KEY,
    libraries: LIBRARIES,
  });

  // ---- Refresh handler (for future real-time re-fetch) -------------------
  const handleRefresh = useCallback(() => {
    setLastUpdated(new Date());
    setIsActive(true);
  }, []);

  // ---- Render ------------------------------------------------------------
  if (!API_KEY) {
    return (
      <div className="animate-[fadeIn_.35s_ease]">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-lime-deep">
          Bus tracker
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[20px] font-extrabold leading-tight tracking-tight text-charcoal sm:text-[28px] lg:text-[32px]">
              Live Campus Bus Tracker
            </h1>
          </div>
        </div>
        <div className="mt-8 grid min-h-[400px] place-items-center rounded-xl border border-dashed border-black/10 bg-white p-8 text-center shadow-sm">
          <div className="max-w-sm">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-lime/20 text-lime-deep">
              <BusIcon className="h-6 w-6" />
            </span>
            <h2 className="mt-4 text-[16px] font-bold text-charcoal">
              Google Maps API key not configured
            </h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-gray-500">
              Set <code className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[11px]">VITE_GOOGLE_MAPS_API_KEY</code> in
              your <code className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[11px]">.env</code> file and restart
              the dev server.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-[fadeIn_.35s_ease]">
      {/* Header */}
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-lime-deep">
        Bus tracker
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-extrabold leading-tight tracking-tight text-charcoal sm:text-[28px] lg:text-[32px]">
            Live Campus Bus Tracker
          </h1>
          <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-gray-500">
            Track the campus shuttle in real time. The bus icon on the map shows
            the current location.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          className="group flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-[12px] font-semibold text-gray-500 shadow-sm transition hover:text-charcoal hover:shadow-md"
        >
          <RefreshIcon className="h-3.5 w-3.5 transition group-hover:rotate-180" />
          Refresh
        </button>
      </div>

      {/* Map card */}
      <div className="mt-8 overflow-hidden rounded-xl border border-black/[0.05] bg-white shadow-sm">
        <div className="relative h-[600px] w-full">
          {loadError ? (
            <div className="grid h-full place-items-center text-center">
              <div className="max-w-sm">
                <p className="text-[14px] font-bold text-rose-500">
                  Failed to load Google Maps
                </p>
                <p className="mt-1 text-[12.5px] text-gray-500">
                  Check your API key and network connection.
                </p>
              </div>
            </div>
          ) : !isLoaded ? (
            <div className="grid h-full place-items-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-9 w-9 animate-spin rounded-full border-2 border-black/10 border-t-lime-deep" />
                <p className="text-[12px] font-medium text-gray-400">
                  Loading map…
                </p>
              </div>
            </div>
          ) : (
            <GoogleMap
              mapContainerStyle={MAP_STYLES}
              center={busPosition}
              zoom={DEFAULT_ZOOM}
              options={{
                mapTypeControl: false,
                streetViewControl: false,
                fullscreenControl: true,
                zoomControl: true,
                styles: [
                  {
                    featureType: 'poi',
                    stylers: [{ visibility: 'off' }],
                  },
                ],
              }}
            >
              {/* Bus marker */}
              <MarkerF
                position={busPosition}
                title="Campus Bus"
                icon={{
                  url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(BUS_MARKER_SVG.trim())}`,
                  scaledSize: { width: 48, height: 48 },
                  anchor: { x: 24, y: 24 },
                }}
                optimized={false}
              />
            </GoogleMap>
          )}
        </div>

        {/* Status bar */}
        <div className="flex flex-wrap items-center justify-between border-t border-black/[0.05] px-5 py-3.5">
          <div className="flex items-center gap-3">
            {/* Flashing green dot */}
            <span className="relative flex h-2.5 w-2.5">
              {isActive && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                  isActive ? 'bg-emerald-500' : 'bg-gray-300'
                }`}
              />
            </span>
            <span className="text-[12.5px] font-semibold text-charcoal">
              {isActive ? 'Bus is currently active' : 'Location unavailable'}
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11.5px] text-gray-400">
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 7.5V12l3 2" />
            </svg>
            Last updated {fmtTime(lastUpdated)}
          </div>
        </div>
      </div>

      {/* Coordinate readout + data source indicator */}
      <div className="mt-4 rounded-xl border border-black/[0.05] bg-white px-5 py-3.5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px] font-semibold text-gray-500">
              Current Position
            </p>
            <p className="mt-1 font-mono text-[13px] text-charcoal">
              {busPosition.lat.toFixed(6)}, {busPosition.lng.toFixed(6)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[12px] font-semibold text-gray-500">
              Source
            </p>
            <span
              className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                dataSource === 'firebase'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700'
              }`}
            >
              {dataSource === 'firebase' ? '🟢 Live (Firebase)' : '🟡 Simulated'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
