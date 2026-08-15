import os
from dotenv import load_dotenv
from google import genai

# Load GEMINI_API_KEY from .env
load_dotenv(override=True)

def main():
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    client = genai.Client(api_key=api_key)

    # Use the verified working model alias
    model_id = "gemini-flash-lite-latest"

    prompt = "Suggest 3 quick ways to structure a student problem-reporting app."

    response = client.models.generate_content(
        model=model_id,
        contents=prompt
    )

    print("Response:\n")
    print(response.text)

if __name__ == "__main__":
    main()
    