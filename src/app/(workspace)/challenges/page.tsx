import { redirect } from "next/navigation";

/** Challenges now live inside the Trading Lab. Keep old links/bookmarks working. */
export default function ChallengesRedirect() {
  redirect("/lab");
}
