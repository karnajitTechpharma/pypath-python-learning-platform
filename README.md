# PyPath — Python learning platform

PyPath is a beginner Python course interface hosted as static files on GitHub Pages. This revision adds Firebase Authentication for actual email/password accounts, email verification, password reset, sign-out, and a private-by-UID Firestore ruleset for future learner records.

## Activate real accounts

1. In Firebase Console, create a project and register a **Web app**.
2. In **Authentication → Sign-in method**, enable **Email/Password**.
3. In **Authentication → Settings → Authorized domains**, add `karnajittechpharma.github.io`.
4. In **Project settings → Your apps**, copy the web app values into `firebase-config.js` (`apiKey`, `authDomain`, `projectId`, and `appId`). These are client-side identifiers and will be visible in the website. Never put a service-account JSON/private key in this repository.
5. Deploy `firestore.rules` to the project if/when enabling Firestore.

GitHub Pages can then serve the authentication code directly; it does not need a server or build step. Accounts and credentials are handled by Firebase Authentication. Email verification is required before the dashboard is shown.

## Scope of this revision

Authentication is connected to Firebase once the project config and provider are set. Course completion, lesson activity, quiz scores, streaks, and notes are **not yet saved to Firestore**. The dashboard shows zero/not-started states and labels course actions as previews so it does not imply that learning progress is already persisted. Firestore rules are included as a secure starting point but do not create a database or connect progress automatically.

## Files

- `index.html` — site and sign-in/sign-up interface.
- `auth.js` — Firebase Authentication flow.
- `firebase-config.js` — public web-app config placeholder.
- `firestore.rules` and `firebase.json` — private learner-data rules for a later progress-storage feature.

