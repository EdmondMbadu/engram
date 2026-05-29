import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import type { AtlasItem } from '../atlas.models';
import { AtlasService } from '../atlas.service';
import { PlaceReviewsService, type CityPlaceCandidate, type CityPlaceReview, type CityReviewedPlace } from '../place-reviews.service';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

@Component({
  selector: 'app-city-places',
  imports: [RouterLink, ThemeToggleComponent],
  templateUrl: './city-places.html',
})
export class CityPlacesComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly atlasService = inject(AtlasService);
  private readonly placeReviewsService = inject(PlaceReviewsService);
  private readonly sanitizer = inject(DomSanitizer);
  private placeSearchTimer: ReturnType<typeof setTimeout> | null = null;

  readonly routeSlug = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('slug'))),
    { initialValue: this.route.snapshot.paramMap.get('slug') },
  );
  readonly routePlaceId = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('place'))),
    { initialValue: this.route.snapshot.queryParamMap.get('place') },
  );
  private openedDeepLinkPlaceId: string | null = null;

  readonly atlas = signal<AtlasItem | null>(null);
  readonly atlasLoading = signal(true);
  readonly atlasError = signal<string | null>(null);
  readonly reviewedPlaces = signal<CityReviewedPlace[]>([]);
  readonly reviewedPlacesLoading = signal(false);
  readonly reviewedPlaceSearchQuery = signal('');
  readonly selectedMapPlace = signal<CityPlaceCandidate | null>(null);
  readonly selectedDetailPlace = signal<CityReviewedPlace | null>(null);
  readonly placeDetailReviews = signal<CityPlaceReview[]>([]);
  readonly placeDetailReviewsLoading = signal(false);
  readonly placeDetailError = signal<string | null>(null);
  readonly placeDrawerOpen = signal(false);
  readonly placeSearchQuery = signal('');
  readonly placeSearchResults = signal<CityPlaceCandidate[]>([]);
  readonly placeSearchLoading = signal(false);
  readonly selectedReviewPlace = signal<CityPlaceCandidate | null>(null);
  readonly placeReviewRating = signal(5);
  readonly placeReviewText = signal('');
  readonly placeReviewSubmitting = signal(false);
  readonly placeReviewError = signal<string | null>(null);
  readonly placeReviewSuccess = signal<string | null>(null);
  readonly starValues = [1, 2, 3, 4, 5] as const;

  readonly cityName = computed(() =>
    this.atlasService.displayName(this.atlas())
      .replace(/^My living wiki:\s*/i, '')
      .replace(/\s*\(flagship\)\s*$/i, '')
      .trim(),
  );
  readonly country = computed(() => this.atlasService.cityCountryLabel(this.atlas()) ?? '');
  readonly chatLink = computed(() => {
    const slug = this.atlas()?.slug?.trim() || this.routeSlug()?.trim();
    return slug ? ['/chat', slug] : '/public-wikis';
  });
  readonly mapTitle = computed(() => {
    const place = this.mapPlace();
    return place ? `${place.name} map` : `${this.cityName()} map`;
  });
  readonly mapLocationLabel = computed(() => {
    const place = this.mapPlace();
    if (place) {
      return place.address || place.category || 'Selected place';
    }
    return [this.cityName(), this.country()].filter(Boolean).join(', ');
  });
  readonly mapEmbedUrl = computed<SafeResourceUrl>(() => {
    const place = this.mapPlace();
    const query = place?.lat !== null && place?.lng !== null && typeof place?.lat === 'number' && typeof place?.lng === 'number'
      ? `${place.lat},${place.lng}`
      : [place?.name || this.cityName(), place?.address || this.country()].filter(Boolean).join(', ');
    const url = `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=${place ? '15' : '11'}&output=embed`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });
  readonly detailMapEmbedUrl = computed<SafeResourceUrl>(() => {
    const place = this.selectedDetailPlace();
    const query = place?.lat !== null && place?.lng !== null && typeof place?.lat === 'number' && typeof place?.lng === 'number'
      ? `${place.lat},${place.lng}`
      : [place?.name || this.cityName(), place?.address || this.country()].filter(Boolean).join(', ');
    const url = `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=${place ? '15' : '11'}&output=embed`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });
  readonly reviewedPlacesCountLabel = computed(() => {
    const count = this.reviewedPlaces().length;
    return count === 1 ? '1 reviewed place' : `${count} reviewed places`;
  });
  readonly mapPlace = computed(() => this.selectedReviewPlace() ?? this.selectedMapPlace());
  readonly filteredReviewedPlaces = computed(() => {
    const query = this.reviewedPlaceSearchQuery().trim().toLowerCase();
    const places = this.reviewedPlaces();
    if (!query) {
      return places;
    }

    const tokens = query.split(/\s+/).filter(Boolean);
    return places.filter((place) => {
      const haystack = [
        place.name,
        place.address,
        place.category,
        place.latestReviewText,
      ].join(' ').toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  });
  readonly reviewedPlacesResultLabel = computed(() => {
    const count = this.filteredReviewedPlaces().length;
    if (!this.reviewedPlaceSearchQuery().trim()) {
      return this.reviewedPlacesCountLabel();
    }
    return count === 1 ? '1 match' : `${count} matches`;
  });
  readonly canSubmitPlaceReview = computed(() =>
    !!this.atlas()?.id
    && !!this.selectedReviewPlace()
    && this.placeReviewRating() >= 1
    && this.placeReviewRating() <= 5
    && this.placeReviewText().trim().length >= 3
    && !this.placeReviewSubmitting(),
  );

  constructor() {
    effect((onCleanup) => {
      const slug = this.routeSlug();
      let cancelled = false;

      this.atlas.set(null);
      this.atlasError.set(null);
      this.atlasLoading.set(true);
      this.reviewedPlaces.set([]);
      this.resetReviewState();

      if (!slug) {
        this.atlasLoading.set(false);
        this.atlasError.set('City not found.');
        return;
      }

      void this.atlasService
        .getPublicAtlasBySlug(slug)
        .then((atlas) => {
          if (cancelled) return;
          if (!atlas || atlas.city_config?.enabled !== true) {
            this.atlasError.set('City places are only available for public city wikis.');
            this.atlas.set(null);
            return;
          }
          this.atlas.set(atlas);
        })
        .catch(() => {
          if (!cancelled) {
            this.atlasError.set('Could not load this city.');
          }
        })
        .finally(() => {
          if (!cancelled) {
            this.atlasLoading.set(false);
          }
        });

      onCleanup(() => {
        cancelled = true;
      });
    });

    effect((onCleanup) => {
      const atlasId = this.atlas()?.id ?? null;
      let cancelled = false;

      if (!atlasId) {
        this.reviewedPlaces.set([]);
        this.reviewedPlacesLoading.set(false);
        return;
      }

      this.reviewedPlacesLoading.set(true);
      void this.placeReviewsService
        .listCityReviewedPlaces(atlasId)
        .then((places) => {
          if (!cancelled) {
            this.reviewedPlaces.set(places);
          }
        })
        .catch(() => {
          if (!cancelled) {
            this.reviewedPlaces.set([]);
          }
        })
        .finally(() => {
          if (!cancelled) {
            this.reviewedPlacesLoading.set(false);
          }
        });

      onCleanup(() => {
        cancelled = true;
      });
    });

    effect(() => {
      const placeId = this.routePlaceId();
      const places = this.reviewedPlaces();
      if (!placeId || this.openedDeepLinkPlaceId === placeId) {
        return;
      }

      const place = places.find((item) => item.id === placeId || item.placeId === placeId);
      if (!place) {
        return;
      }

      this.openedDeepLinkPlaceId = placeId;
      void this.openPlaceDrawer(place);
    });
  }

  ngOnDestroy(): void {
    if (this.placeSearchTimer) {
      clearTimeout(this.placeSearchTimer);
      this.placeSearchTimer = null;
    }
  }

  onPlaceSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const query = input?.value ?? '';
    if (this.selectedReviewPlace()) {
      this.selectedReviewPlace.set(null);
      this.placeReviewText.set('');
    }
    this.placeSearchQuery.set(query);
    this.placeReviewError.set(null);
    this.placeReviewSuccess.set(null);

    if (this.placeSearchTimer) {
      clearTimeout(this.placeSearchTimer);
      this.placeSearchTimer = null;
    }

    if (query.trim().length < 2) {
      this.placeSearchResults.set([]);
      this.placeSearchLoading.set(false);
      return;
    }

    this.placeSearchLoading.set(true);
    this.placeSearchTimer = setTimeout(() => {
      void this.searchPlacesForReview(query);
    }, 350);
  }

  selectPlaceForReview(place: CityPlaceCandidate): void {
    this.selectedReviewPlace.set(place);
    this.selectedMapPlace.set(null);
    this.placeReviewRating.set(Math.max(1, Math.min(5, Math.round(place.ratingAvg ?? 5))));
    this.placeReviewText.set('');
    this.placeReviewError.set(null);
    this.placeReviewSuccess.set(null);
  }

  changeSelectedPlace(): void {
    this.selectedReviewPlace.set(null);
    this.placeReviewText.set('');
    this.placeReviewError.set(null);
    this.placeReviewSuccess.set(null);
  }

  selectReviewedPlaceOnMap(place: CityReviewedPlace): void {
    this.selectedMapPlace.set(place);
  }

  async openPlaceDrawer(place: CityReviewedPlace): Promise<void> {
    const atlasId = this.atlas()?.id;
    if (!atlasId) {
      return;
    }

    this.selectedDetailPlace.set(place);
    this.placeDrawerOpen.set(true);
    this.placeDetailReviews.set([]);
    this.placeDetailError.set(null);
    this.placeDetailReviewsLoading.set(true);

    try {
      const reviews = await this.placeReviewsService.listCityPlaceReviews(atlasId, place.id);
      if (this.selectedDetailPlace()?.id === place.id) {
        this.placeDetailReviews.set(reviews);
      }
    } catch (error) {
      if (this.selectedDetailPlace()?.id === place.id) {
        const message = typeof (error as { message?: unknown })?.message === 'string'
          ? (error as { message: string }).message
          : 'Could not load reviews for this place.';
        this.placeDetailError.set(message);
      }
    } finally {
      if (this.selectedDetailPlace()?.id === place.id) {
        this.placeDetailReviewsLoading.set(false);
      }
    }
  }

  closePlaceDrawer(): void {
    this.placeDrawerOpen.set(false);
  }

  formatReviewDate(value: string | null): string {
    if (!value) {
      return 'Recently';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'Recently';
    }
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  }

  setPlaceReviewRating(rating: number): void {
    this.placeReviewRating.set(rating);
  }

  starColor(star: number): string {
    return star <= this.placeReviewRating() ? 'var(--accent)' : 'var(--line-strong)';
  }

  starFillStyle(star: number): string {
    return star <= this.placeReviewRating()
      ? "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24"
      : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24";
  }

  async submitPlaceReview(): Promise<void> {
    const atlasId = this.atlas()?.id;
    const place = this.selectedReviewPlace();
    const text = this.placeReviewText().trim();
    if (!atlasId || !place || !this.canSubmitPlaceReview()) {
      return;
    }

    this.placeReviewSubmitting.set(true);
    this.placeReviewError.set(null);
    this.placeReviewSuccess.set(null);

    try {
      const updatedPlace = await this.placeReviewsService.submitCityPlaceReview({
        atlasId,
        place,
        rating: this.placeReviewRating(),
        text,
      });
      if (updatedPlace) {
        this.reviewedPlaces.update((places) => {
          const existingIndex = places.findIndex((item) => item.id === updatedPlace.id);
          if (existingIndex === -1) {
            return [updatedPlace, ...places].slice(0, 80);
          }
          return [
            updatedPlace,
            ...places.slice(0, existingIndex),
            ...places.slice(existingIndex + 1),
          ].slice(0, 80);
        });
        this.selectedReviewPlace.set(updatedPlace);
      }
      this.placeReviewText.set('');
      this.placeReviewSuccess.set('Review saved. This place is now on the city board.');
    } catch (error) {
      this.placeReviewError.set(this.placeReviewErrorMessage(error));
    } finally {
      this.placeReviewSubmitting.set(false);
    }
  }

  placeRatingLabel(place: CityPlaceCandidate): string {
    const rating = place.ratingAvg ?? 0;
    const count = place.reviewCount ?? place.ratingCount ?? 0;
    if (!rating) {
      return count ? `${count} ratings` : 'New';
    }
    return count ? `${rating.toFixed(1)} · ${count}` : rating.toFixed(1);
  }

  placeReviewCountLabel(place: CityPlaceCandidate): string {
    const count = place.reviewCount ?? place.ratingCount ?? 0;
    if (!count) {
      return 'No local reviews yet';
    }
    return count === 1 ? '1 local review' : `${count} local reviews`;
  }

  placeInitial(name: string): string {
    return name.trim().charAt(0).toUpperCase() || 'P';
  }

  truncatePlaceText(value: string | undefined | null, max = 128): string {
    const text = (value ?? '').trim();
    if (text.length <= max) {
      return text;
    }
    return `${text.slice(0, max - 1).trim()}...`;
  }

  private resetReviewState(): void {
    this.placeSearchQuery.set('');
    this.placeSearchResults.set([]);
    this.reviewedPlaceSearchQuery.set('');
    this.selectedMapPlace.set(null);
    this.selectedDetailPlace.set(null);
    this.placeDetailReviews.set([]);
    this.placeDetailError.set(null);
    this.placeDrawerOpen.set(false);
    this.placeSearchLoading.set(false);
    this.selectedReviewPlace.set(null);
    this.placeReviewRating.set(5);
    this.placeReviewText.set('');
    this.placeReviewSubmitting.set(false);
    this.placeReviewError.set(null);
    this.placeReviewSuccess.set(null);
  }

  private async searchPlacesForReview(rawQuery: string): Promise<void> {
    const atlasId = this.atlas()?.id;
    const query = rawQuery.trim();
    if (!atlasId || query.length < 2 || query !== this.placeSearchQuery().trim()) {
      this.placeSearchLoading.set(false);
      return;
    }

    try {
      const places = await this.placeReviewsService.searchCityPlaces(atlasId, query);
      if (query === this.placeSearchQuery().trim()) {
        this.placeSearchResults.set(places);
      }
    } catch (error) {
      if (query === this.placeSearchQuery().trim()) {
        this.placeSearchResults.set([]);
        this.placeReviewError.set(this.placeReviewErrorMessage(error));
      }
    } finally {
      if (query === this.placeSearchQuery().trim()) {
        this.placeSearchLoading.set(false);
      }
    }
  }

  private placeReviewErrorMessage(error: unknown): string {
    const message = typeof (error as { message?: unknown })?.message === 'string'
      ? (error as { message: string }).message
      : '';
    if (message.includes('GOOGLE_PLACES_API_KEY') || message.includes('Place search')) {
      return 'Place search is not configured yet. Existing reviewed places still work.';
    }
    return message || 'Could not save that review. Please try again.';
  }
}
