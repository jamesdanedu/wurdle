// Global variables
let wordLength = 5;
let currentRow = 0;
let timerInterval;
let startTime;
let timerMinutes = 0;
let timerSeconds = 0;
let usedLetters = new Set();
let globalEventListenersInitialized = false;
let selectedLanguage = 'en';

// Language-specific alphabets
const LANGUAGE_ALPHABETS = {
    'en': 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'fr': 'ABCDEFGHIJKLMNOPQRSTUVWXYZÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸ',
    'es': 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZÁÉÍÓÚÜ',
    'ga': 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚ'
};

// Authentication check function
async function checkAuth() {
    try {
        const response = await fetch('/auth/status', {
            credentials: 'include'
        });
        const data = await response.json();
        
        const authCheck = document.getElementById('auth-check');
        const gameContent = document.getElementById('game-content');
        const userEmail = document.getElementById('user-email');
        
        if (data.authenticated) {
            // Show game, hide auth check
            authCheck.style.display = 'none';
            gameContent.style.display = 'block';
            // Display user email
            userEmail.textContent = data.user.email;
        } else {
            // Show auth check, hide game
            authCheck.style.display = 'flex';
            gameContent.style.display = 'none';
            userEmail.textContent = '';
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
    }
}

function initializeEventListeners() {
    document.addEventListener('DOMContentLoaded', function() {
        // Check authentication immediately and periodically
        checkAuth();
        setInterval(checkAuth, 60000); // Check every minute

        const languageSelect = document.getElementById('language');
        const wordLengthSelect = document.getElementById('word-length');
        
        // Initialize with default language
        selectedLanguage = languageSelect.value;
        initializeAlphabetGrid();

        // Handle language change
        languageSelect.addEventListener('change', function() {
            handleLanguageChange(this.value);
        });

        // Start game button listener
        const startButton = document.getElementById('start-game');
        startButton.addEventListener('click', startGame);

        // Setup guess input
        const guessInput = document.getElementById('guess-input');
        if (guessInput) {
            guessInput.addEventListener('keyup', function(event) {
                if (event.key === "Enter") {
                    event.preventDefault();
                    submitGuess();
                }
            });
        }

        // Setup modal close button
        const closeButton = document.querySelector('.close-button');
        if (closeButton) {
            closeButton.addEventListener('click', function() {
                document.getElementById('high-scores-modal').style.display = 'none';
            });
        }
    });
}

function startGame() {
    // Check authentication first
    fetch('/auth/status')
        .then(response => response.json())
        .then(data => {
            if (!data.authenticated) {
                const loginModal = document.getElementById('login-modal');
                loginModal.style.display = 'block';
                return;
            }
            
            // Show user info if authenticated
            const userInfo = document.getElementById('user-info');
            const userEmail = document.getElementById('user-email');
            if (userInfo && userEmail) {
                userInfo.style.display = 'block';
                userEmail.textContent = data.user.email;
            }
            
            // Clear any existing timer
            if (timerInterval) {
                stopTimer();
            }

            // Get all game settings from dropdowns
            wordLength = document.getElementById('word-length').value;
            const mode = document.getElementById('mode').value;
            selectedLanguage = document.getElementById('language').value;
            
            fetch('/start_game', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    wordLength, 
                    mode, 
                    language: selectedLanguage
                }),
                credentials: 'include'
            })
            .then(response => {
                if (!response.ok) {
                    if (response.status === 401) {
                        window.location.href = '/auth/login';
                        return;
                    }
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(data => {
                // Update display states
                const setupScreen = document.getElementById('setup-screen');
                const gameContainer = document.querySelector('.game-container');

                // Hide setup, show game
                setupScreen.style.display = 'none';
                gameContainer.style.display = 'flex';

                // Reset game state
                currentRow = 0;

                // Initialize game grid
                const guessesDiv = document.getElementById('guesses');
                guessesDiv.innerHTML = '';
                const numGuesses = 6;  // Maximum number of guesses allowed

                // Create rows with correct number of cells
                for (let i = 0; i < numGuesses; i++) {
                    const guessRow = document.createElement('div');
                    guessRow.className = 'guess-row';
                    
                    // Create cells based on word length
                    for (let j = 0; j < parseInt(wordLength); j++) {
                        const letterDiv = document.createElement('span');
                        letterDiv.className = 'letter-cell';
                        guessRow.appendChild(letterDiv);
                    }
                    guessesDiv.appendChild(guessRow);
                }

                // Initialize other game elements
                usedLetters.clear();
                initializeAlphabetGrid();

                // Start timer
                startTime = Date.now();
                timerMinutes = 0;
                timerSeconds = 0;
                timerInterval = setInterval(updateTimer, 1000);
                
                // Setup input field
                const guessInput = document.getElementById('guess-input');
                if (guessInput) {
                    guessInput.maxLength = parseInt(wordLength);
                    guessInput.value = '';
                    guessInput.disabled = false;
                    guessInput.placeholder = `Enter ${wordLength} letter word`;
                    
                    // Focus the input field
                    guessInput.focus();
                }

                // Clear any previous game over message
                document.getElementById('game-over-message').innerHTML = '';
            })
            .catch(error => {
                console.error('Error starting game:', error);
                const errorModal = document.getElementById('error-modal');
                const errorMessage = document.getElementById('error-message');
                errorMessage.textContent = 'Error starting game. Please try again.';
                errorModal.style.display = 'block';
            });
        })
        .catch(error => {
            console.error('Error checking authentication:', error);
            const errorModal = document.getElementById('error-modal');
            const errorMessage = document.getElementById('error-message');
            errorMessage.textContent = 'Error checking authentication status. Please try again.';
            errorModal.style.display = 'block';
        });
}

function updateTimer() {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    timerMinutes = Math.floor(elapsed / 60);
    timerSeconds = elapsed % 60;

    const minutesStr = timerMinutes.toString().padStart(2, '0');
    const secondsStr = timerSeconds.toString().padStart(2, '0');

    const minutesDisplay = document.getElementById('timer-minutes');
    const secondsDisplay = document.getElementById('timer-seconds');
    
    if (minutesDisplay && secondsDisplay) {
        minutesDisplay.textContent = minutesStr;
        secondsDisplay.textContent = secondsStr;
    }
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function getElapsedTime() {
    return Math.floor((Date.now() - startTime) / 1000);
}

function initializeAlphabetGrid() {
 
    const grid = document.getElementById('alphabet-grid');
    grid.innerHTML = '';
    
    // Add french-grid class if French is selected
    grid.className = selectedLanguage === 'fr' ? 'french-grid' : '';
    
    const alphabet = LANGUAGE_ALPHABETS[selectedLanguage];
    
    alphabet.split('').forEach(letter => {
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

function handleLanguageChange(language) {
    selectedLanguage = language;
    usedLetters.clear();
    initializeAlphabetGrid();
    updateWordLengthOptions(language);
}

function updateWordLengthOptions(language) {
    const languageLengths = {
        'en': [4, 5, 6, 7],
        'ga': [4, 5, 6],
        'fr': [4, 5, 6],
        'es': [4, 5, 6]
    };

    const wordLengthSelect = document.getElementById('word-length');
    const currentLength = wordLengthSelect.value;
    wordLengthSelect.innerHTML = '';

    languageLengths[language].forEach(length => {
        const option = document.createElement('option');
        option.value = length;
        option.textContent = `${length} Letters`;
        if (length === parseInt(currentLength) && languageLengths[language].includes(parseInt(currentLength))) {
            option.selected = true;
        }
        wordLengthSelect.appendChild(option);
    });
}

function submitGuess() {
    const guessInput = document.getElementById('guess-input');
    if (!guessInput) {
        console.error('Guess input element not found');
        return;
    }

    const guess = guessInput.value.toLowerCase();
    
    // Validate guess length
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
        credentials: 'include'
    })
    .then(response => {
        if (!response.ok) {
            if (response.status === 401) {
                window.location.href = '/auth/login';
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.error) {
            throw new Error(data.error);
        }

        const guessesDiv = document.getElementById('guesses');
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

        const gameIsWon = data.feedback.every(f => f.status === 'correct');
        const gameIsLost = currentRow >= 6;
        
        if (gameIsWon || gameIsLost) {
            stopTimer();
            guessInput.disabled = true;
            
            if (gameIsWon) {
                const finalTime = getElapsedTime();
                
                // Prompt for name and submit score
                let nameInput = prompt("Congratulations! Enter your name for the high score:");
                if (nameInput) {
                    fetch('/submit_score', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            name: nameInput,
                            time: finalTime,
                            wordLength: wordLength,
                            language: selectedLanguage
                        }),
                        credentials: 'include'
                    })
                    .then(response => response.json())
                    .then(scoreData => {
                        showGameOver(finalTime, data.target_word);
                    })
                    .catch(error => {
                        console.error('Error submitting score:', error);
                        showGameOver(finalTime, data.target_word);
                    });
                } else {
                    showGameOver(finalTime, data.target_word);
                }
            } else {
                // Get target word for game over message
                fetch('/get_target_word')
                    .then(response => response.json())
                    .then(wordData => {
                        showGameOver(null, wordData.target_word);
                    })
                    .catch(error => {
                        console.error('Error getting target word:', error);
                        showGameOver(null, 'Error getting word');
                    });
            }
        }

        guessInput.value = '';

    })
    .catch(error => {
        console.error('Error in submitGuess:', error);
        alert('Error submitting guess. Please try again.');
    });
}

function showGameOver(timeTaken, targetWord) {
    const gameOverMessage = document.getElementById('game-over-message');
    gameOverMessage.innerHTML = "";

    let gameOverContent = document.createElement('div');
    gameOverContent.className = "game-over-content";

    if (timeTaken) {
        // Win condition - no need for dictionary lookup
        let message = document.createElement('p');
        message.textContent = "Congrats!";
        gameOverContent.appendChild(message);

        let timeMessage = document.createElement('p');
        timeMessage.textContent = `Time: ${timeTaken} seconds`;
        gameOverContent.appendChild(timeMessage);
    } else {
        // Loss condition - only lookup dictionary for English words
        let message = document.createElement('p');
        message.textContent = "Game Over!";
        gameOverContent.appendChild(message);

        // Only fetch definition for English words when game is lost
        if (selectedLanguage === 'en') {
            fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${targetWord}`)
                .then(response => response.json())
                .then(data => {
                    if (data[0] && data[0].meanings && data[0].meanings[0]) {
                        let def = document.createElement('p');
                        def.className = 'definition';
                        def.innerHTML = `<strong>Definition:</strong> ${data[0].meanings[0].definitions[0].definition}`;
                        gameOverContent.appendChild(def);
                    }
                })
                .catch(error => console.error('Error fetching definition:', error));
        }
    }

    let wordWas = document.createElement('p');
    if (selectedLanguage === 'en') {
        wordWas.innerHTML = `The word was: <strong>${targetWord.toUpperCase()}</strong>`;
    }
    else if (selectedLanguage === 'fr') {
        wordWas.innerHTML = `Le mot était: <strong>${targetWord.toUpperCase()}</strong>`;   
    }
    else if (selectedLanguage === 'ga') {
        wordWas.innerHTML = `Bhí an focal: <strong>${targetWord.toUpperCase()}</strong>`;  
    }
    else if (selectedLanguage === 'es') {
        wordWas.innerHTML = `La palabra era: <strong>${targetWord.toUpperCase()}</strong>`;        
    }
    gameOverContent.appendChild(wordWas);

    let buttonsDiv = document.createElement('div');
    buttonsDiv.style.marginTop = '15px';
    
    let playAgainButton = document.createElement('button');
    playAgainButton.textContent = 'New Game';
    playAgainButton.addEventListener('click', () => location.reload());
    
    let highScoresButton = document.createElement('button');
    highScoresButton.textContent = 'High Scores';
    highScoresButton.addEventListener('click', () => showHighScores(parseInt(wordLength)));

    buttonsDiv.appendChild(playAgainButton);
    buttonsDiv.appendChild(document.createTextNode(' '));
    buttonsDiv.appendChild(highScoresButton);
    
    gameOverContent.appendChild(buttonsDiv);
    gameOverMessage.appendChild(gameOverContent);
}

function showHighScores(initialWordLength = 5) {
    const modal = document.getElementById('high-scores-modal');
    modal.style.display = 'block';

    document.querySelectorAll('.tab-button').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.length === initialWordLength.toString()) {
            tab.classList.add('active');
        }
    });

    loadScoresForLength(initialWordLength, selectedLanguage);

    document.querySelectorAll('.tab-button').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.tab-button').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            loadScoresForLength(this.dataset.length, selectedLanguage);
        });
    });
}

function loadScoresForLength(wordLength, language) {
    const languageNames = {
        'en': 'English',
        'ga': 'Gaeilge',
        'fr': 'Français',
        'es': 'Español'
    };

    fetch(`/get_scores/${wordLength}?language=${language}`)
        .then(response => response.json())
        .then(scores => {
            const scoresList = document.getElementById('high-scores-list');
            
            const languageName = languageNames[language];
            
            let html = `
                <table class="scores-table">
                    <thead>
                        <tr>
                            <th colspan="3">High Scores - ${wordLength} Letters (${languageName})</th>
                        </tr>
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
                        <td colspan="3" style="text-align: center;">No scores yet for ${wordLength}-letter ${languageName} words</td>
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

// Add authentication headers to all fetch requests
const originalFetch = window.fetch;
window.fetch = function() {
    let [resource, config] = arguments;
    if(config === undefined) {
        config = {};
    }
    if(config.credentials === undefined) {
        config.credentials = 'include';
    }
    return originalFetch.apply(this, [resource, config]);
};

// Initialize event listeners when the script loads
initializeEventListeners();
