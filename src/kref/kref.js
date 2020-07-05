'use strict'

const computeRelativeUrlPath = require('./compute-relative-url-path')

const FORMATS = {
  plantuml: (href, linkText) => `[[${href} ${linkText}]]`,
}

module.exports.register = function (registry, config_ = {}) {
  // For a per-page extension in Antora, config will have the structure:
  //{ file, // the vfs file being processed
  // contentCatalog, // the Antora content catalog
  // config // the asciidoc section of the playbook, enhanced with asciidoc attributes from the component descriptor.
  // }

  const { file, contentCatalog, config } = config_

  const defaultFormat = config.attributes['kref-default-format'] || 'plantuml'

  function antoraKrefInlineMacro () {
    const self = this
    self.named('kref')
    self.positionalAttributes(['linkText', 'format'])
    self.process(function (parent, target, attributes) {
      var refSpec = target
      var fragment
      if (target.includes('#')) {
        refSpec = target.slice(0, target.indexOf('#'))
        fragment = target.slice(target.indexOf('#') + 1)
      }
      const targetFile = !refSpec ? file : contentCatalog.resolveResource(refSpec, file.src)
      const href = computeRelativeUrlPath(file.pub.url, targetFile.pub.url, fragment ? '#' + fragment : '')
      const linkText = attributes.linkText || fragment ? fragment : targetFile.asciidoc.attributes.doctitle
      const format = FORMATS[config_.diagramType] || FORMATS[attributes.format] || FORMATS[defaultFormat]
      const text = format(href, linkText)
      // console.log('output text', text)
      const result = self.createInline(parent, 'quoted', text)
      result.setAttribute('subs', 'attributes')
      return result
    })
  }

  function doRegister (registry) {
    if (typeof registry.inlineMacro === 'function') {
      registry.inlineMacro(antoraKrefInlineMacro)
    } else {
      console.warn('no \'inlineMacro\' method on alleged registry')
    }
  }

  if (typeof registry.register === 'function') {
    registry.register(function () {
      //Capture the global registry so processors can register more extensions.
      registry = this
      doRegister(registry)
    })
  } else {
    doRegister(registry)
  }
  return registry
}
