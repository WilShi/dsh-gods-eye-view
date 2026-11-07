import { createUpstreamManager } from './upstream.js';
import { createViewController } from './view.js';

export const inject = ['webServer', 'connection', 'subprocess', 'tools'];

const API_ROUTE = '/gods-eye-panel/api';

function sendJson(res, status, value, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(JSON.stringify(value));
}

function admit(ctx, req, res) {
  const admission = ctx.connection.admit(req);
  if (!('rejection' in admission)) return true;
  sendJson(res, admission.rejection, { error: admission.rejection === 401 ? 'unauthorized' : 'forbidden' });
  return false;
}

/** Serve only upstream health; the full app runs on its own loopback port. */
export function apply(ctx, config = {}) {
  const upstream = createUpstreamManager(ctx, config);
  const views = createViewController();
  ctx.effect(() => ctx.tools.register(views.definition), 'gods-eye-panel: agent view tool');
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: API_ROUTE,
    handler: async (req, res) => {
      if (!admit(ctx, req, res)) return;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'GET, HEAD' });
        return;
      }
      const route = new URL(req.url || '/', 'http://gods-eye.invalid').pathname.slice(API_ROUTE.length).replace(/^\/+/, '');
      if (route === 'status') {
        sendJson(res, 200, upstream.getState());
        return;
      }
      if (route === 'pending-view') {
        sendJson(res, 200, views.getPending());
        return;
      }
      sendJson(res, 404, { error: 'Unknown API route' });
    },
  }), 'gods-eye-panel: upstream status');
}
