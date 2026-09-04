import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-auth-story-panel',
  imports: [RouterLink],
  templateUrl: './auth-story-panel.html',
  styleUrl: './auth-story-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthStoryPanelComponent {
  readonly mode = input<'create' | 'sign-in'>('create');
}
