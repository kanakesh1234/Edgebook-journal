import { redirect } from "next/navigation";

/** Backtesting now lives inside the Trading Lab. Keep old links/bookmarks working. */
export default function BacktestingRedirect() {
  redirect("/lab");
}
