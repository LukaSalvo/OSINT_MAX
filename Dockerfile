FROM ruby:3.2-slim-bookworm

# Combine all installations in one layer and cleanup
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    whois \
    libimage-exiftool-perl \
    && pip3 install --no-cache-dir sherlock-project holehe trio httpx --break-system-packages \
    && gem install sinatra rackup webrick \
    && apt-get purge -y --auto-remove \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

# Create reports directory and ensure permissions
RUN mkdir -p reports

EXPOSE 4567

CMD ["ruby", "server.rb"]
