import { marked } from 'marked';

export class MarkdownService {
  private static instance: typeof marked | null = null;

  static getRenderer(): typeof marked {
    if (this.instance) return this.instance;

    const renderer = new marked.Renderer();

    // Responsive, scroll-protected tables
    renderer.table = function (token) {
      const headerHtml = this.tablerow({
        text: token.header.map((cell) => this.tablecell(cell)).join('')
      });
      const bodyHtml = token.rows
        .map((row) => this.tablerow({ text: row.map((cell) => this.tablecell(cell)).join('') }))
        .join('');

      return `
<div class="overflow-x-auto my-6 rounded-2xl border border-white/10 dark:border-white/10 light:border-black/10 bg-white/[0.02] dark:bg-white/[0.02] light:bg-black/[0.02] shadow-sm -webkit-overflow-scrolling-touch">
  <table class="w-full text-xs text-left border-collapse min-w-[500px] sm:min-w-full">
    <thead class="bg-white/5 dark:bg-white/5 light:bg-black/5">${headerHtml}</thead>
    <tbody class="divide-y divide-white/5 dark:divide-white/5 light:divide-black/5">${bodyHtml}</tbody>
  </table>
</div>`.trim();
    };

    renderer.tablerow = function ({ text }) {
      return `<tr class="hover:bg-white/[0.02] dark:hover:bg-white/[0.02] light:hover:bg-black/[0.02] transition-colors">${text}</tr>`;
    };

    renderer.tablecell = function (cell) {
      const content = this.parser.parseInline(cell.tokens);
      const alignClass = cell.align ? ` text-${cell.align}` : ' text-left';
      if (cell.header) {
        return `<th class="px-4 py-3 font-bold text-white dark:text-white light:text-ink border-b border-white/10 dark:border-white/10 light:border-black/10${alignClass}">${content}</th>`;
      }
      return `<td class="px-4 py-3 text-gray-300 dark:text-gray-300 light:text-gray-700${alignClass}">${content}</td>`;
    };

    // Safe External Links + Internal Links
    renderer.link = function (token) {
      const isExternal = token.href.startsWith('http') && !token.href.includes('akturesult.bond');
      const targetAttr = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
      const text = this.parser.parseInline(token.tokens);
      return `<a href="${token.href}"${targetAttr} class="text-brand-blue hover:text-brand-blue-hover underline font-medium transition-colors break-words">${text}</a>`;
    };

    // Semantic Headings with anchors
    renderer.heading = function (token) {
      const text = this.parser.parseInline(token.tokens);
      const id = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');

      if (token.depth === 2) {
        return `<h2 id="${id}" class="text-xl sm:text-2xl font-black text-white dark:text-white light:text-ink mt-8 mb-4 border-b border-white/10 dark:border-white/10 light:border-black/10 pb-2 tracking-tight">${text}</h2>`;
      }
      if (token.depth === 3) {
        return `<h3 id="${id}" class="text-base sm:text-lg font-bold text-brand-blue dark:text-brand-blue-light light:text-brand-blue mt-6 mb-3 tracking-tight">${text}</h3>`;
      }
      if (token.depth === 1) {
        return `<h1 id="${id}" class="text-2xl sm:text-3xl font-extrabold text-white dark:text-white light:text-ink mt-6 mb-4 tracking-tight">${text}</h1>`;
      }
      return `<h${token.depth} id="${id}" class="text-sm sm:text-base font-bold text-white dark:text-white light:text-ink mt-4 mb-2">${text}</h${token.depth}>`;
    };

    // Elegant Blockquotes
    renderer.blockquote = function (token) {
      const text = this.parser.parse(token.tokens);
      return `<blockquote class="p-4 sm:p-5 rounded-2xl bg-white/[0.03] dark:bg-white/[0.03] light:bg-black/[0.03] border-l-4 border-brand-blue text-xs sm:text-sm text-gray-300 dark:text-gray-300 light:text-gray-700 italic my-6 shadow-sm">${text}</blockquote>`;
    };

    // Bullet & Numbered Lists with consistent indentation
    renderer.list = function (token) {
      const body = token.items.map((item) => this.listitem(item)).join('');
      const tag = token.ordered ? 'ol' : 'ul';
      const listClass = token.ordered
        ? 'list-decimal list-outside pl-6 space-y-2 text-xs sm:text-sm text-gray-300 dark:text-gray-300 light:text-gray-700 my-4'
        : 'list-disc list-outside pl-6 space-y-2 text-xs sm:text-sm text-gray-300 dark:text-gray-300 light:text-gray-700 my-4';
      return `<${tag} class="${listClass}">${body}</${tag}>`;
    };

    renderer.listitem = function (token) {
      const text = this.parser.parse(token.tokens);
      return `<li class="leading-relaxed">${text}</li>`;
    };

    // Body Paragraphs with anti-overflow & clean spacing
    renderer.paragraph = function (token) {
      const text = this.parser.parseInline(token.tokens);
      return `<p class="text-xs sm:text-sm text-gray-300 dark:text-gray-300 light:text-gray-700 leading-relaxed my-4 break-words">${text}</p>`;
    };

    // Inline Code
    renderer.codespan = function (token) {
      return `<code class="px-1.5 py-0.5 rounded bg-white/10 dark:bg-white/10 light:bg-black/10 font-mono text-[11px] text-amber-300 dark:text-amber-300 light:text-amber-800 break-words">${token.text}</code>`;
    };

    // Code Blocks
    renderer.code = function (token) {
      return `<pre class="p-4 rounded-2xl bg-black/60 dark:bg-black/60 light:bg-black/5 border border-white/10 dark:border-white/10 light:border-black/10 font-mono text-xs overflow-x-auto my-4 text-emerald-400 dark:text-emerald-400 light:text-emerald-800"><code>${token.text}</code></pre>`;
    };

    // Horizontal Rule
    renderer.hr = function () {
      return `<hr class="my-8 border-white/10 dark:border-white/10 light:border-black/10" />`;
    };

    // Responsive images
    renderer.image = function (token) {
      return `<div class="my-6 rounded-2xl overflow-hidden border border-white/10 dark:border-white/10 light:border-black/10"><img src="${token.href}" alt="${token.text || 'AKTU News Image'}" class="w-full h-auto object-cover max-h-[500px]" loading="lazy" /></div>`;
    };

    marked.use({
      renderer,
      gfm: true,
      breaks: true
    });

    this.instance = marked;
    return this.instance;
  }

  static render(markdown: string): string {
    if (!markdown) return '';
    const instance = this.getRenderer();
    return instance.parse(markdown) as string;
  }
}
