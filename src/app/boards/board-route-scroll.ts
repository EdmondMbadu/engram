export type BoardScrollViewport = {
  scrollLeft: number;
  scrollTop: number;
};

export type BoardScrollWindow = {
  requestAnimationFrame(callback: FrameRequestCallback): number;
  scrollTo(options: ScrollToOptions): void;
};

export function resetBoardRouteViewport(
  viewport: () => BoardScrollViewport | null,
  targetWindow: BoardScrollWindow,
): void {
  const reset = () => {
    const currentViewport = viewport();
    if (currentViewport) {
      currentViewport.scrollTop = 0;
      currentViewport.scrollLeft = 0;
    }
    targetWindow.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  };

  // The desktop boards page owns its own scroll container, so the Router's
  // window-level scroll restoration cannot reset it for a direct board route.
  reset();
  targetWindow.requestAnimationFrame(() => {
    reset();
    targetWindow.requestAnimationFrame(reset);
  });
}
