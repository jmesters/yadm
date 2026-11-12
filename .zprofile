# Login shells: environment and PATH (on macOS, runs after /etc/zprofile's path_helper).
# Works on macOS and Linux; anything not installed is skipped.

# Homebrew: Apple Silicon, Intel macOS, or Linux
for _brew in /opt/homebrew/bin/brew /usr/local/bin/brew /home/linuxbrew/.linuxbrew/bin/brew; do
  if [[ -x $_brew ]]; then
    eval "$($_brew shellenv)"
    break
  fi
done
unset _brew

export EDITOR=nvim
export BUN_INSTALL="$HOME/.bun"
if [[ $OSTYPE == darwin* ]]; then
  export PNPM_HOME="$HOME/Library/pnpm"
else
  export PNPM_HOME="${XDG_DATA_HOME:-$HOME/.local/share}/pnpm"
fi

typeset -U path   # no duplicate PATH entries
_extra=(
  $HOME/.local/bin
  $BUN_INSTALL/bin
  $PNPM_HOME/bin
  $HOME/bin/gyb
  $HOME/.rbenv/shims
  /opt/homebrew/opt/node/bin
  /Applications/Ghostty.app/Contents/MacOS
)
path=($^_extra(N-/) $path)   # only the folders that exist on this machine
unset _extra

[[ -f $HOME/.deno/env ]] && . "$HOME/.deno/env"
[[ -f $HOME/.atuin/bin/env ]] && . "$HOME/.atuin/bin/env"
