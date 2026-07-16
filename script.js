'use strict';

// Единый источник путей ко всем слайдам.
const slidePaths = Array.from({ length: 12 }, (_, index) =>
  `images/slide-${String(index + 1).padStart(2, '0')}.png`
);

// 20 секунд — достаточно для спокойного чтения и изучения деталей слайда.
const SLIDE_DURATION = 20000;
const TRANSITION_DURATION = 700;
const UI_HIDE_DELAY = 3000;

const presentation = document.getElementById('presentation');
const slidesContainer = document.getElementById('slides');
const background = document.getElementById('background');
const counter = document.getElementById('counter');
const progressBar = document.getElementById('progressBar');
const controls = document.getElementById('controls');
const startScreen = document.getElementById('startScreen');
const startButton = document.getElementById('startButton');
const preloadStatus = document.getElementById('preloadStatus');
const errorNotice = document.getElementById('errorNotice');
const previousButton = document.getElementById('previousButton');
const playButton = document.getElementById('playButton');
const playIcon = document.getElementById('playIcon');
const nextButton = document.getElementById('nextButton');
const fullscreenButton = document.getElementById('fullscreenButton');

let currentIndex = 0;
let autoplayTimer = null;
let uiTimer = null;
let transitionTimer = null;
let isPlaying = false;
let hasStarted = false;
let touchStartX = 0;
let touchStartY = 0;
let suppressClickUntil = 0;
let loadedCount = 0;
let failedCount = 0;

// Создаём все DOM-элементы заранее: во время показа браузеру не нужно строить разметку.
const slideElements = slidePaths.map((path, index) => {
  const slide = document.createElement('figure');
  const image = document.createElement('img');
  slide.className = 'slide';
  slide.dataset.index = String(index);
  image.alt = `Слайд ${index + 1} из ${slidePaths.length}`;
  image.draggable = false;
  image.decoding = 'async';
  slide.append(image);
  slidesContainer.append(slide);
  return { slide, image, path, loaded: false };
});

function reportLoadError(path) {
  failedCount += 1;
  errorNotice.hidden = false;
  errorNotice.textContent = `Не удалось загрузить ${failedCount} ${failedCount === 1 ? 'изображение' : 'изображения'}. Проверьте папку images.`;
  console.error(`[Презентация] Ошибка загрузки: ${path}`);
}

// Предварительно декодируем изображения, чтобы исключить белые вспышки.
function preloadSlides() {
  return Promise.allSettled(slideElements.map((item) => new Promise((resolve, reject) => {
    const loader = new Image();
    loader.onload = async () => {
      try { if (loader.decode) await loader.decode(); } catch (_) { /* onload уже подтверждает доступность */ }
      item.image.src = item.path;
      item.loaded = true;
      loadedCount += 1;
      preloadStatus.textContent = `Загружено ${loadedCount} из ${slidePaths.length}`;
      resolve(item.path);
    };
    loader.onerror = () => { reportLoadError(item.path); reject(new Error(item.path)); };
    loader.src = item.path;
  })));
}

function restartImageMotion(index) {
  const image = slideElements[index].image;
  image.style.animation = 'none';
  void image.offsetWidth;
  image.style.animation = '';
}

// Показывает выбранный слайд с направленным переходом.
function showSlide(index, direction = 1, manual = false) {
  const targetIndex = Math.max(0, Math.min(index, slidePaths.length - 1));
  if (targetIndex === currentIndex && slideElements[currentIndex].slide.classList.contains('active')) {
    if (manual) resetAutoplay();
    return;
  }

  window.clearTimeout(transitionTimer);
  const previous = slideElements[currentIndex]?.slide;
  const next = slideElements[targetIndex].slide;

  slideElements.forEach(({ slide }) => slide.classList.remove('from-left', 'leaving-left', 'leaving-right'));
  if (previous?.classList.contains('active')) {
    previous.classList.remove('active');
    previous.classList.add(direction >= 0 ? 'leaving-left' : 'leaving-right');
  }

  next.classList.toggle('from-left', direction < 0);
  void next.offsetWidth;
  next.classList.add('active');
  currentIndex = targetIndex;
  counter.textContent = `${currentIndex + 1} / ${slidePaths.length}`;
  background.style.backgroundImage = `url("${slidePaths[currentIndex]}")`;
  restartImageMotion(currentIndex);
  if (!manual && isPlaying) restartProgress();

  transitionTimer = window.setTimeout(() => {
    slideElements.forEach(({ slide }, i) => {
      if (i !== currentIndex) slide.classList.remove('active', 'from-left', 'leaving-left', 'leaving-right');
    });
  }, TRANSITION_DURATION);

  if (manual) resetAutoplay();
}

function nextSlide(manual = true) {
  const nextIndex = (currentIndex + 1) % slidePaths.length;
  showSlide(nextIndex, 1, manual);
}

function previousSlide(manual = true) {
  const previousIndex = (currentIndex - 1 + slidePaths.length) % slidePaths.length;
  showSlide(previousIndex, -1, manual);
}

function restartProgress() {
  progressBar.classList.remove('running');
  void progressBar.offsetWidth;
  if (isPlaying) progressBar.classList.add('running');
}

function startAutoplay() {
  stopAutoplay(false);
  isPlaying = true;
  playIcon.classList.add('is-pause');
  playButton.setAttribute('aria-label', 'Пауза');
  autoplayTimer = window.setInterval(() => nextSlide(false), SLIDE_DURATION);
  restartProgress();
}

function stopAutoplay(updateProgress = true) {
  window.clearInterval(autoplayTimer);
  autoplayTimer = null;
  isPlaying = false;
  playIcon.classList.remove('is-pause');
  playButton.setAttribute('aria-label', 'Продолжить');
  if (updateProgress) progressBar.classList.remove('running');
}

function resetAutoplay() {
  if (isPlaying) startAutoplay();
  else restartProgress();
}

async function enterFullscreen() {
  if (document.fullscreenElement || !presentation.requestFullscreen) return;
  try { await presentation.requestFullscreen(); }
  catch (error) { console.warn('[Презентация] Полноэкранный режим недоступен:', error.message); }
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await enterFullscreen();
  } catch (error) { console.warn('[Презентация] Ошибка полноэкранного режима:', error.message); }
}

function revealControls() {
  presentation.classList.remove('controls-hidden');
  window.clearTimeout(uiTimer);
  if (hasStarted) uiTimer = window.setTimeout(() => presentation.classList.add('controls-hidden'), UI_HIDE_DELAY);
}

function handleKeydown(event) {
  if (!hasStarted && !['Escape'].includes(event.key)) return;
  if (['ArrowRight', 'ArrowLeft', ' ', 'Home', 'End'].includes(event.key)) event.preventDefault();
  if (event.key === 'ArrowRight' || event.key === ' ') nextSlide();
  else if (event.key === 'ArrowLeft') previousSlide();
  else if (event.key === 'Home') showSlide(0, -1, true);
  else if (event.key === 'End') showSlide(slidePaths.length - 1, 1, true);
  // Escape обрабатывается браузером: он штатно выходит из fullscreen.
  revealControls();
}

function isControlTarget(target) {
  return target instanceof Element && Boolean(target.closest('button, .controls, .start-screen, .error-notice'));
}

presentation.addEventListener('click', (event) => {
  if (!hasStarted || isControlTarget(event.target) || performance.now() < suppressClickUntil) return;
  if (event.clientX >= window.innerWidth / 2) nextSlide();
  else previousSlide();
});

presentation.addEventListener('pointermove', revealControls);
presentation.addEventListener('touchstart', (event) => {
  const touch = event.changedTouches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
  revealControls();
}, { passive: true });

presentation.addEventListener('touchend', (event) => {
  if (!hasStarted || isControlTarget(event.target)) return;
  const touch = event.changedTouches[0];
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;
  if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.25) {
    // Некоторые мобильные браузеры генерируют click сразу после touchend.
    suppressClickUntil = performance.now() + 500;
    if (dx < 0) nextSlide(); else previousSlide();
  }
}, { passive: true });

previousButton.addEventListener('click', () => previousSlide());
nextButton.addEventListener('click', () => nextSlide());
playButton.addEventListener('click', () => isPlaying ? stopAutoplay() : startAutoplay());
fullscreenButton.addEventListener('click', toggleFullscreen);
document.addEventListener('keydown', handleKeydown);
document.addEventListener('fullscreenchange', () => {
  fullscreenButton.setAttribute('aria-label', document.fullscreenElement ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим');
  revealControls();
});

startButton.addEventListener('click', async () => {
  hasStarted = true;
  startScreen.classList.add('hidden');
  await enterFullscreen();
  showSlide(0, 1, false);
  startAutoplay();
  revealControls();
});

// Первый слайд виден под стартовым экраном ещё до запуска.
preloadSlides().then(() => {
  if (loadedCount > 0) {
    showSlide(0, 1, false);
    startButton.disabled = false;
    preloadStatus.textContent = failedCount ? `Готово. Не загружено: ${failedCount}` : 'Все 12 слайдов готовы';
  } else {
    preloadStatus.textContent = 'Слайды не найдены';
  }
});
