/**
 * THE GOONIES COMPANION APP
 * Main application logic
 */

// ======================================================
// STATE
// ======================================================
const state = {
  lang: localStorage.getItem('goonies-lang') || 'EN',
  penalty: parseInt(localStorage.getItem('goonies-penalty') || '0', 10),
  currentCode: null,
  currentEntry: null,
  currentHero: null,
  db: { codes: [], heroes: [], dictionary: [] },
  ready: false,
};

// Labels per language
const UI_LABELS = {
  EN: {
    codePlaceholder: 'e.g. 1000',
    codeLabel: 'Enter Code',
    notFound: 'Code not found. Check and try again.',
    confirm: 'Confirm',
    cancel: 'Cancel',
    back: 'Back',
    action: 'Action',
    tapToZoom: 'Tap to zoom',
    noLoc: '',
  },
  RU: {
    codePlaceholder: 'напр. 1000',
    codeLabel: 'Введите код',
    notFound: 'Код не найден. Проверьте и попробуйте снова.',
    confirm: 'Подтвердить',
    cancel: 'Отмена',
    back: 'Назад',
    action: 'Действие',
    tapToZoom: 'Нажмите для увеличения',
    noLoc: '',
  },
  UK: {
    codePlaceholder: 'напр. 1000',
    codeLabel: 'Введіть код',
    notFound: 'Код не знайдено. Перевірте і спробуйте знову.',
    confirm: 'Підтвердити',
    cancel: 'Скасувати',
    back: 'Назад',
    action: 'Дія',
    tapToZoom: 'Натисніть для збільшення',
    noLoc: '',
  },
};

// ======================================================
// DOM REFS
// ======================================================
const $ = id => document.getElementById(id);
const loadingScreen = $('loading-screen');
const appEl = $('app');
const screens = {
  input:  $('input-screen'),
  hero:   $('hero-screen'),
  result: $('result-screen'),
};

// ======================================================
// CSV LOADING
// ======================================================
async function loadCSV(path) {
  const response = await fetch(path);
  const text = await response.text();
  return new Promise(resolve => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: results => resolve(results.data),
    });
  });
}

async function initData() {
  const [codes, heroes, dictionary] = await Promise.all([
    loadCSV('db/codes.csv'),
    loadCSV('db/heros.csv'),
    loadCSV('db/dictionary.csv'),
  ]);
  state.db.codes = codes;
  state.db.heroes = heroes;
  state.db.dictionary = dictionary;
  state.ready = true;
}

// ======================================================
// LOOKUP HELPERS
// ======================================================
function findCode(code) {
  const upper = code.trim().toUpperCase();
  return state.db.codes.find(r => r.Code && r.Code.trim().toUpperCase() === upper) || null;
}

function findHero(heroId) {
  return state.db.heroes.find(r => r.HeroId === heroId) || null;
}

function findLocation(locId) {
  if (!locId) return null;
  return state.db.dictionary.find(r => r.Id === locId) || null;
}

function getPenaltyLabel() {
  const penRow = state.db.dictionary.find(r => r.Id === 'penaltyTrackerName');
  if (!penRow) return 'Caught';
  const langKey = state.lang === 'UK' ? 'UK' : state.lang;
  return penRow[langKey] || penRow['EN'] || 'Caught';
}

function getHeroName(hero) {
  const key = state.lang === 'UK' ? 'Name UK' : `Name ${state.lang}`;
  return hero[key] || hero['Name EN'] || '';
}

function getHeroSpec(hero) {
  const key = state.lang === 'UK' ? 'Spec UK' : `Spec ${state.lang}`;
  return hero[key] || hero['Spec EN'] || '';
}

function getLocName(loc) {
  if (!loc) return '';
  const key = state.lang === 'UK' ? 'UK' : state.lang;
  return loc[key] || loc['EN'] || '';
}

function getEntryText(entry) {
  const key = state.lang === 'UK' ? 'Text UK' : (state.lang === 'RU' ? 'Text RU' : 'Text');
  return (entry[key] || entry['Text'] || '').trim();
}

function getEntryAction(entry) {
  const key = state.lang === 'UK' ? 'Action UK' : (state.lang === 'RU' ? 'Action RU' : 'Action');
  return (entry[key] || '').trim();
}

// ======================================================
// PENALTY TRACKER
// ======================================================
function updatePenaltyUI() {
  const label = getPenaltyLabel();
  const score = state.penalty;

  ['', '-2', '-3'].forEach(s => {
    const el = $(`penalty-label${s}`);
    if (el) el.textContent = label;
    const sc = $(`penalty-score${s}`);
    if (sc) sc.textContent = score;
  });

  localStorage.setItem('goonies-penalty', score);
}

function bindPenaltyButtons(suffix, addId, resetId) {
  const addBtn = $(addId);
  const resetBtn = $(resetId);
  if (addBtn) addBtn.addEventListener('click', () => {
    state.penalty++;
    // bounce animation
    addBtn.animate([{transform:'scale(1)'},{transform:'scale(1.3)'},{transform:'scale(1)'}], {duration:200});
    updatePenaltyUI();
  });
  if (resetBtn) resetBtn.addEventListener('click', () => {
    state.penalty = 0;
    updatePenaltyUI();
  });
}

// ======================================================
// LANGUAGE
// ======================================================
function setLang(lang) {
  state.lang = lang;
  localStorage.setItem('goonies-lang', lang);
  // Update all lang buttons
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
  applyUILabels();
  updatePenaltyUI();

  // If we're on result screen, re-render the result with new lang
  if (!screens.result.classList.contains('hidden') && state.currentEntry) {
    renderResult(state.currentEntry, state.currentHero);
  }
  // If on hero screen, re-render hero info
  if (!screens.hero.classList.contains('hidden') && state.currentEntry) {
    renderHeroPreview(state.currentEntry, state.currentHero);
  }
}

function applyUILabels() {
  const labels = UI_LABELS[state.lang] || UI_LABELS['EN'];
  const codeInput = $('code-input');
  if (codeInput) {
    codeInput.placeholder = labels.codePlaceholder;
    $('code-label').textContent = labels.codeLabel;
  }
  const confirmLabel = $('confirm-label');
  if (confirmLabel) confirmLabel.textContent = labels.confirm;
  const cancelLabel = $('cancel-label');
  if (cancelLabel) cancelLabel.textContent = labels.cancel;
  const backLabel = $('back-label');
  if (backLabel) backLabel.textContent = labels.back;
  const actionTitle = $('action-title-label');
  if (actionTitle) actionTitle.textContent = labels.action;
  const imageHint = $('image-hint-label');
  if (imageHint) imageHint.textContent = labels.tapToZoom;
}

// ======================================================
// SCREEN NAVIGATION
// ======================================================
function showScreen(name) {
  Object.entries(screens).forEach(([k, el]) => {
    el.classList.toggle('hidden', k !== name);
    el.classList.toggle('active', k === name);
  });
}

// ======================================================
// HERO PREVIEW
// ======================================================
function renderHeroPreview(entry, hero) {
  const loc = findLocation(entry.LocId);
  const locName = getLocName(loc);

  const heroLocation = $('hero-location');
  const locationNameEl = $('location-name');
  if (locName) {
    heroLocation.style.display = 'flex';
    locationNameEl.textContent = locName;
  } else {
    heroLocation.style.display = 'none';
  }

  const photoName = hero ? hero.Photo : '';
  const heroPhoto = $('hero-photo');
  heroPhoto.src = `images/${photoName}.png`;
  heroPhoto.alt = getHeroName(hero);

  $('hero-name').textContent = getHeroName(hero);
  $('hero-spec').textContent = getHeroSpec(hero);

  const labels = UI_LABELS[state.lang] || UI_LABELS['EN'];
  $('confirm-label').textContent = labels.confirm;
  $('cancel-label').textContent = labels.cancel;
}

// ======================================================
// RESULT VIEW
// ======================================================
function renderResult(entry, hero) {
  const loc = findLocation(entry.LocId);

  // Hero strip
  const photoName = hero ? hero.Photo : '';
  $('result-hero-thumb').src = `images/${photoName}.png`;
  $('result-hero-thumb').alt = getHeroName(hero);
  $('result-hero-name').textContent = getHeroName(hero);

  const locName = getLocName(loc);
  const resultLocName = $('result-location-name');
  resultLocName.textContent = locName;
  resultLocName.parentElement.style.display = locName ? 'flex' : 'none';

  $('result-code-badge').textContent = entry.Code;

  // Text
  const text = getEntryText(entry);
  $('result-text').textContent = text;

  // Action
  const action = getEntryAction(entry);
  const actionCard = $('result-action-card');
  if (action) {
    actionCard.classList.remove('hidden');
    $('result-action').textContent = action;
    const labels = UI_LABELS[state.lang] || UI_LABELS['EN'];
    $('action-title-label').textContent = labels.action;
  } else {
    actionCard.classList.add('hidden');
  }

  // Image
  const imageWrap = $('result-image-wrap');
  const imageEl = $('result-image');
  const imageFile = (entry.Image || '').trim();
  const linkFile = (entry.Link || '').trim();

  if (imageFile) {
    imageWrap.classList.remove('hidden');
    imageEl.src = `images/${imageFile}`;
    const labels = UI_LABELS[state.lang] || UI_LABELS['EN'];
    $('image-hint-label').textContent = linkFile ? labels.tapToZoom : '';

    imageWrap.onclick = linkFile
      ? () => openModal(`images/${linkFile}`)
      : null;
    imageWrap.style.cursor = linkFile ? 'zoom-in' : 'default';
  } else {
    imageWrap.classList.add('hidden');
    imageWrap.onclick = null;
  }
}

// ======================================================
// IMAGE MODAL (zoom)
// ======================================================
let modalScale = 1;
let modalStartDist = 0;
let panStartX = 0, panStartY = 0;
let panOffsetX = 0, panOffsetY = 0;
let isPanning = false;

function openModal(src) {
  const modal = $('image-modal');
  const img = $('modal-img');
  img.src = src;
  modalScale = 1;
  panOffsetX = 0;
  panOffsetY = 0;
  img.style.transform = 'scale(1) translate(0px, 0px)';
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  $('image-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

function applyModalTransform() {
  const img = $('modal-img');
  img.style.transform = `scale(${modalScale}) translate(${panOffsetX / modalScale}px, ${panOffsetY / modalScale}px)`;
}

function bindModal() {
  $('modal-close').addEventListener('click', closeModal);
  $('image-modal').addEventListener('click', e => {
    if (e.target === $('image-modal')) closeModal();
  });

  const wrap = $('modal-img-wrap');
  const img  = $('modal-img');

  // Pinch zoom (touch)
  wrap.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      modalStartDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    } else if (e.touches.length === 1) {
      isPanning = true;
      panStartX = e.touches[0].clientX - panOffsetX;
      panStartY = e.touches[0].clientY - panOffsetY;
    }
    e.preventDefault();
  }, { passive: false });

  wrap.addEventListener('touchmove', e => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = dist / modalStartDist;
      modalScale = Math.min(Math.max(modalScale * ratio, 0.5), 5);
      modalStartDist = dist;
      applyModalTransform();
    } else if (e.touches.length === 1 && isPanning) {
      panOffsetX = e.touches[0].clientX - panStartX;
      panOffsetY = e.touches[0].clientY - panStartY;
      applyModalTransform();
    }
    e.preventDefault();
  }, { passive: false });

  wrap.addEventListener('touchend', () => { isPanning = false; });

  // Mouse wheel zoom
  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.1 : 0.9;
    modalScale = Math.min(Math.max(modalScale * delta, 0.5), 5);
    applyModalTransform();
  }, { passive: false });

  // Double-tap to reset zoom
  let lastTap = 0;
  wrap.addEventListener('click', e => {
    const now = Date.now();
    if (now - lastTap < 300) {
      modalScale = 1;
      panOffsetX = 0;
      panOffsetY = 0;
      applyModalTransform();
    }
    lastTap = now;
  });

  // Mouse drag pan
  let mouseDown = false;
  img.addEventListener('mousedown', e => {
    mouseDown = true;
    isPanning = true;
    panStartX = e.clientX - panOffsetX;
    panStartY = e.clientY - panOffsetY;
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!mouseDown) return;
    panOffsetX = e.clientX - panStartX;
    panOffsetY = e.clientY - panStartY;
    applyModalTransform();
  });
  document.addEventListener('mouseup', () => { mouseDown = false; });

  // ESC key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });
}

// ======================================================
// CODE INPUT HANDLING
// ======================================================
function handleCodeSubmit() {
  const codeInput = $('code-input');
  const rawCode = codeInput.value.trim();
  const errorEl = $('code-error');
  const labels = UI_LABELS[state.lang] || UI_LABELS['EN'];

  if (!rawCode) return;
  if (!state.ready) return;

  const entry = findCode(rawCode);
  if (!entry) {
    errorEl.textContent = labels.notFound;
    errorEl.classList.remove('hidden');
    codeInput.style.borderColor = 'var(--red-light)';
    setTimeout(() => {
      errorEl.classList.add('hidden');
      codeInput.style.borderColor = '';
    }, 3000);
    return;
  }

  errorEl.classList.add('hidden');
  codeInput.style.borderColor = '';

  state.currentCode = rawCode;
  state.currentEntry = entry;
  state.currentHero = findHero(entry.HeroId);

  renderHeroPreview(entry, state.currentHero);
  showScreen('hero');
}

// ======================================================
// BIND LANG BUTTONS (all three screens share same classes)
// ======================================================
function bindAllLangButtons() {
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => setLang(btn.dataset.lang));
  });
}

// ======================================================
// INIT
// ======================================================
async function init() {
  try {
    await initData();

    // Hide loading, show app
    loadingScreen.classList.add('hidden');
    appEl.classList.remove('hidden');

    // Apply initial lang state
    setLang(state.lang);
    updatePenaltyUI();

    // Bind language buttons (all screens)
    bindAllLangButtons();

    // Penalty buttons - screen 1
    bindPenaltyButtons('', 'penalty-add', 'penalty-reset');
    // Penalty buttons - screen 2 (hero preview)
    bindPenaltyButtons('-2', 'penalty-add-2', 'penalty-reset-2');
    // Penalty buttons - screen 3 (result)
    bindPenaltyButtons('-3', 'penalty-add-3', 'penalty-reset-3');

    // Code input: Enter key
    $('code-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') handleCodeSubmit();
    });
    // Code input: auto-uppercase
    $('code-input').addEventListener('input', e => {
      const val = e.target.value.toUpperCase();
      e.target.value = val;
    });

    // Go button
    $('go-btn').addEventListener('click', handleCodeSubmit);

    // Helper to return to input screen and clear state
    const goBackToInput = () => {
      $('code-input').value = '';
      $('code-error').classList.add('hidden');
      state.currentCode = null;
      state.currentEntry = null;
      state.currentHero = null;
      showScreen('input');
      setTimeout(() => $('code-input').focus(), 100);
    };

    // Hero preview — Cancel
    $('cancel-btn').addEventListener('click', goBackToInput);

    // Hero preview — Confirm
    $('confirm-btn').addEventListener('click', () => {
      if (!state.currentEntry) return;
      renderResult(state.currentEntry, state.currentHero);
      showScreen('result');
    });

    // Result screen — Back
    $('back-btn').addEventListener('click', goBackToInput);

    // Image modal
    bindModal();

    // PWA service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {/* offline ok */});
    }

    // Focus code input on load
    setTimeout(() => $('code-input').focus(), 200);

  } catch (err) {
    console.error('Init error:', err);
    loadingScreen.innerHTML = `<div style="color:#e87878;text-align:center;padding:32px;font-family:sans-serif">
      Failed to load game data.<br><small>${err.message}</small>
    </div>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
