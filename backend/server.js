const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const THEME_GENERAL = "geral";
const THEME_1_NAME = "verbs";
const THEME_2_NAME = "adjectives";
const THEME_RESERVE_NAME = "reserve";

const words = require('./words');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = process.env.ATLAS_URI;
mongoose.connect(uri)
    .then(() => console.log(">>> Conexão com MongoDB OK."))
    .catch(err => console.error("!!! FALHA AO CONECTAR COM MONGODB:", err));


const usedWordSchema = new mongoose.Schema({
    date: { type: String, required: true },
    mode: { type: String, required: true },
    theme: { type: String, required: true },
    word: { type: String, required: true }
});
const UsedWord = mongoose.model('UsedWord', usedWordSchema);

const getWordOfTheDay = async (theme = THEME_GENERAL, mode = 'normal') => {
    let themeKey = theme;
    if (theme === THEME_1_NAME && (!words[THEME_1_NAME] || words[THEME_1_NAME].length === 0)) {
        themeKey = THEME_RESERVE_NAME;
    }
    if (theme === THEME_2_NAME && (!words[THEME_2_NAME] || words[THEME_2_NAME].length === 0)) {
        themeKey = THEME_RESERVE_NAME;
    }
    const wordList = words[themeKey] || words[THEME_GENERAL];
    if (!wordList || wordList.length === 0) return null;
    const todayStr = new Date().toISOString().split('T')[0];
    let used = await UsedWord.findOne({ date: todayStr, mode, theme });
    if (used) return used.word;
    const usedWords = await UsedWord.find({ mode, theme }).select('word');
    const usedSet = new Set(usedWords.map(u => u.word));
    const available = wordList.filter(w => !usedSet.has(w));
    if (available.length === 0) {
        return null;
    }
    const chosen = available[Math.floor(Math.random() * available.length)];
    await UsedWord.create({ date: todayStr, mode, theme, word: chosen });
    return chosen;
};

const gameStateSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    guesses: { type: Array, required: true },
    gameWon: { type: Boolean, default: false },
    gameOver: { type: Boolean, default: false },
    timer: { type: Number, default: 0 },
    hasBombStarted: { type: Boolean, default: false },
    lastBombTime: { type: Number, default: null },
});
const GameState = mongoose.model('GameState', gameStateSchema);

const statsSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    mode: { type: String, required: true },
    theme: { type: String, required: true },
    totalGames: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    totalAttempts: { type: Number, default: 0 },
    totalTime: { type: Number, default: 0 },
    lastPlayed: { type: Date, default: null }
});
const Stats = mongoose.model('Stats', statsSchema);


app.get('/api/gamestate/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        let { theme = THEME_GENERAL, mode = 'normal' } = req.query;
        if (theme === THEME_1_NAME && (!words[THEME_1_NAME] || words[THEME_1_NAME].length === 0)) {
            theme = THEME_RESERVE_NAME;
        }
        if (theme === THEME_2_NAME && (!words[THEME_2_NAME] || words[THEME_2_NAME].length === 0)) {
            theme = THEME_RESERVE_NAME;
        }
        const wordOfTheDay = await getWordOfTheDay(theme, mode);

        if (!wordOfTheDay) {
            return res.status(500).json({ error: `Lista de palavras não encontrada ou todas já usadas para o tema '${theme}'.` });
        }

        const dateStr = new Date().toISOString().split('T')[0];
        const key = `${userId}-${dateStr}-${theme}-${mode}`;

        const gameState = await GameState.findOne({ key: key });

        if (gameState && gameState.gameOver) {
            return res.status(200).json({ word: wordOfTheDay, gameState, alreadyPlayed: true });
        }

        const responseState = gameState ? gameState : { guesses: [], gameWon: false, gameOver: false };
        return res.status(200).json({ word: wordOfTheDay, gameState: responseState, alreadyPlayed: false });

    } catch (error) {
        console.error("!!! ERRO EM /api/gamestate:", error);
        return res.status(500).json({ error: "Erro interno no servidor." });
    }
});

app.post('/api/gamestate', async (req, res) => {
    try {
        let { userId, theme, mode, guesses, gameWon, gameOver, timer, hasBombStarted, lastBombTime } = req.body;
        if (!userId || !theme || !mode || !Array.isArray(guesses)) {
            return res.status(400).json({ error: 'Dados inválidos.' });
        }
        if (theme === THEME_1_NAME && (!words[THEME_1_NAME] || words[THEME_1_NAME].length === 0)) {
            theme = THEME_RESERVE_NAME;
        }
        if (theme === THEME_2_NAME && (!words[THEME_2_NAME] || words[THEME_2_NAME].length === 0)) {
            theme = THEME_RESERVE_NAME;
        }
        const dateStr = new Date().toISOString().split('T')[0];
        const key = `${userId}-${dateStr}-${theme}-${mode}`;

        const existing = await GameState.findOne({ key });
        if (existing && existing.gameOver) {
            return res.status(403).json({ error: 'Já jogou esse modo/tema hoje.' });
        }

        await GameState.findOneAndUpdate(
            { key: key },
            {
                guesses,
                gameWon,
                gameOver,
                userId,
                timer: timer || 0,
                hasBombStarted: !!hasBombStarted,
                lastBombTime: typeof lastBombTime === 'number' ? lastBombTime : null
            },
            { new: true, upsert: true }
        );

        if (gameOver === true) {
            let stats = await Stats.findOne({ userId, mode, theme });
            if (!stats) {
                stats = new Stats({ userId, mode, theme });
            }
            const todayStr = new Date().toISOString().split('T')[0];
            const statsKey = `${userId}-${todayStr}-${theme}-${mode}`;
            const gameStateToday = await GameState.findOne({ key: statsKey });
            const alreadyCountedToday = stats.lastPlayed && stats.lastPlayed.toISOString().split('T')[0] === todayStr;
            if (gameStateToday && gameStateToday.gameOver && !alreadyCountedToday) {
                stats.totalGames += 1;
                stats.lastPlayed = new Date();
            }
            if (gameStateToday && gameStateToday.gameOver && !alreadyCountedToday) {
                if (gameWon === true) {
                    stats.wins += 1;
                } else {
                    stats.losses += 1;
                }
            }
            stats.totalAttempts += guesses.length;
            stats.totalTime += timer || 0;
            await stats.save();
        }

        return res.status(200).json({ message: 'Progresso salvo!' });
    } catch (error) {
        console.error("!!! ERRO AO SALVAR:", error);
        return res.status(500).json({ error: "Erro ao salvar o progresso." });
    }
});

app.get('/api/randomword', (req, res) => {
    return res.status(400).json({ error: 'Use /api/gamestate para obter a palavra do dia e controle de resolução.' });

});

app.get('/api/stats/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const stats = await Stats.find({ userId });
        const themeNames = {
            [THEME_GENERAL]: 'Geral',
            [THEME_1_NAME]: THEME_1_NAME.charAt(0).toUpperCase() + THEME_1_NAME.slice(1),
            [THEME_2_NAME]: THEME_2_NAME.charAt(0).toUpperCase() + THEME_2_NAME.slice(1),
            [THEME_RESERVE_NAME]: THEME_RESERVE_NAME.charAt(0).toUpperCase() + THEME_RESERVE_NAME.slice(1)
        };
        const statsWithNames = stats.map(s => ({
            ...s._doc,
            themeName: themeNames[s.theme] || s.theme
        }));
        res.status(200).json({ stats: statsWithNames });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar estatísticas.' });
    }
});

app.listen(port, () => {
    console.log(`>>> Servidor FINAL rodando na porta: ${port}`);
});