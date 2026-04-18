
from flask import Flask, jsonify, request
from flask_cors import CORS

try:
    from deep_translator import GoogleTranslator
except Exception:
    GoogleTranslator = None

app = Flask(__name__)
CORS(app)

LANGUAGE_CODE_MAP = {
    "English": "en",
    "Tamil": "ta",
    "Malay": "ms",
    "Chinese": "zh-CN",
}

def translate_with_deep_translator(text: str, target_language: str) -> str:
    if GoogleTranslator is None:
        raise RuntimeError("deep_translator is not installed.")

    try:
        return GoogleTranslator(source="auto", target=target_language).translate(text)
    except Exception as exc:
        raise RuntimeError(f"deep_translator error: {exc}") from exc

@app.get("/health")
def health():
    return jsonify(status="hello")


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

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
