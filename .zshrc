# Interactive shells. Works on macOS and Linux; anything not installed is skipped.
# On a new machine, `yadm bootstrap` installs what's below.

# --- Oh My Zsh -------------------------------------------------------------
export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME=""                      # starship draws the prompt
zstyle ':omz:update' mode auto
SHOW_AWS_PROMPT=false             # keep the aws plugin out of the prompt

# Extra completions generated locally (deno…)
fpath=($HOME/.zfunc $fpath)

plugins=(git kubectl aws)
# Third-party plugins, only once cloned into $ZSH/custom/plugins.
# zsh-syntax-highlighting must stay last.
for _p in zsh-autopair zsh-autosuggestions zsh-syntax-highlighting; do
  [[ -d $ZSH/custom/plugins/$_p ]] && plugins+=($_p)
done
unset _p

if [[ -f $ZSH/oh-my-zsh.sh ]]; then
  source $ZSH/oh-my-zsh.sh
else
  autoload -Uz compinit && compinit
fi

# --- Tools -----------------------------------------------------------------
(( $+commands[zoxide] ))   && eval "$(zoxide init zsh)"
(( $+commands[fzf] ))      && source <(fzf --zsh 2>/dev/null)   # needs fzf 0.48+
(( $+commands[atuin] ))    && eval "$(atuin init zsh)"          # after fzf, so atuin owns Ctrl-R
(( $+commands[starship] )) && eval "$(starship init zsh)"

# --- Aliases ---------------------------------------------------------------
if (( $+commands[bat] )); then
  alias cat='bat --theme="Solarized (light)"'
elif (( $+commands[batcat] )); then   # Debian/Ubuntu package name
  alias bat='batcat'
  alias cat='batcat --theme="Solarized (light)"'
fi
(( $+commands[eza] ))  && alias ls='eza --color=always --icons=always'
(( $+commands[nvim] )) && alias vim='nvim'
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

# update system packages, brew and oh-my-zsh
update() {
  if [[ $OSTYPE == linux* ]] && (( $+commands[apt-get] )); then
    echo 'updating apt packages'
    sudo apt-get update && sudo apt-get upgrade
  fi
  if (( $+commands[brew] )); then
    echo 'updating homebrew'
    brew update && brew upgrade && brew cleanup
  fi
  if (( $+functions[omz] )); then
    echo 'updating oh-my-zsh'
    omz update
  fi
}

# --- Greeting (real terminals only) ----------------------------------------
if [[ -t 1 ]] && (( $+commands[fastfetch] )) && [[ -f ~/.config/fastfetch/startup-message.jsonc ]]; then
  fastfetch -c ~/.config/fastfetch/startup-message.jsonc --logo ~/.config/fastfetch/gpc-logo2
fi

[[ -f ~/.safe-chain/scripts/init-posix.sh ]] && source ~/.safe-chain/scripts/init-posix.sh # Safe-chain Zsh initialization script
