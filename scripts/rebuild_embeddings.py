#!/usr/bin/env python3
"""
Incremental knowledge base rebuild script.
Compares content hash with existing embeddings to skip unchanged chunks.

Usage:
  python3 scripts/rebuild_embeddings.py [--full] [--dry-run]

--full   : Force rebuild all embeddings (ignore hash comparison)
--dry-run: Show what would be rebuilt without actually rebuilding
"""
import sys
import os
import json
import hashlib
import argparse

# Add workspace venv to path
SYS_PATH = '/home/sz/workspace/.venv/lib/python3.11/site-packages'
if SYS_PATH not in sys.path:
    sys.path.insert(0, SYS_PATH)

sys.path.insert(0, '/home/sz/workspace/src/lib')

import warnings
warnings.filterwarnings("ignore")

from fastembed import TextEmbedding

DIM = 384
MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

# Lazy-load model
_model = None
def get_model():
    global _model
    if _model is None:
        print(f"[rebuild] Loading model: {MODEL_NAME}", file=sys.stderr)
        _model = TextEmbedding(MODEL_NAME)
        print(f"[rebuild] Model loaded OK", file=sys.stderr)
    return _model


def content_hash(text: str) -> str:
    """Stable hash for content change detection."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def embed_texts(texts):
    model = get_model()
    vecs = list(model.embed(texts))
    return [v.tolist() for v in vecs]


def rebuild(full=False, dry_run=False):
    """Rebuild embeddings incrementally."""
    # Import workspace DB lazily (needs next.config to be set up)
    sys.path.insert(0, '/home/sz/workspace')
    os.chdir('/home/sz/workspace')
    
    # Import the embeddings update function
    from src.lib.embeddings import updateEmbeddings, semanticSearch
    from src.lib.db import sqlite
    from src.lib.db.schema import embeddings, wiki_pages, obsidian_notes
    from src.lib.chunk import chunkMarkdown
    import re

    print(f"[rebuild] Starting {'FULL' if full else 'INCREMENTAL'} rebuild", file=sys.stderr)

    # Get all existing embeddings grouped by docId
    existing = sqlite.prepare("SELECT doc_type, doc_id, chunk_index, content, embedding_json, model FROM embeddings").all()
    existing_map = {}  # {(docType, docId): {chunkIndex: (content_hash, embedding_json)}}
    for row in existing:
        key = (row['doc_type'], row['doc_id'])
        if key not in existing_map:
            existing_map[key] = {}
        existing_map[key][row['chunk_index']] = {
            'content': row['content'],
            'hash': content_hash(row['content']),
            'model': row.get('model', '')
        }

    total_removed = 0
    total_added = 0

    # Detect old n-gram embeddings that need rebuilding
    needs_rebuild = []
    for (doc_type, doc_id), chunks in existing_map.items():
        model_tag = list(chunks.values())[0].get('model', '') if chunks else ''
        if 'ngram' in model_tag or 'fastembed' not in model_tag:
            needs_rebuild.append((doc_type, doc_id))

    if needs_rebuild:
        print(f"[rebuild] Found {len(needs_rebuild)} docs with old model, marking for full rebuild", file=sys.stderr)
        full = True

    # Process each doc type
    doc_count = 0

    # 1. Wiki pages
    print("[rebuild] Scanning wiki_pages...", file=sys.stderr)
    wiki_rows = sqlite.prepare("SELECT id, content FROM wiki_pages").all()
    for row in wiki_rows:
        doc_id = f"wiki:{row['id']}"
        content = row['content'] or ""
        key = ("wiki_page", doc_id)
        existing_chunks = existing_map.get(key, {})
        
        # Check if rebuild needed
        if not full and existing_chunks:
            chunks = chunkMarkdown(content)
            same = True
            for i, chunk in enumerate(chunks):
                ch = content_hash(chunk['text'])
                if i not in existing_chunks or existing_chunks[i]['hash'] != ch:
                    same = False
                    break
            if same and len(chunks) == len(existing_chunks):
                continue  # Skip unchanged
        
        doc_count += 1
        if dry_run:
            print(f"  [dry-run] Would rebuild: wiki:{row['id']}", file=sys.stderr)
            continue
        
        try:
            updateEmbeddings("wiki_page", doc_id, content)
            total_added += 1
        except Exception as e:
            print(f"  [ERROR] wiki:{row['id']}: {e}", file=sys.stderr)

    # 2. Obsidian notes (from kb_sources)
    print("[rebuild] Scanning obsidian vault...", file=sys.stderr)
    obsidian_path = "/home/sz/obsidian"
    if os.path.exists(obsidian_path):
        for root, _, files in os.walk(obsidian_path):
            for fname in files:
                if not fname.endswith('.md'):
                    continue
                fpath = os.path.join(root, fname)
                relpath = os.path.relpath(fpath, obsidian_path)
                doc_id = f"obsidian:{relpath}"
                
                try:
                    with open(fpath, 'r', encoding='utf-8') as f:
                        content = f.read()
                except Exception as e:
                    print(f"  [SKIP] {relpath}: {e}", file=sys.stderr)
                    continue
                
                key = ("obsidian_note", doc_id)
                existing_chunks = existing_map.get(key, {})
                
                if not full and existing_chunks:
                    chunks = chunkMarkdown(content)
                    same = True
                    for i, chunk in enumerate(chunks):
                        ch = content_hash(chunk['text'])
                        if i not in existing_chunks or existing_chunks[i]['hash'] != ch:
                            same = False
                            break
                    if same and len(chunks) == len(existing_chunks):
                        continue  # Skip unchanged
                
                doc_count += 1
                if dry_run:
                    print(f"  [dry-run] Would rebuild: {relpath}", file=sys.stderr)
                    continue
                
                try:
                    updateEmbeddings("obsidian_note", doc_id, content)
                    total_added += 1
                except Exception as e:
                    print(f"  [ERROR] {relpath}: {e}", file=sys.stderr)

    print(f"[rebuild] Done. Processed {doc_count} documents.", file=sys.stderr)
    print(f"[rebuild] Total added/rebuilt: {total_added}", file=sys.stderr)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Rebuild knowledge base embeddings")
    parser.add_argument("--full", action="store_true", help="Force full rebuild")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be rebuilt")
    args = parser.parse_args()
    
    rebuild(full=args.full, dry_run=args.dry_run)