import { useState } from "react";
import { Avatar, Button, ConfirmDialog } from "@/components/ui";
import { Icon } from "@/components/icons";
import { DetailRow, InlineEditRow, PageTitle, SectionTitle } from "./settings-parts";
import { useSettings } from "./settings-store";
import { ChangePasswordDialog, useImagePicker } from "./settings-dialogs";

/**
 * MY PROFILE — the facts about the account, then the two ways to end it.
 *
 * The name and email edit IN PLACE rather than behind a modal: they're already
 * on screen, and covering the page to change one word costs you the column you
 * were reading. The password is the exception — it needs two fields and a
 * contract, so it earns a dialog of its own.
 *
 * Security sits at the bottom under its own heading because both of its actions
 * are one-way, and Delete Account states when the account was created: the one
 * piece of context that makes "am I sure" answerable.
 */
export function ProfilePage() {
  const { account, setAccount, notify } = useSettings();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const picker = useImagePicker((url) => {
    setAccount({ photo: url });
    notify("Profile photo updated.");
  });

  return (
    <>
      {picker.input}
      <PageTitle>My Profile</PageTitle>

      <div className="mt-6">
        <SectionTitle>Profile Details</SectionTitle>

        <div className="mt-4 flex flex-wrap items-center gap-5 border-b border-glass/10 pb-6">
          <Avatar name={account.name} src={account.photo ?? undefined} size={80} />
          <div className="min-w-[16rem] flex-1">
            <p className="type-body-strong text-content">Profile Photo</p>
            <p className="type-body-dense mt-1 max-w-[34rem] text-content-muted">
              Upload a profile photo that showcases your personality! Choose an image that reflects
              who you are and makes a great first impression.
            </p>
          </div>
          <div className="flex shrink-0 gap-2.5">
            <Button
              variant="danger"
              size="sm"
              disabled={!account.photo}
              className="border border-danger/60 bg-transparent text-danger hover:bg-danger/15 hover:brightness-100"
              onClick={() => {
                setAccount({ photo: null });
                notify("Profile photo removed.");
              }}
            >
              <Icon name="trash" size={15} />
              Remove
            </Button>
            <Button variant="secondary" size="sm" onClick={picker.open}>
              <Icon name={account.photo ? "retry" : "upload"} size={15} />
              {account.photo ? "Replace" : "Upload Photo"}
            </Button>
          </div>
        </div>

        {/* Firstname and Lastname are ONE edit — you don't change half a name. */}
        <InlineEditRow
          label="Name"
          display={account.name}
          fields={[
            { key: "firstName", label: "Firstname", value: account.firstName },
            { key: "lastName", label: "Lastname", value: account.lastName },
          ]}
          onSave={(v) => {
            setAccount({ firstName: v.firstName, lastName: v.lastName });
            notify("Name updated.");
          }}
        />

        <InlineEditRow
          label="Work Email"
          display={account.email}
          fields={[{ key: "email", label: "Work Email", value: account.email, type: "email" }]}
          onSave={(v) => {
            setAccount({ email: v.email });
            notify(`Verification sent to ${v.email}.`);
          }}
        />

        <DetailRow
          label="Password"
          value="••••••••"
          action={
            <Button variant="secondary" size="sm" onClick={() => setPasswordOpen(true)}>
              Edit
            </Button>
          }
        />
      </div>

      <div className="mt-8">
        <SectionTitle>Security</SectionTitle>

        <DetailRow
          className="mt-2"
          label="Sign out from all devices"
          value="If you've logged in on a shared device and forgot to log out, you can end all sessions by signing out from every device."
          action={
            <Button variant="secondary" size="sm" onClick={() => setSignOutOpen(true)}>
              Sign Out from All Devices
            </Button>
          }
        />
        <DetailRow
          label="Delete your account"
          value={`If you delete your account, you won't be able to access your projects or log in to Terra anymore. Just a heads up, your Terra account was set up at ${account.createdAt}.`}
          action={
            <Button
              variant="danger"
              size="sm"
              className="border border-danger/60 bg-transparent text-danger hover:bg-danger/15 hover:brightness-100"
              onClick={() => setDeleteOpen(true)}
            >
              Delete Account
            </Button>
          }
        />
      </div>

      <ChangePasswordDialog
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
        onSave={() => notify("Password changed.")}
      />

      <ConfirmDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        title="Sign out everywhere?"
        body="Every other browser and device signed in as you will be logged out. You'll stay signed in here."
        confirmLabel="Sign Out"
        tone="brand"
        onConfirm={() => notify("Signed out of all other devices.")}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Are you sure?"
        body="This action cannot be undone. This will delete your account and all your organizations and projects."
        confirmLabel="Delete Account"
        onConfirm={() => notify("Account deletion scheduled. Contact support to cancel.")}
      />
    </>
  );
}
