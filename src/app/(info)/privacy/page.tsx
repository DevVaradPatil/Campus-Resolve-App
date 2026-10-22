import { Banner } from "@/components/ui/feedback";

export const metadata = { title: "Privacy · CampusResolve" };

export default function PrivacyPage() {
  return (
    <>
      <h1 className="text-2xl font-bold">Privacy notice</h1>
      <Banner tone="info" title="Draft for the pilot">
        This notice is a draft awaiting approval by the pilot team before launch.
      </Banner>
      <h2>What we hold about you</h2>
      <ul>
        <li>
          From the hostel roster: your roll number, name, block, floor and room, and whether
          you&apos;re eligible for the pilot.
        </li>
        <li>Your password, stored only as a one-way hash.</li>
        <li>
          What you submit: complaints, photos, comments, support, reports and feedback, with times.
        </li>
        <li>A random public name (like &ldquo;Quiet Heron&rdquo;) chosen when you activate.</li>
      </ul>
      <h2>Who sees what</h2>
      <ul>
        <li>
          <strong>Public complaints</strong>: every signed-in resident sees the title, description,
          category, a general location (block, floor, kind of place) and photos, under your public
          name. Never your real name, roll number or room.
        </li>
        <li>
          <strong>Confidential complaints</strong>: only you and the hostel admins. They never
          appear in the feed, search, exports without explicit permission, or other people&apos;s
          notifications.
        </li>
        <li>
          <strong>Your room number and location notes</strong>: only you and hostel admins.
        </li>
        <li>
          <strong>Hostel admins</strong> can look up who reported a complaint when they need to
          contact you. Each look is logged.
        </li>
        <li>
          <strong>Hostel committee members</strong> see public complaints and reported content,
          never confidential complaints or who reported anything.
        </li>
        <li>Hostel statistics show counts only, never individuals.</li>
      </ul>
      <h2>Photos</h2>
      <p>
        Photos are re-saved when uploaded, which removes location and camera details. What&apos;s
        visible in the picture stays, so leave out faces, ID cards, documents and anything personal.
        Photos on public complaints are visible to residents; photos on confidential complaints are
        not.
      </p>
      <h2>Where it&apos;s kept</h2>
      <p>
        Data is stored with Google Firebase and photos with Supabase, both on free plans, and the
        app runs on Vercel. There is no advertising, analytics or tracking.
      </p>
      <h2>How long</h2>
      <p>
        Proposed: complaints, their photos and comments are deleted a year after they close, and
        activity logs after a year. Encrypted backups are kept offline by the pilot team for a
        limited time. Counts in the statistics are kept, as they don&apos;t identify anyone.
      </p>
      <h2>Your choices</h2>
      <ul>
        <li>Make any complaint confidential.</li>
        <li>
          Ask a hostel admin to show a complaint as &ldquo;A resident&rdquo; instead of your public
          name, or to remove something you posted.
        </li>
        <li>Turn off routine notifications in your account settings.</li>
      </ul>
    </>
  );
}
