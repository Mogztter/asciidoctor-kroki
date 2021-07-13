# frozen_string_literal: true

require 'rspec_helper'
require 'asciidoctor'
require_relative '../lib/asciidoctor/extensions/asciidoctor_kroki'

describe ::AsciidoctorExtensions::KrokiDiagram do
  it 'should compute a diagram URI' do
    kroki_diagram = ::AsciidoctorExtensions::KrokiDiagram.new('vegalite', 'png', '{}')
    diagram_uri = kroki_diagram.get_diagram_uri('http://localhost:8000')
    expect(diagram_uri).to eq('http://localhost:8000/vegalite/png/eNqrrgUAAXUA-Q==')
  end
  it 'should compute a diagram URI with a trailing slashes' do
    kroki_diagram = ::AsciidoctorExtensions::KrokiDiagram.new('vegalite', 'png', '{}')
    diagram_uri = kroki_diagram.get_diagram_uri('https://my.domain.org/kroki/')
    expect(diagram_uri).to eq('https://my.domain.org/kroki/vegalite/png/eNqrrgUAAXUA-Q==')
  end
  it 'should compute a diagram URI with trailing slashes' do
    kroki_diagram = ::AsciidoctorExtensions::KrokiDiagram.new('vegalite', 'png', '{}')
    diagram_uri = kroki_diagram.get_diagram_uri('https://my-server/kroki//')
    expect(diagram_uri).to eq('https://my-server/kroki/vegalite/png/eNqrrgUAAXUA-Q==')
  end
  it 'should encode a diagram text definition' do
    kroki_diagram = ::AsciidoctorExtensions::KrokiDiagram.new('plantuml', 'txt', ' alice -> bob: hello')
    diagram_definition_encoded = kroki_diagram.encode
    expect(diagram_definition_encoded).to eq('eNpTSMzJTE5V0LVTSMpPslLISM3JyQcAQAwGaw==')
  end
  it 'should fetch a diagram from Kroki and save it to disk' do
    kroki_diagram = ::AsciidoctorExtensions::KrokiDiagram.new('plantuml', 'txt', ' alice -> bob: hello')
    kroki_http_client = ::AsciidoctorExtensions::KrokiHttpClient
    kroki_client = ::AsciidoctorExtensions::KrokiClient.new(server_url: 'https://kroki.io', http_method: 'get', http_client: kroki_http_client)
    output_dir_path = "#{__dir__}/../.asciidoctor/kroki"
    diagram_name = kroki_diagram.save(output_dir_path, kroki_client)
    diagram_path = File.join(output_dir_path, diagram_name)
    expect(File.exist?(diagram_path)).to be_truthy, "expected diagram to be saved at #{diagram_path}"
    content = <<-TXT.chomp
     ,-----.          ,---.
     |alice|          |bob|
     `--+--'          `-+-'
        |    hello      |
        |-------------->|
     ,--+--.          ,-+-.
     |alice|          |bob|
     `-----'          `---'
    TXT
    expect(File.read(diagram_path).split("\n").map(&:rstrip).join("\n")).to eq(content)
  end
  it 'should fetch a diagram from Kroki with the same definition only once' do
    kroki_diagram = ::AsciidoctorExtensions::KrokiDiagram.new('plantuml', 'png', ' guillaume -> dan: hello')
    kroki_http_client = ::AsciidoctorExtensions::KrokiHttpClient
    kroki_client = ::AsciidoctorExtensions::KrokiClient.new(server_url: 'https://kroki.io', http_method: 'get', http_client: kroki_http_client)
    output_dir_path = "#{__dir__}/../.asciidoctor/kroki"
    # make sure that we are doing only one GET request
    expect(kroki_http_client).to receive(:get).once
    diagram_name = kroki_diagram.save(output_dir_path, kroki_client)
    diagram_path = File.join(output_dir_path, diagram_name)
    expect(File.exist?(diagram_path)).to be_truthy, "expected diagram to be saved at #{diagram_path}"
    # calling again... should read the file from disk (and not do a GET request)
    kroki_diagram.save(output_dir_path, kroki_client)
  end
end
