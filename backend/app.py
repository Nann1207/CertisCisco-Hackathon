
from flask import Flask, jsonify, request
from flask_cors import CORS
from deep_translator import GoogleTranslator

app = Flask(__name__)
CORS(app)

LANGUAGE_CODE_MAP = {
    "English": "en",
    "Tamil": "ta",
    "Malay": "ms",
    "Chinese": "zh-CN",
}

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
        translated = GoogleTranslator(source="auto", target=language_code).translate(text)
    except Exception as exc:
        return jsonify(error=f"Translation failed: {exc}"), 500

    return jsonify(translatedText=translated)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
