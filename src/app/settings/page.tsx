import { AppShell } from "@/components/app-shell";
import { ProfileForm } from "@/components/profile-form";
import { Alert, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Account" };

export default async function SettingsPage() {
  const { profile } = await requireUser();

  return (
    <AppShell profile={profile}>
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
          <p className="text-sm text-muted-foreground">
            Your profile details and workspace preferences.
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <ProfileForm profile={profile} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-xs text-muted-foreground">
              <p>
                User ID:{" "}
                <span className="font-mono text-foreground">{profile.id}</span>
              </p>
              <p>Member since {formatDateTime(profile.created_at)}</p>
              <p>Last updated {formatDateTime(profile.updated_at)}</p>
            </CardContent>
          </Card>

          <Alert tone="info" title="Roles">
            <ul className="ml-3 list-disc space-y-0.5">
              <li>
                <strong>Admin</strong> {"\u2014"} full control of a project, including deletion and
                member management.
              </li>
              <li>
                <strong>Editor</strong> {"\u2014"} can create and change diagrams, endpoints,
                decisions and cost selections.
              </li>
              <li>
                <strong>Viewer</strong> \u2014 read-only.
              </li>
            </ul>
            Your first registered account is automatically promoted to platform admin. Assign project
            roles from each project&apos;s Settings tab.
          </Alert>
        </div>
      </div>
    </AppShell>
  );
}
