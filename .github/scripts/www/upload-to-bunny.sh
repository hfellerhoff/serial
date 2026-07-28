#!/bin/bash

file="$1"
remote_path="${file#apps/www/dist/}"
encoded_path=$(python3 -c 'import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe="/"))' "$remote_path")
curl -s -X PUT \
  -H "AccessKey: $BUNNY_API_STORAGE" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@$file" \
  "https://$BUNNY_STORAGE_HOSTNAME/$BUNNY_STORAGE/$encoded_path" && echo "✓ $remote_path"
