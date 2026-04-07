import type { MathJax3Config } from 'better-react-mathjax';
import mathJaxSrc from '@mathjax/src/bundle/tex-mml-chtml.js?url';

export const mathJaxBundleUrl = mathJaxSrc;

export const mathJaxConfig: MathJax3Config = {
  tex: {
    inlineMath: [['\\(', '\\)']],
    displayMath: [['\\[', '\\]']],
    processEscapes: true,
    processEnvironments: true,
  },
  options: {
    skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
  },
};
