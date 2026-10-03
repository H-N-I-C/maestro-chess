import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import Board from './Board.jsx';
import CoachPanel from './CoachPanel.jsx';
import { STAGES, LESSONS, lessonsForStage, localizeLesson, localizeStage } from '../lessons.js';
import { useT, useLang } from '../i18n.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const PROGRESS_KEY = 'maestro-lesson-progress';

function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(PROGRESS_KEY));
    if (p && typeof p === 'object') {
      return {
        solved: Array.isArray(p.solved) ? p.solved : [],
        stage: typeof p.stage === 'string' ? p.stage : null,
        lesson: typeof p.lesson === 'string' ? p.lesson : null,
      };
    }
  } catch { /* ignore */ }
  return { solved: [], stage: null, lesson: null };
}

function saveProgress(patch) {
  try {
    const cur = loadProgress();
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ ...cur, ...patch }));
  } catch { /* ignore */ }
}

function PuzzleBoard({ puzzle, solved, onSolved }) {
  const t = useT();
  const [game, setGame] = useState(() => new Chess(puzzle.fen));
  const [done, setDone] = useState(solved);
  const [step, setStep] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const solution = Array.isArray(puzzle.solution) ? puzzle.solution : null;

  function onMove({ from, to, promotion }) {
    if (done || animating) return;
    const legalNow = game.moves({ verbose: true });
    const attempt = legalNow.find((m) => m.from === from && m.to === to && (m.promotion || undefined) === promotion);
    const san = attempt?.san;
    const expected = solution ? solution[step] : null;
    const ok = expected ? san === expected : Boolean(san && puzzle.accept.includes(san));
    if (!ok) {
      setFailed(true);
      setTimeout(() => setFailed(false), 900);
      return;
    }
    const g = new Chess(game.fen());
    g.move({ from, to, promotion });
    setGame(g);
    if (solution && step + 1 < solution.length) {
      // correct — the opponent's reply is played automatically
      setAnimating(true);
      setTimeout(() => {
        const g2 = new Chess(g.fen());
        try { g2.move(solution[step + 1]); } catch { /* data bug: stop the line */ }
        setGame(g2);
        setStep(step + 2);
        setAnimating(false);
      }, 400);
    } else {
      setDone(true);
      onSolved?.();
    }
  }

  const answerText = solution ? solution.join(' ') : puzzle.accept[0];

  return (
    <div className={`puzzle ${failed ? 'shake' : ''}`}>
      <div className="puzzle-board"><Board fen={game.fen()} onMove={onMove} viewOnly={done || animating} /></div>
      <div className="puzzle-side">
        <p className="prompt">{puzzle.prompt}</p>
        {done ? <p className="solved">{t('lessons.correct', { answer: answerText })}</p> : (
          <div className="puzzle-actions">
            <button onClick={() => setShowHint(true)}>{t('lessons.hint')}</button>
            {showHint && <p className="hint">{puzzle.hint}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

/** Playable demo board: move both sides freely, reset restores the starting fen. */
function TryBoard({ fen }) {
  const t = useT();
  const [game, setGame] = useState(() => new Chess(fen));
  useEffect(() => { setGame(new Chess(fen)); }, [fen]);

  function onMove({ from, to, promotion }) {
    const g = new Chess(game.fen());
    try {
      g.move({ from, to, promotion });
      setGame(g);
    } catch { /* illegal — ignore */ }
  }

  return (
    <div className="demo try-board">
      <Board fen={game.fen()} onMove={onMove} />
      <div className="try-board-bar">
        <button onClick={() => setGame(new Chess(fen))}>{t('lessons.resetPosition')}</button>
      </div>
    </div>
  );
}

function LessonView({ lesson: baseLesson, onBack }) {
  const t = useT();
  const lang = useLang();
  const lesson = useMemo(() => localizeLesson(baseLesson, lang), [baseLesson, lang]);
  const [solvedIds, setSolvedIds] = useState(() => loadProgress().solved);
  const coachGame = useMemo(() => {
    const g = new Chess(lesson.demoFen || lesson.puzzles[0]?.fen || START_FEN);
    g.stageTitle = lesson.title;
    g.difficultyLabel = 'Lesson mode';
    g.humanColor = 'w';
    return g;
  }, [lesson]);

  useEffect(() => {
    saveProgress({ lesson: lesson.id });
  }, [lesson.id]);

  const solvedCount = lesson.puzzles.filter((_, i) => solvedIds.includes(`${lesson.id}:${i}`)).length;

  function markSolved(i) {
    const id = `${lesson.id}:${i}`;
    setSolvedIds((ids) => {
      if (ids.includes(id)) return ids;
      const next = [...ids, id];
      saveProgress({ solved: next });
      return next;
    });
  }

  return (
    <div className="lesson-view">
      <button className="link" onClick={onBack}>← {t('lessons.allLessons')}</button>
      <h2>{lesson.title}</h2>
      {lesson.intro.split('\n\n').map((p, i) => <p key={i} className="lesson-text">{p}</p>)}
      {lesson.tryFen ? (
        <TryBoard fen={lesson.tryFen} />
      ) : lesson.demoFen && (
        <div className="demo">
          <Board fen={lesson.demoFen} viewOnly />
          {lesson.demoNote && <p className="demo-note">{lesson.demoNote}</p>}
        </div>
      )}
      {lesson.tryFen && lesson.demoNote && <p className="demo-note">{lesson.demoNote}</p>}
      {lesson.puzzles.length > 0 && <h3>{t('lessons.yourTurn', { solved: solvedCount, total: lesson.puzzles.length })}</h3>}
      {lesson.puzzles.map((p, i) => (
        <PuzzleBoard key={i} puzzle={p} solved={solvedIds.includes(`${lesson.id}:${i}`)} onSolved={() => markSolved(i)} />
      ))}
      <div className="coach-embed">
        <CoachPanel game={coachGame} />
      </div>
    </div>
  );
}

export default function Lessons() {
  const t = useT();
  const lang = useLang();
  const initial = useMemo(loadProgress, []);
  const [stage, setStage] = useState(() => (STAGES.some((s) => s.id === initial.stage) ? initial.stage : STAGES[0].id));
  const [lesson, setLesson] = useState(() => LESSONS.find((l) => l.id === initial.lesson) || null);

  useEffect(() => { saveProgress({ stage }); }, [stage]);

  if (lesson) {
    return (
      <LessonView
        lesson={lesson}
        onBack={() => { saveProgress({ lesson: null }); setLesson(null); }}
      />
    );
  }

  const lessons = lessonsForStage(stage);
  const solvedAll = loadProgress().solved;
  return (
    <div className="lessons">
      <div className="stage-tabs">
        {STAGES.map((st) => localizeStage(st, lang)).map((s) => (
          <button key={s.id} className={s.id === stage ? 'active' : ''} onClick={() => setStage(s.id)}>
            <span className="stage-num">{s.num}</span>
            <span>{s.title.split('—')[1]?.trim() || s.title}</span>
          </button>
        ))}
      </div>
      <p className="stage-blurb">{localizeStage(STAGES.find((s) => s.id === stage), lang).blurb}</p>
      <div className="lesson-list">
        {lessons.map((l, i) => {
          const solvedCount = l.puzzles.filter((_, pi) => solvedAll.includes(`${l.id}:${pi}`)).length;
          return (
            <button key={l.id} className="lesson-card panel" onClick={() => setLesson(l)}>
              <span className="lesson-idx">{String(i + 1).padStart(2, '0')}</span>
              <span className="lesson-title">{localizeLesson(l, lang).title}</span>
              <span className="lesson-meta">
                {t('lessons.puzzleCount', { count: l.puzzles.length })}
                {solvedCount > 0 && l.puzzles.length > 0 && ` · ${t('lessons.solvedCount', { count: solvedCount })}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
