from flask import Flask, render_template, request, jsonify, session
from flask_cors import CORS
import random
import requests
import os
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client
from wordLists import WORDS

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app, 
     supports_credentials=True,
     resources={
         r"/*": {
             "origins": ["https://stmarysedenderry.ie"],
             "methods": ["GET", "POST", "OPTIONS"],
             "allow_headers": ["Content-Type"],
             "expose_headers": ["Content-Range", "X-Content-Range"]
         }
     })
app.secret_key = 'your_secret_key'  # Required for session management
app.config['SESSION_COOKIE_SAMESITE'] = 'None'
app.config['SESSION_COOKIE_SECURE'] = True

# Initialize Supabase
supabase_url = os.getenv('SUPABASE_URL')
supabase_key = os.getenv('SUPABASE_KEY')


if not supabase_url or not supabase_key:
    raise Exception("Missing SUPABASE_URL or SUPABASE_KEY environment variables")

# Initialize Supabase
supabase = create_client(
    supabase_url,
    supabase_key
)

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/start_game', methods=['POST'])
def start_game():
    data = request.json
    word_length = int(data['wordLength'])
    mode = data['mode']
    target_word = random.choice(WORDS[word_length][mode])
    session['target_word'] = target_word
    session['guesses'] = []
    session['start_time'] = datetime.now().timestamp()
    return jsonify({
        'status': 'ready',
        'target_word': target_word  # Added for testing
    })

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
            definition = fetchDictionaryEntry(target_word)  # Fetch definition here
            # Get current scores for this word length to determine rank
            response = supabase.table('wurdle_scores').select('*')\
                .eq('word_length', str(len(target_word)))\
                .order('time')\
                .execute()
            current_scores = response.data
            rank = 1
            for score in current_scores:
                if score['time'] < time_taken:
                    rank += 1

            return jsonify({
                'feedback': feedback,
                'guesses': session['guesses'],
                'game_over': True,
                'time_taken': time_taken,
                'correct': True,
                'target_word': target_word,
                'definition': definition, # Include definition
                'rank': rank
            })
        elif is_sixth_guess:  # Max guesses reached
            definition = fetchDictionaryEntry(target_word)  # Fetch definition here
            return jsonify({
                'feedback': feedback,
                'guesses': session['guesses'],
                'game_over': True,
                'correct': False,
                'target_word': target_word,
                'definition': definition # Include definition
            })
        else:
            return jsonify({
                'feedback': feedback,
                'guesses': session['guesses'],
                'game_over': False,
                'correct': False,
                'target_word': target_word # Still send target word for use if game ends
            })
    except Exception as e:
        app.logger.error(f"Error in submit_guess: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/submit_score', methods=['POST'])
def submit_score():
    try:
        data = request.json
        name = data.get('name')
        time = data.get('time')
        word_length = str(data.get('wordLength'))
        
        if not all([name, time, word_length]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        # Get current scores for this word length
        response = supabase.table('wurdle_scores').select('*')\
            .eq('word_length', word_length)\
            .order('time')\
            .execute()
            
        current_scores = response.data
        
        # Check if this score qualifies for top 20
        if len(current_scores) < 20 or time < current_scores[-1]['time']:
            # Insert the new score
            supabase.table('wurdle_scores').insert({
                'name': name,
                'time': time,
                'word_length': word_length
            }).execute()
            
            # Delete scores beyond top 20 if necessary
            if len(current_scores) >= 20:
                # Get new scores after insertion
                response = supabase.table('wurdle_scores').select('*')\
                    .eq('word_length', word_length)\
                    .order('time')\
                    .execute()
                new_scores = response.data
                
                # Delete scores beyond top 20
                for score in new_scores[20:]:
                    supabase.table('wurdle_scores')\
                        .delete()\
                        .eq('id', score['id'])\
                        .execute()
            
            # Calculate rank
            rank = 1
            for score in current_scores:
                if score['time'] < time:
                    rank += 1
            return jsonify({'rank': rank})
            
        return jsonify({'rank': None})
        
    except Exception as e:
        print(f"Error submitting score: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/get_scores/<word_length>', methods=['GET'])
def get_scores(word_length):
    try:
        response = supabase.table('wurdle_scores').select('*')\
            .eq('word_length', word_length)\
            .order('time')\
            .limit(20)\
            .execute()
            
        return jsonify(response.data)
    except Exception as e:
        print(f"Error getting scores: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/fetch_definition', methods=['POST'])
def fetch_definition():
    try:
        word = request.json.get('word')
        if not word:
            return jsonify({'definition': 'No word provided'}), 400
            
        definition = fetchDictionaryEntry(word)
        return jsonify({'definition': definition or 'No definition found'})
    except Exception as e:
        print(f"Error in fetch_definition: {str(e)}")
        return jsonify({'definition': 'Error fetching definition'}), 500

@app.route('/get_target_word', methods=['GET'])
def get_target_word():
    target_word = session.get('target_word', '')
    return jsonify({'target_word': target_word})

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

if __name__ == '__main__':
    app.run(debug=True)
