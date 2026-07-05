#!/usr/bin/env python3
"""
OpenMontage integration for Personal Workspace.
Takes analyzed video data and generates a new video using OpenMontage tools.

Usage:
  python3 run_montage.py <job_id> <title> "<description>"
"""
import sys, os, json, time, subprocess
from pathlib import Path

# Add OpenMontage to path
MONTAGE_ROOT = Path('/home/sz/OpenMontage')
sys.path.insert(0, str(MONTAGE_ROOT))

# Load OpenMontage .env
env_path = MONTAGE_ROOT / '.env'
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and '=' in line and not line.startswith('#'):
                k, v = line.split('=', 1)
                k = k.strip(); v = v.strip()
                if k not in os.environ:
                    os.environ[k] = v

OUTPUT_DIR = Path('/home/sz/workspace/public/montage-outputs')
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def generate_video(title: str, description: str, topic: str = '') -> dict:
    """Generate a video using available OpenMontage tools."""
    
    # Step 1: Generate a script using the configured AI
    ai_base = os.environ.get('AI_BASE_URL', '')
    ai_key = os.environ.get('AI_API_KEY', '')
    ai_model = os.environ.get('AI_MODEL', '')
    
    script = ''
    if ai_base and ai_key and ai_model:
        import urllib.request, json as j
        prompt = f'''根据以下内容生成一段30秒的视频解说脚本：
主题：{title}
{description[:1000]}

输出格式（JSON）：
{{
  "title": "视频标题",
  "script": "旁白文稿（200字以内，口语化，有感染力）",
  "visual_hints": ["画面描述1", "画面描述2", "画面描述3"]
}}
只输出JSON。'''
        try:
            req_data = j.dumps({
                'model': ai_model,
                'messages': [
                    {'role': 'system', 'content': '你是一个专业的视频脚本写手。只输出JSON。'},
                    {'role': 'user', 'content': prompt}
                ],
                'temperature': 0.6,
                'max_tokens': 1500
            }).encode()
            req = urllib.request.Request(
                f'{ai_base}/chat/completions',
                data=req_data,
                headers={
                    'Authorization': f'Bearer {ai_key}',
                    'Content-Type': 'application/json'
                }
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = j.loads(resp.read().decode())
                raw = body.get('choices', [{}])[0].get('message', {}).get('content', '')
                import re
                m = re.search(r'\{.*\}', raw, re.DOTALL)
                if m:
                    script_data = j.loads(m.group(0))
                    script = script_data
        except Exception as e:
            return {'ok': False, 'error': f'AI script gen failed: {str(e)}'}
    
    if not script:
        return {'ok': False, 'error': '无法生成脚本'}
    
    # Step 2: Try generating video using GrokVideo (if XAI_API_KEY available)
    output_path = str(OUTPUT_DIR / f'montage_{int(time.time())}.mp4')
    video_ok = False
    
    if os.environ.get('XAI_API_KEY', '').strip():
        try:
            from tools.video.grok_video import GrokVideo
            tool = GrokVideo()
            result = tool.execute({
                'prompt': f'{script.get("title", title)}. {script.get("script", "")}',
                'operation': 'text_to_video',
                'duration': 5,
                'aspect_ratio': '16:9',
                'output_path': output_path,
                'timeout_seconds': 120,
            })
            if result and getattr(result, 'success', False):
                video_ok = True
        except Exception as e:
            # Fall through to generate text-based output
            pass
    
    # Step 3: If no video tool worked, generate a text report with script
    if not video_ok:
        script_content = f'''# {script.get('title', title)}

## 旁白脚本
{script.get('script', '')}

## 分镜建议
'''
        for i, hint in enumerate(script.get('visual_hints', []), 1):
            script_content += f'{i}. {hint}\n'
        
        report_path = str(OUTPUT_DIR / f'montage_{int(time.time())}.md')
        with open(report_path, 'w') as f:
            f.write(script_content)
        output_path = report_path
    
    return {
        'ok': True,
        'script': script.get('script', ''),
        'title': script.get('title', title),
        'outputPath': output_path,
        'videoUrl': f'/montage-outputs/{Path(output_path).name}',
        'note': '视频生成需要有效的XAI_API_KEY（GrokVideo），当前生成了脚本+分镜'
    }

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(json.dumps({'ok': False, 'error': 'Usage: run_montage.py <job_id> <title> [description]'}))
        sys.exit(1)
    
    job_id = sys.argv[1]
    title = sys.argv[2]
    description = sys.argv[3] if len(sys.argv) > 3 else ''
    topic = sys.argv[4] if len(sys.argv) > 4 else ''
    
    result = generate_video(title, description, topic)
    print(json.dumps(result, ensure_ascii=False))