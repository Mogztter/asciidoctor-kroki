'use strict'

const computeRelativeUrlPath = require('./compute-relative-url-path')

const FORMATS = {
  //https://bytefield-svg.deepsymmetry.org/bytefield-svg/1.5.0/funcs.html#wrap-link
  // You need to construct part of this yourself, (wrap-link kref:index.adoc[]
  //   (draw-box (text "length" [:math] [:sub 1]) {:span 4}))
  bytefield: (href, linkText) => `"${href}"`,
  //https://stackoverflow.com/questions/14155773/label-hyperlink-graphviz
  // graphviz: (href, linkText) => `[href="${href}"] [label="${linkText}"]`, // This seems to replace node names.
  graphviz: (href, linkText) => `[href="${href}"]`,
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
      let linkText = attributes.linkText
      if (!linkText) {
        if (refSpec) {
          if (fragment) {
            linkText = fragment
          } else {
            linkText = targetFile.asciidoc.attributes.doctitle
          }
        } else {
          // Catalog only contains ids in the page preceding this kroki usage!
          if (parent.document.catalog.$$smap.refs.$$smap[fragment]) {
            linkText = parent.document.catalog.$$smap.refs.$$smap[fragment].converted_title
          } else {
            linkText = fragment
          }
        }
      }

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
