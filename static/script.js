let wordLength = 5;
let currentRow = 0;
let timerInterval;
let startTime;
let timerMinutes = 0;
let timerSeconds = 0;
let usedLetters = new Set();
let globalEventListenersInitialized = false;

function initializeEventListeners() {
    if (globalEventListenersInitialized) return;
    
    document.addEventListener('DOMContentLoaded', function() {
        const guessInput = document.getElementById('guess-input');
        if (guessInput) {
            guessInput.addEventListener('keyup', function(event) {
                if (event.key === "Enter") {
                    event.preventDefault();
                    submitGuess();
                }
            });
        }

        const showHighScoresBtn = document.getElementById('show-high-scores');
        if (showHighScoresBtn) {
            showHighScoresBtn.addEventListener('click', () => {
                showHighScores(parseInt(wordLength));
            });
        }

        const closeBtn = document.querySelector('.close-button');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                const modal = document.getElementById('high-scores-modal');
                if (modal) modal.style.display = 'none';
            });
        }
    });

    globalEventListenersInitialized = true;
}

// Call this function once at the start
initializeEventListeners();

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

// Wait for DOM to be fully loaded before accessing elements
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded - initializing game...');
    
    // Initialize game elements
    const startButton = document.getElementById('start-game');
    const guessInput = document.getElementById('guess-input');
    const showHighScoresButton = document.getElementById('show-high-scores');
    const closeButton = document.querySelector('.close-button');
    
    // Log which elements we found/didn't find
    console.log('Found elements:', {
        startButton: !!startButton,
        guessInput: !!guessInput,
        showHighScoresButton: !!showHighScoresButton,
        closeButton: !!closeButton
    });

    if (startButton) {
        startButton.addEventListener('click', () => {
            console.log('Start button clicked');
            wordLength = document.getElementById('word-length').value;
            const mode = document.getElementById('mode').value;
            
            fetch('/start_game', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ wordLength, mode }),
                credentials: 'same-origin'
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
                if (guessInput) {
                    guessInput.maxLength = wordLength;
                    guessInput.value = '';
                    guessInput.disabled = false;
                }
                document.getElementById('game-over-message').innerHTML = '';
            })
            .catch(error => {
                console.error('Error starting game:', error);
            });
        });
    }
});

function submitGuess() {
    const guessInput = document.getElementById('guess-input');
    if (!guessInput) {
        console.error('Guess input element not found');
        return;
    }

    const guess = guessInput.value.toLowerCase();
    if (guess.length !== parseInt(wordLength)) {
        alert(`Please enter a ${wordLength}-letter word.`);
        return;
    }

    console.log('Submitting guess:', guess);

    fetch('/submit_guess', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ guess }),
        credentials: 'same-origin'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('Guess response:', data);

        if (data.error) {
            throw new Error(data.error);
        }

        const guessesDiv = document.getElementById('guesses');
        if (!guessesDiv) {
            throw new Error('Guesses div not found');
        }

        const currentGuessRow = guessesDiv.children[currentRow];
        if (!currentGuessRow) {
            throw new Error('Current guess row not found');
        }

        currentGuessRow.innerHTML = '';

        data.feedback.forEach(feedback => {
            const letterDiv = document.createElement('span');
            letterDiv.textContent = feedback.letter.toUpperCase();
            letterDiv.className = feedback.status;
            currentGuessRow.appendChild(letterDiv);
        });

        updateUsedLetters(guess);
        currentRow++;

        // Check for game over conditions
        const gameIsWon = data.feedback.every(f => f.status === 'correct');
        const gameIsLost = currentRow >= 6;
        
        if (gameIsWon || gameIsLost) {
            // If game is lost, fetch the target word
            if (gameIsLost && !gameIsWon) {
                fetch('/get_target_word')
                    .then(response => response.json())
                    .then(wordData => {
                        clearInterval(timerInterval);
                        guessInput.disabled = true;
                        showGameOver(null, null, wordData.target_word, data.definition);
                    });
            } else {
                clearInterval(timerInterval);
                guessInput.disabled = true;
                showGameOver(
                    data.time_taken ? Math.round(data.time_taken) : null,
                    data.rank || null,
                    data.target_word,
                    data.definition
                );
            }
        }

        guessInput.value = '';
    })
    .catch(error => {
        console.error('Error in submitGuess:', error);
        alert('Error submitting guess. Please try again.');
    });
}

function showGameOver(timeTaken, rank, targetWord, definition) {
    if (!targetWord) {
        console.error('No target word provided to showGameOver');
        targetWord = '????';
    }
    
    console.log('Definition received:', definition); // Debug log
    
    const gameOverMessage = document.getElementById('game-over-message');
    gameOverMessage.innerHTML = "";

    let gameOverContent = document.createElement('div');
    gameOverContent.className = "game-over-content";

    let message = document.createElement('p');
    message.textContent = timeTaken ? "Congrats!" : "Game Over!";
    gameOverContent.appendChild(message);

    if (timeTaken) {
        let timeMessage = document.createElement('p');
        timeMessage.textContent = `Time: ${timeTaken} seconds`;
        gameOverContent.appendChild(timeMessage);

        if (rank) {
            let rankMessage = document.createElement('p');
            rankMessage.textContent = `Rank: ${rank}`;
            gameOverContent.appendChild(rankMessage);
        }
    }

    let wordWas = document.createElement('p');
    wordWas.innerHTML = `The word was: <strong>${targetWord.toUpperCase()}</strong>`;
    gameOverContent.appendChild(wordWas);

    if (definition) {
        let def = document.createElement('p');
        def.className = 'definition';
        def.innerHTML = `<strong>Definition:</strong> ${definition}`;
        gameOverContent.appendChild(def);
    }

    let buttonsDiv = document.createElement('div');
    buttonsDiv.style.marginTop = '15px';
    
    let playAgainButton = document.createElement('button');
    playAgainButton.id = 'play-again';
    playAgainButton.textContent = 'New Game';
    playAgainButton.addEventListener('click', () => {
        location.reload();
    });
    
    let highScoresButton = document.createElement('button');
    highScoresButton.id = 'show-high-scores';
    highScoresButton.textContent = 'High Scores';
    highScoresButton.addEventListener('click', () => {
        showHighScores(parseInt(wordLength));
    });

    buttonsDiv.appendChild(playAgainButton);
    buttonsDiv.appendChild(document.createTextNode(' '));
    buttonsDiv.appendChild(highScoresButton);
    
    gameOverContent.appendChild(buttonsDiv);
    gameOverMessage.appendChild(gameOverContent);
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

function showHighScores(initialWordLength = 5) {
    const modal = document.getElementById('high-scores-modal');
    modal.style.display = 'block';

    // Clear any previous active states
    document.querySelectorAll('.tab-button').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.length === initialWordLength.toString()) {
            tab.classList.add('active');
        }
    });

    loadScoresForLength(initialWordLength);

    // Add event listeners for tab switching
    document.querySelectorAll('.tab-button').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.tab-button').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            loadScoresForLength(this.dataset.length);
        });
    });
}

function loadScoresForLength(wordLength) {
    fetch(`/get_scores/${wordLength}`)
        .then(response => response.json())
        .then(scores => {
            const scoresList = document.getElementById('high-scores-list');
            
            let html = `
                <table class="scores-table">
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Name</th>
                            <th>Time</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            if (scores.length === 0) {
                html += `
                    <tr>
                        <td colspan="3" style="text-align: center;">No scores yet for ${wordLength}-letter words</td>
                    </tr>
                `;
            } else {
                scores.forEach((score, index) => {
                    html += `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${score.name}</td>
                            <td>${Math.round(score.time)} seconds</td>
                        </tr>
                    `;
                });
            }

            html += '</tbody></table>';
            scoresList.innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading scores:', error);
            const scoresList = document.getElementById('high-scores-list');
            scoresList.innerHTML = '<p>Error loading scores. Please try again later.</p>';
        });
}

function showGameOver(timeTaken, rank, targetWord, definition) {
    // document.getElementById('game-time').textContent = timeTaken || "";
    // document.getElementById('game-rank').textContent = rank || "";
    
    const gameOverMessage = document.getElementById('game-over-message');
    gameOverMessage.innerHTML = "";

    let gameOverContent = document.createElement('div');
    gameOverContent.className = "game-over-content";

    let message = document.createElement('p');
    message.textContent = timeTaken ? "Congrats!" : "Game Over!";
    gameOverContent.appendChild(message);

    // Add time and rank if it's a win
    if (timeTaken) {
        let timeMessage = document.createElement('p');
        timeMessage.textContent = `Time: ${timeTaken} seconds`;
        gameOverContent.appendChild(timeMessage);

        if (rank) {
            let rankMessage = document.createElement('p');
            rankMessage.textContent = `Rank: ${rank}`;
            gameOverContent.appendChild(rankMessage);
        }
    }

    let wordWas = document.createElement('p');
    wordWas.innerHTML = `The word was: <strong>${targetWord.toUpperCase()}</strong>`;
    gameOverContent.appendChild(wordWas);

    if (!timeTaken && definition) {
        let def = document.createElement('p');
        def.textContent = "Definition: " + definition;
        gameOverContent.appendChild(def);
    }

    let buttonsDiv = document.createElement('div');
    
    let playAgainButton = document.createElement('button');
    playAgainButton.id = 'play-again';
    playAgainButton.textContent = 'New Game';
    playAgainButton.addEventListener('click', () => {
        location.reload();
    });
    
    let highScoresButton = document.createElement('button');
    highScoresButton.id = 'show-high-scores';
    highScoresButton.textContent = 'High Scores';
    highScoresButton.addEventListener('click', () => {
        showHighScores(parseInt(wordLength));
    });

    buttonsDiv.appendChild(playAgainButton);
    buttonsDiv.appendChild(document.createTextNode(' '));
    buttonsDiv.appendChild(highScoresButton);
    
    gameOverContent.appendChild(buttonsDiv);
    gameOverMessage.appendChild(gameOverContent);
}
