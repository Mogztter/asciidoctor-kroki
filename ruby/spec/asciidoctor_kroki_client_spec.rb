# frozen_string_literal: true

require 'rspec_helper'
require 'asciidoctor'
require_relative '../lib/asciidoctor/extensions/asciidoctor_kroki'

describe ::AsciidoctorExtensions::KrokiClient do
  it 'should use adaptive method when http method is invalid' do
    kroki_http_client = ::AsciidoctorExtensions::KrokiHttpClient
    kroki_client = ::AsciidoctorExtensions::KrokiClient.new(server_url: 'http://localhost:8000', http_method: 'patch', http_client: kroki_http_client)
    expect(kroki_client.method).to eq('adaptive')
  end
  it 'should use post method when http method is post' do
    kroki_http_client = ::AsciidoctorExtensions::KrokiHttpClient
    kroki_client = ::AsciidoctorExtensions::KrokiClient.new(server_url: 'http://localhost:8000', http_method: 'POST', http_client: kroki_http_client)
    expect(kroki_client.method).to eq('post')
  end
  it 'should use get method when http method is get' do
    kroki_http_client = ::AsciidoctorExtensions::KrokiHttpClient
    kroki_client = ::AsciidoctorExtensions::KrokiClient.new(server_url: 'http://localhost:8000', http_method: 'get', http_client: kroki_http_client)
    expect(kroki_client.method).to eq('get')
  end
  it 'should use 4000 as the default max URI length' do
    kroki_http_client = ::AsciidoctorExtensions::KrokiHttpClient
    kroki_client = ::AsciidoctorExtensions::KrokiClient.new(server_url: 'http://localhost:8000', http_method: 'get', http_client: kroki_http_client)
    expect(kroki_client.max_uri_length).to eq(4000)
  end
  it 'should use a custom value as max URI length' do
    kroki_http_client = ::AsciidoctorExtensions::KrokiHttpClient
    kroki_client = ::AsciidoctorExtensions::KrokiClient.new(server_url: 'http://localhost:8000', http_method: 'get', http_client: kroki_http_client, max_uri_length: 8000)
    expect(kroki_client.max_uri_length).to eq(8000)
  end
  it 'should get an image with POST request if the URI length is greater than the value configured' do
    kroki_http_client = Class.new do
      class << self
        def get(uri, _)
          "GET #{uri}"
        end

        def post(uri, data, _)
          "POST #{uri} - #{data}"
        end
      end
    end
    kroki_diagram = Class.new do
      attr_reader :type, :text, :format

      def initialize(type, format, text)
        @text = text
        @type = type
        @format = format
      end

      def get_diagram_uri(_)
        'diagram-uri'
      end
    end.new('type', 'format', 'text')
    kroki_client = ::AsciidoctorExtensions::KrokiClient.new(server_url: 'http://localhost:8000', http_method: 'adaptive', http_client: kroki_http_client, max_uri_length: 10)
    result = kroki_client.get_image(kroki_diagram, 'utf8')
    expect(result).to eq('POST http://localhost:8000/type/format - text')
  end
  it 'should get an image with GET request if the URI length is lower or equals than the value configured' do
    kroki_http_client = Class.new do
      class << self
        def get(uri, _)
          "GET #{uri}"
        end

        def post(uri, data, _)
          "POST #{uri} - #{data}"
        end
      end
    end
    kroki_diagram = Class.new do
      attr_reader :type, :text, :format

      def initialize(type, format, text)
        @text = text
        @type = type
        @format = format
      end

      def get_diagram_uri(_)
        'diagram-uri'
      end
    end.new('type', 'format', 'text')
    kroki_client = ::AsciidoctorExtensions::KrokiClient.new(server_url: 'http://localhost:8000', http_method: 'adaptive', http_client: kroki_http_client, max_uri_length: 11)
    result = kroki_client.get_image(kroki_diagram, 'utf8')
    expect(result).to eq('GET diagram-uri')
  end
end
