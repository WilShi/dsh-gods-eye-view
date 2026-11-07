import test from 'node:test';
import assert from 'node:assert/strict';
import { createViewController } from '../view.js';

const camera = { lat: 31.2304, lon: 121.4737, altitude_m: 1200000 };

test('valid view is queued with defaults and normalized follow target', async () => {
  const controller = createViewController();
  const result = await controller.definition.execute({
    camera,
    layers: ['satellites'],
    follow: { kind: 'satellite', id: 'ISS25544' },
  });
  assert.equal(result.status, 'queued');
  assert.equal(result.view.style, 'normal');
  assert.equal(result.view.map, 'esri-imagery');
  assert.equal(result.view.follow.id, 'iss25544');
  assert.equal(result.view.camera.heading_deg, 0);
  assert.equal(result.view.camera.pitch_deg, -90);
  assert.equal(controller.getPending().id, result.id);
  assert.match(controller.definition.output.render({}, result)[0].text, /queued/);
});

test('latest pending view replaces the previous command', async () => {
  const controller = createViewController();
  await controller.definition.execute({ camera });
  const next = await controller.definition.execute({ camera: { lat: 0, lon: 0 } });
  assert.equal(controller.getPending().id, next.id);
  assert.equal(controller.getPending().view.camera.lat, 0);
});

test('invalid views are rejected before queueing', async () => {
  const controller = createViewController();
  for (const input of [
    undefined,
    { layers: [] },
    { camera: { lat: 999, lon: 0 } },
    { camera, style: 'impossible' },
    { camera, map: 'impossible' },
    { camera, follow: { kind: 'satellite', id: '25544', cockpit: true } },
    { camera, layers: 'satellites' },
    { camera, annotations: {} },
  ]) {
    await assert.rejects(() => controller.definition.execute(input));
  }
  assert.equal(controller.getPending().id, null);
});
