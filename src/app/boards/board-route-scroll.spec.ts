import { resetBoardRouteViewport } from './board-route-scroll';

describe('resetBoardRouteViewport', () => {
  it('keeps the internal board viewport and window at the top across rendering', () => {
    const viewport = { scrollTop: 840, scrollLeft: 24 };
    const frames: FrameRequestCallback[] = [];
    const targetWindow = {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      },
      scrollTo: jasmine.createSpy('scrollTo'),
    };

    resetBoardRouteViewport(() => viewport, targetWindow);
    expect(viewport).toEqual({ scrollTop: 0, scrollLeft: 0 });

    viewport.scrollTop = 360;
    frames.shift()?.(0);
    expect(viewport.scrollTop).toBe(0);

    viewport.scrollTop = 120;
    frames.shift()?.(0);
    expect(viewport.scrollTop).toBe(0);
    expect(targetWindow.scrollTo).toHaveBeenCalledTimes(3);
    expect(targetWindow.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  });

  it('resets a viewport that appears after the route subscription runs', () => {
    const frames: FrameRequestCallback[] = [];
    const targetWindow = {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      },
      scrollTo: jasmine.createSpy('scrollTo'),
    };
    let viewport: { scrollTop: number; scrollLeft: number } | null = null;

    resetBoardRouteViewport(() => viewport, targetWindow);
    viewport = { scrollTop: 720, scrollLeft: 16 };
    frames.shift()?.(0);

    expect(viewport).toEqual({ scrollTop: 0, scrollLeft: 0 });
  });
});
