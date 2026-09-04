import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { AuthService } from '../auth.service';
import { CreateAccountComponent } from './create-account';

describe('CreateAccountComponent', () => {
  const createAccount = jasmine.createSpy('createAccount');
  const signInWithGoogle = jasmine.createSpy('signInWithGoogle');
  const navigate = jasmine.createSpy('navigate');
  const navigateByUrl = jasmine.createSpy('navigateByUrl');

  beforeEach(() => {
    createAccount.calls.reset();
    signInWithGoogle.calls.reset();
    navigate.calls.reset();
    navigateByUrl.calls.reset();
    createAccount.and.resolveTo({ needsEmailVerification: true, verificationEmailSent: true });
    signInWithGoogle.and.resolveTo({ needsEmailVerification: false });
    navigate.and.resolveTo(true);
    navigateByUrl.and.resolveTo(true);

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap({ redirectTo: '/wikis' }) },
          },
        },
        {
          provide: AuthService,
          useValue: {
            createAccount,
            signInWithGoogle,
            toFriendlyError: () => 'Friendly error',
          },
        },
        { provide: Router, useValue: { navigate, navigateByUrl } },
      ],
    });
  });

  it('normalizes identity fields and preserves the intended destination', async () => {
    const component = TestBed.runInInjectionContext(() => new CreateAccountComponent());
    component.form.setValue({
      fullName: '  Ada   Lovelace  ',
      email: '  ADA@EXAMPLE.COM  ',
      password: 'password123',
      confirmPassword: 'password123',
      agreeToTerms: true,
      rememberMe: true,
    });

    await component.createAccount();

    expect(createAccount).toHaveBeenCalledOnceWith({
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'password123',
      remember: true,
      redirectTo: '/wikis',
    });
    expect(navigate).toHaveBeenCalledOnceWith(['/verify-email'], {
      queryParams: { redirectTo: '/wikis', sent: '1' },
    });
  });

  it('does not submit a whitespace-only name', async () => {
    const component = TestBed.runInInjectionContext(() => new CreateAccountComponent());
    component.form.setValue({
      fullName: '   ',
      email: 'ada@example.com',
      password: 'password123',
      confirmPassword: 'password123',
      agreeToTerms: true,
      rememberMe: true,
    });

    await component.createAccount();

    expect(createAccount).not.toHaveBeenCalled();
    expect(component.form.controls.fullName.invalid).toBeTrue();
  });

  it('prevents duplicate Google popup requests and returns to the requested page', async () => {
    let resolveGoogle!: (value: { needsEmailVerification: boolean }) => void;
    signInWithGoogle.and.returnValue(new Promise((resolve) => {
      resolveGoogle = resolve;
    }));
    const component = TestBed.runInInjectionContext(() => new CreateAccountComponent());

    const firstAttempt = component.continueWithGoogle();
    const duplicateAttempt = component.continueWithGoogle();
    resolveGoogle({ needsEmailVerification: false });
    await Promise.all([firstAttempt, duplicateAttempt]);

    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
    expect(navigateByUrl).toHaveBeenCalledOnceWith('/wikis');
  });
});
