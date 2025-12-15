"""
Generate a natural-language summary of your ML hurricane results using Gemini.

Usage:
  export GOOGLE_API_KEY="your_key"
  pip install -U google-genai
  python scripts/summarize_with_gemini.py \
    --input public/ml_insights.json \
    --output public/ml_ai_summary.txt \
    --model gemini-1.5-pro

This script does not log or store your API key. Keep keys out of source control.
"""

import argparse
import json
import os
import sys
from typing import Any

try:
    from google import genai
except Exception as exc:  # pragma: no cover
    sys.stderr.write("google-genai is required. Install with: pip install -U google-genai\n")
    raise


def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def build_prompt(data_str: str, extra: str) -> str:
    return f"""
You are a clear, non-technical explainer. Summarize reef + hurricane ML results.
- Start with a 2–3 sentence overview.
- Give 3–5 bullet insights.
- End with 1–2 next steps.
Audience: coastal managers and stakeholders.
{extra}

Data:
{data_str}
"""


def summarize(input_path: str, output_path: str, model: str, extra: str) -> None:
    api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit("Set GOOGLE_API_KEY (or GEMINI_API_KEY) in your environment.")

    client = genai.Client(api_key=api_key)
    data = load_json(input_path)
    data_str = json.dumps(data, indent=2)

    prompt = build_prompt(data_str, extra)
    resp = client.models.generate_content(model=model, contents=prompt)
    text = resp.text or "No response."

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(text.strip() + "\n")

    print(f"Wrote summary to {output_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Summarize ML outputs with Gemini.")
    parser.add_argument("--input", default="public/ml_insights.json", help="Path to ML insights JSON.")
    parser.add_argument("--output", default="public/ml_ai_summary.txt", help="Path to write summary.")
    parser.add_argument("--model", default="gemini-1.5-pro", help="Gemini model name.")
    parser.add_argument("--extra", default="", help="Optional extra instructions for the prompt.")
    args = parser.parse_args()

    summarize(args.input, args.output, args.model, args.extra)


if __name__ == "__main__":
    main()
