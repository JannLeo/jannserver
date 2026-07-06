#!/usr/bin/env python3
"""
Multilingual text embedding using fastembed.
"""
import sys
import json
import warnings
warnings.filterwarnings("ignore", category=UserWarning)
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
    # Ensure all texts are strings
    cleaned = [str(t) if t is not None else "" for t in texts]
    # Filter empty and get index pairs
    pairs = [(i, t) for i, t in enumerate(cleaned) if t]
    if not pairs:
        return []
    indices, texts_clean = zip(*pairs)
    result = list(model.embed(list(texts_clean)))
    # Restore to original ordering
    vectors = [[0.0] * 384 for _ in range(len(texts))]
    for vi, (orig_idx, emb) in enumerate(zip(indices, result)):
        vectors[orig_idx] = emb.tolist()
    return vectors


def main():
    input_source = sys.stdin
    file_path = None
    if len(sys.argv) > 1:
        file_path = sys.argv[1]
        try:
            input_source = open(file_path, "r", encoding="utf-8")
        except Exception as e:
            print(json.dumps({"error": f"File open failed: {e}"}), file=sys.stderr)
            sys.exit(1)

    try:
        data = json.load(input_source)
    except Exception as e:
        print(json.dumps({"error": f"JSON parse failed: {e}"}), file=sys.stderr)
        sys.exit(1)
    finally:
        if file_path:
            input_source.close()

    raw_texts = data.get("input", [])
    if isinstance(raw_texts, str):
        raw_texts = [raw_texts]

    # Robust cleaning
    filtered = []
    for t in raw_texts:
        if t is None:
            t = ""
        if not isinstance(t, str):
            t = str(t)
        t = t.strip()
        filtered.append(t if t else " ")

    if not filtered:
        print(json.dumps({"data": []}, ensure_ascii=False))
        return

    try:
        vecs = embed_texts(filtered)
        output = {
            "data": [{"embedding": v, "index": i, "object": "embedding"} for i, v in enumerate(vecs)]
        }
        json.dump(output, sys.stdout, ensure_ascii=False)
    except Exception as e:
        debug = {
            "error": str(e),
            "text_types": [type(t).__name__ for t in filtered[:5]],
            "text_count": len(filtered),
            "any_none": any(t is None for t in filtered),
            "non_string_idx": [i for i, t in enumerate(filtered) if not isinstance(t, str)],
        }
        print(json.dumps(debug), file=sys.stderr)
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()