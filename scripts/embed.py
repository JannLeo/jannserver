#!/usr/bin/env python3
"""
Minimal text embedding using only Python stdlib.
Character n-gram TF vectors → deterministic 384-dim vectors.
Reasonable cosine similarity for semantically similar texts.
"""
import sys, json, hashlib, math

DIM = 384
NGRAM = 3
SEED = 42

# Generate stable random basis vectors using hashing
_BASIS = []
for i in range(DIM):
    h = hashlib.sha256(f"{SEED}:basis:{i}".encode()).digest()
    # Convert hash to a unit vector direction
    v = []
    for j in range(0, 32, 4):
        val = int.from_bytes(h[j:j+4], 'little')
        v.append(val / 2**32 * 2 - 1)  # normalize to [-1, 1]
    _BASIS.append(v)

def _sanitize(text: str) -> str:
    """Remove unpaired surrogates which cause encode() to fail."""
    return text.encode('utf-8', errors='surrogatepass').decode('utf-8', errors='ignore')

def _ngram_hash(text: str, n: int) -> int:
    clean = _sanitize(text)
    return int(hashlib.md5(clean.encode()).hexdigest()[:8], 16)

def _embed_one(text: str) -> list:
    """Generate 384-dim embedding vector using character n-gram hashing."""
    if not text:
        return [0.0] * DIM
    
    text = _sanitize(text.lower())
    # Count all n-grams
    ngram_counts = {}
    total = 0
    for i in range(len(text) - NGRAM + 1):
        ng = text[i:i+NGRAM]
        ngram_counts[ng] = ngram_counts.get(ng, 0) + 1
        total += 1
    
    if total == 0:
        return [0.0] * DIM
    
    # Reduce to top N n-grams for speed
    top = sorted(ngram_counts.items(), key=lambda x: -x[1])[:256]
    
    # Create embedding: for each n-gram, hash to D basis vectors
    vec = [0.0] * DIM
    norm = 0.0
    for ng, count in top:
        h = _ngram_hash(ng, NGRAM)
        idx = h % len(_BASIS)
        weight = math.log1p(count)
        basis = _BASIS[idx]
        for d in range(DIM):
            vec[d] += weight * basis[d % len(basis)]
    
    # L2 normalize
    norm = math.sqrt(sum(v*v for v in vec))
    if norm > 0:
        vec = [v / norm for v in vec]
    
    return vec

def main():
    data = json.load(sys.stdin)
    texts = data.get('input', [])
    if isinstance(texts, str):
        texts = [texts]
    
    results = []
    for t in texts:
        vec = _embed_one(t)
        results.append(vec)
    
    output = {'data': [{'embedding': v} for v in results]}
    json.dump(output, sys.stdout, ensure_ascii=False)

if __name__ == '__main__':
    main()