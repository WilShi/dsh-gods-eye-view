const STYLES = new Set(['normal', 'retro', 'surveillance', 'thermal', 'anime', 'noir']);
const MAPS = new Set(['photoreal', 'esri-imagery', 'osm', 'bing-aerial', 'bing-labels']);
const FOLLOW_KINDS = new Set(['aircraft', 'military_aircraft', 'satellite']);

function number(value, fallback, min, max, name) {
  const result = value === undefined || value === null ? fallback : Number(value);
  if (!Number.isFinite(result) || result < min || result > max) throw new TypeError(`${name} must be between ${min} and ${max}`);
  return result;
}

function sanitizeCamera(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('camera is required');
  return {
    lat: number(input.lat, undefined, -90, 90, 'camera.lat'),
    lon: number(input.lon, undefined, -180, 180, 'camera.lon'),
    altitude_m: Math.round(number(input.altitude_m, 800000, 50, 20000000, 'camera.altitude_m')),
    heading_deg: Math.round(number(input.heading_deg, 0, 0, 360, 'camera.heading_deg')) % 360,
    pitch_deg: Math.round(number(input.pitch_deg, -90, -90, 0, 'camera.pitch_deg')),
  };
}

function sanitizeView(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('A view object is required');
  const layers = input.layers === undefined ? [] : input.layers;
  if (!Array.isArray(layers) || layers.some((layer) => typeof layer !== 'string')) throw new TypeError('layers must be an array of strings');
  if (input.style !== undefined && input.style !== null && !STYLES.has(input.style)) throw new TypeError('Unknown visual style');
  if (input.map !== undefined && input.map !== null && !MAPS.has(input.map)) throw new TypeError('Unknown map source');
  let follow = null;
  if (input.follow !== undefined && input.follow !== null) {
    const value = input.follow;
    if (!value || typeof value !== 'object' || !FOLLOW_KINDS.has(value.kind) || !/^[0-9A-Za-z~_-]{1,16}$/.test(String(value.id || ''))) throw new TypeError('Invalid follow target');
    if (value.cockpit === true && value.kind === 'satellite') throw new TypeError('Satellites have no cockpit view');
    follow = { kind: value.kind, id: String(value.id).toLowerCase(), ...(value.cockpit === true ? { cockpit: true } : {}) };
  }
  if (input.annotations !== undefined && !Array.isArray(input.annotations)) throw new TypeError('annotations must be an array');
  return {
    camera: sanitizeCamera(input.camera),
    layers: layers.slice(0, 64),
    style: input.style ?? 'normal',
    map: input.map ?? 'esri-imagery',
    follow,
    annotations: (input.annotations || []).slice(0, 24),
  };
}

/** One latest view for the DSH panel; the upstream protocol serializes application. */
export function createViewController() {
  let pending = { id: null };
  let sequence = 0;
  return {
    getPending: () => pending,
    definition: {
      name: 'gods_eye_view',
      description: 'Open the DSH God’s Eye View panel and apply a map view. Use for flying to coordinates, changing layers, visual style or map source, tracking an aircraft/satellite, or adding annotations. camera.lat and camera.lon are required; other fields are optional. The view is queued and the panel applies it asynchronously.',
      parameters: {
        type: 'object',
        properties: {
          camera: {
            type: 'object',
            description: 'Camera above a WGS84 coordinate.',
            properties: {
              lat: { type: 'number', minimum: -90, maximum: 90 },
              lon: { type: 'number', minimum: -180, maximum: 180 },
              altitude_m: { type: 'number', minimum: 50, maximum: 20000000 },
              heading_deg: { type: 'number', minimum: 0, maximum: 360 },
              pitch_deg: { type: 'number', minimum: -90, maximum: 0 },
            },
            required: ['lat', 'lon'],
            additionalProperties: false,
          },
          layers: { type: 'array', maxItems: 64, items: { type: 'string' }, description: 'Layer ids such as flights, satellites or earthquakes.' },
          style: { type: 'string', enum: ['normal', 'retro', 'surveillance', 'thermal', 'anime', 'noir'] },
          map: { type: 'string', enum: ['photoreal', 'esri-imagery', 'osm', 'bing-aerial', 'bing-labels'] },
          follow: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['aircraft', 'military_aircraft', 'satellite'] },
              id: { type: 'string', pattern: '^[0-9A-Za-z~_-]{1,16}$' },
              cockpit: { type: 'boolean' },
            },
            required: ['kind', 'id'],
            additionalProperties: false,
          },
          annotations: { type: 'array', maxItems: 24, items: { type: 'object' } },
        },
        required: ['camera'],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            status: { type: 'string', const: 'queued' },
            view: { type: 'object' },
          },
          required: ['id', 'status', 'view'],
          additionalProperties: false,
        },
        render: (_args, value) => [{ type: 'text', text: `God’s Eye View ${value.id} is queued. The DSH panel will open and apply it.` }],
      },
      async execute(args) {
        const view = sanitizeView(args);
        sequence += 1;
        const id = `dsh-gev-${Date.now()}-${sequence}`;
        pending = { id, view };
        return { id, status: 'queued', view };
      },
    },
  };
}
