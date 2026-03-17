require 'sinatra'
require 'json'
require 'net/http'
require 'uri'
require 'tempfile'

set :port, 4567
set :public_folder, '.'
set :bind, '0.0.0.0'

SHERLOCK_BIN = `which sherlock`.strip
HOLEHE_BIN   = `which holehe`.strip
WHOIS_BIN    = '/usr/bin/whois'

get '/' do
  send_file 'index.html'
end

# ── Sherlock : recherche par pseudonyme ───────────────────────────────────────
post '/search/sherlock' do
  content_type :json
  data = JSON.parse(request.body.read)
  username = data['username'].to_s.strip
  timeout  = [[data['timeout'].to_i, 1].max, 60].min
  site     = data['site'].to_s.strip.gsub(/[^a-zA-Z0-9\-\.]/, '')

  clean = username.gsub(/[^a-zA-Z0-9_\-]/, '')
  if clean.empty?
    return { status: 'error', message: "Nom d'utilisateur invalide.", links: [] }.to_json
  end
  if SHERLOCK_BIN.empty?
    return { status: 'error', message: "Sherlock n'est pas installé. Lancez : pip install sherlock-project", links: [] }.to_json
  end

  cmd = "#{SHERLOCK_BIN} #{clean} --timeout #{timeout} --print-found"
  cmd += " --site #{site}" unless site.empty?
  cmd += " 2>&1"

  raw = `#{cmd}`
  links = []
  raw.each_line do |line|
    line = line.strip
    if line =~ /^\[\+\]\s+(.+?):\s+(https?:\/\/\S+)/
      links << { platform: $1.strip, url: $2.strip }
    end
  end

  { status: 'success', tool: 'sherlock', query: clean, links: links, count: links.length }.to_json
end

# ── Holehe : recherche par e-mail ────────────────────────────────────────────
post '/search/holehe' do
  content_type :json
  data = JSON.parse(request.body.read)
  email   = data['email'].to_s.strip
  timeout = [[data['timeout'].to_i, 1].max, 60].min
  no_pwdr = data['no_password_recovery'] == true

  unless email =~ /\A[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\z/
    return { status: 'error', message: "Adresse e-mail invalide.", links: [] }.to_json
  end
  # Utilise le wrapper Python qui appelle l'API holehe directement (sans TTY)
  wrapper = File.join(File.dirname(__FILE__), 'holehe_wrapper.py')
  no_pwd_str = no_pwdr ? 'true' : 'false'
  raw = `python3 #{wrapper} #{email} #{timeout} #{no_pwd_str} 2>/dev/null`

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

# ── Whois : info sur un domaine ───────────────────────────────────────────────
post '/search/whois' do
  content_type :json
  data   = JSON.parse(request.body.read)
  domain = data['domain'].to_s.strip.downcase.gsub(/[^a-zA-Z0-9\-\.]/, '')

  if domain.empty? || domain !~ /\./
    return { status: 'error', message: "Domaine invalide (ex: google.com).", text: '' }.to_json
  end

  raw = `#{WHOIS_BIN} #{domain} 2>&1`

  # Extraire les champs importants
  fields = {}
  patterns = {
    'Registrar'         => /Registrar:\s*(.+)/i,
    'Registrant Org'    => /Registrant Organization:\s*(.+)/i,
    'Created'           => /Creation Date:\s*(.+)/i,
    'Updated'           => /Updated Date:\s*(.+)/i,
    'Expires'           => /Registry Expiry Date:\s*(.+)/i,
    'Name Servers'      => /Name Server:\s*(.+)/i,
    'Status'            => /Domain Status:\s*(.+)/i,
    'Country'           => /Registrant Country:\s*(.+)/i,
    'DNSSEC'            => /DNSSEC:\s*(.+)/i,
  }

  patterns.each do |key, rx|
    matches = raw.scan(rx).flatten.map(&:strip).uniq
    fields[key] = matches.join(', ') unless matches.empty?
  end

  { status: 'success', tool: 'whois', query: domain, fields: fields, raw: raw }.to_json
end

# ── IP Lookup : géolocalisation d'une IP / hostname ───────────────────────────
post '/search/iplookup' do
  content_type :json
  data  = JSON.parse(request.body.read)
  query = data['ip'].to_s.strip.gsub(/[^a-zA-Z0-9\.\-\_]/, '')

  if query.empty?
    return { status: 'error', message: "IP ou hostname invalide.", fields: {} }.to_json
  end

  begin
    uri  = URI("http://ip-api.com/json/#{URI.encode_uri_component(query)}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query")
    resp = Net::HTTP.get(uri)
    api  = JSON.parse(resp)

    if api['status'] == 'fail'
      return { status: 'error', message: "IP introuvable : #{api['message']}", fields: {} }.to_json
    end

    fields = {
      'IP'         => api['query'],
      'Pays'       => "#{api['country']} (#{api['countryCode']})",
      'Région'     => api['regionName'],
      'Ville'      => api['city'],
      'Code Postal'=> api['zip'],
      'Coordonnées'=> "#{api['lat']}, #{api['lon']}",
      'Timezone'   => api['timezone'],
      'ISP'        => api['isp'],
      'Organisation' => api['org'],
      'AS'         => api['as'],
    }.reject { |_, v| v.nil? || v.to_s.strip.empty? }

    { status: 'success', tool: 'iplookup', query: query, fields: fields }.to_json
  rescue => e
    { status: 'error', message: "Erreur réseau : #{e.message}", fields: {} }.to_json
  end
end

# ── ExifTool : extraction de métadonnées d'image ─────────────────────────────
EXIFTOOL_BIN = `which exiftool`.strip

post '/search/exiftool' do
  content_type :json

  unless params[:file] && params[:file][:tempfile]
    return { status: 'error', message: 'Aucun fichier reçu.', meta: {} }.to_json
  end

  upload   = params[:file]
  filename = upload[:filename].to_s
  ext      = File.extname(filename).downcase

  unless ['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.webp', '.heic', '.gif'].include?(ext)
    return { status: 'error', message: 'Format non supporté. Utilisez JPG, PNG, TIFF, WEBP ou HEIC.', meta: {} }.to_json
  end

  if EXIFTOOL_BIN.empty?
    return { status: 'error', message: "ExifTool n'est pas installé. Lancez : brew install exiftool", meta: {} }.to_json
  end

  # Sauvegarder le fichier dans un tempfile sécurisé
  tmp = Tempfile.new(['osint_max_', ext])
  tmp.binmode
  tmp.write(upload[:tempfile].read)
  tmp.flush

  begin
    raw_json = `#{EXIFTOOL_BIN} -json -n "#{tmp.path}" 2>&1`
    all_meta = JSON.parse(raw_json)&.first || {}
  rescue JSON::ParserError
    tmp.close; tmp.unlink
    return { status: 'error', message: 'Erreur de lecture des métadonnées.', meta: {} }.to_json
  ensure
    tmp.close
    tmp.unlink
  end

  # Supprimer les clés techniques internes
  meta = all_meta.reject { |k, _| k == 'SourceFile' }

  # Catégoriser les métadonnées pour la vue lisible
  GPS_KEYS      = %w[GPSLatitude GPSLongitude GPSAltitude GPSLatitudeRef GPSLongitudeRef GPSPosition GPSImgDirection GPSSpeed]
  CAMERA_KEYS   = %w[Make Model LensModel LensInfo FocalLength FocalLengthIn35mmFormat MaxApertureValue]
  CAPTURE_KEYS  = %w[DateTimeOriginal CreateDate ModifyDate ExposureTime FNumber ISO ExposureMode WhiteBalance Flash MeteringMode]
  IMAGE_KEYS    = %w[ImageWidth ImageHeight XResolution YResolution ColorSpace BitDepth Compression FileType MIMEType]
  SOFTWARE_KEYS = %w[Software CreatorTool ProcessingSoftware]

  def pick(meta, keys)
    meta.select { |k, _| keys.include?(k) }
  end

  grouped = {
    'GPS & Localisation' => pick(meta, GPS_KEYS),
    'Appareil photo'     => pick(meta, CAMERA_KEYS),
    'Prise de vue'       => pick(meta, CAPTURE_KEYS),
    'Image'              => pick(meta, IMAGE_KEYS),
    'Logiciel'           => pick(meta, SOFTWARE_KEYS),
    'Autres'             => meta.reject { |k, _| (GPS_KEYS + CAMERA_KEYS + CAPTURE_KEYS + IMAGE_KEYS + SOFTWARE_KEYS).include?(k) }
  }.reject { |_, v| v.empty? }

  # Formater les valeurs en mode lisible
  labels = {
    'GPSLatitude'           => 'Latitude',
    'GPSLongitude'          => 'Longitude',
    'GPSAltitude'           => 'Altitude',
    'GPSPosition'           => 'Position GPS',
    'GPSImgDirection'       => 'Direction',
    'Make'                  => 'Marque',
    'Model'                 => 'Modèle',
    'LensModel'             => 'Objectif',
    'FocalLength'           => 'Focale',
    'FNumber'               => 'Ouverture',
    'ISO'                   => 'ISO',
    'ExposureTime'          => 'Temps expo.',
    'ExposureMode'          => 'Mode expo.',
    'WhiteBalance'          => 'Balance blancs',
    'Flash'                 => 'Flash',
    'DateTimeOriginal'      => 'Date de prise',
    'CreateDate'            => 'Date création',
    'ModifyDate'            => 'Date modif.',
    'ImageWidth'            => 'Largeur',
    'ImageHeight'           => 'Hauteur',
    'XResolution'           => 'Résolution X',
    'YResolution'           => 'Résolution Y',
    'ColorSpace'            => 'Espace couleur',
    'BitDepth'              => 'Profondeur bits',
    'FileType'              => 'Type fichier',
    'MIMEType'              => 'MIME',
    'Software'              => 'Logiciel',
    'CreatorTool'           => 'Outil créateur',
  }

  { status: 'success', tool: 'exiftool', filename: filename, grouped: grouped, labels: labels, raw: meta }.to_json
end