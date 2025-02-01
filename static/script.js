let wordLength = 5;
let currentRow = 0;
let timerInterval;
let startTime;
let timerMinutes = 0;
let timerSeconds = 0;
let usedLetters = new Set();

function initializeAlphabetGrid() {
    const grid = document.getElementById('alphabet-grid');
    grid.innerHTML = ''; // Clear existing letters
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
    
    // Setup tab functionality
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
    
    // Load scores
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
                        <td>${index + 1}</td>
                        <td>${score.name}</td>
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
        // console.log(`Target word is: ${data.target_word}`); // For testing
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

        // Reset used letters
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
            
            if (data.correct) {
                const timeTaken = Math.round(data.time_taken);
                fetch(`/get_scores/${wordLength}`)
                .then(response => response.json())
                .then(scores => {
                    if (scores.length < 20 || timeTaken < scores[scores.length - 1].time) {
                        const name = prompt("You got a high score! Enter your name:");
                        if (name) {
                            fetch('/submit_score', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                    name: name,
                                    time: timeTaken,
                                    wordLength: wordLength
                                }),
                            })
                            .then(response => response.json())
                            .then(rankData => {
                                showGameOverContent(timeTaken, rankData.rank);
                            });
                        }
                    } else {
                        showGameOverContent(timeTaken, 1);
                    }
                });
            } else {
                showGameOverFailure(data.target_word);
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
    console.log(`Time elapsed: ${elapsed} seconds`);
    timerMinutes = Math.floor(elapsed / 60);
    timerSeconds = elapsed % 60;

    // Add leading zeros if needed
    const minutesStr = timerMinutes < 10 ? '0' + timerMinutes : timerMinutes;
    const secondsStr = timerSeconds < 10 ? '0' + timerSeconds : timerSeconds;

    document.getElementById('timer-minutes').textContent = minutesStr;
    document.getElementById('timer-seconds').textContent = secondsStr;
}

function showGameOverContent(timeTaken, rank) {
    document.getElementById('game-time').textContent = timeTaken;
    document.getElementById('game-rank').textContent = rank;
    document.querySelector('.game-over-content').style.display = 'block';
}

function showGameOverFailure(targetWord) {
    fetchAndDisplayDefinition(targetWord);
}

function fetchAndDisplayDefinition(targetWord) {
    fetch('/fetch_definition', {
        method: 'POST',
        headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ word: targetWord }),
        }) 
    .then(response => {
        if (!response.ok) {
            throw new Error(`Definition not found for ${targetWord}`);
        }
        return response.json();
    })
    .then(definitionData => {
        // Only display the definition if it exists:
        if (definitionData.definition) {  // Check if definitionData.definition exists
            document.getElementById('game-over-message').innerHTML = `
                <div class="game-over-content">
                    <p>Game Over!</p>
                    <p>The word was: <strong>${targetWord.toUpperCase()}</strong></p>
                    <p>Definition: ${definitionData.definition}</p>
                    <div>
                        <button id="play-again">New Game</button> <button id="show-high-scores">High Scores</button>
                    </div>
                </div>
            `;
        } else {
            document.getElementById('game-over-message').innerHTML = `
                <div class="game-over-content">
                    <p>Game Over!</p>
                    <p>The word was: <strong>${targetWord.toUpperCase()}</strong></p>
                    <div>
                        <button id="play-again">New Game</button> <button id="show-high-scores">High Scores</button>
                    </div>
                </div>
            `;
        }
    })
    .catch(error => {
        console.error('Error fetching definition:', error);
        document.getElementById('game-over-message').innerHTML = `
                <div class="game-over-content">
                    <p>Game Over!</p>
                    <div>
                        <button id="play-again">New Game</button> <button id="show-high-scores">High Scores</button>
                    </div>
                </div>
            `;

    });
}

function showGameOverError() {
    document.getElementById('game-over-message').innerHTML = `
        <div class="game-over-content">
            <p>Game Over!</p>
            <p>An error occurred. Please try again.</p>
            <div>
                <button id="play-again">New Game</button>
                <button id="show-high-scores">High Scores</button>
            </div>
        </div>
    `;
}

function addPlayAgainListener() {
    document.getElementById('play-again').addEventListener('click', () => {
        location.reload();
    });
}



// Add the event listener to a *static* parent element (e.g., the body):
document.body.addEventListener('click', function(event) {
    if (event.target && event.target.id === 'play-again') {
        location.reload();
    } else if (event.target && event.target.id === 'show-high-scores') {
        showHighScores(parseInt(wordLength));
    }
});

// Initialize alphabet grid on page load
initializeAlphabetGrid();
