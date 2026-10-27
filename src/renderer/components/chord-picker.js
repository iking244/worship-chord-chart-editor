import { parseChord } from '../../shared/chords.js';

export function mountChordPicker(container, { onApply, onRemove, onPendingChange = () => {} }) {
  const panel = document.createElement('form');
  panel.className = 'chord-picker';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Place chord on word');
  panel.hidden = true;

  const label = document.createElement('label');
  label.htmlFor = 'chord-picker-input';
  label.textContent = 'Chord';
  const input = document.createElement('input');
  input.id = 'chord-picker-input';
  input.type = 'text';
  input.autocomplete = 'off';
  input.maxLength = 64;
  input.spellcheck = false;

  const error = document.createElement('p');
  error.className = 'chord-picker-error';
  error.setAttribute('role', 'alert');

  const actions = document.createElement('div');
  actions.className = 'chord-picker-actions';
  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'secondary-button';
  removeButton.textContent = 'Remove';
  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'secondary-button';
  cancelButton.textContent = 'Cancel';
  const applyButton = document.createElement('button');
  applyButton.type = 'submit';
  applyButton.textContent = 'Place chord';
  actions.append(removeButton, cancelButton, applyButton);
  panel.append(label, input, error, actions);
  container.append(panel);

  let target;
  let originalChord = '';
  const onDocumentPointerDown = (event) => {
    if (!panel.hidden && !panel.contains(event.target) && !target?.contains(event.target)) {
      close({ restoreFocus: false });
    }
  };
  const onWindowResize = () => reposition();
  const onWindowScroll = () => reposition();
  const onPanelKeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  function reposition() {
    if (panel.hidden || !target?.isConnected) {
      return;
    }
    const bounds = target.getBoundingClientRect();
    const panelBounds = panel.getBoundingClientRect();
    const gap = 8;
    const left = Math.min(
      Math.max(8, bounds.left),
      Math.max(8, window.innerWidth - panelBounds.width - 8)
    );
    let top = bounds.bottom + gap;
    if (top + panelBounds.height > window.innerHeight - 8) {
      top = bounds.top - panelBounds.height - gap;
    }
    panel.style.left = `${left}px`;
    panel.style.top = `${Math.max(8, top)}px`;
  }

  function close({ restoreFocus = true } = {}) {
    if (panel.hidden) {
      return;
    }
    panel.hidden = true;
    const previousTarget = target;
    target = undefined;
    originalChord = '';
    onPendingChange();
    if (restoreFocus && previousTarget?.isConnected) {
      previousTarget.focus();
    }
  }

  function open(wordTarget, chord = '') {
    target = wordTarget;
    originalChord = chord;
    input.value = chord;
    removeButton.disabled = !chord;
    error.textContent = '';
    panel.hidden = false;
    reposition();
    input.focus();
    input.select();
  }

  input.addEventListener('input', onPendingChange);
  panel.addEventListener('submit', (event) => {
    event.preventDefault();
    const chord = input.value.trim();
    if (!parseChord(chord)) {
      error.textContent = 'Enter a valid chord, such as G, Bb, F#m, or C/E.';
      input.focus();
      return;
    }
    const selectedTarget = target;
    close({ restoreFocus: false });
    onApply(selectedTarget, chord);
    selectedTarget?.focus();
  });

  removeButton.addEventListener('click', () => {
    const selectedTarget = target;
    close({ restoreFocus: false });
    onRemove(selectedTarget);
    selectedTarget?.focus();
  });
  cancelButton.addEventListener('click', () => close());
  panel.addEventListener('keydown', onPanelKeydown);
  document.addEventListener('pointerdown', onDocumentPointerDown);
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('scroll', onWindowScroll, true);

  return {
    open,
    close,
    reposition,
    hasPendingValue() {
      return !panel.hidden && input.value.trim() !== originalChord;
    },
    setDisabled(disabled) {
      input.disabled = disabled;
      removeButton.disabled = disabled || !originalChord;
      cancelButton.disabled = disabled;
      applyButton.disabled = disabled;
    },
    destroy() {
      document.removeEventListener('pointerdown', onDocumentPointerDown);
      window.removeEventListener('resize', onWindowResize);
      window.removeEventListener('scroll', onWindowScroll, true);
      panel.remove();
    }
  };
}
