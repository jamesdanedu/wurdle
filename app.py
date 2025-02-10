from flask import Flask, render_template, request, jsonify, session, redirect
from flask_cors import CORS
import random
import requests
import os
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client
from wordLists import WORDS
from functools import wraps
from msal import ConfidentialClientApplication

# Load environment variables
load_dotenv()

app = Flask(__name__)
#CORS(app, 
#     supports_credentials=True,
#     resources={
#         r"/*": {
#             "origins": ["https://stmarysedenderry.ie"],
#             "methods": ["GET", "POST", "OPTIONS"],
#             "allow_headers": ["Content-Type"],
#             "expose_headers": ["Content-Range", "X-Content-Range"]
#         }
#     })
CORS(app, 
     supports_credentials=True,
     resources={
         r"/*": {
             "origins": ["http://localhost:5000", "https://stmarysedenderry.ie"],  # Add localhost
             "methods": ["GET", "POST", "OPTIONS"],
             "allow_headers": ["Content-Type"],
             "expose_headers": ["Content-Range", "X-Content-Range"]
         }
     })
app.secret_key = os.getenv('FLASK_SECRET_KEY', 'your_secret_key')
app.config['SESSION_COOKIE_SAMESITE'] = 'None'
app.config['SESSION_COOKIE_SECURE'] = True

# Initialize Supabase
supabase_url = os.getenv('SUPABASE_URL')
supabase_key = os.getenv('SUPABASE_KEY')

# Microsoft OAuth configuration
MS_CLIENT_ID = os.getenv('MS_CLIENT_ID')
MS_CLIENT_SECRET = os.getenv('MS_CLIENT_SECRET')
MS_TENANT_ID = os.getenv('MS_TENANT_ID')
REDIRECT_URI = 'http://localhost:5000/auth/callback' if os.getenv('FLASK_ENV') == 'development' else 'https://wurdle-orcin.vercel.app/auth/callback'

SCOPES = ['User.Read']
AUTHORITY = f'https://login.microsoftonline.com/{MS_TENANT_ID}'

if not all([supabase_url, supabase_key, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT_ID]):
    raise Exception("Missing required environment variables")

# Initialize Supabase
supabase = create_client(supabase_url, supabase_key)

# Initialize MSAL
msal_app = ConfidentialClientApplication(
    MS_CLIENT_ID,
    authority=AUTHORITY,
    client_credential=MS_CLIENT_SECRET
)

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function

# Authentication routes
@app.route('/auth/login')
def login():
    auth_url = msal_app.get_authorization_request_url(
        SCOPES,
        redirect_uri=REDIRECT_URI,
        state=os.urandom(16).hex()
    )
    return redirect(auth_url)

@app.route('/auth/callback')
def auth_callback():
    code = request.args.get('code')
    error = request.args.get('error')
    error_description = request.args.get('error_description')

    if error:
        print(f"Auth Error: {error} - {error_description}")
        return redirect(f'/?error={error}&error_description={error_description}')
    
    if not code:
        print("No authorization code received")
        return redirect('/?error=no_code')

    try:
        result = msal_app.acquire_token_by_authorization_code(
            code,
            scopes=SCOPES,
            redirect_uri=REDIRECT_URI
        )

        if 'error' in result:
            print(f"Token Error: {result.get('error')} - {result.get('error_description')}")
            return redirect(f'/?error={result["error"]}')

        claims = result.get('id_token_claims', {})
        email = claims.get('email', '').lower()
        name = claims.get('name', '')

        # Only check domain in production environment
        if os.getenv('FLASK_ENV') != 'development':
            if not email.endswith('@stmarysedenderry.ie'):
                print(f"Unauthorized email domain: {email}")
                return redirect('/?error=unauthorized_domain')

        session['user'] = {
            'email': email,
            'name': name,
            'access_token': result['access_token']
        }
        
        return_url = session.pop('return_url', '/')
        return redirect(return_url)

    except Exception as e:
        print(f"Authentication error: {str(e)}")
        return redirect('/?error=authentication_failed')
    

@app.route('/auth/status')
def auth_status():
    if 'user' not in session:
        return jsonify({'authenticated': False})
    return jsonify({
        'authenticated': True,
        'user': {
            'email': session['user']['email'],
            'name': session['user']['name']
        }
    })

@app.route('/auth/logout')
def logout():
    session.clear()
    return redirect('/')

# Game routes
@app.route('/')
def home():
    return render_template('index.html')

@app.route('/start_game', methods=['POST'])
@login_required
def start_game():
    data = request.json
    word_length = int(data['wordLength'])
    mode = data['mode']
    language = data.get('language', 'en')
    
    if language not in WORDS:
        language = 'en'
    
    target_word = random.choice(WORDS[language][word_length][mode])
    session['target_word'] = target_word
    session['language'] = language
    session['guesses'] = []
    session['start_time'] = datetime.now().timestamp()
    
    return jsonify({
        'status': 'ready',
        'target_word': target_word
    })

@app.route('/submit_guess', methods=['POST'])
def submit_guess():
    try:
        language = session.get('language', 'en')
        target_word = session.get('target_word', '').lower()
        
        if not target_word:
            return jsonify({"error": "No active game"}), 400

        guess = request.json.get('guess', '').lower()
        
        feedback = compare_words(guess, target_word)
        
        if 'guesses' not in session:
            session['guesses'] = []
        session['guesses'].append({'guess': guess, 'feedback': feedback})

        is_sixth_guess = len(session['guesses']) >= 6
        is_correct = guess == target_word
        
        response_data = {
            'feedback': feedback,
            'guesses': session['guesses'],
            'game_over': is_sixth_guess or is_correct,
        }
        
        if is_correct:
            end_time = datetime.now().timestamp()
            time_taken = end_time - session['start_time']
            response_data.update({
                'time_taken': time_taken,
                'correct': True
            })

        return jsonify(response_data)

    except Exception as e:
        print(f"Error in submit_guess: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/submit_score', methods=['POST'])
@login_required
def submit_score():
    try:
        data = request.json
        name = data.get('name')
        time = data.get('time')
        word_length = str(data.get('wordLength'))
        language = data.get('language', 'en')
        
        if not all([name, time, word_length, language]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        response = supabase.table('wurdle_scores').select('*')\
            .eq('word_length', word_length)\
            .eq('language', language)\
            .order('time')\
            .execute()
            
        current_scores = response.data
        
        if len(current_scores) < 20 or time < current_scores[-1]['time']:
            supabase.table('wurdle_scores').insert({
                'name': name,
                'time': time,
                'word_length': word_length,
                'language': language
            }).execute()
            
            if len(current_scores) >= 20:
                response = supabase.table('wurdle_scores').select('*')\
                    .eq('word_length', word_length)\
                    .eq('language', language)\
                    .order('time')\
                    .execute()
                new_scores = response.data
                
                for score in new_scores[20:]:
                    supabase.table('wurdle_scores')\
                        .delete()\
                        .eq('id', score['id'])\
                        .execute()
            
            rank = 1
            for score in current_scores:
                if score['time'] < time:
                    rank += 1
            return jsonify({'rank': rank})
            
        return jsonify({'rank': None})
        
    except Exception as e:
        print(f"Error submitting score: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/get_scores/<word_length>')
def get_scores(word_length):
    try:
        language = request.args.get('language', 'en')
        response = supabase.table('wurdle_scores').select('*')\
            .eq('word_length', word_length)\
            .eq('language', language)\
            .order('time')\
            .limit(20)\
            .execute()
            
        return jsonify(response.data)
    except Exception as e:
        print(f"Error getting scores: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/get_target_word')
@login_required
def get_target_word():
    target_word = session.get('target_word', '')
    return jsonify({'target_word': target_word})

# Helper functions
def normalize_guess(word, language):
    accented_map = {
        'fr': {
            'â': 'a', 'à': 'a', 'á': 'a',
            'ê': 'e', 'é': 'e', 'è': 'e', 
            'î': 'i', 'ï': 'i', 
            'ô': 'o', 'ö': 'o',
            'û': 'u', 'ü': 'u'
        },
        'es': {
            'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 
            'ñ': 'n'
        },
        'ga': {
            'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u'
        }
    }

    if language in accented_map:
        for accented, base in accented_map[language].items():
            word = word.replace(accented, base)
    
    return word

def fetchDictionaryEntry(word):
    url = f"https://api.dictionaryapi.dev/api/v2/entries/en/{word}"
    try:
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        
        if isinstance(data, list) and len(data) > 0:
            entry = data[0]
            if "meanings" in entry and entry["meanings"]:
                return entry["meanings"][0]["definitions"][0]["definition"]
        
        return "No definition found."
        
    except Exception as e:
        print(f"Error fetching definition: {e}")
        return f"Unable to fetch definition: {str(e)}"

def compare_words(guess, target_word):
    feedback = []
    target_letters = list(target_word)
    guess_letters = list(guess)

    # First pass: Check for correct letters in the correct position
    for i in range(len(target_word)):
        if guess_letters[i] == target_letters[i]:
            feedback.append({'letter': guess_letters[i], 'status': 'correct'})
            target_letters[i] = None
            guess_letters[i] = None
        else:
            feedback.append({'letter': guess_letters[i], 'status': 'absent'})

    # Second pass: Check for correct letters in the wrong position
    for i in range(len(target_word)):
        if guess_letters[i] is not None and guess_letters[i] in target_letters:
            feedback[i]['status'] = 'present'
            target_letters[target_letters.index(guess_letters[i])] = None

    return feedback

if __name__ == '__main__':
     app.run(debug=True, port=5000)
