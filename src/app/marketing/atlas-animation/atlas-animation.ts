import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-atlas-animation',
  standalone: true,
  templateUrl: './atlas-animation.html',
})
export class AtlasAnimationComponent implements OnInit {
  nodes: { x: number; y: number; size: number; delay: number }[] = [];
  branches: string[] = [];

  ngOnInit() {
    this.generateNetwork();
  }

  generateNetwork() {
    const nodeCount = 12;
    const centerX = 400;
    const centerY = 300;

    for (let i = 0; i < nodeCount; i++) {
      const angle = (i / nodeCount) * Math.PI * 2 + (Math.random() * 0.5);
      const distance = 150 + Math.random() * 100;
      const x = centerX + Math.cos(angle) * distance;
      const y = centerY + Math.sin(angle) * distance;
      
      this.nodes.push({
        x,
        y,
        size: 3 + Math.random() * 3,
        delay: Math.random() * 2000
      });

      // Create organic branch from center to node
      const cp1x = centerX + Math.cos(angle) * (distance * 0.3) + (Math.random() - 0.5) * 50;
      const cp1y = centerY + Math.sin(angle) * (distance * 0.3) + (Math.random() - 0.5) * 50;
      const cp2x = centerX + Math.cos(angle) * (distance * 0.7) + (Math.random() - 0.5) * 50;
      const cp2y = centerY + Math.sin(angle) * (distance * 0.7) + (Math.random() - 0.5) * 50;
      
      this.branches.push(`M ${centerX} ${centerY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x} ${y}`);
    }
  }
}
