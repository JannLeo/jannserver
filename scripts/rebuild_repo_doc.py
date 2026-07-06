#!/usr/bin/env python3
"""
repo_doc 增量 embedding 重建脚本
纯 Python，绕过 Node.js (避免 spawn bug)
"""
import sys
import sqlite3
import json
import time
import logging
import warnings
import re

warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(message)s', stream=sys.stdout)
logger = logging.getLogger()

from fastembed import TextEmbedding

MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
MODEL = None

def load_model():
    global MODEL
    if MODEL is None:
        logger.info(f"Loading fastembed model: {MODEL_NAME}")
        MODEL = TextEmbedding(MODEL_NAME)
        logger.info("Model loaded")
    return MODEL

def chunk_md(text, target=800):
    """Python version of chunkMarkdown."""
    if not text or not text.strip():
        return []
    paras = re.split(r'\n\n+', text)
    merged, result = [], []
    for p in paras:
        p = p.strip()
        if not p:
            continue
        while len(p) > target:
            result.append(p[:target])
            p = p[target:]
        if merged and (sum(len(x) for x in merged) + len(p) + 2 <= target):
            merged.append(p)
        else:
            if merged:
                result.append('\n\n'.join(merged))
            merged = [p]
    if merged:
        result.append('\n\n'.join(merged))
    return result

def get_pending_docs(db_path):
    """Return list of (id, repo_id, rel_path, title, content) for docs needing embedding."""
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute('SELECT id, repo_id, rel_path, title, content FROM repo_documents')
    rows = c.fetchall()
    c.execute('SELECT doc_id FROM embeddings WHERE doc_type="repo_doc" AND model="fastembed-multilingual-384" GROUP BY doc_id')
    embedded = set(r[0] for r in c.fetchall())
    conn.close()
    pending = [r for r in rows if f"{r[1]}:{r[2]}" not in embedded]
    logger.info(f"Total docs: {len(rows)}, already embedded: {len(rows)-len(pending)}, pending: {len(pending)}")
    return pending

def process_docs(db_path, batch_size=5000):
    """Process all pending docs, insert embeddings."""
    model = load_model()
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    # Delete ALL existing repo_doc embeddings (not just fastembed)
    # UNIQUE constraint on (doc_type, doc_id, chunk_index) means old n-gram embeddings conflict
    c.execute('DELETE FROM embeddings WHERE doc_type="repo_doc"')
    conn.commit()
    logger.info("Cleared all existing repo_doc embeddings")

    pending = get_pending_docs(db_path)
    if not pending:
        logger.info("Nothing to process")
        return 0

    total_processed = 0
    t0 = time.time()

    for doc_id, repo_id, rel_path, title, content in pending:
        title = title or ''
        content = content or ''
        full = (title + '\n\n' + content).strip()
        if not full:
            continue
        chunks = chunk_md(full)
        if not chunks:
            continue

        doc_key = f"{repo_id}:{rel_path}"
        now = time.strftime('%Y-%m-%dT%H:%M:%SZ')

        # Filter and clean texts
        texts = [str(t).strip() for t in chunks]
        texts = [t if t else ' ' for t in texts]
        if not texts:
            continue

        # Embed batch
        vecs = list(model.embed(texts))

        # Insert
        for idx, (chunk, vec) in enumerate(zip(chunks, vecs)):
            c.execute("""
                INSERT INTO embeddings (doc_type, doc_id, chunk_index, content, embedding_json, model, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, ('repo_doc', doc_key, idx, str(chunk), json.dumps(vec.tolist()), 'fastembed-multilingual-384', now, now))

        total_processed += 1
        if total_processed % 50 == 0:
            conn.commit()
            elapsed = time.time() - t0
            logger.info(f"  processed {total_processed}/{len(pending)} docs, {elapsed:.1f}s elapsed")

    conn.commit()
    conn.close()

    elapsed = time.time() - t0
    logger.info(f"Done: {total_processed} docs processed in {elapsed:.1f}s")
    return total_processed

if __name__ == '__main__':
    db_path = sys.argv[1] if len(sys.argv) > 1 else '/home/sz/workspace/data/app.db'
    logger.info(f"Starting repo_doc rebuild, db={db_path}")
    t0 = time.time()
    count = process_docs(db_path)
    logger.info(f"Total: {count} docs, wall time: {time.time()-t0:.1f}s")