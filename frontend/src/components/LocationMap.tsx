import { useEffect } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import type { Pair } from '../lib/api';

// Approximate city centres only, never individual home locations.
const cities: Record<string, [number, number]> = {
  lagos: [6.5244, 3.3792], abuja: [9.0765, 7.3986],
  kano: [12.0022, 8.5920], ibadan: [7.3775, 3.9470],
  kaduna: [10.5105, 7.4165], portharcourt: [4.8156, 7.0498],
  enugu: [6.4584, 7.5464], benin: [6.3350, 5.6037],
  abeokuta: [7.1475, 3.3619], jos: [9.8965, 8.8583],
  maiduguri: [11.8333, 13.1500], ilorin: [8.4966, 4.5421],
  owerri: [5.4840, 7.0351], uyo: [5.0377, 7.9128],
  calabar: [4.9757, 8.3417], ogunstate: [7.1475, 3.3619],
  bauchi: [10.3103, 9.8439], sokoto: [13.0059, 5.2476],
  birninkebbi: [12.4539, 4.1975], gusau: [12.1628, 6.6614],
  makurdi: [7.7322, 8.5391], osogbo: [7.7827, 4.5418],
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '').replace(/^portharcourtcity$/, 'portharcourt');
}

function ResizeMapWithPanel() {
  const map = useMap();
  useEffect(() => {
    const node = map.getContainer();
    let frame = 0;
    const updateSize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => map.invalidateSize({ pan: false }));
    };
    updateSize();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateSize);
      observer.observe(node);
      return () => { observer.disconnect(); cancelAnimationFrame(frame); };
    }
    window.addEventListener('resize', updateSize);
    return () => { window.removeEventListener('resize', updateSize); cancelAnimationFrame(frame); };
  }, [map]);
  return null;
}

export default function LocationMap({ items }: { items: Pair[] }) {
  const plotted = items
    .map((item) => ({ ...item, point: cities[normalize(item.name)] }))
    .filter((item): item is Pair & { point: [number, number] } => Boolean(item.point));

  return (
    <div className="location-map-content">
      <div className="map-wrap">
        <MapContainer center={[9.08, 8.67]} zoom={5} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
          <ResizeMapWithPanel />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {plotted.map((item) => (
            <CircleMarker
              key={item.name}
              center={item.point}
              radius={Math.max(7, Math.min(22, 6 + Math.sqrt(item.value) * 3))}
              pathOptions={{ color: '#ba3272', fillColor: '#ee85ad', fillOpacity: 0.65, weight: 2 }}
            >
              <Popup>{item.name}: {item.value} users</Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
      <p className="map-note">
        Approximate city centres or state-capital locations only. {plotted.length} of {items.length} location categories mapped.
        Unrecognised or unspecified locations remain in the table below.
      </p>
    </div>
  );
}
