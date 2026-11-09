/**
 * Valley Landscape: a procedural northern valley for three.js and WebGPU.
 *
 * `createLandscape` builds everything (the land, water, forest, sky and light) and hands back an ordinary three.js scene and
 * camera to add your own things to. `valley` answers questions about the ground. Each frame, move the camera, then call
 * `update(dt)` and `render()`.
 */
import { PerspectiveCamera, Scene, type WebGPURenderer } from 'three/webgpu';
import { isLake, listenerPlace } from './audio/place';
import { createSoundscape, silentSoundscape, type Soundscape } from './audio/soundscape';
import { viewpointPose } from './camera/viewpoints';
import { GROUND_COVER_LAYER, createGroundCover, loadFlowerCards } from './plants/grass';
import { IMPOSTOR_LAYER, bakeImpostors, createImpostorLayer } from './plants/impostor';
import { createPlantMaterials, loadBarkSets, loadCards, setPlantLight } from './plants/material';
import { createWind, gustAt, setWind, updateWind, windUniforms, type WindState } from './plants/wind';
import { compileTogether } from './render/compile';
import { setGrade } from './render/grade';
import { gpuDone } from './render/pacing';
import { createPost, type Post } from './render/post';
import type { Tier } from './render/quality';
import { createRenderer, type Backend } from './render/renderer';
import { loadValley } from './valley/cache';
import type { GenStage } from './valley/generate';
import { VALLEY } from './valley/layout';
import { DEFAULT_GRID, WORLD_SIZE, type Layout, type ValleyData } from './valley/types';
import { createValley, type Valley } from './valley/valley';
import { createBackdrop } from './world/backdrop';
import { ValleyClock, elevationDeg, moonDirection, moonPhase, sunDirection } from './world/clock';
import { loadGroundSets } from './world/ground';
import { createLake } from './world/lake';
import { lightingAt, type LightState } from './world/lighting';
import { WORLD_QUALITY } from './world/quality';
import { createRiver } from './world/river';
import { createSky } from './world/sky';
import { createTerrain } from './world/terrain';
import { valleyTextures } from './world/textures';
import { MID_LAYER, NEAR_LAYER, VegetationTiles } from './world/tiles';

export { FreeFly, intentFrom, surfaceAt, toggleDown, type FlyIntent, type FlyWorld } from './camera/freefly';
export { Glide, viewpointPose } from './camera/viewpoints';
export { gpuDone, pacing, type Pacing } from './render/pacing';
export { startQuality, type QualityChoice, type Tier } from './render/quality';
export type { Backend } from './render/renderer';
export { Input } from './shared/input';
export { remember, stored } from './shared/settings';
export { VALLEY } from './valley/layout';
export { generateValley, type GenStage } from './valley/generate';
export type { Biomes, Layout, Viewpoint, ValleyData } from './valley/types';
export type { Valley } from './valley/valley';
export { DEFAULT_SPEED, PRESETS, ValleyClock, elevationDeg, moonDirection, sunDirection } from './world/clock';
export { WORLD_QUALITY } from './world/quality';
export type { Soundscape } from './audio/soundscape';

/** The camera's field of view (degrees). */
const CAMERA_FOV = 55;
/** The lake's mirror shows the forest only within this many metres of the shore (beyond, the lake is a sliver on screen). */
const MIRROR_PLANTS = 400;

/** The steps of loading, in order: making the land (skipped when it is in the browser's cache), then the rest. */
export type LoadStage = GenStage | 'textures' | 'trees' | 'shaders';

export type LandscapeOptions = {
  canvas: HTMLCanvasElement;
  /** The quality tier (default High). */
  tier?: Tier;
  /** The valley to make (default `VALLEY`). Its `size` must stay 1600 m. Copy `VALLEY` and change `seed` for different detail on the same shape. */
  layout?: Layout;
  /** Height samples along each side (default 2049). */
  grid?: number;
  /** Called with 0 as each step of loading starts, and with 1 as a step of making the land ends. */
  onProgress?: (stage: LoadStage, frac: number) => void;
};

export type Landscape = {
  renderer: WebGPURenderer;
  backend: Backend;
  post: Post;
  /** Add your own objects here. Things on layer 0 are drawn, cast shadows and show in the lake. */
  scene: Scene;
  /** Move this each frame, before `update`. It starts at the layout's last viewpoint. */
  camera: PerspectiveCamera;
  /** Ask about the ground: height, normal, water, biomes, trunks. */
  valley: Valley;
  /** The raw generated maps. */
  data: ValleyData;
  /** The time of day. */
  clock: ValleyClock;
  layout: Layout;
  tier: Tier;
  /** Was the land read from the browser's cache rather than made fresh? */
  cached: boolean;
  wind: WindState;
  /** Advance time, wind and water and fit the plants to the camera. Call once a frame, after moving the camera. */
  update(dt: number): void;
  /** Draw the frame. */
  render(): void;
  /** Match the canvas's size on the page. Call when it changes. */
  resize(): void;
  /** Go straight to this hour of the day (0..24), with the light snapped to it. */
  setHour(hour: number): void;
  /**
   * Compile every shader the opening view did not need, in the background (about 4 s). Until it is done, plants in those
   * shaders appear a moment late, but no frame stalls.
   */
  compileRest(): Promise<void>;
};

/** Build the landscape. Needs the textures from `public/assets` served at the site's base URL. One per page. */
export async function createLandscape(o: LandscapeOptions): Promise<Landscape> {
  const { canvas, tier = 'high', layout = VALLEY, grid = DEFAULT_GRID } = o;
  if (layout.size !== WORLD_SIZE) throw new Error(`createLandscape: layout.size must be ${WORLD_SIZE} (it is ${layout.size})`);
  const say = o.onProgress ?? (() => {});

  const ground = loadGroundSets(tier); // photo textures download and decode while the land is made
  const plantTex = Promise.all([ground.then(() => loadBarkSets()), loadCards(tier === 'high' ? 512 : 256), loadFlowerCards(tier === 'high' ? 256 : 128)]); // bark after the ground: one decode at a time
  const [{ renderer, backend }, { data, cached }] = await Promise.all([createRenderer(canvas, tier), loadValley(layout, grid, say)]);
  say('textures', 0);
  const sets = await ground;
  const [barks, cards, flowers] = await plantTex;
  const valley = createValley(data);

  const scene = new Scene();
  const camera = new PerspectiveCamera(CAMERA_FOV, 1, 0.1, 8000);
  const post = createPost(renderer, scene, camera, tier);

  const tex = valleyTextures(data);
  const terrain = createTerrain(tex, tier, sets);
  scene.add(terrain.object, createBackdrop(data, layout.seed));

  const clock = new ValleyClock();
  const sky = createSky(scene, renderer, tier, tex);
  // the water (after the sky: it mirrors the sky's environment map)
  const lake = createLake(data, tex, tier, scene, layout.lake), river = createRiver(data, tex, tier, scene);
  scene.add(lake.object, river.object);
  // the mirror draws the mid plants and the far forest's impostors only when the lake is near enough to show them
  const lakeDistance = (x: number, z: number) => layout.lake.outline.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.z - z)), Infinity);
  lake.mirrorLayers((cam) => (lakeDistance(cam.position.x, cam.position.z) < MIRROR_PLANTS ? 1 | (1 << MID_LAYER) | (1 << IMPOSTOR_LAYER) : 1));

  // the vegetation, swaying in one shared wind
  const wind = createWind(), windU = windUniforms();
  const plants = createPlantMaterials(cards, barks, windU, tier, sets);
  const veg = new VegetationTiles(data, data.plantModels, plants, WORLD_QUALITY[tier]);
  scene.add(veg.object);
  say('trees', 0);
  // the far forest: every tree's impostor, baked from the mid trees now that their materials exist
  const bake = await bakeImpostors(renderer, data.plantModels, plants, WORLD_QUALITY[tier].impostorSize);
  scene.add(createImpostorLayer(data, bake, WORLD_QUALITY[tier], plants, tier === 'high').object);
  camera.layers.enable(NEAR_LAYER);
  camera.layers.enable(MID_LAYER);
  camera.layers.enable(IMPOSTOR_LAYER);
  // the ground cover: grass, wildflowers, reeds and lily pads, placed on the GPU around the camera (no shadows cast, no mirror)
  const cover = createGroundCover(tex, windU, WORLD_QUALITY[tier], { ground: sets, light: plants.light, flowers });
  scene.add(cover.object);
  camera.layers.enable(GROUND_COVER_LAYER);
  // Shadow casters by cascade (about 0–75, 75–154, 154–260 and 260–600 m on High): near plants (within ~60 m) in the first
  // two, mid plants (from ~60 m) in the last three, the impostors (from ~210 m) in the last two. Layer 0 (the land, and
  // anything you add) in all of them.
  const NEAR = 1 << NEAR_LAYER, MID = 1 << MID_LAYER, IMP = 1 << IMPOSTOR_LAYER;
  sky.cascadeLayers([1 | NEAR, 1 | NEAR | MID, 1 | MID | IMP, 1 | MID | IMP]);

  const start = viewpointPose(layout.viewpoints[layout.viewpoints.length - 1], valley);
  camera.position.set(start.pos.x, start.pos.y, start.pos.z);
  camera.rotation.set(start.pitch, start.yaw, 0, 'YXZ');

  let waterTime = 0; // seconds the water has run
  /** Light the world for the clock's current time; `dt = Infinity` snaps the exposure and environment (after a jump). */
  const light = (dt: number): LightState => {
    const hour = clock.hour, sun = sunDirection(hour), moon = moonDirection(clock.hours);
    const state = lightingAt(hour, sun, moon, moonPhase(clock.hours));
    sky.update(state, sun, moon, camera, clock.hours, dt);
    setGrade(post.grade, sky.grade); // the grade eases with the exposure (in the sky), into the post's uniforms
    if (Number.isFinite(dt)) waterTime += dt;
    lake.update(waterTime, state, wind);
    setPlantLight(plants.light, state);
    river.update(waterTime, state);
    return state;
  };

  const resize = () => {
    let w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === 0 || h === 0) {
      if (canvas.width > 0) return; // hidden: keep the last size
      [w, h] = [1280, 720]; // loaded while hidden: draw at a sensible size anyway
    }
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();

  const update = (dt: number) => {
    clock.update(dt);
    camera.updateMatrixWorld();
    plants.fade.eye.value.copy(camera.position); // the trees' mid/far cross-fade follows the camera
    terrain.update(camera);
    updateWind(wind, dt, layout.seed);
    setWind(windU, wind);
    veg.update(camera, dt);
    cover.update(camera);
    light(dt);
  };
  update(0);
  light(Infinity);

  // what the opening view shows compiles now, then one frame is drawn (its shadow passes make pipelines of their own)
  say('shaders', 0);
  await compileTogether(renderer, scene, camera);
  post.render(); // also compiles the pipeline's own quad materials
  await gpuDone(renderer)?.();

  return {
    renderer, backend, post, scene, camera, valley, data, clock, layout, tier, cached, wind, update, resize,
    render: () => post.render(),
    setHour(hour) {
      clock.jumpTo(hour);
      light(Infinity);
    },
    compileRest: () => veg.compile(() => cover.compile(() => sky.withNight(() => compileTogether(renderer, scene, camera)))).then(() => {}),
  };
}

export type Ambience = {
  sound: Soundscape;
  /** Mix the sound for the camera; a failure is reported once and never stops the frame. */
  update(dt: number): void;
  /** Browsers only let sound play after a press: call this from a click or key handler. */
  resume(): Promise<void>;
};

/** The valley's ambient sound (wind, birds, crickets, the lake and the river), following the camera and the hour. */
export function createAmbience(land: Landscape): Ambience {
  // sound is a nicety: if the browser cannot make any, the valley goes on in silence
  let audio: AudioContext | null = null, sound: Soundscape;
  try {
    audio = new AudioContext();
    sound = createSoundscape(audio);
  } catch (e) {
    console.warn('sound: no audio in this browser; the valley will be silent', e);
    void audio?.close().catch(() => {});
    audio = null;
    sound = silentSoundscape();
  }
  const { camera, clock, valley, wind } = land;
  const place = listenerPlace(valley, isLake(valley, land.layout.lake.level));
  let failed = false;
  return {
    sound,
    update(dt) {
      try {
        const { x, y, z } = camera.position, hour = clock.hour;
        sound.update({ pos: { x, y, z }, hour, sunElevation: elevationDeg(sunDirection(hour)), gust: gustAt(wind, x, z), strength: wind.strength, ...place(x, y, z) }, dt);
      } catch (e) {
        if (!failed) console.warn('sound: the mix failed this frame', e);
        failed = true;
      }
    },
    resume: async () => {
      await audio?.resume();
    },
  };
}
