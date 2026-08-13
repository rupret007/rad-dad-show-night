import { getAdminUser } from "../../../lib/admin-access";
import { enrichSongResources } from "../../../lib/song-resource-enrichment";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getAdminUser();
  if (!user) {
    return Response.json({ error: "Owner access required." }, { status: 401 });
  }

  const payload = (await request.json()) as { title?: string; artist?: string };
  const title = payload.title?.trim().slice(0, 140) ?? "";
  const artist = payload.artist?.trim().slice(0, 140) ?? "";
  if (!title) {
    return Response.json({ error: "Enter a song title first." }, { status: 400 });
  }

  return Response.json(await enrichSongResources(title, artist));
}
