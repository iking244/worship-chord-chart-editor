# Chord Chart Editor — Current State

**Updated:** 2026-10-26  
**Project stage:** Phases 2–5 implemented; print workflow awaits platform-specific verification

## Summary

The project is an offline-first Electron desktop application built with Node.js and vanilla HTML, CSS, and JavaScript. The main process, sandboxed preload bridge, and renderer are separated. The renderer has no direct Node.js or filesystem access; it requests specific operations through the `contextBridge` API.

The app includes a local song library, metadata editor, and a structured chart editor. Songs are stored as JSON in Electron's application `userData` directory. The chart model stores chord symbols on words or syllables, not as spaces or screen coordinates.

## Implemented

### Application shell and security

- Electron window lifecycle and macOS activate behavior.
- `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
- Renderer Content Security Policy.
- External window creation is denied, and navigation away from the local renderer is blocked.
- Privileged IPC requests are checked against the local renderer URL.
- The preload exposes named methods rather than generic IPC or filesystem access.

### Library and song metadata

- The library shows loading, empty, populated, and error states.
- Selecting a library entry opens that song by its stable song ID.
- **New song** opens a new draft in the editor.
- Metadata fields include title, writers, performer, key, capo, tempo, notes, and CCLI song number.
- Writers can be added and removed.
- Leaving with unsaved changes prompts to save, discard, or keep editing.
- Closing the application with unsaved changes offers Save, Discard, and Cancel.

### Structured chart editor

- Create, rename, reorder, and remove chart sections.
- Add and remove lyric, chord-only, and note lines.
- Paste multiline lyrics into a selected section; each newline becomes a lyric line and whitespace splits that line into words. Punctuation remains attached to each word.
- Edit lyric lines without manually aligning chords with spaces.
- When lyrics are edited, unchanged words matched in order retain their word IDs, chords, and syllables; newly introduced words receive new IDs.
- Click or keyboard-activate a word to open one reusable floating chord picker. The picker stays positioned relative to the selected word through scroll and window resize, validates chord symbols, and supports chord replacement or removal.
- Split a word into hyphen-separated syllables, clear a split, and attach, replace, or remove a chord on an individual syllable.
- Chord-only lines store a separate list of chord symbols; note lines store annotation text.
- Rendered lyrics and notes use DOM text content rather than HTML string interpolation.
- Undo/redo records structured song snapshots for up to 100 edits. Keyboard shortcuts are supported when focus is not in a text input.
- One-second debounced autosave persists valid edits. Pending inline edits are marked unsaved and must be applied or canceled before save; failed saves preserve the dirty state and display an error.

### Persistence and validation

- The main-process JSON store supports listing, retrieving, saving, and deleting songs.
- Writes are serialized and use a temporary file followed by a rename.
- Existing songs retain their original `createdAt`; successful saves update `updatedAt`.
- Missing data files are treated as an empty library. Malformed JSON is reported as an error instead of silently resetting the library.
- Models validate metadata, nested entity IDs, line types, chord symbols, and bounds on section, line, word, and syllable counts.
- Stable IDs are assigned to sections, lines, words, and syllables and persisted with the song.
- New songs are stored after a valid title is entered and a save succeeds.
- Duplicate songs receive new song and nested entity IDs, fresh timestamps, and a `(Copy)` title while preserving other metadata and chart content.

### Phase 4 — Plain-text import/export

- Import accepts UTF-8 `.txt` and `.text` files up to 1 MB through a main-process file picker. The renderer never receives the selected file path.
- Parsing is pure shared JavaScript. It recognizes documented metadata fields, bracketed custom section labels, common bare headings, `>` note lines, chord-only lines, and chord rows aligned over lyrics.
- Four-column tab stops and Unicode code-point columns are used for chord-to-word mapping. Ambiguous nearest-word assignments, duplicate chord placements, unpaired chord lines, and Unicode display-width uncertainty are reported in a review dialog.
- Import shows a title field, parsed section/line preview, and diagnostics. Nothing is saved until the user confirms; the resulting song is then saved through the validated song-store IPC.
- Text export is deterministic, uses a non-overlapping monospace column layout, preserves supported metadata and line types, aligns word and syllable chords with their lyric positions, warns on long/Unicode lines, and can transpose a copy to a selected key without changing the stored song.
- The library filters by title and performer and supports main-process song duplication. The duplicate operation completes before the library refreshes.
- The exact supported syntax and alignment policy are in [PLAIN-TEXT-FORMAT.md](./PLAIN-TEXT-FORMAT.md).

### Phase 5 — PDF and printing

- A separate local print document renders a single validated song with DOM text nodes and no editor controls, preload bridge, Node integration, or remote assets. Syllables remain visually joined as whole words in PDF/print output while their chords align over the appropriate parts.
- Print options include A4 or Letter, portrait or landscape, 8–24 pt font, optional metadata/notes, and an optional target key. Main-process validation rejects out-of-range options.
- PDF export uses a hidden isolated `BrowserWindow`, waits for the print renderer's fonts and layout, calls Electron `webContents.printToPDF()`, and atomically writes the resulting PDF bytes only after the user chooses a destination.
- Native printing is a separate `webContents.print()` operation that shows the OS print dialog by default. Print/PDF operations are serialized, and temporary print windows are closed in `finally` paths.
- Print CSS keeps chord/lyric lines together where possible, keeps section headings with following content, and permits long notes to flow across pages.
- PDF and printer code paths are implemented but have not been visually or cross-platform verified on supported OS versions in this environment.

### Shared foundation

- ES module data models are defined for `Song`, `Section`, `Line`, `Word`, and `Syllable`.
- Pure chart operations implement lyric tokenization, chord placement/removal, syllable editing, line and section operations, and ordered matching to preserve existing word-level chord data.
- Chord parsing and transposition helpers cover supported chord qualities, sharps, flats, and slash chords.

## Current user workflow

1. Run `npm start` from the project folder.
2. Select **New song** or open an existing song from the library.
3. Enter a title and any metadata.
4. Add a section, paste lyrics or add individual lines, and click a lyric word to place its chord.
5. Use **Split syllables** on a word to add chords to individual syllables.
6. Add chord-only or note lines where needed.
7. Apply or cancel any open inline edit. Valid changes autosave after a short debounce; **Save song** is also available.
8. Use Undo/Redo to reverse supported edits. Leaving with unsaved changes prompts for a decision.
9. In the library, use **Import text** to select a chart; check the preview and warnings, then confirm to add it. Search the library or duplicate a song as needed.
10. In the editor, choose **Export / Print**, set the output options, then choose text export, PDF export, or the native print dialog. Output uses a copy of the song and does not change the saved chart.

## Remaining work and limitations

- Manually verify import and export dialogs, output files, PDF pagination, and OS print dialogs on each supported platform. Automated layout regression and interactive end-to-end UI tests are not present.
- Plain-text import uses the documented format and nearest-word alignment policy; ambiguous placement is surfaced for review. Unicode column width is code-point-based, tabs use four-column stops, and syllable-level chord offsets cannot round-trip exactly.
- Print controls currently export or print one song at a time; selected-song sequence/setlist printing is not implemented.
- Team accounts, sharing, AI audio transcription, and setlists are also not implemented.

## Project layout

```text
docs/
  IMPLEMENTATION-PLAN.md
  PLAIN-TEXT-FORMAT.md
  current_state.md
  Worship Ministry Chord Chart App Product Specification.pdf
src/
  main/
    main.js
    song-store.js
    import-export.js
    print-manager.js
  preload/
    preload.cjs
  renderer/
    app.js
    index.html
    styles.css
    print.html
    print.js
    print.css
    components/
      chord-picker.js
    views/
      editor-view.js
      library-view.js
  shared/
    chart-editor.js
    chords.js
    edit-history.js
    export-formatter.js
    import-parser.js
    models.js
    print-options.js
    song-copy.js
test/
  chart-editor.test.js
  chords.test.js
  edit-history.test.js
  import-export.test.js
  models.test.js
  print-options.test.js
  song-store.test.js
```

## Run and test

From the `ChordChartEditor` directory:

```powershell
npm install
npm test
npm start
```

The automated suite covers chart operations, lyric tokenization, text import/export, alignment warnings, key transposition, duplicate identity, print-option validation, chord parsing, model validation, edit history, and JSON persistence. PDF layout, OS printing, and interactive end-to-end UI testing have not been automated yet.

## Implementation reference

See [IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md) for the sequential implementation plan. Phases 2–5 are implemented; platform-specific PDF/printing verification remains.
