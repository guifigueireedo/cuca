import React, { useState, useEffect, useCallback } from "react";

import './App.css';
import Keyboard from "./components/Keyboard";
import Tooltip from "./components/Tooltip";
import { v4 as uuidv4 } from 'uuid';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChartSimple, faQuestion } from '@fortawesome/free-solid-svg-icons';

const THEME_GENERAL = "geral";
const THEME_RESERVE_NAME = "reserve";

const MAX_ATTEMPTS = 6;
const WORD_LENGTH = 5;
const BOMB_TIMER_START = 60;

const getUserId = () => {
    let userId = localStorage.getItem('userId');
    if (!userId) {
        userId = uuidv4();
        localStorage.setItem('userId', userId);
    }
    return userId;
};

const normalizeString = (str) => {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/ç/g, 'c')
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

const createInitialGameState = () => {
  return {
    currentWord: "",
    guesses: [],
    guess: Array(WORD_LENGTH).fill(""),
    activeTileIndex: 0,
    timer: 0,
    isTimerActive: false,
    hasBombStarted: false,
    gameOver: false,
    gameWon: false,
    keyStatuses: {},
  };
};

const reverseString = (str) => str ? str.split('').reverse().join('') : '';

function App() {
  const [modesMenuOpen, setModesMenuOpen] = useState(false);
  const [themesMenuOpen, setThemesMenuOpen] = useState(false);
  const [invalidWord, setInvalidWord] = useState(false);
  const themeOptions = [
    { key: "geral", label: "Geral" },
    { key: "verbs", label: "Verbos" },
    { key: "adjectives", label: "Adjetivos" }
  ];
  const modeOptions = [
    { key: "normal", label: "Normal" },
    { key: "bomba", label: "Bomba Relógio" },
    { key: "reverse", label: "Ao Contrário" }
  ];


  const [selectedTheme, setSelectedTheme] = useState(THEME_GENERAL);
  const [selectedMode, setSelectedMode] = useState("normal");
  let themeClass = "theme-geral";
  if (selectedTheme === "verbs") themeClass = "theme-1";
  else if (selectedTheme === "adjectives") themeClass = "theme-2";
  const isReversed = selectedMode === 'reverse';

  const [gameState, setGameState] = useState(createInitialGameState());
  const [countdown, setCountdown] = useState("");
  
  const [isLoading, setIsLoading] = useState(true);
  const [userId] = useState(getUserId());
  const [userStats, setUserStats] = useState([]);
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/stats/${userId}`);
        if (!response.ok) throw new Error('Erro ao buscar estatísticas');
        const data = await response.json();
        setUserStats(data.stats || []);
      } catch (err) {
        setUserStats([]);
      }
    };
    fetchStats();
  }, [userId]);

  useEffect(() => {
    const fetchGameData = async () => {
      setIsLoading(true);
      const endpoint = `${process.env.REACT_APP_API_URL}/api/gamestate/${userId}?theme=${selectedTheme}&mode=${selectedMode}`;

      try {
        const response = await fetch(endpoint);
        if (!response.ok) {
          throw new Error(`Erro na rede: ${response.status}`);
        }
        const data = await response.json();

        if (data.gameState) {
          let bombTime = BOMB_TIMER_START;
          let bombStarted = selectedMode === 'bomba' ? !!data.gameState.hasBombStarted : false;
          if (selectedMode === 'bomba') {
            bombTime = typeof data.gameState.lastBombTime === 'number' ? data.gameState.lastBombTime : (data.gameState.timer || BOMB_TIMER_START);
            const bombKey = `bombTime-${userId}-${selectedTheme}`;
            const localBomb = localStorage.getItem(bombKey);
            if (localBomb && !data.gameState.gameOver && bombStarted) {
              bombTime = Math.max(0, parseInt(localBomb, 10));
            }
          }
          setGameState({
            ...createInitialGameState(),
            currentWord: data.word || "",
            guesses: data.gameState.guesses,
            gameOver: data.gameState.gameOver,
            gameWon: data.gameState.gameWon,
            isTimerActive: !data.gameState.gameOver && (selectedMode !== 'bomba' || bombStarted),
            timer: selectedMode === 'bomba' ? bombTime : (data.gameState.timer || 0),
            hasBombStarted: bombStarted
          });
        } else {
          const newGameState = createInitialGameState();
          if (selectedMode !== 'bomba') {
            newGameState.isTimerActive = true;
          }
          setGameState(newGameState);
        }
      } catch (error) {
        console.error("Falha ao buscar dados do jogo:", error);
        const newGameState = createInitialGameState();
        if (selectedMode !== 'bomba') {
            newGameState.isTimerActive = true;
        }
        setGameState(newGameState);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGameData();
  }, [selectedMode, selectedTheme, userId]);


  useEffect(() => {
    if (!gameState.isTimerActive || gameState.gameOver || (selectedMode === 'bomba' && !gameState.hasBombStarted)) {
      return;
    }
    const bombKey = `bombTime-${userId}-${selectedTheme}`;
    const interval = setInterval(() => {
      setGameState(prev => {
        if (prev.gameOver) return prev;
        let newTimer = prev.timer;
        let isGameOver = prev.gameOver;

        if (selectedMode === 'bomba') {
          newTimer -= 1;
          localStorage.setItem(bombKey, newTimer);
          if (newTimer <= 0) {
            isGameOver = true;
            localStorage.removeItem(bombKey);
            fetch(`${process.env.REACT_APP_API_URL}/api/gamestate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId,
                theme: selectedTheme,
                mode: selectedMode,
                guesses: prev.guesses,
                gameWon: false,
                gameOver: true,
                timer: 0,
                hasBombStarted: true,
                lastBombTime: 0
              }),
            });
          }
        } else {
          newTimer += 1;
        }
        return { ...prev, timer: newTimer, gameOver: isGameOver };
      });
    }, 1000);
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && selectedMode === 'bomba' && !gameState.gameOver && gameState.hasBombStarted) {
        localStorage.setItem(bombKey, gameState.timer);
        fetch(`${process.env.REACT_APP_API_URL}/api/gamestate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            theme: selectedTheme,
            mode: selectedMode,
            guesses: gameState.guesses,
            gameWon: gameState.gameWon,
            gameOver: gameState.gameOver,
            timer: gameState.timer,
            hasBombStarted: gameState.hasBombStarted,
            lastBombTime: gameState.timer
          }),
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [gameState.isTimerActive, gameState.gameOver, selectedMode, gameState.timer, userId, selectedTheme, gameState.guesses, gameState.gameWon, gameState.hasBombStarted]);
  
  useEffect(() => {
    if (gameState.gameOver && selectedMode === 'normal') {
      const calculateCountdown = () => {
        const now = new Date();
        const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
        const diff = midnight.getTime() - now.getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        setCountdown(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
      };
      calculateCountdown();
      const interval = setInterval(calculateCountdown, 1000 * 60);
      return () => clearInterval(interval);
    }
  }, [gameState.gameOver, selectedMode]);
  
  const updateState = (newState) => {
    setGameState(prev => ({ ...prev, ...newState }));
  };

  const handleKeyPress = useCallback((key) => {
    if (gameState.gameOver || !gameState.isTimerActive) return;
    const newGuess = [...gameState.guess];
    if (gameState.activeTileIndex < WORD_LENGTH) {
        newGuess[gameState.activeTileIndex] = key;
        updateState({ guess: newGuess, activeTileIndex: gameState.activeTileIndex + 1 });
    }
  }, [gameState]);

  const handleDelete = useCallback(() => {
    if (gameState.gameOver || !gameState.isTimerActive) return;

    setGameState(prev => {
        const { activeTileIndex, guess } = prev;
        const newGuess = [...guess];

        if (activeTileIndex > 0 && !guess[activeTileIndex]) {
            const newIndex = activeTileIndex - 1;
            newGuess[newIndex] = '';
            return { ...prev, guess: newGuess, activeTileIndex: newIndex };
        }

        newGuess[activeTileIndex] = '';

        if (activeTileIndex > 0) {
            return { ...prev, guess: newGuess, activeTileIndex: activeTileIndex - 1 };
        }
        
        return { ...prev, guess: newGuess };
    });
  }, [gameState.gameOver, gameState.isTimerActive]);
  
   const handleEnter = useCallback(async () => {
    let currentState;
    setGameState(prev => {
      currentState = prev;
      return prev;
    });

    await new Promise(resolve => setTimeout(resolve, 0));

    const { guess, gameOver, isTimerActive, currentWord, guesses, keyStatuses, timer, hasBombStarted } = currentState;
    const guessString = guess.join('');

    if (gameOver || !isTimerActive || guessString.length !== WORD_LENGTH) {
      return;
    }

    setInvalidWord(false);

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/validate/${guessString}`);
      const data = await response.json();

      if (!data.isValid) {
        setInvalidWord(true);
        setTimeout(() => setInvalidWord(false), 1000);
        return; // Impede que o resto da função seja executado
      }
  
      const targetWord = selectedMode === 'reverse' ? reverseString(currentWord) : currentWord;
      const normalizedTargetWord = normalizeString(targetWord);
      const normalizedGuessString = normalizeString(guessString);
  
      const newFeedback = [];
      const wordLetters = normalizedTargetWord.split('');
      for (let i = 0; i < WORD_LENGTH; i++) {
        if (normalizeString(guess[i]) === wordLetters[i]) {
          newFeedback[i] = { letter: guess[i], status: 'correct' };
          wordLetters[i] = null;
        }
      }
      for (let i = 0; i < WORD_LENGTH; i++) {
        if (newFeedback[i]) continue;
        const letterIndex = wordLetters.indexOf(normalizeString(guess[i]));
        if (letterIndex !== -1) {
          newFeedback[i] = { letter: guess[i], status: 'present' };
          wordLetters[letterIndex] = null;
        } else {
          newFeedback[i] = { letter: guess[i], status: 'absent' };
        }
      }
  
      const newKeyStatuses = { ...keyStatuses };
      newFeedback.forEach(({ letter, status }) => {
        const normalizedLetter = normalizeString(letter);
        const currentStatus = newKeyStatuses[normalizedLetter];
        if (currentStatus === 'correct' || (currentStatus === 'present' && status !== 'correct')) return;
        newKeyStatuses[normalizedLetter] = status;
      });

      const newGuesses = [...guesses, newFeedback];
      const isGameWon = normalizedGuessString === normalizedTargetWord;
      const isGameOver = isGameWon || newGuesses.length === MAX_ATTEMPTS || (selectedMode === 'bomba' && timer <= 0);

      updateState({
        guesses: newGuesses,
        guess: Array(WORD_LENGTH).fill(""),
        activeTileIndex: 0,
        gameOver: isGameOver,
        gameWon: isGameWon,
        keyStatuses: newKeyStatuses
      });

      await fetch(`${process.env.REACT_APP_API_URL}/api/gamestate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          theme: selectedTheme,
          mode: selectedMode,
          guesses: newGuesses,
          gameWon: isGameWon,
          gameOver: isGameOver,
          timer,
          hasBombStarted
        }),
      });

    } catch (error) {
      console.error("Falha ao submeter a tentativa:", error);
    }
  }, [selectedMode, selectedTheme, userId, updateState]);
  
  const handleTileClick = (index) => {
    if (!gameState.gameOver) {
      updateState({ activeTileIndex: index });
    }
  };

  const startBombTimer = () => {
    updateState({ isTimerActive: true, hasBombStarted: true });
  };
  
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!gameState || gameState.gameOver || !gameState.isTimerActive) return;
      if (event.key === 'Enter') handleEnter();
      else if (event.key === 'Backspace') handleDelete();
      else if (event.key.match(/^[a-zç]$/i)) handleKeyPress(event.key.toLowerCase());
      else if (event.key === 'ArrowLeft') updateState({ activeTileIndex: Math.max(0, gameState.activeTileIndex - 1) });
      else if (event.key === 'ArrowRight') updateState({ activeTileIndex: Math.min(WORD_LENGTH, gameState.activeTileIndex + 1) });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyPress, handleDelete, handleEnter, gameState]);

  if (isLoading) { return <div className="App"><header className="App-header"><h1>Carregando...</h1></header></div>; }
  
  let tooltipText = 'Adivinhe a palavra em 6 tentativas. Verde: letra na posição correta. Amarelo: letra na palavra, mas no lugar errado. Cinza: a letra não está na palavra.';
  if (selectedMode === 'bomba') tooltipText = 'Você tem 60 segundos para adivinhar a palavra antes que o tempo acabe!';
  if (selectedMode === 'reverse') tooltipText = 'Adivinhe a palavra... ao contrário! Todas as regras normais se aplicam, mas à palavra invertida.';

  return (
    <div className={`App ${themeClass}`}>
      <header className="App-header">
      <div className="top-bar">
          <div className="top-bar-section left">
            <div className="selector-container-desktop">
              <span className="selector-label">{isReversed ? reverseString("Modos:") : "Modos:"}</span>
              <select value={selectedMode} onChange={(e) => setSelectedMode(e.target.value)} className="theme-selector">
                <option value="normal">Normal</option>
                <option value="bomba">Bomba Relógio</option>
                <option value="reverse">Ao Contrário</option>
              </select>
            </div>
            <div className="selector-container-mobile">
              <div className="dropdown">
                <button onClick={() => setModesMenuOpen(!modesMenuOpen)} className="dropdown-button">
                  Modos
                </button>
                {modesMenuOpen && (
                  <div className="dropdown-content">
                    {modeOptions.map(option => (
                      <a key={option.key} href="#" className={selectedMode === option.key ? 'selected' : ''} onClick={(e) => {
                        e.preventDefault();
                        setSelectedMode(option.key);
                        setModesMenuOpen(false);
                      }}>{option.label}</a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="top-bar-section center">
            <div className="title-container" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {}
              <Tooltip text={
                (() => {
                  const stat = userStats.find(s => s.mode === selectedMode && s.theme === selectedTheme);
                  if (!stat) return 'Sem estatísticas ainda para esta combinação.';
                  const themeNames = {
                    geral: 'Geral',
                    verbs: 'Verbos',
                    adjectives: 'Adjetivos'
                  };
                  const modeNames = {
                    normal: 'Normal',
                    bomba: 'Bomba Relógio',
                    reverse: 'Ao Contrário'
                  };
                  const winPercent = stat.totalGames > 0 ? Math.round((stat.wins / stat.totalGames) * 100) : 0;
                  let streak = 0;
                  if (stat.totalGames > 0 && stat.losses === 0) streak = stat.wins;
                  if (stat.losses > 0) streak = 0;
                  return (
                    <div style={{marginBottom: 8}}>
                      <strong>{`Modo: ${modeNames[stat.mode] || stat.mode}, Tema: ${themeNames[stat.theme] || stat.theme}`}</strong><br/>
                      Jogos: {stat.totalGames}<br/>
                      Vitórias: {stat.wins}<br/>
                      Derrotas: {stat.losses}<br/>
                      % de vitória: {winPercent}%<br/>
                      Sequência: {streak}<br/>
                      Última tentativa: {stat.lastPlayed ? new Date(stat.lastPlayed).toLocaleDateString() : '-'}
                    </div>
                  );
                })()
              }>
                <span className="tooltip-trigger" style={{fontWeight: 'bold', fontSize: '1.2em'}}>
                  <FontAwesomeIcon icon={faChartSimple} />
                </span>
              </Tooltip>
              <h1>{isReversed ? reverseString("Cuca") : "Cuca"}</h1>
              <Tooltip text={tooltipText}>
                <span className="tooltip-trigger">
                  <FontAwesomeIcon icon={faQuestion} />
                </span>
              </Tooltip>
            </div>
          </div>
          <div className="top-bar-section right">
            <div className="selector-container-desktop">
              <span className="selector-label">{isReversed ? reverseString("Temas:") : "Temas:"}</span>
              <select value={selectedTheme} onChange={(e) => setSelectedTheme(e.target.value)} className="theme-selector">
                <option value="geral">Geral</option>
                <option value="verbs">Verbos</option>
                <option value="adjectives">Adjetivos</option>
              </select>
            </div>
            <div className="selector-container-mobile">
              <div className="dropdown right">
                <button onClick={() => setThemesMenuOpen(!themesMenuOpen)} className="dropdown-button">
                  Temas
                </button>
                {themesMenuOpen && (
                  <div className="dropdown-content">
                    {themeOptions.map(option => (
                      <a key={option.key} href="#" className={selectedTheme === option.key ? 'selected' : ''} onClick={(e) => {
                        e.preventDefault();
                        setSelectedTheme(option.key);
                        setThemesMenuOpen(false);
                      }}>{option.label}</a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>


        <div className="main-content">
          {selectedMode === 'bomba' && !gameState.hasBombStarted && !gameState.gameOver ? (
            <button className="start-button" onClick={startBombTimer}>
              {isReversed ? reverseString("Começar") : "Começar"}
            </button>
          ) : (
            <>
              <div className="game-board">
                {gameState.guesses.map((feedback, i) => (
                  <div key={i} className="board-row">
                    {feedback.map((item, j) => (<div key={j} className={`tile ${item.status}`}>{item.letter}</div>))}
                  </div>
                ))}
                {!gameState.gameOver && (
                  <div className={`board-row ${invalidWord ? 'invalid' : ''}`}>
                    {gameState.guess.map((letter, i) => (
                      <div key={i} className={`tile ${i === gameState.activeTileIndex ? 'active' : ''}`} onClick={() => handleTileClick(i)}>{letter}</div>
                    ))}
                  </div>
                )}
              </div>
              {gameState.gameOver && (
                <div className="game-over-message">
                  <h2>{gameState.gameWon ? (isReversed ? reverseString("Parabéns!") : "Parabéns!") : (isReversed ? reverseString("Fim de jogo!") : "Fim de jogo!")}</h2>
                  <h3>A palavra era: {gameState.currentWord ? (isReversed ? reverseString(gameState.currentWord.toUpperCase()) : gameState.currentWord.toUpperCase()) : ''}</h3>
                  {selectedMode === 'normal' && <p className="countdown-timer">Nova palavra em {countdown}</p>}
                </div>
              )}
            </>
          )}
        </div>
        
        {(!gameState.gameOver && (selectedMode !== 'bomba' || gameState.hasBombStarted)) && (
          <Keyboard
            onKeyPress={handleKeyPress}
            onEnter={handleEnter}
            onDelete={handleDelete}
            keyStatuses={gameState.keyStatuses}
            isReversed={isReversed}
          />
        )}
        
        <div style={{marginTop: '20px', flexShrink: 0}}>
          <p>{isReversed ? reverseString("Tentativas:") : "Tentativas:"} {gameState.guesses.length}/{MAX_ATTEMPTS}</p>
          <p>{isReversed ? reverseString("Tempo:") : "Tempo:"} {gameState.timer}s</p>
        </div>
      </header>
    </div>
  );
}

export default App;