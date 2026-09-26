#!/usr/bin/env bash
# Issues the Let's Encrypt certificate for lapka.my and www.lapka.my and
# puts it in place of the self-signed one. Run only after both DNS records
# point at this machine, otherwise the HTTP-01 check lands on Vercel.
#
#   ssh lapka@<IP> 'bash -s' < infra/ru-proxy/issue-cert.sh
#
# Renewal is certbot's own systemd timer; the deploy hook reloads nginx.
set -euo pipefail

sudo certbot certonly --non-interactive --agree-tos --register-unsafely-without-email \
  --webroot -w /var/www/acme -d lapka.my -d www.lapka.my \
  --deploy-hook "systemctl reload nginx"

sudo ln -sf /etc/letsencrypt/live/lapka.my/fullchain.pem /etc/nginx/ssl/lapka.crt
sudo ln -sf /etc/letsencrypt/live/lapka.my/privkey.pem /etc/nginx/ssl/lapka.key

sudo nginx -t
sudo systemctl reload nginx
sudo certbot certificates --cert-name lapka.my | grep -E "Domains|Expiry"
