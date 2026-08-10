"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  SET_DEFINITIONS,
  type SetSlug,
  type ShowSong,
} from "../../lib/show-data";
import {
  buildSongResourceLinks,
  getYouTubeEmbedUrl,
  getYouTubeVideoId,
} from "../../lib/song-resources";
import type { Suggestion } from "../song-board";
import styles from "./show-control.module.css";

type SongMap = Record<SetSlug, ShowSong[]>;
type DeletedSong = { song: ShowSong; index: number } | null;

const emptySongMap = (): SongMap => ({
  "jeff-story-friends": [],
  stalemate: [],
  "rad-dad": [],
});

export default function ShowControlClient({
  userName,
  userEmail,
  signOutHref,
}: {
  userName: string;
  userEmail: string;
  signOutHref: string;
}) {
  const [songsBySet, setSongsBySet] = useState<SongMap>(emptySongMap);
  const [activeSet, setActiveSet] = useState<SetSlug>("rad-dad");
  const [dirtySets, setDirtySets] = useState<Set<SetSlug>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftArtist, setDraftArtist] = useState("");
  const [enriching, setEnriching] = useState<string | null>(null);
  const [preview, setPreview] = useState<ShowSong | null>(null);
  const [deleted, setDeleted] = useState<DeletedSong>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const dragIndex = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/show", { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error("Could not load the official sets.");
        return response.json() as Promise<{ songs: ShowSong[] }>;
      }),
      fetch("/api/suggestions", { cache: "no-store" })
        .then((response) => response.json() as Promise<{ suggestions?: Suggestion[] }>)
        .catch(() => ({ suggestions: [] })),
    ])
      .then(([showData, suggestionData]) => {
        if (!active) return;
        setSongsBySet(groupSongs(showData.songs));
        setSuggestions(suggestionData.suggestions ?? []);
      })
      .catch((error) => {
        if (active) setNotice(error instanceof Error ? error.message : "Could not load Show Control.");
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setSuggestionsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirtySets.size) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtySets]);

  useEffect(() => {
    if (!preview) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [preview]);

  const activeDefinition = SET_DEFINITIONS.find((set) => set.slug === activeSet)!;
  const activeSongs = songsBySet[activeSet];
  const totalSongs = useMemo(
    () => Object.values(songsBySet).reduce((total, setSongs) => total + setSongs.length, 0),
    [songsBySet],
  );

  function markDirty(setSlug = activeSet) {
    setDirtySets((current) => new Set(current).add(setSlug));
    setNotice("Unsaved changes. Save when this set is ready to go live.");
  }

  function replaceSet(setSlug: SetSlug, nextSongs: ShowSong[]) {
    setSongsBySet((current) => ({
      ...current,
      [setSlug]: nextSongs.map((song, index) => ({
        ...song,
        setSlug,
        position: index + 1,
      })),
    }));
    markDirty(setSlug);
  }

  function updateSong(id: number | string, patch: Partial<ShowSong>, setSlug = activeSet) {
    setSongsBySet((current) => ({
      ...current,
      [setSlug]: current[setSlug].map((song, index) =>
        String(song.id) === String(id)
          ? { ...song, ...patch, position: index + 1 }
          : { ...song, position: index + 1 },
      ),
    }));
    markDirty(setSlug);
  }

  function moveSong(from: number, to: number) {
    if (to < 0 || to >= activeSongs.length || from === to) return;
    const reordered = [...activeSongs];
    const [song] = reordered.splice(from, 1);
    reordered.splice(to, 0, song);
    replaceSet(activeSet, reordered);
  }

  async function addSong(
    title: string,
    artist: string,
    performanceNote = "",
    isOriginal = false,
    findYouTube = !isOriginal,
  ) {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    const resources = buildSongResourceLinks(cleanTitle, artist);
    const song: ShowSong = {
      id: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      setSlug: activeSet,
      position: activeSongs.length + 1,
      title: cleanTitle,
      artist: artist.trim(),
      transition: false,
      isOriginal,
      performanceNote,
      songKey: "",
      tuning: "",
      youtubeUrl: "",
      youtubeVideoId: "",
      chordsUrl: resources.chordsSearchUrl,
      lyricsUrl: resources.lyricsSearchUrl,
      rehearsalNotes: "",
      updatedAt: new Date().toISOString(),
    };
    replaceSet(activeSet, [...activeSongs, song]);
    setDraftTitle("");
    setDraftArtist("");
    if (findYouTube) {
      await findResources(song);
    } else {
      setNotice(
        `${cleanTitle} was added as a draft. YouTube is optional; add a link only if there is a useful reference.`,
      );
    }
  }

  async function addFromComposer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await addSong(draftTitle, draftArtist);
  }

  async function findResources(song: ShowSong) {
    if (!song.title.trim()) return;
    if (song.isOriginal) {
      setNotice(`${song.title} is marked original, so public resource links stay hidden.`);
      return;
    }
    setEnriching(String(song.id));
    setNotice(`Finding YouTube for ${song.title}...`);
    try {
      const response = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: song.title, artist: song.artist }),
      });
      const result = (await response.json()) as {
        error?: string;
        source?: string;
        youtubeUrl?: string;
        youtubeVideoId?: string;
        chordsUrl?: string;
        lyricsUrl?: string;
      };
      if (!response.ok) throw new Error(result.error || "Resource lookup failed.");
      updateSong(
        song.id,
        {
          youtubeUrl: result.youtubeUrl || song.youtubeUrl,
          youtubeVideoId: result.youtubeVideoId || song.youtubeVideoId,
          chordsUrl: result.chordsUrl || song.chordsUrl,
          lyricsUrl: result.lyricsUrl || song.lyricsUrl,
        },
        song.setSlug,
      );
      setNotice(
        result.source === "youtube-api"
          ? `YouTube match found for ${song.title}.`
          : `YouTube search is ready for ${song.title}. Paste the video you want to feature.`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Resource lookup failed.");
    } finally {
      setEnriching(null);
    }
  }

  function removeSong(index: number) {
    const song = activeSongs[index];
    if (!window.confirm(`Remove "${song.title}" from ${activeDefinition.title}?`)) return;
    setDeleted({ song, index });
    replaceSet(
      activeSet,
      activeSongs.filter((_, songIndex) => songIndex !== index),
    );
  }

  function undoDelete() {
    if (!deleted) return;
    const restored = [...activeSongs];
    restored.splice(Math.min(deleted.index, restored.length), 0, deleted.song);
    replaceSet(activeSet, restored);
    setDeleted(null);
  }

  async function saveActiveSet() {
    setSaving(true);
    setNotice(`Publishing ${activeDefinition.title}...`);
    try {
      const response = await fetch("/api/show", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setSlug: activeSet, songs: activeSongs }),
      });
      const result = (await response.json()) as { error?: string; songs?: ShowSong[] };
      if (!response.ok || !result.songs) {
        throw new Error(result.error || "The set could not be saved.");
      }
      setSongsBySet((current) => ({ ...current, [activeSet]: result.songs! }));
      setDirtySets((current) => {
        const next = new Set(current);
        next.delete(activeSet);
        return next;
      });
      setDeleted(null);
      setNotice(`${activeDefinition.title} is live on the public show page.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The set could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function addSuggestion(song: Suggestion) {
    const alreadyAdded = activeSongs.some(
      (current) =>
        current.title.toLowerCase() === song.title.toLowerCase() &&
        current.artist.toLowerCase() === song.artist.toLowerCase(),
    );
    if (alreadyAdded) {
      setNotice(`${song.title} is already in ${activeDefinition.title}.`);
      return;
    }
    void addSong(
      song.title,
      song.artist,
      `Suggested by ${song.addedBy}${song.notes ? ` / ${song.notes}` : ""}`,
      song.isOriginal,
    );
  }

  if (loading) {
    return <main className={styles.controlShell}><div className={styles.loadingCard}>Loading official sets...</div></main>;
  }

  return (
    <main className={styles.controlShell}>
      <header className={styles.controlTopbar}>
        <a className={styles.controlBrand} href="/">
          <span>RD</span>
          <div><strong>SHOW CONTROL</strong><small>RAD DAD + FRIENDS</small></div>
        </a>
        <div className={styles.ownerStrip}>
          <span className={styles.privateBadge}>Owner only</span>
          <span className={styles.ownerName}>{userName}</span>
          <a href="/" target="_blank">Open public show</a>
          <a href={signOutHref}>Sign out</a>
        </div>
      </header>

      <div className={styles.workspace}>
        <section className={styles.controlIntro}>
          <div>
            <p className={styles.controlKicker}>SEPT 19 / GUITARS & GROWLERS</p>
            <h1>BUILD THE NIGHT.</h1>
            <p>
              Reorder by dragging or using Move. Open Details for keys, cues,
              a YouTube link, and rehearsal notes. Nothing changes in
              public until you press Save.
            </p>
          </div>
          <div className={styles.controlStats}>
            <div><strong>{totalSongs}</strong><span>Total songs</span></div>
            <div><strong>{dirtySets.size}</strong><span>Sets changed</span></div>
          </div>
        </section>

        <nav className={styles.setTabs} aria-label="Choose a set to edit">
          {SET_DEFINITIONS.map((set) => (
            <button
              className={activeSet === set.slug ? styles.activeTab : ""}
              data-accent={set.accent}
              type="button"
              key={set.slug}
              onClick={() => {
                setActiveSet(set.slug);
                setDeleted(null);
                setNotice("");
              }}
            >
              <span>{set.kicker}</span>
              <strong>{set.title}</strong>
              <small>
                {songsBySet[set.slug].length} songs
                {dirtySets.has(set.slug) ? " / unsaved" : ""}
              </small>
            </button>
          ))}
        </nav>

        <div className={styles.controlGrid}>
          <section className={styles.editorPanel}>
            <header className={styles.editorHeader}>
              <div>
                <span>{activeDefinition.time}</span>
                <h2>{activeDefinition.title}</h2>
              </div>
              <span className={styles.liveState}>
                {dirtySets.has(activeSet) ? "Draft changes" : "Matches public page"}
              </span>
            </header>

            <form className={styles.composer} onSubmit={addFromComposer}>
              <div className={styles.composerTitle}>
                <span>+</span>
                <div><strong>Add a song</strong><small>It goes to the bottom and finds YouTube.</small></div>
              </div>
              <input
                aria-label="New song title"
                placeholder="Song title"
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                required
              />
              <input
                aria-label="New song artist"
                placeholder="Artist"
                value={draftArtist}
                onChange={(event) => setDraftArtist(event.target.value)}
              />
              <button type="submit">Add + find</button>
            </form>

            <div className={styles.songEditorList}>
              {activeSongs.map((song, index) => {
                const searches = buildSongResourceLinks(song.title, song.artist);
                const videoId = song.youtubeVideoId || getYouTubeVideoId(song.youtubeUrl);
                const isEnriching = enriching === String(song.id);
                return (
                  <article
                    className={styles.songEditorCard}
                    data-transition={song.transition ? "true" : "false"}
                    key={song.id}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (dragIndex.current !== null) moveSong(dragIndex.current, index);
                      dragIndex.current = null;
                    }}
                  >
                    <div
                      className={styles.dragHandle}
                      draggable
                      onDragStart={() => { dragIndex.current = index; }}
                      onDragEnd={() => { dragIndex.current = null; }}
                      title="Drag to reorder"
                    >
                      ||
                    </div>
                    <span className={styles.editorPosition}>{String(index + 1).padStart(2, "0")}</span>
                    <div className={styles.songEditorMain}>
                      <div className={styles.primaryFields}>
                        <label>
                          <span>Song</span>
                          <input value={song.title} onChange={(event) => updateSong(song.id, { title: event.target.value })} />
                        </label>
                        <label>
                          <span>Artist</span>
                          <input value={song.artist} onChange={(event) => updateSong(song.id, { artist: event.target.value })} />
                        </label>
                      </div>

                      <div className={styles.quickTools}>
                        <button type="button" onClick={() => moveSong(index, index - 1)} disabled={index === 0}>Move up</button>
                        <button type="button" onClick={() => moveSong(index, index + 1)} disabled={index === activeSongs.length - 1}>Move down</button>
                        <label className={styles.flowToggle}>
                          <input type="checkbox" checked={song.transition} onChange={(event) => updateSong(song.id, { transition: event.target.checked })} />
                          <span>Flows to next {"\u2192"}</span>
                        </label>
                        <label className={styles.flowToggle}>
                          <input
                            type="checkbox"
                            checked={song.isOriginal}
                            onChange={(event) =>
                              updateSong(song.id, {
                                isOriginal: event.target.checked,
                                youtubeUrl: event.target.checked ? "" : song.youtubeUrl,
                                youtubeVideoId: event.target.checked ? "" : song.youtubeVideoId,
                                lyricsUrl: event.target.checked ? "" : song.lyricsUrl,
                              })
                            }
                          />
                          <span>Original / hide resources</span>
                        </label>
                        {!song.isOriginal && videoId ? <button type="button" onClick={() => setPreview({ ...song, youtubeVideoId: videoId })}>Preview video</button> : null}
                        {!song.isOriginal ? <a href={song.youtubeUrl || searches.youtubeSearchUrl} target="_blank" rel="noreferrer">Open YouTube</a> : null}
                        {!song.isOriginal ? <a href={song.lyricsUrl || searches.lyricsSearchUrl} target="_blank" rel="noreferrer">Open lyrics</a> : null}
                      </div>

                      <details className={styles.songDetailsEditor}>
                        <summary>Details, song resources, and rehearsal notes</summary>
                        <div className={styles.detailGrid}>
                          <label className={styles.wideField}>
                            <span>Performance cue</span>
                            <input value={song.performanceNote} onChange={(event) => updateSong(song.id, { performanceNote: event.target.value })} placeholder="Guest vocal, guitar handoff, count-in, ending..." />
                          </label>
                          <label>
                            <span>Key</span>
                            <input value={song.songKey} onChange={(event) => updateSong(song.id, { songKey: event.target.value })} placeholder="e.g. E major" />
                          </label>
                          <label>
                            <span>Tuning</span>
                            <input value={song.tuning} onChange={(event) => updateSong(song.id, { tuning: event.target.value })} placeholder="e.g. Eb standard" />
                          </label>
                          {!song.isOriginal ? (
                            <>
                              <label className={styles.wideField}>
                                <span>YouTube video</span>
                                <div className={styles.urlField}>
                                  <input value={song.youtubeUrl} onChange={(event) => updateSong(song.id, { youtubeUrl: event.target.value, youtubeVideoId: getYouTubeVideoId(event.target.value) })} placeholder="Paste a YouTube link" />
                                  <button type="button" onClick={() => findResources(song)} disabled={isEnriching}>{isEnriching ? "Finding..." : "Find resources"}</button>
                                  {!videoId ? <a href={searches.youtubeSearchUrl} target="_blank" rel="noreferrer">Search</a> : null}
                                </div>
                              </label>
                              <label className={styles.wideField}>
                                <span>Lyrics link</span>
                                <input value={song.lyricsUrl} onChange={(event) => updateSong(song.id, { lyricsUrl: event.target.value })} placeholder="Paste the preferred lyrics page or use the generated search" />
                              </label>
                            </>
                          ) : null}
                          <label className={styles.wideField}>
                            <span>Our rehearsal notes</span>
                            <textarea rows={4} value={song.rehearsalNotes} onChange={(event) => updateSong(song.id, { rehearsalNotes: event.target.value })} placeholder="Structure, stops, harmony, solo length, special ending..." />
                          </label>
                        </div>
                      </details>
                    </div>
                    <button className={styles.deleteButton} type="button" onClick={() => removeSong(index)}>Remove</button>
                  </article>
                );
              })}
            </div>
          </section>

          <aside className={styles.suggestionInbox}>
            <div className={styles.inboxHeader}>
              <span>Suggestion inbox</span>
              <strong>{suggestions.length}</strong>
            </div>
            <p>Ideas from the public board. Adding one only changes your draft until you save.</p>
            <div className={styles.inboxList}>
              {suggestionsLoading ? <span className={styles.inboxEmpty}>Loading ideas...</span> : null}
              {!suggestionsLoading && !suggestions.length ? <span className={styles.inboxEmpty}>No suggestions yet.</span> : null}
              {suggestions.slice(0, 12).map((song) => (
                <article className={styles.inboxSong} key={song.id}>
                  <div><strong>{song.title}</strong><span>{song.artist || "Artist not listed"}{song.isOriginal ? " / Original" : ""}</span></div>
                  <p>By {song.addedBy}{song.notes ? ` / ${song.notes}` : ""}</p>
                  <button type="button" onClick={() => addSuggestion(song)}>Add to {activeDefinition.title}</button>
                </article>
              ))}
            </div>
            <div className={styles.ownerNote}>
              <strong>Signed in as</strong>
              <span>{userEmail}</span>
            </div>
          </aside>
        </div>
      </div>

      <div className={styles.saveDock}>
        <div>
          <span className={dirtySets.has(activeSet) ? styles.unsavedDot : styles.savedDot} />
          <p>{notice || "Ready. Public set is unchanged."}</p>
        </div>
        <div className={styles.saveActions}>
          {deleted ? <button type="button" onClick={undoDelete}>Undo remove</button> : null}
          <button className={styles.saveButton} type="button" onClick={saveActiveSet} disabled={saving || !dirtySets.has(activeSet)}>
            {saving ? "Saving..." : `Save ${activeDefinition.title}`}
          </button>
        </div>
      </div>

      {preview?.youtubeVideoId ? (
        <div className={styles.previewBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null); }}>
          <div className={styles.previewModal} role="dialog" aria-modal="true" aria-label={`${preview.title} video preview`}>
            <div className={styles.previewTop}><div><span>Video preview</span><strong>{preview.title}</strong></div><button type="button" onClick={() => setPreview(null)}>Close</button></div>
            <div className={styles.previewFrame}><iframe src={getYouTubeEmbedUrl(preview.youtubeVideoId)} title={`${preview.title} video`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function groupSongs(songs: ShowSong[]): SongMap {
  const grouped = emptySongMap();
  for (const song of songs) grouped[song.setSlug].push(song);
  for (const key of Object.keys(grouped) as SetSlug[]) {
    grouped[key].sort((a, b) => a.position - b.position);
  }
  return grouped;
}
