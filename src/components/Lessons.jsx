import { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import Board from './Board.jsx';
import CoachPanel from './CoachPanel.jsx';
import { STAGES, lessonsForStage } from '../lessons.js';

function PuzzleBoard({ puzzle, onSolved }) {
  const [game, setGame] = useState(() => new Chess(puzzle.fen));
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const legal = useMemo(() => new Chess(puzzle.fen).moves({ verbose: true }), [puzzle]);

  function onMove({ from, to, promotion }) {
    if (done) return;
    const attempt = legal.find((m) => m.from === from && m.to === to && (m.promotion || undefined) === promotion);
    const san = attempt?.san;
    if (san && puzzle.accept.includes(san)) {
      const g = new Chess(game.fen());
      g.move({ from, to, promotion });
      setGame(g);
      setDone(true);
      onSolved?.();
    } else {
      setFailed(true);
      setTimeout(() => setFailed(false), 900);
    }
  }

  return (
    <div className={`puzzle ${failed ? 'shake' : ''}`}>
      <div className="puzzle-board"><Board fen={game.fen()} onMove={onMove} viewOnly={done} /></div>
      <div className="puzzle-side">
        <p className="prompt">{puzzle.prompt}</p>
        {done ? <p className="solved">Correct — {puzzle.accept[0]}. Well spotted.</p> : (
          <div className="puzzle-actions">
            <button onClick={() => setShowHint(true)}>Hint</button>
            {showHint && <p className="hint">{puzzle.hint}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function LessonView({ lesson, onBack }) {
  const [solved, setSolved] = useState(0);
  const coachGame = useMemo(() => {
    const g = new Chess(lesson.demoFen || lesson.puzzles[0]?.fen || 'start');
    g.stageTitle = lesson.title;
    g.difficultyLabel = 'Lesson mode';
    g.humanColor = 'w';
    return g;
  }, [lesson]);

  return (
    <div className="lesson-view">
      <button className="link" onClick={onBack}>← All lessons</button>
      <h2>{lesson.title}</h2>
      {lesson.intro.split('\n\n').map((p, i) => <p key={i} className="lesson-text">{p}</p>)}
      {lesson.demoFen && (
        <div className="demo">
          <Board fen={lesson.demoFen} viewOnly />
          {lesson.demoNote && <p className="demo-note">{lesson.demoNote}</p>}
        </div>
      )}
      {lesson.puzzles.length > 0 && <h3>Your turn — {solved}/{lesson.puzzles.length} solved</h3>}
      {lesson.puzzles.map((p, i) => (
        <PuzzleBoard key={i} puzzle={p} onSolved={() => setSolved((s) => s + 1)} />
      ))}
      <div className="coach-embed">
        <CoachPanel game={coachGame} />
      </div>
    </div>
  );
}

export default function Lessons() {
  const [stage, setStage] = useState(STAGES[0].id);
  const [lesson, setLesson] = useState(null);

  if (lesson) return <LessonView lesson={lesson} onBack={() => setLesson(null)} />;

  const lessons = lessonsForStage(stage);
  return (
    <div className="lessons">
      <div className="stage-tabs">
        {STAGES.map((s) => (
          <button key={s.id} className={s.id === stage ? 'active' : ''} onClick={() => setStage(s.id)}>
            <span className="stage-num">{s.num}</span>
            <span>{s.title.split('—')[1]?.trim() || s.title}</span>
          </button>
        ))}
      </div>
      <p className="stage-blurb">{STAGES.find((s) => s.id === stage).blurb}</p>
      <div className="lesson-list">
        {lessons.map((l, i) => (
          <button key={l.id} className="lesson-card panel" onClick={() => setLesson(l)}>
            <span className="lesson-idx">{String(i + 1).padStart(2, '0')}</span>
            <span className="lesson-title">{l.title}</span>
            <span className="lesson-meta">{l.puzzles.length} puzzle{l.puzzles.length === 1 ? '' : 's'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
