from flask import Flask, jsonify, request
from flask_cors import CORS
import sys

DEEP_TRANSLATOR_IMPORT_ERROR = None

# ✅ ADDED (for quiz generation)
import os
import json
import random
import requests
from dotenv import load_dotenv

app = Flask(__name__)
CORS(app)

# ✅ ADDED: load backend/.env (do NOT commit .env)
load_dotenv()

LANGUAGE_CODE_MAP = {
    "English": "en",
    "Tamil": "ta",
    "Malay": "ms",
    "Chinese": "zh-CN",
}

def get_google_translator_class():
    global DEEP_TRANSLATOR_IMPORT_ERROR

    try:
        from deep_translator import GoogleTranslator
        DEEP_TRANSLATOR_IMPORT_ERROR = None
        return GoogleTranslator
    except Exception as exc:
        DEEP_TRANSLATOR_IMPORT_ERROR = repr(exc)
        raise RuntimeError(f"deep_translator import failed: {exc}") from exc

def translate_with_deep_translator(text: str, target_language: str) -> str:
    GoogleTranslator = get_google_translator_class()

    try:
        return GoogleTranslator(source="auto", target=target_language).translate(text)
    except Exception as exc:
        raise RuntimeError(f"deep_translator error: {exc}") from exc

@app.get("/health")
def health():
    deep_translator_available = False
    try:
        get_google_translator_class()
        deep_translator_available = True
    except Exception:
        deep_translator_available = False

    return jsonify(
        status="hello",
        pythonExecutable=sys.executable,
        deepTranslatorAvailable=deep_translator_available,
        deepTranslatorImportError=DEEP_TRANSLATOR_IMPORT_ERROR,
    )


@app.post("/translate")
def translate_texts():
    payload = request.get_json(silent=True) or {}
    text = payload.get("text")
    target_language = payload.get("targetLanguage", "English")

    if not isinstance(text, str):
        return jsonify(error="'text' must be a string."), 400

    normalized = text.strip()
    if not normalized:
        return jsonify(translatedText=text)

    language_code = LANGUAGE_CODE_MAP.get(target_language)
    if not language_code:
        return jsonify(error="Unsupported targetLanguage."), 400

    if language_code == "en":
        return jsonify(translatedText=text)

    try:
        translated = translate_with_deep_translator(text, language_code)
        return jsonify(
            translatedText=translated,
            translationStatus="ok",
            translationProvider="deep_translator",
        )
    except Exception as deep_exc:
        return jsonify(
            translatedText=text,
            translationStatus="down",
            userMessage="Translation is currently down. Your content is still available in English, and we will restore translation shortly.",
            technicalError=f"DeepTranslator={deep_exc}",
        )


# =========================
# ✅ ADDED: QUIZ GENERATION
# =========================
def _call_sealion_chat(messages):
    """
    Calls SeaLion (or any OpenAI-compatible chat API).

    REQUIRED env vars in backend/.env:
      - SEALION_API_KEY
      - SEALION_BASE_URL   (example: https://api.example.com/v1)
      - SEALION_MODEL      (example: sealion-chat)
    """
    api_key = os.getenv("SEALION_API_KEY")
    base_url = os.getenv("SEALION_BASE_URL")
    model = os.getenv("SEALION_MODEL")

    if not api_key or not base_url or not model:
        raise RuntimeError(
            "Missing SEALION_API_KEY / SEALION_BASE_URL / SEALION_MODEL in backend/.env"
        )

    url = base_url.rstrip("/") + "/chat/completions"

    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.4,
        "response_format": {"type": "json_object"},
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    resp = requests.post(url, headers=headers, json=payload, timeout=60)

    if resp.status_code >= 400:
        raise RuntimeError(f"SeaLion API error {resp.status_code}: {resp.text}")

    data = resp.json()

    # OpenAI-style parsing
    content = data["choices"][0]["message"]["content"]
    return content


def generate_quiz_from_steps(*, category: str, title: str, steps: list, num_questions: int):
    # Build compact SOP text for prompt
    sop_lines = []
    for s in steps:
        step_no = s.get("step_no", "")
        short = (s.get("step_short") or "").strip()
        desc = (s.get("step_description") or "").strip()
        sop_lines.append(f"Step {step_no}: {short} - {desc}".strip())
    sop_text = "\n".join(sop_lines)

    system_msg = (
        "You generate training quizzes for security SOP. "
        "Use ONLY the SOP steps provided. Do not invent policies. "
        "Return strictly valid JSON only (no markdown, no extra text)."
    )

    user_msg = f"""
Create a multiple-choice quiz.

Category: {category}
Title: {title}

SOP Steps:
{sop_text}

Rules:
- Make exactly {num_questions} questions.
- Each question must have exactly 4 choices.
- Only one correct answer.
- answerIndex must be 0, 1, 2, or 3.
- explanation must briefly justify the correct answer based ONLY on the SOP Steps.
- Output JSON in exactly this shape:
{{
  "questions": [
    {{
      "id": "q1",
      "question": "…",
      "choices": ["…", "…", "…", "…"],
      "answerIndex": 0,
      "explanation": "…"
    }}
  ]
}}
""".strip()

    raw = _call_sealion_chat(
        [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": user_msg},
        ]
    )

    quiz = json.loads(raw)

    questions = quiz.get("questions")
    if not isinstance(questions, list) or len(questions) == 0:
        raise RuntimeError("AI returned invalid quiz JSON (missing questions list).")

    # Validate + normalize
    normalized_questions = []
    for i, q in enumerate(questions):
        qid = q.get("id") or f"q{i+1}"
        question = q.get("question")
        choices = q.get("choices")
        answer_index = q.get("answerIndex")
        explanation = q.get("explanation", "")

        if not isinstance(question, str) or not question.strip():
            raise RuntimeError("Invalid question text from AI.")
        if not isinstance(choices, list) or len(choices) != 4 or not all(
            isinstance(c, str) for c in choices
        ):
            raise RuntimeError("Each question must have exactly 4 string choices.")
        if answer_index not in [0, 1, 2, 3]:
            raise RuntimeError("answerIndex must be 0..3.")
        if not isinstance(explanation, str):
            explanation = str(explanation)

        cleaned_choices = [c.strip() for c in choices]
        correct_choice = cleaned_choices[int(answer_index)]

        shuffled_choices = cleaned_choices[:]
        random.shuffle(shuffled_choices)
        shuffled_answer_index = shuffled_choices.index(correct_choice)

        normalized_questions.append(
            {
                "id": str(qid),
                "question": question.strip(),
                "choices": shuffled_choices,
                "answerIndex": shuffled_answer_index,
                "explanation": explanation.strip(),
            }
        )

    return {"questions": normalized_questions}


@app.post("/quiz/generate")
def quiz_generate():
    payload = request.get_json(silent=True) or {}

    category = payload.get("category", "")
    title = payload.get("title", "")
    steps = payload.get("steps", [])
    num_questions = payload.get("num_questions", 5)

    if not isinstance(category, str) or not category.strip():
        return jsonify(error="'category' must be a string."), 400

    if not isinstance(title, str) or not title.strip():
        return jsonify(error="'title' must be a string."), 400

    if not isinstance(steps, list) or len(steps) == 0:
        return jsonify(error="'steps' must be a non-empty array."), 400

    if not isinstance(num_questions, int) or num_questions < 1 or num_questions > 15:
        return jsonify(error="'num_questions' must be an int between 1 and 15."), 400

    try:
        quiz = generate_quiz_from_steps(
            category=category.strip(),
            title=title.strip(),
            steps=steps,
            num_questions=num_questions,
        )
    except json.JSONDecodeError:
        return jsonify(error="AI returned non-JSON text. Adjust prompt or retry."), 502
    except Exception as exc:
        return jsonify(error=f"Quiz generation failed: {exc}"), 500

    return jsonify(quiz)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
