import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
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

export type BusinessClaimWorkspaceRecord = BusinessClaimRegistryRecord & Partial<BusinessClaimContactRecord>;

export interface BusinessClaimWorkspaceUpdate {
  business_address: string;
  category: string;
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

  async listByOwner(ownerUserId: string): Promise<BusinessClaimWorkspaceRecord[]> {
    if (!this.firestore || !ownerUserId) {
      return [];
    }

    const claimsQuery = query(
      collection(this.firestore, 'business_claims'),
      where('owner_user_id', '==', ownerUserId),
    );
    const snapshot = await getDocs(claimsQuery);
    const claims = snapshot.docs.map((claimSnapshot) => ({
      id: claimSnapshot.id,
      ...(claimSnapshot.data() as Omit<BusinessClaimRegistryRecord, 'id'>),
    }));

    const enriched = await Promise.all(claims.map(async (claim) => {
      const requestSnapshot = await getDoc(doc(this.firestore!, 'business_claim_requests', claim.claim_key));
      if (!requestSnapshot.exists()) {
        return claim;
      }
      const request = requestSnapshot.data() as Partial<BusinessClaimContactRecord>;
      return {
        ...claim,
        admin_name: typeof request.admin_name === 'string' ? request.admin_name : undefined,
        admin_email: typeof request.admin_email === 'string' ? request.admin_email : undefined,
        guide_prompt: typeof request.guide_prompt === 'string' ? request.guide_prompt : undefined,
        badge_icons: Array.isArray(request.badge_icons)
          ? request.badge_icons.filter((icon): icon is string => typeof icon === 'string')
          : undefined,
      };
    }));

    return enriched.sort((left, right) =>
      left.city_name.localeCompare(right.city_name) || left.business_name.localeCompare(right.business_name),
    );
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

  async updateWorkspaceRecord(claimKey: string, update: BusinessClaimWorkspaceUpdate): Promise<void> {
    if (!this.firestore) {
      throw new Error('Business claims are only available in the browser.');
    }
    if (!claimKey) {
      throw new Error('Missing business claim key.');
    }

    const ref = doc(this.firestore, 'business_claims', claimKey);
    const requestRef = doc(this.firestore, 'business_claim_requests', claimKey);
    const batch = writeBatch(this.firestore);
    batch.set(ref, {
      business_address: update.business_address,
      category: update.category,
      updated_at: serverTimestamp(),
    }, { merge: true });
    batch.set(requestRef, {
      business_address: update.business_address,
      category: update.category,
      admin_name: update.admin_name,
      admin_email: update.admin_email,
      guide_prompt: update.guide_prompt,
      badge_icons: update.badge_icons.slice(0, 3),
      updated_at: serverTimestamp(),
    }, { merge: true });
    await batch.commit();
  }
}
