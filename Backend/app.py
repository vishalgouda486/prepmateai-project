from flask import Flask, request, jsonify, send_from_directory, Response, stream_with_context
from flask_cors import CORS
from ai_logic import (
    get_ai_response, 
    generate_ai_question, 
    transcribe_audio_to_text, 
    extract_text_from_pdf,
    get_aptitude_question,
    get_aptitude_feedback,
    get_technical_question,
    run_code_with_judge0,
    get_communication_feedback,
    generate_communication_topic,
    get_managerial_response,
    get_hr_response,
    get_resume_response,
    get_final_report,
    client
)
import os
import time 

# ⭐️ --- NEW AUTH & DB IMPORTS --- ⭐️
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user

# Get the absolute path of the directory where this file is located
basedir = os.path.abspath(os.path.dirname(__file__))

# --- App & DB Configuration ---
app = Flask(__name__) 
# We must list the exact origins. 'localhost' and '127.0.0.1' are seen as different!
CORS(app,
     supports_credentials=True,
     origins=[
         "http://localhost:8000",
         "https://prepmateai-project.vercel.app",
         "https://prepmate-backend-bpfn.onrender.com",
         "https://prepmateai-project-production.up.railway.app"
     ],
     allow_headers=["Content-Type", "Authorization"],
     expose_headers=["Content-Type"]
)

# ⭐️ --- DATABASE CONFIGURATION UPDATE --- ⭐️
# Get the database URL from an environment variable
DATABASE_URL = os.environ.get('DATABASE_URL')

if DATABASE_URL:
    # Use the production PostgreSQL database
    # IMPORTANT: Render's URL starts with 'postgres://' but SQLAlchemy needs 'postgresql://'
    app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL.replace("postgres://", "postgresql://")
else:
    # Fallback to a local SQLite database for development
    print("WARNING: DATABASE_URL not set. Falling back to local prepmate.db")
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'prepmate.db')

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
# Make sure to change this secret key before deployment!
# Load the secret key from environment variables
SECRET_KEY = os.environ.get('SECRET_KEY')
if not SECRET_KEY:
    print("WARNING: SECRET_KEY not set. Using insecure default for local dev.")
    # This fallback key is ONLY for running on your local computer
    SECRET_KEY = 'a-fallback-key-for-local-dev-only-not-production'
app.config['SECRET_KEY'] = SECRET_KEY

# ⭐️ --- ADD THESE 3 LINES FOR CROSS-DOMAIN LOGIN --- ⭐️
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = True  # Ensures cookie is only sent over HTTPS
app.config['SESSION_COOKIE_SAMESITE'] = 'None' # Allows cookie to be sent cross-domain
# ⭐️ --- END OF NEW LINES --- ⭐️

db = SQLAlchemy(app)
bcrypt = Bcrypt(app) 

# ⭐️ --- NEW: LOGIN MANAGER CONFIGURATION --- ⭐️
login_manager = LoginManager()
login_manager.init_app(app)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))
# ----------------------------------------------

# --- FOLDER CONFIGURATION ---
UPLOAD_FOLDER = 'uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# --- Global variable for resume text (for MOCK.HTML) ---
current_resume_text = None

# ⭐️ --- UPDATED DATABASE MODELS (to work with Flask-Login) --- ⭐️
class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False) # Password is now required
    username = db.Column(db.String(80), unique=True, nullable=False)

    def __repr__(self):
        return f'<User {self.username}>'
# ⭐️ --- END UPDATED DATABASE MODELS --- ⭐️

# ---------------- GEMINI CHATBOT ENDPOINT ------------------


@app.route('/api/gemini', methods=['POST'])
def chat_gemini_stream():
    try:
        data = request.get_json()
        prompt = data.get("prompt", "")

        if not prompt:
            # We must return a normal JSON error here, not SSE
            return jsonify({"error": "Missing prompt"}), 400


        # System Instruction for Conciseness and HTML (Crucial for formatting and length)
        system_instruction = (
           "You are PrepAura Nexus, a helpful, but **highly concise** assistant. "
            "Keep your answers brief, under 80 words. "
            "**ABSOLUTELY DO NOT USE MARKDOWN (e.g., **, ##, -, *, |)**. "
            "Use only these HTML tags for formatting: <strong>, <br>, <ul>, <li>. **DO NOT USE <p>** or <h1> tags."
            "for all text, headings, and lists."
        )

        def stream_gemini_response():
            try:
                # ⭐️ Use the streaming API ⭐️
                response_stream = client.models.generate_content_stream(
                    model="gemini-2.5-flash",
                    contents=[system_instruction, prompt]
                )
                for chunk in response_stream:
                    # Escape newlines for transport, but primarily use the white-space: pre-wrap on the front end
                    # We only send the text part of the chunk
                    if chunk.text:
                        # ⭐️ SSE format: data: [content]\n\n ⭐️
                        # The replace call is a small safety measure against malformed SSE events
                        yield f"data: {chunk.text}\n\n" 
                
                # Signal the end of the stream
                yield "data: [DONE]\n\n"

            except Exception as e:
                # Log error and send an error message to the client
                print(f"Gemini Streaming Error: {e}")
                yield f"data: [ERROR] An error occurred: {str(e)}\n\n"

        # ⭐️ Return the response as a stream with the text/event-stream MIME type ⭐️
        return Response(
            stream_with_context(stream_gemini_response()),
            mimetype='text/event-stream'
        )

    except Exception as e:
        print("API Setup Error:", e)
        # For setup/non-streaming errors, return standard JSON error
        return jsonify({"error": "Server Setup Error"}), 500


# Serve frontend files from the parent 'frontend' folder
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    frontend_folder = os.path.join(os.path.dirname(__file__), '..', 'frontend')
    
    # If the requested file exists, serve it
    if path != "" and os.path.exists(os.path.join(frontend_folder, path)):
        return send_from_directory(frontend_folder, path)
    
    # Otherwise, serve login.html by default
    return send_from_directory(frontend_folder, 'login.html')



# ⭐️ --- AUTHENTICATION ROUTES (CLEANED) --- ⭐️

@app.route('/api/signup', methods=['POST']) 
def signup():
    data = request.get_json()
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')

    if not username or not email or not password:
        return jsonify({"error": "Missing username, email, or password"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already exists"}), 409
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already exists"}), 409

    hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
    new_user = User(username=username, email=email, password_hash=hashed_password)
    db.session.add(new_user)
    db.session.commit()

    return jsonify({"message": "User created successfully"}), 201

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({"error": "Missing email or password"}), 400

    user = User.query.filter_by(email=email).first()

    if user and bcrypt.check_password_hash(user.password_hash, password):
        login_user(user)
        response = jsonify({
            "message": "Login successful",
            "username": user.username,
            "redirect": "/home.html"
        })
        # ⭐️ --- BUG FIX: REMOVED BAD .headers.add LINES --- ⭐️
        return response, 200

    return jsonify({"error": "Invalid email or password"}), 401

@app.route('/api/logout', methods=['POST'])
@login_required 
def logout():
    logout_user()
    return jsonify({"message": "Logout successful"}), 200

@app.route('/api/check_session', methods=['GET'])
def check_session():
    if current_user.is_authenticated:
        response = jsonify({"is_logged_in": True, "username": current_user.username})
    else:
        response = jsonify({"is_logged_in": False})

    # ⭐️ --- BUG FIX: REMOVED BAD .headers.add LINES --- ⭐️
    return response, 200
        
# 🟢 LIGHTWEIGHT PING ROUTE TO KEEP SERVER ALIVE
@app.route('/api/ping', methods=['GET'])
def ping():
    return jsonify({"alive": True}), 200

@app.route('/api/save_report', methods=['POST'])
@login_required 
def save_report():
    user_id = current_user.id
    data = request.get_json()
    report_content = data.get('report_markdown')

    if not report_content:
        return jsonify({"error": "No report content provided"}), 400

    print(f"User {user_id} saved a report:")
    print(report_content)
    
    return jsonify({"message": "Report saved successfully (simulated)"}), 201

# --- API Routes (CLEANED) ---
@app.route('/technical-question', methods=['POST'])
def technical_question():
    data = request.get_json()
    topic = data.get("topic")
    language = data.get("language")
    if not topic or not language:
        return jsonify({"error": "Missing 'topic' or 'language' field"}), 400
    question_data = get_technical_question(topic, language)
    if "error" in question_data:
        return jsonify(question_data), 500
    return jsonify(question_data)

@app.route('/run-code', methods=['POST'])
def run_code():
    data = request.get_json()
    user_code = data.get("user_code")
    language = data.get("language")
    test_cases = data.get("test_cases")
    if not all([user_code, language, test_cases]):
        return jsonify({"error": "Missing code, language, or test cases."}), 400
    results = run_code_with_judge0(user_code, language, test_cases)
    return jsonify(results)

@app.route('/aptitude-question', methods=['POST'])
def aptitude_question():
    data = request.get_json()
    topic = data.get("topic")
    if not topic:
        return jsonify({"error": "Missing 'topic' field"}), 400
    question_data = get_aptitude_question(topic)
    if "error" in question_data:
        return jsonify(question_data), 500
    return jsonify(question_data)

@app.route('/aptitude-feedback', methods=['POST'])
def aptitude_feedback():
    data = request.get_json()
    results = data.get("results")
    if not results:
        return jsonify({"error": "Missing 'results' data"}), 400
    feedback_text = get_aptitude_feedback(results)
    if "Error:" in feedback_text:
        return jsonify({"error": feedback_text}), 500
    return jsonify({"feedback": feedback_text})

@app.route('/upload-resume', methods=['POST'])
def upload_resume():
    global current_resume_text
    if 'resume_file' not in request.files:
        return jsonify({"error": "No resume file part"}), 400
    resume_file = request.files['resume_file']
    if resume_file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    if resume_file and resume_file.filename.endswith('.pdf'):
        filename = "temp_resume.pdf"
        pdf_file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        resume_file.save(pdf_file_path)
        current_resume_text = extract_text_from_pdf(pdf_file_path)
        os.remove(pdf_file_path)
        if current_resume_text:
            return jsonify({"message": "Resume uploaded and processed successfully."})
        else:
            return jsonify({"error": "Could not extract text from PDF."}), 500
    return jsonify({"error": "Invalid file type. Please upload a PDF."}), 400

@app.route('/generate-question', methods=['POST'])
def generate_question():
    global current_resume_text
    data = request.get_json()
    topic = data.get("topic")
    if not topic:
        return jsonify({"error": "Missing 'topic' field"}), 400
    if topic == "Resume-Based" and current_resume_text is None:
        return jsonify({"error": "Please upload a resume first."}), 400
    ai_question = generate_ai_question(topic, current_resume_text)
    return jsonify({"question": ai_question})

@app.route('/interview', methods=['POST'])
def interview():
    if 'audio_file' not in request.files:
        return jsonify({"error": "No audio file part"}), 400
    audio_file = request.files['audio_file']
    interview_question = request.form.get('question')
    expression_data_json = request.form.get('expressions')
    if audio_file.filename == '' or not interview_question:
        return jsonify({"error": "Missing file or question"}), 400
    if audio_file:
        filename = "temp_audio.webm" 
        audio_file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        audio_file.save(audio_file_path)
        user_answer_text, duration_seconds = transcribe_audio_to_text(audio_file_path)
        if "Error:" in user_answer_text:
             os.remove(audio_file_path)
             return jsonify({"error": f"Transcription failed: {user_answer_text}"}), 500
        
        ai_feedback = get_ai_response(
            interview_question, 
            user_answer_text, 
            expression_data_json,
            duration_seconds
        )
        os.remove(audio_file_path)
        return jsonify({"feedback": ai_feedback})
    return jsonify({"error": "Unknown error"}), 500

@app.route('/communication-feedback', methods=['POST'])
def communication_feedback():
    if 'audio_file' not in request.files:
        return jsonify({"error": "No audio file part"}), 400
    
    audio_file = request.files['audio_file']
    topic = request.form.get('question') 
    expression_data_json = request.form.get('expressions')
    
    if audio_file.filename == '' or not topic:
        return jsonify({"error": "Missing file or topic"}), 400
    
    if audio_file:
        filename = "temp_comm_audio.webm" 
        audio_file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        audio_file.save(audio_file_path)
        
        user_answer_text, duration_seconds = transcribe_audio_to_text(audio_file_path)
        if "Error:" in user_answer_text:
             os.remove(audio_file_path)
             return jsonify({"error": f"Transcription failed: {user_answer_text}"}), 500
        
        ai_feedback = get_communication_feedback(
            topic, 
            user_answer_text, 
            expression_data_json,
            duration_seconds
        )
        
        os.remove(audio_file_path)
        return jsonify({"feedback": ai_feedback})
    
    return jsonify({"error": "Unknown error"}), 500

@app.route('/communication-topic', methods=['GET'])
def communication_topic():
    topic_data = generate_communication_topic()
    if "error" in topic_data:
        return jsonify(topic_data), 500
    return jsonify(topic_data)

@app.route('/managerial-conversation', methods=['POST'])
def managerial_conversation():
    conversation_history = request.form.get('conversation_history')
    audio_file = request.files.get('audio_file')
    expression_data_json = request.form.get('expressions')

    if not conversation_history:
        return jsonify({"error": "Missing conversation history."}), 400
    
    user_answer_text = None
    audio_file_path = None
    duration_seconds = 0

    if audio_file:
        try:
            filename = f"temp_managerial_audio_{int(time.time())}.webm"
            audio_file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            audio_file.save(audio_file_path)
            
            user_answer_text, duration_seconds = transcribe_audio_to_text(audio_file_path)
            if "Error:" in user_answer_text:
                os.remove(audio_file_path)
                return jsonify({"error": f"Transcription failed: {user_answer_text}"}), 500
        except Exception as e:
             return jsonify({"error": f"Error saving file: {str(e)}"}), 500
    
    response_data = get_managerial_response(
        conversation_history,
        user_answer_text,
        expression_data_json,
        audio_file_path,
        duration_seconds
    )
    
    if audio_file_path:
        os.remove(audio_file_path)

    if "error" in response_data:
        return jsonify(response_data), 500
        
    return jsonify(response_data)

@app.route('/hr-conversation', methods=['POST'])
def hr_conversation():
    conversation_history = request.form.get('conversation_history')
    audio_file = request.files.get('audio_file')
    expression_data_json = request.form.get('expressions')

    if not conversation_history:
        return jsonify({"error": "Missing conversation history."}), 400
    
    user_answer_text = None
    audio_file_path = None
    duration_seconds = 0

    if audio_file:
        try:
            filename = f"temp_hr_audio_{int(time.time())}.webm"
            audio_file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            audio_file.save(audio_file_path)
            
            user_answer_text, duration_seconds = transcribe_audio_to_text(audio_file_path)
            if "Error:" in user_answer_text:
                os.remove(audio_file_path)
                return jsonify({"error": f"Transcription failed: {user_answer_text}"}), 500
        except Exception as e:
             return jsonify({"error": f"Error saving file: {str(e)}"}), 500
    
    response_data = get_hr_response(
        conversation_history,
        user_answer_text,
        expression_data_json,
        audio_file_path,
        duration_seconds
    )
    
    if audio_file_path:
        os.remove(audio_file_path)

    if "error" in response_data:
        return jsonify(response_data), 500
        
    return jsonify({
        "ai_response": response_data.get("ai_response"),
        "user_transcript": response_data.get("user_transcript"),
        "updated_history": response_data.get("updated_history"),
        "session_complete": response_data.get("session_complete"),
        "final_report": response_data.get("final_report"),
        "final_wpm": response_data.get("final_wpm", 0),
        "final_fillers": response_data.get("final_fillers", 0)
    })


@app.route('/upload-practice-resume', methods=['POST'])
def upload_practice_resume():
    if 'resume_file' not in request.files:
        return jsonify({"error": "No resume file part"}), 400
    resume_file = request.files['resume_file']
    if resume_file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    if resume_file and resume_file.filename.endswith('.pdf'):
        filename = f"temp_practice_resume_{int(time.time())}.pdf"
        pdf_file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        resume_file.save(pdf_file_path)
        
        resume_text = extract_text_from_pdf(pdf_file_path)
        
        os.remove(pdf_file_path) 
        
        if resume_text:
            return jsonify({"message": "Resume processed successfully.", "resume_text": resume_text})
        else:
            return jsonify({"error": "Could not extract text from PDF."}), 500
    return jsonify({"error": "Invalid file type. Please upload a PDF."}), 400

@app.route('/resume-conversation', methods=['POST'])
def resume_conversation():
    resume_text = request.form.get('resume_text')
    conversation_history = request.form.get('conversation_history')
    audio_file = request.files.get('audio_file')
    expression_data_json = request.form.get('expressions')

    if not conversation_history:
        return jsonify({"error": "Missing conversation history."}), 400
    if not resume_text:
        return jsonify({"error": "Missing resume text."}), 400
    
    user_answer_text = None
    audio_file_path = None
    duration_seconds = 0

    if audio_file:
        try:
            filename = f"temp_resume_audio_{int(time.time())}.webm"
            audio_file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            audio_file.save(audio_file_path)
            
            user_answer_text, duration_seconds = transcribe_audio_to_text(audio_file_path)
            if "Error:" in user_answer_text:
                os.remove(audio_file_path)
                return jsonify({"error": f"Transcription failed: {user_answer_text}"}), 500
        except Exception as e:
             return jsonify({"error": f"Error saving file: {str(e)}"}), 500
    
    response_data = get_resume_response(
        resume_text,
        conversation_history,
        user_answer_text,
        expression_data_json,
        audio_file_path,
        duration_seconds
    )
    
    if audio_file_path:
        os.remove(audio_file_path)

    if "error" in response_data:
        return jsonify(response_data), 500
        
    return jsonify(response_data)

@app.route('/generate-final-report', methods=['POST'])
def generate_final_report():
    data = request.get_json()
    all_round_results = data.get("all_round_results")

    if not all_round_results:
        return jsonify({"error": "Missing 'all_round_results' data"}), 400

    report_text = get_final_report(all_round_results)
    
    if "Error:" in report_text:
        return jsonify({"error": report_text}), 500
        
    return jsonify({"report": report_text})


# ✅ Always initialize DB when app starts (Gunicorn or localhost)
if os.environ.get("DATABASE_URL"):
    with app.app_context():
        db.create_all()

