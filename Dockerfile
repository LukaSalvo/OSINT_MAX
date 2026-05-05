FROM ruby:3.2-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    whois \
    dnsutils \
    libimage-exiftool-perl \
    libssl-dev \
    && pip3 install --no-cache-dir sherlock-project holehe trio httpx --break-system-packages \
    && gem install sinatra rackup webrick \
    && apt-get purge -y --auto-remove \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN mkdir -p reports

EXPOSE 4567

CMD ["ruby", "server.rb"]
