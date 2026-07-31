const MERMAID_MODULE =
  'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs'

function usesDarkTheme() {
  return ['ayu', 'coal', 'navy'].some(theme =>
    document.documentElement.classList.contains(theme),
  )
}

async function renderMermaidBlocks() {
  const blocks = [...document.querySelectorAll('pre > code.language-mermaid')]
  const existingDiagrams = [...document.querySelectorAll('.mermaid')]
  if (blocks.length === 0 && existingDiagrams.length === 0) return

  let mermaid
  try {
    ;({ default: mermaid } = await import(MERMAID_MODULE))
  } catch (error) {
    console.error('[mermaid] module load failed; source blocks preserved', error)
    return
  }

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: usesDarkTheme() ? 'dark' : 'default',
  })

  for (const code of blocks) {
    const original = code.parentElement
    const diagram = document.createElement('div')
    diagram.className = 'mermaid'
    diagram.textContent = code.textContent
    original.replaceWith(diagram)
  }

  for (const diagram of [...document.querySelectorAll('.mermaid')]) {
    try {
      await mermaid.run({ nodes: [diagram] })
      if (!diagram.querySelector('svg')) throw new Error('SVG was not created')
    } catch (error) {
      diagram.classList.add('mermaid-failed')
      console.error('[mermaid] diagram render failed; source preserved', error)
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderMermaidBlocks, { once: true })
} else {
  void renderMermaidBlocks()
}
