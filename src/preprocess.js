// @ts-check
// The previous line must be the first non-comment line in the file to enable TypeScript checks:
// https://www.typescriptlang.org/docs/handbook/intro-to-js-ts.html#ts-check
const path = require('path')

/**
 * @param {string} diagramText
 * @param {any} context
 * @param {string} diagramDir
 * @returns {string}
 */
module.exports.preprocessVegaLite = function (diagramText, context, diagramDir = '') {
  let diagramObject
  try {
    const JSON5 = require('json5')
    diagramObject = JSON5.parse(diagramText)
  } catch (e) {
    const message = `Preprocessing of Vega-Lite view specification failed, because of a parsing error:
${e}
The invalid view specification was:
${diagramText}
`
    throw addCauseToError(new Error(message), e)
  }

  if (!diagramObject || !diagramObject.data || !diagramObject.data.url) {
    return diagramText
  }
  const vfs = context.vfs
  const read = typeof vfs !== 'undefined' && typeof vfs.read === 'function' ? vfs.read : require('./node-fs.js').read
  const data = diagramObject.data
  const urlOrPath = data.url
  try {
    data.values = read(isLocalAndRelative(urlOrPath) ? path.join(diagramDir, urlOrPath) : urlOrPath)
  } catch (e) {
    if (isRemoteUrl(urlOrPath)) {
      // Only warn and do not throw an error, because the data file can perhaps be found by kroki server (https://github.com/yuzutech/kroki/issues/60)
      console.warn(`Skipping preprocessing of Vega-Lite view specification, because reading the remote data file '${urlOrPath}' referenced in the diagram caused an error:\n${e}`)
      return diagramText
    }
    const message = `Preprocessing of Vega-Lite view specification failed, because reading the local data file '${urlOrPath}' referenced in the diagram caused an error:\n${e}`
    throw addCauseToError(new Error(message), e)
  }

  if (!data.format) {
    // Extract extension from URL using snippet from
    // http://stackoverflow.com/questions/680929/how-to-extract-extension-from-filename-string-in-javascript
    // Same code as in Vega-Lite:
    // https://github.com/vega/vega-lite/blob/master/src/compile/data/source.ts
    let type = /(?:\.([^.]+))?$/.exec(data.url)[1]
    if (['json', 'csv', 'tsv', 'dsv', 'topojson'].indexOf(type) < 0) {
      type = 'json'
    }
    data.format = { type: type }
  }
  data.url = undefined
  // reconsider once #42 is fixed:
  // return JSON.stringify(diagramObject, undefined, 2)
  return JSON.stringify(diagramObject)
}

const plantUmlBlocksRx = /@startuml(?:\r?\n)([\s\S]*?)(?:\r?\n)@enduml/gm
const plantUmlFirstBlockRx = /@startuml(?:\r?\n)([\s\S]*?)(?:\r?\n)@enduml/m

/**
 * Removes all plantuml tags (@startuml/@enduml) from the diagram
 * It's possible to have more than one diagram in a single file in the cli version of plantuml
 * This does not work for the server, so recent plantuml versions remove the tags before processing the diagram
 * We don't want to rely on the server to handle this, so we remove the tags in here before sending the diagram to the server
 *
 * Some diagrams have special tags (ie. @startmindmap for mindmap) - these are mandatory, so we can't do much about them...
 *
 * @param diagramText
 * @returns {string} diagramText without any plantuml tags
 */
function removePlantUmlTags (diagramText) {
  if (diagramText) {
    diagramText = diagramText.replace(/^\s*@(startuml|enduml).*\n?/gm, '')
  }
  return diagramText
}

/**
 * @param {string} diagramText
 * @param {any} context
 * @param {string} diagramIncludePaths - predefined include paths (can be null)
 * @param {string} diagramDir - diagram base directory
 * @returns {string}
 */
module.exports.preprocessPlantUML = function (diagramText, context, diagramIncludePaths = '', diagramDir = '') {
  const includeOnce = []
  const includeStack = []
  const includePaths = diagramIncludePaths ? diagramIncludePaths.split(path.delimiter) : []
  diagramText = preprocessPlantUmlIncludes(diagramText, diagramDir, includeOnce, includeStack, includePaths, context.vfs)
  return removePlantUmlTags(diagramText)
}

/**
 * @param {string} diagramText
 * @param {string} dirPath
 * @param {string[]} includeOnce
 * @param {string[]} includeStack
 * @param {string[]} includePaths
 * @param {any} vfs
 * @returns {string}
 */
function preprocessPlantUmlIncludes (diagramText, dirPath, includeOnce, includeStack, includePaths, vfs) {
  // See: http://plantuml.com/en/preprocessing
  // Please note that we cannot use lookbehind for compatibility reasons with Safari: https://caniuse.com/mdn-javascript_builtins_regexp_lookbehind_assertion objects are stateful when they have the global flag set (e.g. /foo/g).
  // const regExInclude = /^\s*!(include(?:_many|_once|url|sub)?)\s+((?:(?<=\\)[ ]|[^ ])+)(.*)/
  const regExInclude = /^\s*!(include(?:_many|_once|url|sub)?)\s+([\s\S]*)/
  const diagramLines = diagramText.split('\n')
  let insideCommentBlock = false
  const diagramProcessed = diagramLines.map(line => {
    let result = line
    // replace the !include directive unless inside a comment block
    if (!insideCommentBlock) {
      result = line.replace(
        regExInclude,
        (match, ...args) => {
          const include = args[0].toLowerCase()
          const target = parseTarget(args[1])
          const urlSub = target.url.split('!')
          const trailingContent = target.comment
          const url = urlSub[0].replace(/\\ /g, ' ')
          const sub = urlSub[1]
          const result = readPlantUmlInclude(url, [dirPath, ...includePaths], includeStack, vfs)
          if (result.skip) {
            return line
          }
          if (include === 'include_once') {
            checkIncludeOnce(result.text, result.filePath, includeOnce)
          }
          let text = result.text
          if (sub !== undefined && sub !== null && sub !== '') {
            if (include === 'includesub') {
              text = getPlantUmlTextFromSub(text, sub)
            } else {
              const index = parseInt(sub, 10)
              if (isNaN(index)) {
                text = getPlantUmlTextFromId(text, sub)
              } else {
                text = getPlantUmlTextFromIndex(text, index)
              }
            }
          } else {
            text = getPlantUmlTextOrFirstBlock(text)
          }
          includeStack.push(result.filePath)
          text = preprocessPlantUmlIncludes(text, path.dirname(result.filePath), includeOnce, includeStack, includePaths, vfs)
          includeStack.pop()
          if (trailingContent !== '') {
            return text + ' ' + trailingContent
          }
          return text
        })
    }
    if (line.includes('/\'')) {
      insideCommentBlock = true
    }
    if (insideCommentBlock && line.includes('\'/')) {
      insideCommentBlock = false
    }
    return result
  })
  return diagramProcessed.join('\n')
}

/**
 * @param {string} includeFile - relative or absolute include file
 * @param {string[]} includePaths - array with include paths
 * @param {any} vfs
 * @returns {string} the found file or include file path
 */
function resolveIncludeFile (includeFile, includePaths, vfs) {
  const exists = typeof vfs !== 'undefined' && typeof vfs.exists === 'function' ? vfs.exists : require('./node-fs.js').exists
  let filePath = includeFile
  for (let i = 0; i < includePaths.length; i++) {
    const localFilePath = path.join(includePaths[i], includeFile)
    if (exists(localFilePath)) {
      filePath = localFilePath
      break
    }
  }
  return filePath
}

function parseTarget (value) {
  for (let i = 0; i < value.length; i++) {
    const char = value.charAt(i)
    if (i > 2) {
      // # inline comment
      if (char === '#' && value.charAt(i - 1) === ' ' && value.charAt(i - 2) !== '\\') {
        return { url: value.substr(0, i - 1).trim(), comment: value.substr(i) }
      }
      // /' multi-lines comment '/
      if (char === '\'' && value.charAt(i - 1) === '/' && value.charAt(i - 2) !== '\\') {
        return { url: value.substr(0, i - 1).trim(), comment: value.substr(i - 1) }
      }
    }
  }
  return { url: value, comment: '' }
}

/**
 * @param {string} url
 * @param {string[]} includePaths
 * @param {string[]} includeStack
 * @param {any} vfs
 * @returns {any}
 */
function readPlantUmlInclude (url, includePaths, includeStack, vfs) {
  const read = typeof vfs !== 'undefined' && typeof vfs.read === 'function' ? vfs.read : require('./node-fs.js').read
  let skip = false
  let text = ''
  let filePath = url
  if (url.startsWith('<')) {
    // Only warn and do not throw an error, because the std-lib includes can perhaps be found by Kroki server
    console.warn(`Skipping preprocessing of PlantUML standard library include file '${url}'`)
    skip = true
  } else if (includeStack.includes(url)) {
    const message = `Preprocessing of PlantUML include failed, because recursive reading already included referenced file '${url}'`
    throw new Error(message)
  } else {
    if (isRemoteUrl(url)) {
      try {
        text = read(url)
      } catch (e) {
        // Only warn and do not throw an error, because the data file can perhaps be found by Kroki server (https://github.com/yuzutech/kroki/issues/60)
        console.warn(`Skipping preprocessing of PlantUML include, because reading the referenced remote file '${url}' caused an error:\n${e}`)
        skip = true
      }
    } else {
      filePath = resolveIncludeFile(url, includePaths, vfs)
      if (includeStack.includes(filePath)) {
        const message = `Preprocessing of PlantUML include failed, because recursive reading already included referenced file '${filePath}'`
        throw new Error(message)
      } else {
        try {
          text = read(filePath)
        } catch (e) {
          // Only warn and do not throw an error, because the data file can perhaps be found by Kroki server
          console.warn(`Skipping preprocessing of PlantUML include, because reading the referenced local file '${filePath}' caused an error:\n${e}`)
          skip = true
        }
      }
    }
  }
  return { skip: skip, text: text, filePath: filePath }
}

/**
 * @param {string} text
 * @param {string} sub
 * @returns {string}
 */
function getPlantUmlTextFromSub (text, sub) {
  const regEx = new RegExp(`!startsub\\s+${sub}(?:\\r\\n|\\n)([\\s\\S]*?)(?:\\r\\n|\\n)!endsub`, 'gm')
  return getPlantUmlTextRegEx(text, regEx)
}

/**
 * @param {string} text
 * @param {string} id
 * @returns {string}
 */
function getPlantUmlTextFromId (text, id) {
  const regEx = new RegExp(`@startuml\\(id=${id}\\)(?:\\r\\n|\\n)([\\s\\S]*?)(?:\\r\\n|\\n)@enduml`, 'gm')
  return getPlantUmlTextRegEx(text, regEx)
}

/**
 * @param {string} text
 * @param {RegExp} regEx
 * @returns {string}
 */
function getPlantUmlTextRegEx (text, regEx) {
  let matchedStrings = ''
  let match = regEx.exec(text)
  if (match != null) {
    matchedStrings += match[1]
    match = regEx.exec(text)
    while (match != null) {
      matchedStrings += '\n' + match[1]
      match = regEx.exec(text)
    }
  }
  return matchedStrings
}

/**
 * @param {string} text
 * @param {number} index
 * @returns {string}
 */
function getPlantUmlTextFromIndex (text, index) {
  // Please note that RegExp objects are stateful when they have the global flag set (e.g. /foo/g).
  // They store a lastIndex from the previous match.
  // Using exec() multiple times will return the next occurrence.
  // Reset to find the first occurrence.
  let idx = 0
  plantUmlBlocksRx.lastIndex = 0
  let match = plantUmlBlocksRx.exec(text)
  while (match && idx < index) {
    // find the nth occurrence
    match = plantUmlBlocksRx.exec(text)
    idx++
  }
  if (match) {
    // [0] - result matching the complete regular expression
    // [1] - the first capturing group
    return match[1]
  }
  return ''
}

/**
 * @param {string} text
 * @returns {string}
 */
function getPlantUmlTextOrFirstBlock (text) {
  const match = text.match(plantUmlFirstBlockRx)
  if (match) {
    return match[1]
  }
  return text
}

/**
 * @param {string} text
 * @param {string} filePath
 * @param {string[]} includeOnce
 */
function checkIncludeOnce (text, filePath, includeOnce) {
  if (includeOnce.includes(filePath)) {
    const message = `Preprocessing of PlantUML include failed, because including multiple times referenced file '${filePath}' with '!include_once' guard`
    throw new Error(message)
  } else {
    includeOnce.push(filePath)
  }
}

/**
 * @param {Error} error
 * @param {any} causedBy
 * @returns {Error}
 */
function addCauseToError (error, causedBy) {
  if (causedBy.stack) {
    error.stack += '\nCaused by: ' + causedBy.stack
  }
  return error
}

/**
 * @param {string} string
 * @returns {boolean}
 */
function isRemoteUrl (string) {
  try {
    const url = new URL(string)
    return url.protocol !== 'file:'
  } catch (_) {
    return false
  }
}

/**
 * @param {string} string
 * @returns {boolean}
 */
function isLocalAndRelative (string) {
  if (string.startsWith('/')) {
    return false
  }

  try {
    // eslint-disable-next-line no-new
    new URL(string)
    // A URL can not be local AND relative: https://stackoverflow.com/questions/7857416/file-uri-scheme-and-relative-files
    return false
  } catch (_) {
    return true
  }
}
