import "server-only";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { env } from "./env";

if (env.NEXT_PUBLIC_USE_EMULATORS) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
}

export const adminApp =
  getApps()[0] ??
  initializeApp(
    env.NEXT_PUBLIC_USE_EMULATORS
      ? { projectId: env.FIREBASE_PROJECT_ID }
      : {
          projectId: env.FIREBASE_PROJECT_ID,
          credential: cert({
            projectId: env.FIREBASE_PROJECT_ID,
            clientEmail: env.FIREBASE_CLIENT_EMAIL,
            privateKey: env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
          }),
        },
  );

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
