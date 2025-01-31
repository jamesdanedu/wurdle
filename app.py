from flask import Flask, render_template, request, jsonify, session
from flask_cors import CORS
import random
import requests
import os
from datetime import datetime
from wordLists import WORDS

app = Flask(__name__)
CORS(app, supports_credentials=True)
app.secret_key = 'your_secret_key'  # Required for session management
app.config['SESSION_COOKIE_SAMESITE'] = 'None'
app.config['SESSION_COOKIE_SECURE'] = True

# In-memory database for top scores
top_scores = {4: [], 5: [], 6: [], 7: []}

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/start_game', methods=['POST'])
def start_game():
    data = request.json
    word_length = int(data['wordLength'])
    mode = data['mode']
    session['target_word'] = random.choice(WORDS[word_length][mode])
    session['guesses'] = []
    session['start_time'] = datetime.now().timestamp()  # Start the timer
    return jsonify({'status': 'ready'})

@app.route('/submit_guess', methods=['POST'])
def submit_guess():
    try:
        guess = request.json['guess'].lower()
        target_word = session.get('target_word', '').lower()
        if not target_word:
            app.logger.error("No target word in session")
            return jsonify({"error": "No active game"}), 500
            
        feedback = compare_words(guess, target_word)
        if 'guesses' not in session:
            session['guesses'] = []
        session['guesses'].append({'guess': guess, 'feedback': feedback})
    
        # Check if it's the 6th guess or correct
        is_sixth_guess = len(session['guesses']) >= 6
        is_correct = guess == target_word

        if is_correct:
            end_time = datetime.now().timestamp()
            time_taken = end_time - session['start_time']
            return jsonify({
                'feedback': feedback,
                'guesses': session['guesses'],
                'game_over': True,
                'time_taken': time_taken,
                'correct': True,
                'target_word': target_word
            })
        elif is_sixth_guess:  # Max guesses reached
            return jsonify({
                'feedback': feedback,
                'guesses': session['guesses'],
                'game_over': True,
                'correct': False,
                'target_word': target_word  # Make sure this is being sent
            })
        else:
            return jsonify({
                'feedback': feedback, 
                'guesses': session['guesses'],
                'game_over': False,
                'correct': False
            })
    except Exception as e:
        app.logger.error(f"Error in submit_guess: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/fetch_definition', methods=['POST'])
def fetch_definition():
    try:
        word = request.json.get('word')
        if not word:
            return jsonify({'definition': 'No word provided'}), 400
            
        definition = fetchDictionaryEntry(word)
        return jsonify({'definition': definition or 'No definition found'})
    except Exception as e:
        print(f"Error in fetch_definition: {str(e)}")  # Log the error
        return jsonify({'definition': 'Error fetching definition'}), 500

def fetchDictionaryEntry(word):
    """Fetch the dictionary entry for a word using DictionaryAPI.dev"""
    url = f"https://api.dictionaryapi.dev/api/v2/entries/en/{word}"
    try:
        print(f"Making API request to: {url}")  # Debug log
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        
        if isinstance(data, list) and len(data) > 0:
            entry = data[0]
            if "meanings" in entry and entry["meanings"]:
                return entry["meanings"][0]["definitions"][0]["definition"]
        
        return "No definition found."
        
    except Exception as e:
        print(f"Error fetching definition: {e}")  # Debug log
        return f"Unable to fetch definition: {str(e)}"
    
def compare_words(guess, target_word):
    feedback = []
    target_letters = list(target_word)
    guess_letters = list(guess)

    # First pass: Check for correct letters in the correct position
    for i in range(len(target_word)):
        if guess_letters[i] == target_letters[i]:
            feedback.append({'letter': guess_letters[i], 'status': 'correct'})
            target_letters[i] = None  # Mark this letter as used
            guess_letters[i] = None  # Mark this letter as used
        else:
            feedback.append({'letter': guess_letters[i], 'status': 'absent'})  # Default to absent

    # Second pass: Check for correct letters in the wrong position
    for i in range(len(target_word)):
        if guess_letters[i] is not None and guess_letters[i] in target_letters:
            feedback[i]['status'] = 'present'  # Update to present (yellow)
            target_letters[target_letters.index(guess_letters[i])] = None  # Mark this letter as used

    return feedback

@app.route('/get_target_word', methods=['GET'])
def get_target_word():
    target_word = session.get('target_word', '')
    return jsonify({'target_word': target_word})

if __name__ == '__main__':
    app.run(debug=True)
