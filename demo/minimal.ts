/** The smallest use of the landscape: a thing of your own standing on the ground, with the camera circling it. */
import { BoxGeometry, Mesh, MeshStandardNodeMaterial } from 'three/webgpu';
import { createLandscape } from '../src/index';

const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const land = await createLandscape({ canvas });
const { scene, camera, valley, renderer } = land;
window.addEventListener('resize', land.resize);
land.setHour(17);

// Stand a box on the meadow: `heightAt` gives the ground's height at any x, z (in metres).
const x = -200, z = 150;
const ground = valley.heightAt(x, z);
const box = new Mesh(new BoxGeometry(4, 4, 4), new MeshStandardNodeMaterial({ color: '#b5533c', roughness: 0.8 }));
box.position.set(x, ground + 2, z);
box.castShadow = box.receiveShadow = true;
scene.add(box);

let last = performance.now(), angle = 0;
renderer.setAnimationLoop((now: number) => {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  angle += dt * 0.15;
  // Keep the camera above the ground as it circles, however the land rises and falls.
  const cx = x + Math.sin(angle) * 24, cz = z + Math.cos(angle) * 24;
  camera.position.set(cx, Math.max(valley.heightAt(cx, cz) + 2, ground + 7), cz);
  camera.lookAt(box.position);
  land.update(dt);
  land.render();
});

void land.compileRest();
