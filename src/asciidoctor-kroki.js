// @ts-check
const { KrokiDiagram, KrokiClient } = require('./kroki-client.js')

function UnsupportedFormatError (message) {
  this.name = 'UnsupportedFormatError'
  this.message = message
  this.stack = (new Error()).stack
}

// eslint-disable-next-line new-parens
UnsupportedFormatError.prototype = new Error

function InvalidConfigurationError (message) {
  this.name = 'InvalidConfigurationError'
  this.message = message
  this.stack = (new Error()).stack
}

// eslint-disable-next-line new-parens
InvalidConfigurationError.prototype = new Error

const isBrowser = () => {
  return typeof window === 'object' && typeof window.XMLHttpRequest === 'object'
}

// A value of 20 (SECURE) disallows the document from attempting to read files from the file system
const SAFE_MODE_SECURE = 20

const createImageSrc = (doc, krokiDiagram, target, vfs, krokiClient) => {
  const shouldFetch = doc.isAttribute('kroki-fetch-diagram')
  let imageUrl
  if (shouldFetch && doc.getSafe() < SAFE_MODE_SECURE) {
    imageUrl = require('./fetch.js').save(krokiDiagram, doc, target, vfs, krokiClient)
  } else {
    imageUrl = krokiDiagram.getDiagramUri(krokiClient.getServerUrl())
  }
  return imageUrl
}

/**
 * Get the option defined on the block or macro.
 *
 * First, check if an option is defined as an attribute.
 * If there is no match, check if an option is defined as a default settings in the document attributes.
 *
 * @param attrs - list of attributes
 * @param document - Asciidoctor document
 * @returns {string|undefined} - the option name or undefined
 */
function getOption (attrs, document) {
  const availableOptions = ['inline', 'interactive', 'none']
  for (const option of availableOptions) {
    if (attrs[`${option}-option`] === '') {
      return option
    }
  }
  for (const option of availableOptions) {
    if (document.getAttribute('kroki-default-options') === option) {
      return option
    }
  }
}

const processKroki = (processor, parent, attrs, diagramType, diagramText, context, diagramDir) => {
  const doc = parent.getDocument()
  // If "subs" attribute is specified, substitute accordingly.
  // Be careful not to specify "specialcharacters" or your diagram code won't be valid anymore!
  const subs = attrs.subs
  if (subs) {
    context.diagramType = diagramType
    diagramText = parent.applySubstitutions(diagramText, parent.$resolve_subs(subs))
    delete context.diagramType
  }
  if (doc.getSafe() < SAFE_MODE_SECURE) {
    if (diagramType === 'vegalite') {
      diagramText = require('./preprocess.js').preprocessVegaLite(diagramText, context, diagramDir)
    } else if (diagramType === 'plantuml' || diagramType === 'c4plantuml') {
      const plantUmlIncludeFile = doc.getAttribute('kroki-plantuml-include')
      if (plantUmlIncludeFile) {
        diagramText = `!include ${plantUmlIncludeFile}\n${diagramText}`
      }
      const plantUmlIncludePaths = doc.getAttribute('kroki-plantuml-include-paths')
      diagramText = require('./preprocess.js').preprocessPlantUML(diagramText, context, plantUmlIncludePaths, diagramDir)
    }
  }
  const blockId = attrs.id
  const format = attrs.format || doc.getAttribute('kroki-default-format') || 'svg'
  const caption = attrs.caption
  const title = attrs.title
  let role = attrs.role
  if (role) {
    if (format) {
      role = `${role} kroki-format-${format} kroki`
    } else {
      role = `${role} kroki`
    }
  } else {
    role = 'kroki'
  }
  const blockAttrs = Object.assign({}, attrs)
  blockAttrs.role = role
  blockAttrs.format = format
  delete blockAttrs.title
  delete blockAttrs.caption
  delete blockAttrs.opts
  const option = getOption(attrs, doc)
  if (option && option !== 'none') {
    blockAttrs[`${option}-option`] = ''
  }

  if (blockId) {
    blockAttrs.id = blockId
  }
  const krokiDiagram = new KrokiDiagram(diagramType, format, diagramText)
  const httpClient = isBrowser() ? require('./http/browser-http.js') : require('./http/node-http.js')
  const krokiClient = new KrokiClient(doc, httpClient)
  let block
  if (format === 'txt' || format === 'atxt' || format === 'utxt') {
    const textContent = krokiClient.getTextContent(krokiDiagram)
    block = processor.createBlock(parent, 'literal', textContent, blockAttrs)
  } else {
    let alt
    if (attrs.title) {
      alt = attrs.title
    } else if (attrs.target) {
      alt = attrs.target
    } else {
      alt = 'Diagram'
    }
    blockAttrs.target = createImageSrc(doc, krokiDiagram, attrs.target, context.vfs, krokiClient)
    blockAttrs.alt = alt
    block = processor.createImageBlock(parent, blockAttrs)
  }
  if (title) {
    block['$title='](title)
  }
  block.$assign_caption(caption, 'figure')
  return block
}

function diagramBlock (context) {
  return function () {
    const self = this
    self.onContext(['listing', 'literal'])
    self.positionalAttributes(['target', 'format'])
    self.process((parent, reader, attrs) => {
      const diagramType = this.name.toString()
      const role = attrs.role
      const diagramText = reader.$read()
      try {
        return processKroki(this, parent, attrs, diagramType, diagramText, context)
      } catch (e) {
        console.warn(`Skipping ${diagramType} block. ${e.message}`)
        attrs.role = role ? `${role} kroki-error` : 'kroki-error'
        return this.createBlock(parent, attrs['cloaked-context'], diagramText, attrs)
      }
    })
  }
}

function diagramBlockMacro (name, context) {
  return function () {
    const self = this
    self.named(name)
    self.positionalAttributes(['format'])
    self.process((parent, target, attrs) => {
      let vfs = context.vfs
      target = parent.applySubstitutions(target, ['attributes'])
      if (isBrowser()) {
        if (!['file://', 'https://', 'http://'].some(prefix => target.startsWith(prefix))) {
          // if not an absolute URL, prefix with baseDir in the browser environment
          const doc = parent.getDocument()
          const baseDir = doc.getBaseDir()
          const startDir = typeof baseDir !== 'undefined' ? baseDir : '.'
          target = startDir !== '.' ? doc.normalizeWebPath(target, startDir) : target
        }
      } else {
        if (typeof vfs === 'undefined' || typeof vfs.read !== 'function') {
          vfs = require('./node-fs.js')
          target = parent.normalizeSystemPath(target)
        }
      }
      const role = attrs.role
      const diagramType = name
      try {
        const diagramText = vfs.read(target)
        const diagramDir = target.substr(0, target.lastIndexOf('/') + 1)
        return processKroki(this, parent, attrs, diagramType, diagramText, context, diagramDir)
      } catch (e) {
        console.warn(`Skipping ${diagramType} block macro. ${e.message}`)
        attrs.role = role ? `${role} kroki-error` : 'kroki-error'
        return this.createBlock(parent, 'paragraph', `${e.message} - ${diagramType}::${target}[]`, attrs)
      }
    })
  }
}

module.exports.register = function register (registry, context = {}) {
  // patch context in case of Antora. Also register kref
  if (typeof context.contentCatalog !== 'undefined' && typeof context.contentCatalog.addFile === 'function' && typeof context.file !== 'undefined') {
    context.vfs = require('./antora-adapter.js')(context.file, context.contentCatalog, context.vfs)
    require('./kref/kref').register(registry, context)
  }
  const names = [
    'actdiag',
    'blockdiag',
    'bpmn',
    'bytefield',
    'c4plantuml',
    'ditaa',
    'erd',
    'excalidraw',
    'graphviz',
    'mermaid',
    'nomnoml',
    'nwdiag',
    'packetdiag',
    'pikchr',
    'plantuml',
    'rackdiag',
    'seqdiag',
    'svgbob',
    'umlet',
    'vega',
    'vegalite',
    'wavedrom'
  ]
  if (typeof registry.register === 'function') {
    registry.register(function () {
      for (const name of names) {
        this.block(name, diagramBlock(context))
        this.blockMacro(diagramBlockMacro(name, context))
      }
    })
  } else if (typeof registry.block === 'function') {
    for (const name of names) {
      registry.block(name, diagramBlock(context))
      registry.blockMacro(diagramBlockMacro(name, context))
    }
  }
  return registry
}
