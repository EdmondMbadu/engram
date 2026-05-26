import { DatePipe, isPlatformBrowser } from '@angular/common';
import { Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { httpsCallable } from 'firebase/functions';
import { AuthService } from '../auth.service';
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

@Component({
  selector: 'app-admin-users',
  imports: [RouterLink, ThemeToggleComponent, DatePipe],
  templateUrl: './admin-users.html',
})
export class AdminUsersComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly currentUserName = this.authService.displayName;
  readonly currentUserEmail = this.authService.email;
  readonly isAdmin = this.authService.isAdmin;
  readonly users = signal<AdminUserListItem[]>([]);
  readonly isLoading = signal(true);
  readonly error = signal<string | null>(null);
  readonly adminCount = computed(() => this.users().filter((user) => user.role === 'admin').length);
  readonly verifiedCount = computed(() => this.users().filter((user) => user.emailVerified).length);

  async ngOnInit(): Promise<void> {
    if (!this.isBrowser) {
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);
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
  }

  userLabel(user: AdminUserListItem): string {
    return user.displayName?.trim() || user.email?.trim() || `User ${user.id.slice(0, 6)}`;
  }

  providerLabel(user: AdminUserListItem): string {
    return user.providers.length ? user.providers.join(', ') : 'unknown';
  }

  trackUser(_index: number, user: AdminUserListItem): string {
    return user.id;
  }
}
