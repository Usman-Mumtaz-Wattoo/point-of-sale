import { getCurrentAppUser } from "@/lib/auth";
import { getPublicInvitationAction } from "@/app/settings/staff/actions";
import { AcceptInvitationView } from "./accept-invitation-view";

export const metadata = {
  title: "Accept Staff Invitation — Point of Sale",
  description: "Accept an invitation to join an organization on Point of Sale.",
};

interface InvitePageProps {
  params: Promise<{
    token: string;
  }>;
}

export default async function InvitePage(props: InvitePageProps) {
  const { token } = await props.params;

  const [invitationRes, currentUser] = await Promise.all([
    getPublicInvitationAction(token),
    getCurrentAppUser(),
  ]);

  return (
    <AcceptInvitationView
      token={token}
      invitation={invitationRes.success && invitationRes.data ? invitationRes.data : null}
      error={!invitationRes.success ? invitationRes.error : null}
      currentUser={
        currentUser
          ? {
              id: currentUser.id,
              email: currentUser.email,
              name: currentUser.name,
            }
          : null
      }
    />
  );
}
