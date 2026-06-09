import { DatePipe, isPlatformBrowser } from '@angular/common';
import { Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { httpsCallable } from 'firebase/functions';
import { AuthService } from '../auth.service';
import {
  BusinessClaimService,
  type BusinessClaimStatus,
  type BusinessClaimWorkspaceRecord,
} from '../business-claim/business-claim.service';
import { getFirebaseFunctions } from '../firebase.client';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle';

interface AdminUserListItem {
  id: string;
  email: string | null;
  displayName: string | null;
  role: 'admin' | 'user';
  emailVerified: boolean;
  providers: string[];
  creationTime: string | null;
  lastSignInTime: string | null;
  updatedAt: string | null;
}

interface ListPlatformUsersResponse {
  total: number;
  admins: number;
  users: AdminUserListItem[];
}

type BusinessStatusFilter = 'all' | BusinessClaimStatus;

@Component({
  selector: 'app-admin-users',
  imports: [RouterLink, ThemeToggleComponent, DatePipe],
  templateUrl: './admin-users.html',
})
export class AdminUsersComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly businessClaimService = inject(BusinessClaimService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly currentUserName = this.authService.displayName;
  readonly currentUserEmail = this.authService.email;
  readonly isAdmin = this.authService.isAdmin;
  readonly users = signal<AdminUserListItem[]>([]);
  readonly businesses = signal<BusinessClaimWorkspaceRecord[]>([]);
  readonly isLoading = signal(true);
  readonly businessesLoading = signal(true);
  readonly error = signal<string | null>(null);
  readonly businessError = signal<string | null>(null);
  readonly userSearch = signal('');
  readonly businessSearch = signal('');
  readonly usersOpen = signal(false);
  readonly businessesOpen = signal(false);
  readonly businessStatusFilter = signal<BusinessStatusFilter>('all');
  readonly updatingBusinessStatusKey = signal<string | null>(null);
  readonly businessStatuses: BusinessClaimStatus[] = ['pending', 'verified', 'rejected'];
  readonly businessStatusFilters: BusinessStatusFilter[] = ['all', 'verified', 'pending', 'rejected'];
  readonly adminCount = computed(() => this.users().filter((user) => user.role === 'admin').length);
  readonly verifiedCount = computed(() => this.users().filter((user) => user.emailVerified).length);
  readonly pendingBusinessCount = computed(() => this.businesses().filter((business) => business.status === 'pending').length);
  readonly verifiedBusinessCount = computed(() => this.businesses().filter((business) => business.status === 'verified').length);
  readonly rejectedBusinessCount = computed(() => this.businesses().filter((business) => business.status === 'rejected').length);
  readonly userById = computed(() => new Map(this.users().map((user) => [user.id, user])));
  readonly filteredUsers = computed(() => {
    const query = this.userSearch().trim().toLowerCase();
    if (!query) {
      return this.users();
    }

    return this.users().filter((user) => [
      user.id,
      user.email,
      user.displayName,
      user.role,
      this.providerLabel(user),
    ].filter(Boolean).join(' ').toLowerCase().includes(query));
  });
  readonly filteredBusinesses = computed(() => {
    const query = this.businessSearch().trim().toLowerCase();
    const statusFilter = this.businessStatusFilter();
    const statusFiltered = statusFilter === 'all'
      ? this.businesses()
      : this.businesses().filter((business) => business.status === statusFilter);
    if (!query) {
      return statusFiltered;
    }

    return statusFiltered.filter((business) => [
      business.claim_key,
      business.business_name,
      business.city_name,
      business.category,
      business.business_address,
      business.admin_name,
      business.admin_email,
      business.owner_user_id,
      this.businessAuthorLabel(business),
      this.statusLabel(business.status),
      this.statusFilterLabel(business.status),
      business.status,
    ].filter(Boolean).join(' ').toLowerCase().includes(query));
  });

  async ngOnInit(): Promise<void> {
    if (!this.isBrowser) {
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);
    this.businessesLoading.set(true);
    this.error.set(null);
    this.businessError.set(null);
    try {
      const listPlatformUsers = httpsCallable<Record<string, never>, ListPlatformUsersResponse>(
        getFirebaseFunctions(),
        'listPlatformUsers',
      );
      const { data } = await listPlatformUsers({});
      this.users.set(data.users ?? []);
    } catch (error) {
      this.error.set(this.authService.toFriendlyError(error));
      this.users.set([]);
    } finally {
      this.isLoading.set(false);
    }

    try {
      this.businesses.set(await this.businessClaimService.listAll());
    } catch (error) {
      this.businessError.set(error instanceof Error ? error.message : 'Failed to load businesses.');
      this.businesses.set([]);
    } finally {
      this.businessesLoading.set(false);
    }
  }

  userLabel(user: AdminUserListItem): string {
    return user.displayName?.trim() || user.email?.trim() || `User ${user.id.slice(0, 6)}`;
  }

  providerLabel(user: AdminUserListItem): string {
    return user.providers.length ? user.providers.join(', ') : 'unknown';
  }

  businessAuthorLabel(business: BusinessClaimWorkspaceRecord): string {
    const user = this.userById().get(business.owner_user_id);
    return user ? this.userLabel(user) : `User ${business.owner_user_id.slice(0, 8)}`;
  }

  businessAuthorEmail(business: BusinessClaimWorkspaceRecord): string {
    return this.userById().get(business.owner_user_id)?.email ?? business.admin_email ?? '';
  }

  businessDetailPath(business: BusinessClaimWorkspaceRecord): string {
    return `/business/${business.city_slug}/${business.business_slug}`;
  }

  businessEditPath(business: BusinessClaimWorkspaceRecord): string {
    return `${this.businessDetailPath(business)}/edit`;
  }

  statusLabel(status: BusinessClaimStatus): string {
    switch (status) {
      case 'verified':
        return 'Verified';
      case 'rejected':
        return 'Rejected';
      default:
        return 'Pending';
    }
  }

  statusFilterLabel(status: BusinessStatusFilter): string {
    switch (status) {
      case 'all':
        return 'All';
      case 'verified':
        return 'Verified';
      case 'rejected':
        return 'Rejected';
      default:
        return 'Not verified';
    }
  }

  businessStatusFilterCount(status: BusinessStatusFilter): number {
    switch (status) {
      case 'verified':
        return this.verifiedBusinessCount();
      case 'pending':
        return this.pendingBusinessCount();
      case 'rejected':
        return this.rejectedBusinessCount();
      default:
        return this.businesses().length;
    }
  }

  onUserSearchInput(event: Event): void {
    this.userSearch.set((event.target as HTMLInputElement).value);
  }

  clearUserSearch(): void {
    this.userSearch.set('');
  }

  onBusinessSearchInput(event: Event): void {
    this.businessSearch.set((event.target as HTMLInputElement).value);
  }

  clearBusinessSearch(): void {
    this.businessSearch.set('');
  }

  selectBusinessStatusFilter(status: BusinessStatusFilter): void {
    this.businessStatusFilter.set(status);
  }

  toggleUsers(): void {
    this.usersOpen.update((open) => !open);
  }

  toggleBusinesses(): void {
    this.businessesOpen.update((open) => !open);
  }

  isUpdatingBusinessStatus(business: BusinessClaimWorkspaceRecord): boolean {
    return this.updatingBusinessStatusKey() === business.claim_key;
  }

  async setBusinessStatus(business: BusinessClaimWorkspaceRecord, status: BusinessClaimStatus): Promise<void> {
    if (business.status === status || this.isUpdatingBusinessStatus(business)) {
      return;
    }

    this.updatingBusinessStatusKey.set(business.claim_key);
    this.businessError.set(null);
    try {
      await this.businessClaimService.updateStatus(business.claim_key, status);
      this.businesses.update((items) =>
        items.map((item) => item.claim_key === business.claim_key ? { ...item, status } : item),
      );
    } catch (error) {
      this.businessError.set(error instanceof Error ? error.message : `Failed to mark ${business.business_name} as ${this.statusLabel(status).toLowerCase()}.`);
    } finally {
      this.updatingBusinessStatusKey.set(null);
    }
  }

  trackUser(_index: number, user: AdminUserListItem): string {
    return user.id;
  }

  trackBusiness(_index: number, business: BusinessClaimWorkspaceRecord): string {
    return business.claim_key;
  }
}
