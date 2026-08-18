# CargoForm PWA and mobile-app handoff

## What is ready

- Installable Progressive Web App manifest and CargoForm icon.
- Standalone app display, responsive desktop/tablet/mobile layouts and mobile bottom navigation.
- Production service worker with cached navigation shell and same-origin runtime assets for offline reopening.
- Online/offline status in Settings and local persistence for current MVP records.
- Capacitor configuration and generated Android project in `android/`.
- One-command web build and native synchronization.

## Commands

```powershell
npm run dev
npm run build
npm run app:sync
npm run app:android
```

`app:android` requires Android Studio and an installed Android SDK. A signed APK/AAB requires the organisation's private signing key and release configuration.

The iOS dependency and command are configured, but the iOS project and signed build should be generated on macOS with Xcode:

```bash
npx cap add ios
npm run app:ios
```

## Deployment requirements

- Serve the production PWA over HTTPS. Localhost is suitable only for development/testing.
- Replace device-only storage with the authenticated multi-tenant backend before production account use.
- Add an encrypted offline database and queued synchronization before allowing offline edits to official submissions.
- Keep payment secrets, mail credentials and document-signing credentials on the server; never embed them in the PWA or native bundle.
- Add conflict resolution, device revocation, audit events and remote session expiry.
- Generate dedicated 192×192 and 512×512 PNG/maskable store icons and store screenshots during brand finalization.
- Configure Android Digital Asset Links if publishing the PWA as a Trusted Web Activity; Capacitor does not require that linkage.

## Recommended release path

1. Deploy the HTTPS PWA to a staging domain and run install/offline tests on Chrome Android, Edge/Chrome desktop and Safari iOS.
2. Connect authentication, tenant isolation and synchronized database APIs.
3. Connect queued document exports, email delivery and verified payment callbacks.
4. Complete Android signing, privacy disclosures and Play Store internal testing.
5. Generate the iOS project on macOS, configure signing and test through TestFlight.

The current service worker caches the application shell. It does not attempt to send emails, payments or government/carrier submissions while offline.
