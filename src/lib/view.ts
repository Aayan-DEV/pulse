import "server-only";
import { cookies } from "next/headers";

// Two audiences: the crew on shift and the person who runs the store.
// The sidebar switch writes this cookie; server pages read it to decide how much to show.
export type View = "employee" | "employer";
export const VIEW_COOKIE = "pulse-view";

export async function getView(): Promise<View> {
  return (await cookies()).get(VIEW_COOKIE)?.value === "employer" ? "employer" : "employee";
}
