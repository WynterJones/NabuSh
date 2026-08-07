import { redirect } from "next/navigation";
import { getCurrentUser, needsSetup } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Root() {
  if (await needsSetup()) redirect("/setup");
  if (!(await getCurrentUser())) redirect("/login");
  redirect("/inbox");
}
