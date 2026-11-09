import { afterEach, describe, expect, it, vi } from 'vitest';
import { RenderPipeline, type WebGPURenderer } from 'three/webgpu';
import { nodeFrameOf, pipelineOutput, probe } from '../../src/render/probe';

describe('probe', () => {
  afterEach(() => vi.restoreAllMocks());

  it('passes `ok` through and warns once per failing check', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(probe(true, 'fine')).toBe(true);
    expect(probe(false, 'broken thing')).toBe(false);
    expect(probe(false, 'broken thing')).toBe(false);
    expect(probe(false, 'another')).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0][0]).toContain('broken thing');
  });

  it("finds the render pipeline's own output transform switch and `renderOutput` (the post pipeline grades after tone mapping)", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const renderer = { toneMapping: 0, outputColorSpace: 'srgb' } as unknown as WebGPURenderer;
    expect(pipelineOutput(new RenderPipeline(renderer))).toBe(true);
    expect(pipelineOutput({} as RenderPipeline)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("finds the renderer's node frame (the post pipeline advances it for shots), and warns when it has gone", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const nodeFrame = { frameId: 3, update() {} };
    expect(nodeFrameOf({ _nodes: { nodeFrame } } as unknown as WebGPURenderer)).toBe(nodeFrame);
    expect(warn).not.toHaveBeenCalled();
    expect(nodeFrameOf({ _nodes: null } as unknown as WebGPURenderer)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('names what each caller loses when the node frame has gone (warned once per caller)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const gone = {} as unknown as WebGPURenderer;
    expect(nodeFrameOf(gone, 'the snapshot repeats (snapshot.ts)')).toBeNull();
    expect(nodeFrameOf(gone, 'the snapshot repeats (snapshot.ts)')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('_nodes.nodeFrame');
    expect(warn.mock.calls[0][0]).toContain('the snapshot repeats');
  });
});
