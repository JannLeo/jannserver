#!/usr/bin/env python3
"""
sync-repos.py — 把 JannLeo 所有 GitHub 仓库 clone 到本地并索引 .md 文档
Run: python3 scripts/sync-repos.py
"""
import sqlite3, json, subprocess, os, hashlib, re, sys
from pathlib import Path

REPOS_BASE = Path('/home/sz/workspace/data/repos')
DB_PATH    = '/home/sz/workspace/data/app.db'
GITHUB_USER = 'JannLeo'
ALREADY = {'summary-for-work', 'worldquant', 'teach'}

# GitHub PAT from ~/.git-credentials
_GITHUB_TOKEN = None
def get_github_token():
    global _GITHUB_TOKEN
    if _GITHUB_TOKEN:
        return _GITHUB_TOKEN
    try:
        import pathlib
        creds = pathlib.Path.home() / '.git-credentials'
        if creds.exists():
            for line in creds.read_text().strip().split('\n'):
                # Format: https://username:ghp_TOKEN@github.com
                if 'ghp_' in line:
                    start = line.index('ghp_')
                    end = line.index('@', start)
                    _GITHUB_TOKEN = line[start:end]
                    return _GITHUB_TOKEN
    except Exception:
        pass
    return None

SKIP_DIRS = {'.git','node_modules','.next','.cache','dist','build','venv','.venv','site-packages'}

def sql():
    conn = sqlite3.connect(DB_PATH)
    conn.execute('PRAGMA journal_mode=WAL')
    return conn

def repo_in_db(name):
    return sql().execute('SELECT id FROM repo_sources WHERE name=?', (name,)).fetchone()

def insert_repo(name, url, branch):
    conn = sql()
    now = __import__('datetime').datetime.now().isoformat()
    local = str(REPOS_BASE / name)
    conn.execute(
        'INSERT OR IGNORE INTO repo_sources (name,url,branch,local_path,created_at,updated_at) VALUES (?,?,?,?,?,?)',
        (name, url, branch or 'main', local, now, now)
    )
    conn.commit()
    row = conn.execute('SELECT id FROM repo_sources WHERE name=?', (name,)).fetchone()
    conn.close()
    return row[0] if row else None

def update_sync_time(repo_id):
    conn = sql()
    conn.execute('UPDATE repo_sources SET last_sync_at=? WHERE id=?',
                 (__import__('datetime').datetime.now().isoformat(), repo_id))
    conn.commit()
    conn.close()

def count_docs(repo_id):
    r = sql().execute('SELECT COUNT(*) FROM repo_documents WHERE repo_id=?', (repo_id,)).fetchone()
    sql().close()
    return r[0]

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

def upsert_doc(repo_id, fp, title, rel, content, h):
    conn = sql()
    now = __import__('datetime').datetime.now().isoformat()
    ex = conn.execute('SELECT id,content_hash FROM repo_documents WHERE repo_id=? AND file_path=?',
                      (repo_id, fp)).fetchone()
    if ex:
        if ex[1] != h:
            conn.execute(
                'UPDATE repo_documents SET title=?,rel_path=?,content_hash=?,content=?,updated_at=? WHERE id=?',
                (title, rel, h, content, now, ex[0]))
    else:
        conn.execute(
            'INSERT INTO repo_documents (repo_id,file_path,title,rel_path,content_hash,content,updated_at) VALUES (?,?,?,?,?,?,?)',
            (repo_id, fp, title, rel, h, content, now))
    conn.commit()
    conn.close()

def git(args, cwd=None, timeout=300):
    env = dict(os.environ, GIT_TERMINAL_PROMPT='0')
    result = subprocess.run(
        ['git'] + list(args),
        cwd=cwd or str(REPOS_BASE),
        capture_output=True, text=True, timeout=timeout, env=env
    )
    return result

def fetch_github_repos():
    import urllib.request
    token = get_github_token()
    headers = {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'workspace-sync-bot',
    }
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(
        f'https://api.github.com/users/{GITHUB_USER}/repos?per_page=100&sort=updated',
        headers=headers
    )
    with urllib.request.urlopen(req) as r:
        return [x for x in json.loads(r.read()) if not x.get('fork')]

def sync_one(name, repo_id, branch):
    local = REPOS_BASE / name
    https_url = f'https://github.com/{GITHUB_USER}/{name}.git'
    now = __import__('datetime').datetime.now().isoformat()
    conn = sql()

    if not local.exists() or not any(local.iterdir()) or list(local.glob('*')) == [local/'.git']:
        print(f'  [CLONE] {name}...', flush=True)
        r = git(['clone', '--branch', branch, '--depth', '1', https_url, str(local)])
        if r.returncode != 0:
            print(f'  [ERROR] {r.stderr[:200]}', flush=True)
            conn.close()
            return
        print(f'  ✓ cloned', flush=True)
    else:
        print(f'  [PULL] {name}...', flush=True)
        r = git(['-C', str(local), 'pull', 'origin', branch])
        if r.returncode != 0:
            print(f'  ⚠ pull failed, continuing: {r.stderr[:80]}', flush=True)

    files = scan_md(local)
    print(f'  → {len(files)} .md files', flush=True)
    added = updated = 0
    for f in files:
        try:
            raw = open(f, encoding='utf-8', errors='ignore').read()
            rel = os.path.relpath(f, local)
            title = extract_title(raw, rel)
            clean = strip_fm(raw)
            h = sha256(clean)
            ex = conn.execute('SELECT id,content_hash FROM repo_documents WHERE repo_id=? AND file_path=?',
                              (repo_id, f)).fetchone()
            if ex:
                if ex[1] != h:
                    conn.execute(
                        'UPDATE repo_documents SET title=?,rel_path=?,content_hash=?,content=?,updated_at=? WHERE id=?',
                        (title, rel, h, clean, now, ex[0]))
                    updated += 1
            else:
                conn.execute(
                    'INSERT INTO repo_documents (repo_id,file_path,title,rel_path,content_hash,content,updated_at) VALUES (?,?,?,?,?,?,?)',
                    (repo_id, f, title, rel, h, clean, now))
                added += 1
        except Exception:
            pass
    conn.commit()
    conn.close()
    print(f'  ✓ {name}: {added} added, {updated} updated', flush=True)

def main():
    REPOS_BASE.mkdir(parents=True, exist_ok=True)
    print('Fetching GitHub repos...', flush=True)
    all_repos = fetch_github_repos()
    to_sync = [r for r in all_repos if r['name'] not in ALREADY]
    print(f'Found {len(all_repos)} repos, {len(to_sync)} new to sync: {[r["name"] for r in to_sync]}', flush=True)

    # Register in DB
    for r in to_sync:
        existing = repo_in_db(r['name'])
        if existing:
            print(f'[SKIP] {r["name"]} already registered', flush=True)
        else:
            bid = r.get('default_branch') or 'main'
            iid = insert_repo(r['name'], r['clone_url'], bid)
            print(f'[REGISTER] {r["name"]} → id={iid}', flush=True)

    # Clone + index
    for r in to_sync:
        rid = repo_in_db(r['name'])
        if not rid:
            print(f'[ERROR] {r["name"]} not in DB', flush=True)
            continue
        print(f'[{r["name"]}]', flush=True)
        sync_one(r['name'], rid, r.get('default_branch') or 'main')

    print('\n✅ All done!', flush=True)

if __name__ == '__main__':
    main()