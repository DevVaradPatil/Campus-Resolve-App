import { Banner } from "@/components/ui/feedback";

export const metadata = { title: "About this pilot · CampusResolve" };

export default function AboutPage() {
  return (
    <>
      <h1 className="text-2xl font-bold">About this pilot</h1>
      <Banner tone="warning" title="In an emergency, call. Don't file a complaint.">
        Nobody may see a complaint for hours. Campus security and the health centre numbers are on
        the Contacts page once you sign in.
      </Banner>
      <p>
        CampusResolve is a small, student-led trial for reporting and tracking hostel problems.{" "}
        <strong>
          It is not an official IIT Kanpur service, and hostel staff have not agreed to any response
          times.
        </strong>
      </p>
      <h2>How it works</h2>
      <ul>
        <li>Residents on the pilot roster get a one-time code to set up an account.</li>
        <li>
          You report a problem, choose whether it&apos;s public or confidential, and can add photos.
        </li>
        <li>
          A hostel admin from the pilot team passes it to the right person, then records what
          happens. Staff don&apos;t use the app; updates you see are &ldquo;recorded by
          admin&rdquo;.
        </li>
        <li>
          When it&apos;s marked resolved, you confirm it&apos;s fixed or reopen it. If you
          don&apos;t reply, it closes after a few days.
        </li>
      </ul>
      <h2>Targets</h2>
      <p>
        The app shows a target for the first response: 1 hour for critical issues, 8 hours for high,
        2 days for normal and 5 days for low. These are goals the pilot uses to spot delays, not
        promises from the hostel or its staff.
      </p>
      <h2>Questions or problems</h2>
      <p>
        Ask the hostel admin running the pilot, or use &ldquo;Report&rdquo; on anything in the app
        that shouldn&apos;t be there. See also the <a href="/privacy">privacy notice</a> and{" "}
        <a href="/rules">community rules</a>.
      </p>
    </>
  );
}
