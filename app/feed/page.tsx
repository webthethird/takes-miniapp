import { redirect } from "next/navigation";

// The feed is the landing page. This route stays so older links and anyone
// who typed /feed still land somewhere, rather than 404ing.
export default function FeedAlias() {
  redirect("/");
}
