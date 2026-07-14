import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const ATLIXCO_CENTER = [18.9099148, -98.4368282];
const DEFAULT_ZOOM = 15;

function buildDivIcon(index, { skipStop, isSelected }) {
  const bg = skipStop ? '#9CA3AF' : isSelected ? '#F9A03F' : '#007991';
  return L.divIcon({
    className: 'route-point-marker',
    html: `<div style="
      background:${bg};color:#fff;width:26px;height:26px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-size:12px;font-weight:700;border:2px solid white;
      box-shadow:0 1px 4px rgba(0,0,0,0.4);
    ">${index + 1}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

/**
 * Editor visual de los puntos de una plantilla de ruta.
 *
 * Reemplaza la edicion manual de JSON: el admin trabaja sobre el mapa
 * (clic para agregar, arrastrar para ajustar, lista para reordenar/omitir
 * parada/eliminar) y esta clase mantiene el arreglo `points` internamente.
 * La pagina que la usa solo llama a `getPoints()` al enviar el formulario.
 */
export class RoutePointsEditor {
  constructor({ mapContainer, listContainer, initialPoints = [], referenceRoute = null, onChange }) {
    this.points = initialPoints.map((p) => ({ ...p }));
    this.history = [this.clonePoints()];
    this.historyIndex = 0;
    this.onChange = onChange || (() => {});
    this.selectedIndex = null;
    this.listContainer = listContainer;

    this.markersLayer = L.layerGroup();
    this.lineLayer = L.layerGroup();
    this.referenceLayer = L.layerGroup();

    const initialCenter = this.points[0] ? [this.points[0].lat, this.points[0].lng] : ATLIXCO_CENTER;
    this.map = L.map(mapContainer).setView(initialCenter, DEFAULT_ZOOM);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    }).addTo(this.map);

    this.referenceLayer.addTo(this.map);
    this.lineLayer.addTo(this.map);
    this.markersLayer.addTo(this.map);

    this.setReferenceRoute(referenceRoute);

    this.map.on('click', (e) => {
      this.addPoint({ lat: e.latlng.lat, lng: e.latlng.lng, skipStop: false });
    });

    // Cuando el mapa vive dentro de un grid/flex (como el layout de dos
    // columnas mapa+lista), Leaflet a veces calcula el tamano del
    // contenedor antes de que el layout termine de asentarse, dejando
    // tiles en blanco o mal posicionados. invalidateSize() lo corrige.
    requestAnimationFrame(() => this.map.invalidateSize());
    setTimeout(() => this.map.invalidateSize(), 250);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.map.invalidateSize());
      this.resizeObserver.observe(mapContainer);
    }

    this.handleKeyDown = this.handleKeyDown.bind(this);
    document.addEventListener('keydown', this.handleKeyDown);

    this.render();
  }

  /**
   * Dibuja, como referencia de solo lectura, el trazado de otra plantilla
   * (tipicamente la que esta activa ahora mismo en el grupo) para que el
   * admin pueda comparar visualmente mientras edita esta plantilla.
   */
  setReferenceRoute(points) {
    this.referenceLayer.clearLayers();
    if (!points || points.length < 2) return;

    const latlngs = points.map((p) => [p.lat, p.lng]);
    L.polyline(latlngs, {
      color: '#6B7280',
      weight: 3,
      opacity: 0.7,
      dashArray: '6 6',
    }).addTo(this.referenceLayer);

    points.forEach((p) => {
      L.circleMarker([p.lat, p.lng], {
        radius: 4,
        color: '#6B7280',
        fillColor: '#6B7280',
        fillOpacity: 0.8,
        weight: 1,
      }).addTo(this.referenceLayer);
    });
  }

  handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      this.undo();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
      e.preventDefault();
      this.redo();
    }
  }

  destroy() {
    document.removeEventListener('keydown', this.handleKeyDown);
    this.resizeObserver?.disconnect();
    this.map.remove();
  }

  clonePoints() {
    return this.points.map((p) => ({ ...p }));
  }

  pushHistory() {
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(this.clonePoints());
    this.historyIndex = this.history.length - 1;
  }

  undo() {
    if (this.historyIndex === 0) return;
    this.historyIndex -= 1;
    this.points = this.history[this.historyIndex].map((p) => ({ ...p }));
    this.render();
  }

  redo() {
    if (this.historyIndex >= this.history.length - 1) return;
    this.historyIndex += 1;
    this.points = this.history[this.historyIndex].map((p) => ({ ...p }));
    this.render();
  }

  addPoint(point) {
    this.points.push(point);
    if (this.points.length === 1) {
      this.map.setView([point.lat, point.lng], this.map.getZoom());
    }
    this.pushHistory();
    this.render();
  }

  updatePoint(index, patch) {
    this.points[index] = { ...this.points[index], ...patch };
    this.pushHistory();
    this.render();
  }

  removePoint(index) {
    this.points.splice(index, 1);
    if (this.selectedIndex === index) this.selectedIndex = null;
    this.pushHistory();
    this.render();
  }

  movePoint(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= this.points.length) return;
    const [moved] = this.points.splice(index, 1);
    this.points.splice(target, 0, moved);
    this.pushHistory();
    this.render();
  }

  clearAll() {
    if (this.points.length === 0) return;
    if (!confirm('Borrar todos los puntos del trazado?')) return;
    this.points = [];
    this.pushHistory();
    this.render();
  }

  getPoints() {
    return this.clonePoints();
  }

  render() {
    this.markersLayer.clearLayers();
    this.lineLayer.clearLayers();

    this.points.forEach((point, index) => {
      const marker = L.marker([point.lat, point.lng], {
        draggable: true,
        icon: buildDivIcon(index, { skipStop: point.skipStop, isSelected: this.selectedIndex === index }),
      });

      marker.on('dragend', (e) => {
        const { lat, lng } = e.target.getLatLng();
        this.updatePoint(index, { lat, lng });
      });

      marker.on('click', () => {
        this.selectedIndex = index;
        this.render();
        this.scrollListTo(index);
      });

      marker.addTo(this.markersLayer);
    });

    if (this.points.length >= 2) {
      const latlngs = this.points.map((p) => [p.lat, p.lng]);
      L.polyline(latlngs, { color: '#007991', weight: 4, opacity: 0.8 }).addTo(this.lineLayer);
    }

    this.renderList();
    this.onChange(this.getPoints());
  }

  scrollListTo(index) {
    const row = this.listContainer?.querySelector(`[data-point-index="${index}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }

  renderList() {
    if (!this.listContainer) return;

    if (this.points.length === 0) {
      this.listContainer.innerHTML =
        '<p class="text-sm text-ar-oxford-disabled p-3">Haz clic en el mapa para agregar el primer punto.</p>';
      return;
    }

    this.listContainer.innerHTML = this.points
      .map((point, index) => {
        const selectedClass = this.selectedIndex === index ? 'bg-ar-cerulean-disabled/40' : '';
        return `
        <div data-point-index="${index}" class="flex items-center gap-2 px-3 py-2 border-b border-gray-100 text-xs ${selectedClass}">
          <span class="font-semibold w-5">${index + 1}</span>
          <span class="flex-1 font-mono text-gray-600">${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}</span>
          <label class="flex items-center gap-1 cursor-pointer select-none whitespace-nowrap">
            <input type="checkbox" data-role="skip-stop" data-index="${index}" ${point.skipStop ? 'checked' : ''} />
            Omitir parada
          </label>
          <button type="button" data-role="move-up" data-index="${index}" class="px-1 hover:text-ar-cerulean" ${index === 0 ? 'disabled' : ''}>&uarr;</button>
          <button type="button" data-role="move-down" data-index="${index}" class="px-1 hover:text-ar-cerulean" ${index === this.points.length - 1 ? 'disabled' : ''}>&darr;</button>
          <button type="button" data-role="delete" data-index="${index}" class="px-1 text-ar-folly hover:underline">Eliminar</button>
        </div>`;
      })
      .join('');

    this.listContainer.querySelectorAll('[data-role="skip-stop"]').forEach((el) => {
      el.addEventListener('change', (e) => {
        const index = Number(e.target.dataset.index);
        this.updatePoint(index, { skipStop: e.target.checked });
      });
    });
    this.listContainer.querySelectorAll('[data-role="move-up"]').forEach((el) => {
      el.addEventListener('click', (e) => this.movePoint(Number(e.currentTarget.dataset.index), -1));
    });
    this.listContainer.querySelectorAll('[data-role="move-down"]').forEach((el) => {
      el.addEventListener('click', (e) => this.movePoint(Number(e.currentTarget.dataset.index), 1));
    });
    this.listContainer.querySelectorAll('[data-role="delete"]').forEach((el) => {
      el.addEventListener('click', (e) => this.removePoint(Number(e.currentTarget.dataset.index)));
    });
  }
}
