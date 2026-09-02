import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import type { DocumentItem } from '../atlas.models';
import { AuthService } from '../auth.service';
import { getFirebaseFirestore } from '../firebase.client';

@Injectable({ providedIn: 'root' })
export class TalkingCardKnowledgeService {
  private readonly authService = inject(AuthService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly firestore = this.isBrowser ? getFirebaseFirestore() : null;

  async listOwnedAtlasDocuments(atlasId: string): Promise<DocumentItem[]> {
    const uid = this.authService.uid();
    const normalizedAtlasId = atlasId.trim();
    if (!this.firestore || !uid || !normalizedAtlasId) return [];
    const snapshot = await getDocs(query(
      collection(this.firestore, 'documents'),
      where('user_id', '==', uid),
      where('atlas_id', '==', normalizedAtlasId),
      where('visible', '==', true),
      orderBy('uploaded_at', 'desc'),
    ));
    return snapshot.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<DocumentItem, 'id'>),
    }));
  }
}
