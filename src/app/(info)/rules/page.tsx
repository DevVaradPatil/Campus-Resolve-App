import { Banner } from "@/components/ui/feedback";

export const metadata = { title: "Community rules · CampusResolve" };

export default function RulesPage() {
  return (
    <>
      <h1 className="text-2xl font-bold">Community rules</h1>
      <Banner tone="info" title="Draft for the pilot">
        These rules are a draft awaiting approval by the pilot team before launch.
      </Banner>
      <p>CampusResolve works when complaints are about problems, not people.</p>
      <h2>Do</h2>
      <ul>
        <li>Describe the problem, where it is and since when.</li>
        <li>Use &ldquo;Affects me too&rdquo; instead of filing the same thing again.</li>
        <li>Make it confidential if it&apos;s personal or about someone specific.</li>
        <li>Reply when asked whether something is fixed.</li>
      </ul>
      <h2>Don&apos;t</h2>
      <ul>
        <li>Name, describe or photograph other residents or staff in public complaints.</li>
        <li>Post room numbers, phone numbers or anyone&apos;s personal details.</li>
        <li>Harass, insult or threaten anyone, in complaints or comments.</li>
        <li>File false, joke or spam complaints.</li>
        <li>Upload photos with faces, ID cards or documents.</li>
      </ul>
      <h2>What happens if rules are broken</h2>
      <p>
        Anyone can report a complaint, comment or photo. Hostel committee members or admins may hide
        it, with a reason; nothing is deleted outright, so decisions can be reviewed. Repeated or
        serious misuse can lead to an account being deactivated by a hostel admin.
      </p>
    </>
  );
}
