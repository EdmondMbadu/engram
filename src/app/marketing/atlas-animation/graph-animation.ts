import { isPlatformBrowser } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';

interface Node {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Connection {
  source: Node;
  target: Node;
}

@Component({
  selector: 'app-graph-animation',
  standalone: true,
  template: `
    <div class="relative w-full h-full bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden group/graph">
      <svg viewBox="0 0 400 300" class="w-full h-full">
        <defs>
          <filter id="nodeGlow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <!-- Connections -->
        @for (conn of connections; track conn.source.id + '-' + conn.target.id) {
          <line [attr.x1]="conn.source.x" [attr.y1]="conn.source.y"
                [attr.x2]="conn.target.x" [attr.y2]="conn.target.y"
                stroke="var(--accent)" stroke-width="0.5" stroke-opacity="0.2" />
        }

        <!-- Nodes -->
        @for (node of nodes; track node.id) {
          <circle [attr.cx]="node.x" [attr.cy]="node.y" r="2"
                  fill="var(--accent)" filter="url(#nodeGlow)" class="animate-pulse"
                  [style.animation-delay]="(node.id * 100) + 'ms'" />
        }
      </svg>
    </div>

    <style>
      .animate-pulse {
        animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: .5; transform: scale(1.2); }
      }
    </style>
  `,
})
export class GraphAnimationComponent implements OnInit, OnDestroy {
  nodes: Node[] = [];
  connections: Connection[] = [];
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private frameId: any;

  ngOnInit() {
    this.initGraph();
    if (this.isBrowser) {
      this.animate();
    }
  }

  ngOnDestroy() {
    if (this.frameId && this.isBrowser) {
      cancelAnimationFrame(this.frameId);
    }
  }

  private initGraph() {
    const nodeCount = 20;
    for (let i = 0; i < nodeCount; i++) {
      this.nodes.push({
        id: i,
        x: Math.random() * 400,
        y: Math.random() * 300,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2
      });
    }

    // Connect nodes that are close to each other
    for (let i = 0; i < nodeCount; i++) {
      for (let j = i + 1; j < nodeCount; j++) {
        if (Math.random() < 0.15) {
          this.connections.push({ source: this.nodes[i], target: this.nodes[j] });
        }
      }
    }
  }

  private animate() {
    this.nodes.forEach(node => {
      node.x += node.vx;
      node.y += node.vy;

      if (node.x < 0 || node.x > 400) node.vx *= -1;
      if (node.y < 0 || node.y > 300) node.vy *= -1;
    });

    this.frameId = requestAnimationFrame(() => this.animate());
  }
}
