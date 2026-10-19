import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Menu, Pause, Play, RotateCcw, X } from 'lucide-react';

const chapters = [
  {
    number: '01',
    title: 'A light gathers',
    subtitle: 'The birth of Shakti',
    image: '/assets/story/chapter-01.webp',
    alt: 'Maa Durga among the gathered devas, radiant against a mountain sky',
    copy: 'In the account celebrated across many traditions, the devas joined their divine energies when Mahishasura’s power could not be checked by any one of them. From that gathered light arose Durga: sovereign, composed, and carrying the gifts of the gods.',
    note: 'Each hand bears a gift, each gift a promise: courage is never a solitary strength.',
  },
  {
    number: '02',
    title: 'The long becoming',
    subtitle: 'Nine nights of resolve',
    image: '/assets/story/chapter-02.webp',
    alt: 'Durga and her lion meet the buffalo demon beneath a deep indigo sky',
    copy: 'For nine nights, Durga met the asura’s changing forms without yielding. Navaratri remembers this sacred span in many ways: through prayer, fasting, dance, music, and the daily honoring of the goddess in her many forms.',
    note: 'Nine nights are not simply a countdown. They are a practice of returning to what is true.',
  },
  {
    number: '03',
    title: 'The turning of dawn',
    subtitle: 'Mahishasura is overcome',
    image: '/assets/story/chapter-03.webp',
    alt: 'Durga and her lion at sunrise, with the first light falling across the hills',
    copy: 'At the end of the struggle, Durga overcame Mahishasura. The victory is a reminder that arrogance and harm are not invincible. Vijayadashami, the tenth day, carries that sense of a turning: the beginning of a clearer path.',
    note: 'This is the Durga–Mahishasura story. Dussehra also holds another beloved victory tradition.',
  },
  {
    number: '04',
    title: 'A victory, many homes',
    subtitle: 'Vijayadashami across India',
    image: '/assets/story/chapter-04.webp',
    alt: 'Families gathered for worship before Maa Durga in a warmly lit shrine',
    copy: 'In eastern India, Vijayadashami closes Durga Puja, with farewell rituals and immersion of the image. In many northern and western communities, Dussehra also marks Rama’s victory over Ravana, often with Ramlila and effigy-burning. Mysuru honours the day with a royal procession; elsewhere, people begin new work or exchange leaves as tokens of goodwill.',
    note: 'No single custom speaks for everyone. Each region carries the day in its own beautiful way.',
  },
];

function Drawing() {
  const holder = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'drawing' | 'drawn' | 'error'>('loading');
  const [replayKey, setReplayKey] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const pausedRef = useRef(false);
  const pausedAtRef = useRef<number | null>(null);
  const pausedDurationRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let frameId = 0;
    const controller = new AbortController();
    pausedRef.current = false;
    pausedAtRef.current = null;
    pausedDurationRef.current = 0;
    setProgress(0);

    fetch('/assets/durga-line-art.svg', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Artwork unavailable');
        return res.text();
      })
      .then((source) => {
        if (cancelled || !holder.current) return;
        const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
        if (parsed.querySelector('parsererror')) throw new Error('Artwork could not be parsed');
        const svg = parsed.documentElement as unknown as SVGSVGElement;
        svg.removeAttribute('id');
        svg.classList.add('draw-art');
        svg.setAttribute('aria-hidden', 'true');
        const embedded = document.importNode(svg, true) as SVGSVGElement;
        holder.current.replaceChildren(embedded);
        const paths = Array.from(embedded.querySelectorAll<SVGPathElement>('.trace'));
        if (!paths.length) throw new Error('No drawing strokes were found');

        const strokes = paths.map((path) => {
          const length = Math.max(1, path.getTotalLength());
          const fill = getComputedStyle(path).fill;
          path.style.animation = 'none';
          path.style.stroke = '#8b4d2d';
          path.style.strokeWidth = '1.1';
          path.style.strokeLinecap = 'round';
          path.style.strokeLinejoin = 'round';
          path.style.strokeDasharray = `${length} ${length}`;
          path.style.strokeDashoffset = `${length}`;
          path.style.fillOpacity = '0';
          return { path, length, fill };
        });

        const pencil = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        pencil.setAttribute('class', 'draw-pencil');
        pencil.setAttribute('aria-hidden', 'true');
        pencil.style.opacity = '0';
        const pencilHalo = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        pencilHalo.setAttribute('r', '5.5');
        pencilHalo.setAttribute('fill', '#fff8e8');
        pencilHalo.setAttribute('stroke', '#9b3d30');
        pencilHalo.setAttribute('stroke-width', '1.5');
        const pencilPoint = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        pencilPoint.setAttribute('r', '1.6');
        pencilPoint.setAttribute('fill', '#9b3d30');
        pencil.append(pencilHalo, pencilPoint);
        embedded.appendChild(pencil);

        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced) {
          strokes.forEach(({ path, fill }) => {
            path.style.strokeDashoffset = '0';
            path.style.fillOpacity = fill === 'none' ? '0' : '1';
          });
          setState('drawn');
          setProgress(100);
        } else {
          embedded.classList.add('is-drawing');
          setState('drawing');
          const totalLength = strokes.reduce((sum, stroke) => sum + stroke.length, 0);
          const durations = strokes.map(({ length }) => Math.max(28, 16000 * length / totalLength));
          const starts: number[] = [];
          let totalDuration = 0;
          durations.forEach((duration) => {
            starts.push(totalDuration);
            totalDuration += duration;
          });
          const startedAt = performance.now();
          let lastReportedProgress = 0;

          const drawNextStroke = (now: number) => {
            if (cancelled) return;
            if (pausedRef.current) {
              frameId = requestAnimationFrame(drawNextStroke);
              return;
            }
            const elapsed = Math.max(0, now - startedAt - pausedDurationRef.current);
            let currentIndex = durations.findIndex((duration, index) => elapsed < starts[index] + duration);
            if (currentIndex < 0) currentIndex = strokes.length;

            for (let index = 0; index < strokes.length; index += 1) {
              const stroke = strokes[index];
              if (index < currentIndex) {
                stroke.path.style.strokeDashoffset = '0';
                stroke.path.style.fillOpacity = stroke.fill === 'none' ? '0' : '1';
              } else if (index === currentIndex) {
                const localProgress = Math.min(1, Math.max(0, (elapsed - starts[index]) / durations[index]));
                stroke.path.style.strokeDashoffset = `${stroke.length * (1 - localProgress)}`;
                const point = stroke.path.getPointAtLength(stroke.length * localProgress);
                pencil.setAttribute('transform', `translate(${point.x} ${point.y})`);
                pencil.style.opacity = '1';
              } else {
                stroke.path.style.strokeDashoffset = `${stroke.length}`;
                stroke.path.style.fillOpacity = '0';
              }
            }

            const nextProgress = Math.min(100, Math.floor((elapsed / totalDuration) * 100));
            if (nextProgress !== lastReportedProgress) {
              lastReportedProgress = nextProgress;
              setProgress(nextProgress);
            }

            if (elapsed < totalDuration) {
              frameId = requestAnimationFrame(drawNextStroke);
            } else {
              pencil.style.opacity = '0';
              embedded.classList.remove('is-drawing');
              embedded.classList.add('is-drawn');
              setProgress(100);
              setState('drawn');
            }
          };
          frameId = requestAnimationFrame(drawNextStroke);
        }
      })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => {
      cancelled = true;
      controller.abort();
      cancelAnimationFrame(frameId);
    };
  }, [replayKey]);

  const replay = () => {
    pausedRef.current = false;
    setState('loading');
    setPaused(false);
    setReplayKey((key) => key + 1);
  };

  const togglePause = () => {
    if (state !== 'drawing') return;
    const next = !pausedRef.current;
    if (next) {
      pausedAtRef.current = performance.now();
    } else if (pausedAtRef.current !== null) {
      pausedDurationRef.current += performance.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
    pausedRef.current = next;
    setPaused(next);
  };

  return (
    <div className="draw-frame">
      <div className="draw-frame__aura" aria-hidden="true" />
      <div className="draw-frame__mandala" aria-hidden="true" />
      <div className="draw-frame__art" ref={holder} aria-label="Maa Durga and her lion being drawn stroke by stroke" role="img" />
      {state === 'loading' && <div className="draw-loading" aria-live="polite">Preparing the drawing…</div>}
      {state === 'error' && <div className="draw-loading" role="status">The artwork could not be loaded. <button onClick={replay}>Try again</button></div>}
      <div className="draw-controls">
        <button type="button" onClick={replay} className="icon-control" aria-label="Replay the drawing" data-testid="button-replay-drawing" title="Replay drawing"><RotateCcw size={17} /></button>
        {state === 'drawing' && <button type="button" onClick={togglePause} className="icon-control" aria-label={paused ? 'Resume drawing' : 'Pause drawing'} data-testid="button-pause-drawing" title={paused ? 'Resume drawing' : 'Pause drawing'}>{paused ? <Play size={16} /> : <Pause size={16} />}</button>}
      </div>
    </div>
  );
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState(0);

  const goTo = (id: string) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <main className="page-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Maa Durga, a Dussehra story">
          <span className="brand__mark">श्री</span>
          <span><b>Maa Durga</b><small>A Dussehra story</small></span>
        </a>
        <nav className={`site-nav ${menuOpen ? 'site-nav--open' : ''}`} aria-label="Main navigation">
          <button onClick={() => goTo('story')}>The story</button>
          <button onClick={() => goTo('traditions')}>Many traditions</button>
          <button onClick={() => goTo('closing')}>A blessing</button>
        </nav>
        <button className="menu-toggle" aria-label={menuOpen ? 'Close menu' : 'Open menu'} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
      </header>

      <section className="hero grain" id="top">
        <div className="hero__wash" />
        <div className="hero__content reveal">
          <p className="eyebrow hero__eyebrow"><span /> Navaratri · Vijayadashami <span /></p>
          <h1 className="serif">When courage<br /><i>takes form.</i></h1>
          <p className="hero__intro">A story of Maa Durga, the strength that gathers in the face of harm, and a festival held in many hearts, many ways.</p>
          <button className="story-link" onClick={() => goTo('story')} data-testid="button-begin-story"><span>Enter the story</span><ArrowDown size={16} /></button>
          <p className="hero__sanskrit">या देवी सर्वभूतेषु शक्तिरूपेण संस्थिता</p>
        </div>
        <div className="hero__art">
          <Drawing />
        </div>
        <div className="hero__vertical" aria-hidden="true">A STORY OF SHAKTI</div>
        <div className="hero__foot"><span>Scroll to unfold</span><span className="hero__line" /></div>
      </section>

      <section className="invocation" id="story">
        <div className="invocation__rule" />
        <p className="eyebrow">A tale remembered in the season of Navaratri</p>
        <h2 className="serif">Before the victory,<br />there was <i>becoming.</i></h2>
        <p>Across nine nights, the story of Durga and Mahishasura asks us to look closely at the nature of strength: not domination, but the clarity to stand against what causes harm.</p>
        <span className="invocation__ornament" aria-hidden="true" />
      </section>

      <section className="chapters" aria-label="The story of Maa Durga">
        <div className="chapters__rail" aria-label="Story chapters">
          {chapters.map((chapter, index) => (
            <button key={chapter.number} className={`rail-step ${active === index ? 'rail-step--active' : ''}`} onClick={() => { setActive(index); goTo(`chapter-${chapter.number}`); }} aria-label={`Go to chapter ${chapter.number}: ${chapter.title}`} data-testid={`button-chapter-${chapter.number}`}>
              <span>{chapter.number}</span><i />
            </button>
          ))}
        </div>
        {chapters.map((chapter, index) => (
          <article className={`chapter chapter--${index + 1}`} id={`chapter-${chapter.number}`} key={chapter.number} onMouseEnter={() => setActive(index)}>
            <div className="chapter__image-wrap">
              <img src={chapter.image} alt={chapter.alt} className="chapter__image" loading="eager" />
              <div className="chapter__image-shade" />
              <span className="chapter__image-index">{chapter.number} <i>—</i> THE STORY</span>
              {index === 2 && <span className="chapter__sun" aria-hidden="true" />}
            </div>
            <div className="chapter__copy">
              <p className="eyebrow"><span className="chapter__number">{chapter.number}</span> {chapter.subtitle}</p>
              <h2 className="serif">{chapter.title.split(' ').slice(0, -1).join(' ')} <i>{chapter.title.split(' ').slice(-1)}</i></h2>
              <p className="chapter__body">{chapter.copy}</p>
              <blockquote className="chapter__note"><span>“</span>{chapter.note}</blockquote>
              {index === 2 && <button className="inline-link" onClick={() => goTo('traditions')}>Explore the traditions <ArrowRight size={15} /></button>}
            </div>
          </article>
        ))}
      </section>

      <section className="traditions" id="traditions">
        <div className="traditions__heading">
          <p className="eyebrow">One day, many ways of remembering</p>
          <h2 className="serif">A festival <i>in plural.</i></h2>
          <p>Vijayadashami arrives at the end of Navaratri, but its meaning is carried through distinct stories and local customs. They can sit beside one another without becoming the same story.</p>
        </div>
        <div className="tradition-grid">
          <div className="tradition-card tradition-card--durga">
            <span className="tradition-card__number">I</span>
            <p className="eyebrow">The eastern tradition</p>
            <h3 className="serif">Durga Puja<br /><i>and her return</i></h3>
            <p>In Bengal and many eastern communities, the final day brings farewell to Durga after days of worship, gathering, and celebration. Immersion rituals express both departure and the promise of her return.</p>
            <span className="tradition-card__foot">DURGA · MAHISHASURA · VIJAYADASHAMI</span>
          </div>
          <div className="tradition-card tradition-card--rama">
            <span className="tradition-card__number">II</span>
            <p className="eyebrow">The Ramayana tradition</p>
            <h3 className="serif">Rama’s return<br /><i>to victory</i></h3>
            <p>In many northern and western communities, Dussehra recalls Rama’s victory over Ravana. Ramlila performances retell the Ramayana, and in some places effigies are burned. This is a separate epic tradition, celebrated on the same auspicious day.</p>
            <span className="tradition-card__foot">RAMA · RAVANA · DUSSEHRA</span>
          </div>
        </div>
        <div className="traditions__aside"><span>ALSO CELEBRATED</span><p>In Mysuru, a royal procession marks the day. In parts of western India, the festival unfolds through Garba and Dandiya Raas. Across regions, people may begin new work, share food, or exchange leaves as a wish for prosperity.</p></div>
      </section>

      <section className="closing" id="closing">
        <div className="closing__image">
          <img src="/assets/story/chapter-04.webp" alt="Devotees offering prayers to Maa Durga together" loading="eager" />
          <div className="closing__image-overlay" />
          <p className="closing__image-caption">A light kept, a story carried forward.</p>
        </div>
        <div className="closing__content">
          <span className="closing__ornament">ॐ</span>
          <p className="eyebrow">May the light within you grow</p>
          <h2 className="serif">May courage<br />find <i>its way home.</i></h2>
          <p>May this Vijayadashami bring you clarity in difficult moments, tenderness in times of change, and the company of those who make you feel held.</p>
          <button className="closing__back" onClick={() => goTo('top')}><RotateCcw size={14} /> Return to the beginning</button>
        </div>
      </section>
      <footer className="site-footer">
        <a className="brand brand--footer" href="#top"><span className="brand__mark">श्री</span><span><b>Maa Durga</b><small>A Dussehra story</small></span></a>
        <p>With reverence for the many ways this story is told.</p>
        <span className="footer__date">NAVARATRI · VIJAYADASHAMI</span>
      </footer>
      <a className="skip-link" href="#story">Skip to story</a>
    </main>
  );
}

export default App;
