#!/usr/bin/env python3
"""
Multilingual text embedding using fastembed.
Supports 50+ languages including Chinese, English, etc.
Replaces the old n-gram hash approach (no semantic understanding).
"""
import sys
import json
import warnings

warnings.filterwarnings("ignore", category=UserWarning)

# Suppress fastembed startup noise
import logging
logging.getLogger("fastembed").setLevel(logging.ERROR)

from fastembed import TextEmbedding


def load_model():
    """Load model lazily (once per process)."""
    if not hasattr(load_model, "_model"):
        load_model._model = TextEmbedding(
            "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
        )
    return load_model._model


def embed_texts(texts):
    """Return list of 384-dim float vectors."""
    model = load_model()
    # fastembed yields batches, convert to list of lists
    vecs = list(model.embed(texts))
    return [v.tolist() for v in vecs]


def main():
    try:
        data = json.load(sys.stdin)
    except Exception as e:
        print(json.dumps({"error": f"JSON parse failed: {e}"}), file=sys.stderr)
        sys.exit(1)

    texts = data.get("input", [])
    if isinstance(texts, str):
        texts = [texts]

    if not texts:
        print(json.dumps({"data": []}, ensure_ascii=False))
        return

    try:
        vecs = embed_texts(texts)
        output = {"data": [{"embedding": v} for v in vecs]}
        json.dump(output, sys.stdout, ensure_ascii=False)
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()