import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { AuthService } from '../auth.service';
import { SignInComponent } from './sign-in';

describe('SignInComponent', () => {
  const signInWithEmail = jasmine.createSpy('signInWithEmail');
  const signInWithGoogle = jasmine.createSpy('signInWithGoogle');
  const navigate = jasmine.createSpy('navigate');
  const navigateByUrl = jasmine.createSpy('navigateByUrl');

  beforeEach(() => {
    signInWithEmail.calls.reset();
    signInWithGoogle.calls.reset();
    navigate.calls.reset();
    navigateByUrl.calls.reset();
    signInWithEmail.and.resolveTo({ needsEmailVerification: false });
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
            signInWithEmail,
            signInWithGoogle,
            toFriendlyError: () => 'Friendly error',
          },
        },
        { provide: Router, useValue: { navigate, navigateByUrl } },
      ],
    });
  });

  it('normalizes email and returns to the intended destination', async () => {
    const component = TestBed.runInInjectionContext(() => new SignInComponent());
    component.form.setValue({
      email: '  ADA@EXAMPLE.COM  ',
      password: 'password123',
      rememberMe: true,
    });

    await component.signInWithEmail();

    expect(signInWithEmail).toHaveBeenCalledOnceWith({
      email: 'ada@example.com',
      password: 'password123',
      remember: true,
    });
    expect(navigateByUrl).toHaveBeenCalledOnceWith('/wikis');
  });

  it('routes unverified email users through verification without losing context', async () => {
    signInWithEmail.and.resolveTo({ needsEmailVerification: true });
    const component = TestBed.runInInjectionContext(() => new SignInComponent());
    component.form.setValue({
      email: 'Ada@Example.com',
      password: 'password123',
      rememberMe: false,
    });

    await component.signInWithEmail();

    expect(navigate).toHaveBeenCalledOnceWith(['/verify-email'], {
      queryParams: { redirectTo: '/wikis', email: 'ada@example.com' },
    });
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('prevents duplicate Google popup requests', async () => {
    let resolveGoogle!: (value: { needsEmailVerification: boolean }) => void;
    signInWithGoogle.and.returnValue(new Promise((resolve) => {
      resolveGoogle = resolve;
    }));
    const component = TestBed.runInInjectionContext(() => new SignInComponent());

    const firstAttempt = component.signInWithGoogle();
    const duplicateAttempt = component.signInWithGoogle();
    resolveGoogle({ needsEmailVerification: false });
    await Promise.all([firstAttempt, duplicateAttempt]);

    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
    expect(navigateByUrl).toHaveBeenCalledOnceWith('/wikis');
  });
});
