document.querySelectorAll('.case-gallery').forEach((gallery) => {
  const track = gallery.querySelector('.case-gallery-track');
  const photos = [...track.querySelectorAll('img')];
  const prev = gallery.querySelector('.case-gallery-prev');
  const next = gallery.querySelector('.case-gallery-next');
  const dots = gallery.querySelector('.case-gallery-dots');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let stops = [];
  let active = 0;
  let target = null;

  function update() {
    active = stops.reduce((closest, stop, i) =>
      Math.abs(stop - track.scrollLeft) < Math.abs(stops[closest] - track.scrollLeft) ? i : closest, 0);
    if (target !== null && Math.abs(stops[target] - track.scrollLeft) <= 1) target = null;
    prev.setAttribute('aria-disabled', active === 0);
    next.setAttribute('aria-disabled', active >= stops.length - 1);
    photos.forEach((photo, i) => photo.classList.toggle('is-selected', i === active));
    [...dots.children].forEach((dot, i) => {
      if (i === active) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
  }

  function move(index) {
    if (index < 0 || index >= stops.length) return;
    target = index;
    track.scrollTo({ left: stops[index], behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  }

  function measure() {
    const selected = target ?? active;
    target = null;
    const centered = photos.length > 1;
    track.classList.toggle('has-centered-slides', centered);
    const first = photos[0].getBoundingClientRect();
    const last = photos[photos.length - 1].getBoundingClientRect();
    track.style.setProperty('--edge-space-start', `${(track.clientWidth - first.width) / 2}px`);
    track.style.setProperty('--edge-space-end', `${(track.clientWidth - last.width) / 2}px`);
    const end = Math.max(0, track.scrollWidth - track.clientWidth);
    const origin = track.getBoundingClientRect().left - track.scrollLeft;
    stops = centered ? photos.map((photo) => {
      const rect = photo.getBoundingClientRect();
      return Math.max(0, Math.min(end, rect.left - origin + (rect.width - track.clientWidth) / 2));
    }) : [0];
    prev.hidden = next.hidden = dots.hidden = stops.length < 2;
    if (dots.childElementCount !== (dots.hidden ? 0 : stops.length)) {
      dots.replaceChildren();
      if (!dots.hidden) stops.forEach((_, i) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'case-gallery-dot';
        dot.setAttribute('aria-label', `사진 위치 ${i + 1} / ${stops.length}`);
        dot.addEventListener('click', () => move(i));
        dots.append(dot);
      });
    }
    if (track.clientWidth) {
      track.scrollTo({ left: stops[selected], behavior: 'instant' });
    }
    update();
  }

  if (!photos.length) return;
  gallery.classList.add('is-ready');
  prev.addEventListener('click', () => move((target ?? active) - 1));
  next.addEventListener('click', () => move((target ?? active) + 1));
  track.addEventListener('scrollend', () => { target = null; update(); });
  track.addEventListener('pointerdown', () => { target = null; });
  track.addEventListener('scroll', update, { passive: true });
  track.addEventListener('keydown', (event) => {
    if (stops.length < 2) return;
    const current = target ?? active;
    const index = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: stops.length - 1 }[event.key];
    if (index === undefined) return;
    event.preventDefault();
    move(index);
  });
  const resizeObserver = new ResizeObserver(measure);
  resizeObserver.observe(track);
  photos.forEach((photo) => resizeObserver.observe(photo));
  measure();
});
