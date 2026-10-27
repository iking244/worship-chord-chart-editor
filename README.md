# Chord Chart Editor

Lightweight Electron foundation for the Worship Ministry Chord Chart App. It separates the Electron main process, a restricted preload bridge, and a vanilla JavaScript renderer. Song data is persisted as JSON in Electron's `userData` directory.

## Requirements

- Node.js 20 or later
- npm

## Run

```sh
npm install
npm start
```

Run the chart editor, import/export, print-option, history, model, chord, and persistence tests with:

```sh
npm test
```

## Project layout

```text
docs/
  IMPLEMENTATION-PLAN.md
  PLAIN-TEXT-FORMAT.md
  current_state.md
  Worship Ministry Chord Chart App Product Specification.pdf
src/
  main/
    main.js          Electron window lifecycle and allowlisted IPC handlers
    song-store.js    Local JSON song persistence
    import-export.js File-dialog-based text import/export
    print-manager.js Isolated PDF and native print operations
  preload/
    preload.cjs      Restricted contextBridge API
  renderer/
    index.html       Application shell
    app.js           View navigation, editor state, and save lifecycle
    styles.css       Responsive, lightweight styling
    print.html       Isolated print-document shell
    print.js         Safe print document rendering
    print.css        Print layout and pagination rules
    components/
      chord-picker.js Reusable positioned chord picker
    views/
      library-view.js Song library rendering
      editor-view.js  Metadata and interactive chart editor
  shared/
    chart-editor.js    Pure structured chart editing operations
    chords.js          Chord parsing and immutable transposition helpers
    edit-history.js    Bounded undo/redo snapshot history
    export-formatter.js Deterministic text formatter and key transposition
    import-parser.js   Pure text-to-chart parser
    models.js          Song, Section, Line, Word, and Syllable data models
    print-options.js   Bounded print option validation
    song-copy.js       Duplicate song identity rules
test/
  chart-editor.test.js
  chords.test.js
  edit-history.test.js
  import-export.test.js
  models.test.js
  print-options.test.js
  song-store.test.js
```

The renderer has no direct Node.js access. Add new renderer-to-main capabilities as specific methods in `preload.cjs` and matching allowlisted handlers in `main.js`; do not expose generic IPC send/invoke methods.

Plain-text syntax and its alignment limitations are documented in [PLAIN-TEXT-FORMAT.md](./docs/PLAIN-TEXT-FORMAT.md). The editor's **Export / Print** action offers plain-text export, PDF export, or the native print dialog with key, page size, orientation, font-size, and metadata options.
