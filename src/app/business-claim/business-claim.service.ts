import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { getFirebaseFirestore } from '../firebase.client';

export interface BusinessClaimRegistryRecord {
  id: string;
  claim_key: string;
  owner_user_id: string;
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

export interface BusinessClaimContactRecord {
  admin_name: string;
  admin_email: string;
  guide_prompt: string;
  badge_icons: string[];
}

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

  async create(
    record: NewBusinessClaimRegistryRecord,
    contact: BusinessClaimContactRecord,
  ): Promise<BusinessClaimRegistryRecord> {
    if (!this.firestore) {
      throw new Error('Business claims are only available in the browser.');
    }

    const ref = doc(this.firestore, 'business_claims', record.claim_key);
    const requestRef = doc(this.firestore, 'business_claim_requests', record.claim_key);
    const batch = writeBatch(this.firestore);
    batch.set(ref, {
      ...record,
      created_at: serverTimestamp(),
    });
    batch.set(requestRef, {
      claim_key: record.claim_key,
      owner_user_id: record.owner_user_id,
      city_name: record.city_name,
      city_slug: record.city_slug,
      business_name: record.business_name,
      business_slug: record.business_slug,
      business_address: record.business_address,
      category: record.category,
      preview_url: record.preview_url,
      admin_name: contact.admin_name,
      admin_email: contact.admin_email,
      guide_prompt: contact.guide_prompt,
      badge_icons: contact.badge_icons.slice(0, 3),
      status: 'pending',
      created_at: serverTimestamp(),
    });
    await batch.commit();

    return {
      id: ref.id,
      ...record,
    };
  }
}
