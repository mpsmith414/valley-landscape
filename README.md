# Valley Landscape

A procedural northern valley for [three.js](https://threejs.org/) and WebGPU: rolling hills and rocky ridges shaped and
eroded by code, a lake and a winding river, a forest of pines, spruces and birches, meadows full of grass and wildflowers,
a day and night cycle with a moving sun, moon and stars, wind in the trees and an ambient soundscape.

Use it as a backdrop or a world for your own project: it gives you an ordinary three.js scene and camera to add your own
things to, and a `valley` object that answers questions about the ground (its height, slope, water and biomes).

## Requirements

- Node.js 22.9 or newer
- A browser with WebGPU (a recent Chrome or Edge)
- three.js 0.186 (the code leans on a few of its internals; other versions may need small changes)

## Run the demo

```bash
npm install
npm run dev
```

Open http://localhost:5181/ and click to fly. The first visit makes the valley in a background worker (a few seconds) and
keeps it in the browser, so later visits open faster. Add `?tier=low` or `?tier=medium` to the address for slower
computers; with no tier it measures your computer once and remembers its pick.

A smaller example, a box of your own standing on the meadow, is at http://localhost:5181/demo/minimal.html.

| | Controller | Keyboard and mouse |
|---|---|---|
| Move | Left stick | W A S D |
| Look | Right stick | Mouse (click the view first) |
| Up / down | RT / LT | E / Q |
| Fast | RB (hold) | Shift (hold) |
| Walk height on / off | Y | G |
| Glide to a place | D-pad left / right | Arrow left / right, or 1–8 |
| Next time of day | D-pad up | T |
| Time slower / faster | LB | [ / ] |
| Sound off / on | | M |

`npm test` runs the tests and `npm run build` makes the static site in `dist/`.

## Use it in your project

Copy `src/` and `public/assets/` into a [Vite](https://vite.dev/) project that has `three@0.186.1` and `idb` installed
(the assets must be served at the site's base URL, which is what Vite's `public/` folder does). Then:

```ts
import { createLandscape } from './landscape';

const land = await createLandscape({ canvas: document.querySelector('canvas')! });

// your own things: anything on layer 0 is lit, casts shadows and shows in the lake
const y = land.valley.heightAt(-200, 150);
myThing.position.set(-200, y, 150);
land.scene.add(myThing);

land.renderer.setAnimationLoop(() => {
  // move land.camera however you like, then:
  land.update(1 / 60);
  land.render();
});
void land.compileRest(); // the shaders the first view did not need, in the background
```

`createLandscape` takes:

| Option | Default | |
|---|---|---|
| `canvas` | | The canvas to draw on |
| `tier` | `'high'` | `'low'`, `'medium'` or `'high'` |
| `layout` | `VALLEY` | The valley to make (see below) |
| `onProgress` | | Called as each step of loading starts and ends |

What it gives back:

| | |
|---|---|
| `scene`, `camera`, `renderer` | Plain three.js objects |
| `valley` | `heightAt`, `normalAt`, `isWater`, `waterLevelAt`, `waterDepthAt`, `biomeAt`, `moistureAt`, `flowAt`, `trunksNear`, `inside` (all in metres; x east, z south, y up) |
| `clock` | The time of day: `hour`, `speed` (valley hours per real second), `paused` |
| `setHour(h)` | Jump to an hour, with the light snapped to it |
| `update(dt)`, `render()` | Once a frame |
| `resize()` | After the canvas changes size |
| `data` | The raw generated maps: heights, water, biomes, plant positions |

Also exported: `createAmbience(land)` for the sound (call its `resume()` from a click, since browsers only play sound after
one, and `update(dt)` each frame), `FreeFly` and `Glide` for the demo's camera, `pacing` for dynamic resolution, and
`generateValley` to make the data without drawing anything (in Node too).

## Changing the valley

`VALLEY` in `src/valley/layout.ts` describes the valley in a few dozen numbers: its ridges, the lake's shore, the river's
course, where the meadows, rocks and beach go, and eight named viewpoints. Copy it and change those, or just its `seed`
for different hills, erosion and plants on the same shape. The world is a fixed 1.6 km square (`size` must stay 1600).

Only this one valley has been looked over closely: other seeds and layouts should work, but check that the lake and the
river still sit where you expect.

## Inside

- `src/valley`: makes the land. A height map from the layout's ridges and noise, rain erosion, the lake and river carved
  in, biome maps, and plant positions, in a background worker, cached in IndexedDB.
- `src/world`: draws it. Terrain with photo textures blended by biome, the lake (with a mirror on High) and the river,
  the sky, sun, moon and stars, the light and fog for each hour, and the far ridges beyond the edge.
- `src/plants`: the trees, shrubs, ferns, rocks and logs, built from code, swaying in the wind, with impostors for the far
  forest and grass placed on the GPU around the camera.
- `src/audio`: the soundscape, mixed for where the camera is (by the river, the lake, in the forest) and the hour.
- `src/render`: the renderer, a small post pipeline (bloom, tone mapping, a colour grade that follows the hour) and quality
  tiers.

## Credits and licence

The code is under the [MIT licence](LICENSE). The ground and bark textures (from [Poly Haven](https://polyhaven.com/) and
[ambientCG](https://ambientcg.com/)) and the ambient recordings (by Joseph Sardin on [BigSoundBank](https://bigsoundbank.com/))
are all CC0, public domain; [`public/assets/CREDITS.md`](public/assets/CREDITS.md) lists each one. The leaf, needle and fern
cards and the birch bark are painted in code.
