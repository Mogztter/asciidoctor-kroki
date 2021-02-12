# frozen_string_literal: true

require 'rspec_helper'
require 'asciidoctor'
require_relative '../lib/asciidoctor/extensions/asciidoctor_kroki'

describe ::AsciidoctorExtensions::KrokiBlockProcessor do
  context 'convert to html5' do
    it 'should convert a PlantUML block to an image' do
      input = <<~'ADOC'
        [plantuml]
        ....
        alice -> bob: hello
        ....
      ADOC
      output = Asciidoctor.convert(input, standalone: false)
      (expect output).to eql %(<div class="imageblock kroki">
<div class="content">
<img src="https://kroki.io/plantuml/svg/eNpLzMlMTlXQtVNIyk-yUshIzcnJBwA9iwZL" alt="Diagram">
</div>
</div>)
    end
    it 'should use png if kroki-force-png is defined' do
      input = <<~'ADOC'
        [plantuml]
        ....
        alice -> bob: hello
        ....
      ADOC
      output = Asciidoctor.convert(input, attributes: { 'kroki-force-png' => '' }, standalone: false)
      (expect output).to eql %(<div class="imageblock kroki">
<div class="content">
<img src="https://kroki.io/plantuml/png/eNpLzMlMTlXQtVNIyk-yUshIzcnJBwA9iwZL" alt="Diagram">
</div>
</div>)
    end
    it 'should include the plantuml-include file' do
      input = <<~'ADOC'
        [plantuml]
        ....
        alice -> bob: hello
        ....
      ADOC
      output = Asciidoctor.convert(input, attributes: { 'kroki-force-png' => '', 'kroki-plantuml-include' => 'spec/fixtures/config.puml' }, standalone: false)
      (expect output).to eql %(<div class="imageblock kroki">
<div class="content">
<img src="https://kroki.io/plantuml/png/eNorzs7MK0gsSsxVyM3Py0_OKMrPTVUoKSpN5eJKzMlMTlXQtVNIyk-yUshIzcnJBwCT9xBc" alt="Diagram">
</div>
</div>)
    end
    it 'should create SVG diagram in imagesdir if kroki-fetch-diagram is set' do
      input = <<~'ADOC'
        :imagesdir: .asciidoctor/kroki

        plantuml::spec/fixtures/alice.puml[svg,role=sequence]
      ADOC
      output = Asciidoctor.convert(input, attributes: { 'kroki-fetch-diagram' => '' }, standalone: false)
      (expect output).to eql %(<div class="imageblock sequence kroki-format-svg kroki">
<div class="content">
<img src=".asciidoctor/kroki/diag-f6acdc206506b6ca7badd3fe722f252af992871426e580c8361ff4d47c2c7d9b.svg" alt="Diagram">
</div>
</div>)
    end
    it 'should create PNG diagram in imagesdir if kroki-fetch-diagram is set' do
      input = <<~'ADOC'
        :imagesdir: .asciidoctor/kroki

        plantuml::spec/fixtures/alice.puml[png,role=sequence]
      ADOC
      output = Asciidoctor.convert(input, attributes: { 'kroki-fetch-diagram' => '' }, standalone: false)
      (expect output).to eql %(<div class="imageblock sequence kroki-format-png kroki">
<div class="content">
<img src=".asciidoctor/kroki/diag-d4f314b2d4e75cc08aa4f8c2c944f7bf78321895d8ec5f665b42476d4e67e610.png" alt="Diagram">
</div>
</div>)
    end
  end
end

describe ::AsciidoctorExtensions::Kroki do
  it 'should return the list of supported diagrams' do
    diagram_names = ::AsciidoctorExtensions::Kroki::SUPPORTED_DIAGRAM_NAMES
    expect(diagram_names).to include('vegalite', 'plantuml', 'bytefield', 'bpmn', 'excalidraw', 'wavedrom')
  end
  it 'should register the extension for the list of supported diagrams' do
    doc = Asciidoctor::Document.new
    registry = Asciidoctor::Extensions::Registry.new
    registry.activate doc
    ::AsciidoctorExtensions::Kroki::SUPPORTED_DIAGRAM_NAMES.each do |name|
      expect(registry.find_block_extension(name)).to_not be_nil, "expected block extension named '#{name}' to be registered"
      expect(registry.find_block_macro_extension(name)).to_not be_nil, "expected block macro extension named '#{name}' to be registered "
    end
  end
end
