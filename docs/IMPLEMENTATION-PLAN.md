# Chord Chart Editor — Implementation Plan

## Architecture and Cross-Phase Rules

The app is an offline-first Electron desktop application. Keep its existing process separation and extend it without giving the renderer direct access to Node.js, filesystem APIs, or unrestricted IPC.

```text
src/
  main/
    main.js                 Window lifecycle and IPC registration
    song-store.js           Validated local persistence
    import-export.js        Main-process file dialogs and file operations
    print.js                PDF export and printer integration
  preload/
    preload.cjs             Narrow, explicit renderer API
  renderer/
    index.html              Application shell
    app.js                  App startup and screen coordination
    styles.css              Shared layout and component styles
    views/
      library-view.js        Library rendering and interactions
      editor-view.js         Song header and editor rendering
    components/
      chord-picker.js       Floating chord-entry HUD
      dialogs.js             Accessible confirmation and error dialogs
  shared/
    models.js                Song, Section, Line, Word, and Syllable models
    chords.js                Chord parsing and transposition
    import-parser.js         Pure text-to-chart parsing functions
    export-formatter.js     Pure chart-to-text formatting functions
    validation.js            Shared input constraints and schema checks
test/
  *.test.js                  Unit, integration, and regression tests
```

### Rules applying to every phase

- **Validate at trust boundaries.** Validate and normalize all renderer-provided song data and arguments in the main process before persisting, importing, exporting, or printing. Renderer-side validation improves UX but is not a security boundary.
- **Keep IPC narrow.** Expose named operations through `contextBridge`; do not expose `ipcRenderer`, generic `send`/`invoke`, filesystem APIs, or arbitrary file paths to the renderer.
- **Use explicit channel contracts.** Define each operation’s argument and return shapes, reject unknown or malformed input, and return errors in a consistent, non-sensitive form.
- **Avoid unsafe DOM insertion.** Render user-controlled lyrics and metadata with `textContent` and DOM APIs. Do not interpolate song content into `innerHTML`.
- **Keep shared logic process-independent.** Chord parsing, transposition, validation, and text formatting should be pure functions that can be unit-tested without Electron.
- **Preserve structured data.** Chords remain attached to words or syllables in the model. Spaces, screen coordinates, and rendered text are not the source of truth for a chart.
- **Use stable identifiers.** Preserve song IDs and stable section/line/word identity when editing where feasible. If the data model does not yet include IDs for nested objects, add them before implementing complex edit, undo, and import behaviors.
- **Test on supported screen sizes.** The editor must remain usable on desktop and tablet-sized windows, including keyboard and accessibility interaction.

---

## **Phase 2:** View Management & Song Headers (Flipping between Library and Editor screens, handling metadata fields securely).

### Phase Objective

Implement navigation between the song library and a song editor screen. Let users create a song, open an existing one, edit its metadata, save it through the main-process persistence layer, and return to the library without losing changes.

### Granular Task Breakdowns

#### 1. Establish view lifecycle and navigation

- Refactor the renderer startup code into an app-level controller responsible for:
  - Loading the initial song list.
  - Showing the library view after startup.
  - Opening an existing song by ID.
  - Creating a new song model with a new ID and default metadata.
  - Returning to the library after saving or explicitly discarding changes.
- Add separate library and editor view modules. Each view should expose a small lifecycle contract, such as `mount(container, options)` and `unmount()`.
- Use one application root and replace or update its children when switching views. Avoid creating duplicate event listeners each time the user opens or closes a screen.
- Add a navigation state containing the current screen, active song ID, and whether the editor has unsaved changes.
- Add a visible “Back to library” control and define behavior for closing or navigating away with unsaved changes.

#### 2. Make library entries openable

- Render each song as an accessible button or a row containing an explicit Open button.
- On activation, call the app controller with the song ID. Do not treat visible title text as the identity of the song.
- Keep the library responsive for empty, loading, and error states.
- Add a refresh path after save, delete, duplicate, or import so the library reflects persisted changes.
- Keep search and duplicate operations out of scope unless needed by the current library UI; add them in the persistence/library phase that follows the editor basics.

#### 3. Build the song header form

Implement an editor header for the data-model metadata:

- Title.
- Writers, represented as an editable list of names rather than an opaque comma-separated storage string.
- Performer.
- Key.
- Capo.
- Tempo.
- Notes.
- CCLI song number, if the product requires it for reporting.

Use semantic labels and appropriate controls:

- Text inputs for title, performer, and CCLI number.
- A multi-value writer editor with add/remove controls.
- A key selector or validated text input that accepts supported key notation.
- A non-negative integer control for capo.
- A positive numeric control for tempo.
- A multiline text area for notes.

Map form values to the existing `Song` model. Keep rendering state distinct from the persisted song object where necessary so incomplete form input can be displayed and validated before save.

#### 4. Add secure save and load operations

- Use the existing song load/list/save IPC paths, and define an explicit `songs:get` operation if loading a single song by ID is required.
- Update the preload API with only the required named methods, for example:
  - `listSongs()`
  - `getSong(songId)`
  - `saveSong(song)`
  - `deleteSong(songId)`
- Validate IDs, metadata types, numeric ranges, nested sections, lines, words, and chord fields in the main process.
- Preserve `createdAt` when updating an existing song and update `updatedAt` on successful persistence.
- Keep writes serialized and atomic so overlapping saves cannot silently overwrite each other or leave partial JSON behind.
- Report persistence errors in the editor rather than showing success when save fails.
- Consider disabling or marking the Save action while a save is in progress; prevent duplicate submissions.
- On app startup, treat a missing data file as an empty library. Treat malformed or unreadable stored data as an explicit recovery error; do not silently replace the file with an empty collection.

#### 5. Handle unsaved changes

- Track editor changes by comparing the editable state with the last successfully saved snapshot or by maintaining a reliable dirty flag.
- Saving should only clear the dirty state after the main process confirms persistence.
- On Back, window close, or opening another song with dirty state, prompt the user to save, discard, or continue editing.
- Ensure the prompt cannot be bypassed by firing duplicate navigation events while a save is pending.

### Technical Considerations

- **Electron security:** The editor must not receive filesystem paths or call Node APIs. All data reads and writes continue through the preload API and validated main-process handlers.
- **IPC sender checks:** Continue verifying that privileged IPC requests come from the expected local renderer. Do not accept requests from arbitrary frames or navigated external content.
- **DOM performance:** Render the active view only. Update changed header fields and library rows without rebuilding unrelated application content.
- **Event listeners:** Use view-scoped listeners and remove them on unmount, or use a single delegated listener on a persistent root. Do not attach a new global listener each time the editor is opened.
- **State and persistence:** The in-memory form state is authoritative during editing; the persisted JSON store is authoritative after a confirmed save.
- **Accessibility:** Make navigation and controls keyboard operable, associate each form field with a visible label, expose save status with an accessible status region, and keep focus predictable when switching views.
- **Data compatibility:** If the model changes, define a schema version or migration strategy before depending on newly added properties in stored song files.

### Definition of Done

- [ ] Startup opens a functional library view with loading, empty, populated, and error states.
- [ ] Selecting a song opens the correct song using its stable ID.
- [ ] Creating a new song opens the editor with valid defaults and a unique ID.
- [ ] Metadata fields edit and serialize to the documented song model.
- [ ] Invalid capo, tempo, key, or malformed metadata is rejected with a useful message.
- [ ] Saving persists through validated IPC and updates the library.
- [ ] Closing or navigating away with unsaved changes offers save, discard, and cancel/continue-editing actions.
- [ ] Reopening the app reloads saved song metadata correctly.
- [ ] The renderer exposes no direct Node or filesystem access.
- [ ] Tests cover view navigation, metadata validation, create/load/save behavior, and dirty-state transitions.

---

## **Phase 3:** Interactive Click-to-Place Chord Editor (Splitting lines into clickable words, managing the absolute-positioned floating chord picker HUD, and in-memory state modification).

### Phase Objective

Implement the editor canvas so users can enter lyrics, attach chords to words by clicking, edit chord-only and note lines, and manipulate the active song in memory. Preserve the structured word-level data model so lyric changes do not depend on manually aligned spaces.

### Granular Task Breakdowns

#### 1. Define the editable chart operations

- Specify pure operations for creating, updating, moving, and removing:
  - Sections.
  - Lines.
  - Words.
  - Word chords.
  - Syllable splits and syllable chords.
- Keep these operations separate from DOM event handling. An editor interaction should produce a model operation, update the in-memory song, and then render the affected region.
- Decide the identity and ordering rules:
  - Sections have explicit order.
  - Lines preserve their order within a section.
  - Words preserve their order within a lyric line.
  - Chord-only lines store chord symbols without pretending they are lyric words.
  - Note lines store annotation text separately from lyrics.
- Validate chord values through the shared chord parser when committing a chord. Preserve invalid text in the picker long enough to show a correction message rather than silently normalizing it.

#### 2. Convert pasted lyrics into editable words

- Provide a lyric-line input path, such as a textarea for initial paste or an inline line editor.
- Split each lyric line into ordered `Word` objects while retaining punctuation and display whitespace appropriately.
- Define tokenization behavior for:
  - Multiple spaces and tabs.
  - Leading and trailing whitespace.
  - Punctuation attached to words.
  - Empty lines.
  - Unicode lyric text and apostrophes.
- Keep structural whitespace as rendering data or a deliberate formatting rule; do not create fake word tokens that cause chord placement to target spaces.
- Render each word as an independently addressable DOM element, with a stable word ID where available and a semantic button or keyboard-accessible target for chord placement.
- Avoid making each character a separate element. A word-level target limits DOM size while meeting the product requirement.

#### 3. Implement chord placement interactions

- Clicking or keyboard-activating a word opens the chord picker for that word.
- Pass the target’s stable song/section/line/word identity into the picker state. Do not store a transient pixel coordinate as the chord’s model location.
- On chord confirmation:
  - Validate the chord symbol.
  - Update only the selected word’s chord in the in-memory song.
  - Mark the song dirty.
  - Re-render the affected line or word.
  - Return focus to the word or its adjacent editor control.
- Allow a chord to be replaced or removed.
- Provide a clear remove action distinct from an empty chord submission.
- Support chord-only lines using an explicit line editor and the `chord-only` line type. Do not force chord-only symbols into lyric words.
- Support note lines using the `note` line type and a separate text editor.

#### 4. Build and position the floating chord picker HUD

- Implement the picker as a single reusable overlay, not one floating element per word.
- Store picker state such as:
  - Open/closed state.
  - Target word identity.
  - Current chord text.
  - Validation message.
  - Current keyboard focus target.
- Position the HUD near the selected word using `getBoundingClientRect()`.
- Prefer a `position: fixed` overlay attached to a stable application-level overlay root so document scrolling does not corrupt its coordinates. Recalculate placement after scrolling, resizing, zoom changes, or viewport changes.
- Flip or clamp the HUD within the visible viewport; avoid covering the selected word when there is an alternative placement.
- Close the HUD on Escape, explicit cancellation, or an intentional click outside it. Do not close it before a click on a picker control completes.
- Keep focus inside the picker while it is open where appropriate; return focus to the invoking word when it closes.
- Provide keyboard interaction for opening a word, typing a chord, confirming it, removing it, and dismissing the HUD.

#### 5. Render the chart efficiently

- Render section headers, line types, words, and chord labels from model state.
- Display a chord immediately above its associated word using a grid/inline structure tied to the word, rather than calculating the chord’s alignment by adding spaces.
- Use CSS layout primitives to keep chord and lyric positions related as font sizes, window sizes, and lyric text change.
- Re-render only the modified line or section where practical. If an initial implementation replaces the whole editor subtree, ensure event binding remains delegated and keyboard focus is restored.
- Keep section controls for adding, renaming, reordering, and removing sections.
- Add clear visual distinctions between verse/chorus section headers, lyrics, chord-only lines, and note lines.

#### 6. Add edit history and save safety

- Record reversible editor operations for lyric changes, chord changes, section edits, and line edits.
- Implement undo and redo as model operations or snapshots with explicit history boundaries; do not undo by attempting to reverse DOM mutations.
- Ensure undo/redo updates the rendered chart and dirty state.
- Save through the Phase 2 persistence contract. Debounce autosave only after a reliable save status and error path exist.
- For autosave, use a short debounce and serialize saves per song. A later save must not be overwritten by a slower earlier save.
- On save failure, retain dirty state, show an error, and allow retry. Do not report that autosave succeeded if persistence failed.
- Avoid silently saving after the user switches to another song unless the operation is associated with the correct song ID.

### Technical Considerations

- **Electron security:** Chord and lyric editing is renderer-side state manipulation; persistence still goes through the narrow save IPC operation. Validate the complete incoming model in the main process.
- **DOM performance:** Use one event-delegation listener for word actions where possible. Reuse a single chord picker overlay. Avoid rebuilding the entire app on each keystroke.
- **Positioning:** The picker’s visual position is ephemeral UI state. The word identity in the model, not the HUD coordinates, determines where the chord is stored.
- **Persistence rules:** Chords are stored as symbol strings attached to words or syllables. The transposition layer must change chord names without changing lyrics or word order.
- **Model completeness:** Add stable IDs to nested entities if undo, drag/reorder, or async save reconciliation requires them. Validate uniqueness within the song.
- **Responsive layout:** Ensure word targets and chord labels remain readable and operable at tablet widths and with zoomed text.
- **Input composition:** Do not commit or split text during IME composition; support Unicode lyrics and avoid destructive tokenization while the user is actively typing.

### Definition of Done

- [ ] A user can create and label sections and add lyric, chord-only, and note lines.
- [ ] Pasted lyric lines split into ordered clickable words without losing their text or punctuation.
- [ ] Clicking or keyboard-activating a word opens the chord picker anchored to that word.
- [ ] Entering a valid chord places it above the selected word and persists it in the model.
- [ ] A chord can be replaced and removed.
- [ ] The chord picker stays visible and correctly positioned during scrolling and window resizing.
- [ ] Keyboard users can open, use, confirm, remove, and dismiss the picker.
- [ ] Editing lyrics does not rely on spacebar chord alignment.
- [ ] Undo and redo restore both model data and rendered output for supported edits.
- [ ] Save and autosave failures remain visible and preserve unsaved state.
- [ ] Tests cover chord placement, removal, lyric tokenization, chord-only lines, notes, and undo/redo.

---

## **Phase 4:** Plain Text Importer/Exporter Utility Matrix (Regex line parser to split text into structured arrays, column tracking for horizontal chord alignment, and text generation mapping strings to keys).

### Phase Objective

Provide a predictable import/export path between structured charts and plain text. Importers should preserve chord-to-word relationships where the source format provides enough information, flag ambiguous input for user review, and export a chart in a selected key.

### Granular Task Breakdowns

#### 1. Specify the supported text format

- Document the supported input conventions before implementing a parser:
  - Section headings and their accepted forms.
  - Chord-line syntax.
  - Lyric-line syntax.
  - Chord-only and note-line syntax.
  - Blank-line behavior.
  - Whether annotations such as repeated sections are supported.
- Keep the parser tolerant of common heading variants while preserving the original heading text when the parser cannot confidently normalize it.
- Define the parser output as structured data plus diagnostics, for example:
  - Parsed sections and lines.
  - Warnings for unmatched chord lines, ambiguous alignments, or unsupported constructs.
  - Source line numbers for each warning.
- Do not make a regex alone responsible for reconstructing all chart structure. Use small pure parsing stages: normalize line endings, classify lines, associate chord lines with lyric lines, tokenize lyrics, and map chord columns to words.

#### 2. Implement chord and heading recognition

- Use the existing chord parser as the authoritative chord-symbol validator.
- Implement a chord-line scanner that recognizes one or more chord symbols and records each token’s starting and ending character columns.
- Treat regex or scanning patterns as format recognition, not as proof that every matching string is a valid chord.
- Recognize headings conservatively:
  - Normalize known names such as Verse, Chorus, Bridge, Intro, Outro, and Tag.
  - Preserve labels such as “Verse 2” and user-defined section names.
  - Avoid classifying ordinary lyric lines as headings merely because they contain a matching keyword.
- Retain source line numbers and original text for error display and review.

#### 3. Track columns when importing aligned chord and lyric lines

- Pair a chord line with the following lyric line only when the input format and intervening lines make the relationship unambiguous.
- Record chord token start columns and lyric word spans in the original text.
- Map each chord token to the lyric word whose span contains the chord’s column. If the chord column is between words or outside all word spans, use a documented nearest-word policy and flag the mapping as uncertain.
- Use code-point-aware or grapheme-aware indexing consistently if Unicode text is supported. Do not mix JavaScript UTF-16 string offsets with visual columns without an explicit conversion strategy.
- Treat tabs using a defined tab-stop expansion rule during import; do not assume a tab occupies one visual column.
- Expose uncertain mappings in an import review step. Never silently discard a chord because its column cannot be mapped confidently.
- Preserve unpaired chord lines as `chord-only` lines when that interpretation is reasonable; otherwise report a parser warning.

#### 4. Build the import workflow

- Add a renderer action that requests an import through a specific preload method, such as `importSongText()`.
- Open the file picker in the main process using a constrained text-file filter. Read the selected file in the main process and return the content or a validated parse result through IPC; do not let the renderer access the chosen path directly.
- Apply size limits and supported encoding rules. Handle invalid or unreadable files as explicit errors.
- Parse the text using shared pure logic and show a preview before adding the song to the library.
- Let the user review title, section labels, unmatched lines, and uncertain chord placement.
- On confirmation, create a new song ID and persist the imported song through the validated store operation.
- Do not overwrite an existing song during import unless the user explicitly selected an update flow and confirmed it.

#### 5. Build the export workflow

- Implement a pure exporter that serializes:
  - Song title and relevant metadata according to the chosen text format.
  - Section headings in order.
  - Lyric, chord-only, and note lines.
  - Chords above the intended word or syllable.
- Add export in the selected key by transposing a copy of the song model. Do not mutate the saved song merely to export another key.
- Generate a deterministic plain-text representation so repeated exports of unchanged data produce the same content.
- Implement a deliberate monospace alignment scheme for plain-text output:
  - Compute character-column offsets for words and chord labels.
  - Handle long chord symbols without overlapping adjacent chord positions.
  - Define line wrapping behavior or report when a line exceeds the chosen width.
  - Preserve the structured chart as the source of truth because plain-text alignment depends on fonts and editor rendering.
- Use a save dialog in the main process to choose an export destination and write the text there. Return an explicit success or failure result.
- If a song cannot be represented faithfully in the chosen format, warn the user and identify the information that will be omitted or approximated.

#### 6. Add library operations needed by import/export

- Add search by title and performer using normalized, case-insensitive comparisons.
- Add duplicate-song behavior that creates a new song ID and fresh timestamps while preserving the chart content and metadata according to a documented rule.
- Add import/export actions to the library UI and show progress or completion status.
- Ensure delete, duplicate, and import operations update the list only after main-process success.

### Technical Considerations

- **Electron security:** File dialogs and filesystem reads/writes belong in the main process. Renderer APIs should expose operations such as `importSongText()` and `exportSongText(song, options)`, never arbitrary file paths or generic filesystem access.
- **IPC validation:** The main process must validate import size, export options, song structure, key notation, and output content. Do not trust a renderer-generated path or parsed song object.
- **Parser determinism:** Use fixtures for ambiguous cases and keep parsing independent of the DOM so it can run quickly and consistently.
- **Column fidelity:** Plain-text columns are not the same as visual columns when proportional fonts, tabs, combining characters, or emoji are involved. Define and test the import measurement rule, and make uncertain results reviewable.
- **DOM performance:** Render the import preview as a bounded number of rows and use text nodes. Avoid rerendering the entire library while the user adjusts one warning.
- **Persistence:** Parse first, allow review, then persist. A failed import must not leave a partially written song or corrupt the existing library.
- **Transposition:** Export-key conversion must use the shared parser and transposition logic, including sharps, flats, chord qualities, and slash bass notes. Invalid symbols must produce clear errors or review warnings.
- **Copyright:** Imported lyrics and charts are user-provided content. Do not upload or publish them as part of this local import/export workflow.

### Definition of Done

- [ ] The supported plain-text format and its limitations are documented.
- [ ] Import splits sections, lyrics, chord-only lines, and notes into the correct model shapes.
- [ ] Chord-line token columns map to lyric words in covered fixtures.
- [ ] Ambiguous or unsupported mappings are reported for user review.
- [ ] Import preview does not persist until the user confirms.
- [ ] Failed imports do not partially modify the song library.
- [ ] Export produces deterministic text with chords aligned to their intended words under the documented monospace rules.
- [ ] Exporting in another key transposes a copy and leaves the stored song unchanged.
- [ ] Import and export use main-process dialogs and validated IPC operations.
- [ ] Search and duplicate operations preserve correct IDs and metadata behavior.
- [ ] Tests cover headings, blanks, tabs, multiple chords, slash chords, unmatched lines, Unicode text, export alignment, and transposed exports.

---

## **Phase 5:** Local Document Compiling & Printing (Leveraging Electron printToPDF and compiling file blobs programmatically to native OS streams without layout breakages).

### Phase Objective

Produce print-ready local output from a structured song or selected chart set. Generate PDF through Electron’s supported PDF API and send print jobs to the operating system through Electron’s print API. Preserve chart layout across page breaks and do not conflate PDF buffers with printer streams.

### Granular Task Breakdowns

#### 1. Implement a dedicated print document

- Create a print-specific renderer document or isolated print route that receives validated chart data and renders a print layout.
- Keep print styling separate from interactive editor styling:
  - Use print-safe typography and contrast.
  - Remove navigation, buttons, overlays, selection outlines, and editing controls.
  - Ensure chord labels stay associated with their lyric words.
  - Apply explicit page size, margins, and print colors.
- Provide print layout options such as:
  - Page size supported by Electron’s print settings.
  - Portrait or landscape orientation.
  - Font size.
  - Whether to include metadata such as key, capo, tempo, and notes.
  - Whether to print one song or a selected sequence.
- Avoid embedding untrusted remote resources in the print document. Prefer local resources or inline safe styles.

#### 2. Compile a chart for PDF export

- Add a main-process operation that creates a print-capable `WebContents` instance or uses a controlled print view.
- Load only the application’s local print document.
- Pass chart data through a validated channel or a constrained serialized payload. Do not load renderer-provided HTML or remote content for PDF creation.
- Wait for the print document to finish loading and for fonts/layout to settle before generating the PDF.
- Call Electron’s `webContents.printToPDF()` with explicit options for page size, margins, orientation, backgrounds, and page range as supported by the pinned Electron version.
- Treat the returned PDF as a `Buffer`, then write it through the main process to a path chosen by a save dialog.
- Write to a temporary file and atomically rename after successful completion where practical; remove only that specifically created temporary file on failure.
- Return a structured result indicating success or a clear failure to the renderer. Do not return a success-shaped response if PDF generation or file writing failed.

#### 3. Send jobs to a native OS printer

- Use Electron’s `webContents.print()` for an OS print dialog or a clearly specified silent-print workflow.
- Default to showing the operating-system print dialog; silent printing should require an explicit product requirement and an intentionally selected printer.
- Pass only supported print options for the Electron version in use.
- Report the print callback result and errors to the user.
- Distinguish this printer workflow from PDF generation:
  - `printToPDF()` produces PDF bytes.
  - `webContents.print()` submits a print job through Electron’s printing integration.
  - Do not describe PDF blobs as native printer streams or manually write them to an undocumented OS spooler interface.
- If future support needs a native PDF-to-printer path beyond Electron printing, define and validate that integration separately rather than exposing arbitrary process execution from the renderer.

#### 4. Implement pagination and layout regression coverage

- Define page-break behavior for section headings, lyric lines, and chart metadata.
- Keep section headings with at least the following line where possible.
- Avoid splitting a chord/lyric pair across pages.
- Avoid truncating long notes or oversized lines without warning.
- Use CSS print rules such as page size, margins, `break-inside`, and `break-after` in the dedicated print stylesheet.
- Test long titles, long lyric lines, many sections, large font settings, long notes, chord-only lines, and tablet-created charts.
- Compare generated PDFs visually or through reliable structural checks, not only by confirming a non-empty file exists.

#### 5. Add export and print controls

- Add explicit “Export PDF” and “Print” actions in the editor and library/setlist context if applicable.
- For PDF export, open a save dialog in the main process and write the generated bytes to the selected destination.
- For printing, show the native print dialog by default.
- Provide visible progress and errors for document preparation, PDF generation, save completion, and printer cancellation.
- Ensure repeated clicks cannot create overlapping print windows or duplicate exports for the same active request.
- Close temporary print windows after success or failure and release associated listeners and resources.

### Technical Considerations

- **Electron security:** The print document remains local and locked to the application’s trusted content. The renderer requests a named export or print operation; it never selects arbitrary paths for the main process to write without a save dialog.
- **Context isolation:** Keep the print view isolated as well. Do not enable Node integration in a print renderer.
- **Data validation:** Validate the song and formatting options before rendering. Escape and render lyrics and metadata as text, not HTML.
- **DOM/layout performance:** Render only the document being printed. Do not load interactive editor widgets or the full library into the print view.
- **Page stability:** Wait for content and layout readiness before printing; use local fonts and assets to reduce timing and pagination variation.
- **Error handling:** Surface print cancellation, missing permissions, invalid output location, and generation errors distinctly. Always clean up a temporary print window after its operation completes.
- **Platform behavior:** Verify PDF and printer behavior on each supported operating system and Electron version. Printer availability, paper sizes, and dialogs vary by OS.
- **Data persistence:** Printing and exporting do not modify the saved song, timestamps, or selected key. Export-in-another-key operates on a transposed copy.
- **Privacy:** Keep chart content local. Do not send lyrics, audio, or metadata to external services as part of document generation.

### Definition of Done

- [ ] PDF export creates a valid, readable PDF at a user-selected path.
- [ ] OS printing uses Electron’s print integration and presents the print dialog by default.
- [ ] PDF generation and printer submission are separate, correctly named operations.
- [ ] Song content is rendered as text and cannot inject markup or scripts into the print document.
- [ ] Chords remain aligned above their intended words in the exported document.
- [ ] Page breaks do not separate section headings from their first lines unnecessarily or split chord/lyric pairs.
- [ ] Long content, different font sizes, and page sizes are covered by layout regression tests.
- [ ] Print cancellation and generation/write failures are reported without false success.
- [ ] Temporary print windows and temporary files are cleaned up after the operation.
- [ ] Export and print leave saved song data unchanged.
- [ ] PDF and printer behavior is verified on each supported target operating system.
