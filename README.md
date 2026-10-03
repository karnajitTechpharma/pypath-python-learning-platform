# PyPath — Python learning platform

PyPath is a beginner Python learning platform hosted on GitHub Pages and connected to Firebase.

## Sign-in

Email/password accounts use Firebase Authentication. A verified sign-in is remembered in the current browser using Firebase's local persistence; the owner and learners each sign in once per browser/device, unless they sign out, clear site data, or switch devices. Email verification is required before the learning area opens.

## Admin panel and course content

The admin panel is shown only to a verified user whose UID has an `admins/{uid}` marker in Firestore. That marker must be created by the Firebase project owner in the Firebase Console after the owner's account is registered; website clients cannot create or change administrator markers. The admin panel manages lessons, YouTube URLs, notes, quiz options, and publishing status. Published lessons are visible to verified learners.

## Firebase setup

1. Create a Firebase project and register a Web app.
2. Enable **Authentication → Sign-in method → Email/Password**.
3. Add `karnajittechpharma.github.io` under **Authentication → Settings → Authorized domains**.
4. Put the web app's `apiKey`, `authDomain`, `projectId`, and `appId` in `firebase-config.js`. These browser identifiers are public; never add service-account JSON or private keys.
5. Create the default Cloud Firestore database in the agreed location, then publish `firestore.rules` (or use `firebase deploy --only firestore:rules`). The default database location cannot be changed after provisioning.
6. After the owner creates and verifies their PyPath account, get its UID from Authentication → Users, then create an `admins/{uid}` document from the Firebase Console. A simple field such as `role: "admin"` is optional; the rules only rely on the document's existence.

The project uses Firebase's Spark plan. Firestore has a free quota, with daily limits; usage beyond no-cost quotas may require a billing upgrade. Authentication and course content are separate from user progress. The `users/{uid}` rules are ready for progress, notes, and quiz records, but those records are not yet wired to the interface.

## Important files

- `index.html` — site, sign-in, learner dashboard, published lessons, and admin editor.
- `auth.js` — Firebase Authentication and local browser persistence.
- `admin.js` — admin access check and Firestore-backed lesson publishing.
- `firebase-config.js` — public Firebase web app config.
- `firestore.rules` and `firebase.json` — rules and deploy configuration.

