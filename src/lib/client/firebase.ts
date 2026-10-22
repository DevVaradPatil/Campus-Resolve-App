import { getApps, initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

// NEXT_PUBLIC_* must be referenced literally so Next.js inlines them into the client bundle.
const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";

const app =
  getApps()[0] ??
  initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "demo-key",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });

export const auth = getAuth(app);
export const db = getFirestore(app);

if (useEmulators && !auth.emulatorConfig) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

// App Check (reCAPTCHA v3) in a real deployment only. The token goes on API calls (api.ts) and
// Firebase attaches it to Auth/Firestore requests itself.
const recaptchaKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
export const appCheck =
  typeof window !== "undefined" && recaptchaKey && !useEmulators
    ? initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(recaptchaKey),
        isTokenAutoRefreshEnabled: true,
      })
    : null;
