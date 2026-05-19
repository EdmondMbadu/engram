import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink, ThemeToggleComponent],
  templateUrl: './not-found.html',
})
export class NotFoundComponent {}
