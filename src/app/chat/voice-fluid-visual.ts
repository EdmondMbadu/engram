import { AfterViewInit, Component, OnDestroy, input, signal } from '@angular/core';

interface VoiceVisualPoint {
  x: number;
  y: number;
}

const RESTING_FLUID_PATH = 'M 238 105 C 238 141 207 167 160 167 C 113 167 82 141 82 105 C 82 69 113 43 160 43 C 207 43 238 69 238 105 Z';
const RESTING_RIBBON_PATH = 'M 30 105 C 75 91 112 119 160 105 C 208 91 245 119 290 105';
const RESTING_SECONDARY_RIBBON_PATH = 'M 30 114 C 78 126 116 99 160 114 C 204 129 242 102 290 114';

function coordinate(value: number): string {
  return value.toFixed(1);
}

function closedPath(points: VoiceVisualPoint[]): string {
  let path = `M ${coordinate(points[0].x)} ${coordinate(points[0].y)}`;
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const following = points[(index + 2) % points.length];
    path += ` C ${coordinate(current.x + (next.x - previous.x) / 6)} ${coordinate(current.y + (next.y - previous.y) / 6)}`;
    path += ` ${coordinate(next.x - (following.x - current.x) / 6)} ${coordinate(next.y - (following.y - current.y) / 6)}`;
    path += ` ${coordinate(next.x)} ${coordinate(next.y)}`;
  }
  return `${path} Z`;
}

function openPath(points: VoiceVisualPoint[]): string {
  let path = `M ${coordinate(points[0].x)} ${coordinate(points[0].y)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const current = points[index];
    const next = points[index + 1];
    const following = points[Math.min(points.length - 1, index + 2)];
    path += ` C ${coordinate(current.x + (next.x - previous.x) / 6)} ${coordinate(current.y + (next.y - previous.y) / 6)}`;
    path += ` ${coordinate(next.x - (following.x - current.x) / 6)} ${coordinate(next.y - (following.y - current.y) / 6)}`;
    path += ` ${coordinate(next.x)} ${coordinate(next.y)}`;
  }
  return path;
}

function fluidPath(activity: number, phase: number, speaking: boolean): string {
  const points: VoiceVisualPoint[] = [];
  const pointCount = 20;
  const radiusX = 79 + activity * 14;
  const radiusY = 57 + activity * 12;
  for (let index = 0; index < pointCount; index += 1) {
    const angle = (Math.PI * 2 * index) / pointCount;
    const broadWave = Math.sin(angle * 3 + phase) * (5 + activity * 10);
    const fineWave = Math.sin(angle * 5 - phase * 1.23) * (2.5 + activity * 6);
    const voiceBias = (speaking ? Math.sin(angle * 2 + phase * 0.72) : Math.cos(angle * 2 - phase * 0.64)) * activity * 4.5;
    const radius = broadWave + fineWave + voiceBias;
    points.push({
      x: 160 + Math.cos(angle) * (radiusX + radius) + Math.sin(angle * 2 + phase) * activity * 3.5,
      y: 105 + Math.sin(angle) * (radiusY + radius * 0.72) + Math.cos(angle * 3 - phase) * activity * 2.5,
    });
  }
  return closedPath(points);
}

function ribbonPath(activity: number, phase: number, offset: number): string {
  const points: VoiceVisualPoint[] = [];
  const pointCount = 30;
  for (let index = 0; index < pointCount; index += 1) {
    const progress = index / (pointCount - 1);
    const envelope = Math.pow(Math.sin(Math.PI * progress), 0.72);
    const amplitude = (2.5 + activity * (offset === 0 ? 21 : 15)) * envelope;
    const signal = Math.sin(progress * Math.PI * 5.2 + phase * 1.9 + offset) * amplitude
      + Math.sin(progress * Math.PI * 10.4 - phase * 1.14 + offset * 0.6) * amplitude * 0.24;
    points.push({ x: 30 + progress * 260, y: 105 + signal + offset * 5 });
  }
  return openPath(points);
}

@Component({
  selector: 'app-voice-fluid-visual',
  templateUrl: './voice-fluid-visual.html',
  styleUrl: './voice-fluid-visual.css',
})
export class VoiceFluidVisualComponent implements AfterViewInit, OnDestroy {
  readonly energy = input(0);
  readonly speaking = input(false);
  readonly fluidPath = signal(RESTING_FLUID_PATH);
  readonly ribbonPath = signal(RESTING_RIBBON_PATH);
  readonly secondaryRibbonPath = signal(RESTING_SECONDARY_RIBBON_PATH);

  private animationFrame: number | null = null;
  private lastFrameAt = 0;
  private reducedMotion = false;

  ngAfterViewInit(): void {
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (this.reducedMotion) return;
    this.animationFrame = window.requestAnimationFrame(this.tick);
  }

  ngOnDestroy(): void {
    if (this.animationFrame !== null) {
      window.cancelAnimationFrame(this.animationFrame);
    }
  }

  private readonly tick = (timestamp: number): void => {
    // This is decorative SVG motion. Fifteen updates per second remain fluid
    // while avoiding hundreds of path-string allocations during a long call.
    if (timestamp - this.lastFrameAt >= 66) {
      const activity = Math.max(0.1, Math.pow(Math.min(1, Math.max(0, this.energy())), 0.58));
      const phase = timestamp * (this.speaking() ? 0.0046 : 0.0038);
      this.fluidPath.set(fluidPath(activity, phase, this.speaking()));
      this.ribbonPath.set(ribbonPath(activity, phase, 0));
      this.secondaryRibbonPath.set(ribbonPath(activity, phase, 1.7));
      this.lastFrameAt = timestamp;
    }
    this.animationFrame = window.requestAnimationFrame(this.tick);
  };
}
