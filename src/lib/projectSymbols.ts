/**
 * 正则符号提取器（不依赖 tree-sitter）
 *
 * 支持 C/H、Python、TypeScript/JavaScript。
 * 准确率优先级：函数 > 宏 > struct/enum > 顶层常量/typedef。
 * 不追求 100% 准确，只为 Project Brain 提供足够索引。
 */

export type SymbolType =
  | 'function'
  | 'macro'
  | 'struct'
  | 'enum'
  | 'typedef'
  | 'variable'
  | 'class';

export interface ExtractedSymbol {
  symbolType: SymbolType;
  name: string;
  signature: string;
  startLine: number;
  endLine: number;
}

function detectLanguage(relPath: string): string {
  const ext = relPath.toLowerCase().match(/\.([^.\/]+)$/)?.[1] || '';
  if (ext === 'c' || ext === 'h' || ext === 'cpp' || ext === 'cc' || ext === 'hpp') return 'c';
  if (ext === 'py') return 'python';
  if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx') return 'ts';
  if (ext === 'json') return 'json';
  if (ext === 'yaml' || ext === 'yml') return 'yaml';
  return '';
}

/**
 * 从内容中提取符号列表。
 * 返回的符号已按 startLine 升序排序。
 */
export function extractSymbols(
  language: string,
  content: string
): ExtractedSymbol[] {
  if (!content) return [];
  const lines = content.split('\n');
  const symbols: ExtractedSymbol[] = [];

  const pushSym = (
    symbolType: SymbolType,
    name: string,
    signature: string,
    startLine: number,
    endLine: number
  ) => {
    if (!name || name.length > 200) return;
    // 过滤常见的语言关键字假阳性
    if (['if', 'for', 'while', 'switch', 'return', 'else', 'do', 'case', 'default', 'sizeof'].includes(name)) return;
    symbols.push({ symbolType, name, signature: signature.slice(0, 200), startLine, endLine });
  };

  if (language === 'c') {
    // 1. #define NAME(...) value
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\s*#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)\s*(\([^)]*\))?/);
      if (m) {
        const name = m[1];
        const args = m[2] || '';
        pushSym('macro', name, `#define ${name}${args}`, i + 1, i + 1);
      }
    }

    // 2. typedef struct/enum { ... } Name;
    for (let i = 0; i < lines.length; i++) {
      const structOpen = lines[i].match(/^\s*typedef\s+(struct|enum)\s+\w*\s*\{/);
      if (structOpen) {
        const kind = structOpen[1]; // 'struct' | 'enum'
        // find closing brace
        let depth = 1;
        let endIdx = i;
        for (let j = i + 1; j < lines.length && j < i + 500; j++) {
          if (lines[j].includes('{')) depth++;
          if (lines[j].includes('}')) {
            depth--;
            if (depth === 0) { endIdx = j; break; }
          }
        }
        const closingLine = lines[endIdx] || '';
        const nameMatch = closingLine.match(/\}\s*([A-Za-z_][A-Za-z0-9_]*)\s*;/);
        if (nameMatch) {
          pushSym(kind as SymbolType, nameMatch[1], `typedef ${kind} { ... } ${nameMatch[1]};`, i + 1, endIdx + 1);
        }
        i = endIdx;
      }
    }

    // 3. typedef old_type Name;  (single line, no brace)
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\s*typedef\s+([A-Za-z_][\w\s\*]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/);
      if (m && !lines[i].includes('{')) {
        pushSym('typedef', m[2], lines[i].trim(), i + 1, i + 1);
      }
    }

    // 4. Top-level function definitions:  ret name(args) {
    //    要求行首缩进较少（顶层），名字后紧跟 (，且行尾或下一行有 {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // 跳过 # 预处理行、注释行
      if (/^\s*#/.test(line) || /^\s*(\/\/|\/\*)/.test(line)) continue;
      const m = line.match(
        /^([A-Za-z_][\w\s\*]*?\s+|\s*)([A-Za-z_][A-Za-z0-9_]*)\s*\(([^;]*)\)\s*\{?\s*$/
      );
      if (m && line.includes('(') && (line.includes('{') || (lines[i + 1] || '').trim().startsWith('{'))) {
        const ret = (m[1] || '').trim();
        const name = m[2];
        const args = m[3] || '';
        // 排除控制语句
        if (['if', 'for', 'while', 'switch', 'return', 'else', 'do', 'case', 'default', 'sizeof'].includes(name)) continue;
        // 排除明显不是函数定义（如函数调用）
        if (!ret || ret.length === 0) continue;
        // 估算函数体结束：找匹配的 }
        let depth = line.includes('{') ? 1 : 0;
        let endIdx = i;
        if (depth === 0 && (lines[i + 1] || '').trim().startsWith('{')) {
          depth = 1;
          endIdx = i + 1;
        }
        for (let j = endIdx + 1; j < lines.length && j < i + 500; j++) {
          if (lines[j].includes('{')) depth++;
          if (lines[j].includes('}')) {
            depth--;
            if (depth === 0) { endIdx = j; break; }
          }
        }
        pushSym('function', name, `${ret} ${name}(${args})`, i + 1, endIdx + 1);
      }
    }
  } else if (language === 'python') {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // def name(args):
      const defM = line.match(/^(\s*)def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/);
      if (defM) {
        const indent = defM[1].length;
        const name = defM[2];
        const args = defM[3] || '';
        // end = next line with same/lower indent that's not blank
        let endIdx = i;
        for (let j = i + 1; j < lines.length; j++) {
          const l = lines[j];
          if (!l.trim()) continue;
          const m2 = l.match(/^(\s*)/);
          if ((m2?.[1].length || 0) <= indent && !l.trim().startsWith('#')) {
            endIdx = j - 1;
            break;
          }
          endIdx = j;
        }
        pushSym('function', name, `def ${name}(${args})`, i + 1, endIdx + 1);
        continue;
      }
      // class Name(...):
      const clsM = line.match(/^(\s*)class\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (clsM) {
        const indent = clsM[1].length;
        const name = clsM[2];
        let endIdx = i;
        for (let j = i + 1; j < lines.length; j++) {
          const l = lines[j];
          if (!l.trim()) continue;
          const m2 = l.match(/^(\s*)/);
          if ((m2?.[1].length || 0) <= indent && !l.trim().startsWith('#')) {
            endIdx = j - 1;
            break;
          }
          endIdx = j;
        }
        pushSym('class', name, line.trim(), i + 1, endIdx + 1);
        continue;
      }
      // 顶层常量 NAME = ...
      if (/^[A-Z][A-Z0-9_]*\s*=/.test(line)) {
        const m = line.match(/^([A-Z][A-Z0-9_]*)\s*=/);
        if (m) pushSym('variable', m[1], line.trim(), i + 1, i + 1);
      }
    }
  } else if (language === 'ts') {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // function name(...) { / export function name(...) {
      const fnM = line.match(/^\s*(?:export\s+|export\s+default\s+|async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/);
      if (fnM) {
        const name = fnM[1];
        const args = fnM[2] || '';
        // find matching {
        let depth = 0;
        let endIdx = i;
        for (let j = i; j < lines.length && j < i + 500; j++) {
          if (lines[j].includes('{')) depth++;
          if (lines[j].includes('}')) {
            depth--;
            if (depth === 0) { endIdx = j; break; }
          }
        }
        pushSym('function', name, `function ${name}(${args})`, i + 1, endIdx + 1);
        continue;
      }
      // class Name {
      const clsM = line.match(/^\s*(?:export\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (clsM) {
        const name = clsM[1];
        let depth = 0;
        let endIdx = i;
        for (let j = i; j < lines.length && j < i + 500; j++) {
          if (lines[j].includes('{')) depth++;
          if (lines[j].includes('}')) {
            depth--;
            if (depth === 0) { endIdx = j; break; }
          }
        }
        pushSym('class', name, line.trim(), i + 1, endIdx + 1);
        continue;
      }
      // const NAME = ...
      const constM = line.match(/^\s*(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (constM) {
        pushSym('variable', constM[1], line.trim().slice(0, 150), i + 1, i + 1);
      }
    }
  }

  symbols.sort((a, b) => a.startLine - b.startLine);
  return symbols;
}

/**
 * 生成文件摘要（用于 project_code_files.summary 字段）
 * 规则：取前 N 行非空非注释文本，去掉过多空白。
 */
export function buildFileSummary(content: string, maxLen = 300): string {
  if (!content) return '';
  const lines = content.split('\n');
  const out: string[] = [];
  let totalLen = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    // 跳过纯注释行（C/JS 风格）
    if (/^(\/\/|\/\*|\*|<!--)/.test(t)) continue;
    // 跳过 # 预处理行、纯 import/include
    if (/^(#include|#import|import\s|using\s)/.test(t)) continue;
    out.push(t);
    totalLen += t.length + 1;
    if (totalLen >= maxLen) break;
  }
  return out.join(' ').slice(0, maxLen);
}

export { detectLanguage };
