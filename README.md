# LivingWiki

LivingWiki is an Angular app prepared for Firebase Hosting, with the Firebase Web SDK initialized on the client for future Auth and Firestore integration.

## Development server

To build and serve English, French, and Japanese together at `localhost:4200`, run:

```bash
npm start
```

The localized server mirrors Firebase's locale fallbacks, so `/`, `/fr/`, and `/ja/` can be
tested from the same origin. For faster English-only development with automatic reload, run
`npm run start:dev`. Single-locale development builds are also available through
`npm run start:fr` and `npm run start:ja`.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Internationalization

English is served at `/`, French at `/fr/`, and Japanese at `/ja/`. Angular builds one
compile-time localized application per locale, so routing, SSR/prerendered HTML, page titles,
accessibility text, and locale-aware date/number formatting all use the same locale.

When adding or changing visible copy:

```bash
npm run i18n:mark
npm run i18n:extract
# update src/locale/messages.fr.json and messages.ja.json
npm run i18n:check
npm run build
```

Use `npm run start:fr` or `npm run start:ja` for a single localized development build. The
production build fails on missing or duplicate translations, and `i18n:check` additionally
rejects stale message IDs or changed placeholders.

To add another language, add it to `src/app/i18n/locales.ts`, `angular.json`, the catalog
checker/translation target list, and Firebase's locale fallback rewrites. Then create a complete
target catalog before enabling the production locale build. The language switcher reads the
shared locale manifest, so it does not require page-by-page changes.

## Firebase Hosting

This repo is configured for Firebase Hosting with project id `living-atlas-7622a`.

Local runtime config:

```bash
cp public/runtime-config.template.js public/runtime-config.js
```

Then fill in `public/runtime-config.js` with your Firebase web config. This file is intentionally ignored by git and must never be committed.

To enable Google Drive import on `/upload`, also add a `googleDrive` block to `public/runtime-config.js`:

```js
window.__LIVING_ATLAS_CONFIG__ = {
  firebase: {
    // existing Firebase web config
  },
  googleDrive: {
    apiKey: 'YOUR_BROWSER_API_KEY',
    clientId: 'YOUR_WEB_OAUTH_CLIENT_ID.apps.googleusercontent.com',
    appId: 'YOUR_GOOGLE_CLOUD_PROJECT_NUMBER',
  },
};
```

Google Drive import setup checklist:

1. In the same Google Cloud project used by Firebase, enable both the Google Drive API and Google Picker API.
2. Create or reuse a browser API key that allows requests from your app origin.
3. Create a Web OAuth client ID and add your local origin such as `http://localhost:4200` plus your production domain.
4. Put the API key, OAuth client ID, and project number into `public/runtime-config.js`.
5. Restart `ng serve` if the runtime config file was added after the dev server started.

To enable the bottom Google AdSense unit on `/atlas/philly`, add your publisher client and ad slot to `public/runtime-config.js`:

```js
window.__LIVING_ATLAS_CONFIG__ = {
  firebase: {
    // existing Firebase web config
  },
  googleAdSense: {
    clientId: 'ca-pub-YOUR_PUBLISHER_ID',
    phillyBottomSlotId: 'YOUR_AD_SLOT_ID',
  },
};
```

Imported Google Workspace files are converted into formats the current ingestion pipeline already supports:

- Google Docs -> `.docx`
- Google Slides -> `.pptx`
- Google Sheets -> `.pdf`
- Standard Drive PDFs, text files, Word docs, PowerPoints, and PNG/JPEG images are downloaded directly

Build for hosting:

```bash
npm run build:hosting
```

Deploy to Firebase Hosting:

```bash
firebase login --reauth
npm run deploy:hosting
```

### Spotify playback

The Spotify Developer app must allowlist this exact production redirect URI:

```text
https://livingwiki.com/auth/spotify/callback
```

It is case-sensitive and must not include a trailing slash. Deploy both Functions and Hosting
after changing the Spotify OAuth integration so the authorization request, token exchange, and
Hosting callback route continue to use the same URI.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
# living-atlast
