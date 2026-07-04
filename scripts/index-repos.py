#!/usr/bin/env python3
"""
index-repos.py — 扫描已克隆的仓库，将 .md 文档写入 repo_documents 表
Run: python3 scripts/index-repos.py
"""
import sqlite3, os, re, hashlib, datetime
from pathlib import Path

REPOS_BASE = Path('/home/sz/workspace/data/repos')
DB_PATH = '/home/sz/workspace/data/app.db'
SKIP_DIRS = {'.git','node_modules','.next','.cache','dist','build','venv','.venv','site-packages','__pycache__'}

def sql():
    conn = sqlite3.connect(DB_PATH)
    conn.execute('PRAGMA journal_mode=WAL')
    return conn

def repo_id(name):
    r = sql().execute('SELECT id FROM repo_sources WHERE name=?', (name,)).fetchone()
    sql().close()
    return r[0] if r else None

def upsert(conn, repo_id, fp, title, rel, content, h):
    now = datetime.datetime.now().isoformat()
    ex = conn.execute('SELECT id,content_hash FROM repo_documents WHERE repo_id=? AND file_path=?',
                      (repo_id, fp)).fetchone()
    if ex:
        if ex[1] != h:
            conn.execute('UPDATE repo_documents SET title=?,rel_path=?,content_hash=?,content=?,updated_at=? WHERE id=?',
                        (title, rel, h, content, now, ex[0]))
            return 'updated'
        return 'same'
    else:
        conn.execute(
            'INSERT INTO repo_documents (repo_id,file_path,title,rel_path,content_hash,content,updated_at) VALUES (?,?,?,?,?,?,?)',
            (repo_id, fp, title, rel, h, content, now))
        return 'new'

def scan_md(local):
    files = []
    for root, dirs, filenames in os.walk(local):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fn in filenames:
            if fn.endswith('.md') or fn.endswith('.MD'):
                files.append(os.path.join(root, fn))
    return files

def extract_title(content, rel):
    m = re.search(r'^#\s+(.+)', content, re.M)
    if m: return m.group(1).strip()
    fm = re.search(r'^---\s*\n(.*?)\n---', content, re.S)
    if fm:
        for line in fm.group(1).split('\n'):
            if line.strip().startswith('title:'):
                return line.split('title:', 1)[1].strip().strip('"\'')
    fn = os.path.splitext(os.path.basename(rel))[0].replace('-', ' ').replace('_', ' ').strip()
    return fn or '无标题'

def strip_fm(c): return re.sub(r'^---[\s\S]*?---\n?', '', c, count=1)

def sha256(t): return hashlib.sha256(t.encode()).hexdigest()

def main():
    print('Starting indexing...', flush=True)
    conn = sql()
    added = updated = skipped = 0

    for repo_dir in sorted(REPOS_BASE.iterdir()):
        if not repo_dir.is_dir(): continue
        name = repo_dir.name
        rid = repo_id(name)
        if not rid:
            print(f'[SKIP] {name}: not in DB', flush=True)
            continue

        files = scan_md(repo_dir)
        print(f'[{name}] {len(files)} .md files', flush=True)
        for fp in files:
            try:
                raw = open(fp, encoding='utf-8', errors='ignore').read()
                rel = os.path.relpath(fp, repo_dir)
                title = extract_title(raw, rel)
                clean = strip_fm(raw)
                h = sha256(clean)
                result = upsert(conn, rid, fp, title, rel, clean, h)
                if result == 'new': added += 1
                elif result == 'updated': updated += 1
                else: skipped += 1
            except Exception as e:
                pass

        conn.commit()

    conn.close()
    print(f'\n✅ Done! new={added} updated={updated} unchanged={skipped}', flush=True)

if __name__ == '__main__':
    main()