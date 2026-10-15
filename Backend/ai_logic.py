import os
from google import genai
from google.genai import types
from google.genai.errors import APIError
from pydantic import BaseModel, Field
from dotenv import load_dotenv
import json
import io
import requests
import traceback  # Make sure this is imported
from collections import Counter
import pdfplumber
import re 
import time
from functools import wraps
from huggingface_hub import InferenceClient # Make sure this is imported

# --- Load API Keys ---
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
JUDGE0_API_KEY = os.getenv("JUDGE0_API_KEY")
HF_API_KEY = os.getenv("HF_API_KEY")

# --- Centralized Gemini Model Configuration ---
# Models verified against Google official documentation (ai.google.dev/gemini-api/docs/models)
MODEL_APTITUDE_QUESTION = os.getenv("GEMINI_MODEL_APTITUDE", "gemini-3.5-flash-lite")
MODEL_TECHNICAL_QUESTION = os.getenv("GEMINI_MODEL_TECHNICAL", "gemini-3.8-flash")
MODEL_APTITUDE_FEEDBACK = os.getenv("GEMINI_MODEL_APTITUDE_FEEDBACK", "gemini-3.8-flash")
MODEL_CHATBOT = os.getenv("GEMINI_MODEL_CHATBOT", "gemini-3.8-flash")
MODEL_INTERVIEW = os.getenv("GEMINI_MODEL_INTERVIEW", "gemini-3.8-flash")
MODEL_COMMUNICATION = os.getenv("GEMINI_MODEL_COMMUNICATION", "gemini-3.8-flash")
MODEL_COMMUNICATION_TOPIC = os.getenv("GEMINI_MODEL_COMMUNICATION_TOPIC", "gemini-3.5-flash-lite")
MODEL_MANAGERIAL = os.getenv("GEMINI_MODEL_MANAGERIAL", "gemini-3.8-flash")
MODEL_HR = os.getenv("GEMINI_MODEL_HR", "gemini-3.8-flash")
MODEL_RESUME = os.getenv("GEMINI_MODEL_RESUME", "gemini-3.8-flash")
MODEL_FINAL_REPORT = os.getenv("GEMINI_MODEL_FINAL_REPORT", "gemini-3.8-flash")

# Fallback models for transient 503/429 overload errors
FALLBACK_FLASH = "gemini-3.8-flash"
FALLBACK_LITE = "gemini-3.5-flash-lite"

# Configure Google GenAI Client with bounded timeouts and retries
# Timeout: 20000ms (20s) to guarantee completion well within Gunicorn worker timeout window.
# Retries: 2 attempts (1 initial + 1 retry) with exponential backoff and jitter on transient codes.
client_key = GEMINI_API_KEY if GEMINI_API_KEY else "AIzaSyDummyKeyForLocalDev"
if not GEMINI_API_KEY:
    print("[WARNING] GEMINI_API_KEY not set. Using placeholder key for initialization.")

client = genai.Client(
    api_key=client_key,
    http_options=types.HttpOptions(
        timeout=20000,
        retry_options=types.HttpRetryOptions(
            attempts=2,
            initial_delay=1.0,
            max_delay=3.0,
            http_status_codes=[429, 500, 502, 503, 504],
        ),
    ),
)

# --- Pydantic Schemas for Reliable Structured Outputs ---
class AptitudeQuestionSchema(BaseModel):
    question: str = Field(description="The aptitude question statement.")
    options: list[str] = Field(description="A list of exactly 4 options, e.g. ['A) ...', 'B) ...', 'C) ...', 'D) ...']")
    correct_answer: str = Field(description="The correct option string matching one of the options.")
    solution: str = Field(description="Step-by-step solution explanation.")

class TestCaseSchema(BaseModel):
    stdin: str = Field(description="Input data passed to stdin.")
    expected_output: str = Field(description="Expected output string.")

class TechnicalQuestionSchema(BaseModel):
    question_title: str = Field(description="Short title of the problem.")
    problem_statement: str = Field(description="Detailed problem description.")
    starter_code: str = Field(description="Boilerplate starter code template.")
    test_cases: list[TestCaseSchema] = Field(description="List of test cases.")
    model_solution: str = Field(description="Complete optimal working solution code.")

class CommunicationTopicSchema(BaseModel):
    topic: str = Field(description="A single general-purpose topic for a 1-minute speech assessment.")

# --- Helper Functions ---
def clean_and_parse_json(raw_text: str) -> dict:
    """
    Safely parses JSON from model response text, stripping markdown code fences if present.
    """
    if not raw_text or not raw_text.strip():
        raise ValueError("Model returned an empty text response.")
    
    text = raw_text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    
    return json.loads(text)

def generate_content_with_retry(contents, model: str, fallback_model: str = None, config: types.GenerateContentConfig = None):
    """
    Executes generate_content using the primary model. If a transient 503/429
    error occurs, attempts one fallback to fallback_model if provided.
    """
    try:
        return client.models.generate_content(
            model=model,
            contents=contents,
            config=config,
        )
    except APIError as e:
        if fallback_model and fallback_model != model and e.code in (429, 503):
            print(f"[INFO] Primary model {model} returned {e.code}. Attempting fallback to {fallback_model}...")
            return client.models.generate_content(
                model=fallback_model,
                contents=contents,
                config=config,
            )
        raise

# --- HUGGING FACE API CLIENT ---
try:
    if not HF_API_KEY:
        print("[WARNING] HF_API_KEY not set. Transcription will fail.")
        hf_client = None
    else:
        hf_client = InferenceClient(token=HF_API_KEY)
        print("[INFO] Hugging Face InferenceClient configured.")
except Exception as e:
    print(f"[ERROR] Failed to initialize Hugging Face client: {e}")
    hf_client = None


# --- ERROR HANDLING WRAPPER ---
def handle_gemini_errors(func):
    """
    A decorator to catch exceptions from AI functions,
    log sanitized diagnostic info, and return user-friendly error responses.
    Prevents Flask/Gunicorn worker crashes and masks raw exception details.
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except APIError as e:
            print(f"[AI Error] in {func.__name__}: APIError code={e.code}, status={getattr(e, 'status', 'N/A')}")
            if e.code == 503:
                msg = "The AI model is currently experiencing high demand. Please try again shortly."
            elif e.code == 429:
                msg = "API rate limit reached. Please wait a moment before trying again."
            elif e.code in (401, 403):
                msg = "AI authentication error. Please verify the Gemini API key."
            elif e.code == 400:
                msg = "Invalid AI request parameters. Please verify input data."
            elif e.code in (500, 502, 504):
                msg = "The AI service encountered a temporary server error. Please try again."
            else:
                msg = f"AI service error ({e.code}). Please try again."
            return {"error": msg}
        except (json.JSONDecodeError, ValueError) as e:
            print(f"[JSON/Validation Error] in {func.__name__}: {type(e).__name__}")
            return {"error": "The AI returned an invalid or incomplete response. Please try again."}
        except Exception as e:
            print(f"[Unexpected Error] in {func.__name__}: {type(e).__name__}")
            err_str = str(e).lower()
            if "timeout" in err_str:
                msg = "The AI request timed out. Please try again."
            elif "rate limit" in err_str:
                msg = "API rate limit reached. Please wait a moment before trying again."
            elif "503" in err_str or "high demand" in err_str:
                msg = "The AI model is currently experiencing high demand. Please try again shortly."
            else:
                msg = "An unexpected error occurred while communicating with the AI service. Please try again."
            return {"error": msg}
    return wrapper

# --- (Other functions are unchanged) ---

def extract_text_from_pdf(pdf_file_path):
    try:
        with pdfplumber.open(pdf_file_path) as pdf:
            full_text = ""
            for page in pdf.pages:
                full_text += page.extract_text() + "\n"
        print("Resume text extracted successfully.")
        return full_text
    except Exception as e:
        print(f"Error extracting PDF text: {e}")
        return None

# ⭐️ --- FINAL, CORRECT TRANSCRIBE FUNCTION --- ⭐️
def transcribe_audio_to_text(audio_file_path):
    """
    Convert incoming webm -> wav (ffmpeg), upload to AssemblyAI, request transcription,
    poll for completion, return (transcript, duration_seconds)
    """
    try:
        import subprocess
        import tempfile
        import time
        import requests
        import os

        ASSEMBLY_API_KEY = os.getenv("ASSEMBLYAI_API_KEY")
        if not ASSEMBLY_API_KEY:
            print("❌ Missing ASSEMBLYAI_API_KEY")
            return "Error: AssemblyAI API key missing.", 0

        print("⚙️ Converting WEBM → WAV using ffmpeg...")
        wav_path = tempfile.mktemp(suffix=".wav")
        subprocess.run([
            "ffmpeg", "-i", audio_file_path,
            "-ac", "1", "-ar", "16000",
            wav_path
        ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        # Read WAV bytes for upload
        with open(wav_path, "rb") as f:
            wav_bytes = f.read()

        if not wav_bytes:
            print("❌ WAV conversion produced empty file")
            return "Error: The recorded audio file was empty.", 0

        print("📤 Uploading audio to AssemblyAI...")
        upload_url = "https://api.assemblyai.com/v2/upload"
        headers = {"authorization": ASSEMBLY_API_KEY}

        # streaming upload (recommended)
        upload_resp = requests.post(upload_url, headers=headers, data=wav_bytes)
        if upload_resp.status_code != 200:
            print("❌ AssemblyAI upload error:", upload_resp.status_code, upload_resp.text)
            return f"Error: ASR failed -> upload error: {upload_resp.text}", 0

        audio_url = upload_resp.json().get("upload_url")
        if not audio_url:
            print("❌ Upload response missing upload_url:", upload_resp.text)
            return f"Error: ASR failed -> upload response invalid", 0

        print("▶️ Requesting transcription...")
        transcript_url = "https://api.assemblyai.com/v2/transcript"
        json_payload = {
            "audio_url": audio_url,
            # optional: add "language_code": "en" or other params if needed
            # "language_code": "en"
        }
        trans_resp = requests.post(transcript_url, json=json_payload, headers=headers)
        if trans_resp.status_code != 200 and trans_resp.status_code != 201:
            print("❌ AssemblyAI transcription request error:", trans_resp.status_code, trans_resp.text)
            return f"Error: ASR failed -> transcript request error: {trans_resp.text}", 0

        transcript_id = trans_resp.json().get("id")
        if not transcript_id:
            print("❌ No transcript id returned:", trans_resp.text)
            return f"Error: ASR failed -> no transcript id", 0

        # Polling for completion (timeout after e.g. 60 seconds)
        poll_url = f"https://api.assemblyai.com/v2/transcript/{transcript_id}"
        timeout_seconds = 60
        poll_interval = 1.5
        elapsed = 0.0

        print("⏳ Waiting for transcription to complete...")
        while elapsed < timeout_seconds:
            status_resp = requests.get(poll_url, headers=headers)
            if status_resp.status_code != 200:
                print("❌ AssemblyAI status error:", status_resp.status_code, status_resp.text)
                return f"Error: ASR failed -> status error: {status_resp.text}", 0

            status_json = status_resp.json()
            status = status_json.get("status")
            if status == "completed":
                transcript_text = status_json.get("text", "").strip()
                print("✅ Transcription completed.")
                # optional: get audio duration from status_json.get("audio_duration")
                duration_seconds = status_json.get("audio_duration", 0)
                return transcript_text, duration_seconds or 0
            if status == "error":
                err = status_json.get("error", "unknown error")
                print("❌ AssemblyAI returned error:", err)
                return f"Error: ASR failed -> {err}", 0

            time.sleep(poll_interval)
            elapsed += poll_interval

        # timeout
        print("❌ Transcription polling timed out.")
        return "Error: ASR failed -> transcription timed out", 0

    except Exception as e:
        import traceback
        traceback.print_exc()
        return f"Error: ASR failed -> {str(e)}", 0
# ⭐️ --- END FINAL TRANSCRIBE FUNCTION --- ⭐️


@handle_gemini_errors
def generate_ai_question(topic, resume_text=None):
    if topic == "Resume-Based" and resume_text:
        prompt = f"""
        You are a senior hiring manager for a top tech company like Google or Microsoft. You are interviewing a candidate. Their resume is provided below.
        Ask one insightful, specific question based directly on their resume. The question should probe their experience on a specific project, skill, or role mentioned.
        Do not ask a generic question (e.g., "What was your favorite project?"). Ask a "why" or "how" question.

        Example: "I see on your resume you used 'React' for the 'E-commerce Dashboard' project. What was the most difficult challenge you faced with state management on that project, and how did you solve it?"
        
        THEIR RESUME:
        ---
        {resume_text}
        ---
        
        Ask one resume-based question:
        """
    else:
        prompt = f"""
        You are a hiring manager for a top tech company. Ask one challenging, high-quality interview question for the following topic: "{topic}".
        The question should be concise and behavioral or technical, depending on the topic.
        
        - If the topic is 'Behavioral', ask a question like "Tell me about a time you had a conflict with a teammate and how you resolved it."
        - If the topic is technical (e.g., 'Python', 'Data Structures'), ask a conceptual question like "How does Python's Global Interpreter Lock (GIL) affect multi-threaded performance?" or "Can you explain the difference between a List and a Tuple in Python?"

        Do not ask to write code. Ask only one question.
        
        Question:
        """
    response = generate_content_with_retry(
        model=MODEL_INTERVIEW,
        fallback_model=FALLBACK_LITE,
        contents=prompt
    )
    if not response or not response.text:
        print("Error: Gemini returned an empty response.")
        return "Error: The AI failed to generate a question."
    
    return response.text.strip()

@handle_gemini_errors
def get_ai_response(interview_question, user_answer, expression_data_json, duration_seconds):
    
    audio_analysis_summary = "No audio analysis was performed."
    try:
        words = user_answer.split()
        word_count = len(words)
        
        if duration_seconds > 0:
            duration_minutes = duration_seconds / 60.0
            wpm = int(word_count / duration_minutes) 
            pace_feedback = "Good"
            if wpm < 120: pace_feedback = "A bit slow. Try to speak more fluently."
            elif wpm > 160: pace_feedback = "A bit fast. Remember to pause for emphasis."
            pace_line = f"- **Pace:** {wpm} WPM (Words Per Minute). ({pace_feedback})"
        else:
            pace_line = "- **Pace:** Pace analysis is unavailable."

        filler_words = ['um', 'uh', 'like', 'so', 'you know', 'basically', 'actually']
        filler_count = 0
        filler_pattern = r'\b(um|uh|like|so|you know|basically|actually)\b'
        filler_count = len(re.findall(filler_pattern, user_answer.lower()))
        
        audio_analysis_summary = (
            f"{pace_line}\n"
            f"- **Filler Words:** Found {filler_count} filler words (e.g., 'um', 'like', 'so')."
        )
    except Exception as e:
        print(f"Error during audio analysis: {e}")
        audio_analysis_summary = "Note: Audio analysis failed."
    
    expression_summary = "No facial expression data was provided."
    if expression_data_json and expression_data_json != "[]":
        try:
            expressions = json.loads(expression_data_json)
            expression_counts = Counter(expressions)
            total_expressions = len(expressions)
            summary_lines = []
            for expr, count in expression_counts.items():
                percentage = (count / total_expressions) * 100
                summary_lines.append(f"- {expr}: {percentage:.0f}%")
            expression_summary = "\n".join(summary_lines)
        except Exception as e:
            print(f"Error processing expressions: {e}")
            expression_summary = "Note: Facial data was received but could not be processed."

    prompt = f"""
    ## Activation Sequence Initiated.
    ## Role: AI Interview Coach (STAR Method Specialist)
    ## Task: Provide feedback on a user's answer to an interview question.
    ## Output Format: Markdown

    **Question:**
    {interview_question}

    **User's Answer:**
    "{user_answer}"

    ---
    ### **Analysis:**
    
    #### 1. Content & Structure (STAR Method)
    - **Situation:** Did they set the context?
    - **Task:** Did they explain their role or task?
    - **Action:** Did they detail the steps *they* took?
    - **Result:** Did they describe the outcome and what they learned?
    
    #### 2. Communication & Delivery
    - **Audio Analysis:**
    {audio_analysis_summary}
    - **Expression Analysis:**
    {expression_summary}

    ---
    ### **Feedback:**

    **1. STAR Feedback (Content & Structure):**
    [Provide a 2-3 sentence analysis of how well they used the STAR method. Be specific. If they missed a part, say so. Example: "You set the Situation and Task well, but the Action steps were a bit vague. Try to use 'I' instead of 'we' to describe your specific contribution."]

    **2. Delivery & Confidence:**
    [Provide 1-2 sentences on their delivery, using the audio and expression analysis. Example: "Your pace was good, but you seemed to look away from the camera, which can suggest a lack of confidence. Try to maintain eye contact and reduce filler words like 'um' and 'like.'"]

    **3. "Better Answer" Example:**
    [Provide a concise, strong example answer that follows the STAR method for the original question. Make it a general example, not a rewrite of their answer.]
    """
    response = generate_content_with_retry(
        model=MODEL_INTERVIEW,
        fallback_model=FALLBACK_LITE,
        contents=[prompt]
    )

    if not response or not response.text:
        print("Error: Gemini returned an empty response.")
        return "Error: The AI failed to generate feedback."
    
    return response.text

@handle_gemini_errors 
def get_aptitude_question(topic):
    topic_instruction = f'for the topic: "{topic}"'
    if topic.lower() == 'mix':
        topic_instruction = "from a mix of Quantitative, Logical, and Verbal topics."
    prompt = f"""
    Generate one medium-difficulty aptitude question {topic_instruction}.
    
    The question must have exactly 4 multiple choice options.
    Use plain text for math (e.g., 'x^2', '3/4'), do not use LaTeX.
    Provide the correct answer matching one of the options and a step-by-step solution.
    """
    response = generate_content_with_retry(
        model=MODEL_APTITUDE_QUESTION,
        fallback_model=FALLBACK_FLASH,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=AptitudeQuestionSchema,
            temperature=0.7,
        )
    )
    if not response or not response.text:
        print("Error: Gemini returned an empty response.")
        return {"error": "The AI failed to generate a question."}
    
    raw_data = clean_and_parse_json(response.text)
    validated = AptitudeQuestionSchema.model_validate(raw_data)
    return validated.model_dump()


@handle_gemini_errors
def get_aptitude_feedback(results):
    results_json = json.dumps(results, indent=2)
    prompt = f"""
    You are an expert aptitude test coach. A user has just completed a practice session.
    Their results are provided in this JSON list:
    {results_json}

    Provide a report in EXACTLY this format:

    ### OVERALL SUMMARY
    [2-3 sentences here]

    ### STRONGEST TOPIC
    [Topic name and why]

    ### WEAKEST TOPIC
    [Topic name and why]

    ### KEY TAKEAWAY
    [One piece of advice]
    
    Keep the feedback encouraging and brief.
    """
    response = generate_content_with_retry(
        model=MODEL_APTITUDE_FEEDBACK,
        fallback_model=FALLBACK_LITE,
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(thinking_level="low")
        ),
        contents=prompt
    )

    if not response.text:
        print("Error: Gemini returned an empty response.")
        return "Error: The AI failed to generate feedback."
        
    return response.text.strip()

@handle_gemini_errors
def get_technical_question(topic, language):
    lang_name = "Python 3"
    if language == "java":
        lang_name = "Java"
        
    topic_instruction = f'for the topic: "{topic}"'
    if topic == "Mix (DSA)":
        topic_instruction = "from a mix of DSA topics (Arrays, Strings, Linked Lists, Trees, Graphs, Sorting, or Searching)."
    
    prompt = f"""
    Generate one medium-difficulty technical coding problem {topic_instruction} for {lang_name}.
    Include a concise problem statement, empty starter boilerplate code, at least 3 input/output test cases (each with "stdin" and "expected_output" strings), and a complete optimal working solution.
    """ 
    response = generate_content_with_retry(
        model=MODEL_TECHNICAL_QUESTION,
        fallback_model=FALLBACK_LITE,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=TechnicalQuestionSchema,
            temperature=0.6,
        )
    )

    if not response or not response.text:
        print("Error: Gemini returned an empty response.")
        return {"error": "The AI failed to generate a question."}
    
    raw_data = clean_and_parse_json(response.text)
    validated = TechnicalQuestionSchema.model_validate(raw_data)
    return validated.model_dump()

def run_code_with_judge0(user_code, language, test_cases):
    print(f"Sending {language} code to Judge0 for batch processing...")
    language_id = 92
    if language == "java":
        language_id = 91
    submissions = []
    for case in test_cases:
        submissions.append({
            "source_code": user_code,
            "language_id": language_id,
            "stdin": case["stdin"],
            "expected_output": case["expected_output"]
        })
    url = "https://judge0-ce.p.rapidapi.com/submissions/batch"
    headers = {
        "content-type": "application/json",
        "Content-Type": "application/json",
        "X-RapidAPI-Key": JUDGE0_API_KEY,
        "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com"
    }
    try:
        response = requests.post(url, json={"submissions": submissions}, headers=headers)
        tokens = response.json()
        if not isinstance(tokens, list) or 'token' not in tokens[0]:
             return { "error": f"Failed to create submission. Check your Judge0 API key. API response: {response.text}" }
        submission_tokens = [t['token'] for t in tokens]
        results = []
        for i, token in enumerate(submission_tokens):
            status = "Processing"
            while status == "Processing" or status == "In Queue":
                time.sleep(1)
                result_url = f"https://judge0-ce.p.rapidapi.com/submissions/{token}"
                response = requests.get(result_url, headers=headers)
                result_data = response.json()
                status = result_data.get('status', {}).get('description')
            if status == "Accepted":
                results.append(f"Test Case {i+1}: PASSED")
            else:
                expected = test_cases[i]['expected_output']
                got = result_data.get('stdout', 'N/A')
                if status == "Wrong Answer":
                    results.append(f"Test Case {i+1}: FAILED (Expected: {expected}, Got: {got})")
                else:
                    results.append(f"Test Case {i+1}: ERROR ({status})")
        return { "results": results }
    except Exception as e:
        print(f"Error calling Judge0: {e}")
        return {"error": str(e)}

@handle_gemini_errors
def get_communication_feedback(topic, user_answer, expression_data_json, duration_seconds):
    
    audio_analysis_summary = "No audio analysis was performed."
    try:
        words = user_answer.split()
        word_count = len(words)
        
        if duration_seconds > 0:
            duration_minutes = duration_seconds / 60.0
            wpm = int(word_count / duration_minutes)
            pace_feedback = "Good"
            if wpm < 120: pace_feedback = "A bit slow. Try to speak more fluently."
            elif wpm > 160: pace_feedback = "A bit fast. Remember to pause for emphasis."
            pace_line = f"- **Pace:** {wpm} WPM (Words Per Minute). ({pace_feedback})"
        else:
            pace_line = "- **Pace:** Pace analysis is unavailable."
            
        filler_words = ['um', 'uh', 'like', 'so', 'you know', 'basically', 'actually']
        filler_count = 0
        filler_pattern = r'\b(um|uh|like|so|you know|basically|actually)\b'
        filler_count = len(re.findall(filler_pattern, user_answer.lower()))
        audio_analysis_summary = (
            f"{pace_line}\n"
            f"- **Filler Words:** Found {filler_count} filler words (e.g., 'um', 'like', 'so')."
        )
    except Exception as e:
        print(f"Error during audio analysis: {e}")
        audio_analysis_summary = "Note: Audio analysis failed."
    
    expression_summary = "No facial expression data was provided."
    if expression_data_json and expression_data_json != "[]":
        try:
            expressions = json.loads(expression_data_json)
            expression_counts = Counter(expressions)
            total_expressions = len(expressions)
            summary_lines = []
            for expr, count in expression_counts.items():
                percentage = (count / total_expressions) * 100
                summary_lines.append(f"- {expr}: {percentage:.0f}%")
            expression_summary = "\n".join(summary_lines)
        except Exception as e:
            print(f"Error processing expressions: {e}")
            expression_summary = "Note: Facial data was received but could not be processed."

    prompt = f"""
    ## Role: AI Communication Coach
    ## Task: Provide a structured report on a user's 1-minute speech.

    **Topic:**
    {topic}

    **User's Speech:**
    "{user_answer}"

    Format your response EXACTLY with these headers:
    
    ### OVERALL SUMMARY
    [2-3 sentences on the content and addressing the topic]

    ### DELIVERY AND PACE
    [Analysis of pace: {audio_analysis_summary}. Then provide 1-2 sentences of coaching. 
    If slow, suggest techniques for fluency: if fast, suggest pausing for emphais.]

    ### EXPRESSION ANALYSIS
    [Analysis of facial data: {expression_summary}. Then, provide 1-2 sentences of coaching. 
    If neutral, suggest using facial variations to match the topic's emotion to build rapport.]

    ### KEY TAKEAWAY
    [One actionable piece of advice]
    """
    response = generate_content_with_retry(
        model=MODEL_COMMUNICATION,
        fallback_model=FALLBACK_LITE,
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(thinking_level="low")
        ),
        contents=[prompt]
    )

    if not response.text:
        print("Error: Gemini returned an empty response.")
        return "Error: The AI failed to generate feedback."
        
    return response.text.strip()

@handle_gemini_errors
def generate_communication_topic():
    prompt = """
    Generate one, single, simple, general-purpose topic for a 1-minute communication assessment.
    """
    response = generate_content_with_retry(
        model=MODEL_COMMUNICATION_TOPIC,
        fallback_model=FALLBACK_FLASH,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=CommunicationTopicSchema,
            temperature=0.8,
        )
    )

    if not response or not response.text:
        print("Error: Gemini returned an empty response.")
        return {"error": "The AI failed to generate a topic."}
    
    raw_data = clean_and_parse_json(response.text)
    validated = CommunicationTopicSchema.model_validate(raw_data)
    return validated.model_dump()

@handle_gemini_errors 
def get_managerial_response(conversation_history, user_answer, expression_data_json, audio_file_path, duration_seconds=0):
    history = json.loads(conversation_history)
    
    custom_prompt = None
    if history and history[-1].get('role') == 'system':
        custom_prompt = history.pop()['content'] 
        
    question_count = len([msg for msg in history if msg['role'] == 'model'])
    
    transcribed_text = user_answer
    session_complete = False
    final_report = None
    
    if user_answer is not None:
        history.append({
        "role": "user",
        "parts": [{"text": user_answer}]
    })
    

    if custom_prompt:
            prompt = f"You are Prepmate, an AI interview architect. {custom_prompt}"
    elif question_count == 0:
        prompt = "You are Prepmate, an AI interview architect. Ask your first managerial question (e.g., 'Tell me about a time you had to lead a project.')."
    elif question_count == 1:
        prompt = "You are Prepmate, an AI interview architect. Ask one, smart, relevant follow-up question based *only* on the user's last answer."
    elif question_count == 2:
        prompt = "You are Prepmate, an AI interview architect. Ask your *second* main managerial question (e.g., 'Describe a situation where you had a conflict with a coworker.')."
    elif question_count == 3:
        prompt = "You are Prepmate, an AI interview architect. Ask one, smart, relevant follow-up question based *only* on the user's last answer."
    else:
        session_complete = True
        ai_response = "This concludes the managerial round. Generating your final debrief..."
        
        all_user_text = " ".join(
            msg['parts'][0]['text']
            for msg in history
            if msg['role'] == 'user'
        )

        words = all_user_text.split()
        word_count = len(words)


        actual_wpm = 0
        if duration_seconds > 0:
            duration_minutes = duration_seconds / 60.0
            actual_wpm = int(word_count / duration_minutes)

        filler_pattern = r'\b(um|uh|like|so|you know|basically|actually)\b'
        final_fillers = len(re.findall(filler_pattern, user_answer.lower())) if user_answer else 0


        # Create the report prompt
        history_text = "\n".join([f"{msg['role']}: {msg['parts'][0]['text']}" for msg in history if 'parts' in msg])
        report_prompt = f"""
        ## Role: AI Interview Coach
        ## IMPORTANT: Start your response with "SCORE: [X]%" where X is a number from 0-100 based on STAR structure, confidence, and clarity.
        ## Task: Provide a final debrief for a 4-question managerial interview.
        ## Output Format: Markdown
        
        **Interview Transcript:**
        {history_text}

        ---
        ### **Final Debrief:**

        **1. Overall Performance:**
        [Provide 2-3 sentences on their overall performance. Comment on their ability to handle follow-up questions and their use of examples.]

        **2. Strengths:**
        - [List 1-2 key strengths, e.g., "Good use of the STAR method," "Clear communication."]

        **3. Areas for Improvement:**
        - [List 1-2 specific, actionable areas for improvement, e.g., "Try to provide more detail on the 'Result' of your stories," "Answers could be more concise."]
        """
        final_report_response = generate_content_with_retry(
            model=MODEL_MANAGERIAL,
            fallback_model=FALLBACK_LITE,
            config=types.GenerateContentConfig(
                thinking_config=types.ThinkingConfig(thinking_level="low")
            ),
            contents=report_prompt
        )
        final_report = final_report_response.text or "Error: The AI failed to generate your final report."
        
        return {
            "ai_response": ai_response, 
            "user_transcript": transcribed_text,
            "updated_history": history, 
            "session_complete": True, 
            "final_report": final_report,
            "final_wpm": actual_wpm, # Replace with your calculated 'wpm' variable
            "final_fillers": final_fillers
        }
    
    chat_session = client.chats.create(
        model=MODEL_MANAGERIAL,
        config=types.GenerateContentConfig(temperature=0.7),
        history=history
    )
    response = chat_session.send_message(prompt)
    
    ai_response = response.text or "I'm sorry, I seem to have lost my train of thought. Could you please repeat your last answer?"
    
    history.append({
        "role": "model",  # Use 'model' instead of 'ai' for official SDK compliance
        "parts": [{"text": ai_response}]
    })
    return {
        "ai_response": ai_response, "user_transcript": transcribed_text,
        "updated_history": history, "session_complete": False, "final_report": None
    }


@handle_gemini_errors 
def get_hr_response(conversation_history, user_answer, expression_data_json, audio_file_path, duration_seconds=0):
    history = json.loads(conversation_history)
    
    custom_prompt = None
    if history and history[-1].get('role') == 'system':
        custom_prompt = history.pop()['content']
        
    question_count = len([msg for msg in history if msg['role'] == 'model'])
    transcribed_text = user_answer
    session_complete = False
    final_report = None
    if user_answer is not None:
        history.append({
        "role": "user",
        "parts": [{"text": user_answer}]
    })
    

    if custom_prompt:
            prompt = f"You are Prepmate, an AI interview architect. {custom_prompt}"
    elif question_count == 0:
        prompt = "You are Prepmate, an AI interview architect. Ask your first HR personal interview question (e.g., 'Tell me about yourself' or 'What is your greatest strength?')."
    elif question_count == 1:
        prompt = "You are Prepmate, an AI interview architect. Ask one, smart, relevant follow-up question based *only* on the user's last answer."
    elif question_count == 2:
        prompt = "You are Prepmate, an AI interview architect. Ask your *second* main HR question (e.g., 'Why do you want to work for this company?' or 'Where do you see yourself in 5 years?')."
    elif question_count == 3:
        prompt = "You are Prepmate, an AI interview architect. Ask one, smart, relevant follow-up question based *only* on the user's. last answer."
    else:
        session_complete = True
        ai_response = "This concludes the HR interview. Generating your final debrief..."
        
        all_user_text = " ".join(
            msg['parts'][0]['text']
            for msg in history
            if msg['role'] == 'user'
        )

        words = all_user_text.split()
        word_count = len(words)

        actual_wpm = 0
        if duration_seconds > 0:
            duration_minutes = duration_seconds / 60.0
            actual_wpm = int(word_count / duration_minutes)

        filler_pattern = r'\b(um|uh|like|so|you know|basically|actually)\b'
        final_fillers = len(re.findall(filler_pattern, user_answer.lower())) if user_answer else 0


        # Create the report prompt
        history_text = "\n".join([f"{msg['role']}: {msg['parts'][0]['text']}" for msg in history if 'parts' in msg])
        report_prompt = f"""
        ## Role: AI Interview Coach
        ## Task: Provide a final debrief for a 4-question HR interview.
        ## IMPORTANT: Start your response with "SCORE: [X]%" where X is a number from 0-100 based on STAR structure, confidence, and clarity.
        ## Output Format: Markdown
        
        **Interview Transcript:**
        {history_text}

        ---
        ### **Final Debrief:**

        **1. Overall Performance:**
        [Provide 2-3 sentences on their overall performance. Comment on their personality, clarity, and how well they articulated their motivations.]

        **2. Strengths:**
        - [List 1-2 key strengths, e.g., "Appeared positive and enthusiastic," "Clearly explained their motivations."]

        **3. Areas for Improvement:**
        - [List 1-2 specific, actionable areas for improvement, e.g., "Try to provide more specific examples to back up your claims," "Connect your 5-year plan more directly to this role."]
        """
        # Using the new client to generate the final report
        final_report_response = generate_content_with_retry(
            model=MODEL_HR,
            fallback_model=FALLBACK_LITE,
            config=types.GenerateContentConfig(
                thinking_config=types.ThinkingConfig(thinking_level="low")
            ),
            contents=report_prompt
        )
        final_report = final_report_response.text or "Error: The AI failed to generate your final report."
        
        return {
            "ai_response": ai_response, 
            "user_transcript": transcribed_text,
            "updated_history": history, 
            "session_complete": True, 
            "final_report": final_report,
            "final_wpm": actual_wpm, # Replace with your calculated 'wpm' variable
            "final_fillers": final_fillers
        }
    
    # New way to start a chat session
    chat_session = client.chats.create(
        model=MODEL_HR,
        config=types.GenerateContentConfig(temperature=0.7),
        history=history
    )
    # New way to send the message
    response = chat_session.send_message(prompt)
    
    ai_response = response.text or "I'm sorry, I seem to have lost my train of thought. Could you please repeat your last answer?"
    
    history.append({
        "role": "model",  # Use 'model' instead of 'ai' for official SDK compliance
    "parts": [{"text": ai_response}]
    })
    return {
        "ai_response": ai_response, "user_transcript": transcribed_text,
        "updated_history": history, "session_complete": False, "final_report": None
    }


@handle_gemini_errors
def get_resume_response(resume_text, conversation_history, user_answer, expression_data_json, audio_file_path, duration_seconds=0):
    history = json.loads(conversation_history)
    
    custom_prompt = None
    if history and history[-1].get('role') == 'system':
        custom_prompt = history.pop()['content']
        
    question_count = len([msg for msg in history if msg['role'] == 'model'])
    
    transcribed_text = user_answer
    session_complete = False
    final_report = None
    
    resume_context = f"THE USER'S RESUME:\n---\n{resume_text}\n---"

    if user_answer is not None:
        history.append({
        "role": "user",
        "parts": [{"text": user_answer}]
    })


    if custom_prompt:
        prompt = f"You are Prepmate, an AI interview architect. The user's resume is below. {custom_prompt}\n\n{resume_context}"
    elif question_count == 0:
        prompt = f"You are Prepmate, an AI hiring manager. Ask your first question based *only* on a specific project, skill, or experience from their resume.\n\n{resume_context}"
    elif question_count == 1:
        prompt = f"You are Prepmate. Ask one, smart, relevant follow-up question based *only* on the user's last answer and their resume.\n\n{resume_context}"
    elif question_count == 2:
        prompt = f"You are Prepmate. Ask your *second* main question, based on a *different* part of their resume.\n\n{resume_context}"
    elif question_count == 3:
        prompt = "You are Prepmate. Ask a smart follow-up question based *only* on the user's last answer.\n\n{resume_context}"
    elif question_count == 4:
        prompt = f"You are Prepmate. Ask your *third* main question, based on yet another part of their resume (e.g., education or skills section).\n\n{resume_context}"
    elif question_count == 5:
        prompt = f"You are Prepmate. Ask one final, smart follow-up question based *only* on the user's last answer.\n\n{resume_context}"
    else:
        session_complete = True
        ai_response = "This concludes the Resume-Based interview. Generating your final debrief..."
        
        all_user_text = " ".join(
            msg['parts'][0]['text']
            for msg in history
            if msg['role'] == 'user'
        )

        words = all_user_text.split()
        word_count = len(words)

        actual_wpm = 0
        if duration_seconds > 0:
            duration_minutes = duration_seconds / 60.0
            actual_wpm = int(word_count / duration_minutes)

        filler_pattern = r'\b(um|uh|like|so|you know|basically|actually)\b'
        final_fillers = len(re.findall(filler_pattern, user_answer.lower())) if user_answer else 0


        # Create the report prompt
        history_text = "\n".join([f"{msg['role']}: {msg['parts'][0]['text']}" for msg in history if 'parts' in msg])
        report_prompt = f"""
        ## Role: AI Interview Coach
        ## Task: Provide a final debrief for a 6-question resume-based interview.
        ## IMPORTANT: Start your response with "SCORE: [X]%" where X is a number from 0-100 based on STAR structure, confidence, and clarity.
        ## Output Format: Markdown
        
        **Interview Transcript:**
        {history_text}

        ---
        ### **Final Debrief:**

        **1. Overall Performance:**
        [Provide 2-3 sentences on their overall performance. Comment on how well they discussed their resume projects and experiences.]

        **2. Strengths:**
        - [List 1-2 key strengths, e.g., "Detailed explanations of resume projects," "Confidently handled follow-up questions."]

        **3. Areas for Improvement:**
        - [List 1-2 specific, actionable areas for improvement, e.g., "Try to quantify the results of your projects more (e.g., 'improved performance by 20%')."]
        """
        # Using the new client to generate the final report
        final_report_response = generate_content_with_retry(
            model=MODEL_RESUME,
            fallback_model=FALLBACK_LITE,
            config=types.GenerateContentConfig(
                thinking_config=types.ThinkingConfig(thinking_level="low")
            ),
            contents=report_prompt
        )
        final_report = final_report_response.text or "Error: The AI failed to generate your final report."
        
        return {
            "ai_response": ai_response, 
            "user_transcript": transcribed_text,
            "updated_history": history, 
            "session_complete": True, 
            "final_report": final_report,
            "final_wpm": actual_wpm, # Replace with your calculated 'wpm' variable
            "final_fillers": final_fillers
        }

    chat_session = client.chats.create(
        model=MODEL_RESUME,
        config=types.GenerateContentConfig(temperature=0.7),
        history=history
    )

    response = chat_session.send_message(prompt)

    ai_response = response.text or "I'm sorry, I seem to have lost my train of thought. Could you please repeat your last answer?"
    
    history.append({
        "role": "model",  # Use 'model' instead of 'ai' for official SDK compliance
    "parts": [{"text": ai_response}]
    })
    return {
        "ai_response": ai_response, "user_transcript": transcribed_text,
        "updated_history": history, "session_complete": False, "final_report": None
    }


# ⭐️ --- THIS IS THE FIXED FUNCTION --- ⭐️
@handle_gemini_errors
def get_final_report(all_round_results):
    
    results_json = json.dumps(all_round_results, indent=2)
    prompt = f"""
    You are 'Prepmate', an AI career coach.
    A user has just completed a full mock test. Their results from all rounds are provided below in JSON format.

    Your task is to generate a comprehensive, professional, and encouraging final report in **Markdown format**.

    The report MUST have the following structure:
    1.  **Overall Summary:** A brief, high-level overview of their performance.
    2.  **Round-by-Round Breakdown:**
        * **Aptitude Test:** Analyze their `aptitude` results. Calculate their score (e.g., "15/20 Correct"). Identify strong and weak topics.
        * **Communication Test:** Analyze the feedback from the `communication` section (which is a string of text feedback). Summarize the feedback on their pace, clarity, and confidence.
        * **Coding Test:** Analyze their `coding` results. Comment on which questions they passed, failed, or left incomplete.
        * **Live Interview:** Analyze the `interview` conversation history (a list of 'ai' and 'user' messages). Give feedback on their answer quality, structure (like STAR method), and conciseness.
    3.  **Key Strengths:** 2-3 bullet points highlighting what they did well across all rounds.
    4.  **Top Areas for Improvement:** 2-3 specific, actionable bullet points on what to focus on next.
    5.  **Final Encouragement:** A concluding sentence to motivate them.

    Here are the user's test results:
    ```json
    {results_json}
    ```

    Generate the report. Start with "Here is your comprehensive mock test report:"
    """
    response = generate_content_with_retry(
        model=MODEL_FINAL_REPORT,
        fallback_model=FALLBACK_LITE,
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(thinking_level="low")
        ),
        contents=[prompt]
    )

    if not response.text:
        return "Error: The AI Career Architect could not generate the final report."
        
    return response.text
