"use client";

import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type QueryConstraint,
  type Timestamp,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import type { NotificationView } from "@/components/notices";
import type { Me } from "@/lib/server/auth";
import { db } from "./firebase";

/**
 * Live view of the signed-in user's latest 20 notifications (quota: one small listener).
 * Muting hides non-essential ones here; they still exist (PRD §13).
 */
export function useNotifications(me: Me | null, unreadOnly = false) {
  const [items, setItems] = useState<NotificationView[]>();
  const uid = me?.uid;
  const muted = !!me?.muteNonEssential;
  useEffect(() => {
    if (!uid) return;
    const c: QueryConstraint[] = [where("recipientUid", "==", uid)];
    if (unreadOnly) c.push(where("read", "==", false));
    if (muted) c.push(where("essential", "==", true));
    return onSnapshot(
      query(collection(db, "notifications"), ...c, orderBy("createdAt", "desc"), limit(20)),
      (snap) =>
        setItems(
          snap.docs.map((d) => {
            const n = d.data();
            return {
              id: d.id,
              title: n.title,
              body: n.body ?? undefined,
              href: n.href,
              read: n.read,
              at: ((n.createdAt as Timestamp | null)?.toDate() ?? new Date()).toISOString(),
            };
          }),
        ),
      (e) => {
        console.error("Notifications listener failed", e);
        setItems([]);
      },
    );
  }, [uid, muted, unreadOnly]);
  return items;
}
