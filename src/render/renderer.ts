import { NeutralToneMapping, PCFSoftShadowMap, WebGPURenderer } from 'three/webgpu';
import { QUALITY, type Tier } from './quality';

export type Backend = 'webgpu' | 'webgl2';

/** WebGPU when the browser has it, WebGL 2 otherwise (three.js falls back by itself). */
export async function createRenderer(canvas: HTMLCanvasElement, tier: Tier): Promise<{ renderer: WebGPURenderer; backend: Backend }> {
  // An opaque canvas, so the page never shows through the frame. `antialias` stays on (harmless): the picture's MSAA comes
  // from the post pipeline's scene pass (post.ts), and direct renders (the shadow warm-up, impostor bakes) keep it.
  const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[tier].pixelRatio));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  // Neutral, not AgX: AgX greyed the valley's greens and blues and, with the haze on top, washed the middle distance out to
  // a pale blue-grey. The lighting table's exposures are tuned for Neutral (the sky sets the exposure each frame).
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  await renderer.init();
  const backend: Backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2';
  return { renderer, backend };
}
