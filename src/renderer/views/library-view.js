export function renderLibrary(container, songs, { onOpen, onNew, onImport, onDuplicate }) {
  const content = document.createDocumentFragment();
  const heading = document.createElement('div');
  heading.className = 'section-heading';

  const titleBlock = document.createElement('div');
  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'Your workspace';
  const title = document.createElement('h2');
  title.id = 'library-heading';
  title.textContent = 'Song library';
  titleBlock.append(eyebrow, title);

  const newSongButton = document.createElement('button');
  newSongButton.type = 'button';
  newSongButton.textContent = 'New song';
  newSongButton.addEventListener('click', onNew);
  const importButton = document.createElement('button');
  importButton.type = 'button';
  importButton.className = 'secondary-button';
  importButton.textContent = 'Import text';
  importButton.addEventListener('click', onImport);
  const libraryActions = document.createElement('div');
  libraryActions.className = 'library-actions';
  libraryActions.append(importButton, newSongButton);
  heading.append(titleBlock, libraryActions);
  content.append(heading);

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'song-search';
  search.placeholder = 'Search titles and performers';
  search.setAttribute('aria-label', 'Search songs by title or performer');
  content.append(search);

  const list = document.createElement('ul');
  list.className = 'song-list';
  list.setAttribute('aria-label', 'Saved songs');
  const emptyState = document.createElement('p');
  emptyState.className = 'empty-state';

  function renderRows() {
    const query = search.value.trim().normalize('NFKC').toLowerCase();
    const filtered = songs.filter((song) => (
      `${song.title}\n${song.performer}`.normalize('NFKC').toLowerCase().includes(query)
    ));
    list.replaceChildren();
    if (filtered.length === 0) {
      emptyState.textContent = songs.length === 0
        ? 'No saved songs yet. Create or import one to get started.'
        : 'No songs match your search.';
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;

    for (const song of filtered) {
      const item = document.createElement('li');
      item.className = 'song-list-item';
      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'song-card';
      openButton.addEventListener('click', () => onOpen(song.id));

      const songTitle = document.createElement('span');
      songTitle.className = 'song-title';
      songTitle.textContent = song.title || 'Untitled song';

      const details = document.createElement('span');
      details.className = 'song-details';
      details.textContent = [song.performer, song.key].filter(Boolean).join(' · ')
        || 'No performer or key set';

      openButton.append(songTitle, details);
      const duplicateButton = document.createElement('button');
      duplicateButton.type = 'button';
      duplicateButton.className = 'secondary-button duplicate-song';
      duplicateButton.textContent = 'Duplicate';
      duplicateButton.setAttribute('aria-label', `Duplicate ${song.title || 'untitled song'}`);
      duplicateButton.addEventListener('click', () => onDuplicate(song.id));
      item.append(openButton, duplicateButton);
      list.append(item);
    }
  }

  search.addEventListener('input', renderRows);
  content.append(emptyState, list);
  renderRows();
  container.replaceChildren(content);
}
