require 'sinatra'
require 'json'
require 'net/http'
require 'uri'
require 'tempfile'
require 'fileutils'
require 'openssl'
require 'socket'
require 'timeout'
require 'resolv'

set :port, 4567
set :public_folder, '.'
set :server, 'webrick'
set :bind, '0.0.0.0'

SHERLOCK_BIN = `which sherlock`.strip
HOLEHE_BIN   = `which holehe`.strip
EXIFTOOL_BIN = `which exiftool`.strip
WHOIS_BIN    = '/usr/bin/whois'
DIG_BIN      = `which dig`.strip
REPORTS_DIR  = File.join(File.dirname(__FILE__), 'reports')

FileUtils.mkdir_p(REPORTS_DIR) unless Dir.exist?(REPORTS_DIR)

get '/' do
  send_file 'index.html'
end

# ── Dossiers ──────────────────────────────────────────────────────────────────
get '/dossiers' do
  content_type :json
  files = Dir.glob(File.join(REPORTS_DIR, '*.json')).sort_by { |f| File.mtime(f) }.reverse
  dossiers = files.map do |f|
    begin
      data = JSON.parse(File.read(f))
      {
        id:           File.basename(f, '.json'),
        name:         data['name'],
        created_at:   File.mtime(f),
        result_count: data['results'] ? data['results'].length : 0
      }
    rescue
      nil
    end
  end.compact
  dossiers.to_json
end

post '/dossiers' do
  content_type :json
  data = JSON.parse(request.body.read)
  name = data['name'].to_s.strip
  name = "Nouveau Dossier" if name.empty?

  id = "#{Time.now.to_i}_#{name.gsub(/[^a-zA-Z0-9]/, '_')}"
  file_path = File.join(REPORTS_DIR, "#{id}.json")

  dossier = { id: id, name: name, created_at: Time.now.to_s, results: [] }
  File.write(file_path, dossier.to_json)
  dossier.to_json
end

get '/dossiers/:id' do
  content_type :json
  file_path = File.join(REPORTS_DIR, "#{params[:id]}.json")
  if File.exist?(file_path)
    File.read(file_path)
  else
    status 404
    { status: 'error', message: 'Dossier introuvable.' }.to_json
  end
end

delete '/dossiers/:id' do
  content_type :json
  file_path = File.join(REPORTS_DIR, "#{params[:id]}.json")
  if File.exist?(file_path)
    File.delete(file_path)
    { status: 'success' }.to_json
  else
    status 404
    { status: 'error', message: 'Dossier introuvable.' }.to_json
  end
end

patch '/dossiers/:id' do
  content_type :json
  file_path = File.join(REPORTS_DIR, "#{params[:id]}.json")
  unless File.exist?(file_path)
    status 404
    return { status: 'error', message: 'Dossier introuvable.' }.to_json
  end

  data     = JSON.parse(request.body.read)
  new_name = data['name'].to_s.strip
  if new_name.empty?
    status 400
    return { status: 'error', message: 'Le nom ne peut pas être vide.' }.to_json
  end

  dossier         = JSON.parse(File.read(file_path))
  dossier['name'] = new_name
  File.write(file_path, dossier.to_json)
  { status: 'success', name: new_name }.to_json
end

post '/dossiers/:id/add' do
  content_type :json
  file_path = File.join(REPORTS_DIR, "#{params[:id]}.json")
  unless File.exist?(file_path)
    status 404
    return { status: 'error', message: 'Dossier introuvable.' }.to_json
  end

  dossier     = JSON.parse(File.read(file_path))
  result_data = JSON.parse(request.body.read)

  dossier['results'] << {
    tool:      result_data['tool'],
    query:     result_data['query'],
    timestamp: Time.now.to_s,
    data:      result_data['data']
  }

  File.write(file_path, dossier.to_json)
  { status: 'success' }.to_json
end

get '/dossiers/:id/export' do
  file_path = File.join(REPORTS_DIR, "#{params[:id]}.json")
  unless File.exist?(file_path)
    status 404
    return "Dossier introuvable"
  end

  dossier = JSON.parse(File.read(file_path))
  content = "RAPPORT OSINT MAX - #{dossier['name']}\n"
  content += "Généré le: #{Time.now.strftime('%d/%m/%Y %H:%M')}\n"
  content += "=" * 50 + "\n\n"

  dossier['results'].each do |res|
    content += "[#{res['tool'].upcase}] - Cible: #{res['query']}\n"
    content += "Date: #{res['timestamp']}\n"
    content += "-" * 30 + "\n"

    case res['tool']
    when 'sherlock', 'holehe'
      res['data']['links'].each { |l| content += "- #{l['platform']}: #{l['url']}\n" }
    when 'whois', 'iplookup', 'ssl'
      res['data']['fields'].each { |k, v| content += "#{k}: #{v}\n" }
    when 'dns'
      res['data']['results'].each { |type, records| records.each { |r| content += "#{type}: #{r}\n" } }
    when 'crtsh'
      res['data']['subdomains'].each { |s| content += "- #{s}\n" }
    when 'exiftool'
      res['data']['raw'].each { |k, v| content += "#{k}: #{v}\n" }
    end
    content += "\n"
  end

  content_type 'text/plain; charset=utf-8'
  attachment "#{dossier['name']}_export.txt"
  content
end

get '/dossiers/:id/export/json' do
  file_path = File.join(REPORTS_DIR, "#{params[:id]}.json")
  unless File.exist?(file_path)
    status 404
    return "Dossier introuvable"
  end

  dossier = JSON.parse(File.read(file_path))
  content_type :json
  attachment "#{dossier['name']}_export.json"
  File.read(file_path)
end

# ── Sherlock ──────────────────────────────────────────────────────────────────
post '/search/sherlock' do
  content_type :json
  data     = JSON.parse(request.body.read)
  username = data['username'].to_s.strip
  timeout  = [[data['timeout'].to_i, 1].max, 60].min
  site     = data['site'].to_s.strip.gsub(/[^a-zA-Z0-9\-\.]/, '')

  clean = username.gsub(/[^a-zA-Z0-9_\-]/, '')
  if clean.empty?
    return { status: 'error', message: "Nom d'utilisateur invalide.", links: [] }.to_json
  end
  if SHERLOCK_BIN.empty?
    return { status: 'error', message: "Sherlock n'est pas installé.", links: [] }.to_json
  end

  cmd  = "#{SHERLOCK_BIN} #{clean} --timeout #{timeout} --print-found"
  cmd += " --site #{site}" unless site.empty?
  cmd += " 2>&1"

  raw   = `#{cmd}`
  links = []
  raw.each_line do |line|
    if line.strip =~ /^\[\+\]\s+(.+?):\s+(https?:\/\/\S+)/
      links << { platform: $1.strip, url: $2.strip }
    end
  end

  { status: 'success', tool: 'sherlock', query: clean, links: links, count: links.length }.to_json
end

# ── Holehe ────────────────────────────────────────────────────────────────────
post '/search/holehe' do
  content_type :json
  data    = JSON.parse(request.body.read)
  email   = data['email'].to_s.strip
  timeout = [[data['timeout'].to_i, 1].max, 60].min
  no_pwdr = data['no_password_recovery'] == true

  unless email =~ /\A[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\z/
    return { status: 'error', message: "Adresse e-mail invalide.", links: [] }.to_json
  end

  wrapper    = File.join(File.dirname(__FILE__), 'holehe_wrapper.py')
  no_pwd_str = no_pwdr ? 'true' : 'false'
  raw        = `python3 #{wrapper} #{email} #{timeout} #{no_pwd_str} 2>/dev/null`

  begin
    result = JSON.parse(raw)
    if result['status'] == 'error'
      return { status: 'error', message: result['message'], links: [] }.to_json
    end
    links = (result['links'] || []).map { |l| { platform: l['platform'], url: l['url'] } }
  rescue JSON::ParserError
    return { status: 'error', message: "Erreur interne du wrapper holehe.", links: [] }.to_json
  end

  { status: 'success', tool: 'holehe', query: email, links: links, count: links.length }.to_json
end

# ── Whois ─────────────────────────────────────────────────────────────────────
post '/search/whois' do
  content_type :json
  data   = JSON.parse(request.body.read)
  domain = data['domain'].to_s.strip.downcase.gsub(/[^a-zA-Z0-9\-\.]/, '')

  if domain.empty? || domain !~ /\./
    return { status: 'error', message: "Domaine invalide (ex: google.com).", text: '' }.to_json
  end

  raw = `#{WHOIS_BIN} #{domain} 2>&1`

  fields   = {}
  patterns = {
    'Registrar'      => /Registrar:\s*(.+)/i,
    'Registrant Org' => /Registrant Organization:\s*(.+)/i,
    'Created'        => /Creation Date:\s*(.+)/i,
    'Updated'        => /Updated Date:\s*(.+)/i,
    'Expires'        => /Registry Expiry Date:\s*(.+)/i,
    'Name Servers'   => /Name Server:\s*(.+)/i,
    'Status'         => /Domain Status:\s*(.+)/i,
    'Country'        => /Registrant Country:\s*(.+)/i,
    'DNSSEC'         => /DNSSEC:\s*(.+)/i,
  }

  patterns.each do |key, rx|
    matches = raw.scan(rx).flatten.map(&:strip).uniq
    fields[key] = matches.join(', ') unless matches.empty?
  end

  { status: 'success', tool: 'whois', query: domain, fields: fields, raw: raw }.to_json
end

# ── IP Lookup ─────────────────────────────────────────────────────────────────
post '/search/iplookup' do
  content_type :json
  data  = JSON.parse(request.body.read)
  query = data['ip'].to_s.strip.gsub(/[^a-zA-Z0-9\.\-\_]/, '')

  if query.empty?
    return { status: 'error', message: "IP ou hostname invalide.", fields: {} }.to_json
  end

  begin
    uri  = URI("http://ip-api.com/json/#{URI.encode_uri_component(query)}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query,mobile,proxy,hosting")
    resp = Net::HTTP.get(uri)
    api  = JSON.parse(resp)

    if api['status'] == 'fail'
      return { status: 'error', message: "IP introuvable : #{api['message']}", fields: {} }.to_json
    end

    fields = {
      'IP'           => api['query'],
      'Pays'         => "#{api['country']} (#{api['countryCode']})",
      'Région'       => api['regionName'],
      'Ville'        => api['city'],
      'Code Postal'  => api['zip'],
      'Coordonnées'  => "#{api['lat']}, #{api['lon']}",
      'Timezone'     => api['timezone'],
      'ISP'          => api['isp'],
      'Organisation' => api['org'],
      'AS'           => api['as'],
      'Mobile'       => api['mobile'] ? '📱 Oui' : '💻 Non',
      'Proxy/VPN'    => api['proxy'] ? '⚠️ Oui' : '✅ Non',
      'Hébergeur'    => api['hosting'] ? '🖥️ Oui' : '🏠 Non',
    }.reject { |_, v| v.nil? || v.to_s.strip.empty? }

    { status: 'success', tool: 'iplookup', query: query, fields: fields,
      lat: api['lat'], lon: api['lon'],
      city: api['city'], country: api['country'] }.to_json
  rescue => e
    { status: 'error', message: "Erreur réseau : #{e.message}", fields: {} }.to_json
  end
end

# ── ExifTool ──────────────────────────────────────────────────────────────────
GPS_KEYS      = %w[GPSLatitude GPSLongitude GPSAltitude GPSLatitudeRef GPSLongitudeRef GPSPosition GPSImgDirection GPSSpeed]
CAMERA_KEYS   = %w[Make Model LensModel LensInfo FocalLength FocalLengthIn35mmFormat MaxApertureValue]
CAPTURE_KEYS  = %w[DateTimeOriginal CreateDate ModifyDate ExposureTime FNumber ISO ExposureMode WhiteBalance Flash MeteringMode]
IMAGE_KEYS    = %w[ImageWidth ImageHeight XResolution YResolution ColorSpace BitDepth Compression FileType MIMEType]
SOFTWARE_KEYS = %w[Software CreatorTool ProcessingSoftware]

post '/search/exiftool' do
  content_type :json

  unless params[:file] && params[:file][:tempfile]
    return { status: 'error', message: 'Aucun fichier reçu.' }.to_json
  end

  upload   = params[:file]
  filename = upload[:filename].to_s
  ext      = File.extname(filename).downcase

  unless ['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.webp', '.heic', '.gif'].include?(ext)
    return { status: 'error', message: 'Format non supporté. Utilisez JPG, PNG, TIFF, WEBP ou HEIC.' }.to_json
  end

  if EXIFTOOL_BIN.empty?
    return { status: 'error', message: "ExifTool n'est pas installé." }.to_json
  end

  tmp = Tempfile.new(['osint_max_', ext])
  tmp.binmode
  tmp.write(upload[:tempfile].read)
  tmp.flush

  begin
    raw_json = `#{EXIFTOOL_BIN} -json -n "#{tmp.path}" 2>&1`
    all_meta = JSON.parse(raw_json)&.first || {}
  rescue JSON::ParserError
    return { status: 'error', message: 'Erreur de lecture des métadonnées.' }.to_json
  ensure
    tmp.close
    tmp.unlink
  end

  meta = all_meta.reject { |k, _| k == 'SourceFile' }

  def pick(meta, keys) = meta.select { |k, _| keys.include?(k) }

  grouped = {
    'GPS & Localisation' => pick(meta, GPS_KEYS),
    'Appareil photo'     => pick(meta, CAMERA_KEYS),
    'Prise de vue'       => pick(meta, CAPTURE_KEYS),
    'Image'              => pick(meta, IMAGE_KEYS),
    'Logiciel'           => pick(meta, SOFTWARE_KEYS),
    'Autres'             => meta.reject { |k, _| (GPS_KEYS + CAMERA_KEYS + CAPTURE_KEYS + IMAGE_KEYS + SOFTWARE_KEYS).include?(k) }
  }.reject { |_, v| v.empty? }

  labels = {
    'GPSLatitude' => 'Latitude', 'GPSLongitude' => 'Longitude', 'GPSAltitude' => 'Altitude',
    'GPSPosition' => 'Position GPS', 'GPSImgDirection' => 'Direction',
    'Make' => 'Marque', 'Model' => 'Modèle', 'LensModel' => 'Objectif',
    'FocalLength' => 'Focale', 'FNumber' => 'Ouverture', 'ISO' => 'ISO',
    'ExposureTime' => 'Temps expo.', 'ExposureMode' => 'Mode expo.',
    'WhiteBalance' => 'Balance blancs', 'Flash' => 'Flash',
    'DateTimeOriginal' => 'Date de prise', 'CreateDate' => 'Date création',
    'ModifyDate' => 'Date modif.', 'ImageWidth' => 'Largeur', 'ImageHeight' => 'Hauteur',
    'XResolution' => 'Résolution X', 'YResolution' => 'Résolution Y',
    'ColorSpace' => 'Espace couleur', 'BitDepth' => 'Profondeur bits',
    'FileType' => 'Type fichier', 'MIMEType' => 'MIME',
    'Software' => 'Logiciel', 'CreatorTool' => 'Outil créateur',
  }

  { status: 'success', tool: 'exiftool', filename: filename, grouped: grouped, labels: labels, raw: meta }.to_json
end

# ── DNS Lookup ────────────────────────────────────────────────────────────────
post '/search/dns' do
  content_type :json
  data   = JSON.parse(request.body.read)
  domain = data['domain'].to_s.strip.downcase.gsub(/[^a-zA-Z0-9\-\.]/, '')

  if domain.empty? || domain !~ /\./
    return { status: 'error', message: "Domaine invalide (ex: google.com).", results: {} }.to_json
  end

  results = {}

  if DIG_BIN.empty?
    # Fallback: use Ruby's Resolv
    begin
      a_records = Resolv::DNS.open { |d| d.getaddresses(domain).map(&:to_s) }
      results['A'] = a_records unless a_records.empty?

      mx_records = Resolv::DNS.open { |d|
        d.getresources(domain, Resolv::DNS::Resource::IN::MX).map { |r| "#{r.preference} #{r.exchange}" }
      }
      results['MX'] = mx_records unless mx_records.empty?

      ns_records = Resolv::DNS.open { |d|
        d.getresources(domain, Resolv::DNS::Resource::IN::NS).map { |r| r.name.to_s }
      }
      results['NS'] = ns_records unless ns_records.empty?

      txt_records = Resolv::DNS.open { |d|
        d.getresources(domain, Resolv::DNS::Resource::IN::TXT).map { |r| r.strings.join(' ') }
      }
      results['TXT'] = txt_records unless txt_records.empty?
    rescue => e
      return { status: 'error', message: "Erreur DNS : #{e.message}", results: {} }.to_json
    end
  else
    %w[A AAAA MX NS TXT CNAME SOA].each do |type|
      out     = `#{DIG_BIN} +short +time=5 +tries=1 #{domain} #{type} 2>/dev/null`.strip
      records = out.lines.map(&:strip).reject(&:empty?)
      results[type] = records unless records.empty?
    end
  end

  if results.empty?
    return { status: 'error', message: "Aucun enregistrement DNS trouvé pour #{domain}.", results: {} }.to_json
  end

  { status: 'success', tool: 'dns', query: domain, results: results }.to_json
rescue => e
  { status: 'error', message: e.message, results: {} }.to_json
end

# ── SSL / TLS Certificate ─────────────────────────────────────────────────────
post '/search/ssl' do
  content_type :json
  data = JSON.parse(request.body.read)
  host = data['host'].to_s.strip.downcase
                     .gsub(/^https?:\/\//, '')
                     .split('/').first
                     .gsub(/[^a-zA-Z0-9\-\.\:]/, '')

  if host.empty?
    return { status: 'error', message: "Domaine invalide.", fields: {} }.to_json
  end

  begin
    tcp = nil
    ssl = nil

    Timeout.timeout(12) do
      tcp = TCPSocket.new(host, 443)
      ctx = OpenSSL::SSL::SSLContext.new
      ctx.verify_mode = OpenSSL::SSL::VERIFY_NONE
      ssl = OpenSSL::SSL::SSLSocket.new(tcp, ctx)
      ssl.hostname = host
      ssl.connect
    end

    cert      = ssl.peer_cert
    chain_len = ssl.peer_cert_chain&.length || 1
    san_ext   = cert.extensions.find { |e| e.oid == 'subjectAltName' }
    san       = san_ext ? san_ext.value.gsub('DNS:', '').gsub(', ', ', ') : ''
    days_left = ((cert.not_after - Time.now) / 86400).to_i

    expiry_status = if days_left < 0
                      "❌ Expiré il y a #{-days_left}j"
                    elsif days_left < 30
                      "⚠️ #{days_left}j restants"
                    else
                      "✅ #{days_left}j restants"
                    end

    fields = {
      'Domaine'        => host,
      'Sujet'          => cert.subject.to_a.map { |name, val, _| "#{name}=#{val}" }.join(', '),
      'Émetteur'       => cert.issuer.to_a.map  { |name, val, _| "#{name}=#{val}" }.join(', '),
      'SAN'            => san,
      'Valide depuis'  => cert.not_before.strftime('%d/%m/%Y %H:%M UTC'),
      'Expire le'      => cert.not_after.strftime('%d/%m/%Y %H:%M UTC'),
      'Statut'         => expiry_status,
      'Numéro série'   => cert.serial.to_s(16).upcase,
      'Algorithme sig' => cert.signature_algorithm,
      'Version TLS'    => ssl.ssl_version,
      'Taille chaîne'  => "#{chain_len} certificat#{chain_len > 1 ? 's' : ''}",
    }.reject { |_, v| v.nil? || v.to_s.strip.empty? }

    ssl.close rescue nil
    tcp.close rescue nil

    { status: 'success', tool: 'ssl', query: host, fields: fields,
      days_left: days_left }.to_json

  rescue Errno::ECONNREFUSED
    { status: 'error', message: "Connexion refusée sur le port 443.", fields: {} }.to_json
  rescue Errno::EHOSTUNREACH, SocketError => e
    { status: 'error', message: "Hôte introuvable : #{e.message}", fields: {} }.to_json
  rescue Timeout::Error
    { status: 'error', message: "Timeout : le serveur ne répond pas.", fields: {} }.to_json
  rescue => e
    { status: 'error', message: "Erreur SSL : #{e.message}", fields: {} }.to_json
  ensure
    ssl.close rescue nil
    tcp.close rescue nil
  end
end

# ── crt.sh – Certificate Transparency / Subdomains ────────────────────────────
post '/search/crtsh' do
  content_type :json
  data   = JSON.parse(request.body.read)
  domain = data['domain'].to_s.strip.downcase.gsub(/[^a-zA-Z0-9\-\.]/, '')

  if domain.empty? || domain !~ /\./
    return { status: 'error', message: "Domaine invalide (ex: google.com).", subdomains: [] }.to_json
  end

  begin
    uri  = URI("https://crt.sh/?q=%.#{domain}&output=json")
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl      = true
    http.open_timeout = 15
    http.read_timeout = 30

    req = Net::HTTP::Get.new(uri)
    req['User-Agent'] = 'OSINT-MAX/3.0'

    response = http.request(req)
    unless response.is_a?(Net::HTTPSuccess)
      return { status: 'error', message: "crt.sh a répondu avec le code #{response.code}.", subdomains: [] }.to_json
    end

    certs = JSON.parse(response.body)

    subdomains = certs.flat_map { |c|
      c['name_value'].to_s.split("\n").map { |n|
        n.strip.downcase.sub(/^\*\./, '')
      }
    }.uniq.sort.reject { |s| s.empty? || s.include?(' ') }

    # Also collect issuer info for stats
    issuers = certs.map { |c| c['issuer_ca_id'] }.compact.uniq.length

    { status: 'success', tool: 'crtsh', query: domain,
      subdomains: subdomains, count: subdomains.length,
      cert_count: certs.length, issuer_count: issuers }.to_json

  rescue JSON::ParserError
    { status: 'error', message: "Réponse invalide de crt.sh (domaine peut-être inconnu).", subdomains: [] }.to_json
  rescue => e
    { status: 'error', message: "Erreur : #{e.message}", subdomains: [] }.to_json
  end
end
