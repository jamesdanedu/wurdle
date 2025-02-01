let wordLength = 5;
let currentRow = 0;
let timerInterval;
let startTime;
let timerMinutes = 0;
let timerSeconds = 0;
let usedLetters = new Set();

function initializeAlphabetGrid() {
    const grid = document.getElementById('alphabet-grid');
    grid.innerHTML = '';
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(letter => {
        const letterDiv = document.createElement('div');
        letterDiv.className = 'letter-tile';
        letterDiv.textContent = letter;
        grid.appendChild(letterDiv);
    });
}

function updateUsedLetters(guess) {
    guess.toUpperCase().split('').forEach(letter => {
        usedLetters.add(letter);
        document.querySelectorAll('.letter-tile').forEach(tile => {
            if (tile.textContent === letter && !tile.classList.contains('letter-used')) {
                tile.classList.add('letter-used');
                tile.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    tile.style.transform = 'scale(1)';
                }, 200);
            }
        });
    });
}

function showHighScores(initialWordLength = 5) {
    const modal = document.getElementById('high-scores-modal');
    modal.style.display = 'block';

    const tabs = document.querySelectorAll('.tab-button');
    tabs.forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.length === initialWordLength.toString()) {
            tab.classList.add('active');
        }
        tab.addEventListener('click', function() {
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            loadScoresForLength(this.dataset.length);
        });
    });

    loadScoresForLength(initialWordLength);
}

function loadScoresForLength(wordLength) {
    fetch(`/get_scores/${wordLength}`)
        .then(response => response.json())
        .then(scores => {
            const scoresList = document.getElementById('high-scores-list');

            let html = `
                <table class="scores-table">
                    <tr>
                        <th>Rank</th>
                        <th>Name</th>
                        <th>Time (seconds)</th>
                    </tr>
            `;

            scores.forEach((score, index) => {
                html += `
                    <tr>
                        <td><span class="math-inline">\{index \+ 1\}</td\>
<td\></span>{score.name}</td>
                        <td>${Math.round(score.time)}</td>
                    </tr>
                `;
            });

            if (scores.length === 0) {
                html += `
                    <tr>
                        <td colspan="3" style="text-align: center;">No scores yet for ${wordLength}-letter words</td>
                    </tr>
                `;
            }

            html += '</table>';
            scoresList.innerHTML = html;
        });
}

document.getElementById('guess-input').addEventListener('keyup', function(event) {
    if (event.key === "Enter") {
        event.preventDefault();
        submitGuess();
    }
});

document.getElementById('show-high-scores').addEventListener('click', () => {
    showHighScores(parseInt(wordLength));
});

document.querySelector('.close-button').addEventListener('click', () => {
    document.getElementById('high-scores-modal').style.display = 'none';
});

window.addEventListener('click', (event) => {
    const modal = document.getElementById('high-scores-modal');
    if (event.target === modal) {
        modal.style.display = 'none';
    }
});

document.getElementById('start-game').addEventListener('click', () => {
    wordLength = document.getElementById('word-length').value;
    const mode = document.getElementById('mode').value;
    fetch('/start_game', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ wordLength, mode }),
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById('setup-screen').style.display = 'none';
        document.getElementById('game-screen').style.display = 'block';
        currentRow = 0;

        const guessesDiv = document.getElementById('guesses');
        guessesDiv.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            const guessRow = document.createElement('div');
            guessRow.className = 'guess-row';
            for (let j = 0; j < wordLength; j++) {
                const letterDiv = document.createElement('span');
                guessRow.appendChild(letterDiv);
            }
            guessesDiv.appendChild(guessRow);
        }

        usedLetters.clear();
        initializeAlphabetGrid();

        startTime = Date.now();
        timerMinutes = 0;
        timerSeconds = 0;
        timerInterval = setInterval(updateTimer, 1000);
        document.getElementById('guess-input').maxLength = wordLength;
        document.getElementById('guess-input').value = '';
        document.getElementById('guess-input').disabled = false;
        document.getElementById('game-over-message').innerHTML = '';
    });
});

function submitGuess() {
    const guess = document.getElementById('guess-input').value.toLowerCase();
    if (guess.length !== parseInt(wordLength)) {
        alert(`Please enter a ${wordLength}-letter word.`);
        return;
    }

    fetch('/submit_guess', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ guess }),
    })
    .then(response => response.json())
    .then(data => {
        const guessesDiv = document.getElementById('guesses');

        if (currentRow >= 6) {
            return;
        }

        const currentGuessRow = guessesDiv.children[currentRow];
        currentGuessRow.innerHTML = '';

        data.feedback.forEach(feedback => {
            const letterDiv = document.createElement('span');
            letterDiv.textContent = feedback.letter.toUpperCase();
            letterDiv.className = feedback.status;
            currentGuessRow.appendChild(letterDiv);
        });

        updateUsedLetters(guess);
        currentRow++;

        if (currentRow >= 6 || data.game_over) {
            clearInterval(timerInterval);
            document.getElementById('guess-input').disabled = true;

            const timeTaken = data.correct ? Math.round(data.time_taken) : null;
            const rank = data.correct ? data.rank : null;

            showGameOver(timeTaken, rank, data.target_word, data.definition); // Show immediately

            if (!data.definition) {
                fetch('/fetch_definition', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ word: data.target_word }),
                })
                .then(defResponse => defResponse.json())
                .then(defData => {
                    data.definition = defData.definition;
                    showGameOver(timeTaken, rank, data.target_word, data.definition);
                })
                .catch(error => {
                    console.error('Error fetching definition:', error);
                    data.definition = "Error fetching definition.";
                    showGameOver(timeTaken, rank, data.target_word, data.definition);
                });
            }
        }

        document.getElementById('guess-input').value = '';
    })
    .catch(error => {
        console.error('Error:', error);
    });
}

function updateTimer() {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    timerMinutes = Math.floor(elapsed / 60);
    timerSeconds = elapsed % 60;

    const minutesStr = timerMinutes < 10 ? '0' + timerMinutes : timerMinutes;
    const secondsStr = timerSeconds < 10 ? '0' + timerSeconds : timerSeconds;

    document.getElementById('timer-minutes').textContent = minutesStr;
    document.getElementById('timer-seconds').textContent = secondsStr;
}

function showGameOver(timeTaken, rank, targetWord, definition) {
    document.getElementById('game-time').textContent = timeTaken || "";
    document.getElementById('game-rank').textContent = rank || "";
    const gameOverMessage = document.getElementById('game-over-message');
    gameOverMessage.innerHTML = ""; // Clear previous content

    let gameOverContent = document.createElement('div');
    gameOverContent.className = "game-over-content";

    let message = document.createElement('p');
    message.textContent = timeTaken ? "Congratulations!" : "Game Over!";
    gameOverContent.appendChild(message);

    let wordWas = document.createElement('p');
    wordWas.innerHTML = `The word was: <strong>${targetWord.toUpperCase()}</strong>`;
    gameOverContent.appendChild(wordWas);

    if (definition) {
        let def = document.createElement('p');
        def.textContent = "Definition: " + definition;
        gameOverContent.appendChild(def);
    }

    let buttonsDiv = document.createElement('div');
    buttonsDiv.innerHTML = '<button id="play-again">New Game</button> <button id="show-high-scores">High Scores</button>';
    gameOverContent.appendChild(buttonsDiv);

    gameOverMessage.appendChild(gameOverContent);

    // Add event listeners AFTER the buttons are in the DOM
    const playAgainButton = document.getElementById('play-again');
    if (playAgainButton) {  // Check if the button exists
        playAgainButton.addEventListener('click', () => {
            location.reload();
        });
    }

    const showHighScoresButton = document.getElementById('show-high-scores');
    if (showHighScoresButton) { // Check if the button exists
        showHighScoresButton.addEventListener('click', () => {
            showHighScores(parseInt(wordLength));
        });
    }
}
