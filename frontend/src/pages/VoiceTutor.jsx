import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import "./voice-tutor.css";

/**
 * Voice lesson ("study call"), lecture style: no camera, a whiteboard the
 * tutor writes on. The tutor teaches one part of the plan without stopping,
 * then asks "any doubts, or shall I go ahead?". The next part is fetched in
 * the background while you listen, so "go ahead" plays with no wait.
 * "I didn't get it" re-explains the part a different way.
 *
 * Speech in:  browser SpeechRecognition (Chrome / Edge). Typing always works.
 * Speech out: browser speechSynthesis (free, no API key).
 * Brain:      POST /tutor/lesson/start, /:id/part (prefetch + advance), /:id/turn (doubts)
 *
 * Works from a note (/note/:id/call, the note is a reference) or on any
 * study topic (/call). Non-study topics are declined by the backend.
 * The backend is woken when the page opens, so joining connects faster.
 * The tutor only speaks once its real first turn has arrived.
 */

const APPROACH_ROWS = [
  { key: "definition", label: "Definition" },
  { key: "analogy", label: "Analogy" },
  { key: "worked_example", label: "Worked example" },
  { key: "direct", label: "Direct answer" },
];
const FILLERS = ["Hmm, let me think about that.", "Okay, one second.", "Good, give me a moment."];
const LINE_STYLE = {
  title: { fontSize: "clamp(30px, 3.4vw, 44px)", color: "var(--accent-primary)" },
  normal: { fontSize: "clamp(24px, 2.6vw, 34px)", color: "#0F172A" },
  wrong: { fontSize: "clamp(24px, 2.6vw, 34px)", color: "#DC2626" },
  right: { fontSize: "clamp(24px, 2.6vw, 34px)", color: "#16A34A" },
};

// "go ahead" style replies are handled here with no AI call. Anything that looks
// like a doubt goes to the backend, which can still answer "continue".
const NEGATIVE = /\b(not|didn'?t|don'?t|doesn'?t|wasn'?t|what|why|how|which|explain|again|confus\w*|lost|stuck|repeat|kya|kyun|kyu|kaise|matlab|samjh\w* nahi|nahi samjh\w*|samajh nahi|nahi aaya)\b|\?/i;
const POSITIVE = /\b(go ahead|go on|ahead|continue|next|move on|proceed|carry on|keep going|yes|yeah|yep|yup|ok|okay|okey|sure|got it|understood|clear|fine|cool|alright|no doubts?|nope|no|nothing|haan|han|ha|ji|theek|thik|aage|chalo|samajh gaya|samajh gayi|done|wrap up|finish)\b/i;
const normalise = (t) => (t || "").toLowerCase().replace(/[^\p{L}\p{N}\s'?]/gu, " ").replace(/\s+/g, " ").trim();
const isGoAhead = (text) => {
  const t = normalise(text);
  return !!t && t.split(" ").length <= 8 && !NEGATIVE.test(t) && POSITIVE.test(t);
};

const getSR = () => (typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null);

function pickVoice() {
  const synth = window.speechSynthesis;
  if (!synth) return null;
  const voices = synth.getVoices() || [];
  return (
    voices.find((v) => /en[-_]IN/i.test(v.lang) && /female|natural|neural/i.test(v.name)) ||
    voices.find((v) => /en[-_]IN/i.test(v.lang)) ||
    voices.find((v) => /en[-_](GB|US)/i.test(v.lang) && /natural|neural|google/i.test(v.name)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    null
  );
}

function Tile({ name, initial, big, talking, me }) {
  const size = big ? 132 : 56;
  return (
    <div
      className={`${talking ? "vt-talking" : ""} ${me ? "vt-me" : ""}`}
      style={{
        position: "relative",
        background: "var(--vt-tile)",
        border: "1px solid var(--vt-line)",
        borderRadius: big ? 20 : 16,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        height: big ? "100%" : 120,
        minHeight: big ? 280 : 120,
      }}
    >
      <div className="vt-ringwrap">
        <span className="vt-r" />
        <span className="vt-r vt-r2" />
        <span
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            background: me ? "#22304D" : "var(--accent-primary)",
            color: "#fff",
            fontSize: big ? 52 : 22,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {initial}
        </span>
      </div>
      {big && <span style={{ fontSize: 12, color: "var(--vt-dim)" }}>camera off</span>}
      <span
        style={{
          position: "absolute",
          left: 12,
          bottom: 10,
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: 12.5,
          fontWeight: 600,
          background: "rgba(5,9,18,.6)",
          borderRadius: 8,
          padding: "4px 9px",
        }}
      >
        {name}
        <span className="vt-bars" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </span>
    </div>
  );
}

export default function VoiceTutor() {
  const { id: noteId } = useParams();
  const navigate = useNavigate();

  const [phase, _setPhase] = useState("prejoin"); // prejoin | loading | speaking | thinking | listening | awaiting | done
  const [noteTitle, setNoteTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [lessonId, setLessonId] = useState(null);
  const [caption, setCaption] = useState("");
  const [heard, setHeard] = useState("");
  const [boardOpen, setBoardOpen] = useState(false);
  const [lines, setLines] = useState([]);
  const [approach, setApproach] = useState("definition");
  const [tried, setTried] = useState(["definition"]);
  const [outline, setOutline] = useState([]);
  const [partIndex, setPartIndex] = useState(0);
  const [isFinal, setIsFinal] = useState(false);
  const [weakPoints, setWeakPoints] = useState([]);
  const [summary, setSummary] = useState("");
  const [remaining, setRemaining] = useState(null);
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState("");
  const [cc, setCc] = useState(true);
  const [handsFree, setHandsFree] = useState(true);
  const [secs, setSecs] = useState(0);

  const phaseRef = useRef(phase);
  const queueRef = useRef([]);
  const timerRef = useRef(null);
  const fillerRef = useRef(null);
  const clockRef = useRef(null);
  const recRef = useRef(null);
  const statusRef = useRef("awaiting");
  const handsFreeRef = useRef(true);
  const lessonRef = useRef(null);
  const speakTokenRef = useRef(0);
  const partRef = useRef({ index: 0, final: false, total: 0 });
  const prefetchRef = useRef(null); // { index, promise }
  const currentSegRef = useRef(null);
  const resumeRef = useRef([]); // rest of a part the student interrupted

  const setPhase = (p) => {
    phaseRef.current = p;
    _setPhase(p);
  };
  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);

  const srSupported = !!getSR();
  const ttsSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  /* ---------- wake the backend early so joining is fast ---------- */
  useEffect(() => {
    api.get("/health").catch(() => {});
  }, []);

  /* ---------- note title for the join screen ---------- */
  useEffect(() => {
    if (!noteId) return undefined;
    let alive = true;
    api
      .get("/notes/my")
      .then((res) => {
        const n = (res.data || []).find((x) => String(x.id) === String(noteId));
        if (alive && n) setNoteTitle(n.title);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [noteId]);

  /* ---------- teardown ---------- */
  const stopSpeaking = useCallback(() => {
    speakTokenRef.current += 1;
    queueRef.current = [];
    clearTimeout(timerRef.current);
    try {
      window.speechSynthesis && window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }, []);
  const stopListening = useCallback(() => {
    try {
      recRef.current && recRef.current.abort();
    } catch {
      /* ignore */
    }
    recRef.current = null;
  }, []);
  useEffect(() => {
    if (ttsSupported) window.speechSynthesis.getVoices();
    return () => {
      stopSpeaking();
      stopListening();
      clearInterval(clockRef.current);
      clearTimeout(fillerRef.current);
    };
  }, [stopSpeaking, stopListening, ttsSupported]);

  /* ---------- speech out ---------- */
  const speakOne = (text, onEnd) => {
    const token = speakTokenRef.current;
    const words = text.split(/\s+/).length;
    const startedAt = Date.now();
    const minMs = words * 260; // keep each caption readable even if a voice ends instantly
    let finished = false;
    const done = () => {
      if (finished || token !== speakTokenRef.current) return;
      finished = true;
      clearTimeout(timerRef.current);
      const wait = minMs - (Date.now() - startedAt);
      if (wait > 0) timerRef.current = setTimeout(() => token === speakTokenRef.current && onEnd(), wait);
      else onEnd();
    };
    if (ttsSupported) {
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        const v = pickVoice();
        if (v) u.voice = v;
        u.lang = v ? v.lang : "en-IN";
        u.rate = 1.02;
        u.onend = done;
        u.onerror = done;
        window.speechSynthesis.speak(u);
        timerRef.current = setTimeout(done, words * 450 + 2500); // safety net: some browsers drop onend
        return;
      } catch {
        /* fall through to timed captions */
      }
    }
    timerRef.current = setTimeout(done, words * 330 + 400);
  };

  const applyBoard = (board) => {
    if (!board || !board.action || board.action === "none") return;
    if (board.action === "open") setBoardOpen(true);
    if (board.action === "clear") setLines(board.lines || []);
    else if (board.lines && board.lines.length) setLines((prev) => [...prev, ...board.lines].slice(-9));
    if (board.lines && board.lines.length) setBoardOpen(true);
  };

  const playSegments = (segments) => {
    queueRef.current = [...segments];
    const next = () => {
      const seg = queueRef.current.shift();
      if (!seg) {
        if (statusRef.current === "off_topic") {
          statusRef.current = "awaiting";
          clearInterval(clockRef.current);
          setCaption("");
          setNotice("This call is only for studying. Pick a study topic and join again.");
          setPhase("prejoin");
          return;
        }
        if (statusRef.current === "done") {
          setPhase("done");
          return;
        }
        currentSegRef.current = null;
        setPhase("awaiting");
        setCaption("");
        if (handsFreeRef.current && getSR()) setTimeout(() => phaseRef.current === "awaiting" && startListening(), 350);
        return;
      }
      currentSegRef.current = seg;
      applyBoard(seg.board);
      setCaption(seg.say);
      setPhase("speaking");
      speakOne(seg.say, next);
    };
    next();
  };

  // Start generating part `index` in the background (once). Returns the promise.
  const prefetch = (index) => {
    const lid = lessonRef.current;
    if (!lid) return null;
    if (prefetchRef.current && prefetchRef.current.index === index && prefetchRef.current.lid === lid) return prefetchRef.current.promise;
    const promise = api.post(`/tutor/lesson/${lid}/part`, { index, advance: false }).then((r) => r.data);
    promise.catch(() => {
      if (prefetchRef.current && prefetchRef.current.promise === promise) prefetchRef.current = null;
    });
    prefetchRef.current = { index, lid, promise };
    return promise;
  };

  const applyTurn = (data) => {
    lessonRef.current = data.lesson_id;
    setLessonId(data.lesson_id);
    if (data.note_title) setNoteTitle(data.note_title);
    setApproach(data.approach);
    setTried(data.approaches_tried || []);
    setWeakPoints(data.weak_points || []);
    setSummary(data.summary || "");
    setRemaining(data.remaining_today);
    if (data.outline && data.outline.length) setOutline(data.outline);
    partRef.current = { index: data.part_index || 0, final: !!data.is_final, total: (data.outline || []).length };
    setPartIndex(data.part_index || 0);
    setIsFinal(!!data.is_final);
    statusRef.current = data.status;
    playSegments(data.segments || []);
    // get the next part ready while this one is being spoken
    if (data.status === "teaching" && !data.is_final) prefetch((data.part_index || 0) + 1);
  };

  // The student said "go ahead": play the prefetched part (instant), or wrap up.
  const goAhead = async () => {
    const lid = lessonRef.current;
    if (!lid || statusRef.current === "done") return;
    stopSpeaking();
    stopListening();
    if (resumeRef.current.length) {
      const rest = resumeRef.current;
      resumeRef.current = [];
      playSegments(rest);
      return;
    }
    if (partRef.current.final) {
      statusRef.current = "done";
      setCaption("");
      setPhase("done");
      api.post(`/tutor/lesson/${lid}/finish`).catch(() => {});
      return;
    }
    const nextIndex = partRef.current.index + 1;
    setPhase("thinking");
    setCaption("");
    clearTimeout(fillerRef.current);
    fillerRef.current = setTimeout(() => {
      if (phaseRef.current !== "thinking") return;
      setCaption("Okay, moving on.");
      speakOne("Okay, moving on.", () => {});
    }, 700);
    try {
      let data;
      try {
        data = await prefetch(nextIndex);
      } catch {
        prefetchRef.current = null;
        data = await prefetch(nextIndex); // one retry
      }
      clearTimeout(fillerRef.current);
      stopSpeaking();
      prefetchRef.current = null;
      applyTurn(data);
      // tell the server we moved on (served from its cache, no AI call)
      api.post(`/tutor/lesson/${lid}/part`, { index: nextIndex, advance: true }).catch(() => {});
    } catch (err) {
      handleError(err);
    }
  };

  const errorText = (err) => {
    const status = err?.response?.status;
    const detail = err?.response?.data?.detail;
    if (!err?.response) return "Can't reach the server. Check that the backend is running, then join again.";
    if (status === 429) return "You have hit today's tutor limit. Come back tomorrow.";
    if (status === 404) return "I could not find this note in your library.";
    if (status === 400) return typeof detail === "string" ? detail : "Tell me what you want to study, then join again.";
    if (status === 422) return "The server is running an older version of the tutor. Restart the backend and join again.";
    return `The tutor hit a server error (${status}). Try again in a moment.`;
  };

  // Before the lesson exists there is nothing to answer, so go back to the join screen.
  const failStart = (err) => {
    clearTimeout(fillerRef.current);
    clearInterval(clockRef.current);
    stopSpeaking();
    setCaption("");
    setNotice(errorText(err));
    setPhase("prejoin");
  };

  const handleError = (err) => {
    clearTimeout(fillerRef.current);
    if (!lessonRef.current) return failStart(err);
    const status = err?.response?.status;
    const msg =
      !err?.response || status >= 500
        ? "Sorry, I didn't get that through. Please say it again."
        : errorText(err);
    setNotice(msg);
    setCaption(msg);
    playSegments([{ say: msg, board: { action: "none", lines: [] } }]);
  };

  /* ---------- the call ---------- */
  const join = async () => {
    const t = topic.trim();
    if (!noteId && !t) {
      setNotice("Tell me what you want to study first.");
      return;
    }
    setPhase("loading");
    setNotice("");
    setSecs(0);
    clearInterval(clockRef.current);
    clockRef.current = setInterval(() => setSecs((x) => x + 1), 1000);
    if (ttsSupported) {
      // unlock audio on this user gesture, so later replies can play
      try {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
      } catch {
        /* ignore */
      }
    }
    setCaption("Connecting to your tutor…");
    try {
      const res = await api.post("/tutor/lesson/start", { note_id: noteId ? String(noteId) : null, topic: t || null });
      if (res.data.status === "off_topic") {
        statusRef.current = "off_topic";
        playSegments(res.data.segments || []);
        return;
      }
      applyTurn(res.data);
    } catch (err) {
      failStart(err);
    }
  };

  const sendTurn = async (text, alternatives = []) => {
    const said = (text || "").trim();
    if (!said || !lessonRef.current || statusRef.current === "done") return;
    if (isGoAhead(said)) {
      setHeard(said);
      goAhead();
      return;
    }
    stopSpeaking();
    setHeard(said);
    setPhase("thinking");
    setCaption("");
    clearTimeout(fillerRef.current);
    fillerRef.current = setTimeout(() => {
      if (phaseRef.current !== "thinking") return;
      const f = FILLERS[Math.floor(Math.random() * FILLERS.length)];
      setCaption(f);
      speakOne(f, () => {});
    }, 900);
    try {
      const res = await api.post(`/tutor/lesson/${lessonRef.current}/turn`, { text: said, alternatives: alternatives.filter((a) => a && a !== said).slice(0, 3) });
      clearTimeout(fillerRef.current);
      if (res.data.continue_lecture) {
        goAhead();
        return;
      }
      stopSpeaking();
      applyTurn(res.data);
    } catch (err) {
      handleError(err);
    }
  };

  /* ---------- speech in ---------- */
  const startListening = () => {
    const SR = getSR();
    if (!SR) {
      setNotice("Voice input needs Chrome or Edge. You can type your answer below.");
      setPhase("awaiting");
      return;
    }
    if (phaseRef.current === "speaking" && currentSegRef.current && !resumeRef.current.length) {
      // interrupted mid-part: keep the rest so "go ahead" carries on from here
      resumeRef.current = [currentSegRef.current, ...queueRef.current];
    }
    stopSpeaking();
    stopListening();
    // Chrome ends a recognition session on its own after a short pause (or
    // instantly on some setups), so we run in continuous mode, keep the text
    // across restarts, and decide ourselves when the person is done:
    // 1.8s of silence after they spoke, a tap on the mic, or 25s with nothing.
    const SILENCE_MS = 1800;
    const MAX_IDLE_MS = 25000;
    let timedOut = false;
    const idleTimer = setTimeout(() => (timedOut = true), MAX_IDLE_MS);
    let committed = ""; // text from earlier sessions of this same answer
    let current = ""; // text of the running session
    let currentAlts = []; // other ways the recogniser heard the running session
    let silenceTimer = null;
    let finished = false;
    let fatal = false;

    const said = () => `${committed} ${current}`.replace(/\s+/g, " ").trim();
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(silenceTimer);
      clearTimeout(idleTimer);
      const r = recRef.current;
      recRef.current = null;
      try {
        r && r.abort();
      } catch {
        /* ignore */
      }
      if (phaseRef.current !== "listening") return;
      const text = said();
      const alts = currentAlts.map((a) => `${committed} ${a}`.replace(/\s+/g, " ").trim());
      if (text) sendTurn(text, alts);
      else setPhase("awaiting");
    };

    const run = () => {
      const rec = new SR();
      recRef.current = rec;
      rec.lang = "en-IN";
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 3; // the backend gets the other hearings too ("RAG" vs "that")
      rec.finish = finish; // lets the mic button end the answer
      rec.onresult = (e) => {
        const parts = [];
        for (let i = 0; i < e.results.length; i++) parts.push(e.results[i][0].transcript);
        current = parts.join("");
        const alts = [];
        for (let i = 0; i < e.results.length && alts.length < 3; i++) {
          for (let j = 1; j < e.results[i].length && alts.length < 3; j++) {
            const swapped = parts.slice();
            swapped[i] = e.results[i][j].transcript;
            alts.push(swapped.join(""));
          }
        }
        currentAlts = alts;
        setHeard(said());
        clearTimeout(silenceTimer);
        if (said()) silenceTimer = setTimeout(finish, SILENCE_MS);
      };
      rec.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          fatal = true;
          setHandsFree(false);
          setNotice("Microphone permission was denied. Allow it in the address bar, or type your answer.");
        } else if (e.error === "audio-capture") {
          fatal = true;
          setNotice("No microphone found. Check that one is plugged in and not used by another app, or type.");
        } else if (e.error === "network") {
          fatal = true;
          setNotice("Speech recognition could not reach the network. Type your answer for now.");
        }
      };
      rec.onend = () => {
        if (recRef.current !== rec || finished) return;
        committed = said();
        current = "";
        currentAlts = [];
        // ended by the browser, not by us: keep listening unless something is broken
        if (!fatal && phaseRef.current === "listening" && (!timedOut || committed)) {
          try {
            run();
            return;
          } catch {
            /* fall through */
          }
        }
        finish();
      };
      rec.start();
    };

    setHeard("");
    setNotice("");
    setPhase("listening");
    try {
      run();
    } catch {
      setPhase("awaiting");
    }
  };

  const onMic = () => {
    if (phase === "prejoin" || phase === "loading" || phase === "done") return;
    if (phase === "listening") {
      if (recRef.current && recRef.current.finish) recRef.current.finish();
      else setPhase("awaiting");
      return;
    }
    startListening(); // also interrupts the tutor if it is speaking
  };

  const onType = (e) => {
    if (e.key !== "Enter" || !draft.trim()) return;
    e.preventDefault();
    const t = draft;
    setDraft("");
    if (phaseRef.current === "speaking" && currentSegRef.current && !resumeRef.current.length) {
      resumeRef.current = [currentSegRef.current, ...queueRef.current];
    }
    stopListening();
    sendTurn(t);
  };

  const leave = () => {
    stopSpeaking();
    stopListening();
    clearInterval(clockRef.current);
    navigate(noteId ? `/note/${noteId}` : "/dashboard");
  };

  const restart = () => {
    stopSpeaking();
    stopListening();
    lessonRef.current = null;
    statusRef.current = "awaiting";
    setLessonId(null);
    setLines([]);
    setBoardOpen(false);
    setCaption("");
    setHeard("");
    setSummary("");
    setWeakPoints([]);
    setOutline([]);
    setPartIndex(0);
    setIsFinal(false);
    partRef.current = { index: 0, final: false, total: 0 };
    prefetchRef.current = null;
    resumeRef.current = [];
    setApproach("definition");
    setTried(["definition"]);
    setTopic("");
    clearInterval(clockRef.current);
    setPhase("prejoin");
  };

  /* ---------- view ---------- */
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  const tutorTalking = phase === "speaking";
  const listening = phase === "listening";
  const inCall = !["prejoin"].includes(phase);
  const hint =
    notice ||
    {
      loading: "Connecting to your tutor…",
      speaking: srSupported ? "Tap the mic any time to interrupt." : "",
      thinking: "Thinking…",
      listening: "Listening… I will send it when you pause, or tap the mic to send now.",
      awaiting: isFinal ? "Ask a last doubt, or say done." : srSupported ? "Ask a doubt, or say “go ahead”." : "Type a doubt, or press Go ahead.",
      done: "Lesson complete.",
    }[phase] ||
    "";

  return (
    <div
      className="vt"
      style={{
        minHeight: "100vh",
        background: "var(--vt-bg)",
        color: "var(--vt-ink)",
        fontFamily: "var(--font-body)",
        display: "flex",
        flexDirection: "column",
        padding: "16px 20px 18px",
        gap: 12,
        boxSizing: "border-box",
      }}
    >
      {/* top bar */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={leave}
            className="vt-btn"
            aria-label={noteId ? "Back to note" : "Back to dashboard"}
            style={{ background: "transparent", border: "1px solid var(--vt-line2)", color: "var(--vt-dim)", borderRadius: 99, padding: "6px 12px", fontSize: 12.5 }}
          >
            {noteId ? "← Note" : "← Dashboard"}
          </button>
          <span className="font-bold text-[15px]">Study call{noteTitle ? ` · ${noteTitle}` : ""}</span>
          <span
            className="font-mono text-[10.5px] tracking-wider"
            style={{
              color: inCall ? "var(--vt-green)" : "var(--vt-faint)",
              background: inCall ? "rgba(127,211,160,.1)" : "transparent",
              border: `1px solid ${inCall ? "rgba(127,211,160,.3)" : "var(--vt-line2)"}`,
              borderRadius: 99,
              padding: "3px 10px",
            }}
          >
            {inCall ? "● LIVE · VOICE ONLY" : "NOT CONNECTED"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {remaining !== null && <span className="font-mono text-[11px]" style={{ color: "var(--vt-faint)" }}>{remaining} tutor turns left today</span>}
          <span className="font-mono text-[13px]" style={{ color: "var(--vt-dim)" }}>
            {mm}:{ss}
          </span>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row gap-3 flex-1 min-h-0">
        {/* main stage */}
        <section className="relative flex flex-1 min-h-[420px]">
          {boardOpen ? (
            <div
              className="vt-board"
              aria-label="Whiteboard"
              style={{ flex: 1, borderRadius: 20, padding: "24px 32px 40px", color: "#0F172A", display: "flex", flexDirection: "column", gap: 12, position: "relative", overflow: "hidden" }}
            >
              <div className="flex justify-between items-center">
                <span className="font-mono text-[10.5px] tracking-widest" style={{ color: "#475569" }}>
                  WHITEBOARD{outline.length ? ` · ${isFinal ? "WRAP-UP" : `PART ${partIndex + 1} OF ${outline.length}: ${outline[partIndex] || ""}`.toUpperCase()}` : ""}
                  {tried.length > 1 ? ` · ${(APPROACH_ROWS.find((a) => a.key === approach)?.label || "").toUpperCase()}` : ""}
                </span>
                <span className="font-mono text-[10.5px]" style={{ color: "#64748B" }}>
                  {noteId ? `using your note: ${noteTitle || "…"}` : "general lesson"}
                </span>
              </div>
              {lines.map((l, i) => (
                <span key={`${i}-${l.text}`} className="vt-ink" style={LINE_STYLE[l.style] || LINE_STYLE.normal}>
                  {l.text}
                </span>
              ))}
              <span style={{ position: "absolute", right: 20, bottom: 12, fontFamily: "Caveat, cursive", fontSize: 22, color: "#64748B" }}>— Auvon Tutor</span>
            </div>
          ) : (
            <div style={{ flex: 1 }}>
              <Tile name="Auvon Tutor" initial="A" big talking={tutorTalking} />
            </div>
          )}

          {/* captions */}
          <div style={{ position: "absolute", left: "50%", bottom: 18, transform: "translateX(-50%)", width: "86%", textAlign: "center", pointerEvents: "none" }}>
            {cc && caption && (
              <p key={caption} className="vt-rise" style={{ margin: 0, display: "inline-block", fontSize: 16, lineHeight: 1.5, color: "#fff", background: "rgba(5,9,18,.82)", borderRadius: 12, padding: "9px 15px" }}>
                {caption}
              </p>
            )}
            {heard && phase !== "speaking" && (
              <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--vt-green)", fontStyle: "italic" }}>You: “{heard}”</p>
            )}
          </div>

          {/* join screen */}
          {phase === "prejoin" && (
            <div style={{ position: "absolute", inset: 0, background: "var(--vt-bg)", borderRadius: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, textAlign: "center", padding: 24 }}>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>Voice study call</h1>
              <p style={{ margin: 0, maxWidth: 480, fontSize: 14.5, lineHeight: 1.6, color: "var(--vt-dim)" }}>
                Pick any study topic. The tutor plans it in a few parts and teaches each part out loud without stopping, using a whiteboard. After each part
                you can ask doubts or say “go ahead”. If something is unclear, it explains it a different way.{noteId ? ` It uses “${noteTitle || "your note"}” when it is relevant, and can go beyond it.` : ""} Study topics only. Turn your sound on.
              </p>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", maxWidth: 420, textAlign: "left", fontSize: 12.5, color: "var(--vt-dim)" }}>
                {noteId ? "What should we cover? (optional)" : "What do you want to study?"}
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && join()}
                  placeholder={noteId ? "e.g. learning rate. Leave empty and the tutor picks from the note" : "e.g. how RAG works, binary search, Newton's laws"}
                  maxLength={120}
                  style={{ height: 44, borderRadius: 12, border: "1px solid var(--vt-line2)", background: "#131C2F", color: "var(--vt-ink)", padding: "0 14px", fontSize: 14, outline: "none" }}
                />
              </label>
              {notice && <p style={{ margin: 0, fontSize: 13, color: "var(--vt-amber)", maxWidth: 440 }}>{notice}</p>}
              <button type="button" onClick={join} className="vt-btn" style={{ minHeight: 48, fontSize: 15, fontWeight: 600, color: "#fff", background: "var(--accent-primary)", border: 0, borderRadius: 99, padding: "12px 28px" }}>
                Join call
              </button>
              {!srSupported && (
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--vt-amber)", maxWidth: 440 }}>
                  This browser can't turn your voice into text (Brave and Firefox block it). You can still listen and type your answers, or open this page in Chrome or Edge to talk.
                </p>
              )}
            </div>
          )}
        </section>

        {/* side column */}
        <aside className="flex flex-col gap-2.5 w-full lg:w-[300px]">
          {boardOpen && <Tile name="Auvon Tutor" initial="A" talking={tutorTalking} />}
          <Tile name="You" initial="Y" talking={listening} me />

          <div style={{ background: "var(--vt-tile)", border: "1px solid var(--vt-line)", borderRadius: 16, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="font-mono text-[10.5px] tracking-widest" style={{ color: "var(--vt-faint)" }}>
              LESSON PLAN
            </span>
            {outline.length === 0 && <span style={{ fontSize: 12.5, color: "var(--vt-faint)" }}>{inCall ? "Planning the lesson…" : "The tutor plans the topic in a few parts."}</span>}
            {[...outline, "Wrap-up"].map((title, i) => {
              const done = phase === "done" || i < partIndex;
              const cur = phase !== "done" && i === partIndex;
              return (
                <div key={`${i}-${title}`} className="flex items-center gap-2.5 text-[13px]" style={{ color: cur ? "#fff" : done ? "var(--vt-dim)" : "var(--vt-faint)" }}>
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      border: `2px solid ${cur ? "var(--accent-primary)" : done ? "var(--vt-green)" : "#33415C"}`,
                      background: cur ? "var(--accent-primary)" : done ? "var(--vt-green)" : "transparent",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
                  <span className="ml-auto font-mono text-[10px]" style={{ color: "var(--vt-faint)", flexShrink: 0 }}>
                    {cur ? "now" : done ? "done" : ""}
                  </span>
                </div>
              );
            })}
            {inCall && tried.length > 1 && (
              <span style={{ fontSize: 12, color: "var(--vt-dim)", lineHeight: 1.45, marginTop: 2 }}>
                Explaining this part again, now with: <strong style={{ color: "#fff" }}>{APPROACH_ROWS.find((a) => a.key === approach)?.label}</strong>
              </span>
            )}
          </div>

          {phase === "done" && (
            <div className="vt-rise" style={{ background: "rgba(127,211,160,.08)", border: "1px solid rgba(127,211,160,.3)", borderRadius: 14, padding: 12, fontSize: 13, lineHeight: 1.5 }}>
              <strong style={{ display: "block", marginBottom: 4 }}>Lesson complete</strong>
              {summary}
              {weakPoints.length > 0 && <span style={{ display: "block", marginTop: 6, color: "var(--vt-amber)" }}>Worth revisiting: {weakPoints.join("; ")}</span>}
              <button type="button" onClick={restart} className="vt-btn" style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: "#fff", background: "var(--accent-primary)", border: 0, borderRadius: 99, padding: "8px 14px" }}>
                Start another topic
              </button>
            </div>
          )}
        </aside>
      </div>

      {/* controls */}
      <footer className="flex flex-col md:flex-row items-center gap-3">
        <span className="md:w-[300px] text-[12.5px] leading-snug" style={{ color: notice ? "var(--vt-amber)" : "var(--vt-faint)" }}>
          {inCall ? hint : ""}
        </span>
        <div className="flex flex-1 flex-wrap justify-center items-center gap-3">
          <button
            type="button"
            onClick={onMic}
            disabled={!inCall || phase === "loading" || phase === "done" || !srSupported}
            className="vt-btn"
            aria-label={listening ? "Stop listening" : "Talk to the tutor (interrupts it)"}
            aria-pressed={listening}
            style={{ width: 58, height: 58, borderRadius: "50%", border: 0, background: listening ? "#16A34A" : "var(--accent-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 10a7 7 0 0 0 14 0" />
              <path d="M12 17v5" />
            </svg>
          </button>
          {lessonId && (phase === "awaiting" || phase === "listening") && (
            <button type="button" onClick={goAhead} className="vt-btn vt-rise" style={{ minHeight: 46, fontSize: 13.5, fontWeight: 700, color: "#0B1220", background: "var(--vt-green)", border: 0, borderRadius: 99, padding: "0 18px" }}>
              {isFinal ? "Finish ✓" : "Go ahead ▶"}
            </button>
          )}
          <label style={{ display: "block", width: "min(360px, 100%)" }}>
            <span className="sr-only">Type a doubt</span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onType}
              disabled={!lessonId || phase === "done"}
              placeholder="Type a doubt, or “go ahead”, and press Enter"
              maxLength={1000}
              style={{ width: "100%", boxSizing: "border-box", height: 46, fontSize: 14, color: "var(--vt-ink)", background: "#131C2F", border: "1px solid var(--vt-line2)", borderRadius: 99, padding: "0 18px", outline: "none" }}
            />
          </label>
          <button type="button" onClick={() => setBoardOpen((b) => !b)} disabled={!inCall} aria-pressed={boardOpen} className="vt-btn" style={{ minHeight: 46, fontSize: 13, fontWeight: 600, color: "var(--vt-ink)", background: "#131C2F", border: "1px solid var(--vt-line2)", borderRadius: 99, padding: "0 16px" }}>
            Board
          </button>
          <button type="button" onClick={() => setCc((c) => !c)} aria-pressed={cc} className="vt-btn" style={{ minHeight: 46, fontSize: 13, fontWeight: 600, color: "var(--vt-ink)", background: "#131C2F", border: "1px solid var(--vt-line2)", borderRadius: 99, padding: "0 16px" }}>
            CC
          </button>
          {srSupported && (
            <button type="button" onClick={() => setHandsFree((h) => !h)} aria-pressed={handsFree} title="Start listening automatically when the tutor stops" className="vt-btn" style={{ minHeight: 46, fontSize: 13, fontWeight: 600, color: handsFree ? "#fff" : "var(--vt-ink)", background: handsFree ? "#1E2A44" : "#131C2F", border: `1px solid ${handsFree ? "var(--accent-primary)" : "var(--vt-line2)"}`, borderRadius: 99, padding: "0 16px" }}>
              Hands-free {handsFree ? "on" : "off"}
            </button>
          )}
          <button type="button" onClick={leave} className="vt-btn" aria-label="End call" style={{ width: 60, height: 46, borderRadius: 99, border: 0, background: "#DC2626", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 15c5-5 13-5 18 0l-2 3-4-1v-3c-2-1-4-1-6 0v3l-4 1Z" />
            </svg>
          </button>
        </div>
        <span className="hidden md:block md:w-[300px]" />
      </footer>
    </div>
  );
}
