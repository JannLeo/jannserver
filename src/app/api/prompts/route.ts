import { NextResponse } from 'next/server';
import { getPromptFiles, getPromptContent } from '@/lib/prompts';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');

  if (path) {
    // 返回单个文件内容
    const content = await getPromptContent(path);
    if (content === null) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    return NextResponse.json({ content, path });
  }

  // 返回所有文件列表
  const files = await getPromptFiles();
  return NextResponse.json({ files });
}