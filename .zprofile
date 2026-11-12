# Login shells: environment and PATH (runs after /etc/zprofile's path_helper).

eval "$(/opt/homebrew/bin/brew shellenv)"

export EDITOR=nvim
export BUN_INSTALL="$HOME/.bun"
export PNPM_HOME="$HOME/Library/pnpm"

typeset -U path   # no duplicate PATH entries
path=(
  $HOME/.local/bin
  $BUN_INSTALL/bin
  $PNPM_HOME/bin
  $HOME/bin/gyb
  $HOME/.rbenv/shims
  /opt/homebrew/opt/node/bin
  /Applications/Ghostty.app/Contents/MacOS
  $path
)

. "$HOME/.deno/env"
. "$HOME/.atuin/bin/env"
