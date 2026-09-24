#!/bin/sh
# Registers the AfterCall native host with Google Chrome, so summaries run through your Claude Code or Codex login.
# Usage: native/install.sh <extension-id>
# The side panel settings show this command with your extension ID filled in.
set -e

ID="$1"
case "$ID" in
  *[!a-p]*|'') echo "usage: $0 <extension-id>  (32 letters a-p, from chrome://extensions)"; exit 1 ;;
esac
[ ${#ID} -eq 32 ] || { echo "Extension ID must be 32 letters, got: $ID"; exit 1; }

NODE="$(command -v node)" || { echo "Node.js not found. Install Node 18 or newer, then run this again."; exit 1; }
DIR="$(cd "$(dirname "$0")" && pwd)"

# macOS blocks Chrome from reading ~/Documents, ~/Desktop and ~/Downloads, so the host runs from a copy outside them.
case "$(uname)" in
  Darwin) HOSTS="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"; APP="$HOME/Library/Application Support/AfterCall" ;;
  Linux) HOSTS="$HOME/.config/google-chrome/NativeMessagingHosts"; APP="$HOME/.local/share/aftercall" ;;
  *) echo "Only macOS and Linux are supported."; exit 1 ;;
esac
mkdir -p "$HOSTS" "$APP"
cp "$DIR/host.js" "$APP/host.js"

# Chrome starts the host with a bare PATH, so pin this shell's PATH: that is where node, claude and codex live.
cat > "$APP/run.sh" <<EOF
#!/bin/sh
export PATH='$PATH'
exec '$NODE' '$APP/host.js'
EOF
chmod +x "$APP/run.sh"

cat > "$HOSTS/com.aftercall.host.json" <<EOF
{
  "name": "com.aftercall.host",
  "description": "AfterCall summaries through Claude Code or Codex",
  "path": "$APP/run.sh",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$ID/"]
}
EOF

echo "Installed: $HOSTS/com.aftercall.host.json"
for cli in claude codex; do
  if command -v "$cli" >/dev/null; then echo "  found $cli: $(command -v "$cli")"; else echo "  $cli not found (install it to use it)"; fi
done
echo "Run this again after updating AfterCall, so the host copy stays current."
echo "Back in Chrome: open AfterCall settings and press \"Test connection\"."
