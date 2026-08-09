import Link from "next/link";
import { Suspense } from "react";
import {
  chatGPTSignOutPath,
  requireChatGPTUser,
} from "../chatgpt-auth";
import { isAdminEmail } from "../../lib/admin-access";
import ShowControlClient from "./show-control";
import styles from "./show-control.module.css";

export const dynamic = "force-dynamic";

export default function ShowControlPage() {
  return (
    <Suspense fallback={<ControlLoading />}>
      <ProtectedControl />
    </Suspense>
  );
}

async function ProtectedControl() {
  const user = await requireChatGPTUser("/show-control");
  if (!isAdminEmail(user.email)) {
    return (
      <main className={styles.accessPage}>
        <div className={styles.accessCard}>
          <span className={styles.accessBadge}>Private band area</span>
          <h1>This account cannot edit the show.</h1>
          <p>
            You are signed in as <strong>{user.email}</strong>. The public show
            page is still available below.
          </p>
          <div className={styles.accessActions}>
            <Link href="/">Back to the show</Link>
            <a href={chatGPTSignOutPath("/show-control")}>Use another account</a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <ShowControlClient
      userName={user.fullName || user.displayName}
      userEmail={user.email}
      signOutHref={chatGPTSignOutPath("/")}
    />
  );
}

function ControlLoading() {
  return (
    <main className={styles.accessPage}>
      <div className={styles.loadingCard}>Opening Show Control...</div>
    </main>
  );
}

