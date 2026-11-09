/** The demo: fly round the valley with a controller or keyboard and mouse. */
import {
  DEFAULT_SPEED, FreeFly, Glide, Input, PRESETS, WORLD_QUALITY, createAmbience, createLandscape, gpuDone, intentFrom, pacing, remember, startQuality, stored, toggleDown,
  type LoadStage, type Viewpoint,
} from '../src/index';
import './demo.css';

const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const ui = document.querySelector<HTMLElement>('#ui')!;

const STAGES: Record<LoadStage, string> = {
  shape: 'Shaping the hills', erode: 'Letting the rain carve gullies', carve: 'Filling the lake', biomes: 'Painting the meadows',
  scatter: 'Planting the forest', plants: 'Growing the trees', textures: 'Rolling out the meadows', trees: 'Baking the far forest', shaders: 'Getting the picture ready',
};
const ORDER = Object.keys(STAGES) as LoadStage[];
/** Time speeds in valley hours per real second: the last takes a whole day in 90 seconds. */
const SPEEDS = [{ name: 'Paused', speed: 0 }, { name: 'Normal', speed: DEFAULT_SPEED }, { name: 'Fast', speed: 1 / 15 }, { name: 'Fastest', speed: 24 / 90 }];
const HOURS = [PRESETS.dawn, PRESETS.noon, PRESETS.golden, PRESETS.night];
/** The keys hint fades this long (ms) after the valley opens. */
const KEYS_FOR = 15_000;

const el = (cls: string, html = '') => {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = html;
  ui.append(d);
  return d;
};

const loading = el('screen loading', '<div class="card" role="status"><h1>Valley Landscape</h1><p class="say">Starting…</p><div class="bar"><i></i></div></div>');
const say = loading.querySelector<HTMLElement>('.say')!, bar = loading.querySelector<HTMLElement>('.bar > i')!;

function fail(message: string) {
  void loading.classList.remove('gone');
  loading.querySelector('.card')!.innerHTML = `<h1>Valley Landscape</h1><p>${message}</p><button type="button">Try again</button>`;
  loading.querySelector('button')!.addEventListener('click', () => location.reload());
}

async function main() {
  if (!navigator.gpu) return fail('The valley needs WebGPU. Try a recent version of Chrome or Edge.');

  // ?tier=low|medium|high, or Auto: High the first time, measured once, and its pick kept for next time
  const quality = startQuality(new URLSearchParams(location.search).get('tier') ?? stored<unknown>('landscape.tier', 'auto'), stored<unknown>('landscape.autoTier', null));
  const tier = quality.tier;
  const land = await createLandscape({
    canvas, tier,
    onProgress(stage, frac) {
      say.textContent = `${STAGES[stage]}…`;
      bar.style.transform = `scaleX(${(ORDER.indexOf(stage) + frac) / ORDER.length})`;
    },
  });
  const { camera, clock, renderer, valley, layout } = land;
  const report = renderer.onDeviceLost.bind(renderer);
  renderer.onDeviceLost = (info) => {
    report(info);
    void renderer.setAnimationLoop(null);
    fail('The picture got stuck for a moment. Shall we try again?');
  };
  const ambience = createAmbience(land);
  window.addEventListener('resize', land.resize);

  // ---------- the camera: free flight, with gliding viewpoints ----------
  const views = layout.viewpoints;
  const fly = new FreeFly({ x: camera.position.x, y: camera.position.y, z: camera.position.z }, camera.rotation.y, camera.rotation.x);
  let glide: { path: Glide; t: number } | null = null, current = views.length - 1;

  const place = el('place'), readout = el('readout');
  let placeTimer = 0;
  const show = (text: string) => {
    place.textContent = text;
    place.classList.add('on');
    clearTimeout(placeTimer);
    placeTimer = window.setTimeout(() => place.classList.remove('on'), 2500);
  };
  const goTo = (v: Viewpoint) => {
    glide = { path: new Glide({ pos: { ...fly.pos }, yaw: fly.yaw, pitch: fly.pitch }, v, valley), t: 0 };
    fly.walk = false;
    show(v.name);
  };
  const step = (by: number) => goTo(views[(current = (current + by + views.length) % views.length)]);

  // ---------- time ----------
  let speedAt = SPEEDS.findIndex((s) => s.speed === clock.speed), hourAt = 0;
  const stepSpeed = (by: number) => {
    speedAt = Math.max(0, Math.min(SPEEDS.length - 1, speedAt + by));
    clock.speed = SPEEDS[speedAt].speed;
  };
  const nextHour = () => land.setHour(HOURS[(hourAt = (hourAt + 1) % HOURS.length)]);
  const twoDigit = (n: number) => String(Math.floor(n)).padStart(2, '0');

  // ---------- input ----------
  const input = new Input();
  input.onPress = (b, repeat) => {
    if (repeat) return;
    if (b === 'left') step(-1);
    else if (b === 'right') step(1);
    else if (b === 'up') nextHour();
    else if (b === 'lb') stepSpeed(-1);
    else if (b === 'rb' && input.using === 'keys') stepSpeed(1); // the controller's RB is Fast
  };
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const n = Number(e.key);
    if (n >= 1 && n <= views.length) goTo(views[(current = n - 1)]);
    else if (e.key === 't' || e.key === 'T') nextHour();
    else if (e.key === 'm' || e.key === 'M') ambience.sound.mute(!ambience.sound.muted);
  });
  canvas.addEventListener('click', () => void canvas.requestPointerLock()?.catch?.(() => {}));

  // ---------- dynamic resolution and Auto quality ----------
  const pace = pacing({
    renderer, min: WORLD_QUALITY[tier].minScale, tier, measure: quality.measure, done: gpuDone(renderer),
    remember: (pick) => remember('landscape.autoTier', pick), label: show,
  });

  // ---------- the frame ----------
  let last = performance.now(), wasWalk = false;
  renderer.setAnimationLoop((now: number) => {
    const t0 = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    input.poll(dt, false);
    const pad = input.pad(), held = (k: string) => input.held(k);
    const intent = intentFrom(pad, held, input.mouse(), dt, wasWalk);
    wasWalk = toggleDown(pad, held);
    // any move or look takes the camera back from a glide
    const busy = intent.move.x || intent.move.y || intent.move.z || intent.look.yaw || intent.look.pitch;
    if (glide && busy) glide = null;
    if (glide) {
      glide.t += dt;
      const p = glide.path.sample(glide.t);
      fly.pos = { ...p.pos };
      fly.yaw = p.yaw;
      fly.pitch = p.pitch;
      fly.vel = { x: 0, y: 0, z: 0 };
      if (p.done) glide = null;
    } else fly.update(dt, intent, valley);
    fly.apply(camera);
    land.update(dt);
    ambience.update(dt);
    if (canvas.width > 0) {
      land.render();
      pace.frame(dt, t0);
    }
    const hour = clock.hour;
    readout.innerHTML = `${twoDigit(hour)}:${twoDigit((hour % 1) * 60)}<small>${SPEEDS[speedAt].name}</small>`;
  });

  // ---------- open ----------
  loading.classList.add('gone');
  const start = el('screen start', '<div class="card"><h1>Your valley is ready</h1><p>Click to fly. Turn your sound on.</p></div>');
  const keys = el('keys', '<kbd>WASD</kbd> move · <kbd>Mouse</kbd> look · <kbd>E Q</kbd> up, down · <kbd>Shift</kbd> fast · <kbd>G</kbd> walk · <kbd>1–8</kbd> places · <kbd>T</kbd> time · <kbd>[ ]</kbd> speed · <kbd>M</kbd> sound');
  const open = () => {
    start.classList.add('gone');
    void ambience.resume();
    void canvas.requestPointerLock()?.catch?.(() => {});
    setTimeout(() => keys.classList.add('gone'), KEYS_FOR);
  };
  start.addEventListener('click', open, { once: true });
  // Auto measures only once every shader is built: loading stalls must not count against the computer
  void land.compileRest().catch((e) => console.error('the plants could not compile', e)).then(() => pace.startAuto());
  // for trying things in the browser's console
  Object.assign(window, { landscape: land, goTo: (i: number) => goTo(views[(current = i)]), open });
}

main().catch((e) => {
  console.error('the valley could not start', e);
  fail('The valley got a bit tangled while we were making it. Shall we try again?');
});
