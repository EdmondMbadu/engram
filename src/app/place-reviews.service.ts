import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from './firebase.client';

export interface CityPlaceCandidate {
  id?: string;
  placeId: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  types: string[];
  category: string;
  googleMapsUrl: string;
  source: 'google' | 'reviewed';
  ratingAvg?: number;
  ratingCount?: number;
  reviewCount?: number;
  latestReviewText?: string;
  latestReviewRating?: number | null;
  latestReviewAt?: string | null;
}

export interface CityReviewedPlace extends CityPlaceCandidate {
  id: string;
  atlasId: string;
  citySlug: string;
  source: 'reviewed';
  ratingAvg: number;
  ratingCount: number;
  reviewCount: number;
  latestReviewText: string;
  latestReviewRating: number | null;
  latestReviewAt: string | null;
}

type ListReviewedPlacesResponse = {
  places?: CityReviewedPlace[];
};

type SearchCityPlacesResponse = {
  candidates?: CityPlaceCandidate[];
  places?: CityReviewedPlace[];
};

type SubmitCityPlaceReviewResponse = {
  place?: CityReviewedPlace;
  reviewId?: string;
};

@Injectable({ providedIn: 'root' })
export class PlaceReviewsService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly functions = this.isBrowser ? getFirebaseFunctions() : null;
  private readonly anonymousReviewStorageKey = 'living-wiki:placeReviewVisitorId';

  async listCityReviewedPlaces(atlasId: string): Promise<CityReviewedPlace[]> {
    if (!this.functions || !atlasId) {
      return [];
    }

    const callable = httpsCallable<{ atlasId: string }, ListReviewedPlacesResponse>(
      this.functions,
      'listCityReviewedPlaces',
    );
    const result = await callable({ atlasId });
    return Array.isArray(result.data.places) ? result.data.places : [];
  }

  async searchCityPlaces(atlasId: string, query: string): Promise<CityPlaceCandidate[]> {
    if (!this.functions || !atlasId || query.trim().length < 2) {
      return [];
    }

    const callable = httpsCallable<{ atlasId: string; query: string }, SearchCityPlacesResponse>(
      this.functions,
      'searchCityPlaces',
    );
    const result = await callable({ atlasId, query: query.trim() });
    return Array.isArray(result.data.candidates) ? result.data.candidates : [];
  }

  async submitCityPlaceReview(input: {
    atlasId: string;
    place: CityPlaceCandidate;
    rating: number;
    text: string;
  }): Promise<CityReviewedPlace | null> {
    if (!this.functions) {
      return null;
    }

    const callable = httpsCallable<
      {
        atlasId: string;
        place: CityPlaceCandidate;
        rating: number;
        text: string;
        anonymousVisitorId: string | null;
      },
      SubmitCityPlaceReviewResponse
    >(this.functions, 'submitCityPlaceReview');
    const result = await callable({
      ...input,
      anonymousVisitorId: this.ensureAnonymousReviewId(),
    });
    return result.data.place ?? null;
  }

  private ensureAnonymousReviewId(): string | null {
    if (!this.isBrowser || typeof window === 'undefined') {
      return null;
    }

    const existing = window.localStorage.getItem(this.anonymousReviewStorageKey);
    if (existing) {
      return existing;
    }

    const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(this.anonymousReviewStorageKey, id);
    return id;
  }
}
