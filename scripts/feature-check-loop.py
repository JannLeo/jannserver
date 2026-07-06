#!/usr/bin/env python3
"""
Feature test loop — runs every 15 minutes and reports status.
If a feature is broken, attempts to fix it and rebuilds.

Usage: python3 /home/sz/workspace/scripts/feature-check-loop.py
"""
import subprocess, json, time, sys, os
from datetime import datetime

BASE = "http://localhost:3000"
COOKIE = "/tmp/feature_check_cookie.txt"

def now():
    return datetime.now().strftime("%H:%M:%S")

def curl(method, path, data=None, timeout=30):
    cmd = ['curl', '-sS', '-b', COOKIE, '-c', COOKIE]
    if data:
        cmd += ['-X', method, '-H', 'Content-Type: application/json', '-d', json.dumps(data)]
    cmd += [f'{BASE}{path}', '--max-time', str(timeout)]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout+5)
    return r.stdout, r.returncode

def check_health():
    out, _ = curl('GET', '/api/health', timeout=5)
    return out == '{"status":"ok"}'

def ensure_login():
    raw, _ = curl('POST', '/api/auth/login', {'username': 'admin', 'password': 'admin123'}, timeout=5)
    return json.loads(raw).get('ok', False)

def test_ai_ask():
    """AI 问答: ask a simple question and check if answer comes back."""
    raw, code = curl('POST', '/api/ai/ask', {'question': 'fitness是什么'}, timeout=40)
    if code != 0:
        return False, f"curl exit {code}"
    try:
        d = json.loads(raw)
        if d.get('answer') and d.get('configured'):
            return True, f"OK ({len(d.get('answer',''))} chars)"
        return False, f"no answer: {str(d)[:100]}"
    except:
        return False, f"JSON parse error: {raw[:100]}"

def test_novel():
    """小说生成: create novel + chapter generation."""
    raw, _ = curl('POST', '/api/novels', {'title': 'test', 'genre': 'sci-fi'}, timeout=5)
    try:
        nid = json.loads(raw).get('id', '')
        if not nid:
            return False, f"no nid: {raw[:100]}"
    except:
        return False, f"novel create failed: {raw[:100]}"
    
    # Use chapter phase which is faster
    raw, code = curl('POST', f'/api/novels/{nid}/ai-generate', 
                    {'phase': 'chapter', 'chapterTitle': 'test', 'previousSummary': 'test'}, 
                    timeout=60)
    if code != 0:
        return False, f"timeout/curl exit {code}"
    try:
        d = json.loads(raw)
        if d.get('content'):
            return True, f"OK ({len(d['content'])} chars)"
        return False, f"no content: {str(d)[:100]}"
    except:
        return False, f"JSON error: {raw[:100]}"

def test_video():
    """视频爬虫: create job and verify jobId."""
    raw, code = curl('POST', '/api/video-analysis/jobs', 
                    {'url': 'https://www.bilibili.com/video/BV1BJ411y7WD', 
                     'platform': 'bilibili', 'keyword': 'test'}, 
                    timeout=10)
    if code != 0:
        return False, f"curl exit {code}"
    try:
        d = json.loads(raw)
        if d.get('ok') and d.get('jobId'):
            return True, f"OK jobId={d['jobId']}"
        return False, f"no jobId: {str(d)[:100]}"
    except:
        return False, f"JSON error: {raw[:100]}"

def rebuild():
    """Rebuild the workspace and restart PM2."""
    print(f"[{now()}] Rebuilding...")
    r = subprocess.run(['npm', 'run', 'build'], cwd='/home/sz/workspace', 
                      capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        print(f"[{now()}] Build FAILED: {r.stderr[-200:]}")
        return False
    r = subprocess.run(['pm2', 'restart', 'personal-workspace', '--update-env'],
                      capture_output=True, text=True, timeout=15)
    time.sleep(8)
    return check_health()

def run():
    print(f"\n{'='*50}")
    print(f"[{now()}] Feature check starting")
    
    # Ensure logged in
    if not ensure_login():
        print(f"[{now()}] Login failed")
        return
    
    results = {}
    features = [
        ('AI问答', test_ai_ask),
        ('小说生成', test_novel),
        ('视频爬虫', test_video),
    ]
    
    for name, fn in features:
        t0 = time.time()
        ok, detail = fn()
        elapsed = time.time() - t0
        results[name] = (ok, detail)
        status = "✅" if ok else "❌"
        print(f"  {status} {name}: {detail} ({elapsed:.1f}s)")
    
    # Summary
    all_ok = all(ok for ok, _ in results.values())
    if all_ok:
        print(f"[{now()}] All features OK ✅")
    else:
        broken = [name for name, (ok, _) in results.items() if not ok]
        print(f"[{now()}] Broken: {', '.join(broken)} — needs attention")
    
    return all_ok

if __name__ == '__main__':
    run()