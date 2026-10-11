import { permanentRedirect } from "next/navigation"

// Party pages live at /parties/<slug> (2026-10-11); keep any shared old links working.
export default async function OldPartyLink({ params }: { params: Promise<{ slug: string }> }) {
  permanentRedirect(`/parties/${(await params).slug}`)
}
