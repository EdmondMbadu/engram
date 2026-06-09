import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { getFirebaseFirestore, getFirebaseStorage } from '../firebase.client';

export type BusinessClaimStatus = 'pending' | 'verified' | 'rejected';

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
  status: BusinessClaimStatus;
  created_at?: unknown;
}

type NewBusinessClaimRegistryRecord = Omit<BusinessClaimRegistryRecord, 'id' | 'created_at'>;

export interface BusinessClaimContactRecord {
  admin_name: string;
  admin_email: string;
  guide_prompt: string;
  badge_icons: string[];
  logo_url?: string;
  profile_image_url?: string;
  cover_image_url?: string;
}

export type BusinessClaimWorkspaceRecord = BusinessClaimRegistryRecord & Partial<BusinessClaimContactRecord>;

export interface BusinessClaimWorkspaceUpdate {
  business_address: string;
  category: string;
  admin_name: string;
  admin_email: string;
  guide_prompt: string;
  badge_icons: string[];
  logo_url?: string;
  profile_image_url?: string;
  cover_image_url?: string;
}

export type BusinessImageKind = 'logo' | 'profile' | 'cover';

@Injectable({ providedIn: 'root' })
export class BusinessClaimService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly firestore = this.isBrowser ? getFirebaseFirestore() : null;
  private readonly storage = this.isBrowser ? getFirebaseStorage() : null;

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

  async findWorkspaceByClaimKey(claimKey: string): Promise<BusinessClaimWorkspaceRecord | null> {
    const claim = await this.findByClaimKey(claimKey);
    if (!claim || !this.firestore) {
      return claim;
    }

    try {
      return await this.enrichWorkspaceRecord(claim);
    } catch {
      return claim;
    }
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
      try {
        return await this.enrichWorkspaceRecord(claim);
      } catch {
        return claim;
      }
    }));

    return enriched.sort((left, right) =>
      left.city_name.localeCompare(right.city_name) || left.business_name.localeCompare(right.business_name),
    );
  }

  async listAll(): Promise<BusinessClaimWorkspaceRecord[]> {
    if (!this.firestore) {
      return [];
    }

    const snapshot = await getDocs(collection(this.firestore, 'business_claims'));
    const claims = snapshot.docs.map((claimSnapshot) => ({
      id: claimSnapshot.id,
      ...(claimSnapshot.data() as Omit<BusinessClaimRegistryRecord, 'id'>),
    }));

    const enriched = await Promise.all(claims.map(async (claim) => {
      try {
        return await this.enrichWorkspaceRecord(claim);
      } catch {
        return claim;
      }
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
      logo_url: update.logo_url?.trim() ?? '',
      profile_image_url: update.profile_image_url?.trim() ?? '',
      cover_image_url: update.cover_image_url?.trim() ?? '',
      updated_at: serverTimestamp(),
    }, { merge: true });
    await batch.commit();
  }

  async updateStatus(claimKey: string, status: BusinessClaimStatus): Promise<void> {
    if (!this.firestore) {
      throw new Error('Business claims are only available in the browser.');
    }
    if (!claimKey) {
      throw new Error('Missing business claim key.');
    }

    const ref = doc(this.firestore, 'business_claims', claimKey);
    const requestRef = doc(this.firestore, 'business_claim_requests', claimKey);
    const batch = writeBatch(this.firestore);
    batch.set(ref, { status, updated_at: serverTimestamp() }, { merge: true });
    batch.set(requestRef, { status, updated_at: serverTimestamp() }, { merge: true });
    await batch.commit();
  }

  async deleteBusiness(claimKey: string): Promise<void> {
    if (!this.firestore) {
      throw new Error('Business claims are only available in the browser.');
    }
    if (!claimKey) {
      throw new Error('Missing business claim key.');
    }

    const batch = writeBatch(this.firestore);
    batch.delete(doc(this.firestore, 'business_claims', claimKey));
    batch.delete(doc(this.firestore, 'business_claim_requests', claimKey));
    await batch.commit();
  }

  async uploadBusinessImage(
    claimKey: string,
    ownerUserId: string,
    kind: BusinessImageKind,
    file: File,
  ): Promise<string> {
    if (!this.storage) {
      throw new Error('Storage unavailable.');
    }
    if (!claimKey || !ownerUserId) {
      throw new Error('Missing business image owner.');
    }
    if (!file.type.startsWith('image/')) {
      throw new Error('Only image files are supported.');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('Image must be under 10 MB.');
    }

    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const path = `businesses/${ownerUserId}/${claimKey}/${kind}-${Date.now()}.${ext}`;
    const ref = storageRef(this.storage, path);
    await uploadBytes(ref, file, { contentType: file.type });
    return await getDownloadURL(ref);
  }

  private async enrichWorkspaceRecord(claim: BusinessClaimRegistryRecord): Promise<BusinessClaimWorkspaceRecord> {
    if (!this.firestore) {
      return claim;
    }

    const requestSnapshot = await getDoc(doc(this.firestore, 'business_claim_requests', claim.claim_key));
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
      logo_url: typeof request.logo_url === 'string' ? request.logo_url : undefined,
      profile_image_url: typeof request.profile_image_url === 'string' ? request.profile_image_url : undefined,
      cover_image_url: typeof request.cover_image_url === 'string' ? request.cover_image_url : undefined,
    };
  }
}
