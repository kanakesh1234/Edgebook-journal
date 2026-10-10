import { redirect } from "next/navigation";

/** The separate progress page was removed. Old links and bookmarks land on Practice, where level, streak, challenges and trophies now live. */
export default function PracticeProgressRedirect() {
  redirect("/practice");
}
