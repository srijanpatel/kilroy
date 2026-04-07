import { useContext, useEffect, useMemo, useRef } from 'react';
import { MathJaxBaseContext } from 'better-react-mathjax';
import { Marked, type RendererExtensionFunction, type TokenizerExtensionFunction } from 'marked';

type MathToken = {
  type: 'mathInline' | 'mathBlock';
  raw: string;
  body: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function isEscaped(value: string, index: number) {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function readDollarMathInline(src: string) {
  if (!src.startsWith('$') || src.startsWith('$$')) return null;

  for (let index = 1; index < src.length; index += 1) {
    if (src[index] === '\n') return null;
    if (src[index] !== '$' || isEscaped(src, index)) continue;

    const inner = src.slice(1, index);
    if (!inner.trim() || /^\s|\s$/.test(inner)) return null;

    return {
      raw: src.slice(0, index + 1),
      body: inner,
    };
  }

  return null;
}

function readParenMathInline(src: string) {
  if (!src.startsWith('\\(')) return null;

  for (let index = 2; index < src.length - 1; index += 1) {
    if (src[index] === '\n') return null;
    if (src[index] !== '\\' || src[index + 1] !== ')' || isEscaped(src, index)) continue;

    const inner = src.slice(2, index);
    if (!inner.trim()) return null;

    return {
      raw: src.slice(0, index + 2),
      body: inner,
    };
  }

  return null;
}

function readMathBlock(src: string, open: string, close: string) {
  if (!src.startsWith(open)) return null;

  for (let index = open.length; index < src.length; index += 1) {
    if (!src.startsWith(close, index) || isEscaped(src, index)) continue;

    let tail = index + close.length;
    while (tail < src.length && (src[tail] === ' ' || src[tail] === '\t')) {
      tail += 1;
    }

    if (tail < src.length && src[tail] !== '\n' && src[tail] !== '\r') {
      continue;
    }

    if (src[tail] === '\r') tail += 1;
    if (src[tail] === '\n') tail += 1;

    return {
      raw: src.slice(0, tail),
      body: src.slice(open.length, index),
    };
  }

  return null;
}

const renderMath: RendererExtensionFunction = (token) => {
  const mathToken = token as MathToken;
  if (mathToken.type === 'mathBlock') {
    return `<div class="math-block">${escapeHtml(`\\[${mathToken.body}\\]`)}</div>`;
  }

  return `<span class="math-inline">${escapeHtml(`\\(${mathToken.body}\\)`)}</span>`;
};

const mathInlineTokenizer: TokenizerExtensionFunction = function (src) {
  const token = readDollarMathInline(src) ?? readParenMathInline(src);
  if (!token) return;

  return {
    type: 'mathInline',
    raw: token.raw,
    body: token.body,
  };
};

const mathBlockTokenizer: TokenizerExtensionFunction = function (src) {
  const token = readMathBlock(src, '$$', '$$') ?? readMathBlock(src, '\\[', '\\]');
  if (!token) return;

  return {
    type: 'mathBlock',
    raw: token.raw,
    body: token.body,
  };
};

const markdown = new Marked({
  breaks: true,
  gfm: true,
  extensions: [
    {
      name: 'mathBlock',
      level: 'block',
      tokenizer: mathBlockTokenizer,
      renderer: renderMath,
    },
    {
      name: 'mathInline',
      level: 'inline',
      tokenizer: mathInlineTokenizer,
      renderer: renderMath,
    },
  ],
});

export function Markdown({ content, className }: { content: string; className?: string }) {
  const mathJax = useContext(MathJaxBaseContext);
  const containerRef = useRef<HTMLDivElement>(null);
  const html = useMemo(() => markdown.parse(content || '') as string, [content]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !mathJax) return;

    let cancelled = false;

    mathJax.promise
      .then(async (instance) => {
        if (cancelled || !container) return;

        if (mathJax.version === 2) {
          instance.Hub.Queue(['Typeset', instance.Hub, container]);
          return;
        }

        await instance.startup.promise;
        if (cancelled || !container) return;
        instance.typesetClear([container]);
        await instance.typesetPromise([container]);
      })
      .catch((error) => {
        console.error('MathJax typesetting failed', error);
      });

    return () => {
      cancelled = true;
    };
  }, [html, mathJax]);

  return <div ref={containerRef} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
