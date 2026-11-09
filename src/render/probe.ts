import { renderOutput } from 'three/tsl';
import type { RenderPipeline, WebGPURenderer } from 'three/webgpu';

/**
 * Dev-mode checks on the three.js internals the valley leans on (written against r186). `probe(ok, what)` warns once per `what` when `ok` is false, so an upgrade that moves one shows up in the
 * console instead of as a quiet slowdown or a wrong picture. Production builds skip the warning. Returns `ok`.
 */
const warned = new Set<string>();
export function probe(ok: boolean, what: string): boolean {
  if (!ok && import.meta.env.DEV && !warned.has(what)) {
    warned.add(what);
    console.warn(`three workaround: ${what}. Check it against the installed three (written for r186).`);
  }
  return ok;
}

/**
 * True when the post pipeline can grade after tone mapping: r186's `RenderPipeline` has an `outputColorTransform` switch
 * (off: the app places the tone mapping and output colour space itself, with `renderOutput`). If either has gone, `createPost`
 * draws straight with `renderer.render` instead (no bloom, no grade, no MSAA from the pass: the canvas's own antialiasing).
 */
export function pipelineOutput(pipeline: RenderPipeline): boolean {
  return probe(typeof renderOutput === 'function' && typeof (pipeline as { outputColorTransform?: unknown }).outputColorTransform === 'boolean',
    "three's RenderPipeline has no `outputColorTransform` (or `renderOutput` has gone), so the valley draws without post-processing (post.ts)");
}

/** The part of three's node frame the post pipeline uses. */
export type NodeFrameLike = { frameId: number; update(): void };
/**
 * The renderer's node frame (r186: `renderer._nodes.nodeFrame`, set by `init`). The post pipeline advances it when it renders
 * twice in one animation frame (see `createPost`). Null, with a warning naming `loss` (what the caller loses without it), if it has moved.
 */
export function nodeFrameOf(renderer: WebGPURenderer,
  loss = 'the post pipeline cannot start a new frame for shots and snapshots, which repeat the frame before (post.ts)'): NodeFrameLike | null {
  const f = (renderer as unknown as { _nodes?: { nodeFrame?: Partial<NodeFrameLike> } })._nodes?.nodeFrame;
  const ok = !!f && typeof f.frameId === 'number' && typeof f.update === 'function';
  return probe(ok, `three's renderer has no \`_nodes.nodeFrame\` (update, frameId), so ${loss}`) ? (f as NodeFrameLike) : null;
}
