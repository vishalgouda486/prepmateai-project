# In backend/check_models.py
import os
from google import genai
from dotenv import load_dotenv

try:
    load_dotenv()
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

    if not GEMINI_API_KEY:
        print("Error: GEMINI_API_KEY not found in .env file.")
    else:
        client = genai.Client(api_key=GEMINI_API_KEY)

        print("Finding available models for your API key...")
        print("---")

        count = 0
        for model in client.models.list():
            # In google-genai, list available models that support generateContent
            supported = getattr(model, "supported_actions", None) or []
            if not supported or "generateContent" in supported:
                print(f"Model name: {model.name}")
                count += 1

        print("---")
        print(f"Found {count} usable models.")

        if count == 0:
            print("\nCRITICAL: No models are available. Please check your Google AI Studio or Google Cloud project settings.")
            print("1. Make sure the 'Generative Language API' or 'Vertex AI' is enabled.")
            print("2. Make sure a billing account is attached to your project.")

except Exception as e:
    print(f"An error occurred: {type(e).__name__}: {e}")
    print("This might be an authentication error. Is your API key correct?")