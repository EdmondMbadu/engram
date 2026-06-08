import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase.client';

export interface BusinessClaimRegistryRecord {
  id: string;
  claim_key: string;
  atlas_id: string | null;
  city_name: string;
  city_slug: string;
  business_name: string;
  business_slug: string;
  business_address: string;
  category: string;
  place_id: string | null;
  preview_url: string;
  status: 'pending';
  created_at?: unknown;
}

type NewBusinessClaimRegistryRecord = Omit<BusinessClaimRegistryRecord, 'id' | 'created_at'>;

@Injectable({ providedIn: 'root' })
export class BusinessClaimService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly firestore = this.isBrowser ? getFirebaseFirestore() : null;

  async findByClaimKey(claimKey: string): Promise<BusinessClaimRegistryRecord | null> {
    if (!this.firestore || !claimKey) {
      return null;
    }

    const snapshot = await getDoc(doc(this.firestore, 'business_claims', claimKey));
    if (!snapshot.exists()) {
      return null;
    }

    return {
      id: snapshot.id,
      ...(snapshot.data() as Omit<BusinessClaimRegistryRecord, 'id'>),
    };
  }

  async create(record: NewBusinessClaimRegistryRecord): Promise<BusinessClaimRegistryRecord> {
    if (!this.firestore) {
      throw new Error('Business claims are only available in the browser.');
    }

    const ref = doc(this.firestore, 'business_claims', record.claim_key);
    await setDoc(ref, {
      ...record,
      created_at: serverTimestamp(),
    });

    return {
      id: ref.id,
      ...record,
    };
  }
}
