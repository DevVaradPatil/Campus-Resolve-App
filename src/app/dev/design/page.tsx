import { notFound } from "next/navigation";
import { Gallery } from "./gallery";

export const metadata = { title: "Design system · CampusResolve" };

// Dev-only reference of every primitive and state. 404 in production builds.
export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Gallery />;
}
