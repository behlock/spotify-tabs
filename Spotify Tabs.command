#!/bin/zsh
cd -- "${0:A:h}"
export PATH="$HOME/.nix-profile/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
node scripts/launch.mjs
