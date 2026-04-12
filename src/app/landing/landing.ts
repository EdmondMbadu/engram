import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

@Component({
  selector: 'app-landing',
  imports: [RouterLink, ThemeToggleComponent],
  templateUrl: './landing.html',
})
export class LandingComponent {
  userAvatar = 'https://lh3.googleusercontent.com/aida-public/AB6AXuAhjy15vNYzaxBTVD4z733KvpRD51QIEFTkVhhPt3iMje7q7OHOqBSqVFQLnyhGCbbEwrodVOOGGrn7xNpLPHnjPplbSUE1yL2JCbbOm6k3_iJdAOvCxBLrgrOUfyqe_t8rOGjKaYEyOw36tH_DrA1F7TK5gjM_rwGc32fE5O49-C0WJ8i4bgacVPDBPKd4GQWijIRNRVjmvrL-Hrt9eHfO9R0GaJq92oVIYGN1mgTV4uqck4o31Jw1FMTuMa0KRgeEzWBvaiXDxAUO';
  aiAvatar = '/assets/living-atlas-logo.png';
}
