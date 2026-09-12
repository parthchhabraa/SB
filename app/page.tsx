import { redirect } from "next/navigation";

export default function Home() {
  // Becomes the timer once that screen lands.
  redirect("/subjects");
}
