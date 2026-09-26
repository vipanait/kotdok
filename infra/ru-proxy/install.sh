#!/usr/bin/env bash
# Sets up the proxy on a fresh Ubuntu machine. Expects lapka.conf in /tmp.
# Safe to run again: an existing certificate is left alone.
#
#   scp infra/ru-proxy/lapka.conf lapka@<IP>:/tmp/
#   ssh lapka@<IP> 'bash -s' < infra/ru-proxy/install.sh
set -euo pipefail

sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx certbot >/dev/null

sudo mkdir -p /etc/nginx/ssl /var/www/acme

# nginx will not start without a certificate, and the real one can only be
# issued once DNS points here. Until then a self-signed pair stands in.
if [ ! -e /etc/nginx/ssl/lapka.crt ]; then
  sudo openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
    -subj "/CN=lapka.my" -addext "subjectAltName=DNS:lapka.my,DNS:www.lapka.my" \
    -keyout /etc/nginx/ssl/lapka.key -out /etc/nginx/ssl/lapka.crt 2>/dev/null
fi

sudo mv /tmp/lapka.conf /etc/nginx/sites-available/lapka
sudo ln -sf /etc/nginx/sites-available/lapka /etc/nginx/sites-enabled/lapka
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t
sudo systemctl reload nginx
echo "installed"
