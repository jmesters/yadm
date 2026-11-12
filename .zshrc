# Interactive shells.

# --- Oh My Zsh -------------------------------------------------------------
export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME=""                      # starship draws the prompt
zstyle ':omz:update' mode auto
SHOW_AWS_PROMPT=false             # keep the aws plugin out of the prompt

# Extra completions generated locally (deno…)
fpath=($HOME/.zfunc $fpath)

plugins=(
  git
  kubectl
  aws
  zsh-autopair
  zsh-autosuggestions
  zsh-syntax-highlighting         # must stay last
)

source $ZSH/oh-my-zsh.sh

# --- Tools -----------------------------------------------------------------
eval "$(zoxide init zsh)"
source <(fzf --zsh)
eval "$(atuin init zsh)"          # after fzf, so atuin owns Ctrl-R
eval "$(starship init zsh)"

# --- Aliases ---------------------------------------------------------------
alias cat='bat --theme="Solarized (light)"'
alias ls='eza --color=always --icons=always'
alias vim='nvim'
alias eks-customer='kubectl config use-context customer'
alias eks-jobs='kubectl config use-context jobs'

# --- Functions -------------------------------------------------------------
# yazi, and cd to the folder you quit in
y() {
  local tmp cwd
  tmp="$(mktemp -t yazi-cwd.XXXXXX)"
  command yazi "$@" --cwd-file="$tmp"
  cwd="$(<"$tmp")"
  if [[ -n "$cwd" && "$cwd" != "$PWD" && -d "$cwd" ]]; then
    builtin cd -- "$cwd"
  fi
  rm -f -- "$tmp"
}

# update brew and oh-my-zsh
update() {
  echo 'updating homebrew'
  brew update && brew upgrade && brew cleanup
  echo 'updating oh-my-zsh'
  omz update
}

# --- Greeting (real terminals only) ----------------------------------------
if [[ -t 1 ]]; then
  fastfetch -c ~/.config/fastfetch/startup-message.jsonc --logo ~/.config/fastfetch/gpc-logo2
fi

source ~/.safe-chain/scripts/init-posix.sh # Safe-chain Zsh initialization script
